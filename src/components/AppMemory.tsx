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
import { buildMemoryCenterRecords, filterMemoryCenterRecords, MEMORY_CENTER_LAYER_LABELS, MEMORY_CENTER_SOURCE_LABELS, MEMORY_CENTER_TYPE_LABELS, type MemoryCenterRecord, type MemoryCenterRecordType } from "../domain/memory/memoryCenterModel";
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

const MEMORY_CENTER_TYPE_OPTIONS: Array<{ value: MemoryCenterRecordType | "all"; label: string }> = [
  { value: "all", label: "全部类型" },
  { value: "truth", label: MEMORY_CENTER_TYPE_LABELS.truth },
  { value: "summary", label: MEMORY_CENTER_TYPE_LABELS.summary },
  { value: "rule", label: MEMORY_CENTER_TYPE_LABELS.rule },
  { value: "compatibility", label: MEMORY_CENTER_TYPE_LABELS.compatibility },
];

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
  const [activeRecordType, setActiveRecordType] = useState<MemoryCenterRecordType | "all">("all");
  
  // Modals / Dialog States
  const [showMenu, setShowMenu] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<MemoryItem | null>(null);
  const [showApiPoolModal, setShowApiPoolModal] = useState(false);
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [selectedMemoryCenterRecord, setSelectedMemoryCenterRecord] = useState<MemoryCenterRecord | null>(null);
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
  const [deleteTarget, setDeleteTarget] = useState<MemoryCenterRecord | null>(null);

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
  const memoryCenterRecords = buildMemoryCenterRecords({
    memories: normalizedMemories,
    claims: knowledgeClaims,
    summaries: conversationSummaries,
    corrections: behaviorCorrections,
  });
  const baseFilteredMemoryCenterRecords = filterMemoryCenterRecords(memoryCenterRecords, {
    recordType: activeRecordType,
    characterId: selectedCharacterId,
    relationId: selectedRelationId,
    searchQuery,
  });
  const filteredMemoryCenterRecords = baseFilteredMemoryCenterRecords;
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

  const getMemoryCenterRecallDisabled = (record: MemoryCenterRecord): boolean => {
    if (record.status !== "active") return true;
    if (record.recordType === "truth") {
      return Boolean(knowledgeClaims.find((claim) => claim.id === record.id)?.recallDisabled);
    }
    if (record.recordType === "compatibility") {
      const item = memories.find((candidate) => candidate.id === record.id);
      return Boolean(item?.recallDisabled || (item && getClaimForMemory(item)?.recallDisabled));
    }
    return false;
  };

  const isMemoryCenterRecallEligible = (record: MemoryCenterRecord): boolean =>
    record.status === "active" && (record.recordType === "truth" || record.recordType === "compatibility");

  const toggleMemoryCenterRecall = (record: MemoryCenterRecord) => {
    if (record.recordType === "truth") {
      const claim = knowledgeClaims.find((candidate) => candidate.id === record.id);
      if (!claim) {
        alert("未找到对应的 Truth 原记录，无法修改召回状态。");
        return;
      }
      const nextDisabled = !claim.recallDisabled;
      const write = saveKnowledgeClaims(knowledgeClaims.map((candidate) => candidate.id === claim.id
        ? { ...candidate, recallDisabled: nextDisabled }
        : candidate));
      if (!write.success) {
        alert("Truth 召回状态保存失败，记录未改变。");
        return;
      }
      setSelectedMemoryCenterRecord({ ...record });
      return;
    }
    if (record.recordType === "compatibility") {
      const item = memories.find((candidate) => candidate.id === record.id);
      if (!item) {
        alert("未找到对应的兼容记忆原记录，无法修改召回状态。");
        return;
      }
      toggleMemoryRecall(item);
      setSelectedMemoryCenterRecord({ ...record });
      return;
    }
    alert("摘要和规则记录目前由系统统一管理，暂不支持单条暂停；查看详情不会改变任何数据。");
  };

  const getMemoryCenterRecallDisplay = (record: MemoryCenterRecord) => {
    if (record.status !== "active") {
      return { label: "不参与召回", dotClass: "bg-slate-300", textClass: "text-slate-400" };
    }
    if (record.recordType === "truth" || record.recordType === "compatibility") {
      const disabled = getMemoryCenterRecallDisabled(record);
      return disabled
        ? { label: "已暂停", dotClass: "bg-amber-400", textClass: "text-amber-600" }
        : { label: "参与召回", dotClass: "bg-emerald-500", textClass: "text-emerald-600" };
    }
    return { label: "参与召回（系统）", dotClass: "bg-emerald-500", textClass: "text-emerald-600" };
  };

  const requestDeleteMemoryCenterRecord = (record: MemoryCenterRecord) => {
    setDeleteTarget(record);
  };

  const deleteMemoryCenterRecord = (record: MemoryCenterRecord): boolean => {
    if (record.recordType === "truth") {
      const claim = knowledgeClaims.find((candidate) => candidate.id === record.id);
      if (!claim) {
        alert("未找到对应的 Truth 原记录，无法撤回。");
        return false;
      }
      const write = retractKnowledgeClaim({
        relationId: claim.relationId,
        characterId: claim.characterId,
        userIdentityId: claim.userIdentityId,
        conversationId: claim.conversationId,
      }, claim.id, "memory_center_deleted");
      if (!write.success) {
        alert("Truth 撤回失败，记录未改变。");
        return false;
      }
    } else if (record.recordType === "summary") {
      const write = saveConversationSummaries(conversationSummaries.filter((summary) => summary.id !== record.id));
      if (!write.success) {
        alert("对话摘要删除失败，记录未改变。");
        return false;
      }
    } else if (record.recordType === "rule") {
      const write = saveBehaviorCorrections(behaviorCorrections.filter((correction) => correction.id !== record.id));
      if (!write.success) {
        alert("规则记忆删除失败，记录未改变。");
        return false;
      }
    } else {
      const memory = memories.find((candidate) => candidate.id === record.id);
      if (!memory) {
        alert("未找到对应的兼容记忆原记录，无法删除。");
        return false;
      }
      const linkedClaims = knowledgeClaims.filter((claim) => memory.sourceKnowledgeClaimIds?.includes(claim.id));
      const failedClaim = linkedClaims.find((claim) => !retractKnowledgeClaim({
        relationId: claim.relationId,
        characterId: claim.characterId,
        userIdentityId: claim.userIdentityId,
        conversationId: claim.conversationId,
      }, claim.id, "compatibility_memory_deleted").success);
      if (failedClaim) {
        alert("关联 Truth 撤回失败，兼容记忆未删除。");
        return false;
      }
      onSaveMemories(memories.filter((candidate) => candidate.id !== record.id));
    }
    setSelectedMemoryCenterRecord(null);
    return true;
  };

  const confirmDeleteMemoryCenterRecord = () => {
    if (!deleteTarget) return;
    if (deleteMemoryCenterRecord(deleteTarget)) setDeleteTarget(null);
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

  const renderMemoryCenterRecord = (record: MemoryCenterRecord) => {
    const character = record.scope.characterId
      ? displayCharacters.find((candidate) => candidate.id === normalizeCharacterId(record.scope.characterId!))
      : undefined;
    const statusLabel: Record<MemoryCenterRecord["status"], string> = {
      active: "启用",
      candidate: "候选",
      stale: "已过期",
      superseded: "已替代",
      retracted: "已撤回",
    };
    const truthLabel = record.truthStatus === "confirmed"
      ? "已确认"
      : record.truthStatus === "asserted"
        ? "用户陈述"
        : record.truthStatus === "inferred"
          ? "推断"
          : record.truthStatus === "disputed" ? "有争议" : undefined;
    const temporalLabel = record.temporalStatus === "future"
      ? "未来"
      : record.temporalStatus === "past"
        ? "过去"
        : record.temporalStatus === "present"
          ? "当前"
          : record.temporalStatus === "timeless" ? "长期" : undefined;
    const recallDisplay = getMemoryCenterRecallDisplay(record);
    const deleteActionLabel = record.recordType === "truth" ? "撤回" : "删除";
    return (
      <motion.div
        key={`${record.recordType}-${record.id}`}
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-slate-800">{character?.name || "未绑定角色"}</p>
            <p className="mt-0.5 text-[9px] text-slate-400">{MEMORY_CENTER_SOURCE_LABELS[record.provenance.app]} · {formatTime(record.recordedAt)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">{MEMORY_CENTER_TYPE_LABELS[record.recordType]}</span>
            <button
              type="button"
              onClick={() => setSelectedMemoryCenterRecord(record)}
              className="rounded-lg bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-500 hover:bg-slate-100"
              aria-label={`查看${MEMORY_CENTER_TYPE_LABELS[record.recordType]}详情`}
            >
              详情
            </button>
            <button
              type="button"
              onClick={() => requestDeleteMemoryCenterRecord(record)}
              className="rounded-lg bg-rose-50 p-1.5 text-rose-500 transition-colors hover:bg-rose-100"
              aria-label={`${deleteActionLabel}${MEMORY_CENTER_TYPE_LABELS[record.recordType]}`}
              title={`${deleteActionLabel}${MEMORY_CENTER_TYPE_LABELS[record.recordType]}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words text-xs font-medium leading-relaxed text-slate-700">{getMemoryDisplayContent(record.content)}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-500">{MEMORY_CENTER_LAYER_LABELS[record.layer]}</span>
          <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-500">{statusLabel[record.status]}</span>
          {truthLabel && <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-500">{truthLabel}</span>}
          {temporalLabel && <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-500">{temporalLabel}</span>}
          <span className={`inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[9px] font-bold ${recallDisplay.textClass}`} title={`召回状态：${recallDisplay.label}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${recallDisplay.dotClass}`} aria-hidden="true" />
            {recallDisplay.label}
          </span>
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-slate-400">
          {record.scope.relationId ? getRelationLabel(record.scope.relationId) : "未绑定关系"}
          {record.provenance.sourceMessageIds?.length ? ` · 来源消息 ${record.provenance.sourceMessageIds.length} 条` : " · 暂无直接消息链接"}
        </p>
      </motion.div>
    );
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
                  成功为 {displayCharacters.find(c => c.id === normalizeCharacterId(immediateSummaryTask.characterId))?.name || "角色"} 提炼了 {immediateSummaryTask.extractedCount} 条长期内容
                  {immediateSummaryTask.archiveStats && ` · 事实 ${immediateSummaryTask.archiveStats.acceptedTruthCount} · 摘要 ${immediateSummaryTask.archiveStats.summaryCount} · 兼容 ${immediateSummaryTask.archiveStats.compatibilityCount}`}
                </p>
                {immediateSummaryTask.archiveStats && immediateSummaryTask.archiveStats.rejectedCandidateCount > 0 && (
                  <p className="text-[9px] text-amber-600">另有 {immediateSummaryTask.archiveStats.rejectedCandidateCount} 条候选未写入，原聊天记录未受影响。</p>
                )}
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

        {/* Character filter stays above search, matching the offline app selector. */}
        <div className="flex items-start gap-3 overflow-x-auto pb-1 no-scrollbar select-none">
          <button
            onClick={() => setSelectedCharacterId("all")}
            className={`group relative flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-lg px-0.5 py-0.5 transition-all ${
              selectedCharacterId === "all" ? "text-slate-900" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className={`relative rounded-full p-0.5 transition-all ${selectedCharacterId === "all" ? "bg-slate-300" : "bg-transparent"}`}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100">
                <User className="h-4 w-4" />
              </span>
              {selectedCharacterId === "all" && <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-slate-700 text-[7px] font-bold text-white">✓</span>}
            </span>
            <span className="max-w-full truncate text-[9px] font-bold leading-3">全部角色</span>
          </button>
          {displayCharacters.map((char) => (
            <button
              key={char.id}
              onClick={() => setSelectedCharacterId(char.id)}
              className={`group relative flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-lg px-0.5 py-0.5 transition-all ${
                selectedCharacterId === char.id ? "text-slate-900" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className={`relative rounded-full p-0.5 transition-all ${selectedCharacterId === char.id ? "bg-slate-300" : "bg-transparent"}`}>
                <img
                  src={char.avatar}
                  alt={char.name}
                  className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                  referrerPolicy="no-referrer"
                />
                {selectedCharacterId === char.id && <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-slate-700 text-[7px] font-bold text-white">✓</span>}
              </span>
              <span className="max-w-full truncate text-[9px] font-bold leading-3">{char.name}</span>
            </button>
          ))}
        </div>

        {/* Search and optional type filter */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索记忆条目..."
                className="h-10 w-full bg-white pl-10 pr-10 py-0 text-xs text-slate-700 rounded-[8px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950/10 focus:border-neutral-950 transition-all font-medium placeholder-slate-400 shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="清除搜索"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowTypeFilter((current) => !current)}
              aria-label={`筛选记忆类型${activeRecordType === "all" ? "" : `：${MEMORY_CENTER_TYPE_LABELS[activeRecordType]}`}`}
              aria-expanded={showTypeFilter}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50"
            >
              <Sliders className="h-4 w-4" />
            </button>
          </div>
          {showTypeFilter && (
            <div className="absolute right-0 top-full z-30 mt-2 w-48 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
              <p className="px-2 py-1.5 text-[10px] font-black text-slate-400">筛选记忆类型</p>
              {MEMORY_CENTER_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setActiveRecordType(option.value);
                    setShowTypeFilter(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[11px] font-bold transition-colors ${
                    activeRecordType === option.value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span>{option.label}</span>
                  {activeRecordType === option.value && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
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

        {/* Unified memory center list */}
        <div className="space-y-3">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1.5">
            长期记忆内容 ({filteredMemoryCenterRecords.length})
          </h2>
          <AnimatePresence mode="popLayout">
            {filteredMemoryCenterRecords.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm"
              >
                <Brain className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-xs font-bold text-slate-700">暂无符合条件的记忆</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">可以继续聊天并使用总结归档，新的长期内容会按类型出现在这里。</p>
              </motion.div>
            ) : (
              filteredMemoryCenterRecords.map(renderMemoryCenterRecord)
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

      {/* MODAL: Memory center record detail */}
      <AnimatePresence>
        {selectedMemoryCenterRecord && (() => {
          const record = selectedMemoryCenterRecord;
          const character = record.scope.characterId
            ? displayCharacters.find((candidate) => candidate.id === normalizeCharacterId(record.scope.characterId!))
            : undefined;
          const recallEligible = isMemoryCenterRecallEligible(record);
          const recallDisabled = recallEligible && getMemoryCenterRecallDisabled(record);
          const recallDisplay = getMemoryCenterRecallDisplay(record);
          const statusLabel: Record<MemoryCenterRecord["status"], string> = {
            active: "启用",
            candidate: "候选",
            stale: "已过期",
            superseded: "已替代",
            retracted: "已撤回",
          };
          return (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="flex max-h-[90%] w-full max-w-md flex-col overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="memory-center-detail-title"
              >
                <div className="flex shrink-0 items-start justify-between border-b border-slate-100 p-5 pb-3">
                  <div>
                    <h3 id="memory-center-detail-title" className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                      <Info className="h-4 w-4 text-neutral-800" />
                      记忆详情
                    </h3>
                    <p className="mt-1 text-[10px] text-slate-400">这里展示来源和召回状态，不会自动修改记忆内容。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedMemoryCenterRecord(null)}
                    className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="关闭记忆详情"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 overflow-y-auto p-5 pt-3">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-slate-600">{MEMORY_CENTER_TYPE_LABELS[record.recordType]}</span>
                      <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-slate-600">{MEMORY_CENTER_LAYER_LABELS[record.layer]}</span>
                      <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-slate-600">{statusLabel[record.status]}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-xs font-medium leading-relaxed text-slate-700">{getMemoryDisplayContent(record.content)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px] text-slate-400">
                    <span>所属角色：<strong className="text-slate-600">{character?.name || "未绑定角色"}</strong></span>
                    <span>来源应用：<strong className="text-slate-600">{MEMORY_CENTER_SOURCE_LABELS[record.provenance.app]}</strong></span>
                    <span>所属关系：<strong className="text-slate-600">{record.scope.relationId ? getRelationLabel(record.scope.relationId) : "未绑定关系"}</strong></span>
                    <span>记录时间：<strong className="text-slate-600">{new Date(record.recordedAt).toLocaleString("zh-CN")}</strong></span>
                    <span>重要性：<strong className="text-slate-600">{record.importance}/10</strong></span>
                    <span>可信度：<strong className="text-slate-600">{Math.round(record.confidence * 100)}%</strong></span>
                    <span>用户确认：<strong className="text-slate-600">{record.userConfirmed ? "是" : "否"}</strong></span>
                    <span>召回状态：<strong className={recallDisplay.textClass}>{recallDisplay.label}</strong></span>
                  </div>

                  <div className="rounded-xl border border-slate-100 p-3 text-[10px] leading-relaxed text-slate-500">
                    <p className="font-bold text-slate-700">来源追溯</p>
                    <p className="mt-1 break-all">来源记录：{record.provenance.sourceRecordId || "暂无直接记录 ID"}</p>
                    <p className="mt-1 break-all">来源消息：{record.provenance.sourceMessageIds?.length ? record.provenance.sourceMessageIds.join("、") : "暂无直接消息链接"}</p>
                    <p className="mt-1 break-all">来源 Truth：{record.provenance.sourceClaimIds?.length ? record.provenance.sourceClaimIds.join("、") : "无"}</p>
                    {(record.supersedesId || record.supersededById) && (
                      <p className="mt-1 break-all">替代关系：{record.supersedesId ? `替代 ${record.supersedesId}` : `被 ${record.supersededById} 替代`}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-amber-50/50 p-3 text-[10px] leading-relaxed text-slate-500">
                    <span>
                      {recallEligible
                        ? "暂停只影响未来检索，原文、来源和历史记录都会保留。"
                        : record.status !== "active"
                          ? `当前记录为${statusLabel[record.status]}，不会参与未来检索。`
                          : "摘要和规则由系统统一管理，当前支持查看来源，不提供单条暂停。"}
                    </span>
                      {recallEligible ? (
                        <button
                        type="button"
                        onClick={() => toggleMemoryCenterRecall(record)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 shadow-sm hover:bg-slate-100"
                      >
                        {recallDisabled ? <RotateCcw className="h-3 w-3" /> : <PauseCircle className="h-3 w-3" />}
                        {recallDisabled ? "恢复召回" : "暂停召回"}
                        </button>
                      ) : (
                        <span className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-400">状态不可召回</span>
                      )}
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}
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
                      成功为 <span className="font-semibold text-slate-700">{displayCharacters.find(c => c.id === normalizeCharacterId(immediateSummaryTask.characterId))?.name}</span> 提炼了 <span className="font-bold">{immediateSummaryTask.extractedCount}</span> 条长期内容。
                    </p>
                    {immediateSummaryTask.archiveStats && (
                      <p className="mt-1 text-[10px] text-slate-500">
                        来源消息 {immediateSummaryTask.archiveStats.sourceMessageCount} 条 · 长期事实 {immediateSummaryTask.archiveStats.acceptedTruthCount} 条 · 摘要 {immediateSummaryTask.archiveStats.summaryCount} 条 · 兼容 {immediateSummaryTask.archiveStats.compatibilityCount} 条
                      </p>
                    )}
                    {immediateSummaryTask.archiveStats && immediateSummaryTask.archiveStats.rejectedCandidateCount > 0 && (
                      <p className="mt-1 text-[10px] text-amber-600">未采纳候选 {immediateSummaryTask.archiveStats.rejectedCandidateCount} 条，未删除原聊天记录。</p>
                    )}
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
        {deleteTarget && (() => {
          const actionLabel = deleteTarget.recordType === "truth" ? "撤回" : "删除";
          const typeLabel = MEMORY_CENTER_TYPE_LABELS[deleteTarget.recordType];
          const description = deleteTarget.recordType === "truth"
            ? "这会撤回 Truth，使它不再参与召回；原聊天记录和来源信息会保留。"
            : deleteTarget.recordType === "compatibility"
              ? "这会删除兼容记忆；如果它关联 Truth，关联 Truth 也会一并撤回。"
              : "这会从记忆库中删除这条记录，但不会删除原聊天记录。";
          return (
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl w-full max-w-xs p-5 shadow-2xl flex flex-col gap-4 text-center border border-slate-100"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="memory-delete-title"
              >
                <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 text-xl font-bold mx-auto">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h4 id="memory-delete-title" className="text-sm font-bold text-slate-800">确认{actionLabel}{typeLabel}</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{description}</p>
                </div>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmDeleteMemoryCenterRecord}
                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                  >
                    确认{actionLabel}
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
