import React, { useState, useEffect, useRef } from "react";
import { 
  ArrowLeft, Plus, Trash2, Send, Sparkles, BookOpen, 
  Link2, Calendar, MessageSquare, ChevronRight, HelpCircle, 
  Settings, Check, RefreshCw, Layers, Eye, BookMarked, Cpu
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Character, Message, OfflineStory, MemoryItem, UserSettings } from "../types";
import { apiChat } from "../utils/apiHelper";
import { splitTextToOfflineSegments } from "../utils/pngParser";
import { getRelevantMemories } from "./AppMemory";

interface AppOfflineProps {
  characters: Character[];
  settings: UserSettings;
  offlineStories: OfflineStory[];
  onSaveOfflineStory: (story: OfflineStory) => void;
  onDeleteOfflineStory: (storyId: string) => void;
  onClose: () => void;
  onNavigateToChat?: (charId: string) => void;
  memories: MemoryItem[];
  onSaveMemories: (mems: MemoryItem[]) => void;
}

export default function AppOffline({
  characters = [],
  settings,
  offlineStories = [],
  onSaveOfflineStory,
  onDeleteOfflineStory,
  onClose,
  onNavigateToChat,
  memories = [],
  onSaveMemories
}: AppOfflineProps) {
  const [selectedCharId, setSelectedCharId] = useState<string>(characters[0]?.id || "");
  const [activeStory, setActiveStory] = useState<OfflineStory | null>(null);
  
  // Creation modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMode, setNewMode] = useState<"director" | "continue" | "if">("director");
  const [newIfPrompt, setNewIfPrompt] = useState("");
  const [newStartFromChat, setNewStartFromChat] = useState<boolean>(false);

  // Chat/Editor input state
  const [inputText, setInputText] = useState("");
  const [inputNarration, setInputNarration] = useState(false); // speaking vs narration toggle
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Toast notifications
  const [toast, setToast] = useState("");
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const selectedChar = characters.find(c => c.id === selectedCharId) || characters[0];
  const charStories = offlineStories.filter(s => s.characterId === selectedCharId);

  const workspaceEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (workspaceEndRef.current) {
      workspaceEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeStory?.messages, isGenerating]);

  // Handle opening a story
  const handleOpenStory = (story: OfflineStory) => {
    setActiveStory(story);
    localStorage.setItem(`offline_mode_active_${story.characterId}`, "true");
    localStorage.setItem(`offline_story_id_${story.characterId}`, story.id);
  };

  // Create new offline story
  const handleCreateStory = () => {
    if (!selectedCharId) {
      showToast("请先选择一个角色！");
      return;
    }

    const modeLabel = newMode === "director" ? "导演剧本" : newMode === "if" ? "IF假想线" : "续写故事";
    const titleToUse = newTitle.trim() || `「${selectedChar.name}」的${modeLabel} - ${new Date().toLocaleDateString()}`;

    let initialMessages: Message[] = [];

    // Reference from current chat history (if requested)
    if (newStartFromChat) {
      // Find normal chat messages of this character in localStorage
      const allChatsRaw = localStorage.getItem("phone_messages_v3");
      if (allChatsRaw) {
        try {
          const parsed = JSON.parse(allChatsRaw) as Message[];
          const relevantMsgs = parsed
            .filter(m => m.characterId === selectedCharId)
            .slice(-15); // Copy last 15 messages for high context continuity
          
          initialMessages = relevantMsgs.map(m => ({
            ...m,
            id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            isOffline: true
          }));
        } catch (e) {
          console.error("Failed to copy chat history:", e);
        }
      }
    }

    const newStory: OfflineStory = {
      id: `story-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      characterId: selectedCharId,
      title: titleToUse,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: newMode,
      ifPrompt: newMode === "if" ? newIfPrompt : undefined,
      sourceChatId: newStartFromChat ? selectedCharId : undefined,
      sourceChatMsgCount: newStartFromChat ? initialMessages.length : undefined,
      messages: initialMessages
    };

    onSaveOfflineStory(newStory);
    setActiveStory(newStory);
    localStorage.setItem(`offline_mode_active_${selectedCharId}`, "true");
    localStorage.setItem(`offline_story_id_${selectedCharId}`, newStory.id);
    setShowCreateModal(false);

    // Reset fields
    setNewTitle("");
    setNewMode("director");
    setNewIfPrompt("");
    setNewStartFromChat(false);

    showToast("线下故事创建成功");
  };

  // Delete a story
  const handleDeleteStory = (storyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要删除这个线下故事记录吗？此操作无法撤销。")) {
      onDeleteOfflineStory(storyId);
      if (activeStory?.id === storyId) {
        setActiveStory(null);
      }
      showToast("故事已删除");
    }
  };

  // Sync memory manually
  const handleSyncMemoryToBrain = (story: OfflineStory) => {
    if (!story.messages.length) return;
    
    // Create a summarized memory of this offline development
    const lastMsgs = story.messages.slice(-5);
    const summaryText = lastMsgs
      .map(m => m.isNarration ? `[旁白描述] ${m.content}` : `[对话] ${m.sender === "user" ? "我" : selectedChar.name}: ${m.content}`)
      .join(" \n");

    const newMemoryContent = `[线下剧本《${story.title}》记忆同步]: 在离线虚构走向中发生：\n${summaryText}`;

    // Avoid duplicates
    const isDup = memories.some(m => m.characterId === selectedChar.id && m.content.includes(`《${story.title}》`));
    if (isDup) {
      showToast("最近进展已同步，无需重复同步");
      return;
    }

    const memoryItem: MemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      characterId: selectedChar.id,
      content: newMemoryContent,
      timestamp: Date.now(),
      importance: 7,
      isManual: true
    };

    onSaveMemories([memoryItem, ...memories]);
    showToast("剧情记忆已成功同步至人物主大脑！");
  };

  // Send message inside workspace
  const handleSendMessage = async (textToSend?: string, forceAIOnly = false) => {
    if (!activeStory) return;
    setErrorMsg("");

    const text = textToSend !== undefined ? textToSend : inputText.trim();
    if (!text && !forceAIOnly) return;

    let updatedStory = { ...activeStory };
    
    // 1. If we have user text to add
    if (text && !forceAIOnly) {
      const userMsg: Message = {
        id: `offline-msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        characterId: activeStory.characterId,
        sender: "user",
        content: text,
        timestamp: Date.now(),
        isOffline: true,
        isNarration: inputNarration
      };

      updatedStory.messages = [...updatedStory.messages, userMsg];
      updatedStory.updatedAt = Date.now();
      onSaveOfflineStory(updatedStory);
      setActiveStory(updatedStory);
      setInputText("");
    }

    // 2. Trigger AI Generation
    setIsGenerating(true);
    try {
      // Assemble history context
      const historyContext = updatedStory.messages.map(m => ({
        role: m.sender === "user" ? "user" : "model",
        text: m.isNarration ? `(客观旁白) ${m.content}` : `${m.sender === "user" ? "我" : selectedChar.name}: “${m.content}”`
      }));

      // Base Persona
      let sysPrompt = `你现在正在与用户进行“线下故事/小说剧本”的联合创作。角色人设为「${selectedChar.name}」。
人物背景设定如下：
- 姓名：${selectedChar.name}
- 年龄：${selectedChar.age}
- 语气/性格特点：${selectedChar.personality}
- 背景设定：${selectedChar.backstory}

【线下模式核心规则】
1. 用户可以通过文字、指令或旁白，像导播、写小说或主控一样描述故事进展。
2. 作为一个优秀的内容创作者，你要输出一整段精美的、小说叙事般的回复，内容包括第三人称的场景描写、客观动作、旁白叙事，以及两人的对话。
3. 🚨🚨🚨 [绝对指令]: 所有发言对话必须使用中文引号 “ ” (例如 “你又在胡思乱想什么。”) 或 「 」 括起来。任何非发言部分（动作描述、神态、场景描写、内心想法、旁白等）必须放在引号外面，严禁放在引号内。不可漏掉引号！否则系统无法将你的发言拆分成气泡对话。
4. 如果用户给出了导演指令（如：[控制剧情：我们遇到了敌人]），请积极顺应，发挥你强大的故事延展能力，精美自然地推进剧情。
5. 必须保持极高的人设契合度、动作细节和情感氛围描写。不要说任何破戏（OOC）的话，不要说你是AI。

【当前创作模式】：`;

      if (updatedStory.mode === "director") {
        sysPrompt += `\n【导演模式】：用户是编剧/导演，给你发出控制剧本走向的指令。你要自行把控边界，像写小说一样输出一整段包含角色和用户所有完整对话、动作、旁白的文段。`;
      } else if (updatedStory.mode === "if") {
        sysPrompt += `\n【IF平行假想线】：当前故事处于一个脱离原作正统时间线的平行宇宙中！
假想线宇宙设定：${updatedStory.ifPrompt || "自定义世界观设定"}
在此假想规则下，让人物发挥其性格，在此全新背景中与用户互动。`;
      } else {
        sysPrompt += `\n【续写模式】：以现有的聊天/故事为草稿，根据设定和目前的逻辑走向，续写故事的精彩发展。`;
      }

      // Recall memories from vault
      const relevantMems = getRelevantMemories(memories, selectedChar.id, text || "续写故事", 5);
      if (relevantMems.length > 0) {
        sysPrompt += `\n\n【互通的线上记忆库】：以下是你们曾在线上聊天中发生并提取的核心事实，请将其有机融入作为故事的背景事实支撑：\n${relevantMems.map(m => `* ${m.content}`).join("\n")}`;
      }

      const lastUserMsgText = text || "请继续编织并续写这幕场景。";

      const response = await apiChat({
        message: lastUserMsgText,
        history: historyContext,
        systemInstruction: sysPrompt,
        apiKey: settings.apiKey,
        model: settings.selectedModel || "gemini-3.5-flash",
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: settings.apiTemperature || 0.8,
        streamCompatible: settings.streamCompatible
      });

      if (response && response.text) {
        // Parse the generated text block into sequence of speech bubbles & narration lines!
        const parsedSegments = splitTextToOfflineSegments(response.text);
        
        let newMsgs: Message[] = [];
        if (parsedSegments.length > 0) {
          newMsgs = parsedSegments.map((seg, sIdx) => ({
            id: `offline-reply-${Date.now()}-${sIdx}-${Math.random().toString(36).substr(2, 5)}`,
            characterId: activeStory.characterId,
            sender: seg.isNarration ? "user" : "character", // narration maps beautifully to neutral or user view, but visually has no avatar. We set sender user/char but flag isNarration
            content: seg.content,
            timestamp: Date.now() + sIdx,
            isOffline: true,
            isNarration: seg.isNarration
          }));
        } else {
          // Fallback if parsing fails
          newMsgs = [{
            id: `offline-reply-fallback-${Date.now()}`,
            characterId: activeStory.characterId,
            sender: "character",
            content: response.text,
            timestamp: Date.now(),
            isOffline: true,
            isNarration: false
          }];
        }

        const finalStory = {
          ...updatedStory,
          messages: [...updatedStory.messages, ...newMsgs],
          updatedAt: Date.now()
        };

        onSaveOfflineStory(finalStory);
        setActiveStory(finalStory);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("呼叫主脑剧本引擎失败，请检查网络或API Key设定。");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800 relative overflow-hidden font-sans select-none">
      
      {/* Dynamic Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-indigo-600/90 backdrop-blur-md text-white text-xs px-4 py-2 rounded-full shadow-lg border border-indigo-400 font-bold"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!activeStory ? (
          /* ================= STORY DIRECTORY VIEW ================= */
          <motion.div 
            key="story-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50"
          >
            {/* Header */}
            <div className="px-4 py-3.5 bg-white border-b border-slate-100 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5">
                <button 
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h1 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <span>🎭 线下剧本模式</span>
                  </h1>
                  <p className="text-[10px] text-slate-500">线下独立走向，与线上大脑记忆互通</p>
                </div>
              </div>

              <button 
                onClick={() => setShowCreateModal(true)}
                className="px-3.5 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建故事</span>
              </button>
            </div>

            {/* Character Selector Grid */}
            <div className="p-3 bg-white border-b border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">选择人物剧本空间</p>
              <div className="flex items-center gap-3 overflow-x-auto pb-1 no-scrollbar">
                {characters.map(char => {
                  const isSel = char.id === selectedCharId;
                  const charStoriesCount = offlineStories.filter(s => s.characterId === char.id).length;
                  return (
                    <button
                      key={char.id}
                      onClick={() => setSelectedCharId(char.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all shrink-0 ${
                        isSel 
                          ? "bg-slate-900 border-slate-900 text-white font-bold shadow-sm" 
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300"
                      }`}
                    >
                      <img src={char.avatar} alt="" className="w-5 h-5 rounded-full object-cover border border-slate-200" />
                      <span className="text-xs font-bold">{char.remark || char.name}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-500">
                        {charStoriesCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stories Directory Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h2 className="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                  <span>故事列表 ({charStories.length})</span>
                </h2>
                {selectedChar && (
                  <span className="text-[11px] text-slate-500">当前角色: {selectedChar.remark || selectedChar.name}</span>
                )}
              </div>

              {charStories.length === 0 ? (
                <div className="py-16 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-700">暂无线下故事</p>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">选择角色并点击右上角的“新建故事”来开启一段惊心动魄的虚构走向吧！</p>
                  </div>
                  <button 
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all inline-block shadow-sm"
                  >
                    立刻开启新故事
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {charStories.map(story => {
                    const storyModeLabel = story.mode === "director" ? "导演" : story.mode === "if" ? "IF线" : "续写";
                    const storyModeColor = story.mode === "director" ? "bg-rose-50 text-rose-600 border-rose-200/60" : story.mode === "if" ? "bg-amber-50 text-amber-600 border-amber-200/60" : "bg-teal-50 text-teal-600 border-teal-200/60";
                    return (
                      <div
                        key={story.id}
                        onClick={() => handleOpenStory(story)}
                        className="p-4 rounded-2xl bg-white border border-slate-150 hover:border-slate-250 hover:bg-slate-50/50 cursor-pointer transition-all flex items-start justify-between group shadow-sm hover:shadow-md"
                      >
                        <div className="space-y-2 flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${storyModeColor}`}>
                              {storyModeLabel}
                            </span>
                            {story.sourceChatId && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-0.5">
                                <Link2 className="w-2.5 h-2.5 text-slate-400" />
                                引用线上
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(story.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                          
                          <h3 className="text-sm font-bold text-slate-800 group-hover:text-slate-900 transition-colors truncate">
                            {story.title}
                          </h3>

                          {story.mode === "if" && story.ifPrompt && (
                            <p className="text-xs text-amber-600 font-medium italic truncate max-w-full">
                              设定: {story.ifPrompt}
                            </p>
                          )}

                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                            <span>共 {story.messages.length} 段剧情记录</span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end justify-between h-full space-y-4">
                          <button
                            onClick={(e) => handleDeleteStory(story.id, e)}
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 border border-slate-200/60"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick explanation guide footer */}
            <div className="p-4 bg-white border-t border-slate-150 text-[11px] text-slate-500 space-y-2">
              <p className="font-bold text-slate-700 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                什么是线下故事模式？
              </p>
              <p className="leading-relaxed">线下故事模式是模拟剧本创作，支持「导演模式」、「续写模式」与「IF平行宇宙」。双方可以通过客观旁白/动作描写进行文段叙事，极高自由度定制非线性关系，所有内容与主线独立但记忆相通。</p>
            </div>
          </motion.div>
        ) : (
          /* ================= ACTIVE STORY WORKSPACE ================= */
          <motion.div 
            key="story-workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <button 
                  onClick={() => setActiveStory(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-850 truncate block max-w-[200px]">
                      {activeStory.title}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-600 border border-indigo-200/60 uppercase font-extrabold shrink-0">
                      {activeStory.mode === "director" ? "导演" : activeStory.mode === "if" ? "IF线" : "续写"}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate">与「{selectedChar.remark || selectedChar.name}」的离线剧本空间</p>
                </div>
              </div>

              {/* Memory Sync button */}
              <button
                onClick={() => handleSyncMemoryToBrain(activeStory)}
                className="px-2.5 py-1.5 rounded-full bg-slate-100 hover:bg-indigo-50 text-indigo-600 hover:text-indigo-700 font-bold text-[11px] flex items-center gap-1 transition-all shrink-0 border border-slate-200"
                title="同步本次进展记忆至角色大脑"
              >
                <Cpu className="w-3 h-3" />
                <span>同步记忆</span>
              </button>
            </div>

            {/* Source Reference banner */}
            {activeStory.sourceChatId && (
              <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between text-xs text-indigo-600">
                <div className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>已关联线上聊天记录 (导入了 {activeStory.sourceChatMsgCount || 0} 条历史对话)</span>
                </div>
                {onNavigateToChat && (
                  <button 
                    onClick={() => onNavigateToChat(activeStory.characterId)}
                    className="text-[10px] underline font-bold hover:text-indigo-700"
                  >
                    返回线上聊天
                  </button>
                )}
              </div>
            )}

            {/* IF-Line Hypothesis Premise banner */}
            {activeStory.mode === "if" && activeStory.ifPrompt && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 font-sans flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>IF假想设定: {activeStory.ifPrompt}</span>
              </div>
            )}

            {/* Messaging Workspace Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100/40">
              
              {activeStory.messages.length === 0 && (
                <div className="py-12 text-center text-slate-500 space-y-3 px-6">
                  <p className="text-xs leading-relaxed">🎬 剧本空间已就绪！可以先在输入框选择“旁白/描述”或“发言”来开个头，也可以直接点击下方的 “AI 续写” 让 {selectedChar.remark || selectedChar.name} 主动打破僵局并书写一段精美的小说开场白。</p>
                  <button
                    onClick={() => handleSendMessage(undefined, true)}
                    className="px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all shadow-sm"
                  >
                    ✨ 让 {selectedChar.remark || selectedChar.name} 开启第一幕
                  </button>
                </div>
              )}

              {activeStory.messages.map((msg, index) => {
                const isSelf = msg.sender === "user";
                
                if (msg.isNarration) {
                  // Objective Narration / Action layout
                  return (
                    <div 
                      key={msg.id}
                      className="w-full py-2.5 px-2 my-1.5 text-center text-[11px] leading-relaxed text-[#a1a3a8] border-b border-dashed border-slate-150 transition-all"
                    >
                      <div className="max-w-[90%] mx-auto font-normal tracking-wide">
                        {msg.content}
                      </div>
                    </div>
                  );
                } else {
                  // Spoken Dialogue Bubble layout
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2.5 max-w-[85%] message message-container ${
                        isSelf ? "ml-auto flex-row-reverse" : "mr-auto"
                      }`}
                    >
                      {/* Avatar */}
                      <img
                        src={isSelf ? settings.avatar : selectedChar.avatar}
                        alt=""
                        className="w-9 h-9 bg-slate-100 rounded-full object-cover border border-slate-200 shrink-0 aspect-square"
                      />
                      
                      <div className="space-y-0.5 max-w-full">
                        <span className="text-[10px] text-slate-400 block px-1">
                          {isSelf ? "我" : (selectedChar.remark || selectedChar.name)}
                        </span>
                        
                        <div 
                          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                            isSelf 
                              ? "bg-indigo-600 text-white rounded-tr-none shadow-sm" 
                              : "bg-white text-slate-800 border border-slate-150 rounded-tl-none shadow-sm"
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                }
              })}

              {/* Typing Indicator */}
              {isGenerating && (
                <div className="flex items-center gap-2 text-xs text-indigo-600 font-bold italic px-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{selectedChar.remark || selectedChar.name} 正在编织剧情走向...</span>
                </div>
              )}

              {/* Error indicator */}
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                  {errorMsg}
                </div>
              )}

              <div ref={workspaceEndRef} />
            </div>

            {/* Bottom control & Input bar */}
            <div className="p-3 bg-white border-t border-slate-100 space-y-2 shadow-inner">
              <div className="flex items-center justify-between">
                
                {/* Input Mode Toggle: Spoken dialogue vs Narrative */}
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[11px] text-slate-500 uppercase tracking-wide">输入类型:</span>
                  <button
                    onClick={() => setInputNarration(false)}
                    className={`px-3.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all flex items-center gap-1 shadow-sm ${
                      !inputNarration 
                        ? "bg-slate-900 border-slate-900 text-white !text-white" 
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className={!inputNarration ? "text-white !text-white" : "text-slate-600"}>💬 角色发言</span>
                  </button>
                  <button
                    onClick={() => setInputNarration(true)}
                    className={`px-3.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all flex items-center gap-1 shadow-sm ${
                      inputNarration 
                        ? "bg-slate-900 border-slate-900 text-white !text-white" 
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className={inputNarration ? "text-white !text-white" : "text-slate-600"}>📖 旁白客观叙事</span>
                  </button>
                </div>

                {/* AI Auto-write button (續寫) */}
                <button
                  disabled={isGenerating}
                  onClick={() => handleSendMessage(undefined, true)}
                  className="px-3 py-1 rounded bg-slate-50 hover:bg-slate-100 text-indigo-600 font-bold text-[10px] border border-slate-200 transition-all flex items-center gap-1 shadow-sm"
                >
                  <Sparkles className="w-3 h-3 text-indigo-500" />
                  <span>AI 自动续写一幕</span>
                </button>
              </div>

              {/* Chat Input Field form */}
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    inputNarration 
                      ? "输入旁白、客观场景、描述，渲染故事场景环境..." 
                      : activeStory.mode === "director" 
                        ? "发出简短指令控制后续走向 (例: [突降暴雨，我们躲在桥下])" 
                        : "输入角色发言，继续对话剧情..."
                  }
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isGenerating || (!inputText.trim() && !isGenerating)}
                  className="w-8 h-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center transition-colors shadow-md disabled:opacity-50 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= STORY CREATION DIALOG / MODAL ================= */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-150 rounded-2xl w-full max-w-sm p-5 text-slate-800 space-y-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                  <span>新建线下剧本故事</span>
                </h3>
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  取消
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                {/* Title input */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">故事名称 (选填)</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="例如: 废土末日平行线 / 暴雨中的午后 / 导演控制篇..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Mode Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">剧本模式设定</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "director", label: "导演导演", desc: "指令驱动" },
                      { id: "continue", label: "续写续写", desc: "顺应逻辑" },
                      { id: "if", label: "IF线", desc: "设定颠覆" }
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setNewMode(m.id as any)}
                        className={`p-2.5 rounded-xl border flex flex-col items-center text-center transition-all ${
                          newMode === m.id 
                            ? "bg-indigo-50 border-indigo-500 text-indigo-600 font-bold" 
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        <span className="font-bold text-[11px]">{m.label}</span>
                        <span className="text-[8px] text-slate-400 mt-0.5">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* IF premise prompt field */}
                {newMode === "if" && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">假想平行宇宙设定</label>
                    <textarea
                      value={newIfPrompt}
                      onChange={(e) => setNewIfPrompt(e.target.value)}
                      placeholder="例：如果我们在一个赛博朋克霓虹街头第一次相遇，你是一个身负重伤的骇客，而我是一个义体医生..."
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                {/* Import history switch */}
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[11px] font-bold text-slate-700 block">引用线上聊天切入故事</span>
                    <span className="text-[8px] text-slate-400">自动同步该角色最后的 15 条聊天历史作为上下文</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={newStartFromChat}
                    onChange={(e) => setNewStartFromChat(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 bg-slate-50 cursor-pointer"
                  />
                </div>
              </div>

              <button
                onClick={handleCreateStory}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors shadow-md"
              >
                开启剧本空间
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
