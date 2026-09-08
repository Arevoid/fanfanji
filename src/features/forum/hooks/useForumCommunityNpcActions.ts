import type { Dispatch, SetStateAction } from "react";
import type { ForumCommunityNpc } from "../../../types";
import { createId } from "../../../core/id/createId";
import { createForumCommunityNpc } from "../forumCommunityNpcData";
import { upsertForumCommunityNpc } from "../../../core/storage/repositories/forumCommunityNpcRepository";

interface UseForumCommunityNpcActionsOptions {
  activeIdentityId: string;
  communityNpcs: ForumCommunityNpc[];
  selectedCommunityNpcIds: string[];
  communityNpcName: string;
  communityNpcAvatar: string;
  communityNpcPersona: string;
  setCommunityNpcName: Dispatch<SetStateAction<string>>;
  setCommunityNpcAvatar: Dispatch<SetStateAction<string>>;
  setCommunityNpcPersona: Dispatch<SetStateAction<string>>;
  setShowCommunityNpcComposer: Dispatch<SetStateAction<boolean>>;
  setSelectedCommunityNpcIds: Dispatch<SetStateAction<string[]>>;
  setCommunityNpcRevision: Dispatch<SetStateAction<number>>;
  setShowCommunityNpcExport: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
}

export function useForumCommunityNpcActions({
  activeIdentityId,
  communityNpcs,
  selectedCommunityNpcIds,
  communityNpcName,
  communityNpcAvatar,
  communityNpcPersona,
  setCommunityNpcName,
  setCommunityNpcAvatar,
  setCommunityNpcPersona,
  setShowCommunityNpcComposer,
  setSelectedCommunityNpcIds,
  setCommunityNpcRevision,
  setShowCommunityNpcExport,
  setError,
  setNotice,
}: UseForumCommunityNpcActionsOptions) {
  const resetCommunityNpcComposer = () => {
    setCommunityNpcName("");
    setCommunityNpcAvatar("");
    setCommunityNpcPersona("");
    setShowCommunityNpcComposer(false);
  };

  const saveCommunityNpc = () => {
    const displayName = communityNpcName.trim();
    const personaSummary = communityNpcPersona.trim();
    if (!displayName || !personaSummary) {
      setError("请填写论坛 NPC 的名字和人设");
      return;
    }
    const npc = createForumCommunityNpc({
      id: createId("forum-community-npc"),
      ownerIdentityId: activeIdentityId,
      displayName,
      avatar: communityNpcAvatar.trim() || undefined,
      personaSummary,
      now: Date.now(),
    });
    upsertForumCommunityNpc(npc);
    setCommunityNpcRevision((value) => value + 1);
    resetCommunityNpcComposer();
  };

  const updateCommunityNpc = (npc: ForumCommunityNpc, patch: Partial<ForumCommunityNpc>) => {
    upsertForumCommunityNpc({ ...npc, ...patch, updatedAt: Date.now() });
    setCommunityNpcRevision((value) => value + 1);
  };

  const toggleCommunityNpcExport = (npcId: string) => {
    setSelectedCommunityNpcIds((current) => current.includes(npcId)
      ? current.filter((id) => id !== npcId)
      : [...current, npcId]);
  };

  const exportCommunityNpcs = () => {
    const cards = communityNpcs
      .filter((npc) => selectedCommunityNpcIds.includes(npc.id))
      .map(({ displayName, avatar, personaSummary, publicStyle, enabled }) => ({
        displayName,
        ...(avatar ? { avatar } : {}),
        personaSummary,
        publicStyle,
        enabled,
      }));
    if (cards.length === 0) {
      setError("请至少选择一个论坛 NPC 角色卡。");
      return;
    }
    const blob = new Blob([JSON.stringify({ format: "forum-community-npc/v1", cards }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `论坛NPC角色卡-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowCommunityNpcExport(false);
    setNotice(`已导出 ${cards.length} 个论坛 NPC 角色卡。`);
  };

  const importCommunityNpcs = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    let imported = 0;
    try {
      for (const file of Array.from(files)) {
        const raw = JSON.parse(await file.text()) as unknown;
        const candidates = Array.isArray(raw)
          ? raw
          : raw && typeof raw === "object" && Array.isArray((raw as { cards?: unknown }).cards)
            ? (raw as { cards: unknown[] }).cards
            : [raw];
        for (const candidate of candidates) {
          if (!candidate || typeof candidate !== "object") continue;
          const card = candidate as Record<string, unknown>;
          const displayName = typeof card.displayName === "string" ? card.displayName.trim().slice(0, 40) : "";
          const personaSummary = typeof card.personaSummary === "string" ? card.personaSummary.trim().slice(0, 300) : "";
          if (!displayName || !personaSummary) continue;
          const npc = createForumCommunityNpc({
            id: createId("forum-community-npc"),
            ownerIdentityId: activeIdentityId,
            displayName,
            ...(typeof card.avatar === "string" && card.avatar.trim() ? { avatar: card.avatar.trim() } : {}),
            personaSummary,
            publicStyle: typeof card.publicStyle === "string" ? card.publicStyle.trim().slice(0, 300) : personaSummary,
            now: Date.now(),
          });
          const saved = upsertForumCommunityNpc({
            ...npc,
            enabled: typeof card.enabled === "boolean" ? card.enabled : true,
          });
          if (saved.success) imported += 1;
        }
      }
      if (!imported) throw new Error("未找到可导入的论坛 NPC 角色卡。");
      setCommunityNpcRevision((value) => value + 1);
      setNotice(`已导入 ${imported} 个论坛 NPC 角色卡。`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "论坛 NPC 导入失败。");
    }
  };

  return { resetCommunityNpcComposer, saveCommunityNpc, updateCommunityNpc, toggleCommunityNpcExport, exportCommunityNpcs, importCommunityNpcs };
}
