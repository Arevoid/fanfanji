import type { Message, OfflineStory } from "../../../types";
import { resolveChatContextMemoryLimit, resolveChatLongTermMemoryLimit } from "../services/chatMemoryRetrievalSettings";

/** Mechanical extraction of the existing regeneration path; dependencies stay explicit in the page context. */
export function useChatRegenerationAction(context: Record<string, any>) {
  const {
    activeChatCharId, activeCharacter, onDeleteMessage, deleteMessageAndLinkedImage, currentChatMessages,
    activeRelationship, listCharacterEventsByRelation, buildRelationshipCognitiveProjection, buildCharacterCognitiveContext,
    createDirectChatKnowledgeBoundary, resolveChatRoutine, buildCharacterRoutine, resolveChatTurnSettings, setIsTyping,
    latestActiveCharacterRef, settings, serializeMessageContentForPrompt, shouldUseCrossDayHistoryBoundary,
    activeAttachModal, callingStatus, callTranscript, detectCallTopicShift, partitionDirectChatHistoryByCurrentDay,
    formatHistoricalMessageForPrompt, describeHistoricalRelativeTime, serializeMessageToPromptTurns, buildCrossDayHistoricalReferencePrompt, buildDirectChatMainPrompt,
    projectCharacterPrompt, MemoryService, memories, retrieveTruthForPrivatePrompt,
    loadKnowledgeClaims, loadConversationSummaries, loadBehaviorCorrections, formatMemoriesForPrompt, formatUserKnowledgeBoundary,
    formatTruthRetrievalForPrompt, getInterveningOfflineHandoff, selectFreshOfflineHandoffMemory,
    getPendingOfflineHandoff, buildPendingOfflineTimelineHandoff, isOfflineStoryHandoffMemory,
    buildOfflineTimelineHandoff, allMoments, activeIdentityId, getKnownMomentsContextString, relationships,
    getOfflineStoriesContextForOnlineChat, musicTracks, identityMusicStates, relationshipMusicStates,
    buildRelationMusicContext, loadForumShares, loadForumThreads, buildRelationForumContext, getConversationId,
    loadDiaryShares, buildRelationDiaryContext, loadUserMemoPromptContext, buildCharacterBehaviorPrompt,
    worldBookEntries, buildWorldBookSystemBlocks, LIVING_HUMAN_PROMPT, buildRedPacketReactionPrompt,
    NEW_DAY_CONVERSATION_BOUNDARY_PROMPT, buildTimeAwarenessPrompt, buildVoiceIntervalPrompt,
    formatStructuralWorldBookSection, buildVoiceCallPrompts, stickerGroups, isRedPacketMarkup,
    buildStickerResponsePrompt, WORLD_BOOK_CONTEXT_PRIORITY, finalizeCharacterChatSystemInstruction,
    formatFinalReplyLanguageInstruction, resolveCharacterReplyLanguage, getVisibleWorldBookEntries,
    formatCharacterKnowledgeBoundary, formatOnlineChatSpatialBoundary, CHARACTER_MEDIA_USAGE_RULES,
    DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES, DIRECT_CHAT_SINGLE_SPEAKER_RULE, CURRENT_SCENE_CONTINUITY_PROMPT,
    CHINESE_SEMANTIC_CONTINUITY_PROMPT, generateRegeneratedChatTurn, createId, onSendMessage, formatChatPromptContext, buildChatPromptContext,
    recordPendingOfflineHandoffDelivery,
  } = context;

  const handleRegenerateResponse = async (targetMsg: Message, oocComment: string) => {
    if (!activeChatCharId || !activeCharacter) return;

    // 1. Delete target message
    if (onDeleteMessage) deleteMessageAndLinkedImage(targetMsg.id);

    // 2. Find the chat history excluding the targetMsg
      const previousMessages = currentChatMessages.filter((m) => m.id !== targetMsg.id);
    // Find the last user message
      const lastUserMsg = [...previousMessages].reverse().find((m) => m.sender === "user");
      if (!lastUserMsg) return;
      const regenerationCognitiveContext = activeRelationship && !activeCharacter.isGroupChat
        ? (() => {
          try {
            const relationEvents = listCharacterEventsByRelation(activeRelationship.id);
            const relationshipProjection = buildRelationshipCognitiveProjection({
              relation: activeRelationship,
              events: relationEvents,
              now: Date.now(),
            });
            return buildCharacterCognitiveContext({
              character: activeCharacter,
              relation: activeRelationship,
              memories: [],
              events: relationEvents.map((event) => ({
                event,
                promptVisibility: event.status === "active"
                  && (event.kind === "relationship_created" || event.kind === "offline_story_completed")
                  ? "safe" as const
                  : "private" as const,
              })),
              timeContext: { now: Date.now() },
              knowledgeBoundary: createDirectChatKnowledgeBoundary(),
              conversationId: activeRelationship.conversationId,
              relationshipTimeline: relationshipProjection.timeline,
              routine: resolveChatRoutine(
                buildCharacterRoutine(activeCharacter.routine),
                resolveChatTurnSettings(activeCharacter).enableTimeAwareness,
              ),
            });
          } catch {
            return undefined;
          }
        })()
        : undefined;

    setIsTyping(true);
    let pendingOfflineHandoffForReply: OfflineStory | undefined;

    try {
      // Short-term real-time context limit: 10~300 messages, default 150.
      const limit = resolveChatContextMemoryLimit(activeCharacter.contextMemoryLimit);
      
      // Exclude lastUserMsg from the history parameter since it is sent as the main message parameter.
      const msgsForHistory = previousMessages.filter(m => m.id !== lastUserMsg.id);
      const turnSettings = resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter);
      const currentMessageContextText = serializeMessageContentForPrompt(lastUserMsg, {
        mode: "history",
        userName: settings.name,
        characterName: activeCharacter.name,
      });
      const latestHistoryMessage = msgsForHistory[msgsForHistory.length - 1];
      const isCrossDayNewSession = shouldUseCrossDayHistoryBoundary({
        enableTimeAwareness: turnSettings.enableTimeAwareness,
        currentMessageAt: lastUserMsg.timestamp,
        latestHistoryMessageAt: latestHistoryMessage?.timestamp,
      });
      const isConnectedVoiceCall = activeAttachModal === "calling" && callingStatus === "connected";
      const callTopicShiftDetected = detectCallTopicShift({
        isConnectedVoiceCall,
        userText: currentMessageContextText,
        callTranscript,
      });
      const shouldLoadLongTermMemory = !isConnectedVoiceCall || callTopicShiftDetected;

      // Map history with timestamps for time awareness
      const requestTime = new Date();
      const historyPartition = partitionDirectChatHistoryByCurrentDay({
        messages: msgsForHistory,
        currentMessageAt: lastUserMsg.timestamp,
        enableTimeAwareness: turnSettings.enableTimeAwareness,
      });
      const slicedMsgs = historyPartition.liveMessages.slice(-limit);
      const historicalReferenceLines = historyPartition.historicalMessages.map((message) => {
        const speaker = message.sender === "user" ? "用户" : activeCharacter.name;
        const content = serializeMessageContentForPrompt(message, {
          mode: "history",
          userName: settings.name,
          characterName: activeCharacter.name,
          includeCallTranscript: false,
        }).replace(/\s+/gu, " ").trim().slice(0, 240);
        return `- ${new Date(message.timestamp).toLocaleString("zh-CN", { hour12: false })}｜${speaker}：${content}`;
      });
      const crossDayHistoricalReference = buildCrossDayHistoricalReferencePrompt(historicalReferenceLines);
      const history = slicedMsgs.flatMap((m) => serializeMessageToPromptTurns(m, {
          userName: settings.name,
          characterName: activeCharacter.name,
        }).map((turn) => ({
          role: turn.role,
          text: turnSettings.enableTimeAwareness
            ? formatHistoricalMessageForPrompt(turn.text, turn.timestamp, requestTime)
            : turn.text,
        })));

      let timeLogString = "";
      if (turnSettings.enableTimeAwareness) {
        timeLogString = slicedMsgs.map((m) => {
          const timeStr = new Date(m.timestamp).toLocaleString("zh-CN", {
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          });
          const senderName = m.sender === "user" ? "用户" : activeCharacter.name;
          let snippet = serializeMessageContentForPrompt(m, {
            mode: "history",
            userName: settings.name,
            characterName: activeCharacter.name,
            includeCallTranscript: false,
          });
          if (snippet.length > 80) snippet = snippet.slice(0, 80) + "...";
          return `- ${senderName}: "${snippet}" (发送于: ${timeStr}${describeHistoricalRelativeTime(m.content, m.timestamp, requestTime)})`;
        }).join("\n");
      }

      const mainPromptText = buildDirectChatMainPrompt({
        characterName: activeCharacter.name,
        disableBracketActions: turnSettings.disableBracketActions,
        characterProfile: [activeCharacter.remark, activeCharacter.age, activeCharacter.gender, activeCharacter.personality, activeCharacter.backstory].filter(Boolean).join("；"),
      });

      const characterProjection = projectCharacterPrompt(activeCharacter, activeRelationship?.relationship);
      const characterDescriptionText = characterProjection.description.content;
      let characterContextText = `[🚨 记忆与上下文关联优先级规则]:
1. Truth Layer 中按关系投影的 confirmed/asserted 事实优先；未来计划、假设、争议和旧数据必须遵守各自标签，不能互相改写。
2. Conversation summary 是可重建的派生缓存，只能补充上下文，不能覆盖具体事实或制造来源中没有的细节。
3. 历史检索及短期上下文：需要长期连续性时优先使用同一关系的 Truth Layer 数据。`;
      if (crossDayHistoricalReference) characterContextText += `\n${crossDayHistoricalReference}`;

      // Add OOC comment correction as high priority instruction
      characterContextText += `\n\n[🚨 CRITICAL CORRECTION (OOC FEEDBACK)]:
Your previous response was marked as "OOC" (Out Of Character). 
Feedback from the user: "${oocComment}".
Please read the feedback carefully and rewrite your response to perfectly match your profile. Do NOT repeat the previous tone/behavior!`;

      // Recall memories
      const topK = resolveChatLongTermMemoryLimit(activeCharacter?.retrievalHistoryLimit);
      const relevantMemories = shouldLoadLongTermMemory
        ? MemoryService.retrieveRelevantMemories({ characterId: activeChatCharId || "", relationId: activeRelationship?.id, queryText: currentMessageContextText, existingMemories: memories || [], limit: topK, maxCharacters: 3600, excludeCanonicalMirrors: true, scenario: "chat" })
        : [];
      const truthRetrieval = activeRelationship
        ? retrieveTruthForPrivatePrompt({
          scope: {
            relationId: activeRelationship.id,
            characterId: activeRelationship.characterId,
            userIdentityId: activeRelationship.userIdentityId,
            conversationId: activeRelationship.conversationId,
          },
          queryText: currentMessageContextText,
          limit: topK,
          maxCharacters: 4800,
          claims: loadKnowledgeClaims().value,
          summaries: loadConversationSummaries().value,
          corrections: loadBehaviorCorrections().value,
        })
        : undefined;
      const shadowedLegacyMemoryIds = new Set(truthRetrieval?.shadowedLegacyMemoryIds || []);
      const visibleLegacyMemories = relevantMemories.filter((memory) =>
        !shadowedLegacyMemoryIds.has(memory.id) && !(memory.sourceKnowledgeClaimIds?.length),
      );
      if (visibleLegacyMemories.length > 0) {
        characterContextText += formatMemoriesForPrompt(visibleLegacyMemories, "\n- Reclaimed compatibility memories / 兼容旧记忆:\n");
      }
      if (truthRetrieval) {
        characterContextText += formatTruthRetrievalForPrompt(truthRetrieval);
      }

      const interveningOfflineHandoff = getInterveningOfflineHandoff(lastUserMsg.timestamp);
      const latestOfflineContinuationMemory = interveningOfflineHandoff?.memory || selectFreshOfflineHandoffMemory({
        memories: memories || [],
        relationId: activeRelationship?.id,
        queryText: currentMessageContextText,
      });
      pendingOfflineHandoffForReply = getPendingOfflineHandoff();
      if (pendingOfflineHandoffForReply) {
        const matchingSummary = latestOfflineContinuationMemory
          && isOfflineStoryHandoffMemory(latestOfflineContinuationMemory, pendingOfflineHandoffForReply)
          ? latestOfflineContinuationMemory
          : undefined;
        const pendingOfflineHistoryAnchor = buildPendingOfflineTimelineHandoff(
          pendingOfflineHandoffForReply,
          lastUserMsg.timestamp,
          matchingSummary,
        );
        characterContextText += pendingOfflineHistoryAnchor;
        history.push({ role: "user", text: pendingOfflineHistoryAnchor });
      } else if (latestOfflineContinuationMemory) {
        characterContextText += buildOfflineTimelineHandoff(latestOfflineContinuationMemory, lastUserMsg.timestamp);
      }

      const activeIdentity = settings.identities?.find((identity: { id: string }) => identity.id === activeIdentityId);
      const userProfileText = activeIdentity?.kind === "alias"
        ? `User Profile:
- This is a separate contact using an alias. Their real identity is unknown to you.
- The alias profile is private setup guidance, not a fact the character already knows. Do not address them by their alias name or reveal/guess their identity unless they explicitly disclose it in the conversation.`
        : `User Profile:
- Nickname: ${settings.name}
- Personality/Bio: ${settings.bio}`;
      const userKnowledgeBoundary = formatUserKnowledgeBoundary();
      const relationshipContext = characterProjection.relationship?.content || "";
      if (activeIdentity?.kind === "alias") {
        const primaryRelation = relationships?.find((relation: { userIdentityId: string; characterId: string }) =>
          relation.userIdentityId === "identity-1" && relation.characterId === activeCharacter.id,
        );
        if (primaryRelation) {
          const primaryMemories = MemoryService.retrieveRelevantMemories({
            characterId: activeCharacter.id,
            relationId: primaryRelation.id,
            queryText: currentMessageContextText,
            existingMemories: memories || [],
            limit: topK,
            maxCharacters: 3600,
            excludeCanonicalMirrors: true,
            scenario: "chat",
          });
          const legacyMemories = MemoryService.retrieveRelevantMemories({
            characterId: activeCharacter.id,
            queryText: currentMessageContextText,
            existingMemories: memories || [],
            limit: topK,
            maxCharacters: 3600,
            excludeCanonicalMirrors: true,
            scenario: "chat",
          });
          const eventMemories = [...primaryMemories, ...legacyMemories]
            .filter((memory, index, all) => all.findIndex((candidate) => candidate.id === memory.id) === index)
            .slice(0, topK)
            .map((memory) => `- ${memory.content}`)
            .join("\n");
          characterContextText += `\n[角色自身关于另一位联系人的既有记忆]\n这些是角色过去对主号联系人或相关事件的记忆，不是当前马甲的身份信息。当前说话者仍是陌生联系人；不得因为职业、措辞或事件相似就认定当前马甲是饭饭，也不得把主号聊天历史当作当前对话历史。只有当前联系人明确说“我就是饭饭”等内容时，才允许建立身份关联。\n${primaryRelation.compressedMemory?.trim() ? `关系记忆：${primaryRelation.compressedMemory.trim()}\n` : ""}${eventMemories || "暂无相关既有记忆"}`;
        }
      }

      const momentsContextRegen = getKnownMomentsContextString(allMoments, activeCharacter, activeIdentityId, settings.name);
      const offlineStoriesContextRegen = getOfflineStoriesContextForOnlineChat();
      const musicContext = activeRelationship
        ? buildRelationMusicContext({
          userText: currentMessageContextText,
          ownerIdentityId: activeRelationship.userIdentityId,
          relationId: activeRelationship.id,
          tracks: musicTracks,
          identityStates: identityMusicStates,
          relationshipStates: relationshipMusicStates,
        })
        : "";
      const forumContext = activeRelationship
        ? buildRelationForumContext({
          ownerIdentityId: activeRelationship.userIdentityId,
          relationId: activeRelationship.id,
          conversationId: activeRelationship.conversationId || getConversationId(activeRelationship.id),
          messages: previousMessages,
          shares: loadForumShares().value,
          threads: loadForumThreads().value,
        })
        : "";
      const diaryContext = activeRelationship
        ? buildRelationDiaryContext({
          ownerIdentityId: activeRelationship.userIdentityId,
          relationId: activeRelationship.id,
          conversationId: activeRelationship.conversationId || getConversationId(activeRelationship.id),
          messages: previousMessages,
          shares: loadDiaryShares().value,
          messageId: lastUserMsg.id,
        })
        : "";
      const userMemoContext = activeRelationship
        ? loadUserMemoPromptContext({
          scopeKey: activeRelationship.id,
          queryText: currentMessageContextText,
          hasUserMessage: Boolean(lastUserMsg),
          nowMs: requestTime.getTime(),
        }).text
        : "";

      // Context-aware trigger scanning: current message plus roughly ten recent messages.
      const scanContextParts = [
        currentMessageContextText,
        ...previousMessages.slice(-10).map(m => serializeMessageContentForPrompt(m, { mode: "history", userName: settings.name, characterName: activeCharacter.name }))
      ];
      const scanText = scanContextParts.filter(Boolean).join("\n");
      const characterBehaviorPrompt = buildCharacterBehaviorPrompt({
        character: activeCharacter,
        currentMessage: currentMessageContextText,
        recentContext: scanText,
      });

      // Use the unified World Book system blocks builder
      const wbBlocks = buildWorldBookSystemBlocks(worldBookEntries || [], activeChatCharId || "", scanText, {
        scenario: "chat",
        characterId: activeRelationship?.characterId || activeChatCharId || undefined,
        userIdentityId: activeRelationship?.userIdentityId || activeIdentityId,
        relationId: activeRelationship?.id,
      });

      // Assemble system instruction blocks
      let assembledInstructions: string[] = [];

      // 0. Base living human prompt
      assembledInstructions.push(LIVING_HUMAN_PROMPT);

      // 1. Main Prompt
      assembledInstructions.push(mainPromptText);
      if (musicContext) assembledInstructions.push(musicContext);
      if (forumContext) assembledInstructions.push(forumContext);
      if (diaryContext) assembledInstructions.push(diaryContext);
      if (userMemoContext) assembledInstructions.push(userMemoContext);

      if (isRedPacketMarkup(lastUserMsg.content)) {
        assembledInstructions.push(buildRedPacketReactionPrompt(lastUserMsg.content));
      }

      if (isCrossDayNewSession || historyPartition.hasCrossDayHistory) {
        assembledInstructions.push(NEW_DAY_CONVERSATION_BOUNDARY_PROMPT);
      }

      // 1.5 Time awareness prompt if enabled
      if (turnSettings.enableTimeAwareness) {
        assembledInstructions.push(buildTimeAwarenessPrompt(requestTime, timeLogString));
      }

      const voiceIntervalPrompt = buildVoiceIntervalPrompt({
        characterName: activeCharacter.name,
        currentMessage: lastUserMsg,
        recentMessages: slicedMsgs,
      });
      if (voiceIntervalPrompt) assembledInstructions.push(voiceIntervalPrompt);

      // 2. After Main Prompt entries
      const afterMainWorldBook = formatStructuralWorldBookSection(wbBlocks, "after_main_prompt");
      if (afterMainWorldBook) assembledInstructions.push(afterMainWorldBook);

      // 3. Before Character Definition entries
      const beforeCharacterWorldBook = formatStructuralWorldBookSection(wbBlocks, "before_char_def");
      if (beforeCharacterWorldBook) assembledInstructions.push(beforeCharacterWorldBook);

      // 4. Character definition and personality are independent, single-source blocks.
      assembledInstructions.push(characterDescriptionText);
      assembledInstructions.push(characterProjection.personality.content);
      if (relationshipContext) assembledInstructions.push(relationshipContext);
      if (characterBehaviorPrompt) assembledInstructions.push(characterBehaviorPrompt);
      if (characterContextText.trim()) assembledInstructions.push(characterContextText);

      if (regenerationCognitiveContext) {
        const cognitivePrompt = formatChatPromptContext(buildChatPromptContext(regenerationCognitiveContext, {
          maxFacts: 0,
          relevantMemoryIds: [],
          hasConfirmedClaim: Boolean(truthRetrieval?.projection.confirmedFacts.length),
          hasDerivedSummary: Boolean(truthRetrieval?.summaries.length),
        }));
        if (cognitivePrompt) assembledInstructions.push(cognitivePrompt);
      }

      // 5. After Character Definition entries
      const afterCharacterWorldBook = formatStructuralWorldBookSection(wbBlocks, "after_char_def");
      if (afterCharacterWorldBook) assembledInstructions.push(afterCharacterWorldBook);

      // 6. User Profile
      assembledInstructions.push(userProfileText);
      assembledInstructions.push(userKnowledgeBoundary);
      assembledInstructions.push(DIALOGUE_AUTHORSHIP_AND_ESCALATION_RULES);
      assembledInstructions.push(DIRECT_CHAT_SINGLE_SPEAKER_RULE);
      assembledInstructions.push(CURRENT_SCENE_CONTINUITY_PROMPT);
      assembledInstructions.push(CHINESE_SEMANTIC_CONTINUITY_PROMPT);

      // 7. Before Chat History entries
      const beforeHistoryWorldBook = formatStructuralWorldBookSection(wbBlocks, "before_chat_history");
      if (beforeHistoryWorldBook) assembledInstructions.push(beforeHistoryWorldBook);

      // 8. WeChat Moments Context memory
      if (momentsContextRegen && shouldLoadLongTermMemory) {
        assembledInstructions.push(momentsContextRegen);
      }

      // 8.5 Offline stories context memory
      if (offlineStoriesContextRegen && shouldLoadLongTermMemory) {
        assembledInstructions.push(offlineStoriesContextRegen);
      }

      assembledInstructions.push(formatCharacterKnowledgeBoundary({ currentCharacterId: activeCharacter.id }));
      assembledInstructions.push(formatOnlineChatSpatialBoundary());
      assembledInstructions.push(CHARACTER_MEDIA_USAGE_RULES);

      // 8.8 Custom Sticker Pack availability for Character response (对方使用我的表情包)
      const allStickers2 = stickerGroups.flatMap(g => g.stickers);
      if (activeAttachModal === "calling") {
        assembledInstructions.push(...buildVoiceCallPrompts(callTopicShiftDetected));
      } else if (allStickers2.length > 0) {
        const userSentSticker = /^\[表情\]\|/.test(lastUserMsg.content);
        const stickerListStr = allStickers2.map((sticker) =>
          `- ${sticker.name}｜语义：${sticker.semanticDescription || `按名称“${sticker.name}”谨慎理解`}｜发送格式：[表情]|${sticker.name}|sticker://${sticker.id}`
        ).join("\n");
        assembledInstructions.push(buildStickerResponsePrompt(stickerListStr, userSentSticker));
      }

      if (wbBlocks.allTriggered.length > 0) assembledInstructions.push(WORLD_BOOK_CONTEXT_PRIORITY);
      const systemInstruction = finalizeCharacterChatSystemInstruction({
        instructions: assembledInstructions,
        characterProjection,
        characterDescriptionText,
        diagnosticLabel: "regenerate prompt",
        finalPersonaRules: wbBlocks.allTriggered
          .filter((entry) => entry.purpose === "persona_rule")
          .map((entry) => `【${entry.title}】\n${entry.content}`),
        finalLanguageInstruction: formatFinalReplyLanguageInstruction(resolveCharacterReplyLanguage(
          activeCharacter,
          getVisibleWorldBookEntries(worldBookEntries || [], activeChatCharId || "", {
            scenario: "chat",
            characterId: activeRelationship?.characterId || activeChatCharId || undefined,
            userIdentityId: activeRelationship?.userIdentityId || activeIdentityId,
            relationId: activeRelationship?.id,
          }).map((entry) => `${entry.title}\n${entry.content}`),
        )),
      });

      const keepPeriods = /(严谨|严肃|正式|书面|习惯句号|用句号|使用标点|使用句号)/i.test((activeCharacter?.personality || "") + (activeCharacter?.backstory || ""));
      const promptMessage = serializeMessageContentForPrompt(lastUserMsg, {
        mode: "current",
        userName: settings.name,
        characterName: activeCharacter.name,
      });
      const { data, candidates: replyCandidates } = await generateRegeneratedChatTurn({
        prompt: { scenario: "regenerate", message: promptMessage, history, systemInstruction, historyInjections: wbBlocks.at_depth },
        settings,
        candidateContext: {
          disableBracketActions: turnSettings.disableBracketActions,
          keepPeriods,
          characterId: activeChatCharId,
          characterName: activeCharacter?.name,
          userName: settings.name,
          allowEmoji: false,
          createId: () => createId("regen"),
          currentTime: (idx) => Date.now() + idx,
        },
      });

      if (data && data.text && replyCandidates) {
        replyCandidates.messages.forEach(onSendMessage);
        if (replyCandidates.messages.length > 0) {
          recordPendingOfflineHandoffDelivery(pendingOfflineHandoffForReply);
        }
      }
    } catch (err: any) {
      console.error("Regeneration error:", err);
    } finally {
      setIsTyping(false);
    }
  };



  return { handleRegenerateResponse };
}
