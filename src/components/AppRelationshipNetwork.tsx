import React, { useEffect, useMemo, useRef, useState } from "react";
import { RelationshipPeopleView, PersonAvatar } from "../features/relationshipNetwork/components/RelationshipPeopleView";
import { readRelationshipView, saveRelationshipView } from "../features/relationshipNetwork/services/relationshipViewPreference";
import { generateRelationshipPeople, personNameKey } from "../features/relationshipNetwork/services/generateRelationshipPeople";
import { saveGeneratedRelationshipPeople, type RelationshipPersonSelection } from "../features/relationshipNetwork/services/saveGeneratedRelationshipPeople";
import { relationshipNeighbors, relationshipCharacterGraph } from "../domain/relationshipNetwork/relationshipPeople";
import { LayoutGrid, Network, ChevronDown } from "lucide-react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Hand,
  Link2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { createId } from "../core/id/createId";
import {
  listRelationshipNetworkChatLinksForIdentity,
  upsertRelationshipNetworkChatLink,
} from "../core/storage/repositories/relationshipNetworkChatLinkRepository";
import {
  listRelationshipNetworkSocialLinksForEdge,
  listRelationshipNetworkSocialLinksForIdentity,
  removeRelationshipNetworkSocialLink,
  removeRelationshipNetworkSocialLinksForEntity,
  upsertRelationshipNetworkSocialLink,
} from "../core/storage/repositories/relationshipNetworkSocialLinkRepository";
import {
  listRelationshipNetworkInteractionRecordsForIdentity,
  listRelationshipNetworkInteractionRecordsForSocialLink,
  removeRelationshipNetworkInteractionRecordsForEntity,
  removeRelationshipNetworkInteractionRecordsForSocialLink,
} from "../core/storage/repositories/relationshipNetworkInteractionRepository";
import { removeRelationshipNetworkNpcAutomationState } from "../core/storage/repositories/relationshipNetworkNpcAutomationRepository";
import { listRelationshipNetworkPendingMomentsForIdentity, removeRelationshipNetworkPendingMoment } from "../core/storage/repositories/relationshipNetworkPendingMomentRepository";
import {
  listRelationshipNetworkMapsForIdentity,
  listRelationshipNetworkNpcsForIdentity,
  removeRelationshipNetworkNpc,
  upsertRelationshipNetworkMap,
  upsertRelationshipNetworkNpc,
} from "../core/storage/repositories/relationshipNetworkRepository";
import { createEmptyRelationshipNetwork, createRelationshipNetworkNpc } from "../domain/relationshipNetwork/relationshipNetworkTypes";
import type {
  RelationshipNetworkEdge,
  RelationshipNetworkEdgeDirection,
  RelationshipNetworkEntityType,
  RelationshipNetworkMap,
  RelationshipNetworkNode,
  RelationshipNetworkNpc,
  RelationshipNetworkMomentCommentFrequency,
  RelationshipNetworkInteractionApprovalMode,
  RelationshipNetworkNpcMomentApprovalMode,
  RelationshipNetworkNpcMomentAutoFrequency,
  RelationshipNetworkNpcMomentAutoMode,
} from "../domain/relationshipNetwork/relationshipNetworkTypes";
import type { Character, UserIdentity, UserSettings, WorldBookEntry } from "../types";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";

const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 760;
const NODE_WIDTH = 174;
const NODE_HEIGHT = 90;
const MIN_SCALE = 0.55;
const MAX_SCALE = 1.35;

interface AppRelationshipNetworkProps {
  settings?: UserSettings;
  worldBookEntries?: WorldBookEntry[];
  activeIdentity: UserIdentity;
  characters?: Character[];
  relationships?: CharacterRelationship[];
  onOpenChat?: (characterId: string, relationId: string) => void;
  onLinkNpcToChat?: (npc: RelationshipNetworkNpc) => Promise<{ characterId: string; relationId: string } | null>;
  onGenerateNpcMoment?: (npc: RelationshipNetworkNpc) => Promise<{ success: boolean; message: string }>;
  onCheckNpcAutomation?: (npc: RelationshipNetworkNpc) => Promise<{ success: boolean; message: string }>;
  onClose: () => void;
}

interface EdgeDraft {
  id?: string;
  sourceNodeId: string;
  targetNodeId: string;
  direction: RelationshipNetworkEdgeDirection;
  forwardLabel: string;
  reverseLabel: string;
  category: string;
  note: string;
}

interface SocialDraft {
  id?: string;
  sourceEntityType: RelationshipNetworkEntityType;
  sourceEntityId: string;
  targetEntityType: RelationshipNetworkEntityType;
  targetEntityId: string;
  relationshipLabel: string;
  enabled: boolean;
  canViewMoments: boolean;
  canCommentMoments: boolean;
  canLikeMoments?: boolean;
  canReplyMoments?: boolean;
  interactionApprovalMode?: RelationshipNetworkInteractionApprovalMode;
  commentFrequency: RelationshipNetworkMomentCommentFrequency;
}

function socialStatusLabel(link?: { enabled: boolean; canViewMoments: boolean; canCommentMoments: boolean; canLikeMoments?: boolean; canReplyMoments?: boolean }): string {
  if (!link?.enabled) return "未启用朋友圈";
  const actions = [
    link.canCommentMoments ? "评论" : "",
    link.canLikeMoments ? "点赞" : "",
    link.canReplyMoments ? "回复" : "",
  ].filter(Boolean);
  if (actions.length === 1 && link.canCommentMoments) return "可发表评论";
  if (actions.length === 1 && link.canLikeMoments) return "可点赞";
  if (actions.length === 1 && link.canReplyMoments) return "可回复评论";
  if (actions.length > 0) return `可${actions.join("/")}`;
  if (link.canViewMoments) return "仅可查看";
  return "已启用 · 无权限";
}

function interactionStatusLabel(status: "completed" | "failed" | "skipped" | "pending"): string {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "pending") return "待确认";
  return "已跳过";
}

function interactionActionLabel(action: "comment" | "like" | "reply"): string {
  if (action === "like") return "点赞";
  if (action === "reply") return "回复";
  return "评论";
}

function npcAutoModeLabel(mode?: RelationshipNetworkNpcMomentAutoMode): string {
  if (mode === "scheduled") return "按时间自动生成";
  if (mode === "event") return "按聊天/关系事件自动生成";
  if (mode === "scheduled_and_event") return "按时间或事件自动生成";
  return "关闭自动生成";
}

function normalizeNpcAutoModeForEditor(mode?: RelationshipNetworkNpcMomentAutoMode): RelationshipNetworkNpcMomentAutoMode {
  if (mode === "manual" || mode === "scheduled_and_event" || !mode) return mode || "manual";
  // Keep legacy NPC configurations selectable after the editor is simplified.
  return "scheduled_and_event";
}

function npcAutoFrequencyLabel(frequency?: RelationshipNetworkNpcMomentAutoFrequency): string {
  if (frequency === "low") return "低频";
  if (frequency === "high") return "高频";
  return "正常";
}

type PointerSession =
  | { kind: "pan"; pointerId: number; startX: number; startY: number; originX: number; originY: number }
  | { kind: "node"; pointerId: number; nodeId: string; startX: number; startY: number; originX: number; originY: number };

interface NodeViewModel {
  node: RelationshipNetworkNode;
  name: string;
  avatar?: string;
  summary: string;
  typeLabel: string;
  type: RelationshipNetworkEntityType;
  exists: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const isImageSource = (value?: string): boolean =>
  Boolean(value && (/^(https?:|data:image\/|blob:|\/)/i.test(value.trim())));

function Avatar({ value, name, className }: { value?: string; name: string; className: string }) {
  const fallback = value && !isImageSource(value) ? value : (name.trim().slice(0, 1) || "人");
  return (
    <div className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#ede9e2] text-sm font-bold text-[#70695f]`}>
      {isImageSource(value) ? (
        <>
          <img
            src={value}
            alt=""
            className="h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              event.currentTarget.nextElementSibling?.classList.remove("hidden");
            }}
          />
          <span className="hidden">{fallback}</span>
        </>
      ) : (
        <span>{fallback}</span>
      )}
    </div>
  );
}

function createInitialNetwork(ownerIdentityId: string): RelationshipNetworkMap {
  return createEmptyRelationshipNetwork({
    id: createId("relationship-network"),
    identityNodeId: createId("relationship-network-node"),
    ownerIdentityId,
    now: Date.now(),
  });
}

function rectEdgePoint(node: RelationshipNetworkNode, other: RelationshipNetworkNode) {
  const sourceX = node.x + NODE_WIDTH / 2;
  const sourceY = node.y + NODE_HEIGHT / 2;
  const targetX = other.x + NODE_WIDTH / 2;
  const targetY = other.y + NODE_HEIGHT / 2;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const safeDx = Math.abs(dx) < 0.001 ? 0.001 : Math.abs(dx);
  const safeDy = Math.abs(dy) < 0.001 ? 0.001 : Math.abs(dy);
  const ratio = Math.min((NODE_WIDTH / 2 - 6) / safeDx, (NODE_HEIGHT / 2 - 6) / safeDy);
  return {
    x: sourceX + dx * ratio,
    y: sourceY + dy * ratio,
  };
}

function edgeLabel(edge: RelationshipNetworkEdge): string {
  if (edge.direction === "reverse") return edge.reverseLabel || "关系";
  if (edge.direction === "both") return `${edge.forwardLabel || "关系"} / ${edge.reverseLabel || "关系"}`;
  return edge.forwardLabel || "关系";
}

function directionLabel(direction: RelationshipNetworkEdgeDirection): string {
  if (direction === "both") return "双向关系";
  if (direction === "reverse") return "反向关系";
  return "单向关系";
}

export default function AppRelationshipNetwork({
  settings,
  worldBookEntries = [],
  activeIdentity,
  characters = [],
  relationships = [],
  onOpenChat,
  onLinkNpcToChat,
  onGenerateNpcMoment,
  onCheckNpcAutomation,
  onClose,
}: AppRelationshipNetworkProps) {
  const [view, setView] = useState(() => readRelationshipView(activeIdentity.id));
  const [personId, setPersonId] = useState("");
  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [associationSourceId, setAssociationSourceId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState("");
  const generationLock = useRef(false);
  const [generated, setGenerated] = useState<{ characterId: string; characterName: string; rows: RelationshipPersonSelection[] } | null>(null);
  const [network, setNetwork] = useState<RelationshipNetworkMap>(() =>
    listRelationshipNetworkMapsForIdentity(activeIdentity.id)[0] || createInitialNetwork(activeIdentity.id));
  const [npcs, setNpcs] = useState<RelationshipNetworkNpc[]>(() => {
    const links = listRelationshipNetworkChatLinksForIdentity(activeIdentity.id);
    return listRelationshipNetworkNpcsForIdentity(activeIdentity.id).map((npc) => {
      const link = links.find((candidate) => candidate.npcId === npc.id);
      return link && !npc.linkedCharacterId ? { ...npc, linkedCharacterId: link.characterId } : npc;
    });
  });
  const [socialLinks, setSocialLinks] = useState(() => listRelationshipNetworkSocialLinksForIdentity(activeIdentity.id));
  const [interactionRecords, setInteractionRecords] = useState(() => listRelationshipNetworkInteractionRecordsForIdentity(activeIdentity.id));
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 0.9 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectStartNodeId, setConnectStartNodeId] = useState<string | null>(null);
  const [nodePickerOpen, setNodePickerOpen] = useState(false);
  const [npcModalOpen, setNpcModalOpen] = useState(false);
  const [editingNpcId, setEditingNpcId] = useState<string | null>(null);
  const [npcNameDraft, setNpcNameDraft] = useState("");
  const [npcAvatarDraft, setNpcAvatarDraft] = useState("");
  const [npcGenderDraft, setNpcGenderDraft] = useState("");
  const [npcAgeDraft, setNpcAgeDraft] = useState("");
  const [npcSummaryDraft, setNpcSummaryDraft] = useState("");
  const [npcRoleDraft, setNpcRoleDraft] = useState("");
  const [npcPersonalityDraft, setNpcPersonalityDraft] = useState("");
  const [npcMotivationDraft, setNpcMotivationDraft] = useState("");
  const [npcTagsDraft, setNpcTagsDraft] = useState("");
  const [npcMomentApprovalModeDraft, setNpcMomentApprovalModeDraft] = useState<RelationshipNetworkNpcMomentApprovalMode>("automatic");
  const [npcMomentAutoModeDraft, setNpcMomentAutoModeDraft] = useState<RelationshipNetworkNpcMomentAutoMode>("manual");
  const [npcMomentAutoFrequencyDraft, setNpcMomentAutoFrequencyDraft] = useState<RelationshipNetworkNpcMomentAutoFrequency>("normal");
  const [linkingNpc, setLinkingNpc] = useState(false);
  const [generatingNpcMomentId, setGeneratingNpcMomentId] = useState<string | null>(null);
  const [checkingNpcAutomationId, setCheckingNpcAutomationId] = useState<string | null>(null);
  const [npcLinkConfirmOpen, setNpcLinkConfirmOpen] = useState(false);
  const [edgeDraft, setEdgeDraft] = useState<EdgeDraft | null>(null);
  const [edgeOpenedFromNpc, setEdgeOpenedFromNpc] = useState(false);
  const [npcDeleteTarget, setNpcDeleteTarget] = useState<RelationshipNetworkNpc | null>(null);
  const [edgeModalOpen, setEdgeModalOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [nodeSearch, setNodeSearch] = useState("");
  const [nodeTypeFilter, setNodeTypeFilter] = useState<"all" | RelationshipNetworkEntityType>("all");
  const [edgeCategoryFilter, setEdgeCategoryFilter] = useState("all");
  const [npcSocialDraft, setNpcSocialDraft] = useState<SocialDraft | null>(null);
  const [socialDraft, setSocialDraft] = useState<SocialDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef(network);
  const pointerSessionRef = useRef<PointerSession | null>(null);

  useEffect(() => {
    networkRef.current = network;
  }, [network]);

  useEffect(() => {
    const stored = listRelationshipNetworkMapsForIdentity(activeIdentity.id);
    if (stored.length === 0) {
      const result = upsertRelationshipNetworkMap(network);
      if (!result.success) setError("关系网初始化失败，请检查浏览器本地存储空间。");
    }
  }, [activeIdentity.id, network]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNotice(null);
      setError(null);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [notice, error]);

  const availableCharacters = useMemo(() => {
    const seen = new Set<string>();
    return characters.filter((character) => {
      if (character.isContactInstance || character.isGroupChat || seen.has(character.id)) return false;
      seen.add(character.id);
      return true;
    });
  }, [characters]);

  const nodeModels = useMemo<NodeViewModel[]>(() => network.nodes.map((node) => {
    if (node.entityType === "identity") {
      const exists = node.entityId === activeIdentity.id;
      return {
        node,
        name: exists ? activeIdentity.name : "已删除身份",
        avatar: exists ? activeIdentity.avatar : undefined,
        summary: exists ? (activeIdentity.signature || "当前使用中的我的身份") : "该身份已经不存在",
        typeLabel: "我的身份",
        type: node.entityType,
        exists,
      };
    }
    if (node.entityType === "character") {
      const character = characters.find((item) => item.id === node.entityId);
      return {
        node,
        name: character?.name || "已删除人物",
        avatar: character?.avatar,
        summary: character?.remark || character?.personality || "角色档案",
        typeLabel: "角色",
        type: node.entityType,
        exists: Boolean(character),
      };
    }
    const npc = npcs.find((item) => item.id === node.entityId);
    return {
      node,
      name: npc?.name || "已删除 NPC",
      avatar: npc?.avatar,
      summary: npc?.summary || [npc?.role, npc?.personality].filter(Boolean).join(" · ") || "关系网辅助人物",
      typeLabel: "NPC",
      type: node.entityType,
      exists: Boolean(npc),
    };
  }), [activeIdentity, characters, network.nodes, npcs]);

  const selectedNode = nodeModels.find((model) => model.node.id === selectedNodeId);
  const currentPerson = availableCharacters.find(character => character.id === personId) || availableCharacters[0];
  const npcEditorNode = network.nodes.find(node => node.entityType === "npc" && node.entityId === editingNpcId);
  const npcEditorCenter = network.nodes.find(node => node.entityType === "character" && node.entityId === currentPerson?.id);
  const npcEditorEdge = npcEditorNode && npcEditorCenter && network.edges.find(edge => (edge.sourceNodeId === npcEditorNode.id && edge.targetNodeId === npcEditorCenter.id) || (edge.targetNodeId === npcEditorNode.id && edge.sourceNodeId === npcEditorCenter.id));
  const switchView = () => {
    setAssociationSourceId(null);
    setAddMenuOpen(false);
    const next = view === "graph" ? "cards" : "graph";
    setView(next);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setNodeSearch("");
    setNodeTypeFilter("all");
    setEdgeCategoryFilter("all");
    setConnectMode(false);
    if (!saveRelationshipView(activeIdentity.id, next).success) setError("展示方式暂未保存，下次打开可能恢复默认。");
  };
  const selectedNpc = selectedNode?.type === "npc" ? npcs.find((npc) => npc.id === selectedNode.node.entityId) : undefined;
  const linkedCharacter = selectedNpc
    ? characters.find((character) =>
        (character.ownerIdentityId || "identity-1") === activeIdentity.id
        && ((selectedNpc.linkedCharacterId && character.id === selectedNpc.linkedCharacterId)
          || character.relationshipNetworkNpcId === selectedNpc.id
          || (character.name === selectedNpc.name && character.remark === (selectedNpc.role || "来自关系网的 NPC"))))
    : undefined;
  const linkedRelationship = linkedCharacter ? relationships.find((relation) => relation.userIdentityId === activeIdentity.id && relation.characterId === linkedCharacter.id) : undefined;
  const selectedEdge = network.edges.find((edge) => edge.id === selectedEdgeId);
  const sourceName = edgeDraft ? nodeModels.find((model) => model.node.id === edgeDraft.sourceNodeId)?.name || "人物 A" : "人物 A";
  const targetName = edgeDraft ? nodeModels.find((model) => model.node.id === edgeDraft.targetNodeId)?.name || "人物 B" : "人物 B";
  const socialSourceName = socialDraft ? nodeModels.find((model) => model.type === socialDraft.sourceEntityType && model.node.entityId === socialDraft.sourceEntityId)?.name || "人物" : "人物";
  const socialTargetName = socialDraft ? nodeModels.find((model) => model.type === socialDraft.targetEntityType && model.node.entityId === socialDraft.targetEntityId)?.name || "人物" : "人物";
  const socialTargetTypeLabel = socialDraft?.targetEntityType === "identity"
    ? "身份"
    : socialDraft?.targetEntityType === "npc" ? "NPC" : "角色";
  const isCharacterToCharacterSocialDraft = socialDraft?.sourceEntityType === "character" && socialDraft.targetEntityType === "character";
  const isCharacterToNpcSocialDraft = socialDraft?.sourceEntityType === "character" && socialDraft.targetEntityType === "npc";
  const socialDraftNpc = socialDraft?.sourceEntityType === "npc"
    ? npcs.find((npc) => npc.id === socialDraft.sourceEntityId)
    : socialDraft?.targetEntityType === "npc"
      ? npcs.find((npc) => npc.id === socialDraft.targetEntityId)
    : undefined;
  // A lightweight NPC can participate in network interactions directly.
  // Promotion to a full character profile is optional enrichment, not a
  // prerequisite for the relationship line to work.
  const socialDraftNpcReady = Boolean(socialDraftNpc);
  const draftSocialLink = socialDraft?.id
    ? socialLinks.find((link) => link.id === socialDraft.id)
    : undefined;
  const draftInteractionRecords = draftSocialLink
    ? listRelationshipNetworkInteractionRecordsForSocialLink(activeIdentity.id, draftSocialLink.id)
    : [];

  const characterGraph = useMemo(() => relationshipCharacterGraph(network, currentPerson?.id), [network, currentPerson?.id]);
  const characterGraphIds = useMemo(() => new Set(characterGraph.nodes.map(node => node.id)), [characterGraph]);
  const visibleNodeModels = useMemo(() => {
    const query = nodeSearch.trim().toLowerCase();
    return nodeModels.filter((model) => {
      if (!characterGraphIds.has(model.node.id)) return false;
      if (nodeTypeFilter !== "all" && model.type !== nodeTypeFilter) return false;
      if (!query) return true;
      return `${model.name} ${model.summary} ${model.typeLabel}`.toLowerCase().includes(query);
    });
  }, [nodeModels, nodeSearch, nodeTypeFilter, characterGraphIds]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodeModels.map((model) => model.node.id)), [visibleNodeModels]);
  const edgeCategories = useMemo(() => {
    const categories = new Set<string>();
    characterGraph.edges.forEach((edge) => categories.add(edge.category?.trim() || "未分类"));
    return Array.from(categories).sort((left, right) => left.localeCompare(right));
  }, [characterGraph.edges]);
  const matchingEdges = useMemo(() => characterGraph.edges.filter((edge) => {
    if (!visibleNodeIds.has(edge.sourceNodeId) && !visibleNodeIds.has(edge.targetNodeId)) return false;
    if (edgeCategoryFilter === "all") return true;
    return (edge.category?.trim() || "未分类") === edgeCategoryFilter;
  }), [edgeCategoryFilter, characterGraph.edges, visibleNodeIds]);
  const visibleEdges = useMemo(() => matchingEdges.filter((edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId)), [matchingEdges, visibleNodeIds]);

  const hasEntityNode = (entityType: RelationshipNetworkEntityType, entityId: string) =>
    network.nodes.some((node) => node.entityType === entityType && node.entityId === entityId);

  const getWorldCenter = (occupied = networkRef.current.nodes) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const width = rect?.width || 390;
    const height = rect?.height || 400;
    const baseX = clamp((width / 2 - viewport.x) / viewport.scale - NODE_WIDTH / 2, 24, WORLD_WIDTH - NODE_WIDTH - 24);
    const baseY = clamp((height / 2 - viewport.y) / viewport.scale - NODE_HEIGHT / 2, 30, WORLD_HEIGHT - NODE_HEIGHT - 30);
    const candidates = [
      [0, 0], [NODE_WIDTH + 26, 0], [-(NODE_WIDTH + 26), 0], [0, NODE_HEIGHT + 28], [0, -(NODE_HEIGHT + 28)],
      [NODE_WIDTH + 26, NODE_HEIGHT + 28], [-(NODE_WIDTH + 26), NODE_HEIGHT + 28], [NODE_WIDTH + 26, -(NODE_HEIGHT + 28)], [-(NODE_WIDTH + 26), -(NODE_HEIGHT + 28)],
      [2 * (NODE_WIDTH + 26), 0], [-2 * (NODE_WIDTH + 26), 0], [0, 2 * (NODE_HEIGHT + 28)], [0, -2 * (NODE_HEIGHT + 28)],
    ];
    const overlaps = (x: number, y: number) => occupied.some((node) =>
      Math.abs((node.x + NODE_WIDTH / 2) - (x + NODE_WIDTH / 2)) < NODE_WIDTH + 18
      && Math.abs((node.y + NODE_HEIGHT / 2) - (y + NODE_HEIGHT / 2)) < NODE_HEIGHT + 18);
    const available = candidates.find(([offsetX, offsetY]) => {
      const x = clamp(baseX + offsetX, 24, WORLD_WIDTH - NODE_WIDTH - 24);
      const y = clamp(baseY + offsetY, 30, WORLD_HEIGHT - NODE_HEIGHT - 30);
      return !overlaps(x, y);
    });
    const [offsetX, offsetY] = available || candidates[0];
    return {
      x: clamp(baseX + offsetX, 24, WORLD_WIDTH - NODE_WIDTH - 24),
      y: clamp(baseY + offsetY, 30, WORLD_HEIGHT - NODE_HEIGHT - 30),
    };
  };

  const commitNetwork = (candidate: RelationshipNetworkMap, successMessage?: string): boolean => {
    const next = { ...candidate, updatedAt: Date.now() };
    const result = upsertRelationshipNetworkMap(next);
    if (!result.success) {
      setError(result.error === "scope" ? "关系网作用域校验失败，未保存本次修改。" : "关系网保存失败，请检查浏览器本地存储空间。");
      return false;
    }
    networkRef.current = next;
    setNetwork(next);
    if (successMessage) setNotice(successMessage);
    return true;
  };

  const addEntityNode = (entityType: RelationshipNetworkEntityType, entityId: string) => {
    if (associationSourceId) {
      if (entityType === "character" && entityId === associationSourceId) { setError("不能与自己建立关系。"); return; }
      const next = { ...networkRef.current, nodes: [...networkRef.current.nodes] };
      const ensure = (type: RelationshipNetworkEntityType, id: string) => {
        let node = next.nodes.find(item => item.entityType === type && item.entityId === id);
        if (!node) { node = { id: createId("relationship-network-node"), entityType: type, entityId: id, ...getWorldCenter(next.nodes) }; next.nodes.push(node); }
        return node;
      };
      const source = ensure("character", associationSourceId);
      const target = ensure(entityType, entityId);
      const existing = next.edges.find(edge => (edge.sourceNodeId === source.id && edge.targetNodeId === target.id) || (edge.targetNodeId === source.id && edge.sourceNodeId === target.id));
      if (!commitNetwork(next)) return;
      setNodePickerOpen(false); setAssociationSourceId(null);
      if (existing) openExistingEdge(existing); else openNewEdge(source.id, target.id);
      return;
    }
    if (hasEntityNode(entityType, entityId)) {
      setNotice("这个人物已经在当前画布上了。");
      return;
    }
    const position = getWorldCenter();
    const node: RelationshipNetworkNode = {
      id: createId("relationship-network-node"),
      entityType,
      entityId,
      ...position,
    };
    commitNetwork({ ...networkRef.current, nodes: [...networkRef.current.nodes, node] }, "人物已添加到画布。");
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setNodePickerOpen(false);
  };

  const createSocialDraft = (sourceNodeId: string, targetNodeId: string, networkEdgeId?: string): SocialDraft | null => {
    const source = networkRef.current.nodes.find((node) => node.id === sourceNodeId);
    const target = networkRef.current.nodes.find((node) => node.id === targetNodeId);
    if (!source || !target) return null;
    const npc = source.entityType === "npc" ? source : target.entityType === "npc" ? target : null;
    const recipient = source.entityType !== "npc" ? source : target.entityType !== "npc" ? target : null;
    const edge = networkEdgeId ? networkRef.current.edges.find((item) => item.id === networkEdgeId) : undefined;
    const isCharacterPair = source.entityType === "character" && target.entityType === "character";
    if (!isCharacterPair && (!npc || !recipient || !["character", "identity"].includes(recipient.entityType))) return null;
    const storedLinks = networkEdgeId ? listRelationshipNetworkSocialLinksForEdge(activeIdentity.id, networkEdgeId) : [];
    const directedSource = edge?.direction === "reverse" ? target : source;
    const directedTarget = edge?.direction === "reverse" ? source : target;
    const stored = storedLinks.find((link) =>
      link.sourceEntityType === directedSource.entityType
      && link.sourceEntityId === directedSource.entityId
      && link.targetEntityType === directedTarget.entityType
      && link.targetEntityId === directedTarget.entityId,
    ) || storedLinks[0];
    return {
      id: stored?.id,
      sourceEntityType: directedSource.entityType,
      sourceEntityId: directedSource.entityId,
      targetEntityType: directedTarget.entityType,
      targetEntityId: directedTarget.entityId,
      relationshipLabel: stored?.relationshipLabel || "认识",
      enabled: stored?.enabled ?? false,
      canViewMoments: stored?.canViewMoments ?? false,
      canCommentMoments: stored?.canCommentMoments ?? false,
      canLikeMoments: stored?.canLikeMoments ?? false,
      canReplyMoments: stored?.canReplyMoments ?? false,
      interactionApprovalMode: stored?.interactionApprovalMode || "automatic",
      commentFrequency: stored?.commentFrequency || "low",
    };
  };

  const resolveRelationshipLabel = (edge: RelationshipNetworkEdge, sourceEntityId: string): string => {
    const source = networkRef.current.nodes.find((node) => node.id === edge.sourceNodeId);
    const target = networkRef.current.nodes.find((node) => node.id === edge.targetNodeId);
    const label = source?.entityId === sourceEntityId
      ? edge.forwardLabel
      : target?.entityId === sourceEntityId
        ? edge.reverseLabel
        : undefined;
    return label?.trim() || "认识";
  };

  // Repair legacy social links that were saved with the old generic “好友”
  // fallback. The canvas edge is authoritative, so existing relationships
  // start using the label the user actually entered without requiring a
  // manual re-save.
  useEffect(() => {
    const currentLinks = listRelationshipNetworkSocialLinksForIdentity(activeIdentity.id);
    let changed = false;
    currentLinks.forEach((link) => {
      if (!link.networkEdgeId) return;
      const edge = networkRef.current.edges.find((item) => item.id === link.networkEdgeId);
      if (!edge) return;
      const relationshipLabel = resolveRelationshipLabel(edge, link.sourceEntityId);
      if (relationshipLabel === link.relationshipLabel) return;
      const result = upsertRelationshipNetworkSocialLink({ ...link, relationshipLabel, updatedAt: Date.now() });
      if (result.success) changed = true;
    });
    if (changed) setSocialLinks(listRelationshipNetworkSocialLinksForIdentity(activeIdentity.id));
  }, [activeIdentity.id, network.edges]);

  const openNewEdge = (sourceNodeId: string, targetNodeId: string) => {
    setEdgeDraft({
      sourceNodeId,
      targetNodeId,
      direction: "forward",
      forwardLabel: "认识",
      reverseLabel: "认识",
      category: "",
      note: "",
    });
    setSocialDraft(createSocialDraft(sourceNodeId, targetNodeId));
    setEdgeModalOpen(true);
    setConnectStartNodeId(null);
    setConnectMode(false);
  };

  const openExistingEdge = (edge: RelationshipNetworkEdge) => {
    setEdgeDraft({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      direction: edge.direction,
      forwardLabel: edge.forwardLabel || "",
      reverseLabel: edge.reverseLabel || "",
      category: edge.category || "",
      note: edge.note || "",
    });
    setSocialDraft(createSocialDraft(edge.sourceNodeId, edge.targetNodeId, edge.id));
    setEdgeModalOpen(true);
    setSelectedEdgeId(edge.id);
  };

  const saveEdge = () => {
    if (!edgeDraft) return;
    if (edgeDraft.sourceNodeId === edgeDraft.targetNodeId) {
      setError("关系线需要连接两个不同的人物。");
      return;
    }
    const forwardLabel = edgeDraft.forwardLabel.trim();
    const reverseLabel = edgeDraft.reverseLabel.trim();
    if (edgeDraft.direction !== "reverse" && !forwardLabel) {
      setError("请填写 A 指向 B 的关系描述。");
      return;
    }
    if (edgeDraft.direction !== "forward" && !reverseLabel) {
      setError("请填写 B 指向 A 的关系描述。");
      return;
    }
    const now = Date.now();
    const edge: RelationshipNetworkEdge = {
      id: edgeDraft.id || createId("relationship-network-edge"),
      sourceNodeId: edgeDraft.sourceNodeId,
      targetNodeId: edgeDraft.targetNodeId,
      direction: edgeDraft.direction,
      ...(forwardLabel ? { forwardLabel } : {}),
      ...(reverseLabel ? { reverseLabel } : {}),
      ...(edgeDraft.category.trim() ? { category: edgeDraft.category.trim() } : {}),
      ...(edgeDraft.note.trim() ? { note: edgeDraft.note.trim() } : {}),
      createdAt: edgeDraft.id ? (networkRef.current.edges.find((item) => item.id === edgeDraft.id)?.createdAt || now) : now,
      updatedAt: now,
    };
    const edges = edgeDraft.id
      ? networkRef.current.edges.map((item) => item.id === edge.id ? edge : item)
      : [...networkRef.current.edges, edge];
    if (commitNetwork({ ...networkRef.current, edges }, "关系已保存。")) {
      // Relationship editing does not change separately configured social permissions.
      setSelectedEdgeId(edge.id);
      setEdgeModalOpen(false);
      setEdgeDraft(null);
      setSocialDraft(null);
      if (edgeOpenedFromNpc) setNpcModalOpen(true);
      setEdgeOpenedFromNpc(false);
    }
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdge) return;
    if (!window.confirm("删除这条关系线？人物本身不会被删除。")) return;
    if (commitNetwork({ ...networkRef.current, edges: networkRef.current.edges.filter((edge) => edge.id !== selectedEdge.id) }, "关系线已删除。")) {
      const socialLinksForEdge = listRelationshipNetworkSocialLinksForEdge(activeIdentity.id, selectedEdge.id);
      if (socialLinksForEdge.length > 0) {
        const socialResults = socialLinksForEdge.map((socialLink) => removeRelationshipNetworkSocialLink(activeIdentity.id, socialLink.id));
        const interactionResults = socialLinksForEdge.map((socialLink) => removeRelationshipNetworkInteractionRecordsForSocialLink(activeIdentity.id, socialLink.id));
        if (socialResults.some((result) => !result.success) || interactionResults.some((result) => !result.success)) setError("关系线已删除，但朋友圈互动记录清理失败。");
        else {
          setSocialLinks(listRelationshipNetworkSocialLinksForIdentity(activeIdentity.id));
          setInteractionRecords(listRelationshipNetworkInteractionRecordsForIdentity(activeIdentity.id));
        }
      }
      setSelectedEdgeId(null);
      setEdgeModalOpen(false);
      setEdgeDraft(null);
      setSocialDraft(null);
    }
  };

  const clearSocialInteractionHistory = () => {
    if (!socialDraft?.id || draftInteractionRecords.length === 0) return;
    if (!window.confirm("清空这条关系的互动记录？不会删除朋友圈中的已有评论。")) return;
    const result = removeRelationshipNetworkInteractionRecordsForSocialLink(activeIdentity.id, socialDraft.id);
    if (!result.success) {
      setError("互动记录清理失败，请稍后重试。");
      return;
    }
    setInteractionRecords(listRelationshipNetworkInteractionRecordsForIdentity(activeIdentity.id));
    setNotice("互动记录已清空，朋友圈中的已有评论不受影响。");
  };

  const removeNodeFromCanvas = (node: RelationshipNetworkNode) => {
    if (node.entityType === "identity") {
      setError("我的身份节点不能移除。");
      return;
    }
    const nodeIds = new Set(networkRef.current.nodes.filter((item) => item.id !== node.id).map((item) => item.id));
    const removedEdges = networkRef.current.edges.filter((edge) =>
      !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId));
    const next = {
      ...networkRef.current,
      nodes: networkRef.current.nodes.filter((item) => item.id !== node.id),
      edges: networkRef.current.edges.filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)),
    };
    if (commitNetwork(next, "已从画布移除人物。")) {
      // Removing a node also removes the edges that made its social links
      // actionable. Clean those records up so a character that is no longer
      // on the canvas cannot keep replying to NPC Moments through stale data.
      const removedSocialLinks = removedEdges
        .flatMap((edge) => listRelationshipNetworkSocialLinksForEdge(activeIdentity.id, edge.id))
        .filter((link, index, links) => links.findIndex((candidate) => candidate.id === link.id) === index);
      removedSocialLinks.forEach((link) => {
        removeRelationshipNetworkSocialLink(activeIdentity.id, link.id);
        removeRelationshipNetworkInteractionRecordsForSocialLink(activeIdentity.id, link.id);
      });
      if (removedSocialLinks.length > 0) {
        setSocialLinks(listRelationshipNetworkSocialLinksForIdentity(activeIdentity.id));
        setInteractionRecords(listRelationshipNetworkInteractionRecordsForIdentity(activeIdentity.id));
      }
      setSelectedNodeId(null);
    }
  };

  const openNpcComposer = (npc?: RelationshipNetworkNpc) => {
    const node = networkRef.current.nodes.find(item => item.entityType === "npc" && item.entityId === npc?.id);
    const center = networkRef.current.nodes.find(item => item.entityType === "character" && item.entityId === currentPerson?.id);
    const edge = node && center && networkRef.current.edges.find(item => (item.sourceNodeId === node.id && item.targetNodeId === center.id) || (item.targetNodeId === node.id && item.sourceNodeId === center.id));
    setNpcSocialDraft(edge ? createSocialDraft(edge.sourceNodeId, edge.targetNodeId, edge.id) : null);
    setEditingNpcId(npc?.id || null);
    setNpcNameDraft(npc?.name || "");
    setNpcAvatarDraft(npc?.avatar || "");
    setNpcGenderDraft(npc?.gender || "");
    setNpcAgeDraft(npc?.age == null ? "" : String(npc.age));
    setNpcSummaryDraft(npc?.summary || "");
    setNpcRoleDraft(npc?.role || "");
    setNpcPersonalityDraft(npc?.personality || "");
    setNpcMotivationDraft(npc?.motivation || "");
    setNpcTagsDraft(npc?.tags?.join("、") || "");
    setNpcMomentApprovalModeDraft(npc?.momentApprovalMode || "automatic");
    setNpcMomentAutoModeDraft(normalizeNpcAutoModeForEditor(npc?.momentAutoMode));
    setNpcMomentAutoFrequencyDraft(npc?.momentAutoFrequency || "normal");
    setNpcModalOpen(true);
    setNodePickerOpen(false);
  };

  const linkSelectedNpcToChat = () => {
    if (!selectedNpc || !onLinkNpcToChat || linkingNpc) return;
    if (linkedCharacter && linkedRelationship && onOpenChat) {
      onOpenChat(linkedCharacter.id, linkedRelationship.id);
      return;
    }
    setNpcLinkConfirmOpen(true);
  };

  const confirmSelectedNpcLink = async () => {
    if (!selectedNpc || !onLinkNpcToChat || linkingNpc) return;
    setNpcLinkConfirmOpen(false);
    setLinkingNpc(true);
    const linked = await onLinkNpcToChat(selectedNpc);
    if (!linked) {
      setLinkingNpc(false);
      return;
    }
    const updatedNpc = { ...selectedNpc, linkedCharacterId: linked.characterId, updatedAt: Date.now() };
    const npcResult = upsertRelationshipNetworkNpc(updatedNpc);
    const linkResult = upsertRelationshipNetworkChatLink({
      ownerIdentityId: activeIdentity.id,
      npcId: selectedNpc.id,
      characterId: linked.characterId,
      relationId: linked.relationId,
      createdAt: selectedNpc.createdAt,
      updatedAt: updatedNpc.updatedAt,
    });
    if (!npcResult.success || !linkResult.success) {
      setError("完整角色档案已创建，但关系网人物关联标记未完全保存，请稍后重试。");
    } else {
      setNpcs(listRelationshipNetworkNpcsForIdentity(activeIdentity.id));
      setNotice("NPC 已提升为完整角色，仍保留为同一个关系网人物。");
    }
    setLinkingNpc(false);
  };

  const generateSelectedNpcMoment = async () => {
    if (!selectedNpc || !onGenerateNpcMoment || generatingNpcMomentId) return;
    setGeneratingNpcMomentId(selectedNpc.id);
    setNotice(null);
    setError(null);
    try {
      const result = await onGenerateNpcMoment(selectedNpc);
      if (result.success) setNotice(result.message);
      else setError(result.message);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "NPC 动态生成失败，请稍后重试。");
    } finally {
      setGeneratingNpcMomentId(null);
    }
  };

  const checkSelectedNpcAutomation = async () => {
    if (!selectedNpc || !onCheckNpcAutomation || checkingNpcAutomationId) return;
    setCheckingNpcAutomationId(selectedNpc.id);
    setNotice(null);
    setError(null);
    try {
      const result = await onCheckNpcAutomation(selectedNpc);
      if (result.success) setNotice(result.message);
      else setError(result.message);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "NPC 自动行为检查失败，请稍后重试。");
    } finally {
      setCheckingNpcAutomationId(null);
    }
  };

  const saveNpc = () => {
    const name = npcNameDraft.trim();
    if (!name) {
      setError("请填写 NPC 名字。");
      return;
    }
    const now = Date.now();
    const previous = editingNpcId ? npcs.find((npc) => npc.id === editingNpcId) : undefined;
    if (npcAgeDraft && npcAgeDraft !== "∞" && (!/^\d+$/.test(npcAgeDraft) || Number(npcAgeDraft) > 100000)) { setError("年龄请填写非负整数、∞或留空。"); return; }
    const npc = previous
      ? {
          ...previous,
          name,
          avatar: npcAvatarDraft.trim() || undefined,
          summary: npcSummaryDraft.trim(),
          role: npcRoleDraft.trim() || undefined,
          personality: npcPersonalityDraft.trim() || undefined,
          motivation: npcMotivationDraft.trim() || undefined,
          tags: npcTagsDraft.split(/[，,、]/).map((tag) => tag.trim()).filter(Boolean),
          momentApprovalMode: npcMomentApprovalModeDraft,
          momentAutoMode: npcMomentAutoModeDraft,
          momentAutoFrequency: npcMomentAutoFrequencyDraft,
          updatedAt: now,
        }
      : createRelationshipNetworkNpc({
          id: createId("relationship-network-npc"),
          ownerIdentityId: activeIdentity.id,
          name,
          avatar: npcAvatarDraft,
          summary: npcSummaryDraft,
          role: npcRoleDraft,
          personality: npcPersonalityDraft,
          motivation: npcMotivationDraft,
          tags: npcTagsDraft.split(/[，,、]/).map((tag) => tag.trim()).filter(Boolean),
          momentApprovalMode: npcMomentApprovalModeDraft,
          momentAutoMode: npcMomentAutoModeDraft,
          momentAutoFrequency: npcMomentAutoFrequencyDraft,
          now,
        });
    const result = upsertRelationshipNetworkNpc({ ...npc, gender: npcGenderDraft.trim() || undefined, age: npcAgeDraft === "∞" ? "∞" : npcAgeDraft ? Number(npcAgeDraft) : "" });
    if (!result.success) {
      setError(result.error === "scope" ? "NPC 作用域校验失败，未保存。" : "NPC 保存失败，请检查浏览器本地存储空间。");
      return;
    }
    if (npcSocialDraft && npcEditorEdge) {
      const existing = listRelationshipNetworkSocialLinksForEdge(activeIdentity.id, npcEditorEdge.id);
      const source = networkRef.current.nodes.find(item => item.id === npcEditorEdge.sourceNodeId);
      const target = networkRef.current.nodes.find(item => item.id === npcEditorEdge.targetNodeId);
      const directions = npcEditorEdge.direction === "both" ? [[source, target], [target, source]] : npcEditorEdge.direction === "reverse" ? [[target, source]] : [[source, target]];
      for (const [from, to] of directions) {
        if (!from || !to) continue;
        const old = existing.find(link => link.sourceEntityType === from.entityType && link.sourceEntityId === from.entityId && link.targetEntityType === to.entityType && link.targetEntityId === to.entityId);
        const saved = upsertRelationshipNetworkSocialLink({ ...npcSocialDraft, id: old?.id || createId("relationship-network-social"), ownerIdentityId: activeIdentity.id,
          sourceEntityType: from.entityType, sourceEntityId: from.entityId, targetEntityType: to.entityType, targetEntityId: to.entityId,
          relationshipLabel: resolveRelationshipLabel(npcEditorEdge, from.entityId), networkEdgeId: npcEditorEdge.id, createdAt: old?.createdAt || now, updatedAt: now });
        if (!saved.success) { setError("NPC 已保存，但朋友圈互动设置保存失败，请重试保存。"); return; }
      }
      setSocialLinks(listRelationshipNetworkSocialLinksForIdentity(activeIdentity.id));
    }
    setNpcs(listRelationshipNetworkNpcsForIdentity(activeIdentity.id));
    if (!previous) addEntityNode("npc", npc.id);
    setNpcModalOpen(false);
    setEditingNpcId(null);
    setNotice(previous ? "NPC 已更新。" : "NPC 已创建并添加到画布。");
  };

  const deleteNpc = (npc: RelationshipNetworkNpc) => {
    if (npc.ownerIdentityId !== activeIdentity.id || !listRelationshipNetworkNpcsForIdentity(activeIdentity.id).some(item => item.id === npc.id)) {
      setNpcDeleteTarget(null);
      setError("这个 NPC 已不存在或不属于当前身份，请重新打开关系网。");
      return;
    }
    const result = removeRelationshipNetworkNpc(activeIdentity.id, npc.id);
    if (!result.success) {
      setError("NPC 删除失败，请稍后重试。");
      return;
    }
    const automationStateResult = removeRelationshipNetworkNpcAutomationState(activeIdentity.id, npc.id);
    if (!automationStateResult.success) setError("NPC 已删除，但自动行为记录清理失败，请稍后重试。");
    listRelationshipNetworkPendingMomentsForIdentity(activeIdentity.id)
      .filter((pending) => pending.npcId === npc.id)
      .forEach((pending) => removeRelationshipNetworkPendingMoment(activeIdentity.id, pending.id));
    const socialResult = removeRelationshipNetworkSocialLinksForEntity(activeIdentity.id, "npc", npc.id);
    if (!socialResult.success) {
      setError("NPC 已删除，但其朋友圈互动关系清理失败。");
    }
    const interactionResult = removeRelationshipNetworkInteractionRecordsForEntity(activeIdentity.id, "npc", npc.id);
    if (!interactionResult.success) {
      setError("NPC 已删除，但其互动记录清理失败。");
    }
    const removedNodeIds = new Set(networkRef.current.nodes.filter((node) => node.entityType === "npc" && node.entityId === npc.id).map((node) => node.id));
    const next = {
      ...networkRef.current,
      nodes: networkRef.current.nodes.filter((node) => !removedNodeIds.has(node.id)),
      edges: networkRef.current.edges.filter((edge) => !removedNodeIds.has(edge.sourceNodeId) && !removedNodeIds.has(edge.targetNodeId)),
    };
    commitNetwork(next, "NPC 已删除。");
    setNpcs(listRelationshipNetworkNpcsForIdentity(activeIdentity.id));
    setSocialLinks(listRelationshipNetworkSocialLinksForIdentity(activeIdentity.id));
    setInteractionRecords(listRelationshipNetworkInteractionRecordsForIdentity(activeIdentity.id));
    setSelectedNodeId(null);
    setNpcDeleteTarget(null);
    if (editingNpcId === npc.id) { setNpcModalOpen(false); setEditingNpcId(null); setNpcSocialDraft(null); }
  };

  const fitView = () => {
    const nodes = relationshipCharacterGraph(networkRef.current, currentPerson?.id).nodes;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || nodes.length === 0) return;
    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxX = Math.max(...nodes.map((node) => node.x + NODE_WIDTH));
    const maxY = Math.max(...nodes.map((node) => node.y + NODE_HEIGHT));
    const scale = clamp(Math.min((rect.width - 36) / Math.max(maxX - minX, NODE_WIDTH), (rect.height - 36) / Math.max(maxY - minY, NODE_HEIGHT)), MIN_SCALE, 1.1);
    setViewport({
      scale,
      x: (rect.width - (minX + maxX) * scale) / 2,
      y: (rect.height - (minY + maxY) * scale) / 2,
    });
  };

  const focusEdge = (edge: RelationshipNetworkEdge) => {
    const source = networkRef.current.nodes.find((node) => node.id === edge.sourceNodeId);
    const target = networkRef.current.nodes.find((node) => node.id === edge.targetNodeId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!source || !target || !rect) return;
    const minX = Math.min(source.x, target.x);
    const minY = Math.min(source.y, target.y);
    const maxX = Math.max(source.x + NODE_WIDTH, target.x + NODE_WIDTH);
    const maxY = Math.max(source.y + NODE_HEIGHT, target.y + NODE_HEIGHT);
    const scale = clamp(Math.min((rect.width - 36) / Math.max(maxX - minX, NODE_WIDTH), (rect.height - 36) / Math.max(maxY - minY, NODE_HEIGHT)), MIN_SCALE, 1.1);
    setViewport({
      scale,
      x: (rect.width - (minX + maxX) * scale) / 2,
      y: (rect.height - (minY + maxY) * scale) / 2,
    });
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  };

  const arrangeNodes = () => {
    const nodes = relationshipCharacterGraph(networkRef.current, currentPerson?.id).nodes;
    if (nodes.length === 0) return;
    if (nodes.length === 1) {
      fitView();
      return;
    }

    const orderedNodes = [...nodes].sort((left, right) => {
      if (left.entityType === "identity" && right.entityType !== "identity") return -1;
      if (left.entityType !== "identity" && right.entityType === "identity") return 1;
      return nodes.indexOf(left) - nodes.indexOf(right);
    });
    const columns = nodes.length <= 4 ? 2 : nodes.length <= 9 ? 3 : 4;
    const gapX = 42;
    const gapY = 34;
    const rows = Math.ceil(orderedNodes.length / columns);
    const layoutWidth = columns * NODE_WIDTH + (columns - 1) * gapX;
    const layoutHeight = rows * NODE_HEIGHT + (rows - 1) * gapY;
    const startX = clamp((WORLD_WIDTH - layoutWidth) / 2, 24, WORLD_WIDTH - layoutWidth - 24);
    const startY = clamp((WORLD_HEIGHT - layoutHeight) / 2, 30, WORLD_HEIGHT - layoutHeight - 30);
    const positions = new Map(orderedNodes.map((node, index) => [node.id, {
      x: startX + (index % columns) * (NODE_WIDTH + gapX),
      y: startY + Math.floor(index / columns) * (NODE_HEIGHT + gapY),
    }]));
    const next = {
      ...networkRef.current,
      nodes: networkRef.current.nodes.map((node) => ({ ...node, ...positions.get(node.id) })),
    };
    if (!commitNetwork(next, "画布已自动整理。")) return;
    requestAnimationFrame(fitView);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(fitView);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setConnectMode(false);
    setConnectStartNodeId(null);
    return () => window.cancelAnimationFrame(frame);
  }, [activeIdentity.id, currentPerson?.id, view]);

  const zoomBy = (amount: number) => setViewport((current) => ({ ...current, scale: clamp(current.scale + amount, MIN_SCALE, MAX_SCALE) }));

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (connectMode) {
      setConnectStartNodeId(null);
      setSelectedNodeId(null);
      return;
    }
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    pointerSessionRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleNodePointerDown = (event: React.PointerEvent<HTMLDivElement>, node: RelationshipNetworkNode) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (connectMode) {
      if (!connectStartNodeId) {
        setConnectStartNodeId(node.id);
        setSelectedNodeId(node.id);
      } else if (connectStartNodeId !== node.id) {
        openNewEdge(connectStartNodeId, node.id);
      }
      return;
    }
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    pointerSessionRef.current = {
      kind: "node",
      pointerId: event.pointerId,
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
    };
    canvasRef.current?.setPointerCapture(event.pointerId);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.kind === "pan") {
      setViewport((current) => ({
        ...current,
        x: session.originX + event.clientX - session.startX,
        y: session.originY + event.clientY - session.startY,
      }));
      return;
    }
    const dx = (event.clientX - session.startX) / viewport.scale;
    const dy = (event.clientY - session.startY) / viewport.scale;
    const nextNodes = networkRef.current.nodes.map((node) => node.id === session.nodeId
      ? { ...node, x: clamp(session.originX + dx, 18, WORLD_WIDTH - NODE_WIDTH - 18), y: clamp(session.originY + dy, 24, WORLD_HEIGHT - NODE_HEIGHT - 24) }
      : node);
    const next = { ...networkRef.current, nodes: nextNodes };
    networkRef.current = next;
    setNetwork(next);
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    pointerSessionRef.current = null;
    if (session.kind === "node") commitNetwork(networkRef.current);
  };

  const filteredCharacters = availableCharacters.filter((character) => {
    const query = pickerSearch.trim().toLowerCase();
    return !query || `${character.name} ${character.personality} ${character.remark || ""}`.toLowerCase().includes(query);
  });
  const filteredNpcs = npcs.filter((npc) => {
    const query = pickerSearch.trim().toLowerCase();
    return !query || `${npc.name} ${npc.summary} ${npc.role || ""} ${npc.personality || ""} ${npc.motivation || ""} ${(npc.tags || []).join(" ")}`.toLowerCase().includes(query);
  });

  const generatePeople = async () => {
    if (!currentPerson || generationLock.current) return;
    setAddMenuOpen(false);
    if (!settings) { setError("文本 API 设置不可用。"); return; }
    const center = currentPerson;
    const existingNames = relationshipNeighbors(networkRef.current, center.id).map(({ node }) => nodeModels.find(model => model.node.id === node.id)?.name).filter((name): name is string => !!name);
    generationLock.current = true; setGenerationProgress("正在读取人物设定…");
    try {
      const rows = await generateRelationshipPeople({ character: center, characters: availableCharacters, settings,
        worldBookEntries, identityId: activeIdentity.id,
        relationId: relationships.find(relation => relation.characterId === center.id && relation.userIdentityId === activeIdentity.id)?.id,
        existingNames, onProgress: (done, total) => setGenerationProgress(`正在提取关联人物 ${done}/${total}`) });
      if (!rows.length) setNotice("当前设定中未找到可新增的关联人物。");
      else setGenerated({ characterId: center.id, characterName: center.name, rows: rows.map(person => ({ person })) });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "人物提取失败，未保存任何人物。"); }
    finally { generationLock.current = false; setGenerationProgress(""); }
  };

  const confirmGenerated = () => {
    if (!generated || !generated.rows.length) return;
    try {
      const result = saveGeneratedRelationshipPeople({ ownerIdentityId: activeIdentity.id, map: networkRef.current,
        characterId: generated.characterId, characterIds: availableCharacters.map(character => character.id), selections: generated.rows });
      networkRef.current = result.map; setNetwork(result.map); setNpcs(result.npcs);
      setPersonId(generated.characterId); setGenerated(null); setNotice(`已添加 ${result.added} 位关联人物。`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "保存失败，草稿仍保留。"); }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#f6f4ef] text-[#332f2a]" data-theme-page="relationship-network">
      <header className="relative z-30 flex shrink-0 items-center justify-between border-b border-[#e7e2d9] bg-[#faf9f6]/95 px-3 py-2 backdrop-blur-md">
        <button type="button" onClick={onClose} className="app-nav-icon-button flex h-8 w-8 items-center justify-center" aria-label="返回主页">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <div className="text-center">
            <button type="button" onClick={() => setPersonPickerOpen(true)} aria-label="选择关系网角色" className="flex max-w-[180px] items-center justify-center gap-1.5 text-[15px] font-black tracking-tight"><span className="truncate">{currentPerson?.name || "关系网"}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 rounded-full bg-[#eeeae2] p-0.5" /></button>
          </div>
          <div className="hidden items-center gap-1 rounded-full bg-[#eeeae2] px-2 py-1 text-[9px] font-bold text-[#6c665d] min-[390px]:flex">
            <Avatar value={activeIdentity.avatar} name={activeIdentity.name} className="h-4 w-4 text-[8px]" />
            <span className="max-w-[70px] truncate">{activeIdentity.name}</span>
          </div>
        </div>
        <button type="button" onClick={switchView} className="app-nav-icon-button flex h-10 w-10 items-center justify-center" aria-label={view === "graph" ? "切换人物卡片" : "切换关系图"} title={view === "graph" ? "人物卡片" : "关系图"}>
          {view === "graph" ? <LayoutGrid className="h-4 w-4" /> : <Network className="h-4 w-4" />}
        </button>
      </header>
      {generationProgress && <div role="status" className="shrink-0 bg-[#eeebe4] px-4 py-2 text-xs text-[#756c61]">{generationProgress} · 退出本应用不会自动重试</div>}

      {view === "cards" && <RelationshipPeopleView key={currentPerson?.id} character={currentPerson} map={network} characters={availableCharacters} npcs={npcs} identity={activeIdentity}
        onAdd={() => { setAssociationSourceId(currentPerson?.id || null); setAddMenuOpen(true); }}
        onOpen={(node, edges) => { setSelectedNodeId(node.id); if (node.entityType === "npc") openNpcComposer(npcs.find(npc => npc.id === node.entityId)); else openExistingEdge(edges[0]); }} />}

      {personPickerOpen && <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/25 p-4" onClick={() => setPersonPickerOpen(false)}>
        <section role="dialog" aria-modal="true" aria-label="选择关系网角色" className="flex max-h-[75%] w-full max-w-sm flex-col rounded-3xl bg-[#fffdfa] p-4 shadow-xl" onClick={event => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold">选择人物</h2><button aria-label="关闭角色选择" onClick={() => setPersonPickerOpen(false)} className="flex h-10 w-10 items-center justify-center"><X className="h-4 w-4" /></button></div>
          <div className="min-h-0 space-y-2 overflow-y-auto">{availableCharacters.map(character => <button key={character.id} className="flex w-full items-center gap-3 rounded-xl bg-[#f5f2ec] p-3 text-left text-sm" onClick={() => { setPersonId(character.id); setPersonPickerOpen(false); setSelectedNodeId(null); }}><PersonAvatar avatar={character.avatar} name={character.name} /><span className="break-words">{character.name}</span></button>)}{availableCharacters.length === 0 && <p className="p-4 text-xs">请先在档案馆添加角色。</p>}</div>
        </section>
      </div>}

      {addMenuOpen && <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/25 p-4" onClick={() => setAddMenuOpen(false)}>
        <section role="dialog" aria-modal="true" aria-label="添加关联人物" className="w-full max-w-sm rounded-3xl bg-[#fffdfa] p-4" onClick={event => event.stopPropagation()}>
          <div className="flex items-center justify-between"><h2 className="text-sm font-bold">添加关联人物</h2><button aria-label="关闭添加菜单" className="h-10 w-10" onClick={() => setAddMenuOpen(false)}>×</button></div>
          <button className="mt-2 w-full rounded-xl bg-[#f5f2ec] p-3 text-left text-sm" onClick={() => { setAddMenuOpen(false); setPickerSearch(""); setNodePickerOpen(true); }}>添加已有角色</button>
          <button className="mt-2 w-full rounded-xl bg-[#f5f2ec] p-3 text-left text-sm" onClick={() => { setAddMenuOpen(false); openNpcComposer(); }}>新建 NPC</button>
          <button disabled={!!generationProgress} className="mt-2 w-full rounded-xl bg-[#51483e] p-3 text-left text-sm text-white disabled:opacity-40" onClick={() => void generatePeople()}>{generationProgress ? "正在生成…" : "自动生成"}</button>
        </section>
      </div>}

      {generated && <div className="absolute inset-0 z-[110] flex min-h-0 items-center justify-center bg-black/25 p-4" onClick={() => setGenerated(null)}>
        <section role="dialog" aria-modal="true" aria-label="生成的关联人物" className="flex max-h-[85%] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-[#fffdfa] p-4 shadow-xl" onClick={event => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between"><div className="min-w-0"><h2 className="break-words text-sm font-bold">{generated.characterName} 的关联人物</h2><p className="mt-1 text-xs text-[#92877b]">删除不需要的人物，确认后添加。</p></div><button aria-label="关闭生成结果" className="h-10 w-10 shrink-0" onClick={() => setGenerated(null)}>×</button></div>
          <div className="min-h-0 space-y-3 overflow-y-auto">{generated.rows.map((row, index) => {
            const matches = [
              ...availableCharacters.filter(character => character.id !== generated.characterId && personNameKey(character.name) === personNameKey(row.person.name)).map(character => ({ value: `character:${character.id}`, label: `关联已有角色：${character.name}` })),
              ...npcs.filter(npc => personNameKey(npc.name) === personNameKey(row.person.name)).map(npc => ({ value: `npc:${npc.id}`, label: `关联已有 NPC：${npc.name}` })),
            ];
            return <article key={index} className="rounded-2xl border border-[#e7e2d9] p-3">
              <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-bold">{row.person.name}</h3><p className="mt-1 break-words text-xs text-[#857b6e]">{[row.person.gender, row.person.age != null ? `${row.person.age} 岁` : "", row.person.role, row.person.relationship].filter(Boolean).join(" · ")}</p></div><button type="button" aria-label={`移除候选 ${row.person.name}`} onClick={() => setGenerated({ ...generated, rows: generated.rows.filter((_, i) => i !== index) })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><Trash2 className="h-4 w-4" /></button></div>
              {row.person.summary && <p className="mt-2 break-words text-xs leading-5 text-[#857b6e]">{row.person.summary}</p>}
              {matches.length > 0 && <label className="mt-2 block text-xs text-[#857b6e]">发现同名人物，请选择是否关联<select aria-label={`匹配人物 ${row.person.name}`} value={row.target || ""} onChange={event => setGenerated({ ...generated, rows: generated.rows.map((item, i) => i === index ? { ...item, target: event.target.value } : item) })} className="mt-1 w-full rounded-lg border border-[#e7e2d9] p-2"><option value="">作为独立 NPC 添加</option>{matches.map(match => <option key={match.value} value={match.value}>{match.label}</option>)}</select></label>}
            </article>;
          })}{!generated.rows.length && <p className="py-6 text-center text-xs text-[#92877b]">已移除全部候选人物。</p>}</div>
          <button type="button" disabled={!generated.rows.length} onClick={confirmGenerated} className="mt-4 shrink-0 rounded-xl bg-[#51483e] py-3 text-sm text-white disabled:opacity-40">确认添加</button>
        </section>
      </div>}

      {view === "graph" && <>
      <section
        ref={canvasRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-[#f1eee7]"
        style={{ touchAction: "none", backgroundImage: "radial-gradient(#d9d3c8 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
      >
        <div className="absolute left-3 right-3 top-3 z-20 flex items-center gap-1.5" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => { setAssociationSourceId(currentPerson?.id || null); setPickerSearch(""); setNodePickerOpen(true); }} className="flex h-8 items-center gap-1 rounded-full bg-[#fffdfa]/95 px-2.5 text-[10px] font-bold text-[#544e45] shadow-sm ring-1 ring-[#e0dbd1]">
            <Plus className="h-3.5 w-3.5" />添加人物
          </button>
          <button type="button" onClick={() => { setAssociationSourceId(currentPerson?.id || null); openNpcComposer(); }} className="flex h-8 items-center gap-1 rounded-full bg-[#fffdfa]/95 px-2.5 text-[10px] font-bold text-[#544e45] shadow-sm ring-1 ring-[#e0dbd1]">
            <UserRound className="h-3.5 w-3.5" />新建 NPC
          </button>
          <button
            type="button"
            onClick={() => { setConnectMode((current) => !current); setConnectStartNodeId(null); setSelectedEdgeId(null); }}
            className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold shadow-sm ring-1 transition-colors ${connectMode ? "bg-[#50483f] text-white ring-[#50483f]" : "bg-[#fffdfa]/95 text-[#544e45] ring-[#e0dbd1]"}`}
          >
            <Link2 className="h-3.5 w-3.5" />连线
          </button>
        </div>

        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 rounded-full bg-[#fffdfa]/90 p-1 shadow-sm ring-1 ring-[#e0dbd1]" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => zoomBy(-0.1)} className="flex h-7 w-7 items-center justify-center rounded-full text-[#625a50] hover:bg-[#eee9df]" aria-label="缩小"><Minus className="h-3.5 w-3.5" /></button>
          <span className="min-w-[38px] text-center text-[9px] font-bold text-[#80786d]">{Math.round(viewport.scale * 100)}%</span>
          <button type="button" onClick={() => zoomBy(0.1)} className="flex h-7 w-7 items-center justify-center rounded-full text-[#625a50] hover:bg-[#eee9df]" aria-label="放大"><Plus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={arrangeNodes} className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[#625a50] hover:bg-[#eee9df]" aria-label="自动整理"><RotateCcw className="h-3.5 w-3.5" /></button>
        </div>

        {(connectMode || network.nodes.length === 1) && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#fffdfa]/90 px-3 py-1.5 text-center text-[10px] font-medium text-[#80776b] shadow-sm ring-1 ring-[#e0dbd1]">
            {connectMode
              ? (connectStartNodeId ? "再点击一个人物，设置他们之间的关系" : "先点击关系起点，再点击关系终点")
              : "拖动画布或人物节点；从上方添加人物和 NPC"}
          </div>
        )}

        <div
          className="absolute left-0 top-0"
          style={{ width: WORLD_WIDTH, height: WORLD_HEIGHT, transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`, transformOrigin: "0 0" }}
        >
          <svg width={WORLD_WIDTH} height={WORLD_HEIGHT} className="pointer-events-none absolute inset-0 overflow-visible">
            <defs>
              <marker id="relationship-network-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse" markerUnits="strokeWidth">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#8e8579" />
              </marker>
              <marker id="relationship-network-arrow-selected" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse" markerUnits="strokeWidth">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#695c4d" />
              </marker>
            </defs>
            {visibleEdges.map((edge) => {
              const source = network.nodes.find((node) => node.id === edge.sourceNodeId);
              const target = network.nodes.find((node) => node.id === edge.targetNodeId);
              if (!source || !target) return null;
              const start = rectEdgePoint(source, target);
              const end = rectEdgePoint(target, source);
              const selected = edge.id === selectedEdgeId;
              const midpointX = (start.x + end.x) / 2;
              const midpointY = (start.y + end.y) / 2;
              return (
                <g key={edge.id}>
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke={selected ? "#695c4d" : "#a59b8d"}
                    strokeWidth={selected ? 3.2 : 2.3}
                    strokeDasharray={edge.category === "过去" ? "7 5" : undefined}
                    markerStart={edge.direction === "reverse" || edge.direction === "both" ? `url(#${selected ? "relationship-network-arrow-selected" : "relationship-network-arrow"})` : undefined}
                    markerEnd={edge.direction === "forward" || edge.direction === "both" ? `url(#${selected ? "relationship-network-arrow-selected" : "relationship-network-arrow"})` : undefined}
                  />
                  <text x={midpointX} y={midpointY - 8} textAnchor="middle" fontSize="14" fontWeight="700" fill={selected ? "#554a3e" : "#766d62"} stroke="#f1eee7" strokeWidth="5" paintOrder="stroke" className="select-none">
                    {edgeLabel(edge)}
                  </text>
                </g>
              );
            })}
          </svg>

          {visibleNodeModels.map((model) => {
            const selected = selectedNodeId === model.node.id;
            const connectStart = connectStartNodeId === model.node.id;
            const tone = model.type === "identity" ? "border-[#b59b74] bg-[#fffbf2]" : model.type === "npc" ? "border-[#a69ab7] bg-[#fbf8ff]" : "border-[#9bafb5] bg-[#f7fcfc]";
            return (
              <div
                key={model.node.id}
                data-network-node
                className={`absolute flex cursor-grab items-center gap-2 rounded-[22px] border px-2.5 py-2 shadow-[0_8px_18px_rgba(83,73,59,0.12)] transition-shadow active:cursor-grabbing ${tone} ${selected || connectStart ? "ring-2 ring-[#665b4e] ring-offset-2" : ""} ${!model.exists ? "opacity-70" : ""}`}
                style={{ left: model.node.x, top: model.node.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
                onPointerDown={(event) => handleNodePointerDown(event, model.node)}
              >
                <Avatar value={model.avatar} name={model.name} className="h-12 w-12 text-base" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-black text-[#3e3933]">{model.name}</span>
                    <span className="shrink-0 rounded-full bg-black/5 px-1.5 py-0.5 text-[8px] font-bold text-[#8a8175]">{model.typeLabel}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-[#8a8178]">{model.summary}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="relative z-20 h-[39%] min-h-[226px] max-h-[340px] shrink-0 overflow-y-auto border-t border-[#e7e2d9] bg-[#fbfaf7] px-3 pb-4 pt-3">
        {selectedNode ? (
          <div>
            <div className="flex items-start gap-2.5">
              <Avatar value={selectedNode.avatar} name={selectedNode.name} className="h-12 w-12 text-base" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-black">{selectedNode.name}</h2>
                  <span className="rounded-full bg-[#eeeae2] px-2 py-0.5 text-[9px] font-bold text-[#81786d]">{selectedNode.typeLabel}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-[10px] leading-4 text-[#847b70]">{selectedNode.summary}</p>
                {selectedNpc && (selectedNpc.role || selectedNpc.personality || selectedNpc.motivation || selectedNpc.tags?.length) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedNpc.role && <span className="rounded-full bg-[#eee9f5] px-2 py-0.5 text-[9px] font-bold text-[#7d708d]">{selectedNpc.role}</span>}
                    {selectedNpc.personality && <span className="max-w-[180px] truncate rounded-full bg-[#f1eee7] px-2 py-0.5 text-[9px] text-[#81786d]">{selectedNpc.personality}</span>}
                    {selectedNpc.tags?.map((tag) => <span key={tag} className="rounded-full bg-[#f1eee7] px-2 py-0.5 text-[9px] text-[#81786d]">#{tag}</span>)}
                  </div>
                )}
                {selectedNpc?.motivation && <p className="mt-1 truncate text-[9px] text-[#958a9d]">动机：{selectedNpc.motivation}</p>}
                {linkedCharacter && <p className="mt-1 truncate text-[9px] font-bold text-[#6c8570]">已提升为完整角色：{linkedCharacter.name}</p>}
                {selectedNpc && <p className="mt-1 truncate text-[9px] text-[#958a9d]">动态：{selectedNpc.momentApprovalMode === "confirm" ? "生成后确认" : "自动发布"} · {npcAutoModeLabel(selectedNpc.momentAutoMode)} · {npcAutoFrequencyLabel(selectedNpc.momentAutoFrequency)}</p>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedNode.type === "character" && onOpenChat && relationships.find((relation) => relation.userIdentityId === activeIdentity.id && relation.characterId === selectedNode.node.entityId) && (
                <button type="button" onClick={() => {
                  const relation = relationships.find((item) => item.userIdentityId === activeIdentity.id && item.characterId === selectedNode.node.entityId);
                  if (relation) onOpenChat(selectedNode.node.entityId, relation.id);
                }} className="rounded-full bg-[#51483e] px-3 py-2 text-[10px] font-bold text-white">打开聊天</button>
              )}
              {selectedNode.type === "npc" && (
                <>
                  {onLinkNpcToChat && <button type="button" onClick={linkSelectedNpcToChat} disabled={linkingNpc} className="rounded-full bg-[#51483e] px-3 py-2 text-[10px] font-bold text-white disabled:opacity-60">{linkingNpc ? "正在提升…" : linkedCharacter && linkedRelationship ? "打开完整角色" : "提升为完整角色"}</button>}
                  {onGenerateNpcMoment && <button type="button" onClick={generateSelectedNpcMoment} disabled={generatingNpcMomentId === selectedNpc?.id} className="rounded-full bg-[#6c8570] px-3 py-2 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{generatingNpcMomentId === selectedNpc?.id ? "正在生成…" : "让 NPC 发动态"}</button>}
                  {onCheckNpcAutomation && <button type="button" onClick={checkSelectedNpcAutomation} disabled={checkingNpcAutomationId === selectedNpc?.id} className="rounded-full border border-[#cfc7bb] bg-white px-3 py-2 text-[10px] font-bold text-[#6c6258] disabled:cursor-not-allowed disabled:opacity-50">{checkingNpcAutomationId === selectedNpc?.id ? "检查中…" : "检查自动行为"}</button>}
                  <button type="button" onClick={() => openNpcComposer(npcs.find((npc) => npc.id === selectedNode.node.entityId))} className="flex items-center gap-1 rounded-full bg-[#eeeae2] px-3 py-2 text-[10px] font-bold text-[#62594f]"><Pencil className="h-3 w-3" />编辑 NPC</button>
                  <button type="button" onClick={() => { const npc = npcs.find((item) => item.id === selectedNode.node.entityId); if (npc) setNpcDeleteTarget(npc); }} className="flex items-center gap-1 rounded-full bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-600"><Trash2 className="h-3 w-3" />删除 NPC</button>
                </>
              )}
              {selectedNode.type !== "identity" && <button type="button" onClick={() => removeNodeFromCanvas(selectedNode.node)} className="rounded-full border border-[#ded8ce] px-3 py-2 text-[10px] font-bold text-[#7d7469]">仅从画布移除</button>}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[#ece7df] pt-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-[#958c80]">与此人物的关系</h3>
              <button type="button" onClick={() => setSelectedNodeId(null)} className="text-[10px] font-bold text-[#958c80]">查看全部</button>
            </div>
            <div className="mt-2 space-y-1.5">
              {characterGraph.edges.filter((edge) => edge.sourceNodeId === selectedNode.node.id || edge.targetNodeId === selectedNode.node.id).length === 0 ? (
                <p className="rounded-xl bg-[#f3f0ea] px-3 py-3 text-center text-[10px] text-[#9b9287]">还没有关系，点击上方“连线”开始设置。</p>
              ) : characterGraph.edges.filter((edge) => edge.sourceNodeId === selectedNode.node.id || edge.targetNodeId === selectedNode.node.id).map((edge) => {
                const socialLink = socialLinks.find((link) => link.networkEdgeId === edge.id);
                const completedInteractionCount = socialLink
                  ? interactionRecords.filter((record) => record.socialLinkId === socialLink.id && record.status === "completed").length
                  : 0;
                return <button key={edge.id} type="button" onClick={() => openExistingEdge(edge)} className="flex w-full items-center justify-between rounded-xl bg-[#f3f0ea] px-3 py-2 text-left hover:bg-[#ece7de]">
                  <span className="min-w-0 truncate text-[10px] font-bold text-[#62594f]">{edgeLabel(edge)}</span>
                  <span className="ml-2 flex shrink-0 items-center gap-1 text-[9px] text-[#9b9287]"><span>{directionLabel(edge.direction)}</span>{socialLink && <span className={`${socialLink.enabled && socialLink.canCommentMoments ? "text-[#6c8570]" : socialLink.enabled ? "text-[#8b7861]" : "text-[#9b9287]"}`}>{socialStatusLabel(socialLink)}</span>}{completedInteractionCount > 0 && <span>{completedInteractionCount} 次</span>}</span>
                </button>;
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black">关系清单</h2>
                <p className="mt-0.5 text-[10px] text-[#968d82]">{visibleNodeModels.length} 个人物 · {matchingEdges.length} 条关系 · {socialLinks.filter((link) => link.enabled && characterGraph.edges.some(edge => edge.id === link.networkEdgeId)).length} 条已启用互动 · {interactionRecords.filter((record) => record.status === "completed" && socialLinks.some(link => link.id === record.socialLinkId && characterGraph.edges.some(edge => edge.id === link.networkEdgeId))).length} 次已完成互动</p>
              </div>
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#90877c]"><Hand className="h-3.5 w-3.5" />拖动节点整理布局</div>
            </div>
            <div className="mt-3 grid grid-cols-[1.35fr_0.85fr] gap-1.5">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[#a39a8e]" />
                <input value={nodeSearch} onChange={(event) => setNodeSearch(event.target.value)} aria-label="搜索关系网人物" placeholder="搜索人物" className="w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] py-2 pl-8 pr-2 text-[10px] outline-none focus:border-[#a99a87]" />
              </label>
              <select value={nodeTypeFilter} onChange={(event) => setNodeTypeFilter(event.target.value as "all" | RelationshipNetworkEntityType)} aria-label="人物类型筛选" className="min-w-0 rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-2 text-[10px] outline-none focus:border-[#a99a87]">
                <option value="all">全部人物</option>
                <option value="identity">我的身份</option>
                <option value="character">角色</option>
                <option value="npc">NPC</option>
              </select>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <select value={edgeCategoryFilter} onChange={(event) => setEdgeCategoryFilter(event.target.value)} aria-label="关系分类筛选" className="min-w-0 flex-1 rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-2 py-2 text-[10px] outline-none focus:border-[#a99a87]">
                <option value="all">全部关系分类</option>
                {edgeCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              {(nodeSearch || nodeTypeFilter !== "all" || edgeCategoryFilter !== "all") && <button type="button" onClick={() => { setNodeSearch(""); setNodeTypeFilter("all"); setEdgeCategoryFilter("all"); }} className="shrink-0 rounded-xl px-2 py-2 text-[10px] font-bold text-[#887d70] hover:bg-[#f0ece5]">清除筛选</button>}
            </div>
            <div className="mt-3 space-y-1.5">
              {matchingEdges.length === 0 ? (
                <div className="rounded-2xl bg-[#f3f0ea] px-4 py-5 text-center">
                  <ArrowLeftRight className="mx-auto h-5 w-5 text-[#9b9185]" />
                  <p className="mt-2 text-[11px] font-bold text-[#746b60]">{characterGraph.edges.length === 0 ? "还没有关系线" : "没有匹配的关系"}</p>
                  <p className="mt-1 text-[10px] leading-4 text-[#9b9287]">{characterGraph.edges.length === 0 ? "先添加人物，再点击“连线”连接两个节点。" : "换一个人物或关系分类筛选试试。"}</p>
                </div>
              ) : matchingEdges.map((edge) => {
                const source = nodeModels.find((model) => model.node.id === edge.sourceNodeId);
                const target = nodeModels.find((model) => model.node.id === edge.targetNodeId);
                const npcModel = source?.type === "npc" ? source : target?.type === "npc" ? target : undefined;
                const editableNpc = npcModel && npcs.find(npc => npc.id === npcModel.node.entityId);
                const socialLink = socialLinks.find((link) => link.networkEdgeId === edge.id);
                const completedInteractionCount = socialLink
                  ? interactionRecords.filter((record) => record.socialLinkId === socialLink.id && record.status === "completed").length
                  : 0;
                return (
                  <div key={edge.id} className="flex w-full items-center gap-1 rounded-xl bg-[#f3f0ea] px-2 py-1.5 hover:bg-[#ece7de]">
                    <button type="button" onClick={() => focusEdge(edge)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left">
                      <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-[#62594f]">{source?.name || "人物 A"} {edge.direction === "reverse" ? "←" : edge.direction === "both" ? "↔" : "→"} {target?.name || "人物 B"}</span>
                      <span className="flex max-w-[150px] shrink-0 items-center gap-1 text-[9px] text-[#958c80]"><span className="max-w-[82px] truncate">{edgeLabel(edge)}</span>{socialLink && <span className={`${socialLink.enabled && socialLink.canCommentMoments ? "text-[#6c8570]" : socialLink.enabled ? "text-[#8b7861]" : "text-[#9b9287]"}`}>{socialStatusLabel(socialLink)}</span>}{completedInteractionCount > 0 && <span>{completedInteractionCount} 次</span>}</span>
                    </button>
                    <button type="button" onClick={() => editableNpc ? openNpcComposer(editableNpc) : openExistingEdge(edge)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#81776b] hover:bg-[#e5dfd5]" aria-label={editableNpc ? `编辑关系网 NPC ${editableNpc.name}` : `编辑关系 ${source?.name || "人物 A"} ${target?.name || "人物 B"}`}><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      </>}

      {(notice || error) && (
        <div className={`pointer-events-none absolute bottom-[41%] left-1/2 z-[130] max-w-[88%] -translate-x-1/2 rounded-full px-3 py-2 text-center text-[10px] font-bold shadow-lg ${error ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-[#51483e] text-white"}`} role={error ? "alert" : "status"}>
          {error || notice}
        </div>
      )}

      {nodePickerOpen && (
        <div className="absolute inset-0 z-[90] flex items-end justify-center bg-[#2d2822]/30 p-3 backdrop-blur-[2px]" onPointerDown={() => setNodePickerOpen(false)}>
          <div className="max-h-[82%] w-full max-w-[420px] overflow-hidden rounded-[26px] bg-[#fffdfa] shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#eee9e0] px-4 py-3">
              <div><h2 className="text-sm font-black">添加到关系网</h2><p className="mt-0.5 text-[10px] text-[#958c80]">选择已有角色或关系网 NPC</p></div>
              <button type="button" onClick={() => setNodePickerOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f1eee7] text-[#746b60]"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[calc(82vh-64px)] overflow-y-auto px-4 pb-5 pt-3">
              <label className="relative block"><Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[#a39a8e]" /><input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="搜索人物" className="w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] py-2 pl-9 pr-3 text-xs outline-none focus:border-[#a99a87]" /></label>
              <button type="button" disabled={hasEntityNode("identity", activeIdentity.id)} onClick={() => addEntityNode("identity", activeIdentity.id)} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-[#eadfc9] bg-[#fffaf0] p-3 text-left disabled:opacity-50">
                <Avatar value={activeIdentity.avatar} name={activeIdentity.name} className="h-10 w-10" /><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{activeIdentity.name}</strong><small className="text-[10px] text-[#998d7e]">我的身份</small></span><span className="text-[10px] font-bold text-[#9a8b77]">{hasEntityNode("identity", activeIdentity.id) ? "已添加" : "添加"}</span>
              </button>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#9b9287]"><UsersRound className="h-3.5 w-3.5" />角色</div>
              <div className="mt-2 space-y-1.5">
                {filteredCharacters.length === 0 ? <p className="rounded-xl bg-[#f5f2ec] px-3 py-3 text-center text-[10px] text-[#a0988d]">还没有可添加的角色</p> : filteredCharacters.map((character) => {
                  const added = associationSourceId ? character.id === associationSourceId : hasEntityNode("character", character.id);
                  return <button key={character.id} type="button" disabled={added} onClick={() => addEntityNode("character", character.id)} className="flex w-full items-center gap-3 rounded-2xl bg-[#f7f5f0] p-2.5 text-left disabled:opacity-50"><Avatar value={character.avatar} name={character.name} className="h-9 w-9" /><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{character.name}</strong><small className="block truncate text-[10px] text-[#998f83]">{character.remark || character.personality || "角色档案"}</small></span><span className="text-[10px] font-bold text-[#9a9186]">{added ? "已添加" : "添加"}</span></button>;
                })}
              </div>
              <div className="mt-4 flex items-center justify-between"><div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#9b9287]"><UserRound className="h-3.5 w-3.5" />关系网 NPC</div><button type="button" onClick={() => openNpcComposer()} className="text-[10px] font-bold text-[#6e6255]">+ 新建</button></div>
              <div className="mt-2 space-y-1.5">
                {filteredNpcs.length === 0 ? <p className="rounded-xl bg-[#f5f2ec] px-3 py-3 text-center text-[10px] text-[#a0988d]">还没有关系网 NPC</p> : filteredNpcs.map((npc) => {
                  const added = associationSourceId ? false : hasEntityNode("npc", npc.id);
                  return <button key={npc.id} type="button" disabled={added} onClick={() => addEntityNode("npc", npc.id)} className="flex w-full items-center gap-3 rounded-2xl bg-[#f7f4fa] p-2.5 text-left disabled:opacity-50"><Avatar value={npc.avatar} name={npc.name} className="h-9 w-9" /><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{npc.name}</strong><small className="block truncate text-[10px] text-[#998f83]">{npc.summary || "关系网辅助人物"}</small></span><span className="text-[10px] font-bold text-[#9a9186]">{added ? "已添加" : "添加"}</span></button>;
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {npcModalOpen && (
        <div className="absolute inset-0 z-[100] flex min-h-0 items-center justify-center overflow-hidden bg-[#2d2822]/30 p-3 backdrop-blur-[2px]" onPointerDown={() => setNpcModalOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={editingNpcId ? "编辑关系网 NPC" : "新建关系网 NPC"} className="flex min-h-0 w-full max-w-[420px] flex-col overflow-hidden rounded-[26px] bg-[#fffdfa] p-4 shadow-2xl" style={{ height: "calc(var(--app-viewport-height, 100dvh) - 48px)", maxHeight: "calc(var(--app-viewport-height, 100dvh) - 48px)" }} onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><div><h2 className="text-sm font-black">{editingNpcId ? "编辑关系网 NPC" : "新建关系网 NPC"}</h2></div>{editingNpcId ? <button type="button" aria-label="删除 NPC" onClick={() => { const npc = npcs.find(item => item.id === editingNpcId); if (npc) setNpcDeleteTarget(npc); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600"><Trash2 className="h-4 w-4" /></button> : <button type="button" aria-label="关闭新建 NPC" onClick={() => setNpcModalOpen(false)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f1eee7] text-[#746b60]"><X className="h-4 w-4" /></button>}</div>
            <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
              {npcEditorEdge && currentPerson && <button type="button" className="min-h-11 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-left text-xs text-[#51483e]" onClick={() => { setEdgeOpenedFromNpc(true); setNpcModalOpen(false); openExistingEdge(npcEditorEdge); }}>编辑与 {currentPerson.name} 的关系 ›</button>}
              <label className="block text-[10px] font-bold text-[#746b60]">名字<input autoFocus value={npcNameDraft} onChange={(event) => setNpcNameDraft(event.target.value)} placeholder="例如：周医生" className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[10px] font-bold text-[#746b60]">性别<input aria-label="NPC性别" value={npcGenderDraft} onChange={event => setNpcGenderDraft(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>
                <label className="block text-[10px] font-bold text-[#746b60]">年龄<input aria-label="NPC年龄" value={npcAgeDraft} onChange={event => setNpcAgeDraft(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>
              </div>
              <label className="block text-[10px] font-bold text-[#746b60]">头像（Emoji 或图片 URL）<input value={npcAvatarDraft} onChange={(event) => setNpcAvatarDraft(event.target.value)} placeholder="例如：🩺 或 https://…" className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>
              <label className="block text-[10px] font-bold text-[#746b60]">人物简介<textarea value={npcSummaryDraft} onChange={(event) => setNpcSummaryDraft(event.target.value)} placeholder="人物是谁、和谁有什么联系……" className="mt-1.5 min-h-16 w-full resize-none rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#a99a87]" /></label>
              <label className="block text-[10px] font-bold text-[#746b60]">性格关键词<textarea value={npcPersonalityDraft} onChange={(event) => setNpcPersonalityDraft(event.target.value)} placeholder="例如：温和、谨慎、观察力强" className="mt-1.5 min-h-14 w-full resize-none rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#a99a87]" /></label>
              <section className="space-y-3 rounded-2xl border border-[#e5ddd0] bg-[#faf7f1] p-3">
                <div className="flex items-center justify-between"><p className="text-[10px] font-black text-[#62594f]">朋友圈互动关系</p><span className="rounded-full bg-[#eeeae2] px-2 py-1 text-[8px] font-bold text-[#8d8377]">基础配置</span></div>
                <p className="text-[9px] leading-4 text-[#958c80]">动态发布与关系互动分别设置。角色手机会读取已关联的 NPC；手机内生成不代表公开发布。</p>
                {npcSocialDraft && <div>                <label className="mt-2 flex items-center gap-2 text-[10px] font-bold text-[#6d6459]"><input type="checkbox" checked={npcSocialDraft.enabled} onChange={(event) => setNpcSocialDraft({ ...npcSocialDraft, enabled: event.target.checked })} />启用朋友圈互动</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-[10px] text-[#756c61]"><input type="checkbox" checked={npcSocialDraft.canViewMoments} disabled={!npcSocialDraft.enabled || npcSocialDraft.canCommentMoments} onChange={(event) => setNpcSocialDraft({ ...npcSocialDraft, canViewMoments: event.target.checked })} />允许查看朋友圈</label>
                   <label className="flex items-center gap-2 text-[10px] text-[#756c61]"><input type="checkbox" checked={npcSocialDraft.canCommentMoments} disabled={!npcSocialDraft.enabled} onChange={(event) => setNpcSocialDraft({ ...npcSocialDraft, canCommentMoments: event.target.checked, canViewMoments: event.target.checked || npcSocialDraft.canViewMoments })} />允许发表评论</label>
                   <label className="flex items-center gap-2 text-[10px] text-[#756c61]"><input type="checkbox" checked={Boolean(npcSocialDraft.canLikeMoments)} disabled={!npcSocialDraft.enabled} onChange={(event) => setNpcSocialDraft({ ...npcSocialDraft, canLikeMoments: event.target.checked })} />允许点赞</label>
                   <label className="flex items-center gap-2 text-[10px] text-[#756c61]"><input type="checkbox" checked={Boolean(npcSocialDraft.canReplyMoments)} disabled={!npcSocialDraft.enabled} onChange={(event) => setNpcSocialDraft({ ...npcSocialDraft, canReplyMoments: event.target.checked })} />允许回复评论</label>
                 </div>
                 <label className="mt-2 block text-[10px] text-[#756c61]">互动频率<select value={npcSocialDraft.commentFrequency} disabled={!npcSocialDraft.enabled || (!npcSocialDraft.canCommentMoments && !npcSocialDraft.canLikeMoments && !npcSocialDraft.canReplyMoments)} onChange={(event) => setNpcSocialDraft({ ...npcSocialDraft, commentFrequency: event.target.value as RelationshipNetworkMomentCommentFrequency })} className="mt-1 w-full rounded-xl border border-[#e7e1d7] bg-white px-2.5 py-2 text-[10px] outline-none disabled:opacity-50"><option value="low">低：偶尔参与</option><option value="normal">正常：适度参与</option><option value="high">高：积极参与</option></select></label>
                 <label className="mt-2 block text-[10px] text-[#756c61]">文字互动发布方式<select value={npcSocialDraft.interactionApprovalMode || "automatic"} disabled={!npcSocialDraft.enabled || (!npcSocialDraft.canCommentMoments && !npcSocialDraft.canReplyMoments)} onChange={(event) => setNpcSocialDraft({ ...npcSocialDraft, interactionApprovalMode: event.target.value as RelationshipNetworkInteractionApprovalMode })} className="mt-1 w-full rounded-xl border border-[#e7e1d7] bg-white px-2.5 py-2 text-[10px] outline-none disabled:opacity-50"><option value="automatic">自动发布</option><option value="confirm">生成后确认</option></select></label>
                 {npcSocialDraft.interactionApprovalMode === "confirm" && <p className="mt-1 text-[9px] leading-4 text-[#958c80]">评论和回复会先进入朋友圈顶部的“待确认互动”；点赞仍会即时生效。</p>}
</div>}
              <label className="block text-[10px] font-bold text-[#746b60]">动态发布方式<select value={npcMomentApprovalModeDraft} onChange={(event) => setNpcMomentApprovalModeDraft(event.target.value as RelationshipNetworkNpcMomentApprovalMode)} className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]"><option value="automatic">自动发布</option><option value="confirm">生成后确认</option></select><span className="mt-1 block text-[9px] font-normal leading-4 text-[#958c80]">生成后确认：NPC 生成的朋友圈会先出现在朋友圈顶部的“待确认动态”，发布后才会公开；自动发布会直接进入朋友圈。</span></label>
              <label className="block text-[10px] font-bold text-[#746b60]">主动发布动态<select value={npcMomentAutoModeDraft} onChange={(event) => setNpcMomentAutoModeDraft(event.target.value as RelationshipNetworkNpcMomentAutoMode)} className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]"><option value="manual">关闭（仅手动）</option><option value="scheduled_and_event">按时间或事件</option></select></label>
              <label className="mt-2 block text-[10px] font-bold text-[#746b60]">发布频率<select value={npcMomentAutoFrequencyDraft} onChange={(event) => setNpcMomentAutoFrequencyDraft(event.target.value as RelationshipNetworkNpcMomentAutoFrequency)} disabled={npcMomentAutoModeDraft === "manual"} className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87] disabled:opacity-50"><option value="low">低频（约每天一次）</option><option value="normal">正常（约半天一次）</option><option value="high">高频（约四小时一次）</option></select></label>
              <span className="block text-[9px] font-normal leading-4 text-[#958c80]">NPC 可直接使用自己的设定参与自动行为；提升为完整角色后，会额外使用档案馆中的完整人设和世界书。时间触发受上方频率控制；聊天事件会等待安静约 2 分钟，关系事件只使用已记录的关系变化。</span>
              </section>
            </div>
            <div className="mt-4 flex gap-2"><button type="button" onClick={() => setNpcModalOpen(false)} className="flex-1 rounded-xl bg-[#f0ece5] py-2.5 text-xs font-bold text-[#756c61]">取消</button><button type="button" onClick={saveNpc} className="flex-1 rounded-xl bg-[#51483e] py-2.5 text-xs font-bold text-white">保存 NPC</button></div>
          </div>
        </div>
      )}

      {npcDeleteTarget && <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
        <section role="alertdialog" aria-modal="true" aria-labelledby="npc-delete-title" aria-describedby="npc-delete-description" className="w-full max-w-xs overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="space-y-2 px-6 pb-5 pt-6 text-center">
            <h3 id="npc-delete-title" className="text-lg font-bold text-slate-900">删除 NPC</h3>
            <p id="npc-delete-description" className="text-sm leading-relaxed text-slate-600">删除“{npcDeleteTarget.name}”后，将移除这个 NPC、其关系网连线及互动设置，且无法恢复。已提升的完整角色和已有聊天记录不会删除。</p>
          </div>
          <div className="grid grid-cols-2 border-t border-slate-100">
            <button type="button" autoFocus onClick={() => setNpcDeleteTarget(null)} className="border-r border-slate-100 py-4 text-base font-medium text-slate-600 hover:bg-slate-50">取消</button>
            <button type="button" onClick={() => deleteNpc(npcDeleteTarget)} className="py-4 text-base font-medium text-red-500 hover:bg-red-50">确定</button>
          </div>
        </section>
      </div>}

      {npcLinkConfirmOpen && selectedNpc && (
        <div className="absolute inset-0 z-[110] flex items-end justify-center bg-[#2d2822]/30 p-3 backdrop-blur-[2px]" onPointerDown={() => setNpcLinkConfirmOpen(false)}>
          <div className="w-full max-w-[420px] rounded-[26px] bg-[#fffdfa] p-4 shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>
            <h2 className="text-sm font-black">提升为完整角色</h2>
            <p className="mt-2 text-[11px] leading-5 text-[#81786d]">为「{selectedNpc.name}」创建一份完整角色档案和聊天入口。它仍然是原来的这个 NPC，不会与关系网中的人物重复；之后可以在档案馆继续完善人设、头像和世界书。</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setNpcLinkConfirmOpen(false)} className="flex-1 rounded-xl bg-[#f0ece5] py-2.5 text-xs font-bold text-[#756c61]">暂不提升</button>
              <button type="button" onClick={confirmSelectedNpcLink} className="flex-1 rounded-xl bg-[#51483e] py-2.5 text-xs font-bold text-white">确认提升</button>
            </div>
          </div>
        </div>
      )}

      {edgeModalOpen && edgeDraft && (
      <div className="absolute inset-0 z-[100] flex min-h-0 items-center justify-center overflow-hidden bg-[#2d2822]/30 p-3 backdrop-blur-[2px]" onPointerDown={() => { setEdgeModalOpen(false); setEdgeDraft(null); setSocialDraft(null); if (edgeOpenedFromNpc) setNpcModalOpen(true); setEdgeOpenedFromNpc(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="relationship-dialog-title" className="flex min-h-0 w-full max-w-[420px] flex-col overflow-hidden rounded-[26px] bg-[#fffdfa] p-4 shadow-2xl" style={{ maxHeight: "calc(var(--app-viewport-height, 100dvh) - 48px)" }} onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between"><div><h2 id="relationship-dialog-title" className="text-sm font-black">设置人物关系</h2><p className="mt-0.5 text-[10px] text-[#958c80]">{sourceName} 与 {targetName}</p></div><button type="button" onClick={() => { setEdgeModalOpen(false); setEdgeDraft(null); setSocialDraft(null); if (edgeOpenedFromNpc) setNpcModalOpen(true); setEdgeOpenedFromNpc(false); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f1eee7] text-[#746c61]"><X className="h-4 w-4" /></button></div>
            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-0.5">
              <label className="block text-[10px] font-bold text-[#746b60]">箭头方向<select value={edgeDraft.direction} onChange={(event) => setEdgeDraft({ ...edgeDraft, direction: event.target.value as RelationshipNetworkEdgeDirection })} className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none"><option value="forward">{sourceName} → {targetName}</option><option value="reverse">{sourceName} ← {targetName}</option><option value="both">{sourceName} ↔ {targetName}（双向）</option></select></label>
              {edgeDraft.direction !== "reverse" && <label className="block text-[10px] font-bold text-[#746c61]">{sourceName} 对 {targetName}<input value={edgeDraft.forwardLabel} onChange={(event) => setEdgeDraft({ ...edgeDraft, forwardLabel: event.target.value })} placeholder="例如：喜欢、信任、是同事" className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>}
              {edgeDraft.direction !== "forward" && <label className="block text-[10px] font-bold text-[#746c61]">{targetName} 对 {sourceName}<input value={edgeDraft.reverseLabel} onChange={(event) => setEdgeDraft({ ...edgeDraft, reverseLabel: event.target.value })} placeholder="例如：依赖、提防、是同事" className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>}
              <label className="block text-[10px] font-bold text-[#746c61]">关系分类（可选）<input value={edgeDraft.category} onChange={(event) => setEdgeDraft({ ...edgeDraft, category: event.target.value })} placeholder="例如：现实、过去、故事线" className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>
              <label className="block text-[10px] font-bold text-[#746c61]">备注（可选）<textarea value={edgeDraft.note} onChange={(event) => setEdgeDraft({ ...edgeDraft, note: event.target.value })} placeholder="补充这段关系的背景" className="mt-1.5 min-h-16 w-full resize-none rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#a99a87]" /></label>

            </div>
            <div className="mt-3 flex shrink-0 gap-2 border-t border-[#eee9e0] pt-3"><button type="button" onClick={() => { setEdgeModalOpen(false); setEdgeDraft(null); setSocialDraft(null); if (edgeOpenedFromNpc) setNpcModalOpen(true); setEdgeOpenedFromNpc(false); }} className="flex-1 rounded-xl bg-[#f0ece5] py-2.5 text-xs font-bold text-[#756c61]">取消</button>{edgeDraft.id && <button type="button" onClick={deleteSelectedEdge} className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600" aria-label="删除关系"><Trash2 className="h-4 w-4" /></button>}<button type="button" onClick={saveEdge} className="flex-1 rounded-xl bg-[#51483e] py-2.5 text-xs font-bold text-white">保存关系</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
