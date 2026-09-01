import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Character, MemoryItem, MemoryVaultSettings, ImmediateSummaryTask } from "../types";
import { resolveCanonicalCharacterId } from "../domain/character/characterIdentity";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";
import { append as appendKnowledgeClaim, appendMany as appendKnowledgeClaims, loadKnowledgeClaims, retract as retractKnowledgeClaim, saveKnowledgeClaims, supersede as supersedeKnowledgeClaim } from "../core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries, saveConversationSummaries } from "../core/storage/repositories/conversationSummaryRepository";
import { loadBehaviorCorrections, saveBehaviorCorrections } from "../core/storage/repositories/behaviorCorrectionRepository";
import type { BehaviorCorrectionRecord, ConversationSummaryRecord, KnowledgeClaim } from "../domain/characterKnowledge/characterKnowledgeTypes";
import { createManualKnowledgeClaim } from "../features/characterKnowledge/services/manualKnowledgeService";
import { getMemoryDisplayContent } from "../domain/memory/offlineMemorySync";
import { commitMemoryWriteBundle } from "../domain/memory/memoryWriteCoordinator";
import { rankRelevantMemories } from "../domain/memory/MemoryRetriever";
import { 
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
  Loader2,
  Download,
  Upload,
  PauseCircle,
  RotateCcw,
  Info
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
  openDiagnosticsRequestId?: number;
}

const DEFAULT_AUTO_SUMMARY_ROUNDS = 50;
const normalizeAutoSummaryRounds = (value: number | undefined): number =>
  Number.isFinite(value)
    ? Math.min(100, Math.max(10, Math.round(value as number)))
    : DEFAULT_AUTO_SUMMARY_ROUNDS;

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
  apiEndpoint = "",
  openDiagnosticsRequestId = 0,
}: AppMemoryProps) {
  const displayCharacters = characters.filter((character) => !character.isGroupChat && !character.isContactInstance);
  const normalizeCharacterId = (characterId: string) => resolveCanonicalCharacterId(characterId, characters);
  const toTruthScope = (relation: CharacterRelationship) => ({
    relationId: relation.id,
    characterId: relation.characterId,
    userIdentityId: relation.userIdentityId,
    conversationId: relation.conversationId,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("all");
  const [selectedRelationId, setSelectedRelationId] = useState<string>("all");
  
  // Modals / Dialog States
  const [showMenu, setShowMenu] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<MemoryItem | null>(null);
  const [showApiPoolModal, setShowApiPoolModal] = useState(false);
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const restoreBackupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (openDiagnosticsRequestId > 0) setShowDiagnosticsModal(true);
  }, [openDiagnosticsRequestId]);

  // States for automatic summary settings
  const [selectedCharForAutoSummary, setSelectedCharForAutoSummary] = useState<string>("");
  const [modalSummaryTriggerRound, setModalSummaryTriggerRound] = useState<number>(DEFAULT_AUTO_SUMMARY_ROUNDS);
  const [modalArchiveTemplateType, setModalArchiveTemplateType] = useState<"refined" | "delicate">("refined");

  const handleSelectCharForAutoSummary = (charId: string) => {
    const canonicalCharacterId = normalizeCharacterId(charId);
    setSelectedCharForAutoSummary(canonicalCharacterId);
    const char = displayCharacters.find(c => c.id === canonicalCharacterId);
    if (char) {
      setModalSummaryTriggerRound(normalizeAutoSummaryRounds(char.summaryTriggerRound));
      setModalArchiveTemplateType(char.archiveTemplateType || "refined");
    }
  };

  const openAutoSummaryModal = () => {
    const firstChar = displayCharacters[0];
    if (firstChar) {
      setSelectedCharForAutoSummary(firstChar.id);
      setModalSummaryTriggerRound(normalizeAutoSummaryRounds(firstChar.summaryTriggerRound));
      setModalArchiveTemplateType(firstChar.archiveTemplateType || "refined");
    } else {
      setSelectedCharForAutoSummary("");
      setModalSummaryTriggerRound(DEFAULT_AUTO_SUMMARY_ROUNDS);
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

  const knowledgeClaims = loadKnowledgeClaims().value;
  const conversationSummaries = loadConversationSummaries().value;
  const behaviorCorrections = loadBehaviorCorrections().value;
  const getClaimForMemory = (item: MemoryItem): KnowledgeClaim | undefined =>
    item.sourceKnowledgeClaimIds?.map((claimId) => knowledgeClaims.find((claim) => claim.id === claimId)).find(Boolean);
  const getRelationLabel = (relationId?: string): string => {
    if (!relationId) return "未绑定关系";
    const relation = relationships.find((item) => item.id === relationId);
    const character = relation ? displayCharacters.find((item) => item.id === normalizeCharacterId(relation.characterId)) : undefined;
    return character ? `${character.name} · ${relation?.relationship || "关系"}` : relationId;
  };
  const getSourceAppLabel = (item: MemoryItem, claim?: KnowledgeClaim): string => {
    const app = claim?.source.app
      || (item.sourceMomentId ? "moments" : item.sourceReadingRoomId ? "reading" : item.sourceCinemaId ? "cinema" : "memory");
    return ({ chat: "聊天", moments: "朋友圈", notes: "备忘录", diary: "日记", cinema: "影视", schedule: "日程", relationship: "关系网", music: "音乐", reading: "阅读", offline: "线下剧本", memory: "记忆库", forum: "社区", system: "系统", legacy: "旧数据" } as Record<string, string>)[app] || app;
  };
  const getMemoryDiagnostic = (item: MemoryItem) => {
    const claim = getClaimForMemory(item);
    const relationId = item.relationId;
    const ranked = rankRelevantMemories([item], item.characterId, searchQuery, {
      relationId,
      excludeCanonicalMirrors: false,
    })[0];
    const isPaused = Boolean(item.recallDisabled || claim?.recallDisabled);
    const status = isPaused ? "已暂停" : claim?.supersededById ? "已替代" : "启用";
    const reason = isPaused
      ? "已手动暂停，不会参与聊天检索；记录仍保留。"
      : claim?.supersededById
        ? `已被新记录替代：${claim.supersededById}`
        : searchQuery.trim()
          ? ranked ? `当前查询可命中，综合权重 ${ranked.score.toFixed(2)}` : "当前查询未命中"
          : "未输入查询；记录可按语义、关键词和权重参与检索。";
    return {
      item,
      claim,
      status,
      reason,
      score: ranked?.score,
      app: getSourceAppLabel(item, claim),
      scene: getRelationLabel(relationId),
      weight: `${item.importance ?? claim?.importance ?? 5}/10 · 置信度 ${Math.round((claim?.confidence ?? (item.isManual ? 0.95 : 0.5)) * 100)}%`,
      original: claim?.source.messageIds?.length
        ? `原始消息 ${claim.source.messageIds.length} 条`
        : claim?.source.sourceRecordId || item.sourceMomentId || item.sourceCinemaId || item.sourceReadingCommentId || "暂无直接消息链接",
    };
  };
  const diagnosticItems = filteredMemories.slice(0, 20).map(getMemoryDiagnostic);
  const selectedDiagnosticClaims = knowledgeClaims.filter((claim) => {
    const characterMatch = selectedCharacterId === "all" || claim.characterId === normalizeCharacterId(selectedCharacterId);
    const relationMatch = selectedRelationId === "all" || claim.relationId === selectedRelationId;
    return characterMatch && relationMatch;
  });

  const toggleMemoryRecall = (item: MemoryItem) => {
    const nextDisabled = !item.recallDisabled;
    const claimIds = new Set(item.sourceKnowledgeClaimIds || []);
    if (claimIds.size > 0) {
      const nextClaims = knowledgeClaims.map((claim) => claimIds.has(claim.id) ? { ...claim, recallDisabled: nextDisabled } : claim);
      const claimWrite = saveKnowledgeClaims(nextClaims);
      if (!claimWrite.success) {
        alert("记忆状态保存失败，未改变召回状态。");
        return;
      }
    }
    onSaveMemories(memories.map((candidate) => candidate.id === item.id ? { ...candidate, recallDisabled: nextDisabled } : candidate));
  };

  const downloadMemoryBackup = () => {
    const payload = {
      format: "fanfanji-memory-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      memories,
      claims: knowledgeClaims,
      summaries: conversationSummaries,
      corrections: behaviorCorrections,
      recallSettings,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fanfanji-memory-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setShowMenu(false);
  };

  const restoreMemoryBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<{
        format: string;
        version: number;
        memories: MemoryItem[];
        claims: KnowledgeClaim[];
        summaries: ConversationSummaryRecord[];
        corrections: BehaviorCorrectionRecord[];
        recallSettings: MemoryVaultSettings;
      }>;
      if (parsed.format !== "fanfanji-memory-backup" || parsed.version !== 1
        || !Array.isArray(parsed.memories) || !Array.isArray(parsed.claims)
        || !Array.isArray(parsed.summaries) || !Array.isArray(parsed.corrections)) {
        alert("不是可识别的米饭机记忆备份文件。");
        return;
      }
      if (!window.confirm("恢复记忆备份会替换当前记忆、Truth、摘要和修正记录。继续前请确认已有备份。")) return;
      const claimWrite = saveKnowledgeClaims(parsed.claims);
      const summaryWrite = saveConversationSummaries(parsed.summaries);
      const correctionWrite = saveBehaviorCorrections(parsed.corrections);
      if (!claimWrite.success || !summaryWrite.success || !correctionWrite.success) {
        alert("记忆备份恢复失败，原有页面数据未主动清空；请检查存储空间后重试。");
        return;
      }
      onSaveMemories(parsed.memories);
      if (parsed.recallSettings) onSaveRecallSettings(parsed.recallSettings);
      alert("记忆备份已恢复。页面中的记忆、摘要和 Truth 会在下一次读取时重新同步。");
    } catch {
      alert("记忆备份文件读取失败。");
    }
  };

  // Handle Add Memory
  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCharId || !newRelationId || !newContent.trim()) {
      alert("请选择角色并输入记忆内容！");
      return;
    }

    const relation = relationships.find((item) => item.id === newRelationId && item.characterId === normalizeCharacterId(newCharId));
    if (!relation) {
      alert("当前关系作用域无效，无法保存长期认知。");
      return;
    }
    const now = Date.now();
    const memoryId = now.toString();
    const claim = createManualKnowledgeClaim({
      id: `claim:manual:${memoryId}`,
      scope: toTruthScope(relation),
      statement: newContent.trim(),
      sourceRecordId: memoryId,
      recordedAt: now,
      sourceApp: "memory",
    });
    if (!claim) {
      alert("长期认知写入失败，未保存兼容记忆。");
      return;
    }
    const newItem: MemoryItem = {
      id: memoryId,
      characterId: relation.characterId,
      relationId: newRelationId,
      userIdentityId: relation.userIdentityId,
      conversationId: relation.conversationId,
      content: newContent.trim(),
      timestamp: now,
      importance: newImportance,
      isManual: true,
      sourceKnowledgeClaimIds: [claim.id],
    };

    const write = await commitMemoryWriteBundle({
      claims: [claim],
      memories: [newItem, ...normalizedMemories],
      appendClaims: appendKnowledgeClaims,
      saveMemories: (nextMemories) => {
        onSaveMemories([...nextMemories]);
        return true;
      },
    });
    if (!write.canonicalWritten || !write.memoriesWritten) {
      alert("长期认知写入失败，未保存兼容记忆。");
      return;
    }
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
      const memory = memories.find((item) => item.id === deleteConfirmId);
      const relation = memory?.relationId ? relationships.find((item) => item.id === memory.relationId && item.characterId === normalizeCharacterId(memory.characterId)) : undefined;
      if (memory?.sourceKnowledgeClaimIds?.length && relation) {
        const failed = memory.sourceKnowledgeClaimIds.some((claimId) =>
          !retractKnowledgeClaim(toTruthScope(relation), claimId, "compatibility_memory_deleted").success,
        );
        if (failed) {
          alert("长期认知撤回失败，未删除兼容记忆。");
          return;
        }
      }
      onSaveMemories(memories.filter(item => item.id !== deleteConfirmId));
      setDeleteConfirmId(null);
    }
  };

  // Handle Edit Memory
  const handleStartEdit = (item: MemoryItem) => {
    setEditingItem(item);
    setEditContent(item.content);
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editContent.trim()) return;

    const relation = editingItem.relationId
      ? relationships.find((item) => item.id === editingItem.relationId && item.characterId === normalizeCharacterId(editingItem.characterId))
      : undefined;
    if (!relation) {
      alert("当前关系作用域无效，无法修改长期认知。");
      return;
    }
    const now = Date.now();
    const replacement = createManualKnowledgeClaim({
      id: `claim:manual:${editingItem.id}:${now}`,
      scope: toTruthScope(relation),
      statement: editContent.trim(),
      sourceRecordId: editingItem.id,
      recordedAt: now,
      sourceApp: "memory",
    });
    if (!replacement) {
      alert("修改内容未通过长期认知审核。");
      return;
    }
    const previousClaimIds = editingItem.sourceKnowledgeClaimIds || [];
    const primaryClaimId = previousClaimIds[0];
    const updated = memories.map(item => {
      if (item.id === editingItem.id) {
        return {
          ...item,
          userIdentityId: relation.userIdentityId,
          conversationId: relation.conversationId,
          content: editContent.trim(),
          timestamp: now,
          isManual: true,
          sourceKnowledgeClaimIds: [replacement.id],
        };
      }
      return item;
    });

    const write = await commitMemoryWriteBundle({
      claims: [replacement],
      writeClaims: () => {
        const stored = primaryClaimId
          ? supersedeKnowledgeClaim(toTruthScope(relation), primaryClaimId, replacement).success
          : appendKnowledgeClaim(replacement).success;
        if (!stored) return false;
        previousClaimIds.slice(1).forEach((claimId) => {
          retractKnowledgeClaim(toTruthScope(relation), claimId, "compatibility_memory_manually_replaced");
        });
        return true;
      },
      memories: updated,
      saveMemories: (nextMemories) => {
        onSaveMemories([...nextMemories]);
        return true;
      },
    });
    if (!write.complete) {
      alert("长期认知修改失败，兼容记忆保持不变。");
      return;
    }
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
      <div className="flex items-center justify-between px-4 py-1.5 bg-transparent border-0 z-10 shrink-0 relative">
        <button
          onClick={onClose}
          className="app-nav-icon-button w-8 h-8 flex items-center justify-center rounded-none border-0 bg-transparent shadow-none transition-colors z-10 shrink-0"
        >
          <ChevronLeft className="w-4 h-4 text-slate-700" />
        </button>
        
        <h1 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">
          <span>记忆库</span>
        </h1>
        <div className="relative z-20">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="app-nav-icon-button w-8 h-8 flex items-center justify-center rounded-none border-0 bg-transparent shadow-none transition-colors shrink-0"
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
                  <button
                    onClick={() => { setShowDiagnosticsModal(true); setShowMenu(false); }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors border-t border-slate-100"
                  >
                    <Info className="w-3.5 h-3.5 text-neutral-800" />
                    管理诊断
                  </button>
                  <button
                    onClick={downloadMemoryBackup}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-neutral-800" />
                    导出记忆备份
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); restoreBackupRef.current?.click(); }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-neutral-800" />
                    恢复记忆备份
                  </button>
                  <input ref={restoreBackupRef} type="file" accept="application/json,.json" onChange={restoreMemoryBackup} className="hidden" />
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all shrink-0 ${
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all shrink-0 ${
                  selectedCharacterId === char.id
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                <img
                  src={char.avatar}
                  alt={char.name}
                  className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
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
                            rows={5}
                            className="w-full min-h-[132px] bg-slate-50 p-2.5 text-xs text-slate-700 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 resize-y leading-relaxed font-medium"
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
                            {getMemoryDisplayContent(item.content)}
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

      {/* MODAL: Memory diagnostics */}
      <AnimatePresence>
        {showDiagnosticsModal && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[24px] p-5 w-full max-w-md shadow-2xl border border-slate-100 flex max-h-[90%] flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-neutral-800" />
                    记忆管理诊断
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1">查看来源、召回理由、权重、替代关系和原始消息链接。</p>
                </div>
                <button onClick={() => setShowDiagnosticsModal(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full" aria-label="关闭管理诊断">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] text-slate-400">兼容记忆</p>
                    <p className="text-lg font-black text-slate-800">{filteredMemories.length}</p>
                    <p className="text-[9px] text-slate-400">当前筛选结果</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] text-slate-400">Truth / 摘要 / 修正</p>
                    <p className="text-lg font-black text-slate-800">{selectedDiagnosticClaims.length} / {conversationSummaries.length} / {behaviorCorrections.length}</p>
                    <p className="text-[9px] text-slate-400">符合当前角色的 Truth / 全局缓存 / 修正</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-amber-50/50 p-3 text-[10px] leading-relaxed text-slate-500">
                  当前关系：<strong className="text-slate-700">{selectedRelationId === "all" ? "全部关系" : getRelationLabel(selectedRelationId)}</strong>。
                  暂停只影响未来召回，不会删除原文、摘要、来源消息或档案；恢复后即可重新参与检索。
                </div>

                {diagnosticItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-400">
                    当前筛选下没有兼容记忆记录。
                  </div>
                ) : diagnosticItems.map(({ item, status, reason, app, scene, weight, original }) => (
                  <div key={item.id} className="rounded-xl border border-slate-100 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold leading-relaxed text-slate-700 break-all">{getMemoryDisplayContent(item.content)}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${status === "启用" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{status}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-slate-400">
                      <span>来源应用：<strong className="text-slate-600">{app}</strong></span>
                      <span>场景/关系：<strong className="text-slate-600">{scene}</strong></span>
                      <span>当前权重：<strong className="text-slate-600">{weight}</strong></span>
                      <span>替代状态：<strong className="text-slate-600">{status === "已替代" ? "存在新记录" : "未被替代"}</strong></span>
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-500">召回诊断：{reason}</p>
                    <p className="text-[9px] leading-relaxed text-slate-400 break-all">原始消息/记录：{original}</p>
                    <button
                      type="button"
                      onClick={() => toggleMemoryRecall(item)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
                    >
                      {item.recallDisabled ? <RotateCcw className="h-3 w-3" /> : <PauseCircle className="h-3 w-3" />}
                      {item.recallDisabled ? "恢复召回" : "暂停召回"}
                    </button>
                  </div>
                ))}
              </div>
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
              className="settings-panel-card p-5 w-full max-w-sm space-y-4"
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

                  {/* Trigger Interval Slider */}
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
                        max="100"
                        step="10"
                        value={modalSummaryTriggerRound}
                        onChange={(e) => setModalSummaryTriggerRound(parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-neutral-950"
                      />
                      <p className="text-[10px] text-slate-400 leading-snug">
                        自动总结始终开启。范围为 10 至 100 轮，默认 50 轮；触发后，系统会自动提炼该段对话并存储到记忆库。
                      </p>
                  </div>

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

                  <div className="settings-wide-action-group">
                    <button
                    onClick={() => {
                      const char = displayCharacters.find(c => c.id === normalizeCharacterId(selectedCharForAutoSummary));
                      if (char && onUpdateCharacter) {
                        onUpdateCharacter({
                          ...char,
                          enableAutoSummary: true,
                          summaryTriggerRound: modalSummaryTriggerRound,
                          archiveTemplateType: modalArchiveTemplateType,
                        });
                      }
                      setShowRecallModal(false);
                    }}
                      className="settings-wide-action settings-wide-action-primary"
                    >
                      保存设置
                    </button>
                  </div>
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
