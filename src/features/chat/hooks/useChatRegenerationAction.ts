import type { Message, OfflineStory } from "../../../types";
import { resolveChatContextMemoryLimit, resolveChatLongTermMemoryLimit } from "../services/chatMemoryRetrievalSettings";
import { buildAliasIdentityBoundaryPrompt, buildAliasIdentityFinalGuardPrompt } from "../../../domain/prompt/aliasIdentityBoundary";
import { resolveRecentUserImageForTurn } from "../services/recentUserImageContext";
import { resolveRegenerationTurnScope } from "../services/regenerationTurnScope";

/** Mechanical extraction of the existing regeneration path; dependencies stay explicit in the page context. */
export function useChatRegenerationAction(context: Record<string, any>) {
  const {
    activeChatCharId, activeCharacter, onDeleteMessage, deleteMessageAndLinkedImage, currentChatMessages,
    activeRelationship, listCharacterEventsByRelation, buildRelationshipCognitiveProjection, buildCharacterCognitiveContext,
    createDirectChatKnowledgeBoundary, resolveChatRoutine, buildCharacterRoutine, resolveChatTurnSettings, setIsTyping,
    latestActiveCharacterRef, settings, serializeMessageContentForPrompt,
    activeAttachModal, callingStatus, callTranscript, detectCallTopicShift,
    buildDirectChatMainPrompt,
    buildDirectChatContextSnapshot,
    buildDirectChatSystemInstruction,
    projectCharacterPrompt, memories, contributeDirectReplyTruthContext,
    loadKnowledgeClaims, loadConversationSummaries, loadBehaviorCorrections, formatUserKnowledgeBoundary,
    formatTruthRetrievalForPrompt, getInterveningOfflineHandoff, selectFreshOfflineHandoffMemory,
    getPendingOfflineHandoff, buildPendingOfflineTimelineHandoff, isOfflineStoryHandoffMemory,
    buildOfflineTimelineHandoff, allMoments, activeIdentityId, getKnownMomentsContextString, relationships,
    getRootIdentityId,
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

    // 2. Scope regeneration to the selected reply's own turn. Later user
    // messages belong to a different turn and must not become the prompt for
    // an older regenerated reply.
    const regenerationTurn = resolveRegenerationTurnScope(currentChatMessages, targetMsg);
    const previousMessages = regenerationTurn.messagesBeforeTarget;
    const lastUserMsg = regenerationTurn.userMessage;
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
      const activeIdentity = settings.identities?.find((identity: { id: string }) => identity.id === activeIdentityId);
      const promptUserName = activeIdentity?.name?.trim() || settings.name;
      const isAliasIdentity = activeIdentity?.kind === "alias";
      const identityRootId = getRootIdentityId(activeIdentityId, settings.identities || []);
      const primaryIdentity = isAliasIdentity
        ? settings.identities?.find((identity: { id: string; kind?: string }) => identity.kind === "primary" && getRootIdentityId(identity.id, settings.identities || []) === identityRootId)
        : undefined;
      const primaryIdentityName = primaryIdentity?.name?.trim() || "主号联系人";
      const primaryRelation = isAliasIdentity
        ? relationships?.find((relation: { userIdentityId: string; characterId: string }) =>
          relation.userIdentityId === primaryIdentity?.id && relation.characterId === activeCharacter.id)
        : undefined;
      const aliasIdentityFinalGuardPrompt = isAliasIdentity
        ? buildAliasIdentityFinalGuardPrompt({
          primaryName: primaryIdentityName,
          hasPrimaryRelationship: Boolean(primaryRelation),
          recognitionState: activeRelationship?.identityRecognitionState,
          aliasName: promptUserName,
        })
        : "";
      
      const turnSettings = resolveChatTurnSettings(latestActiveCharacterRef.current || activeCharacter);
      const currentMessageContextText = serializeMessageContentForPrompt(lastUserMsg, {
        mode: "history",
        userName: promptUserName,
        characterName: activeCharacter.name,
      });
      const isConnectedVoiceCall = activeAttachModal === "calling" && callingStatus === "connected";
      const callTopicShiftDetected = detectCallTopicShift({
        isConnectedVoiceCall,
        userText: currentMessageContextText,
        callTranscript,
      });
      const shouldLoadLongTermMemory = !isConnectedVoiceCall || callTopicShiftDetected;

      const requestTime = new Date();
      const historyContext = buildDirectChatContextSnapshot({
        messages: previousMessages,
        userMessageId: lastUserMsg.id,
        historyExcludedMessageIds: [lastUserMsg.id],
        userMessageAt: lastUserMsg.timestamp,
        enableTimeAwareness: turnSettings.enableTimeAwareness,
        contextLimit: limit,
        historyCharacterLimit: Number.MAX_SAFE_INTEGER,
        historicalReferenceCharacterLimit: Number.MAX_SAFE_INTEGER,
        characterName: activeCharacter.name,
        userName: promptUserName,
        requestTime,
        timeLogStyle: "compact",
      });
      const {
        messagesForHistory: normalizedMessagesForHistory,
        recentMessages: slicedMsgs,
        history,
        crossDayHistoricalReference,
        timeLogString,
        isCrossDayNewSession,
        hasCrossDayHistory,
        topicBoundary,
      } = historyContext;
      const msgsForHistory = normalizedMessagesForHistory;
      const historyPartition = { hasCrossDayHistory };

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
      const truthRetrieval = activeRelationship
        ? contributeDirectReplyTruthContext({
          scope: {
            relationId: activeRelationship.id,
            characterId: activeRelationship.characterId,
            userIdentityId: activeRelationship.userIdentityId,
            conversationId: activeRelationship.conversationId,
          },
          queryText: currentMessageContextText,
          limit: topK,
          maxCharacters: 4800,
          alreadyPromptedMessageIds: [...slicedMsgs, lastUserMsg].map((message) => message.id),
          alreadyPromptedTexts: [...slicedMsgs, lastUserMsg].map((message) => serializeMessageContentForPrompt(message, {
            mode: "history",
            userName: settings.name,
            characterName: activeCharacter.name,
          })),
          claims: loadKnowledgeClaims().value,
          summaries: loadConversationSummaries().value,
          corrections: loadBehaviorCorrections().value,
        })
        : undefined;
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

      const userProfileText = activeIdentity?.kind === "alias"
        ? `User Profile:
- This is a separate contact using an alias. Their real identity is unknown to you.
- The alias profile is private setup guidance, not a fact the character already knows. The current display name is “${promptUserName}”, but do not reveal or guess their primary identity unless they explicitly disclose it in the conversation.`
        : `User Profile:
- Nickname: ${promptUserName}
- Personality/Bio: ${activeIdentity?.bio ?? settings.bio}`;
      const userKnowledgeBoundary = formatUserKnowledgeBoundary();
      const relationshipContext = characterProjection.relationship?.content || "";
      if (activeIdentity?.kind === "alias") {
        if (primaryRelation) {
          characterContextText += `\n[角色自身关于另一位联系人的既有记忆]\n这些是角色过去对主号联系人或相关事件的记忆，不是当前马甲的身份信息。当前说话者仍是陌生联系人；不得因为职业、措辞或事件相似就认定当前马甲是饭饭，也不得把主号聊天历史当作当前对话历史。只有当前联系人明确说“我就是饭饭”等内容时，才允许建立身份关联。\n${primaryRelation.compressedMemory?.trim() ? `关系记忆：${primaryRelation.compressedMemory.trim()}` : "暂无相关既有记忆"}`;
        }
      }
      const aliasIdentityBoundaryPrompt = activeIdentity?.kind === "alias"
        ? buildAliasIdentityBoundaryPrompt({
          primaryName: primaryIdentityName,
          hasPrimaryRelationship: relationships?.some((relation: { userIdentityId: string; characterId: string }) => relation.userIdentityId === primaryIdentity?.id && relation.characterId === activeCharacter.id) === true,
          recognitionState: activeRelationship?.identityRecognitionState,
          aliasName: activeIdentity.name,
        })
        : "";

      const momentsContextRegen = getKnownMomentsContextString(allMoments, activeCharacter, activeIdentityId, promptUserName);
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
          ownerIdentityId: activeRelationship.userIdentityId,
          queryText: currentMessageContextText,
          hasUserMessage: Boolean(lastUserMsg),
          nowMs: requestTime.getTime(),
        }).text
        : "";

      // Context-aware trigger scanning: current message plus roughly ten recent messages.
      const scanContextParts = [
        currentMessageContextText,
        ...(topicBoundary.mode === "shift" ? [] : previousMessages.slice(-10)).map(m => serializeMessageContentForPrompt(m, { mode: "history", userName: promptUserName, characterName: activeCharacter.name }))
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

      const voiceIntervalPrompt = buildVoiceIntervalPrompt({
        characterName: activeCharacter.name,
        currentMessage: lastUserMsg,
        recentMessages: slicedMsgs,
      });

      const cognitivePrompt = regenerationCognitiveContext
        ? formatChatPromptContext(buildChatPromptContext(regenerationCognitiveContext, {
          maxFacts: 0,
          relevantMemoryIds: [],
          hasConfirmedClaim: Boolean(truthRetrieval?.projection.confirmedFacts.length),
          hasDerivedSummary: Boolean(truthRetrieval?.summaries.length),
        }))
        : "";

      const stickerPrompt = activeAttachModal !== "calling"
        ? (() => {
          const allStickers = stickerGroups.flatMap((group) => group.stickers);
          if (allStickers.length === 0) return undefined;
          const stickerList = allStickers.map((sticker) =>
            "- " + sticker.name + "｜语义：" + (sticker.semanticDescription || ("按名称“" + sticker.name + "”谨慎理解"))
            + "｜发送格式：[表情]|" + sticker.name + "|sticker://" + sticker.id,
          ).join("\n");
          return buildStickerResponsePrompt(stickerList, /^\[表情\]\|/.test(lastUserMsg.content));
        })()
        : undefined;

      const systemInstruction = buildDirectChatSystemInstruction({
        mainPromptText,
        musicContext,
        forumContext,
        diaryContext,
        userMemoContext,
        redPacketReactionPrompt: isRedPacketMarkup(lastUserMsg.content)
          ? buildRedPacketReactionPrompt(lastUserMsg.content, lastUserMsg.authorNameSnapshot || promptUserName)
          : undefined,
        newDayBoundaryPrompt: isCrossDayNewSession || historyPartition.hasCrossDayHistory
          ? NEW_DAY_CONVERSATION_BOUNDARY_PROMPT
          : undefined,
        timeAwarenessPrompt: turnSettings.enableTimeAwareness
          ? buildTimeAwarenessPrompt(requestTime, timeLogString)
          : undefined,
        voiceIntervalPrompt,
        afterMainWorldBook: formatStructuralWorldBookSection(wbBlocks, "after_main_prompt") || undefined,
        beforeCharacterWorldBook: formatStructuralWorldBookSection(wbBlocks, "before_char_def") || undefined,
        characterDescriptionText,
        personalityText: characterProjection.personality.content,
        relationshipContext,
        characterBehaviorPrompt,
        characterContextText,
        cognitivePrompt,
        afterCharacterWorldBook: formatStructuralWorldBookSection(wbBlocks, "after_char_def") || undefined,
        userProfileText,
        aliasIdentityBoundaryPrompt: aliasIdentityBoundaryPrompt || undefined,
        userKnowledgeBoundary,
        beforeHistoryWorldBook: formatStructuralWorldBookSection(wbBlocks, "before_chat_history") || undefined,
        momentsContext: momentsContextRegen,
        offlineStoriesContext: offlineStoriesContextRegen,
        includeLongTermMemory: shouldLoadLongTermMemory,
        characterKnowledgeBoundary: formatCharacterKnowledgeBoundary({ currentCharacterId: activeCharacter.id }),
        onlineChatSpatialBoundary: formatOnlineChatSpatialBoundary(),
        voiceCallPrompts: activeAttachModal === "calling"
          ? buildVoiceCallPrompts(callTopicShiftDetected)
          : undefined,
        stickerPrompt,
        worldBookContextPriority: wbBlocks.allTriggered.length > 0,
        characterProjection,
        diagnosticLabel: "regenerate prompt",
        finalPersonaRules: wbBlocks.allTriggered
          .filter((entry) => entry.purpose === "persona_rule")
          .map((entry) => "【" + entry.title + "】\n" + entry.content),
        finalPriorityInstructions: aliasIdentityFinalGuardPrompt ? [aliasIdentityFinalGuardPrompt] : undefined,
        finalLanguageInstruction: formatFinalReplyLanguageInstruction(resolveCharacterReplyLanguage(
          activeCharacter,
          getVisibleWorldBookEntries(worldBookEntries || [], activeChatCharId || "", {
            scenario: "chat",
            characterId: activeRelationship?.characterId || activeChatCharId || undefined,
            userIdentityId: activeRelationship?.userIdentityId || activeIdentityId,
            relationId: activeRelationship?.id,
          }).map((entry) => entry.title + "\n" + entry.content),
        )),
      });
      const keepPeriods = /(严谨|严肃|正式|书面|习惯句号|用句号|使用标点|使用句号)/i.test((activeCharacter?.personality || "") + (activeCharacter?.backstory || ""));
      const promptMessage = serializeMessageContentForPrompt(lastUserMsg, {
        mode: "current",
        userName: promptUserName,
        characterName: activeCharacter.name,
      });
      const imageDataUrl = resolveRecentUserImageForTurn({
        messages: previousMessages,
        userMessage: lastUserMsg,
        scope: {
          characterId: activeChatCharId,
          relationId: activeRelationship?.id || null,
          conversationId: activeRelationship?.conversationId || (activeRelationship ? getConversationId(activeRelationship.id) : null),
          userIdentityId: activeIdentityId,
          isGroup: activeCharacter.isGroupChat,
        },
      });
      const { data, candidates: replyCandidates } = await generateRegeneratedChatTurn({
        prompt: { scenario: "regenerate", message: promptMessage, history, systemInstruction, imageDataUrl, historyInjections: wbBlocks.at_depth },
        settings,
        candidateContext: {
          disableBracketActions: turnSettings.disableBracketActions,
          keepPeriods,
          characterId: activeChatCharId,
          characterName: activeCharacter?.name,
          userName: promptUserName,
          allowEmoji: false,
          createId: () => createId("regen"),
          currentTime: (idx) => Date.now() + idx,
        },
        aliasIdentityGuard: isAliasIdentity
          ? {
            aliasName: promptUserName,
            primaryName: primaryIdentityName,
            hasPrimaryRelationship: Boolean(primaryRelation),
            recognitionState: activeRelationship?.identityRecognitionState,
            currentUserMessage: lastUserMsg.content,
          }
          : undefined,
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
