import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Character, MemoryItem, MemoryVaultSettings, ImmediateSummaryTask } from "../types";
import { resolveCanonicalCharacterId } from "../domain/character/characterIdentity";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";
import { 
  ArrowLeft, 
  ChevronLeft,
  Search, 
  Plus, 
  Trash2, 
  Edit3, 
  Database, 
  Sparkles,
  Check,
  Brain,
  Clock,
  User,
  Sliders,
  X,
  MoreVertical,
  Loader2
} from "lucide-react";

interface AppMemoryProps {
  characters: Character[];
  relationships: CharacterRelationship[];
  memories: MemoryItem[];
  onSaveMemories: (updated: MemoryItem[]) => void;
  recallSettings: MemoryVaultSettings;
  onSaveRecallSettings: (updated: MemoryVaultSettings) => void;
  onUpdateCharacter?: (char: Character) => void;
  immediateSummaryTask?: ImmediateSummaryTask;
  onStartImmediateSummary?: (characterId: string, rounds: number, relationId?: string, conversationId?: string) => Promise<void>;
  onResetImmediateSummary?: () => void;
  onClose: () => void;
  selectedModel?: string;
  apiEndpoint?: string;
}
export default function AppMemory({
  characters,
  relationships,
  memories,
  onSaveMemories,
  recallSettings,
  onSaveRecallSettings,
  onUpdateCharacter,
  immediateSummaryTask,
  onStartImmediateSummary,
  onResetImmediateSummary,
  onClose,
  selectedModel = "gemini-3.5-flash",
  apiEndpoint = ""
}: AppMemoryProps) {
  const displayCharacters = characters.filter((character) => !character.isGroupChat && !character.isContactInstance);
  const normalizeCharacterId = (characterId: string) => resolveCanonicalCharacterId(characterId, characters);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("all");
  const [selectedRelationId, setSelectedRelationId] = useState<string>("all");
  
  // Modals / Dialog States
  const [showMenu, setShowMenu] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<MemoryItem | null>(null);
  const [showApiPoolModal, setShowApiPoolModal] = useState(false);
  const [showRecallModal, setShowRecallModal] = useState(false);

  // States for automatic summary settings
  const [selectedCharForAutoSummary, setSelectedCharForAutoSummary] = useState<string>("");
  const [modalEnableAutoSummary, setModalEnableAutoSummary] = useState<boolean>(false);
  const [modalSummaryTriggerRound, setModalSummaryTriggerRound] = useState<number>(15);
  const [modalArchiveTemplateType, setModalArchiveTemplateType] = useState<"refined" | "delicate">("refined");

  const handleSelectCharForAutoSummary = (charId: string) => {
    const canonicalCharacterId = normalizeCharacterId(charId);
    setSelectedCharForAutoSummary(canonicalCharacterId);
    const char = displayCharacters.find(c => c.id === canonicalCharacterId);
    if (char) {
      setModalEnableAutoSummary(char.enableAutoSummary === true); // Default to false
      setModalSummaryTriggerRound(char.summaryTriggerRound || 15); // Default to 15
      setModalArchiveTemplateType(char.archiveTemplateType || "refined");
    }
  };

  const openAutoSummaryModal = () => {
    const firstChar = displayCharacters[0];
    if (firstChar) {
      setSelectedCharForAutoSummary(firstChar.id);
      setModalEnableAutoSummary(firstChar.enableAutoSummary === true);
      setModalSummaryTriggerRound(firstChar.summaryTriggerRound || 15);
      setModalArchiveTemplateType(firstChar.archiveTemplateType || "refined");
    } else {
      setSelectedCharForAutoSummary("");
      setModalEnableAutoSummary(false);
      setModalSummaryTriggerRound(15);
      setModalArchiveTemplateType("refined");
    }
    setShowRecallModal(true);
    setShowMenu(false);
  };

  // Immediate Summary States
  const [showImmediateModal, setShowImmediateModal] = useState(false);
  const [immediateCharId, setImmediateCharId] = useState<string>("");
  const [immediateRelationId, setImmediateRelationId] = useState<string>("");
  const [immediateRounds, setImmediateRounds] = useState<number>(15);

  const openImmediateSummaryModal = () => {
    const firstChar = displayCharacters[0];
    if (firstChar) {
      setImmediateCharId(firstChar.id);
    } else {
      setImmediateCharId("");
    }
    setImmediateRounds(15);
    setShowImmediateModal(true);
    setShowMenu(false);
  };

  // Manual Add Form States
  const [newCharId, setNewCharId] = useState("");
  const [newRelationId, setNewRelationId] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newImportance, setNewImportance] = useState(5);

  // Delete Confirmation State
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Inline edit state
  const [editContent, setEditContent] = useState("");

  // Filter memories
  const normalizedMemories = memories.map((item) => {
    const characterId = normalizeCharacterId(item.characterId);
    return characterId === item.characterId ? item : { ...item, characterId };
  });
  const selectedCharacterRelations = Array.from(new Map(
    relationships
      .filter((relation) => relation.characterId === normalizeCharacterId(selectedCharacterId))
      .map((relation) => [`${relation.userIdentityId}\u0000${relation.characterId}`, relation]),
  ).values());

  const filteredMemories = normalizedMemories.filter(item => {
    const matchesChar = selectedCharacterId === "all" || item.characterId === normalizeCharacterId(selectedCharacterId);
    const matchesSearch = searchQuery.trim() === "" || item.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRelation = selectedRelationId === "all" || item.relationId === selectedRelationId;
    return matchesChar && matchesRelation && matchesSearch;
  });

  // Handle Add Memory
  const handleAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCharId || !newRelationId || !newContent.trim()) {
      alert("请选择角色并输入记忆内容！");
      return;
    }

    const newItem: MemoryItem = {
      id: Date.now().toString(),
      characterId: normalizeCharacterId(newCharId),
      relationId: newRelationId,
      content: newContent.trim(),
      timestamp: Date.now(),
      importance: newImportance,
      isManual: true
    };

    onSaveMemories([newItem, ...normalizedMemories]);
    setIsAddingItem(false);
    setNewCharId("");
    setNewRelationId("");
    setNewContent("");
    setNewImportance(5);
  };

  // Handle Delete Memory
  const handleDeleteMemory = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDeleteMemory = () => {
    if (deleteConfirmId) {
      onSaveMemories(memories.filter(item => item.id !== deleteConfirmId));
      setDeleteConfirmId(null);
    }
  };

  // Handle Edit Memory
  const handleStartEdit = (item: MemoryItem) => {
    setEditingItem(item);
    setEditContent(item.content);
  };

  const handleSaveEdit = () => {
    if (!editingItem || !editContent.trim()) return;

    const updated = memories.map(item => {
      if (item.id === editingItem.id) {
        return {
          ...item,
          content: editContent.trim(),
          timestamp: Date.now() // Update timestamp to reflect edit time
        };
      }
      return item;
    });

    onSaveMemories(updated);
    setEditingItem(null);
    setEditContent("");
  };

  // Helper: Format relative time
  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return new Date(ts).toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div data-theme-page="memory" className="w-full h-full bg-[var(--app-bg)] text-[var(--text-primary)] flex flex-col font-sans select-none relative overflow-hidden">
      {/* Upper Navigation Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-transparent z-10 shrink-0 relative">
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
        >
          <ChevronLeft className="w-4 h-4 text-slate-700" />
        </button>
        
        <h1 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">
          <span>记忆库</span>
        </h1>
        <div className="relative z-20">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0"
          >
            <MoreVertical className="w-4 h-4 text-slate-700" />
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {showMenu && (
              <>
                {/* Backdrop overlay for closing */}
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setShowMenu(false)} 
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 mt-2 w-40 bg-white border border-slate-100 rounded-[12px] shadow-xl z-40 py-1.5 overflow-hidden"
                >
                  <button
                    onClick={() => {
                      setIsAddingItem(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors border-b border-slate-100"
                  >
                    <Plus className="w-3.5 h-3.5 text-neutral-800" />
                    手动添加
                  </button>
                  <button
                    onClick={openAutoSummaryModal}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors border-b border-slate-100"
                  >
                    <Sliders className="w-3.5 h-3.5 text-neutral-800" />
                    自动总结
                  </button>
                  <button
                    onClick={openImmediateSummaryModal}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-neutral-800" />
                    立即总结
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Immediate Summary Task Background Status Banner */}
        {immediateSummaryTask && immediateSummaryTask.status === "summarizing" && (
          <div 
            onClick={openImmediateSummaryModal}
            className="bg-neutral-900 text-white px-4 py-3 rounded-2xl flex items-center justify-between shadow-lg cursor-pointer hover:bg-neutral-850 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Loader2 className="w-4 h-4 animate-spin text-neutral-300 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">
                  正在为 {displayCharacters.find(c => c.id === normalizeCharacterId(immediateSummaryTask.characterId))?.name || "角色"} 提炼记忆...
                </p>
                <p className="text-[10px] text-slate-400">已选取最近 {immediateSummaryTask.rounds} 轮对话</p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-[10px] font-bold rounded-lg transition-colors shrink-0">
              查看进度
            </span>
          </div>
        )}

        {immediateSummaryTask && immediateSummaryTask.status === "completed" && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm gap-3 animate-fade-in">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">记忆提炼完成！</p>
                <p className="text-[10px] text-emerald-600">
                  成功为 {displayCharacters.find(c => c.id === normalizeCharacterId(immediateSummaryTask.characterId))?.name || "角色"} 提炼了 {immediateSummaryTask.extractedCount} 条新记忆
                </p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onResetImmediateSummary) onResetImmediateSummary();
              }}
              className="text-emerald-400 hover:text-emerald-600 p-1 shrink-0 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {immediateSummaryTask && immediateSummaryTask.status === "error" && (
          <div className="bg-rose-50 border border-rose-100 text-rose-800 px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-rose-500 text-sm shrink-0 font-bold">⚠️</span>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">记忆提炼失败</p>
                <p className="text-[10px] text-rose-500 leading-tight truncate">{immediateSummaryTask.error}</p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onResetImmediateSummary) onResetImmediateSummary();
              }}
              className="text-rose-400 hover:text-rose-600 p-1 shrink-0 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Filter and Search Row */}
        <div className="space-y-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索记忆条目..."
              className="w-full bg-white pl-10 pr-4 py-2.5 text-xs text-slate-700 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950/10 focus:border-neutral-950 transition-all font-medium placeholder-slate-400 shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Character Filtering Scroller */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar select-none">
            <button
              onClick={() => setSelectedCharacterId("all")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
                selectedCharacterId === "all"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <User className="w-3.5 h-3.5" />
              全部角色
            </button>
            {displayCharacters.map((char) => (
              <button
                key={char.id}
                onClick={() => setSelectedCharacterId(char.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 ${
                  selectedCharacterId === char.id
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                <img
                  src={char.avatar}
                  alt={char.name}
                  className="w-4 h-4 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
                {char.name}
              </button>
            ))}
          </div>
          {selectedCharacterId !== "all" && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button onClick={() => setSelectedRelationId("all")} className={`px-3 py-1 rounded-full text-[10px] font-bold shrink-0 ${selectedRelationId === "all" ? "bg-slate-700 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>全部关系</button>
              {selectedCharacterRelations.map((relation) => (
                <button key={relation.id} onClick={() => setSelectedRelationId(relation.id)} className={`px-3 py-1 rounded-full text-[10px] font-bold shrink-0 ${selectedRelationId === relation.id ? "bg-slate-700 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
                  {relation.userIdentityId}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Memories List */}
        <div className="space-y-3">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1.5">
            记忆条目 ({filteredMemories.length})
          </h2>

          <AnimatePresence mode="popLayout">
            {filteredMemories.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-white rounded-3xl p-8 border border-slate-100 text-center space-y-3 shadow-sm"
              >
                <Brain className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-700">暂无符合条件的记忆</p>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                    您可以点击上方按钮手动添加一条，或者在和角色聊天时自动生成，AI 会把精彩瞬间拆成独立记忆点噢。
                  </p>
                </div>
              </motion.div>
            ) : (
              filteredMemories.map((item) => {
                const char = displayCharacters.find(c => c.id === item.characterId);
                const isEditing = editingItem?.id === item.id;

                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white rounded-[24px] p-4 border border-slate-100/80 shadow-sm flex gap-3.5 relative hover:shadow-md transition-shadow"
                  >
                    {/* Character Avatar */}
                    <div className="shrink-0">
                      <img
                        src={char?.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop"}
                        alt={char?.name || "未知角色"}
                        className="w-10 h-10 rounded-full object-cover border border-slate-100"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* Content Section */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-800">
                          {char?.name || "未知角色"}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold font-mono">
                          <Clock className="w-3 h-3 text-slate-300" />
                          {formatTime(item.timestamp)}
                        </div>
                      </div>

                      {/* Editing View */}
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={2}
                            className="w-full bg-slate-50 p-2 text-xs text-slate-700 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 resize-none leading-relaxed font-medium"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingItem(null)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg text-[10px] transition-all"
                            >
                              取消
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              className="px-2.5 py-1 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-lg text-[10px] transition-all flex items-center gap-0.5"
                            >
                              <Check className="w-3 h-3" />
                              保存
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Read-only view */
                        <div>
                          <p className="text-xs text-slate-600 leading-relaxed font-medium break-all whitespace-pre-wrap">
                            {item.content}
                          </p>
                          <div className="flex items-center justify-between pt-2">
                            {/* Manual tag */}
                            {item.isManual ? (
                              <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-full">
                                手动录入
                              </span>
                            ) : (
                              <span className="text-[9px] bg-neutral-100 text-neutral-700 font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5 text-neutral-800" />
                                自动提取
                              </span>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleStartEdit(item)}
                                className="text-slate-400 hover:text-neutral-950 p-1 rounded-lg hover:bg-slate-50 transition-all"
                                title="编辑记忆"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteMemory(item.id)}
                                className="text-slate-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-all"
                                title="删除记忆"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* MODAL: Hand Add Memory */}
      <AnimatePresence>
        {isAddingItem && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[28px] p-5 w-full max-w-sm shadow-2xl border border-slate-100 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-neutral-800" />
                  手动录入角色记忆
                </h3>
                <button
                  onClick={() => setIsAddingItem(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddMemory} className="space-y-4">
                {/* Select Character */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    对应角色
                  </label>
                  <select
                    value={newCharId}
                    onChange={(e) => { setNewCharId(e.target.value); setNewRelationId(""); }}
                    required
                    className="w-full bg-slate-50 p-2.5 text-xs text-slate-700 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950"
                  >
                    <option value="">-- 请选择关联角色 --</option>
                    {displayCharacters.map((char) => (
                      <option key={char.id} value={char.id}>
                        {char.name}
                      </option>
                    ))}
                  </select>
                  <select value={newRelationId} onChange={(e) => setNewRelationId(e.target.value)} disabled={!newCharId} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs">
                    <option value="">选择关系身份</option>
                    {relationships.filter((relation) => relation.characterId === normalizeCharacterId(newCharId)).map((relation) => (
                      <option key={relation.id} value={relation.id}>{relation.userIdentityId}</option>
                    ))}
                  </select>
                </div>

                {/* Content */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    记忆内容
                  </label>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    required
                    rows={3}
                    placeholder="请输入简短、精炼的事实性记忆，例如：“用户在考试前对陆沉砚说想吃抹茶冰淇淋，陆沉砚承诺考试通过后就带其去买。”"
                    className="w-full bg-slate-50 p-2.5 text-xs text-slate-700 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 resize-none font-medium leading-relaxed"
                  />
                </div>

                {/* Importance Slider (Optional) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      重要程度
                    </label>
                    <span className="text-[10px] text-neutral-800 font-bold font-mono">
                      {newImportance} / 10
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={newImportance}
                    onChange={(e) => setNewImportance(parseInt(e.target.value))}
                    className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingItem(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-xl text-xs transition-colors shadow-sm shadow-slate-100"
                  >
                    添加记忆
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Extract API Pool (抽取 API 池) */}
      <AnimatePresence>
        {showApiPoolModal && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[24px] p-5 w-full max-w-sm shadow-2xl border border-slate-100 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-neutral-800" />
                  抽取 API 池设置
                </h3>
                <button
                  onClick={() => setShowApiPoolModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5">
                <div className="text-xs text-slate-500 leading-relaxed space-y-1">
                  <p className="font-bold text-slate-700">什么是「抽取 API 池」？</p>
                  <p>抽取 API 是专用于提取/提炼记忆的核心模型配置。在这里设置单独的模型可以最大程度提升提炼的精确度，同时与聊天模型独立开，避免干扰。</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    记忆抽取专用模型
                  </label>
                  <select
                    value={recallSettings.extractModel || "gemini-3.5-flash"}
                    onChange={(e) => onSaveRecallSettings({ ...recallSettings, extractModel: e.target.value })}
                    className="w-full bg-slate-50 p-2.5 text-xs text-slate-700 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950"
                  >
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash (推荐：快速低开销)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="deepseek-v4-flash">DeepSeek V4 (如果配置中转端)</option>
                    <option value="default-chat-model">跟随“设置”中配置的默认模型</option>
                  </select>
                </div>

                <div className="bg-amber-50 p-3 rounded-[16px] border border-amber-100 text-[11px] text-amber-700 font-medium leading-relaxed flex gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                  <span>
                    💡 提示：记忆库在执行提炼时，会默认调用这里配置的模型。如果想要更稳定的提炼格式，推荐使用默认配置好的 <strong>Gemini 3.5 Flash</strong> 模型。
                  </span>
                </div>

                <button
                  onClick={() => setShowApiPoolModal(false)}
                  className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-[16px] text-xs transition-colors shadow-sm"
                >
                  确定并应用
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Auto Summary Settings (自动总结) */}
      <AnimatePresence>
        {showRecallModal && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[24px] p-5 w-full max-w-sm shadow-2xl border border-slate-100 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-neutral-800" />
                  自动总结参数配置
                </h3>
                <button
                  onClick={() => setShowRecallModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {displayCharacters.length === 0 ? (
                <div className="text-xs text-slate-400 py-6 text-center font-medium">
                  暂无关联角色，请先创建角色。
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Select Character */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      选择人物
                    </label>
                    <select
                      value={selectedCharForAutoSummary}
                      onChange={(e) => handleSelectCharForAutoSummary(e.target.value)}
                      className="w-full bg-slate-50 p-2.5 text-xs text-slate-700 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 font-bold"
                    >
                      {displayCharacters.map((char) => (
                        <option key={char.id} value={char.id}>
                          {char.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Auto Extract Toggle */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3.5">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-800 block">
                        开启自动总结开关
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        开启后系统将在触发轮数自动总结对话记忆
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={modalEnableAutoSummary}
                        onChange={(e) => setModalEnableAutoSummary(e.target.checked)}
                        className="rounded border-slate-300 text-neutral-950 focus:ring-neutral-950 w-4 h-4"
                      />
                    </label>
                  </div>

                  {/* Trigger Interval Slider */}
                  {modalEnableAutoSummary && (
                    <div className="space-y-1.5 border-t border-slate-100 pt-3.5">
                      <div className="flex justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          自动总结触发间隔
                        </label>
                        <span className="text-[11px] text-neutral-800 font-black font-mono">
                          {modalSummaryTriggerRound} 轮对话
                        </span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="50"
                        value={modalSummaryTriggerRound}
                        onChange={(e) => setModalSummaryTriggerRound(parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                      />
                      <p className="text-[10px] text-slate-400 leading-snug">
                        范围为 10 至 50 轮。触发后，系统会自动提炼该段对话，提炼为精致的记忆点存储在记忆库中。
                      </p>
                    </div>
                  )}

                  {/* Template Type Choice */}
                  <div className="space-y-2 border-t border-slate-100 pt-3.5">
                    <span className="text-xs font-bold text-slate-800 block">长期归档精炼记忆模板</span>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setModalArchiveTemplateType("refined")}
                        className={`flex flex-col items-start p-3 rounded-[16px] border text-left transition-all ${
                          modalArchiveTemplateType === "refined"
                            ? "border-neutral-950 bg-neutral-950 text-white shadow-sm font-bold"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="text-xs font-bold">精炼版 (低Token)</span>
                        <span className={`text-[10px] mt-0.5 block ${modalArchiveTemplateType === "refined" ? "text-slate-300" : "text-slate-400"}`}>
                          生成条理清晰的客观事件日志
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalArchiveTemplateType("delicate")}
                        className={`flex flex-col items-start p-3 rounded-[16px] border text-left transition-all ${
                          modalArchiveTemplateType === "delicate"
                            ? "border-neutral-950 bg-neutral-950 text-white shadow-sm font-bold"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="text-xs font-bold">细腻版 (重情感)</span>
                        <span className={`text-[10px] mt-0.5 block ${modalArchiveTemplateType === "delicate" ? "text-slate-300" : "text-slate-400"}`}>
                          提炼第一人称的心境角色日记
                        </span>
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const char = displayCharacters.find(c => c.id === normalizeCharacterId(selectedCharForAutoSummary));
                      if (char && onUpdateCharacter) {
                        onUpdateCharacter({
                          ...char,
                          enableAutoSummary: modalEnableAutoSummary,
                          summaryTriggerRound: modalSummaryTriggerRound,
                          archiveTemplateType: modalArchiveTemplateType,
                        });
                      }
                      setShowRecallModal(false);
                    }}
                    className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-[16px] text-xs transition-colors shadow-sm"
                  >
                    保存设置
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Immediate Summary (立即总结) */}
      <AnimatePresence>
        {showImmediateModal && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4 max-h-[90%] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-neutral-800" />
                  立即总结对话记忆
                </h3>
                <button
                  onClick={() => setShowImmediateModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body depending on immediateSummaryTask status */}
              {immediateSummaryTask && immediateSummaryTask.status === "summarizing" ? (
                <div className="py-6 flex flex-col items-center justify-center text-center gap-3">
                  <Loader2 className="w-8 h-8 text-neutral-800 animate-spin" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">正在提炼记忆中...</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      正在深入分析与 <span className="font-semibold text-slate-700">{displayCharacters.find(c => c.id === normalizeCharacterId(immediateSummaryTask.characterId))?.name}</span> 的对话记录
                    </p>
                  </div>
                  <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-2">
                    <motion.div 
                      className="bg-neutral-900 h-full w-full origin-left"
                      animate={{ scaleX: [0, 0.5, 0.8, 0.9, 0.95] }}
                      transition={{ duration: 15, ease: "easeOut" }}
                    />
                  </div>
                  <button
                    onClick={() => setShowImmediateModal(false)}
                    className="mt-4 px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                  >
                    后台静默运行
                  </button>
                </div>
              ) : immediateSummaryTask && immediateSummaryTask.status === "completed" ? (
                <div className="py-6 flex flex-col items-center justify-center text-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 text-xl font-bold animate-bounce">
                    <Check className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">总结提炼完成！</h4>
                    <p className="text-xs text-emerald-600 mt-1">
                      成功为 <span className="font-semibold text-slate-700">{displayCharacters.find(c => c.id === normalizeCharacterId(immediateSummaryTask.characterId))?.name}</span> 提炼了 <span className="font-bold">{immediateSummaryTask.extractedCount}</span> 条新记忆。
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (onResetImmediateSummary) onResetImmediateSummary();
                      setShowImmediateModal(false);
                    }}
                    className="mt-4 w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white font-bold text-xs rounded-xl transition-colors"
                  >
                    太棒了，完成！
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayCharacters.length === 0 ? (
                    <div className="text-xs text-slate-400 py-6 text-center font-medium">
                      暂无可用角色，无法进行总结。
                    </div>
                  ) : (
                    <>
                      {/* Select Character */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          选择人物
                        </label>
                        <select
                          value={immediateCharId}
                          onChange={(e) => setImmediateCharId(e.target.value)}
                          className="w-full bg-slate-50 p-2.5 text-xs text-slate-700 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 font-bold"
                        >
                          {displayCharacters.map((char) => (
                            <option key={char.id} value={char.id}>
                              {char.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">关系身份</label>
                        <select
                          value={immediateRelationId}
                          onChange={(e) => setImmediateRelationId(e.target.value)}
                          className="w-full bg-slate-50 p-2.5 text-xs text-slate-700 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 font-bold"
                        >
                          <option value="">选择关系（旧数据兼容）</option>
                          {relationships.filter((relation) => relation.characterId === normalizeCharacterId(immediateCharId)).map((relation) => (
                            <option key={relation.id} value={relation.id}>{relation.userIdentityId}</option>
                          ))}
                        </select>
                      </div>

                      {/* Manual Interval Round count */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                            设定总结对话轮数
                          </label>
                          <span className="text-[11px] text-neutral-800 font-black font-mono">
                            最近 {immediateRounds} 轮对话
                          </span>
                        </div>
                        <input
                          type="range"
                          min="5"
                          max="50"
                          value={immediateRounds}
                          onChange={(e) => setImmediateRounds(parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                        />
                        <p className="text-[10px] text-slate-400 leading-snug">
                          可设定 5 到 50 轮。系统将立刻回顾并精简这段聊天，提取出的记忆会自动加入到上面的记忆库中。
                        </p>
                      </div>

                      {/* Error message show if last run was error for this character */}
                      {immediateSummaryTask && immediateSummaryTask.status === "error" && (
                        <div className="p-2.5 bg-rose-50 border border-rose-100 text-rose-800 text-[10px] font-medium rounded-xl leading-relaxed">
                          ⚠️ 失败: {immediateSummaryTask.error}
                        </div>
                      )}

                      {/* Buttons */}
                      <div className="flex gap-2.5 pt-2">
                        <button
                          onClick={() => setShowImmediateModal(false)}
                          className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                        >
                          取消
                        </button>
                        <button
                          onClick={async () => {
                            if (onStartImmediateSummary && immediateCharId) {
                              const relation = relationships.find((item) => item.id === immediateRelationId);
                              await onStartImmediateSummary(immediateCharId, immediateRounds, relation?.id, relation?.conversationId);
                            }
                          }}
                          className="flex-1 py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                        >
                          确认立即总结
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Delete Confirmation */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-xs p-5 shadow-2xl flex flex-col gap-4 text-center border border-slate-100"
            >
              <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 text-xl font-bold mx-auto">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">确认删除记忆</h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  确定要删除这条记忆条目吗？删除后 AI 将不再能召回此记忆。
                </p>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteMemory}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
