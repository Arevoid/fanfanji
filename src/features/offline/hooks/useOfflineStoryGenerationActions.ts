import type { Character, MemoryItem, Message, OfflineStory, UserSettings, WorldBookEntry } from "../../../types";
import type { Dispatch, SetStateAction } from "react";
import { apiChat } from "../../../utils/apiHelper";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { MemoryService } from "../../../domain/memory/MemoryService";
import { getLatestWorldBookEntries } from "../../../utils/worldBook";
import { serializeMessageContentForPrompt, serializeMessageToPromptTurns } from "../../chat/prompts/messagePromptSerializer";
import { resolveCanonicalCharacterId, resolveOfflineStoryCharacterIds } from "../../../domain/character/characterIdentity";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { collectOfflineWorldBookContext, formatOfflineWorldBookEntries } from "../prompts/offlineWorldBookContext";
import { applyOfflineStoryRegeneration, prepareOfflineStoryRegeneration } from "../../../domain/offlineStory/offlineStoryRegeneration";
import { PromptComposer } from "../../../domain/prompt/PromptComposer";
import { buildOfflineIdentityBinding, removeSingleActorSelfVocative } from "../../../domain/prompt/offlineIdentityBinding";
import { buildOfflineHandoffFacts, formatOfflineHandoffFactsForPrompt } from "../../../domain/offlineStory/offlineHandoffContext";
import { createId } from "../../../core/id/createId";
import { isWorldBookEntryForAnyCharacter } from "../../../domain/worldbook/worldBookVisibility";

interface UseOfflineStoryGenerationActionsOptions {
  activeStory: OfflineStory | null;
  activeStoryRef: { current: OfflineStory | null };
  characters: readonly Character[];
  selectableCharacters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  memories: readonly MemoryItem[];
  settings: UserSettings;
  worldBookEntries: WorldBookEntry[];
  selectedChar: Character;
  inputText: string;
  isGenerating: boolean;
  setInputText: Dispatch<SetStateAction<string>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setErrorMsg: Dispatch<SetStateAction<string>>;
  resolveCharacterId: (characterId: string) => string;
  saveActiveStorySnapshot: (story: OfflineStory) => void;
  showToast: (message: string) => void;
  guidanceDraft: { oneTime: string; ongoing: string };
  setGuidanceDraft: Dispatch<SetStateAction<{ oneTime: string; ongoing: string }>>;
}

export function useOfflineStoryGenerationActions({
  activeStory,
  activeStoryRef,
  characters,
  selectableCharacters,
  relationships,
  memories,
  settings,
  worldBookEntries,
  selectedChar,
  inputText,
  isGenerating,
  setInputText,
  setIsGenerating,
  setErrorMsg,
  resolveCharacterId,
  saveActiveStorySnapshot,
  showToast,
  setGuidanceDraft,
}: UseOfflineStoryGenerationActionsOptions) {
  const handleSendMessage = async (
    textToSend?: string,
    forceAIOnly = false,
    options: { regenerateMessageId?: string } = {},
  ) => {
    const storyAtSend = activeStoryRef.current ?? activeStory;
    if (!storyAtSend || isGenerating) return;
    setErrorMsg("");

    const regeneration = prepareOfflineStoryRegeneration(storyAtSend.messages, options.regenerateMessageId);
    const regenerateTarget = regeneration?.target;
    const generationMessages = regeneration?.history || storyAtSend.messages;

    const text = textToSend !== undefined ? textToSend : inputText.trim();
    if (!text && !forceAIOnly) return;

    const storyParticipantIds = new Set(resolveOfflineStoryCharacterIds(storyAtSend, characters));
    let updatedStory = storyAtSend.worldBookSnapshot
      ? { ...storyAtSend, messages: generationMessages }
      : {
        ...storyAtSend,
        messages: generationMessages,
        // One-time compatibility migration for stories created before
        // structured snapshots existed. The captured data is then frozen.
        worldBookSnapshot: getLatestWorldBookEntries(worldBookEntries || [])
          .filter((entry) => isWorldBookEntryForAnyCharacter(entry, storyParticipantIds)),
      };
    if (!updatedStory.knowledgeSnapshot && updatedStory.relationId) {
      const relation = relationships.find((item) => item.id === updatedStory.relationId);
      updatedStory.knowledgeSnapshot = relation ? Array.from(new Set([
        ...loadKnowledgeClaims().value
          .filter((claim) => claim.relationId === relation.id
            && claim.characterId === relation.characterId
            && claim.userIdentityId === relation.userIdentityId
            && claim.status === "active"
            && (claim.truthStatus === "confirmed" || claim.truthStatus === "asserted"))
          .map((claim) => claim.statement),
        ...memories
          .filter((memory) => memory.relationId === relation.id && memory.isManual === true)
          .map((memory) => memory.content),
      ])) : [];
    }
    
    // 1. If we have user text to add
    if (text && !forceAIOnly) {
      const userMsg: Message = {
      id: createId("offline-msg"),
        characterId: storyAtSend.characterId,
        relationId: storyAtSend.relationId,
        conversationId: storyAtSend.conversationId,
        sender: "user",
        content: text,
        timestamp: Date.now(),
        isOffline: true,
        isNarration: false
      };
      updatedStory = {
        ...updatedStory,
        messages: [...updatedStory.messages, userMsg],
        archivedAt: undefined,
        memorySyncStatus: "pending",
        updatedAt: Date.now()
      };
      saveActiveStorySnapshot(updatedStory);
      setInputText("");
    }

    setIsGenerating(true);

    try {
      // Assemble history context
      // If we added a user message in this turn, exclude it from historyContext because it will be passed as the separate 'message' parameter.
      const msgsForHistory = (text && !forceAIOnly && updatedStory.messages.length > 0 && updatedStory.messages[updatedStory.messages.length - 1].sender === "user")
        ? updatedStory.messages.slice(0, -1)
        : updatedStory.messages;

      const historyContext = msgsForHistory.flatMap((message) => serializeMessageToPromptTurns(message, {
        mode: "history",
        userName: settings.name,
        characterName: selectedChar.name,
      }).map((turn) => ({
        role: turn.role,
        text: message.isNarration ? `(客观旁白) ${turn.text}` : turn.role === "user" ? `我: “${turn.text}”` : turn.text,
      })));

      // We can collect worldbook blocks for all story characters
      const storyCharsList = updatedStory.characterIds && updatedStory.characterIds.length > 0 
        ? selectableCharacters.filter(c => resolveOfflineStoryCharacterIds(updatedStory, characters).includes(c.id))
        : [selectedChar];
      const sourceChat = characters.find(c => c.id === (updatedStory.sourceChatId ? resolveCharacterId(updatedStory.sourceChatId) : undefined));
      const isImportedGroupStory = Boolean(sourceChat?.isGroupChat);

      const worldBookScanText = [
        text || "",
        ...updatedStory.messages.slice(-10).map((message) => serializeMessageContentForPrompt(message, {
          mode: "history",
          userName: settings.name,
          characterName: selectedChar.name,
        })),
      ].filter(Boolean).join("\n");
      const scopedRelationship = updatedStory.relationId
        ? relationships.find((relation) => relation.id === updatedStory.relationId)
        : undefined;
      const snapshotEntries = updatedStory.worldBookSnapshot || [];
      const { triggeredEntries: triggeredWorldBook, depthInjections: atDepthWorldBook } = collectOfflineWorldBookContext({ entries: snapshotEntries, characters: storyCharsList, scanText: worldBookScanText, relationship: scopedRelationship });
      // Legacy stories stored flattened strings without trigger metadata. Use
      // only entries whose title/content overlaps this turn instead of loading
      // the entire frozen book on every request.
      if (triggeredWorldBook.size === 0 && snapshotEntries.length === 0) {
        const normalizedScan = worldBookScanText.toLocaleLowerCase();
        (updatedStory.importedContext?.worldBook || []).forEach((item, index) => {
          const title = item.split(":", 1)[0]?.trim() || "";
          if (title && normalizedScan.includes(title.toLocaleLowerCase())) {
            triggeredWorldBook.set(`legacy-${index}`, {
              id: `legacy-${updatedStory.id}-${index}`,
              title,
              content: item.slice(title.length + 1).trim(),
              category: "legacy-snapshot",
              characterId: "global",
              triggerType: "keys",
              isActive: true,
              timestamp: updatedStory.importedContext?.importedAt || updatedStory.createdAt,
            });
          }
        });
      }
      const wbPrompts = formatOfflineWorldBookEntries(triggeredWorldBook.values());

      // Base Persona
      let sysPrompt = `你现在正在与用户进行“线下故事/小说剧本”的联合创作。本场剧本中共有以下 ${storyCharsList.length} 位角色参与：\n\n`;
      
      // Character-level compressed memory is private to a direct relation. Do
      // not fall back to it for relationless/group stories.
      storyCharsList
        .map((char) => ({
          ...char,
          // The prompt reads the explicit relation summary below; never carry
          // the character-level legacy summary into this projection.
          compressedMemory: undefined,
        }))
        .forEach((char, idx) => {
        sysPrompt += `[角色 ${idx + 1}: ${char.name}]
- 姓名：${char.name}
- 年龄：${char.age || "未知"}
- 语气/性格特点：${char.personality}
- 背景设定：${char.backstory}
- 当前关系摘要：${(updatedStory.relationId ? relationships.find((relation) => relation.id === updatedStory.relationId)?.compressedMemory : char.compressedMemory) || "暂无"}
\n`;
        });

      sysPrompt += `\n${buildOfflineIdentityBinding({
        characterNames: storyCharsList.flatMap((character) => [character.name, character.remark || ""]),
        userName: settings.name,
      })}\n`;

      if (isImportedGroupStory) {
        sysPrompt += `\n【群聊关系事实：绝对不可改写】
这是从群聊导入的续写。以上每位角色档案中的身份、与用户的关系、以及角色彼此的关系，均为已确定的事实，必须逐字按其含义延续。
严禁因为多人同场，就把用户擅自写成任一角色的恋人、前任、暧昧对象、家属或专属伴侣；除非对应角色档案已明确这样设定。
用户可能只是朋友、旁观者或 CP 粉。必须保持这种定位，并保持角色之间原有的情侣或其他既定关系，不能自行替换、转移或制造新的恋爱关系。\n`;
      }

      if (wbPrompts) {
        sysPrompt += `\n【本轮命中的世界书背景设定】：
${wbPrompts}\n`;
      }

      sysPrompt += `\n【线下内容遵循顺序】
1. 主体/客体身份与已确认的人物关系是不可改写的事实边界。
2. 每个角色的完整人设决定其称呼、语气、主动性、情感与行为方式；不得混淆多位角色的口癖、语气或人物关系。
3. 用户最新输入和最近剧情决定本轮实际发生什么，并保持当前场景连续。
4. 本轮命中的世界书补充背景、稳定口癖和世界规则，但不得覆盖前述身份、关系或当前场景。
5. 写作风格预设只控制文风和输出形式，不改变角色事实与关系。

【人称写作视角限制】
- 对方人物视角（${storyCharsList.map(c => c.name).join("/")}）：【${(activeStory.partnerPerspective || "third") === "first" ? "第一人称" : (activeStory.partnerPerspective || "third") === "second" ? "第二人称" : "第三人称"}】。`;
      if ((activeStory.partnerPerspective || "third") === "first") {
        sysPrompt += `你在描写或代替该人物进行心理解说、旁白叙述或发言时，应当站在该角色自身视角，采用第一人称“我”或契合其身份的自称（如“本座”、“本王”、“人家”等）。`;
      } else if ((activeStory.partnerPerspective || "third") === "second") {
        sysPrompt += `你在叙事中指向对方自身时采用第二人称“你”（极罕见）。`;
      } else {
        sysPrompt += `你在叙事和描述中，应当采用客观的第三人称（如“他”、“她”、“${storyCharsList[0]?.name || "对方"}”）来描述该角色的言行、神态和内心戏。`;
      }
      if (updatedStory.allowCharacterToSpeakForUser === false) {
        sysPrompt += `\n\n【用户角色控制权】
用户只由用户本人控制。你只能续写对方角色、环境和已经明确发生的事情：
- 禁止替用户生成任何台词、引号内发言、内心独白或口头回应；
- 禁止替用户决定接受、拒绝、承诺、提问、主动触碰或采取新的有意动作；
- 可以承接用户在最新输入中已经明确写出的动作，但不能擅自补充下一步反应；
- 需要用户回应时，停在对方角色的动作或话语之后，把决定权留给用户。
即使为了叙事流畅，也不得越过此规则。`;
      } else {
        sysPrompt += `\n- 用户（我）的视角：【${(activeStory.userPerspective || "first") === "first" ? "第一人称 (我)" : (activeStory.userPerspective || "first") === "second" ? "第二人称 (你)" : "第三人称 (他/她/具体名字)"}】。`;
        if ((activeStory.userPerspective || "first") === "first") {
          sysPrompt += `你在叙事中描写用户、机主或提及我时，必须使用第一人称“我”指代用户（例如：“你深深凝视着我，缓步走来”）。`;
        } else if ((activeStory.userPerspective || "first") === "second") {
          sysPrompt += `你在叙事中描写用户、机主或提及我时，必须使用第二人称“你”指代用户（例如：“他走到你面前，拉起你的手”）。`;
        } else {
          sysPrompt += `你在叙事中描写用户、机主或提及我时，必须使用第三人称“他/她/具体名字 ${settings.name || "主角"}”来指代用户（例如：“他向 ${settings.name || "主角"} 微微颔首”）。`;
        }
      }

      if (activeStory.wordLimit && activeStory.wordLimit > 0) {
        sysPrompt += `\n\n🚨 【重要字数限制提示】：你的本次续写回复总字数（包括对话与旁白叙事）必须严格限制在 【${activeStory.wordLimit}】 字以内，请尽量精炼、点到即止，切勿啰嗦冗长！`;
      }

      if (activeStory.stylePromptContent) {
        sysPrompt += `\n\n✨ 【写作风格/笔触规范 (当前预设: ${activeStory.stylePromptName || "自定义"})】：\n${activeStory.stylePromptContent}\n请在生成本次续写内容时，全程严格执行并契合上述写作风格规范。`;
      }

      sysPrompt += `\n\n【线下模式及多角色控制规则】
1. 用户可以通过文字、指令或旁白，像导播、写小说或主控一样描述故事进展。
2. 作为一个优秀的内容创作者，你要输出一整段精美的、小说叙事般的回复，${updatedStory.allowCharacterToSpeakForUser === false ? "只描写对方角色、环境及用户已经明确完成的动作，并把下一步回应留给用户。" : "内容包括指定人称视角的场景描写、客观动作、旁白叙事，以及这些角色与用户的对话。"}
3. 任何发言对话请使用中文引号 “ ” (例如 “你醒了？”) 或 「 」 括起来，以便阅读。任何非发言部分（动作描述、神态、场景描写、内心想法、旁白等）放在引号外面。
4. 确保在对话中，通过在引号前或文中清晰提及名字（例如：A冷笑了一声：“...” / B有些局促地拍了拍衣角：“...”）来指明是谁在说话，使读者能一眼分辨。
5. 必须保持极高的人设契合度、动作细节 and 情感氛围描写。不要说任何破戏（OOC）的话，不要说你是AI。
6. 如果用户给出了导演指令（如：[控制剧情：我们遇到了敌人]），请积极顺应，发挥你强大的故事延展能力，精美自然地推进剧情。

【当前创作模式】：`;

      const storyClock = new Date(updatedStory.messages[updatedStory.messages.length - 1]?.timestamp || Date.now()).toLocaleString("zh-CN", {
        year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
      });
      sysPrompt += `\n\n【场景状态栏协议｜必须执行】
本次回复必须先输出一个独立状态栏，再输出剧情正文。状态栏不是正文，必须使用以下标记包裹：
[状态栏]
📆 ${storyClock}  ☁️ 温度℃
📍 当前主要地点（不超过20字）
📽️ 第一视角·角色名
[/状态栏]
规则：日期、星期和时间以当前线下故事时间为准；天气使用一个 emoji，温度使用摄氏度；地点只能依据当前剧情和已知事实；多人场景可额外添加“👥 同场人物：……”。状态栏只写状态信息，不写心理、动作或剧情正文。除状态栏外不要输出 Markdown、<details> 或解释文字。`;

      if (updatedStory.mode === "director") {
        sysPrompt += `\n【导演模式】：用户是编剧/导演，给你发出控制剧本走向的指令。你要自行把控边界，像写小说一样输出完整文段。${updatedStory.allowCharacterToSpeakForUser === false ? "只续写对方角色，不替用户补写台词、决定或新动作。" : "可以包含角色和用户的完整对话、动作与旁白。"}`;
      } else if (updatedStory.mode === "if") {
        sysPrompt += `\n【IF平行假想线】：当前故事处于一个脱离原作正统时间线的平行宇宙中！
假想线宇宙设定：${updatedStory.ifPrompt || "自定义世界观设定"}
在此假想规则下，让人物发挥其性格，在此全新背景中与用户互动。`;
      } else {
        sysPrompt += `\n【续写模式】：以现有的聊天/故事为草稿，根据设定和目前的逻辑走向，续写故事的精彩发展。`;
      }

      const ongoingGuidance = updatedStory.ongoingGuidance?.trim();
      const oneTimeGuidance = updatedStory.oneTimeGuidance?.trim();
      // Only an explicitly imported online story may use its frozen snapshot.
      // Self-directed and IF stories stay fully isolated from the online vault.
      const allMemoriesParts: string[] = [];
      const memberKnowledgeSnapshots = updatedStory.importedContext?.memberMemories;
      storyCharsList.forEach(char => {
        // New group stories use per-member snapshots. Legacy group stories
        // with one flattened list omit it instead of leaking it to all.
        const knowledgeSnapshot = memberKnowledgeSnapshots?.[char.id]
          || (!isImportedGroupStory ? (updatedStory.knowledgeSnapshot || updatedStory.importedContext?.memories || []) : []);
        if (knowledgeSnapshot.length === 0) return;
        const snapshotMemories = knowledgeSnapshot.map((content, index) => ({
          id: `snapshot-memory-${char.id}-${index}`,
          characterId: char.id,
          content,
          timestamp: updatedStory.importedContext?.importedAt || updatedStory.createdAt,
          importance: 5
        }));
        const relevantMems = MemoryService.retrieveRelevantMemories({
          characterId: char.id,
          queryText: text || "续写故事",
          existingMemories: snapshotMemories,
          limit: 3,
          scenario: "offline",
        });
        if (relevantMems.length > 0) {
          const lines = relevantMems.map(m => `  - ${m.content}`).join("\n");
          allMemoriesParts.push(`* 【${char.remark || char.name}】的线上记忆库事实：\n${lines}`);
        }
      });
      if (allMemoriesParts.length > 0) {
        if (isImportedGroupStory) {
          sysPrompt += `\n\n【多人记忆访问边界】下方每个以角色姓名标记的线上记忆区只属于该角色自身。其他角色不能知道、引用或回应其中的私聊事实；只有导入的公开群消息或本线下故事中明确公开发生的内容才可成为所有在场角色的共同认知。`;
        }
        sysPrompt += `\n\n【互通的线上记忆库】：以下是各个参与角色的线上对话中发生并提取的核心事实，请将其有机融入作为故事的背景事实支撑：\n${allMemoriesParts.join("\n")}`;
      }

      // Never fetch live online chat while writing offline. Use the import
      // snapshot only. Structured handoff facts are durable and are always
      // placed before the conversational tail so older commitments survive
      // later continuation turns.
      const handoffFacts = updatedStory.importedContext?.handoffFacts?.length
        ? updatedStory.importedContext.handoffFacts
        : buildOfflineHandoffFacts(updatedStory.importedContext?.messages || []);
      const handoffFactsPrompt = formatOfflineHandoffFactsForPrompt(handoffFacts);
      if (handoffFactsPrompt) {
        sysPrompt += `\n\n${handoffFactsPrompt}`;
      }
      const importedOnlineMessages = updatedStory.importedContext?.messages.slice(-40) || [];
      if (importedOnlineMessages.length > 0) {
        const lines = importedOnlineMessages.map((message) => {
          const senderCharacter = storyCharsList.find((character) =>
            character.id === message.senderId || character.id === message.characterId);
          const senderName = message.sender === "user" ? settings.name : (senderCharacter?.remark || senderCharacter?.name || selectedChar?.name || "Character");
          return `- ${senderName}: ${serializeMessageContentForPrompt(message, { mode: "history", userName: settings.name, characterName: senderName })}`;
        }).join("\n");
        sysPrompt += `\n\n【互通的线上最新对话记忆（Online Chat Context）】：
以下是各位参与角色最近在微信（线上聊天）中的最新真实对话。这些是你们当下关系的最新现状与真实记忆。请确保线下小说剧本的走向与其认知保持连贯和融合，避免发生剧情上的冲突：
${lines}`;
      }

      const lastUserMsgText = text || (regenerateTarget
        ? "请基于此前剧情重新生成这一段，不要复述被替换的内容。"
        : "请继续编织并续写这幕场景。");

      const importedTail = updatedStory.importedContext?.messages.slice(-6) || [];
      if (updatedStory.importedContext && importedTail.length > 0) {
        const lastImported = importedTail[importedTail.length - 1];
        const handoffTime = new Date(lastImported.timestamp);
        const handoffClock = handoffTime.toLocaleString("zh-CN", {
          year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
        });
        sysPrompt += `\n\n【ONLINE-TO-OFFLINE CONTINUITY】
This scene begins immediately after the imported online conversation, not as a new unrelated scene.
The last imported message is the current canonical handoff. Continue its topic, location, activity, promises, and emotional momentum. Do not replace it with a new activity (for example, do not switch from eating to bathing) unless the user explicitly asks for a time jump or transition.
Story-time starting point: ${handoffClock}. Advance from this point only through events and elapsed time established inside the story. The app's current real-world clock does not replace this story timeline.`;
      }

      if (updatedStory.enableTimeAwareness && !updatedStory.importedContext) {
        const now = new Date();
        const currentClock = now.toLocaleString("zh-CN", {
          year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
        });
        sysPrompt += `\n\n【TIME AWARENESS — REQUIRED】
This non-imported story starts at the current real-world time: ${currentClock}. Treat it as the story's initial clock, then advance time only through the events and elapsed time established inside this story.`;
      }

      if (ongoingGuidance || oneTimeGuidance) {
        sysPrompt += `\n\n【场外指导｜最终执行指令】
这是用户对后续剧情的创作指导，不是已经发生的剧情事实。它的优先级高于普通的自由发挥，但不能违反用户最新明确输入、已发生剧情事实、人物身份关系或用户角色控制权。
必须把指导转化为本次回复中真实发生的具体剧情变化，不要只在旁白中提到“收到指导”，也不要解释指导规则，更不要原样复述指导文本。`;
        if (ongoingGuidance) {
          sysPrompt += `\n【长期指导｜持续参考】${ongoingGuidance}\n只要不与更高优先级事实冲突，之后每次生成都要继续遵守。`;
        }
        if (oneTimeGuidance) {
          sysPrompt += `\n【本次指导｜本次回复必须落实】${oneTimeGuidance}
本次回复必须让这条指导在剧情中产生可观察的结果；如果指导是“希望发生某事”，就让该事件在本次回复中发生；如果指导是“保持某种风格/限制”，就让整段回复遵守它。不要把它当成供参考的建议。`;
        }
      }

      const composedPrompt = PromptComposer.compose({
        scenario: "offline-story",
        message: lastUserMsgText,
        history: historyContext,
        systemInstruction: sysPrompt,
        historyInjections: [...atDepthWorldBook.values()],
      });
      const response = await apiChat({
        ...composedPrompt,
        apiKey: settings.apiKey,
        model: settings.selectedModel || "gemini-3.5-flash",
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: settings.apiTemperature || 0.8,
        streamCompatible: settings.streamCompatible
      });

      if (response && response.text) {
        const singleActorNames = storyCharsList.length === 1
          ? Array.from(new Set([storyCharsList[0].name, storyCharsList[0].remark].filter((name): name is string => Boolean(name))))
          : [];
        const responseText = singleActorNames.reduce(
          (text, characterName) => removeSingleActorSelfVocative(text, characterName),
          response.text,
        );
        // A single generation is one editable script entry. Preserve its paragraphs
        // inside the entry instead of turning every paragraph into a separate message.
        const newMsgs: Message[] = [{
      id: createId("offline-reply"),
          characterId: updatedStory.characterId,
          relationId: updatedStory.relationId,
          conversationId: updatedStory.conversationId,
          sender: "character",
          content: responseText.trim(),
          timestamp: regenerateTarget?.timestamp || Date.now(),
          isOffline: true,
          isNarration: false
        }];

        const finalStory = {
          ...updatedStory,
          messages: regeneration
            ? applyOfflineStoryRegeneration(regeneration, newMsgs[0])
            : [...updatedStory.messages, ...newMsgs],
          archivedAt: undefined,
          memorySyncStatus: "pending" as const,
          updatedAt: Date.now(),
          oneTimeGuidance: undefined,
        };

        saveActiveStorySnapshot(finalStory);
        if (oneTimeGuidance) {
          setGuidanceDraft((current) => ({ ...current, oneTime: "" }));
        }
        if (regenerateTarget) showToast("当前剧情已重新生成");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("呼叫主脑剧本引擎失败，请检查网络或API Key设定。");
    } finally {
      setIsGenerating(false);
    }
  };


  return { handleSendMessage };
}
