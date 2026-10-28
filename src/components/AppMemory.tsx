import type { MemoryExtractionApiResult } from "../domain/memory/memoryTypes";
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Character, MemoryItem, MemoryVaultSettings, ImmediateSummaryTask, UserIdentity } from "../types";
import { resolveCanonicalCharacterId } from "../domain/character/characterIdentity";
import { createIdentityScope, matchesIdentityScope } from "../domain/identity/identityScope";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";
import { append as appendKnowledgeClaim, appendMany as appendKnowledgeClaims, loadKnowledgeClaims, remove as removeKnowledgeClaim, retract as retractKnowledgeClaim, saveKnowledgeClaims, supersede as supersedeKnowledgeClaim } from "../core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries, saveConversationSummaries } from "../core/storage/repositories/conversationSummaryRepository";
import { loadBehaviorCorrections, saveBehaviorCorrections } from "../core/storage/repositories/behaviorCorrectionRepository";
import type { BehaviorCorrectionRecord, ConversationSummaryRecord, KnowledgeClaim } from "../domain/characterKnowledge/characterKnowledgeTypes";
import { createManualKnowledgeClaim } from "../features/characterKnowledge/services/manualKnowledgeService";
import { restoreMemoryStoreBackup } from "../features/characterKnowledge/services/memoryBackupRestoreService";
import { readMemoryContinuityBackup, setCoreMemory, getRemainingLegacyMemories, confirmMemoryPersistence } from "../features/characterKnowledge/services/memoryManagementService";
import {MEMORY_GALLERY_CATEGORIES,memoryGalleryCategories,isMemoryGalleryOldMaterial,memoryGalleryEvidenceLabel,memoryGalleryTitle,memoryGalleryDisplayText,relatedMemorySummaries,type MemoryGalleryCategory} from "../domain/memory/memoryGallery";
import { forgetKnowledgeClaim,filterRecallableKnowledge } from "../features/characterKnowledge/services/characterContinuityService";
import {isConversationSummarySourceValid} from "../domain/characterKnowledge/conversationSummaryProjection";
import { MemoryAutoLoad } from "../features/characterKnowledge/components/MemoryAutoLoad";
import { MemoryContinuityPanel, type MemoryView } from "../features/characterKnowledge/components/MemoryContinuityPanel";
import { LegacyMemoryCompatibilityNotice } from "../features/characterKnowledge/components/LegacyMemoryCompatibilityNotice";
import { MemorySemanticSettings } from "../features/characterKnowledge/components/MemorySemanticSettings";
import {readMemorySystem} from "../features/characterKnowledge/services/memorySystemService";
import {readMemoryReviewHistory} from "../features/characterKnowledge/services/memoryPendingReviewService";
import { MemoryVectorProgress } from "../features/characterKnowledge/components/MemoryVectorProgress";
import { projectOrganizedKnowledge } from "../domain/characterKnowledge/knowledgeOrganization";
import { deduplicateMemoryGalleryClaims } from "../domain/memory/memoryGallery";
import { buildMemoryEpisodeCards } from "../domain/memory/memoryEpisodeCards";
import { retractMany as retractKnowledgeClaimGroup, supersedeMany as supersedeKnowledgeClaimGroup } from "../core/storage/repositories/characterKnowledgeRepository";
import { readMemoryOrganization } from "../features/characterKnowledge/services/memoryOrganizationService";
import {MemoryCharacterPicker} from "../features/characterKnowledge/components/MemoryCharacterPicker";
import {readMemoryCharacterSelection,rememberMemoryCharacterSelection} from "../features/characterKnowledge/services/memoryCharacterSelection";
import type { MemoryEmbeddingConfiguration } from "../features/characterKnowledge/services/memoryEmbeddingProvider";
import { getMemoryDisplayContent } from "../domain/memory/offlineMemorySync";
import { commitMemoryWriteBundle } from "../domain/memory/memoryWriteCoordinator";
import { rankRelevantMemories } from "../domain/memory/MemoryRetriever";
import { getLastTruthRetrievalDiagnostics } from "../features/characterKnowledge/services/truthRetrievalService";
import { buildMemoryCenterRecords, filterMemoryCenterRecords, MEMORY_CENTER_LAYER_LABELS, MEMORY_CENTER_SOURCE_LABELS, MEMORY_CENTER_TYPE_LABELS, type MemoryCenterRecord, type MemoryCenterRecordType } from "../domain/memory/memoryCenterModel";
import { 
  ChevronDown,
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
  isActive?: boolean;
  embeddingConfiguration?: MemoryEmbeddingConfiguration;
  onSaveEmbeddingConfiguration?: (configuration: MemoryEmbeddingConfiguration) => void;
  characters: Character[];
  relationships: CharacterRelationship[];
  identities?: UserIdentity[];
  activeIdentityId?: string;
  memories: MemoryItem[];
  onSaveMemories: (updated: MemoryItem[]) => void | boolean | Promise<void | boolean>;
  recallSettings: MemoryVaultSettings;
  onSaveRecallSettings: (updated: MemoryVaultSettings) => void;
  onUpdateCharacter?: (char: Character) => void;
  immediateFailureResponse?: MemoryExtractionApiResult | null;
  onClearImmediateFailureResponse?: () => void;
  immediateSummaryTask?: ImmediateSummaryTask;
  onStartImmediateSummary?: (characterId: string, rounds: number, relationId?: string, conversationId?: string) => Promise<void>;
  onResetImmediateSummary?: () => void;
  onClose: () => void;
  selectedModel?: string;
  apiEndpoint?: string;
  settings?: import("../types").UserSettings;
  openDiagnosticsRequestId?: number;
}

const DEFAULT_AUTO_SUMMARY_ROUNDS = 10;
const normalizeAutoSummaryRounds = (value: number | undefined): number =>
  Number.isFinite(value)
    ? Math.min(100, Math.max(10, Math.round(value as number)))
    : DEFAULT_AUTO_SUMMARY_ROUNDS;

const MEMORY_CENTER_TYPE_OPTIONS: Array<{ value: MemoryCenterRecordType | "all"; label: string }> = [
  { value: "all", label: "全部类型" },
  { value: "truth", label: MEMORY_CENTER_TYPE_LABELS.truth },
  { value: "summary", label: MEMORY_CENTER_TYPE_LABELS.summary },
  { value: "rule", label: MEMORY_CENTER_TYPE_LABELS.rule },
];

type MemoryCenterDeleteMode = "retract" | "permanent";

export default function AppMemory({
  isActive = true,
  characters,
  relationships,
  identities = [],
  activeIdentityId = "identity-1",
  memories,
  onSaveMemories,
  recallSettings,
  onSaveRecallSettings,
  onUpdateCharacter,
  immediateFailureResponse,
  onClearImmediateFailureResponse,
  immediateSummaryTask,
  onStartImmediateSummary,
  onResetImmediateSummary,
  onClose,
  selectedModel = "gemini-3.5-flash",
  apiEndpoint = "",
  settings,
  openDiagnosticsRequestId = 0,
  embeddingConfiguration,
  onSaveEmbeddingConfiguration,
}: AppMemoryProps) {
  const [, refreshStoredMemory] = useState(0);
  useEffect(() => {
    const refresh = () => refreshStoredMemory((value) => value + 1);
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("fanfanji:memory-data-updated",refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh);document.removeEventListener("fanfanji:memory-data-updated",refresh); };
  }, []);
  const identityScope = createIdentityScope(activeIdentityId, identities);
  const displayCharacters = characters.filter((character) => !character.isGroupChat && !character.isContactInstance);
  const normalizeCharacterId = (characterId: string) => resolveCanonicalCharacterId(characterId, characters);
  const scopedRelationships = relationships.filter((relation) => relation.userIdentityId === identityScope.selectedIdentityId);
  const relationIdentityById = new Map(relationships.map((relation) => [relation.id, relation.userIdentityId]));
  const toTruthScope = (relation: CharacterRelationship) => ({
    relationId: relation.id,
    characterId: relation.characterId,
    userIdentityId: relation.userIdentityId,
    conversationId: relation.conversationId,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [memoryView, setMemoryView] = useState<MemoryView>("memories");
  const [galleryCategory,setGalleryCategory]=useState<MemoryGalleryCategory|"old"|null>(null);
  const [visibleRecordCount, setVisibleRecordCount] = useState(30);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(()=>{
    const previous=readMemoryCharacterSelection(activeIdentityId);return displayCharacters.some(character=>character.id===previous)?previous:"";
  });
  const [showCharacterPicker,setShowCharacterPicker]=useState(()=>!displayCharacters.some(character=>character.id===readMemoryCharacterSelection(activeIdentityId)));
  const selectedMemoryCharacter=displayCharacters.find(character=>character.id===selectedCharacterId);
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
  const [memoryCenterActionMenuId, setMemoryCenterActionMenuId] = useState<string | null>(null);
  const restoreBackupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (openDiagnosticsRequestId > 0) setShowDiagnosticsModal(true);
  }, [openDiagnosticsRequestId]);

  useEffect(() => {
    const previous=readMemoryCharacterSelection(activeIdentityId);
    setSelectedCharacterId(displayCharacters.some(character=>character.id===previous)?previous:"");
    setShowCharacterPicker(!displayCharacters.some(character=>character.id===previous));
    setSearchQuery("");setSelectedMemoryCenterRecord(null);setMemoryCenterActionMenuId(null);setGalleryCategory(null);setMemoryView("memories");
    setSelectedRelationId("all");
    setImmediateCharId("");
    setImmediateRelationId("");
  }, [activeIdentityId]);

  useEffect(()=>{
    if(selectedCharacterId&&!displayCharacters.some(character=>character.id===selectedCharacterId)){
      setSelectedCharacterId("");setSelectedMemoryCenterRecord(null);setShowCharacterPicker(true);
    }
  },[selectedCharacterId,displayCharacters]);

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
    const firstChar = selectedMemoryCharacter || displayCharacters[0];
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
    const firstChar = selectedMemoryCharacter || displayCharacters[0];
    if (firstChar) {
      setImmediateCharId(firstChar.id);
    } else {
      setImmediateCharId("");
    }
    const relations = scopedRelationships.filter((relation) => relation.characterId === firstChar?.id);
    setImmediateRelationId(relations.find((relation) => relation.id === selectedRelationId)?.id || (relations.length === 1 ? relations[0].id : ""));
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
  const [deleteMode, setDeleteMode] = useState<MemoryCenterDeleteMode | null>(null);

  // Unified memory center edit state
  const [editingMemoryCenterRecord, setEditingMemoryCenterRecord] = useState<MemoryCenterRecord | null>(null);
  const [editTruthMode, setEditTruthMode] = useState<"correction" | "change">("correction");
  const [editMemoryCenterContent, setEditMemoryCenterContent] = useState("");

  // Inline edit state
  const [editContent, setEditContent] = useState("");

  // Filter memories
  const normalizedMemories = memories.map((item) => {
    const characterId = normalizeCharacterId(item.characterId);
    return characterId === item.characterId ? item : { ...item, characterId };
  });
  const scopedMemories = normalizedMemories.filter((item) => matchesIdentityScope(
    item.userIdentityId || (item.relationId ? relationIdentityById.get(item.relationId) : undefined),
    identityScope,
  ));
  const selectedCharacterRelations = Array.from(new Map(
    scopedRelationships
      .filter((relation) => relation.characterId === normalizeCharacterId(selectedCharacterId))
      .map((relation) => [`${relation.userIdentityId}\u0000${relation.characterId}`, relation]),
  ).values());

  const filteredMemories = scopedMemories.filter(item => {
    const matchesChar = selectedCharacterId === "all" || item.characterId === normalizeCharacterId(selectedCharacterId);
    const matchesSearch = searchQuery.trim() === "" || item.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRelation = selectedRelationId === "all" || item.relationId === selectedRelationId;
    return matchesChar && matchesRelation && matchesSearch;
  });

  const allKnowledgeClaims = loadKnowledgeClaims().value;
  const allConversationSummaries = loadConversationSummaries().value;
  const allBehaviorCorrections = loadBehaviorCorrections().value;
  const knowledgeClaims = allKnowledgeClaims.filter((claim) => matchesIdentityScope(claim.userIdentityId, identityScope));
  const knowledgeProjection = deduplicateMemoryGalleryClaims(projectOrganizedKnowledge(knowledgeClaims));
  const conversationSummaries = allConversationSummaries.filter((summary) => matchesIdentityScope(summary.userIdentityId, identityScope));
  const behaviorCorrections = allBehaviorCorrections.filter((correction) => matchesIdentityScope(correction.userIdentityId, identityScope));
  const memoryCenterRecords = buildMemoryCenterRecords({
    memories: scopedMemories,
    claims: knowledgeProjection,
    summaries: conversationSummaries,
    corrections: behaviorCorrections,
  });
  const episodeCards=buildMemoryEpisodeCards({records:memoryCenterRecords,claims:knowledgeProjection,summaries:conversationSummaries});
  const baseFilteredMemoryCenterRecords = filterMemoryCenterRecords(selectedMemoryCharacter?episodeCards:[], {
    recordType: activeRecordType,
    characterId: selectedCharacterId,
    relationId: selectedRelationId,
    searchQuery,
  });
  const filteredMemoryCenterRecords = baseFilteredMemoryCenterRecords.filter(record=>{
    const claim=record.recordType==="truth"?knowledgeProjection.find(item=>item.id===record.id):undefined;
    if(!claim&&activeRecordType!=="all")return true;
    if(galleryCategory==="old")return !claim||isMemoryGalleryOldMaterial(claim)||claim.status!=="active"||Boolean(claim.supersededById);
    const categories=episodeCards.find(card=>card.id===record.id)?.categoryIds||[];
    return Boolean(claim&&!knowledgeProjection.some(other=>other.id!==claim.id&&other.status==="active"&&other.mergedClaimIds?.includes(claim.id))&&(galleryCategory?categories.includes(galleryCategory):categories.length>0));
  });
  useEffect(() => setVisibleRecordCount(30), [searchQuery, selectedCharacterId, selectedRelationId, memoryView,galleryCategory]);
  const getClaimForMemory = (item: MemoryItem): KnowledgeClaim | undefined =>
    item.sourceKnowledgeClaimIds?.map((claimId) => knowledgeClaims.find((claim) => claim.id === claimId)).find(Boolean);
  const getRelationLabel = (relationId?: string): string => {
    if (!relationId) return "未绑定关系";
    const relation = relationships.find((item) => item.id === relationId);
    const character = relation ? displayCharacters.find((item) => item.id === normalizeCharacterId(relation.characterId)) : undefined;
    return character ? `${character.name} · ${relation?.relationship || "关系"}` : relationId;
  };
  const getIdentityLabel = (identityId: string): string => {
    const identity = identities.find((item) => item.id === identityId);
    return identity?.name?.trim() || identityId;
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
  const selectedDiagnosticRelation = selectedRelationId !== "all"
    ? relationships.find((relation) => relation.id === selectedRelationId)
    : relationships.filter(relation => relation.characterId === normalizeCharacterId(selectedCharacterId))
      .filter(relation => getLastTruthRetrievalDiagnostics(toTruthScope(relation)))
      .sort((a, b) => (getLastTruthRetrievalDiagnostics(toTruthScope(b))?.recordedAt || 0)
        - (getLastTruthRetrievalDiagnostics(toTruthScope(a))?.recordedAt || 0))[0];
  const runtimeTruthDiagnostics = selectedDiagnosticRelation
    ? getLastTruthRetrievalDiagnostics(toTruthScope(selectedDiagnosticRelation))
    : undefined;

  const toggleMemoryRecall = async (item: MemoryItem) => {
    const nextDisabled = !item.recallDisabled;
    const claimIds = new Set(item.sourceKnowledgeClaimIds || []);
    if (claimIds.size > 0) {
      const nextClaims = allKnowledgeClaims.map((claim) => claimIds.has(claim.id) ? { ...claim, recallDisabled: nextDisabled } : claim);
      const claimWrite = (await confirmMemoryPersistence(saveKnowledgeClaims(nextClaims)));
      if (!claimWrite.success) {
        alert("记忆状态保存失败，未改变召回状态。");
        return;
      }
    }
    if (await onSaveMemories(memories.map((candidate) => candidate.id === item.id ? { ...candidate, recallDisabled: nextDisabled } : candidate)) === false) alert("记忆状态未保存，请检查存储诊断。");
  };

  const getMemoryCenterRecallDisabled = (record: MemoryCenterRecord): boolean => {
    if (record.status !== "active") return true;
    if (record.recordType === "truth") {
      const claim=knowledgeClaims.find(claim=>claim.id===record.id);
      return Boolean(claim&&cardClaimIds(record).every(id=>allKnowledgeClaims.find(candidate=>candidate.id===id)?.recallDisabled));
    }
    if (record.recordType === "compatibility") {
      const item = memories.find((candidate) => candidate.id === record.id);
      return Boolean(item?.recallDisabled || (item && getClaimForMemory(item)?.recallDisabled));
    }
    return false;
  };

  const isMemoryCenterRecallEligible = (record: MemoryCenterRecord): boolean => {
    if(record.status!=="active")return false;
    if(record.recordType==="truth"){
      const claim=knowledgeClaims.find(claim=>claim.id===record.id);
      return Boolean(claim&&!isMemoryGalleryOldMaterial(claim)&&(claim.source.app!=="diary"||claim.source.producer==="diary-reflection.v1"));
    }
    return record.recordType==="compatibility";
  };

  const groupedClaimIds=(claim:KnowledgeClaim,records=allKnowledgeClaims)=>{
    if(!records.some(candidate=>candidate.id===claim.id&&candidate.statement===claim.statement&&candidate.status==="active"))return [];
    const projection=records===allKnowledgeClaims?knowledgeProjection:deduplicateMemoryGalleryClaims(projectOrganizedKnowledge(records));
    const ids=[claim.id,...(projection.find(item=>item.id===claim.id)?.mergedClaimIds||[])];
    return [...new Set(ids)].filter(id=>records.some(candidate=>candidate.id===id&&candidate.characterId===claim.characterId
      &&candidate.relationId===claim.relationId&&candidate.userIdentityId===claim.userIdentityId&&candidate.conversationId===claim.conversationId));
  };
  const cardClaimIds=(record:MemoryCenterRecord,records=allKnowledgeClaims)=>{
    const ids=episodeCards.find(card=>card.id===record.id)?.memberClaimIds||[record.id];
    return [...new Set(ids.flatMap(id=>{const claim=knowledgeClaims.find(item=>item.id===id);return claim?groupedClaimIds(claim,records):[];}))];
  };
  const toggleMemoryCenterRecall = async (record: MemoryCenterRecord) => {
    if (record.recordType === "truth") {
      const claim = knowledgeClaims.find((candidate) => candidate.id === record.id);
      if (!claim) {
        alert("未找到对应的 Truth 原记录，无法修改召回状态。");
        return;
      }
      const nextDisabled = !getMemoryCenterRecallDisabled(record);
      const latest=loadKnowledgeClaims();
      if(!latest.valid){alert("记忆暂时无法读取，请稍后重试。");return;}
      const group=new Set(cardClaimIds(record,latest.value));
      const write = (await confirmMemoryPersistence(saveKnowledgeClaims(latest.value.map((candidate) => group.has(candidate.id)&&candidate.characterId===claim.characterId&&candidate.relationId===claim.relationId&&candidate.userIdentityId===claim.userIdentityId&&candidate.conversationId===claim.conversationId
        ? { ...candidate, recallDisabled: nextDisabled }
        : candidate))));
      if (!write.success) {
        alert("Truth 召回状态保存失败，记录未改变。");
        return;
      }
      refreshStoredMemory(value=>value+1);
      setSelectedMemoryCenterRecord(current=>current?.id===record.id?{...record}:current);
      return;
    }
    if (record.recordType === "compatibility") {
      const item = memories.find((candidate) => candidate.id === record.id);
      if (!item) {
        alert("未找到对应的兼容记忆原记录，无法修改召回状态。");
        return;
      }
      toggleMemoryRecall(item);
      setSelectedMemoryCenterRecord(current=>current?.id===record.id?{...record}:current);
      return;
    }
    alert("摘要和规则记录目前由系统统一管理，暂不支持单条暂停；查看详情不会改变任何数据。");
  };

  const getMemoryCenterRecallDisplay = (record: MemoryCenterRecord) => {
    if (record.status === "retracted") {
      return { label: "已撤回", dotClass: "bg-slate-300", textClass: "text-slate-400" };
    }
    if (record.status === "superseded") {
      return { label: "已替代", dotClass: "bg-slate-300", textClass: "text-slate-400" };
    }
    if (record.status === "stale") {
      return { label: "已过期", dotClass: "bg-slate-300", textClass: "text-slate-400" };
    }
    if (record.status !== "active") {
      return { label: "不参与召回", dotClass: "bg-slate-300", textClass: "text-slate-400" };
    }
    if (record.recordType === "truth" || record.recordType === "compatibility") {
      if(!isMemoryCenterRecallEligible(record))return {label:"保留待整理，不参与召回",dotClass:"bg-slate-300",textClass:"text-slate-400"};
      const disabled = getMemoryCenterRecallDisabled(record);
      return disabled
        ? { label: "已暂停", dotClass: "bg-amber-400", textClass: "text-amber-600" }
        : { label: "参与召回", dotClass: "bg-emerald-500", textClass: "text-emerald-600" };
    }
    if(record.recordType==="summary"){
      const summary=conversationSummaries.find(summary=>summary.id===record.id);
      if(!summary||!isConversationSummarySourceValid(summary,filterRecallableKnowledge(knowledgeClaims)))return {label:"保留资料，不参与召回",dotClass:"bg-slate-300",textClass:"text-slate-400"};
    }
    return { label: "相关时按需使用", dotClass: "bg-emerald-500", textClass: "text-emerald-600" };
  };

  const requestDeleteMemoryCenterRecord = (record: MemoryCenterRecord, mode: MemoryCenterDeleteMode) => {
    setMemoryCenterActionMenuId(null);
    setDeleteTarget(record);
    setDeleteMode(mode);
  };

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    setDeleteMode(null);
  };

  const deleteMemoryCenterRecord = async (record: MemoryCenterRecord, mode: MemoryCenterDeleteMode): Promise<boolean> => {
    if (record.recordType === "truth") {
      const claim = knowledgeClaims.find((candidate) => candidate.id === record.id);
      if (!claim) {
        alert("未找到对应的 Truth 原记录，无法处理。");
        return false;
      }
      const scope = {
        relationId: claim.relationId,
        characterId: claim.characterId,
        userIdentityId: claim.userIdentityId,
        conversationId: claim.conversationId,
      };
      const write = mode === "permanent"
        ? (await confirmMemoryPersistence(forgetKnowledgeClaim(claim,cardClaimIds(record,loadKnowledgeClaims().value))))
        : (await confirmMemoryPersistence(retractKnowledgeClaimGroup(scope, cardClaimIds(record,loadKnowledgeClaims().value), "memory_center_retracted")));
      if (!write.success) {
        alert(mode === "permanent" ? "Truth 忘记记忆失败，记录未改变。" : "Truth 撤回失败，记录未改变。");
        return false;
      }
      if(mode==="permanent" && await onSaveMemories(getRemainingLegacyMemories()) === false) return false;
    } else if (record.recordType === "summary") {
      const write = (await confirmMemoryPersistence(saveConversationSummaries(allConversationSummaries.filter((summary) => summary.id !== record.id))));
      if (!write.success) {
        alert("对话摘要删除失败，记录未改变。");
        return false;
      }
    } else if (record.recordType === "rule") {
      const write = (await confirmMemoryPersistence(saveBehaviorCorrections(allBehaviorCorrections.filter((correction) => correction.id !== record.id))));
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
      if (await onSaveMemories(memories.filter((candidate) => candidate.id !== record.id)) === false) return false;
    }
    setSelectedMemoryCenterRecord(null);
    return true;
  };

  const confirmDeleteMemoryCenterRecord = async () => {
    if (!deleteTarget || !deleteMode) return;
    if (await deleteMemoryCenterRecord(deleteTarget, deleteMode)) closeDeleteDialog();
  };

  const downloadMemoryBackup = async () => {
    if (!(await confirmMemoryPersistence({ success: true })).success) { alert("记忆尚未保存，暂不能导出成功备份。"); return; }
    const payload = {
      format: "fanfanji-memory-backup",
      version: 2,
      exportedAt: new Date().toISOString(),
      memories,
      claims: allKnowledgeClaims,
      summaries: allConversationSummaries,
      corrections: allBehaviorCorrections,
      recallSettings,
      continuity: readMemoryContinuityBackup().value,
      organization: readMemoryOrganization().value,
      reviewActions: readMemoryReviewHistory().value,
      memorySystem: readMemorySystem().value,
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
        continuity: unknown;
        organization: unknown;
        reviewActions: unknown;
        memorySystem: import("../features/characterKnowledge/services/memorySystemService").MemorySystemState;
      }>;
      if (parsed.format !== "fanfanji-memory-backup" || ![1, 2].includes(parsed.version || 0)
        || !Array.isArray(parsed.memories) || !Array.isArray(parsed.claims)
        || !Array.isArray(parsed.summaries) || !Array.isArray(parsed.corrections)) {
        alert("不是可识别的米饭机记忆备份文件。");
        return;
      }
      if (!window.confirm("恢复记忆备份会替换当前记忆、Truth、摘要和修正记录。继续前请确认已有备份。")) return;
      const restored = (await confirmMemoryPersistence(restoreMemoryStoreBackup({
        claims: parsed.claims, summaries: parsed.summaries, corrections: parsed.corrections,
        memories: parsed.memories, recallSettings: parsed.recallSettings, continuity: parsed.continuity,
        organization: parsed.organization,
        reviewActions: parsed.reviewActions,
        memorySystem: parsed.memorySystem,
      })));
      if (!restored.success) {
        alert(restored.error === "rollback"
          ? "恢复未完成，已保留恢复快照。请释放存储空间后重新打开应用以恢复原数据。"
          : "记忆备份恢复失败，原有数据已保留；请检查备份格式和存储空间。");
        return;
      }
      if (await onSaveMemories(parsed.memories) === false) { alert("记忆正文恢复未完成，请检查存储诊断。"); return; }
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

    const relation = scopedRelationships.find((item) => item.id === newRelationId && item.characterId === normalizeCharacterId(newCharId));
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
      importance: newImportance,
    });
    if (!claim) {
      alert("长期认知写入失败，未保存兼容记忆。");
      return;
    }
    const write = await commitMemoryWriteBundle({
      claims: [claim],
      appendClaims: appendKnowledgeClaims,
    });
    if (!write.canonicalWritten) {
      alert("长期认知写入失败。");
      return;
    }
    setIsAddingItem(false);
    setNewCharId("");
    setNewRelationId("");
    setNewContent("");
    setNewImportance(5);
  };

  const saveCompatibilityMemoryEdit = async (item: MemoryItem, content: string): Promise<boolean> => {
    const relation = item.relationId
      ? scopedRelationships.find((candidate) => candidate.id === item.relationId && candidate.characterId === normalizeCharacterId(item.characterId))
      : undefined;
    if (!relation) {
      alert("当前关系作用域无效，无法修改长期认知。");
      return false;
    }
    const now = Date.now();
    const replacement = createManualKnowledgeClaim({
      id: `claim:manual:${item.id}:${now}`,
      scope: toTruthScope(relation),
      statement: content.trim(),
      sourceRecordId: item.id,
      recordedAt: now,
      sourceApp: "memory",
    });
    if (!replacement) {
      alert("修改内容未通过长期认知审核。");
      return false;
    }
    const previousClaimIds = item.sourceKnowledgeClaimIds || [];
    const primaryClaimId = previousClaimIds[0];
    const write = await commitMemoryWriteBundle({
      claims: [replacement],
      writeClaims: async () => {
        const stored = primaryClaimId
          ? (await confirmMemoryPersistence(supersedeKnowledgeClaim(toTruthScope(relation), primaryClaimId, replacement))).success
          : (await confirmMemoryPersistence(appendKnowledgeClaim(replacement))).success;
        if (!stored) return false;
        previousClaimIds.slice(1).forEach(async (claimId) => {
          (await confirmMemoryPersistence(retractKnowledgeClaim(toTruthScope(relation), claimId, "manual_memory_replaced")));
        });
        return true;
      },
    });
    if (!write.canonicalWritten) {
      alert("长期认知修改失败，原记录保持不变。");
      return false;
    }
    return true;
  };

  // Handle Edit Memory
  const handleStartEdit = (item: MemoryItem) => {
    setEditingItem(item);
    setEditContent(item.content);
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editContent.trim()) return;
    if (await saveCompatibilityMemoryEdit(editingItem, editContent)) {
      setEditingItem(null);
      setEditContent("");
    }
  };

  const requestEditMemoryCenterRecord = (record: MemoryCenterRecord,singleClaim=false) => {
    if(!singleClaim&&(episodeCards.find(card=>card.id===record.id)?.memberClaimIds.length||0)>1){setMemoryCenterActionMenuId(null);setSelectedMemoryCenterRecord(record);return;}
    setEditTruthMode("correction");
    setMemoryCenterActionMenuId(null);
    setSelectedMemoryCenterRecord(null);
    setEditingMemoryCenterRecord(record);
    setEditMemoryCenterContent(getMemoryDisplayContent(record.content));
  };

  const closeMemoryCenterEdit = () => {
    setEditingMemoryCenterRecord(null);
    setEditMemoryCenterContent("");
  };

  const saveMemoryCenterEdit = async () => {
    const record = editingMemoryCenterRecord;
    const content = editMemoryCenterContent.trim();
    if (!record || !content) return;

    if (record.recordType === "compatibility") {
      const item = memories.find((candidate) => candidate.id === record.id);
      if (!item || !(await saveCompatibilityMemoryEdit(item, content))) return;
      closeMemoryCenterEdit();
      return;
    }

    if (record.recordType === "truth") {
      const claim = knowledgeClaims.find((candidate) => candidate.id === record.id);
      if (!claim) {
        alert("未找到对应的 Truth 原记录，无法编辑。");
        return;
      }
      const scope = {
        relationId: claim.relationId,
        characterId: claim.characterId,
        userIdentityId: claim.userIdentityId,
        conversationId: claim.conversationId,
      };
      const replacement = createManualKnowledgeClaim({
        id: `claim:manual:memory-center:${claim.id}:${Date.now()}`,
        scope,
        classification: { kind: claim.kind, subject: claim.subject, temporalStatus: claim.temporalStatus },
        statement: content,
        sourceRecordId: claim.source.sourceRecordId || claim.id,
        recordedAt: Date.now(),
        sourceApp: "memory",
      });
      if (!replacement) {
        alert("修改内容未通过长期认知审核。");
        return;
      }
      const write = claim.status === "active"
        ? (await confirmMemoryPersistence(supersedeKnowledgeClaimGroup(scope, groupedClaimIds(claim,loadKnowledgeClaims().value), replacement, editTruthMode)))
        : (await confirmMemoryPersistence(appendKnowledgeClaim(replacement)));
      if (!write.success) {
        alert("记忆修改失败，原记录保持不变。");
        return;
      }
      closeMemoryCenterEdit();
      return;
    }

    if (record.recordType === "summary") {
      const write = (await confirmMemoryPersistence(saveConversationSummaries(allConversationSummaries.map((summary) => summary.id === record.id
        ? { ...summary, summary: content, generatedAt: Date.now(), generator: "memory-ui.manual.v1", status: "active" as const }
        : summary))));
      if (!write.success) {
        alert("对话摘要修改失败，原记录保持不变。");
        return;
      }
    } else {
      const write = (await confirmMemoryPersistence(saveBehaviorCorrections(allBehaviorCorrections.map((correction) => correction.id === record.id
        ? { ...correction, instruction: content, updatedAt: Date.now(), status: "active" as const }
        : correction))));
      if (!write.success) {
        alert("规则记忆修改失败，原记录保持不变。");
        return;
      }
    }
    closeMemoryCenterEdit();
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
    const claim=record.recordType==="truth"?knowledgeProjection.find(item=>item.id===record.id):undefined;
    const episode=episodeCards.find(card=>card.id===record.id);
    const displayContent=memoryGalleryDisplayText(getMemoryDisplayContent(record.content));
    const categoryLabel=galleryCategory==="life"?(record.provenance.app==="diary"?"日记感受":claim?.source.experience?.kind==="insight"?"感悟":claim?.source.experience?.kind==="strong_emotion"?"情绪触动":"经历"):claim?(episode?.categoryIds||memoryGalleryCategories(claim)).map(id=>MEMORY_GALLERY_CATEGORIES.find(category=>category.id===id)?.title).filter(Boolean).join(" · ")||"记忆":record.recordType==="summary"?"交流回顾":"相处规则";
    const character = record.scope.characterId
      ? displayCharacters.find((candidate) => candidate.id === normalizeCharacterId(record.scope.characterId!))
      : undefined;
    const recallDisplay = getMemoryCenterRecallDisplay(record);
    const actionMenuKey = `${record.recordType}-${record.id}`;
    const isActionMenuOpen = memoryCenterActionMenuId === actionMenuKey;
    const memoryCenterHeaderControlClass = "memory-card-control";
    return (
      <motion.div
        key={`${record.recordType}-${record.id}`}
        role="article"
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="memory-content-card relative"
      >
        <div className="memory-card-header">
          <div className="min-w-0">
            <p className="memory-card-author">{character?.name || "未绑定角色"}</p>
            <p className="memory-card-time">整理于 {formatTime(record.recordedAt)}</p>
          </div>
          <div className="memory-card-actions">

            {/* Detail stays visible on the card; state-changing actions live in the overflow menu. */}
            <button
              type="button"
              onClick={() => setSelectedMemoryCenterRecord(record)}
              className={memoryCenterHeaderControlClass}
              aria-label={`查看${MEMORY_CENTER_TYPE_LABELS[record.recordType]}详情`}
            >
              详情
            </button>
            <button
              type="button"
              onClick={() => setMemoryCenterActionMenuId(isActionMenuOpen ? null : actionMenuKey)}
              className={`${memoryCenterHeaderControlClass} memory-card-more`}
              aria-label="更多记忆操作"
              aria-expanded={isActionMenuOpen}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            {isActionMenuOpen && (
              <div className="memory-card-menu">
                <button
                  type="button"
                  onClick={() => requestEditMemoryCenterRecord(record)}
                  className="memory-card-menu-item"
                >
                  <Edit3 aria-hidden="true" className="h-4 w-4" />
                  编辑记忆
                </button>
                {record.recordType === "truth" && record.status === "active" && (
                  <button type="button" onClick={async () => {
                    const claim = knowledgeClaims.find((item) => item.id === record.id); if (!claim) return;
                    const result = (await confirmMemoryPersistence(setCoreMemory(claim.id, claim, !claim.coreMemory,cardClaimIds(record,loadKnowledgeClaims().value))));
                    if (!result.success) alert("核心记忆保存失败，原记录保留。");
                    setMemoryCenterActionMenuId(null);
                  }} className="memory-card-menu-item">
                    <Brain aria-hidden="true" className="h-4 w-4" />
                    {knowledgeClaims.find((item) => item.id === record.id)?.coreMemory ? "取消重点记住" : "重点记住"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => requestDeleteMemoryCenterRecord(record, "permanent")}
                  className="memory-card-menu-item memory-card-danger"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  删除记忆
                </button>
              </div>
            )}
          </div>
        </div>
        <h3 className="mt-3 break-words text-sm font-semibold leading-6 text-slate-900">{episode?.episodeTitle||displayContent}</h3>
        {episode?.episodeTitle&&<p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 ${character?.archiveTemplateType==="delicate"?"":"line-clamp-3"}`}>{displayContent}</p>}
        {claim&&<p className="mt-2 text-xs text-slate-500">{episode?.evidenceLabel||memoryGalleryEvidenceLabel(claim)}{claim.coreMemory?" · 特别重要":""}</p>}

        <div className="memory-card-categories">{categoryLabel.split(" \u00b7 ").map(label=><span key={label} className="memory-card-category">{label}</span>)}</div>
      </motion.div>
    );
  };

  return (
    isActive ? <div data-theme-page="memory" className="w-full h-full bg-[var(--app-bg)] text-[var(--text-primary)] flex flex-col font-sans select-none relative overflow-hidden">
      {/* Upper Navigation Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-transparent border-0 z-10 shrink-0 relative">
        <button
          onClick={onClose}
          aria-label="返回"
          className="app-nav-icon-button w-8 h-8 flex items-center justify-center rounded-none border-0 bg-transparent shadow-none transition-colors z-10 shrink-0"
        >
          <ChevronLeft className="w-4 h-4 text-slate-700" />
        </button>
        
        <button type="button" aria-label="选择记忆人物" aria-haspopup="dialog" onClick={()=>setShowCharacterPicker(true)} className="memory-character-trigger absolute left-1/2 flex min-h-11 max-w-[65%] -translate-x-1/2 items-center gap-2 rounded-xl px-3 text-sm font-semibold focus-visible:ring-2">
          {selectedMemoryCharacter&&<img src={selectedMemoryCharacter.avatar} alt="" className="h-7 w-7 rounded-full object-cover"/>}<span className="truncate">{selectedMemoryCharacter?.remark||selectedMemoryCharacter?.name||"选择人物"}</span><span className="memory-character-chevron"><ChevronDown aria-hidden="true" className="h-4 w-4" /></span>
        </button>
        <div className="relative z-20">
          <button
            onClick={() => setShowMenu(!showMenu)}
            aria-label="记忆菜单" aria-expanded={showMenu}
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
                  role="menu" aria-label="记忆操作" className="memory-menu absolute right-0 mt-2 z-40"
                >
                  {[
                    {label:"手动总结",Icon:Plus,action:()=>setIsAddingItem(true)},
                    {label:"自动总结",Icon:Sliders,action:openAutoSummaryModal},
                    {label:"立即总结",Icon:Sparkles,action:openImmediateSummaryModal},
                    {label:"向量记忆",Icon:Database,action:()=>setShowApiPoolModal(true)},
                  ].map(({label,Icon,action})=><button key={label} type="button" role="menuitem" onClick={()=>{setShowMenu(false);action();}}
                    className="memory-menu-item"><Icon aria-hidden="true" className="h-4 w-4 shrink-0"/>{label}</button>)}
                  <input ref={restoreBackupRef} type="file" accept="application/json,.json" onChange={restoreMemoryBackup} className="hidden" />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Container */}
      <LegacyMemoryCompatibilityNotice />
      <MemoryCharacterPicker open={showCharacterPicker} selectedId={selectedCharacterId} characters={displayCharacters} onClose={()=>setShowCharacterPicker(false)} onSelect={id=>{
        setSelectedCharacterId(id);rememberMemoryCharacterSelection(activeIdentityId,id);setSelectedRelationId("all");setSearchQuery("");setSelectedMemoryCenterRecord(null);setMemoryCenterActionMenuId(null);setGalleryCategory(null);setMemoryView("memories");setShowTypeFilter(false);setShowCharacterPicker(false);
      }}/>
      <div data-memory-scroll tabIndex={0} role="region" aria-label="记忆列表" className="memory-home-content flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
                  已为 {displayCharacters.find(c => c.id === normalizeCharacterId(immediateSummaryTask.characterId))?.name || "角色"} 处理并保存 {immediateSummaryTask.extractedCount} 条候选资料
                  {immediateSummaryTask.archiveStats && ` · 事实 ${immediateSummaryTask.archiveStats.acceptedTruthCount} · 摘要 ${immediateSummaryTask.archiveStats.summaryCount}`}
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

        {/* Search and optional type filter */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索当前角色的记忆"
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
            <div className="memory-category-popover">
        <div className="memory-category-filter" aria-label="筛选记忆分类">
          <button type="button" onClick={()=>{setGalleryCategory(null);setMemoryView("memories");setActiveRecordType("all");setShowTypeFilter(false);}} className={`min-h-10 shrink-0 rounded-full border px-3 text-xs ${!galleryCategory?"bg-slate-900 text-white":"bg-white text-slate-600"}`}>全部记忆</button>
          {MEMORY_GALLERY_CATEGORIES.map(category=><button key={category.id} type="button" onClick={()=>{setActiveRecordType("all");setShowTypeFilter(false);setGalleryCategory(category.id);setMemoryView(category.id==="impressions"?"impressions":category.id==="changes"||category.id==="life"?"changes":"memories");}} className={`min-h-10 shrink-0 rounded-full border px-3 text-xs ${galleryCategory===category.id?"bg-slate-900 text-white":"bg-white text-slate-600"}`}>{category.title}</button>)}
        </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {selectedCharacterId !== "all" && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button onClick={() => setSelectedRelationId("all")} className={`px-3 py-1 rounded-full text-[10px] font-bold shrink-0 ${selectedRelationId === "all" ? "bg-slate-700 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>全部关系</button>
              {selectedCharacterRelations.map((relation) => (
                <button key={relation.id} onClick={() => setSelectedRelationId(relation.id)} title={relation.userIdentityId} className={`px-3 py-1 rounded-full text-[10px] font-bold shrink-0 ${selectedRelationId === relation.id ? "bg-slate-700 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
                  {getIdentityLabel(relation.userIdentityId)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Unified memory center list */}

        {selectedMemoryCharacter&&<MemoryContinuityPanel characters={characters} relationships={relationships} memories={memories}
          settings={settings}
          claims={knowledgeProjection} identityId={activeIdentityId} characterId={selectedCharacterId}
          showNavigation={false} contentMode={galleryCategory==="life"?"life":galleryCategory==="changes"?"changes":undefined}
          formatRecordedAt={formatTime} lifeMemoryCards={galleryCategory==="life"?filteredMemoryCenterRecords.map(record=>({id:`memory:${record.id}`,time:record.recordedAt,card:renderMemoryCenterRecord(record)})):undefined}
          relationId={selectedRelationId} query={searchQuery} view={memoryView} onView={setMemoryView} onSaveMemories={onSaveMemories} />}
        {(memoryView === "memories") && <div className="space-y-3">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider pl-1 flex items-center gap-1.5">
            {galleryCategory==="old"?"保留的交流资料":"记忆内容"} ({filteredMemoryCenterRecords.length})
          </h2>
          <AnimatePresence key={`${activeIdentityId}:${selectedCharacterId}`} mode="popLayout">
            {filteredMemoryCenterRecords.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm"
              >
                <Brain className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-xs font-bold text-slate-700">暂无符合条件的记忆</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">新的记忆会显示在这里，可以通过上方标签筛选。</p>
              </motion.div>
            ) : (
              filteredMemoryCenterRecords.slice(0, visibleRecordCount).map(renderMemoryCenterRecord)
            )}
          </AnimatePresence>
          <MemoryAutoLoad count={visibleRecordCount} total={filteredMemoryCenterRecords.length} onLoad={() => setVisibleRecordCount(count => Math.min(count + 30, filteredMemoryCenterRecords.length))} />
        </div>}
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
                  手动总结
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
                    {scopedRelationships.filter((relation) => relation.characterId === normalizeCharacterId(newCharId)).map((relation) => (
                      <option key={relation.id} value={relation.id}>{getIdentityLabel(relation.userIdentityId)}</option>
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

      {/* MODAL: Edit memory center record */}
      <AnimatePresence>
        {editingMemoryCenterRecord && (() => {
          const record = editingMemoryCenterRecord;
          const typeLabel = MEMORY_CENTER_TYPE_LABELS[record.recordType];
          const description = record.recordType === "truth"
            ? "保存后会保留原事实，并生成一条新的确认事实。"
            : record.recordType === "compatibility"
              ? "保存后会更新兼容记忆，并保留原 Truth 的替代关系。"
              : record.recordType === "summary"
                ? "这是系统摘要的人工修订，后续自动总结可能再次更新它。"
                : "这是规则内容的人工修订。";
          return (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-md rounded-[24px] border border-slate-100 bg-white p-5 shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="memory-center-edit-title"
              >
                <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 id="memory-center-edit-title" className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                      <Edit3 className="h-4 w-4 text-neutral-800" />
                      编辑{typeLabel}
                    </h3>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeMemoryCenterEdit}
                    className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="关闭记忆编辑"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 space-y-1.5">
                  <label htmlFor="memory-center-edit-content" className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    记忆内容
                  </label>
                  <textarea
                    id="memory-center-edit-content"
                    value={editMemoryCenterContent}
                    onChange={(event) => setEditMemoryCenterContent(event.target.value)}
                    rows={5}
                    autoFocus
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium leading-relaxed text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                  />
                </div>
                {record.recordType === "truth" && <label className="mt-3 block text-xs text-slate-600">本次修改的含义
                  <select aria-label="事实修改方式" value={editTruthMode} onChange={(event) => setEditTruthMode(event.target.value as "correction" | "change")} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3">
                    <option value="correction">纠正旧记录：旧内容有误，不再作为事实使用</option>
                    <option value="change">事实发生变化：旧状态曾成立，保留为历史</option>
                  </select>
                </label>}
                <div className="mt-4 flex gap-2.5">
                  <button
                    type="button"
                    onClick={closeMemoryCenterEdit}
                    className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={saveMemoryCenterEdit}
                    disabled={!editMemoryCenterContent.trim()}
                    className="flex-1 rounded-xl bg-neutral-950 py-2.5 text-xs font-bold text-white transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    保存修改
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
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

                {selectedDiagnosticRelation && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-[10px] leading-relaxed text-slate-500">
                    <p className="font-bold text-slate-700">最近一次真实聊天注入</p>
                    {runtimeTruthDiagnostics ? (
                      <>
                        <p className="mt-1">查询：<strong className="text-slate-700">{runtimeTruthDiagnostics.queryText || "（无显式查询）"}</strong></p>
                        <p className="mt-1">候选 Truth {runtimeTruthDiagnostics.candidateClaimCount} 条，已注入 {runtimeTruthDiagnostics.injectedClaimIds.length} 条；摘要 {runtimeTruthDiagnostics.injectedSummaryIds.length} 条；修正 {runtimeTruthDiagnostics.injectedCorrectionIds.length} 条。</p>
                        <p className="mt-1">向量兜底：{runtimeTruthDiagnostics.vectorFallbackUsed ? "已启用" : "未使用"}。这份记录只保存在当前页面运行期间，不写入聊天内容。</p>
                        <details className="mt-2">
                          <summary className="cursor-pointer">候选与最终注入记录</summary>
                          <p className="mt-1 break-all">最终注入：{runtimeTruthDiagnostics.injectedClaimIds.join("、") || "无"}</p>
                          {runtimeTruthDiagnostics.candidateDecisions?.map(row => <p key={row.claimId} className="mt-1 break-all">
                            {row.claimId} · {row.reason === "already_prompted" ? "已在近期上下文" : row.reason === "selected" ? "已选中" : "相关性不足或预算未选中"} · 相关性 {row.relevance}
                          </p>)}
                        </details>
                      </>
                    ) : (
                      <p className="mt-1">当前关系还没有产生可读取的直接聊天注入诊断；发送一轮消息后再打开这里即可查看。</p>
                    )}
                  </div>
                )}

                {diagnosticItems.length === 0 ? (
                  <details className="rounded-xl border border-slate-100 p-3 text-[10px] text-slate-500">
                    <summary className="cursor-pointer">来源与状态诊断</summary>
                    {selectedDiagnosticClaims.map(claim => <p key={claim.id} className="mt-2 break-all">
                      {JSON.stringify({ id: claim.id, kind: claim.kind, temporalStatus: claim.temporalStatus, truthStatus: claim.truthStatus,
                        authorship: claim.source.authorship, quotedMessageId: claim.source.quotedMessageId, messageAuthors: claim.source.messageAuthors,
                        supersededById: claim.supersededById, statementAt: claim.source.statementAt, recordedAt: claim.recordedAt })}
                    </p>)}
                  </details>
                ) : null}
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
          const claim=knowledgeProjection.find(item=>item.id===record.id);
          const episode=episodeCards.find(card=>card.id===record.id);
          const detailSummaries=conversationSummaries.filter(summary=>summary.status==="active"&&(episode?.relatedSummaryIds.includes(summary.id)||claim&&relatedMemorySummaries(claim,[summary]).length>0)&&isConversationSummarySourceValid(summary,knowledgeProjection));
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
                className="memory-detail-dialog flex max-h-[90%] w-full max-w-md flex-col overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-2xl"
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
                  <div className="memory-detail-intro text-left">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="py-1 text-xs font-medium text-slate-600">{MEMORY_CENTER_TYPE_LABELS[record.recordType]}</span>
                      <span className="py-1 text-xs font-medium text-slate-600">{MEMORY_CENTER_LAYER_LABELS[record.layer]}</span>
                      <span className="py-1 text-xs font-medium text-slate-600">{statusLabel[record.status]}</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-xs font-medium leading-relaxed text-slate-700">{memoryGalleryDisplayText(getMemoryDisplayContent(record.content))}</p>
                  </div>

                  <div className="memory-detail-metadata grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-400">
                    <span>来源应用：<strong className="text-slate-600">{MEMORY_CENTER_SOURCE_LABELS[record.provenance.app]}</strong></span>
                    <span>重要性：<strong className="text-slate-600">{record.importance>=8?"特别重要":record.importance>=6?"重要":"一般"}</strong></span>
                    <span className="col-span-2">整理时间：<strong className="text-slate-600">{new Date(record.recordedAt).toLocaleString("zh-CN")}</strong></span>
                    <span className="col-span-2">依据：<strong className="text-slate-600">{knowledgeProjection.find(claim=>claim.id===record.id)?memoryGalleryEvidenceLabel(knowledgeProjection.find(claim=>claim.id===record.id)!):"保留的交流资料"}</strong></span>
                  </div>

                  <div className="rounded-xl border border-slate-100 p-3 text-[10px] leading-relaxed text-slate-500">
                    <p className="font-bold text-slate-700">来源追溯</p>
                    <p className="mt-1 whitespace-pre-wrap break-words">{record.provenance.app==="diary"?"来自角色日记反思，不展示日记正文":knowledgeProjection.find(claim=>claim.id===record.id)?.source.evidenceQuote || "这条资料没有保留可直接展示的原话，不能补写来源。"}</p>
                    {knowledgeClaims.filter(claim=>knowledgeProjection.find(item=>item.id===record.id)?.mergedClaimIds?.includes(claim.id)
                      &&claim.characterId===record.scope.characterId&&claim.relationId===record.scope.relationId&&claim.userIdentityId===record.scope.userIdentityId
                      &&claim.conversationId===record.scope.conversationId).map(claim=><details key={claim.id} className="mt-2"><summary className="min-h-10 cursor-pointer">合并的相关记录</summary><p className="whitespace-pre-wrap break-words">{memoryGalleryDisplayText(claim.statement)}</p><p className="mt-1 whitespace-pre-wrap break-words">{claim.source.app==="diary"?"来自角色日记反思，不展示日记正文":claim.source.evidenceQuote||"未保留可展示的原话"}</p></details>)}
                    {record.provenance.sourceClaimIds?.map(id=>knowledgeProjection.find(claim=>claim.id===id)).filter(Boolean).map(claim=><p key={claim!.id} className="mt-2 whitespace-pre-wrap break-words">{claim!.statement}</p>)}
                    {(record.supersedesId || record.supersededById) && (
                      <p className="mt-1 break-words">{record.supersedesId?"之前的记录：":"后续的记录："}{knowledgeProjection.find(claim=>claim.id===(record.supersedesId||record.supersededById))?.statement||"原记录已不可用"}</p>
                    )}
                  </div>

                  {episode&&episode.memberClaimIds.length>1&&<section className="space-y-3 rounded-xl border border-slate-100 p-3" aria-label="记忆中的重点"><h4 className="text-sm font-medium">记忆中的重点</h4>
                    {episode.memberClaimIds.map(id=>{const member=memoryCenterRecords.find(item=>item.id===id&&item.recordType==="truth"),evidence=knowledgeProjection.find(item=>item.id===id);return member&&<div key={id} className="border-t border-slate-100 pt-2"><p className="whitespace-pre-wrap text-sm leading-6">{memoryGalleryDisplayText(member.content).replace(/^用户/u,"你")}</p>{evidence&&<><p className="mt-1 text-xs text-slate-500">{memoryGalleryEvidenceLabel(evidence)}</p><details className="mt-2 text-xs text-slate-500"><summary>原话与来源</summary><p className="mt-2 whitespace-pre-wrap break-words">{evidence.source.app==="diary"?"来自角色日记反思，不展示日记正文":evidence.source.evidenceQuote||"没有可直接展示的原话"}</p><p className="mt-1">{MEMORY_CENTER_SOURCE_LABELS[member.provenance.app]} · {new Date(evidence.recordedAt).toLocaleString("zh-CN")}</p></details></>}<button type="button" onClick={()=>requestEditMemoryCenterRecord(member,true)} className="memory-detail-edit" aria-label="编辑这条信息" title="编辑这条信息"><Edit3 aria-hidden="true" className="h-4 w-4" /></button></div>;})}
                  </section>}
        {claim&&detailSummaries.length>0&&<details className="mt-3 border-t border-slate-100 pt-2"><summary className="min-h-11 cursor-pointer text-xs text-slate-600">回顾相关交流</summary>
          {detailSummaries.map(summary=><p key={summary.id} className="mb-3 whitespace-pre-wrap text-sm leading-6">{summary.summary}</p>)}
        </details>}
                  <div className="memory-detail-recall">
                    {recallEligible ? <button type="button" role="switch" aria-label="参与召回" aria-checked={!recallDisabled}
                      onClick={()=>toggleMemoryCenterRecall(record)} className="memory-recall-switch">
                      <span>{recallDisplay.label}</span>
                      <span aria-hidden="true" className="memory-recall-track"><span /></span>
                    </button> : <span className="memory-recall-unavailable">{recallDisplay.label}</span>}
                    <p>{recallEligible?"点击切换召回状态；原文、来源和历史记录始终保留。":"当前资料由系统管理或已失效，不支持单条切换。"}</p>
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* MODAL: Vector memory */}
      {showApiPoolModal && onSaveEmbeddingConfiguration && <MemorySemanticSettings
        configuration={embeddingConfiguration} onSave={onSaveEmbeddingConfiguration}
        progress={<MemoryVectorProgress configuration={embeddingConfiguration} claims={knowledgeClaims} relationships={relationships} identityId={activeIdentityId} characterId={selectedCharacterId} relationId={selectedRelationId}/>}
        onClose={() => setShowApiPoolModal(false)} />}

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
                        自动整理始终开启。范围为 10 至 100 轮，默认 50 轮；达到轮数后检查这段交流，只保留有意义的内容。
                      </p>
                  </div>

                  {/* Template Type Choice */}
                  <div className="space-y-2 border-t border-slate-100 pt-3.5">
                    <span className="text-xs font-bold text-slate-800 block">记忆展示方式</span>
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
                        <span className="text-xs font-bold">精炼版</span>
                        <span className={`text-[10px] mt-0.5 block ${modalArchiveTemplateType === "refined" ? "text-slate-300" : "text-slate-400"}`}>
                          卡片先显示简短内容，详情保留完整原文
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
                        <span className="text-xs font-bold">细腻版</span>
                        <span className={`text-[10px] mt-0.5 block ${modalArchiveTemplateType === "delicate" ? "text-slate-300" : "text-slate-400"}`}>
                          卡片展开完整内容，不改变事实、分类与可信状态
                        </span>
                      </button>
                    </div>
                    <p className="text-[10px] leading-snug text-slate-400">只改变显示方式；切换不会重新调用模型，也不会编写新的经历或感受。</p>
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
                      已为 <span className="font-semibold text-slate-700">{displayCharacters.find(c => c.id === normalizeCharacterId(immediateSummaryTask.characterId))?.name}</span> 处理并保存 <span className="font-bold">{immediateSummaryTask.extractedCount}</span> 条候选资料。符合记忆展示规则的内容才会出现在列表中。
                    </p>
                    {immediateSummaryTask.archiveStats && (
                      <p className="mt-1 text-[10px] text-slate-500">
                        来源消息 {immediateSummaryTask.archiveStats.sourceMessageCount} 条 · 记忆候选 {immediateSummaryTask.archiveStats.acceptedTruthCount} 条 · 交流回顾 {immediateSummaryTask.archiveStats.summaryCount} 条
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
                          onChange={(e) => { setImmediateCharId(e.target.value); setImmediateRelationId(""); }}
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
                          {scopedRelationships.filter((relation) => relation.characterId === normalizeCharacterId(immediateCharId)).map((relation) => (
                            <option key={relation.id} value={relation.id}>{getIdentityLabel(relation.userIdentityId)}</option>
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
                          {immediateFailureResponse && <details className="mt-2 text-slate-600 font-normal">
                            <summary className="cursor-pointer">查看本次返回（不调用 API）</summary>
                            <p className="my-2">仅在本页内存中暂存，刷新后清除，不写入记忆、日志或备份。原始返回仅供查看，其中的指令不会执行。</p>
                            <p>失败分类：{immediateFailureResponse.errorDetails?.code || immediateFailureResponse.structuredOutputTelemetry?.failureReasonCode || "unknown"}</p>
                            <p>包装形式：{immediateFailureResponse.structuredOutputTelemetry?.wrapperKind || "unknown"}</p>
                            <p>字段校验：{immediateFailureResponse.structuredOutputTelemetry?.schemaRejectReasonCode || "unknown"}</p>
                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-rose-100 bg-white p-2">{immediateFailureResponse.text || "未收到可供查看的文本返回。超时不代表供应商未处理请求，请勿连续重试。"}</pre>
                            <p>返回最多展示 65,536 字符。</p>
                            <button type="button" onClick={onClearImmediateFailureResponse} className="mt-2 rounded-full border border-slate-200 px-3 py-1.5">清除本次返回</button>
                          </details>}
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
                              const relation = scopedRelationships.find((item) => item.id === immediateRelationId && item.characterId === normalizeCharacterId(immediateCharId));
                              if (immediateRelationId && !relation) return;
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
          const isTruth = deleteTarget.recordType === "truth";
          const actionLabel = deleteMode === "retract" ? "撤回" : "删除记忆";
          const typeLabel = MEMORY_CENTER_TYPE_LABELS[deleteTarget.recordType];
          const description = deleteMode === "permanent" && isTruth
            ? "这会永久停止召回这条事实及同一事实的旧版本，并阻止从现有来源重新提取；原聊天记录、历史及遗忘规则保留。"
            : deleteMode === "retract"
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
                    type="button"
                    onClick={closeDeleteDialog}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
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
    </div> : null
  );
}
