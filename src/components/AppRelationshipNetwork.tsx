import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Expand,
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
  findRelationshipNetworkSocialLinkByEdge,
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
import type { Character, UserIdentity } from "../types";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";

const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 760;
const NODE_WIDTH = 174;
const NODE_HEIGHT = 90;
const MIN_SCALE = 0.55;
const MAX_SCALE = 1.35;

interface AppRelationshipNetworkProps {
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
  activeIdentity,
  characters = [],
  relationships = [],
  onOpenChat,
  onLinkNpcToChat,
  onGenerateNpcMoment,
  onCheckNpcAutomation,
  onClose,
}: AppRelationshipNetworkProps) {
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
  const [edgeModalOpen, setEdgeModalOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [nodeSearch, setNodeSearch] = useState("");
  const [nodeTypeFilter, setNodeTypeFilter] = useState<"all" | RelationshipNetworkEntityType>("all");
  const [edgeCategoryFilter, setEdgeCategoryFilter] = useState("all");
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
  const socialSourceName = socialDraft ? nodeModels.find((model) => model.type === socialDraft.sourceEntityType && model.node.entityId === socialDraft.sourceEntityId)?.name || "NPC" : "NPC";
  const socialTargetName = socialDraft ? nodeModels.find((model) => model.type === socialDraft.targetEntityType && model.node.entityId === socialDraft.targetEntityId)?.name || "角色" : "角色";
  const socialTargetTypeLabel = socialDraft?.targetEntityType === "identity" ? "身份" : "角色";
  const socialDraftNpc = socialDraft?.sourceEntityType === "npc"
    ? npcs.find((npc) => npc.id === socialDraft.sourceEntityId)
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

  const visibleNodeModels = useMemo(() => {
    const query = nodeSearch.trim().toLowerCase();
    return nodeModels.filter((model) => {
      if (nodeTypeFilter !== "all" && model.type !== nodeTypeFilter) return false;
      if (!query) return true;
      return `${model.name} ${model.summary} ${model.typeLabel}`.toLowerCase().includes(query);
    });
  }, [nodeModels, nodeSearch, nodeTypeFilter]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodeModels.map((model) => model.node.id)), [visibleNodeModels]);
  const edgeCategories = useMemo(() => {
    const categories = new Set<string>();
    network.edges.forEach((edge) => categories.add(edge.category?.trim() || "未分类"));
    return Array.from(categories).sort((left, right) => left.localeCompare(right));
  }, [network.edges]);
  const matchingEdges = useMemo(() => network.edges.filter((edge) => {
    if (!visibleNodeIds.has(edge.sourceNodeId) && !visibleNodeIds.has(edge.targetNodeId)) return false;
    if (edgeCategoryFilter === "all") return true;
    return (edge.category?.trim() || "未分类") === edgeCategoryFilter;
  }), [edgeCategoryFilter, network.edges, visibleNodeIds]);
  const visibleEdges = useMemo(() => matchingEdges.filter((edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId)), [matchingEdges, visibleNodeIds]);

  const hasEntityNode = (entityType: RelationshipNetworkEntityType, entityId: string) =>
    network.nodes.some((node) => node.entityType === entityType && node.entityId === entityId);

  const getWorldCenter = () => {
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
    const overlaps = (x: number, y: number) => networkRef.current.nodes.some((node) =>
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
    if (!npc || !recipient || !["character", "identity"].includes(recipient.entityType)) return null;
    const stored = networkEdgeId ? findRelationshipNetworkSocialLinkByEdge(activeIdentity.id, networkEdgeId) : undefined;
    return {
      id: stored?.id,
      sourceEntityType: "npc",
      sourceEntityId: npc.entityId,
      targetEntityType: recipient.entityType,
      targetEntityId: recipient.entityId,
      relationshipLabel: stored?.relationshipLabel || "好友",
      enabled: stored?.enabled ?? false,
      canViewMoments: stored?.canViewMoments ?? false,
      canCommentMoments: stored?.canCommentMoments ?? false,
      canLikeMoments: stored?.canLikeMoments ?? false,
      canReplyMoments: stored?.canReplyMoments ?? false,
      interactionApprovalMode: stored?.interactionApprovalMode || "automatic",
      commentFrequency: stored?.commentFrequency || "low",
    };
  };

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
      const existingSocialLink = findRelationshipNetworkSocialLinkByEdge(activeIdentity.id, edge.id);
      if (socialDraft?.enabled) {
        const socialResult = upsertRelationshipNetworkSocialLink({
          id: socialDraft.id || existingSocialLink?.id || createId("relationship-network-social"),
          ownerIdentityId: activeIdentity.id,
          sourceEntityType: socialDraft.sourceEntityType,
          sourceEntityId: socialDraft.sourceEntityId,
          targetEntityType: socialDraft.targetEntityType,
          targetEntityId: socialDraft.targetEntityId,
          relationshipLabel: socialDraft.relationshipLabel.trim() || "好友",
          enabled: true,
          canViewMoments: socialDraft.canViewMoments,
          canCommentMoments: socialDraft.canCommentMoments,
          canLikeMoments: socialDraft.canLikeMoments,
          canReplyMoments: socialDraft.canReplyMoments,
          interactionApprovalMode: socialDraft.interactionApprovalMode,
          commentFrequency: socialDraft.commentFrequency,
          networkEdgeId: edge.id,
          createdAt: existingSocialLink?.createdAt || now,
          updatedAt: now,
        });
        if (!socialResult.success) setError("关系已保存，但朋友圈互动设置保存失败。");
        else setSocialLinks(listRelationshipNetworkSocialLinksForIdentity(activeIdentity.id));
      } else if (existingSocialLink) {
        // Keep the disabled record so its frequency and audit trail can be
        // restored when the user enables this relationship again.
        const socialResult = upsertRelationshipNetworkSocialLink({
          ...existingSocialLink,
          enabled: false,
          updatedAt: now,
        });
        if (!socialResult.success) setError("关系已保存，但朋友圈互动设置未能关闭。");
        else setSocialLinks(listRelationshipNetworkSocialLinksForIdentity(activeIdentity.id));
      }
      setSelectedEdgeId(edge.id);
      setEdgeModalOpen(false);
      setEdgeDraft(null);
      setSocialDraft(null);
    }
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdge) return;
    if (!window.confirm("删除这条关系线？人物本身不会被删除。")) return;
    if (commitNetwork({ ...networkRef.current, edges: networkRef.current.edges.filter((edge) => edge.id !== selectedEdge.id) }, "关系线已删除。")) {
      const socialLink = findRelationshipNetworkSocialLinkByEdge(activeIdentity.id, selectedEdge.id);
      if (socialLink) {
        const socialResult = removeRelationshipNetworkSocialLink(activeIdentity.id, socialLink.id);
        const interactionResult = removeRelationshipNetworkInteractionRecordsForSocialLink(activeIdentity.id, socialLink.id);
        if (!socialResult.success || !interactionResult.success) setError("关系线已删除，但朋友圈互动记录清理失败。");
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
    const next = {
      ...networkRef.current,
      nodes: networkRef.current.nodes.filter((item) => item.id !== node.id),
      edges: networkRef.current.edges.filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)),
    };
    if (commitNetwork(next, "已从画布移除人物。")) setSelectedNodeId(null);
  };

  const openNpcComposer = (npc?: RelationshipNetworkNpc) => {
    setEditingNpcId(npc?.id || null);
    setNpcNameDraft(npc?.name || "");
    setNpcAvatarDraft(npc?.avatar || "");
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
    const result = upsertRelationshipNetworkNpc(npc);
    if (!result.success) {
      setError(result.error === "scope" ? "NPC 作用域校验失败，未保存。" : "NPC 保存失败，请检查浏览器本地存储空间。");
      return;
    }
    setNpcs(listRelationshipNetworkNpcsForIdentity(activeIdentity.id));
    if (!previous) addEntityNode("npc", npc.id);
    setNpcModalOpen(false);
    setEditingNpcId(null);
    setNotice(previous ? "NPC 已更新。" : "NPC 已创建并添加到画布。");
  };

  const deleteNpc = (npc: RelationshipNetworkNpc) => {
    if (!window.confirm(`删除 NPC「${npc.name}」？这会同时移除它在当前关系网中的节点。`)) return;
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
  };

  const fitView = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || networkRef.current.nodes.length === 0) return;
    const minX = Math.min(...networkRef.current.nodes.map((node) => node.x));
    const minY = Math.min(...networkRef.current.nodes.map((node) => node.y));
    const maxX = Math.max(...networkRef.current.nodes.map((node) => node.x + NODE_WIDTH));
    const maxY = Math.max(...networkRef.current.nodes.map((node) => node.y + NODE_HEIGHT));
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
    const nodes = networkRef.current.nodes;
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
      nodes: nodes.map((node) => ({ ...node, ...positions.get(node.id) })),
    };
    if (!commitNetwork(next, "画布已自动整理。")) return;
    requestAnimationFrame(fitView);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(fitView);
    return () => window.cancelAnimationFrame(frame);
  }, [activeIdentity.id]);

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

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#f6f4ef] text-[#332f2a]" data-theme-page="relationship-network">
      <header className="relative z-30 flex shrink-0 items-center justify-between border-b border-[#e7e2d9] bg-[#faf9f6]/95 px-3 py-2 backdrop-blur-md">
        <button type="button" onClick={onClose} className="app-nav-icon-button flex h-8 w-8 items-center justify-center" aria-label="返回主页">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <div className="text-center">
            <h1 className="text-[15px] font-black tracking-tight">关系网</h1>
            <p className="text-[9px] font-medium text-[#928b80]">{network.name}</p>
          </div>
          <div className="hidden items-center gap-1 rounded-full bg-[#eeeae2] px-2 py-1 text-[9px] font-bold text-[#6c665d] min-[390px]:flex">
            <Avatar value={activeIdentity.avatar} name={activeIdentity.name} className="h-4 w-4 text-[8px]" />
            <span className="max-w-[70px] truncate">{activeIdentity.name}</span>
          </div>
        </div>
        <button type="button" onClick={arrangeNodes} className="app-nav-icon-button flex h-8 w-8 items-center justify-center" aria-label="整理画布" title="整理画布">
          <Expand className="h-4 w-4" />
        </button>
      </header>

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
          <button type="button" onClick={() => { setPickerSearch(""); setNodePickerOpen(true); }} className="flex h-8 items-center gap-1 rounded-full bg-[#fffdfa]/95 px-2.5 text-[10px] font-bold text-[#544e45] shadow-sm ring-1 ring-[#e0dbd1]">
            <Plus className="h-3.5 w-3.5" />添加人物
          </button>
          <button type="button" onClick={() => openNpcComposer()} className="flex h-8 items-center gap-1 rounded-full bg-[#fffdfa]/95 px-2.5 text-[10px] font-bold text-[#544e45] shadow-sm ring-1 ring-[#e0dbd1]">
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
                  <button type="button" onClick={() => { const npc = npcs.find((item) => item.id === selectedNode.node.entityId); if (npc) deleteNpc(npc); }} className="flex items-center gap-1 rounded-full bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-600"><Trash2 className="h-3 w-3" />删除 NPC</button>
                </>
              )}
              {selectedNode.type !== "identity" && <button type="button" onClick={() => removeNodeFromCanvas(selectedNode.node)} className="rounded-full border border-[#ded8ce] px-3 py-2 text-[10px] font-bold text-[#7d7469]">仅从画布移除</button>}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[#ece7df] pt-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-[#958c80]">与此人物的关系</h3>
              <button type="button" onClick={() => setSelectedNodeId(null)} className="text-[10px] font-bold text-[#958c80]">查看全部</button>
            </div>
            <div className="mt-2 space-y-1.5">
              {network.edges.filter((edge) => edge.sourceNodeId === selectedNode.node.id || edge.targetNodeId === selectedNode.node.id).length === 0 ? (
                <p className="rounded-xl bg-[#f3f0ea] px-3 py-3 text-center text-[10px] text-[#9b9287]">还没有关系，点击上方“连线”开始设置。</p>
              ) : network.edges.filter((edge) => edge.sourceNodeId === selectedNode.node.id || edge.targetNodeId === selectedNode.node.id).map((edge) => {
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
                <p className="mt-0.5 text-[10px] text-[#968d82]">{visibleNodeModels.length} 个人物 · {matchingEdges.length} 条关系 · {socialLinks.filter((link) => link.enabled).length} 条已启用互动 · {interactionRecords.filter((record) => record.status === "completed").length} 次已完成互动</p>
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
                  <p className="mt-2 text-[11px] font-bold text-[#746b60]">{network.edges.length === 0 ? "还没有关系线" : "没有匹配的关系"}</p>
                  <p className="mt-1 text-[10px] leading-4 text-[#9b9287]">{network.edges.length === 0 ? "先添加人物，再点击“连线”连接两个节点。" : "换一个人物或关系分类筛选试试。"}</p>
                </div>
              ) : matchingEdges.map((edge) => {
                const source = nodeModels.find((model) => model.node.id === edge.sourceNodeId);
                const target = nodeModels.find((model) => model.node.id === edge.targetNodeId);
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
                    <button type="button" onClick={() => openExistingEdge(edge)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#81776b] hover:bg-[#e5dfd5]" aria-label={`编辑关系 ${source?.name || "人物 A"} ${target?.name || "人物 B"}`}><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {(notice || error) && (
        <div className={`pointer-events-none absolute bottom-[41%] left-1/2 z-[80] max-w-[88%] -translate-x-1/2 rounded-full px-3 py-2 text-center text-[10px] font-bold shadow-lg ${error ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-[#51483e] text-white"}`} role={error ? "alert" : "status"}>
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
                  const added = hasEntityNode("character", character.id);
                  return <button key={character.id} type="button" disabled={added} onClick={() => addEntityNode("character", character.id)} className="flex w-full items-center gap-3 rounded-2xl bg-[#f7f5f0] p-2.5 text-left disabled:opacity-50"><Avatar value={character.avatar} name={character.name} className="h-9 w-9" /><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{character.name}</strong><small className="block truncate text-[10px] text-[#998f83]">{character.remark || character.personality || "角色档案"}</small></span><span className="text-[10px] font-bold text-[#9a9186]">{added ? "已添加" : "添加"}</span></button>;
                })}
              </div>
              <div className="mt-4 flex items-center justify-between"><div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#9b9287]"><UserRound className="h-3.5 w-3.5" />关系网 NPC</div><button type="button" onClick={() => openNpcComposer()} className="text-[10px] font-bold text-[#6e6255]">+ 新建</button></div>
              <div className="mt-2 space-y-1.5">
                {filteredNpcs.length === 0 ? <p className="rounded-xl bg-[#f5f2ec] px-3 py-3 text-center text-[10px] text-[#a0988d]">还没有关系网 NPC</p> : filteredNpcs.map((npc) => {
                  const added = hasEntityNode("npc", npc.id);
                  return <button key={npc.id} type="button" disabled={added} onClick={() => addEntityNode("npc", npc.id)} className="flex w-full items-center gap-3 rounded-2xl bg-[#f7f4fa] p-2.5 text-left disabled:opacity-50"><Avatar value={npc.avatar} name={npc.name} className="h-9 w-9" /><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{npc.name}</strong><small className="block truncate text-[10px] text-[#998f83]">{npc.summary || "关系网辅助人物"}</small></span><span className="text-[10px] font-bold text-[#9a9186]">{added ? "已添加" : "添加"}</span></button>;
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {npcModalOpen && (
        <div className="absolute inset-0 z-[100] flex items-end justify-center bg-[#2d2822]/30 p-3 backdrop-blur-[2px]" onPointerDown={() => setNpcModalOpen(false)}>
          <div className="w-full max-w-[420px] rounded-[26px] bg-[#fffdfa] p-4 shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><div><h2 className="text-sm font-black">{editingNpcId ? "编辑关系网 NPC" : "新建关系网 NPC"}</h2><p className="mt-0.5 text-[10px] text-[#958c80]">创建后就是独立人物；与角色连线后可按设定参与互动。提升为完整角色是可选的。</p></div><button type="button" onClick={() => setNpcModalOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f1eee7] text-[#746b60]"><X className="h-4 w-4" /></button></div>
            <div className="mt-4 max-h-[58vh] space-y-3 overflow-y-auto pr-0.5">
              <label className="block text-[10px] font-bold text-[#746b60]">名字<input autoFocus value={npcNameDraft} onChange={(event) => setNpcNameDraft(event.target.value)} placeholder="例如：周医生" className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>
              <label className="block text-[10px] font-bold text-[#746b60]">头像（Emoji 或图片 URL）<input value={npcAvatarDraft} onChange={(event) => setNpcAvatarDraft(event.target.value)} placeholder="例如：🩺 或 https://…" className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[10px] font-bold text-[#746b60]">身份 / 职业<input value={npcRoleDraft} onChange={(event) => setNpcRoleDraft(event.target.value)} placeholder="例如：医生、同事" className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>
                <label className="block text-[10px] font-bold text-[#746b60]">标签<input value={npcTagsDraft} onChange={(event) => setNpcTagsDraft(event.target.value)} placeholder="用逗号分隔" className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>
              </div>
              <label className="block text-[10px] font-bold text-[#746b60]">人物简介<textarea value={npcSummaryDraft} onChange={(event) => setNpcSummaryDraft(event.target.value)} placeholder="人物是谁、和谁有什么联系……" className="mt-1.5 min-h-16 w-full resize-none rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#a99a87]" /></label>
              <label className="block text-[10px] font-bold text-[#746b60]">性格关键词<textarea value={npcPersonalityDraft} onChange={(event) => setNpcPersonalityDraft(event.target.value)} placeholder="例如：温和、谨慎、观察力强" className="mt-1.5 min-h-14 w-full resize-none rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#a99a87]" /></label>
              <label className="block text-[10px] font-bold text-[#746b60]">当前动机<textarea value={npcMotivationDraft} onChange={(event) => setNpcMotivationDraft(event.target.value)} placeholder="例如：想查清一件旧案、保护某个人" className="mt-1.5 min-h-14 w-full resize-none rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#a99a87]" /></label>
              <label className="block text-[10px] font-bold text-[#746b60]">主动发动态方式<select value={npcMomentApprovalModeDraft} onChange={(event) => setNpcMomentApprovalModeDraft(event.target.value as RelationshipNetworkNpcMomentApprovalMode)} className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]"><option value="automatic">自动发布</option><option value="confirm">生成后确认</option></select><span className="mt-1 block text-[9px] font-normal leading-4 text-[#958c80]">生成后确认：NPC 生成的朋友圈会先出现在朋友圈顶部的“待确认动态”，发布后才会公开；自动发布会直接进入朋友圈。</span></label>
              <label className="block text-[10px] font-bold text-[#746b60]">自动发动态触发<select value={npcMomentAutoModeDraft} onChange={(event) => setNpcMomentAutoModeDraft(event.target.value as RelationshipNetworkNpcMomentAutoMode)} className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]"><option value="manual">关闭（仅手动）</option><option value="scheduled_and_event">按时间或事件</option></select></label>
              <label className="mt-2 block text-[10px] font-bold text-[#746b60]">自动频率<select value={npcMomentAutoFrequencyDraft} onChange={(event) => setNpcMomentAutoFrequencyDraft(event.target.value as RelationshipNetworkNpcMomentAutoFrequency)} disabled={npcMomentAutoModeDraft === "manual"} className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87] disabled:opacity-50"><option value="low">低频（约每天一次）</option><option value="normal">正常（约半天一次）</option><option value="high">高频（约四小时一次）</option></select></label>
              <span className="block text-[9px] font-normal leading-4 text-[#958c80]">NPC 可直接使用自己的设定参与自动行为；提升为完整角色后，会额外使用档案馆中的完整人设和世界书。时间触发受上方频率控制；聊天事件会等待安静约 2 分钟，关系事件只使用已记录的关系变化。</span>
            </div>
            <div className="mt-4 flex gap-2"><button type="button" onClick={() => setNpcModalOpen(false)} className="flex-1 rounded-xl bg-[#f0ece5] py-2.5 text-xs font-bold text-[#756c61]">取消</button><button type="button" onClick={saveNpc} className="flex-1 rounded-xl bg-[#51483e] py-2.5 text-xs font-bold text-white">保存 NPC</button></div>
          </div>
        </div>
      )}

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
      <div className="absolute inset-0 z-[100] flex min-h-0 items-center justify-center overflow-hidden bg-[#2d2822]/30 p-3 backdrop-blur-[2px]" onPointerDown={() => { setEdgeModalOpen(false); setEdgeDraft(null); setSocialDraft(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="relationship-dialog-title" className="flex h-[calc(100dvh-48px)] max-h-[calc(100dvh-48px)] min-h-0 w-full max-w-[420px] flex-col overflow-hidden rounded-[26px] bg-[#fffdfa] p-4 shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between"><div><h2 id="relationship-dialog-title" className="text-sm font-black">设置人物关系</h2><p className="mt-0.5 text-[10px] text-[#958c80]">{sourceName} 与 {targetName}</p></div><button type="button" onClick={() => { setEdgeModalOpen(false); setEdgeDraft(null); setSocialDraft(null); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f1eee7] text-[#746c61]"><X className="h-4 w-4" /></button></div>
            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-0.5">
              <label className="block text-[10px] font-bold text-[#746b60]">箭头方向<select value={edgeDraft.direction} onChange={(event) => setEdgeDraft({ ...edgeDraft, direction: event.target.value as RelationshipNetworkEdgeDirection })} className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none"><option value="forward">{sourceName} → {targetName}</option><option value="reverse">{sourceName} ← {targetName}</option><option value="both">{sourceName} ↔ {targetName}（双向）</option></select></label>
              {edgeDraft.direction !== "reverse" && <label className="block text-[10px] font-bold text-[#746c61]">{sourceName} 对 {targetName}<input value={edgeDraft.forwardLabel} onChange={(event) => setEdgeDraft({ ...edgeDraft, forwardLabel: event.target.value })} placeholder="例如：喜欢、信任、是同事" className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>}
              {edgeDraft.direction !== "forward" && <label className="block text-[10px] font-bold text-[#746c61]">{targetName} 对 {sourceName}<input value={edgeDraft.reverseLabel} onChange={(event) => setEdgeDraft({ ...edgeDraft, reverseLabel: event.target.value })} placeholder="例如：依赖、提防、是同事" className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>}
              <label className="block text-[10px] font-bold text-[#746c61]">关系分类（可选）<input value={edgeDraft.category} onChange={(event) => setEdgeDraft({ ...edgeDraft, category: event.target.value })} placeholder="例如：现实、过去、故事线" className="mt-1.5 w-full rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs outline-none focus:border-[#a99a87]" /></label>
              <label className="block text-[10px] font-bold text-[#746c61]">备注（可选）<textarea value={edgeDraft.note} onChange={(event) => setEdgeDraft({ ...edgeDraft, note: event.target.value })} placeholder="补充这段关系的背景" className="mt-1.5 min-h-16 w-full resize-none rounded-xl border border-[#e7e1d7] bg-[#f8f6f1] px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#a99a87]" /></label>
              {socialDraft && <div className="rounded-2xl border border-[#e5ddd0] bg-[#faf7f1] p-3">
                <div className="flex items-center justify-between"><div><p className="text-[10px] font-black text-[#62594f]">朋友圈互动关系</p><p className="mt-0.5 text-[9px] text-[#958c80]">NPC「{socialSourceName}」→ {socialTargetTypeLabel}「{socialTargetName}」</p><p className="mt-0.5 text-[9px] text-[#a1988c]">箭头左侧是互动发起者，右侧是它会查看和回应的对象。</p></div><span className="rounded-full bg-[#eeeae2] px-2 py-1 text-[8px] font-bold text-[#8d8377]">基础配置</span></div>
                 <p className="mt-2 text-[9px] leading-4 text-[#958c80]">{socialDraftNpcReady ? "NPC 会直接使用自己的设定参与目标朋友圈；提升为完整角色后，会额外使用完整档案和世界书。" : "当前 NPC 已不存在，无法启用这条朋友圈互动关系。"}</p>
                <label className="mt-2 flex items-center gap-2 text-[10px] font-bold text-[#6d6459]"><input type="checkbox" checked={socialDraft.enabled} onChange={(event) => setSocialDraft({ ...socialDraft, enabled: event.target.checked })} />启用朋友圈互动</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-[10px] text-[#756c61]"><input type="checkbox" checked={socialDraft.canViewMoments} disabled={!socialDraft.enabled || socialDraft.canCommentMoments} onChange={(event) => setSocialDraft({ ...socialDraft, canViewMoments: event.target.checked })} />允许查看朋友圈</label>
                   <label className="flex items-center gap-2 text-[10px] text-[#756c61]"><input type="checkbox" checked={socialDraft.canCommentMoments} disabled={!socialDraft.enabled} onChange={(event) => setSocialDraft({ ...socialDraft, canCommentMoments: event.target.checked, canViewMoments: event.target.checked || socialDraft.canViewMoments })} />允许发表评论</label>
                   <label className="flex items-center gap-2 text-[10px] text-[#756c61]"><input type="checkbox" checked={Boolean(socialDraft.canLikeMoments)} disabled={!socialDraft.enabled} onChange={(event) => setSocialDraft({ ...socialDraft, canLikeMoments: event.target.checked })} />允许点赞</label>
                   <label className="flex items-center gap-2 text-[10px] text-[#756c61]"><input type="checkbox" checked={Boolean(socialDraft.canReplyMoments)} disabled={!socialDraft.enabled} onChange={(event) => setSocialDraft({ ...socialDraft, canReplyMoments: event.target.checked })} />允许回复评论</label>
                 </div>
                 <label className="mt-2 block text-[10px] text-[#756c61]">互动频率<select value={socialDraft.commentFrequency} disabled={!socialDraft.enabled || (!socialDraft.canCommentMoments && !socialDraft.canLikeMoments && !socialDraft.canReplyMoments)} onChange={(event) => setSocialDraft({ ...socialDraft, commentFrequency: event.target.value as RelationshipNetworkMomentCommentFrequency })} className="mt-1 w-full rounded-xl border border-[#e7e1d7] bg-white px-2.5 py-2 text-[10px] outline-none disabled:opacity-50"><option value="low">低：偶尔参与</option><option value="normal">正常：适度参与</option><option value="high">高：积极参与</option></select></label>
                 <label className="mt-2 block text-[10px] text-[#756c61]">文字互动发布方式<select value={socialDraft.interactionApprovalMode || "automatic"} disabled={!socialDraft.enabled || (!socialDraft.canCommentMoments && !socialDraft.canReplyMoments)} onChange={(event) => setSocialDraft({ ...socialDraft, interactionApprovalMode: event.target.value as RelationshipNetworkInteractionApprovalMode })} className="mt-1 w-full rounded-xl border border-[#e7e1d7] bg-white px-2.5 py-2 text-[10px] outline-none disabled:opacity-50"><option value="automatic">自动发布</option><option value="confirm">生成后确认</option></select></label>
                 {socialDraft.interactionApprovalMode === "confirm" && <p className="mt-1 text-[9px] leading-4 text-[#958c80]">评论和回复会先进入朋友圈顶部的“待确认互动”；点赞仍会即时生效。</p>}
                {socialDraft.id && <div className="mt-3 rounded-xl border border-[#e8e1d8] bg-white/70 p-2.5">
                  <div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-black text-[#62594f]">互动回溯</p><p className="mt-0.5 text-[9px] text-[#958c80]">只记录自动互动结果，不保存提示词或私密上下文。</p></div>{draftInteractionRecords.length > 0 && <button type="button" onClick={clearSocialInteractionHistory} className="shrink-0 text-[9px] font-bold text-rose-500">清空记录</button>}</div>
                  {draftInteractionRecords.length === 0 ? <p className="mt-2 text-[9px] text-[#a1988c]">还没有自动互动记录。</p> : <div className="mt-2 space-y-1.5">{draftInteractionRecords.slice(0, 3).map((record) => <div key={record.id} className="rounded-lg bg-[#f7f4ee] px-2 py-1.5"><div className="flex items-center justify-between gap-2 text-[9px]"><span className={`${record.status === "completed" ? "text-[#6c8570]" : record.status === "failed" ? "text-rose-500" : "text-[#988a75]"}`}>{interactionActionLabel(record.action)} · {interactionStatusLabel(record.status)}</span><span className="text-[#a1988c]">{new Date(record.occurredAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></div><p className="mt-0.5 line-clamp-2 text-[9px] leading-4 text-[#756c61]">{record.content || record.reason || (record.action === "like" ? "已点赞这条朋友圈" : record.action === "reply" ? "已回复这条朋友圈评论" : "未产生可展示内容")}</p></div>)}</div>}
                </div>}
              </div>}
            </div>
            <div className="mt-3 flex shrink-0 gap-2 border-t border-[#eee9e0] pt-3"><button type="button" onClick={() => { setEdgeModalOpen(false); setEdgeDraft(null); setSocialDraft(null); }} className="flex-1 rounded-xl bg-[#f0ece5] py-2.5 text-xs font-bold text-[#756c61]">取消</button>{edgeDraft.id && <button type="button" onClick={deleteSelectedEdge} className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600" aria-label="删除关系"><Trash2 className="h-4 w-4" /></button>}<button type="button" onClick={saveEdge} className="flex-1 rounded-xl bg-[#51483e] py-2.5 text-xs font-bold text-white">保存关系</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
