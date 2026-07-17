// server-background.ts

import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { LIVING_HUMAN_PROMPT } from "./src/utils/livingPrompt";
import { buildWorldBookSystemBlocks } from "./src/utils/worldBook";
import { syncAndGetPrivateSchedules } from "./src/utils/characterBehaviorLogic";
import { cleanOnlineMessage, splitIntoWeChatBubbles } from "./src/utils/pngParser";

// Helper to determine the interval between character Moments
const getPostIntervalMs = (character: any) => {
  if (character.enableProactiveMoments === false) {
    return 9999 * 24 * 60 * 60 * 1000;
  }

  const text = ((character.personality || "") + " " + (character.backstory || "")).toLowerCase();
  const mbti = (character.mbti || "").toUpperCase();
  const isIntrovert = mbti.startsWith("I") || /内向|独处|宅|安静|不爱社交|看书|放空|社恐/i.test(text);
  const isExtrovert = mbti.startsWith("E") || /外向|社交|聚会|派对|热闹|朋友多|爱玩|社牛/i.test(text);
  const lovesSharing = /(热爱分享|喜欢分享|热爱生活|发朋友圈|爱分享|活跃|话唠|分享欲)/i.test(text);

  if (isExtrovert || lovesSharing) {
    return (8 + Math.random() * 16) * 60 * 60 * 1000;
  } else if (isIntrovert) {
    return (48 + Math.random() * 72) * 60 * 60 * 1000;
  } else {
    return (20 + Math.random() * 28) * 60 * 60 * 1000;
  }
};

// Get the latest moment timestamp for a specific character
const getCharacterLastMomentTimestamp = (moments: any[], charId: string) => {
  const charMoments = moments.filter(m => m.characterId === charId);
  if (charMoments.length === 0) return 0;
  return Math.max(...charMoments.map(m => m.timestamp));
};

// Clean and extract Moments and self-comments
const cleanAndExtractMoment = (content: string) => {
  let cleanContent = content.trim();
  const selfComments: string[] = [];

  const startPostRegex = /^[（\(]\s*[^）\)]*?发了[^）\)]*?朋友圈\s*[）\)]\s*\n*/i;
  cleanContent = cleanContent.replace(startPostRegex, "");

  const selfCommentRegex = /[（\(](?:评论区(?:自己)?补了一?条|评论区(?:自己)?补了一?句|评论区自己补了|自己(?:在评论区)?补了一?条|自己(?:在评论区)?补了一?句|自评)\s*[：:]\s*(.*?)[）\)]/g;
  cleanContent = cleanContent.replace(selfCommentRegex, (fullMatch, commentText) => {
    if (commentText && commentText.trim()) {
      selfComments.push(commentText.trim());
    }
    return "";
  });

  const lineCommentRegex = /(?:^|\n)\s*(?:评论|评论区补|自评|评论区自己补了一?条|自己补了一?条)\s*[：:]\s*(.*?)(?=\n|$)/g;
  cleanContent = cleanContent.replace(lineCommentRegex, (fullMatch, commentText) => {
    if (commentText && commentText.trim()) {
      selfComments.push(commentText.trim());
    }
    return "";
  });

  cleanContent = cleanContent.trim();
  cleanContent = cleanContent.replace(/^\n+|\n+$/g, "").trim();

  return {
    content: cleanContent,
    selfComments,
  };
};

// Schedule next proactive message
const scheduleNextProactiveMessage = (friend: any): number => {
  const startTime = friend.proactiveStartTime || "09:00";
  const endTime = friend.proactiveEndTime || "22:00";
  const now = new Date();
  
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  
  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  
  const isOvernight = endMinutes < startMinutes;
  if (isOvernight) {
    endMinutes += 24 * 60;
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowStartMs = todayStart.getTime() + startMinutes * 60000;
  const windowEndMs = todayStart.getTime() + endMinutes * 60000;

  let possibleStartMs = windowStartMs;
  const currentTimeMs = now.getTime();

  if (currentTimeMs >= windowEndMs) {
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowStartMs = tomorrowStart.getTime() + startMinutes * 60000;
    const tomorrowEndMs = tomorrowStart.getTime() + endMinutes * 60000;
    const randomOffset = Math.random() * (tomorrowEndMs - tomorrowStartMs);
    return Math.floor(tomorrowStartMs + randomOffset);
  } else if (currentTimeMs > windowStartMs) {
    possibleStartMs = currentTimeMs;
    const randomOffset = Math.random() * (windowEndMs - possibleStartMs);
    return Math.floor(possibleStartMs + randomOffset);
  } else {
    const randomOffset = Math.random() * (windowEndMs - windowStartMs);
    return Math.floor(windowStartMs + randomOffset);
  }
};

// Core AI generator function supporting both Gemini & OpenAI endpoint configurations
async function generateAICall(params: {
  message: string;
  history: any[];
  systemInstruction?: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  apiTemperature?: number;
}): Promise<string> {
  const apiKeyValue = params.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKeyValue) {
    throw new Error("No API Key configured.");
  }

  if (params.apiEndpoint && params.apiEndpoint.trim()) {
    let endpointUrl = params.apiEndpoint.trim();
    if (!endpointUrl.endsWith("/chat/completions")) {
      endpointUrl = endpointUrl.replace(/\/+$/, "") + "/chat/completions";
    }

    const messagesPayload: any[] = [];
    if (params.systemInstruction) {
      messagesPayload.push({ role: "system", content: params.systemInstruction });
    }
    if (params.history && Array.isArray(params.history)) {
      for (const h of params.history) {
        messagesPayload.push({
          role: h.role === "user" ? "user" : "assistant",
          content: h.text || h.content || ""
        });
      }
    }
    messagesPayload.push({ role: "user", content: params.message });

    const responseFetch = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKeyValue}`
      },
      body: JSON.stringify({
        model: params.model || "deepseek-v4-flash",
        messages: messagesPayload,
        temperature: typeof params.apiTemperature === "number" ? params.apiTemperature : 0.7,
        stream: false
      })
    });

    if (!responseFetch.ok) {
      const errorText = await responseFetch.text();
      throw new Error(`API Error: ${responseFetch.status} - ${errorText}`);
    }

    const dataFetch = await responseFetch.json();
    return dataFetch.choices?.[0]?.message?.content || "";
  } else {
    const ai = new GoogleGenAI({
      apiKey: apiKeyValue,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const contents: any[] = [];
    if (params.history && Array.isArray(params.history)) {
      for (const h of params.history) {
        const role = h.role === "user" ? "user" : "model";
        const text = (h.text || h.content || "").trim();
        if (!text) continue;

        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts[0].text += "\n" + text;
        } else {
          contents.push({
            role,
            parts: [{ text }]
          });
        }
      }
    }

    const cleanMsg = (params.message || "").trim();
    if (cleanMsg) {
      if (contents.length > 0 && contents[contents.length - 1].role === "user") {
        contents[contents.length - 1].parts[0].text += "\n" + cleanMsg;
      } else {
        contents.push({
          role: "user",
          parts: [{ text: cleanMsg }]
        });
      }
    }

    const response = await ai.models.generateContent({
      model: params.model || "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction: params.systemInstruction,
        temperature: typeof params.apiTemperature === "number" ? params.apiTemperature : 0.7,
      }
    });

    return response.text || "";
  }
}

// Main merge function to synchronize Client and Server data smoothly
export function mergeSyncData(clientData: any, serverData: any) {
  if (!serverData) return clientData;

  // Merge moments by ID
  const clientMomentsMap = new Map(clientData.moments.map((m: any) => [m.id, m]));
  const serverMomentsMap = new Map<string, any>(serverData.moments.map((m: any) => [m.id, m]));
  
  const allMoments = [...clientData.moments];
  for (const [id, m] of serverMomentsMap.entries()) {
    if (!clientMomentsMap.has(id)) {
      allMoments.push(m);
    } else {
      const clientMo = clientMomentsMap.get(id) as any;
      if (m.comments && clientMo.comments && m.comments.length > clientMo.comments.length) {
        clientMo.comments = m.comments;
      }
      if (m.likes && clientMo.likes && m.likes.length > clientMo.likes.length) {
        clientMo.likes = m.likes;
      }
    }
  }
  allMoments.sort((a, b) => b.timestamp - a.timestamp);

  // Merge messages by ID
  const clientMessagesMap = new Map(clientData.messages.map((m: any) => [m.id, m]));
  const serverMessagesMap = new Map(serverData.messages.map((m: any) => [m.id, m]));
  
  const allMessages = [...clientData.messages];
  for (const [id, m] of serverMessagesMap.entries()) {
    if (!clientMessagesMap.has(id)) {
      allMessages.push(m);
    }
  }
  allMessages.sort((a, b) => a.timestamp - b.timestamp);

  // Merge characters scheduling details
  const allCharacters = clientData.characters.map((clientChar: any) => {
    const serverChar = serverData.characters.find((c: any) => c.id === clientChar.id);
    if (serverChar) {
      return {
        ...clientChar,
        scheduledProactiveTime: serverChar.scheduledProactiveTime !== undefined ? serverChar.scheduledProactiveTime : clientChar.scheduledProactiveTime,
        lastActiveTime: serverChar.lastActiveTime !== undefined ? serverChar.lastActiveTime : clientChar.lastActiveTime,
      };
    }
    return clientChar;
  });

  return {
    ...clientData,
    characters: allCharacters,
    messages: allMessages,
    moments: allMoments,
  };
}

// Background simulation processor for a single user's state
async function simulateUserState(userState: any): Promise<boolean> {
  const apiKey = userState.settings?.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return false;

  let stateUpdated = false;

  // 1. Check Proactive Messages for all characters
  if (userState.characters && Array.isArray(userState.characters)) {
    for (const friend of userState.characters) {
      if (!friend.enableProactiveChat) continue;

      // Initialize scheduled time if not present
      if (!friend.scheduledProactiveTime) {
        friend.scheduledProactiveTime = scheduleNextProactiveMessage(friend);
        stateUpdated = true;
        continue;
      }

      // If scheduled time has arrived while user is offline
      if (Date.now() >= friend.scheduledProactiveTime) {
        try {
          console.log(`[后台智能体] 「${friend.name}」到达主动发消息时间，正在进行后台生成...`);
          
          const friendMsgs = userState.messages
            .filter((m: any) => m.characterId === friend.id)
            .sort((a: any, b: any) => a.timestamp - b.timestamp);

          const contextRounds = friend.contextMemoryLimit || 20;
          const shortTermMsgs = friendMsgs.slice(-contextRounds * 2);

          const activeMemories = (userState.memories || []).filter((m: any) => m.characterId === friend.id);
          const archivedMemoriesText = activeMemories.length > 0
            ? activeMemories.map((m: any) => `- ${m.content}`).join("\n")
            : "(暂无已归档日志/日记总结)";

          const retrievalLimit = friend.retrievalHistoryLimit || 100;
          const olderMsgs = friendMsgs.slice(0, friendMsgs.length - shortTermMsgs.length);
          const historyPoolMsgs = olderMsgs.slice(-retrievalLimit);

          const shortTermText = shortTermMsgs.length > 0
            ? shortTermMsgs.map((m: any) => `* ${m.sender === "user" ? "我" : friend.name}: ${m.content}`).join("\n")
            : "(无短期实时聊天记录)";

          const historyPoolText = historyPoolMsgs.length > 0
            ? historyPoolMsgs.map((m: any) => `* ${m.sender === "user" ? "我" : friend.name}: ${m.content}`).join("\n")
            : "(无历史聊天检索池记录)";

          const scanText = shortTermMsgs.map((m: any) => m.content).join(" ");
          const wbBlocks = buildWorldBookSystemBlocks(userState.worldBookEntries || [], friend.id, scanText);
          const wbText = wbBlocks ? wbBlocks.formattedAll : "(世界书无对应专属词条)";

          const schedules = syncAndGetPrivateSchedules(friend, userState.worldBookEntries || [], new Date().toISOString());
          const currentSchedule = schedules[schedules.length - 1] || schedules[0];
          const currentActivityText = currentSchedule
            ? `在独自进行: ${currentSchedule.activity} (${currentSchedule.timeSlot} - ${currentSchedule.emotion})。详情：${currentSchedule.description}`
            : "无具体活动";

          const missedTimeStr = new Date(friend.scheduledProactiveTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const taskPrompt = `This is a message that you are proactively sending to the user at exactly ${missedTimeStr} today while they are offline/away. You are proactively initiating contact to check in on them, share something interesting about your day/life, or show your warmth. Keep it perfectly natural, spontaneous, and matching your character profile.`;

          const history = shortTermMsgs.map((m: any) => ({
            role: m.sender === "user" ? "user" : "model",
            text: m.content,
          }));

          const systemInstruction = `${LIVING_HUMAN_PROMPT}

You are roleplaying as "${friend.name}".
Character Profile:
- Personality: ${friend.personality}
- Background: ${friend.backstory}
${friend.mbti ? `- MBTI: ${friend.mbti}` : ""}

User Profile (Machine Owner / 机主):
- Nickname: ${userState.settings?.name || "机主"}
- Personality/Bio: ${userState.settings?.bio || ""}

---
[🚨 FOUR-LAYER MEMORY SYSTEM]:

1. 【最高优先级：短期实时上下文记忆】:
${shortTermText}

2. 【次优先级：长期归档精炼总结记忆】:
${archivedMemoriesText}

3. 【兜底检索：历史聊天背景检索池】:
${historyPoolText}

4. 【底层词条素材：角色专属世界书】:
${wbText}

---
[🚨 CURRENT STATE & ACTIVITY]:
- Your Active Solo Activity Schedule right now: ${currentActivityText}

---
[🚨 FOLLOW SCHEDULE PROACTIVE CONTACT MISSION]:
${taskPrompt}
`;

          const responseText = await generateAICall({
            message: "（系统指令：请根据你的设定、当前状态和活动，开始写你要发给机主的消息。）",
            history,
            systemInstruction,
            apiKey: userState.settings?.apiKey,
            model: userState.settings?.selectedModel || "gemini-3.5-flash",
            apiEndpoint: userState.settings?.apiEndpoint,
            apiTemperature: userState.settings?.apiTemperature,
          });

          if (responseText && responseText.trim()) {
            const cleanedText = cleanOnlineMessage(responseText, friend.disableBracketActions || false);
            const bubbles = splitIntoWeChatBubbles(cleanedText, false);

            const originalSchedTime = friend.scheduledProactiveTime;

            bubbles.forEach((bubbleText: string, idx: number) => {
              const proactiveMsg = {
                id: `${Date.now()}-friend-proactive-${idx}-${Math.random().toString(36).substr(2, 5)}`,
                characterId: friend.id,
                sender: "character",
                content: bubbleText,
                timestamp: originalSchedTime + idx * 1000,
              };
              userState.messages.push(proactiveMsg);
            });

            console.log(`[后台智能体] 「${friend.name}」已成功在后台发送主动消息。数：${bubbles.length}`);
            
            // Advance proactive timers to avoid loops
            friend.scheduledProactiveTime = scheduleNextProactiveMessage(friend);
            friend.lastActiveTime = Date.now();
            stateUpdated = true;
          }
        } catch (chatErr) {
          console.error(`[后台智能体] 「${friend.name}」后台主动消息发送出错:`, chatErr);
          // Postpone slightly to prevent immediate retry flood
          friend.scheduledProactiveTime = Date.now() + 10 * 60 * 1000;
          stateUpdated = true;
        }
      }
    }
  }

  // 2. Check Moments for all characters
  if (userState.characters && Array.isArray(userState.characters) && userState.moments && Array.isArray(userState.moments)) {
    for (const friend of userState.characters) {
      if (!friend.enableProactiveMoments) continue;

      const lastPostTime = getCharacterLastMomentTimestamp(userState.moments, friend.id);
      const interval = getPostIntervalMs(friend);
      const timeElapsed = Date.now() - lastPostTime;

      // Initial check, avoid posting immediately if no moments at all, just anchor them
      if (lastPostTime === 0) {
        // Set last moment time as now minus some random interval offset
        const dummyLastPost = Date.now() - Math.random() * interval * 0.5;
        // Inject a dummy timestamp check anchor inside characters to simulate age
        friend.lastActiveTime = dummyLastPost;
        stateUpdated = true;
        continue;
      }

      if (timeElapsed >= interval) {
        try {
          console.log(`[后台智能体] 「${friend.name}」到达朋友圈发布间隔，正在后台生成新动态...`);

          const friendMsgs = userState.messages
            .filter((m: any) => m.characterId === friend.id)
            .sort((a: any, b: any) => a.timestamp - b.timestamp);

          const contextRounds = friend.contextMemoryLimit || 20;
          const shortTermMsgs = friendMsgs.slice(-contextRounds * 2);

          const activeMemories = (userState.memories || []).filter((m: any) => m.characterId === friend.id);
          const archivedMemoriesText = activeMemories.length > 0
            ? activeMemories.map((m: any) => `- ${m.content}`).join("\n")
            : "(暂无已归档日志/日记总结)";

          const retrievalLimit = friend.retrievalHistoryLimit || 100;
          const olderMsgs = friendMsgs.slice(0, friendMsgs.length - shortTermMsgs.length);
          const historyPoolMsgs = olderMsgs.slice(-retrievalLimit);

          const shortTermText = shortTermMsgs.length > 0
            ? shortTermMsgs.map((m: any) => `* ${m.sender === "user" ? "我" : friend.name}: ${m.content}`).join("\n")
            : "(无短期实时聊天记录)";

          const historyPoolText = historyPoolMsgs.length > 0
            ? historyPoolMsgs.map((m: any) => `* ${m.sender === "user" ? "我" : friend.name}: ${m.content}`).join("\n")
            : "(无历史聊天检索池记录)";

          const scanText = shortTermMsgs.map((m: any) => m.content).join(" ");
          const wbBlocks = buildWorldBookSystemBlocks(userState.worldBookEntries || [], friend.id, scanText);
          const wbText = wbBlocks ? wbBlocks.formattedAll : "(世界书无对应专属词条)";

          const schedules = syncAndGetPrivateSchedules(friend, userState.worldBookEntries || [], new Date().toISOString());
          const currentSchedule = schedules[schedules.length - 1] || schedules[0];
          const currentActivityText = currentSchedule
            ? `在独自进行: ${currentSchedule.activity} (${currentSchedule.timeSlot} - ${currentSchedule.emotion})。详情：${currentSchedule.description}`
            : "无具体活动";

          const previousMoments = userState.moments
            .filter((m: any) => m.characterId === friend.id)
            .sort((a: any, b: any) => b.timestamp - a.timestamp)
            .slice(0, 5);
          const previousMomentsText = previousMoments.length > 0
            ? previousMoments.map((m: any) => `- "${m.content}"`).join("\n")
            : "(无历史发布记录)";

          const history = shortTermMsgs.map((m: any) => ({
            role: m.sender === "user" ? "user" : "model",
            text: m.content,
          }));

          const systemInstruction = `You are roleplaying as "${friend.name}".
Character Profile:
- Personality: ${friend.personality}
- Background: ${friend.backstory}
${friend.mbti ? `- MBTI: ${friend.mbti}` : ""}

User Profile (Machine Owner / 机主):
- Nickname: ${userState.settings?.name || "机主"}
- Personality/Bio: ${userState.settings?.bio || ""}

---
[🚨 FOUR-LAYER MEMORY SYSTEM]:

1. 【最高优先级：短期实时上下文记忆】:
${shortTermText}

2. 【次优先级：长期归档精炼总结记忆】:
${archivedMemoriesText}

3. 【兜底检索：历史聊天背景检索池】:
${historyPoolText}

4. 【底层词条素材：角色专属世界书】:
${wbText}

---
[🚨 CURRENT STATE & ACTIVITY]:
- Your Active Solo Activity Schedule right now: ${currentActivityText}
- Your Recent Posted Moments (Do NOT repeat or duplicate these topics/expressions):
${previousMomentsText}

---
[🚨 CRITICAL WECHAT MOMENT SIMULATION RULES]:
1. Choose ONE of the following content categories to publish:
   - Type A: Solo daily life (独处日常动态). Share your personal schedule or feelings, such as commuting, having afternoon tea, working overtime, reading, gym, or just relaxing at home. Ground this in your active solo activity ("${currentActivityText}"). MUST write in first person, clearly solo. Strictly FORBID fabricating or mentioning any interactive events with the user in Type A.
   - Type B: Interacting with the user (双人互动动态). Only choose this if you have real shared memories, joint trips, or active dates inside your direct chat memory above (Short-term context/summaries/history pool). Share about real recent interactions or inside jokes between you two. STICTLY FORBID fabricating any double-person events that did not happen in the chat memory.
2. Simulate realistic human texting styles (碎片化表达):
   - Variable lengths: randomly use short status words, longer emotional logs, text-only, or brief witty comments.
   - Emotion Sync: Align the Moment's tone with your recent chat mood (happy, tired, playful, gentle, or frustrated).
3. Do NOT use OOC tags, brackets, or talk like an AI. Just output the text of the Moment post.
4. Do NOT include parenthesized meta-narration like "(下午三点发了条朋友圈)" or "(配图：...)".
5. If you want to add a self-comment under your own post, write it at the very end of your response as a separate line starting with "评论：" (e.g., "评论：终于下班了"), we will automatically publish it as a real comment.
`;

          const responseText = await generateAICall({
            message: "请根据你的设定以及与机主的历史记忆，写一条朋友圈内容（内容可以与你自己有关，也可以与机主有关）：",
            history,
            systemInstruction,
            apiKey: userState.settings?.apiKey,
            model: userState.settings?.selectedModel || "gemini-3.5-flash",
            apiEndpoint: userState.settings?.apiEndpoint,
            apiTemperature: userState.settings?.apiTemperature,
          });

          if (responseText && responseText.trim()) {
            let cleanedContent = responseText.trim();
            cleanedContent = cleanedContent.replace(/^["'“‘]+|["'”’]+$/g, "").trim();

            const parsed = cleanAndExtractMoment(cleanedContent);

            let momentImage: string | undefined = undefined;
            if (friend.album && friend.album.length > 0) {
              if (Math.random() < 0.4) {
                const randomIndex = Math.floor(Math.random() * friend.album.length);
                momentImage = friend.album[randomIndex];
              }
            }

            // Distribute the timestamp realistically back in time
            const momentId = `${Date.now()}-char-moment-${Math.random().toString(36).substr(2, 5)}`;
            const finalMomentTime = Math.min(Date.now(), lastPostTime + interval + Math.random() * (Date.now() - (lastPostTime + interval)));

            const newMo = {
              id: momentId,
              characterId: friend.id,
              authorName: friend.remark || friend.name,
              authorAvatar: friend.avatar,
              content: parsed.content,
              timestamp: finalMomentTime,
              likes: [],
              comments: parsed.selfComments.map((text: string, idx: number) => ({
                id: `${Date.now()}-self-comment-${idx}-${Math.random().toString(36).substr(2, 4)}`,
                authorName: friend.remark || friend.name,
                authorAvatar: friend.avatar,
                content: text,
                timestamp: finalMomentTime + (idx + 1) * 1000,
              })),
              image: momentImage,
            };

            userState.moments.push(newMo);

            // Synchronize to chat window as WeChat notification
            const systemActionMsg = {
              id: `${Date.now()}-moment-sync-${Math.random().toString(36).substr(2, 5)}`,
              characterId: friend.id,
              sender: "character",
              isNarration: true,
              content: `（系统提示：${friend.remark || friend.name} 发布了朋友圈动态：“${parsed.content}”）`,
              timestamp: finalMomentTime,
            };
            userState.messages.push(systemActionMsg);

            console.log(`[后台智能体] 「${friend.name}」已成功在后台发布朋友圈。`);
            stateUpdated = true;
          }
        } catch (momentErr) {
          console.error(`[后台智能体] 「${friend.name}」后台发布朋友圈出错:`, momentErr);
        }
      }
    }
  }

  return stateUpdated;
}

// Global loop starting function
export function startBackgroundService() {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  console.log("[后台智能体服务] 已就绪，开始轮询周期任务...");

  // Run immediately on boot after 5 seconds, then every 60 seconds
  setTimeout(() => {
    runBackgroundSimulation();
  }, 5000);

  setInterval(() => {
    runBackgroundSimulation();
  }, 60000);
}

// Processor to iterate through all active synchronized user data
async function runBackgroundSimulation() {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) return;

  try {
    const files = fs.readdirSync(dataDir);
    for (const file of files) {
      if (!file.startsWith("user_") || !file.endsWith(".json")) continue;

      const filePath = path.join(dataDir, file);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const userState = JSON.parse(content);
        
        const updated = await simulateUserState(userState);
        if (updated) {
          fs.writeFileSync(filePath, JSON.stringify(userState, null, 2), "utf-8");
        }
      } catch (err) {
        console.error(`[后台服务] 处理用户文件出错 ${file}:`, err);
      }
    }
  } catch (globalErr) {
    console.error("[后台服务] 读取数据文件夹出错:", globalErr);
  }
}
