import React, { useState, useRef, useEffect } from "react";
import { Sticker, StickerGroup, UserSettings } from "../types";
import { stickerDb, compressImage as compressStickerImage, aiNameSticker } from "../utils/stickerDb";
import { parseStickerImportLine } from "../utils/stickerImport";
import {
  Trash2,
  Link,
  FileImage,
  X,
  Loader2,
  Sparkles,
  Smile,
  Edit2,
  ChevronDown,
  ChevronRight
} from "lucide-react";

interface StickerSettingsProps {
  settings: UserSettings;
  stickerGroups: StickerGroup[];
  onUpdateStickerGroups: (groups: StickerGroup[]) => void;
  triggerCreateGroupRef?: React.MutableRefObject<(() => void) | null>;
}

export default function StickerSettings({
  settings,
  stickerGroups,
  onUpdateStickerGroups,
  triggerCreateGroupRef,
}: StickerSettingsProps) {
  const [activeGroupIdx, setActiveGroupIdx] = useState<number>(0);
  const [isEditingGroupName, setIsEditingGroupName] = useState<boolean>(false);
  const [editingGroupNameVal, setEditingGroupNameVal] = useState<string>("");
  const [showUrlImportModal, setShowUrlImportModal] = useState<boolean>(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState<boolean>(false);
  const [newGroupNameVal, setNewGroupNameVal] = useState<string>("");
  const [bulkUrls, setBulkUrls] = useState<string>("");
  const [isAiNamingActive, setIsAiNamingActive] = useState<boolean>(false);
  const [aiNamingProgress, setAiNamingProgress] = useState<string>( "");
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    showCancel?: boolean;
    confirmText?: string;
  } | null>(null);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (stickerGroups.length > 0) {
      initial[stickerGroups[0].id] = true;
    }
    return initial;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeGroup = stickerGroups[activeGroupIdx] || stickerGroups[0] || null;

  // Sync ref callback
  useEffect(() => {
    if (triggerCreateGroupRef) {
      triggerCreateGroupRef.current = handleCreateGroup;
    }
    return () => {
      if (triggerCreateGroupRef) {
        triggerCreateGroupRef.current = null;
      }
    };
  }, [stickerGroups, triggerCreateGroupRef]);

  // Create a new group
  const handleCreateGroup = () => {
    setNewGroupNameVal(`分组 ${stickerGroups.length + 1}`);
    setShowCreateGroupModal(true);
  };

  // Delete current group
  const handleDeleteGroup = async (idx: number) => {
    if (stickerGroups.length <= 1) {
      setModalConfig({
        title: "无法删除",
        message: "必须保留至少一个表情包分组！🐾",
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }
    const groupToDelete = stickerGroups[idx];
    setModalConfig({
      title: "删除分组",
      message: `确定要删除分组《${groupToDelete.name}》及其所有表情吗？该操作不可撤销！`,
      showCancel: true,
      onConfirm: async () => {
        try {
          // Delete images associated with this group
          await Promise.all(
            groupToDelete.stickers.map((s) => stickerDb.deleteStickerImage(s.id))
          );
          await stickerDb.deleteGroup(groupToDelete.id);
          const updated = stickerGroups.filter((_, i) => i !== idx);
          onUpdateStickerGroups(updated);
          setActiveGroupIdx(Math.max(0, idx - 1));
        } catch (err) {
          console.error("Failed to delete group:", err);
        }
      }
    });
  };

  // Start editing group name

  // Save group name
  const saveGroupName = async () => {
    if (!activeGroup || !editingGroupNameVal.trim()) return;
    const updatedGroup = { ...activeGroup, name: editingGroupNameVal.trim() };
    try {
      await stickerDb.saveGroup(updatedGroup);
      const updated = [...stickerGroups];
      updated[activeGroupIdx] = updatedGroup;
      onUpdateStickerGroups(updated);
      setIsEditingGroupName(false);
    } catch (err) {
      console.error("Failed to rename group:", err);
    }
  };

  // Local images upload handler (Supports single and multi upload)
  const handleLocalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeGroup) return;

    const fileList = Array.from(files) as File[];
    const newStickers: Sticker[] = [];

    for (const file of fileList) {
      const stickerId = `sticker-local-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      // Extract file name minus extension
      const originalName = file.name.replace(/\.[^/.]+$/, "");

      try {
        // Compress the image to maximum 240x240px preserving aspect ratio
        const compressedBlob = await compressStickerImage(file);
        await stickerDb.saveStickerImage(stickerId, compressedBlob);

        const objectUrl = URL.createObjectURL(compressedBlob);
        newStickers.push({
          id: stickerId,
          name: originalName,
          url: objectUrl,
        });
      } catch (err: any) {
        console.error("Failed to process local sticker file:", file.name, err);
      }
    }

    if (newStickers.length > 0) {
      const updatedGroup = {
        ...activeGroup,
        stickers: [...activeGroup.stickers, ...newStickers],
      };
      try {
        await stickerDb.saveGroup(updatedGroup);
        const updated = [...stickerGroups];
        updated[activeGroupIdx] = updatedGroup;
        onUpdateStickerGroups(updated);
      } catch (err) {
        console.error("Failed to save updated stickers to group:", err);
      }
    }
    // Reset file input
    e.target.value = "";
  };

  // Batch URLs import
  const handleBulkUrlsImport = async () => {
    if (!bulkUrls.trim() || !activeGroup) return;
    const importedLines = bulkUrls
      .split("\n")
      .map(parseStickerImportLine)
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (importedLines.length === 0) {
      setModalConfig({
        title: "无效链接",
        message: "请输入有效的 http 或 https 图片链接！",
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }

    const newStickers: Sticker[] = [];
    for (const importedLine of importedLines) {
      const { url } = importedLine;
      const stickerId = `sticker-url-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      // Extract file name from URL segments
      let extractedName = importedLine.name || "未命名表情";
      try {
        const pathname = new URL(url).pathname;
        const filename = pathname.substring(pathname.lastIndexOf("/") + 1);
        if (!importedLine.name && filename) {
          const cleanFilename = filename.replace(/\.[^/.]+$/, "");
          if (cleanFilename && cleanFilename.length > 1) {
            extractedName = decodeURIComponent(cleanFilename);
          }
        }
      } catch (e) {
        // ignore parsing error
      }

      // Add sticker with raw URL directly (Offline/CORS safe fallback)
      newStickers.push({
        id: stickerId,
        name: extractedName,
        url: url,
      });

      // Attempt to fetch, compress and save to IndexedDB as background enhancement!
      // If fails due to CORS, it simply stays as raw URL sticker. This is extremely robust!
      fetch(url)
        .then((res) => {
          if (res.ok) return res.blob();
          throw new Error("HTTP Fetch failed");
        })
        .then(async (blob) => {
          const compressed = await compressStickerImage(blob);
          await stickerDb.saveStickerImage(stickerId, compressed);
        })
        .catch((err: any) => {
          console.log(`Note: Remote sticker URL not cached in IndexedDB due to CORS/network: ${url}`);
        });
    }

    const updatedGroup = {
      ...activeGroup,
      stickers: [...activeGroup.stickers, ...newStickers],
    };

    try {
      await stickerDb.saveGroup(updatedGroup);
      const updated = [...stickerGroups];
      updated[activeGroupIdx] = updatedGroup;
      onUpdateStickerGroups(updated);
      setBulkUrls("");
      setShowUrlImportModal(false);
    } catch (err) {
      console.error("Failed to import bulk URLs:", err);
    }
  };

  // Delete a sticker
  const handleDeleteSticker = (stickerId: string) => {
    if (!activeGroup) return;
    const sticker = activeGroup.stickers.find((s) => s.id === stickerId);
    setModalConfig({
      title: "删除表情",
      message: `确认要删除表情“${sticker?.name || "当前表情"}”吗？`,
      showCancel: true,
      onConfirm: async () => {
        try {
          await stickerDb.deleteStickerImage(stickerId);
          const updatedGroup = {
            ...activeGroup,
            stickers: activeGroup.stickers.filter((s) => s.id !== stickerId),
          };
          await stickerDb.saveGroup(updatedGroup);
          const updated = [...stickerGroups];
          updated[activeGroupIdx] = updatedGroup;
          onUpdateStickerGroups(updated);
        } catch (err) {
          console.error("Failed to delete sticker:", err);
        }
      }
    });
  };

  // Update sticker name manually
  const handleUpdateStickerName = async (stickerId: string, newName: string) => {
    if (!activeGroup) return;
    const updatedStickers = activeGroup.stickers.map((s) =>
      s.id === stickerId ? { ...s, name: newName } : s
    );
    const updatedGroup = { ...activeGroup, stickers: updatedStickers };
    try {
      await stickerDb.saveGroup(updatedGroup);
      const updated = [...stickerGroups];
      updated[activeGroupIdx] = updatedGroup;
      onUpdateStickerGroups(updated);
    } catch (err) {
      console.error("Failed to update sticker name:", err);
    }
  };

  // AI auto naming according to sticker image contents
  const handleAiAutoNaming = async () => {
    if (!activeGroup || activeGroup.stickers.length === 0) return;
    if (!settings.apiKey) {
      setModalConfig({
        title: "需要 API Key",
        message: "请先在系统设置中配置有效的 API Key 才能使用 AI 命名功能！",
        showCancel: false,
        onConfirm: () => {}
      });
      return;
    }

    setModalConfig({
      title: "AI 批量命名",
      message: "AI 将智能分析当前分组内所有表情包图片，自动生成符合情绪和画面内容的中文名字。是否开始？",
      showCancel: true,
      onConfirm: async () => {
        setIsAiNamingActive(true);
        const updatedStickers = [...activeGroup.stickers];

        for (let i = 0; i < updatedStickers.length; i++) {
          const sticker = updatedStickers[i];
          setAiNamingProgress(`正在智能分析第 ${i + 1}/${updatedStickers.length} 张表情包: "${sticker.name}"...`);

          try {
            let imageBlob: Blob | null = null;
            // 1. Try to load from local IndexedDB first
            imageBlob = await stickerDb.getStickerImage(sticker.id);

            // 2. If it is a remote URL and not cached locally, try to fetch it
            if (!imageBlob && sticker.url && !sticker.url.startsWith("blob:") && !sticker.url.startsWith("data:")) {
              try {
                const res = await fetch(sticker.url);
                if (res.ok) {
                  imageBlob = await res.blob();
                }
              } catch (e) {
                console.warn("CORS/Fetch error loading remote image for AI naming:", e);
              }
            }

            if (imageBlob) {
              const aiName = await aiNameSticker(
                imageBlob,
                settings.apiKey,
                settings.selectedModel,
                settings.apiEndpoint
              );
              if (aiName && aiName.trim()) {
                updatedStickers[i] = { ...sticker, name: aiName.trim() };
              }
            } else {
              console.log(`Skipping AI naming for "${sticker.name}" - image data is inaccessible due to CORS constraints.`);
            }
          } catch (err) {
            console.error("AI naming failed for sticker:", sticker.name, err);
          }
        }

        const updatedGroup = { ...activeGroup, stickers: updatedStickers };
        try {
          await stickerDb.saveGroup(updatedGroup);
          const updated = [...stickerGroups];
          updated[activeGroupIdx] = updatedGroup;
          onUpdateStickerGroups(updated);
          setAiNamingProgress("");
          setIsAiNamingActive(false);
          setModalConfig({
            title: "命名完成",
            message: "AI 批量命名表情包完成！已根据画面内容更新名字。🎉",
            showCancel: false,
            onConfirm: () => {}
          });
        } catch (err) {
          console.error("Failed to save AI naming results:", err);
          setIsAiNamingActive(false);
        }
      }
    });
  };

  const triggerLocalUploadForGroup = (idx: number) => {
    setActiveGroupIdx(idx);
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 50);
  };

  const triggerLinkImportForGroup = (idx: number) => {
    setActiveGroupIdx(idx);
    setBulkUrls("");
    setShowUrlImportModal(true);
  };

  return (
    <div data-theme-page="stickers" className="space-y-4 text-[var(--text-primary)]">
      {/* Hidden inputs & status info */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleLocalUpload}
        multiple
        accept="image/*"
        className="hidden"
      />

      {/* Progress banner for AI naming */}
      {isAiNamingActive && aiNamingProgress && (
        <div className="bg-purple-50 border border-purple-100 text-purple-700 rounded-xl p-3 text-[11px] font-medium flex items-center gap-2 animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-purple-500" />
          <span>{aiNamingProgress}</span>
        </div>
      )}

      {/* Vertical Collapsible Groups (World Book Collapsible style) */}
      <div className="space-y-3">
        {stickerGroups.map((group, idx) => {
          const isExpanded = !!expandedGroups[group.id];
          return (
            <div
              key={group.id}
              className={`border border-slate-100 rounded-[20px] overflow-hidden bg-white shadow-sm transition-all ${
                isExpanded ? "ring-1 ring-slate-900/5 shadow-md" : "hover:shadow"
              }`}
            >
              {/* Collapsible Group Header Row */}
              <div
                onClick={() => {
                  setExpandedGroups((prev) => ({
                    ...prev,
                    [group.id]: !prev[group.id],
                  }));
                  setActiveGroupIdx(idx);
                }}
                className="flex items-center justify-between p-3.5 bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer select-none group"
              >
                {/* Left side: Chevron + Name + Count + Edit/Delete */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-stone-500 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-stone-500 shrink-0" />
                  )}

                  {isEditingGroupName && activeGroupIdx === idx ? (
                    <div
                      className="flex items-center gap-1.5 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingGroupNameVal}
                        onChange={(e) => setEditingGroupNameVal(e.target.value)}
                        className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-28"
                        maxLength={12}
                        autoFocus
                      />
                      <button
                        onClick={saveGroupName}
                        className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-[10px] font-bold"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setIsEditingGroupName(false)}
                        className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded text-[10px] font-bold"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-stone-700 truncate">{group.name}</span>
                      <span className="text-[10px] text-[var(--badge-text)] bg-[var(--badge-bg)] px-2 py-0.5 rounded-full font-extrabold shrink-0">
                        {group.stickers.length}
                      </span>

                      {/* Group Rename & Delete hover controls */}
                      <div
                        className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveGroupIdx(idx);
                            setEditingGroupNameVal(group.name);
                            setIsEditingGroupName(true);
                          }}
                          className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
                          title="重命名分组"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        {stickerGroups.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGroup(idx);
                            }}
                            className="p-1 hover:bg-rose-50 rounded text-rose-400 hover:text-rose-600 transition-colors"
                            title="删除分组"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right side: Import buttons (only icon, no text) */}
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => triggerLocalUploadForGroup(idx)}
                    className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center border border-slate-200/40 bg-white"
                    title="本地图片导入"
                  >
                    <FileImage className="w-4 h-4 text-sky-500" />
                  </button>

                  <button
                    onClick={() => triggerLinkImportForGroup(idx)}
                    className="w-7 h-7 rounded-lg hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center border border-slate-200/40 bg-white"
                    title="图片链接导入"
                  >
                    <Link className="w-4 h-4 text-indigo-500" />
                  </button>
                </div>
              </div>

              {/* Collapsible Content / Stickers Grid */}
              {isExpanded && (
                <div className="p-3.5 border-t border-slate-100/60 bg-slate-50/25 animate-fade-in text-left">
                  {group.stickers.length > 0 ? (
                    <div className="space-y-3">
                      {/* Tips & AI Auto naming button */}
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-bold">长按/右键可删除，修改底部输入框重命名</span>
                        <button
                          onClick={() => {
                            setActiveGroupIdx(idx);
                            handleAiAutoNaming();
                          }}
                          disabled={isAiNamingActive}
                          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-extrabold bg-[var(--button-secondary-bg)] hover:bg-[var(--surface-raised)] text-[var(--button-secondary-text)] border border-[var(--button-secondary-border)] rounded-lg shadow-sm hover:shadow transition-all disabled:bg-[var(--button-disabled-bg)] disabled:text-[var(--button-disabled-text)] disabled:border-[var(--button-disabled-border)] disabled:opacity-100"
                          title="智能分析图片内容，批量起传神名字"
                        >
                          {isAiNamingActive && activeGroupIdx === idx ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin text-current" />
                          ) : (
                            <Sparkles className="w-2.5 h-2.5 text-current" />
                          )}
                          <span>AI 批量命名</span>
                        </button>
                      </div>

                      {/* Grid structure */}
                      <div className="grid grid-cols-4 gap-3 bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm">
                        {group.stickers.map((sticker) => (
                          <div
                            key={sticker.id}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              handleDeleteSticker(sticker.id);
                            }}
                            className="flex flex-col items-center bg-slate-50/50 hover:bg-white border border-slate-100 hover:border-slate-200 rounded-xl p-1.5 hover:shadow-sm transition-all relative group select-none"
                            title="修改底部输入框可自定义命名，双击或长按可删除"
                          >
                            {/* Sticker image thumbnail */}
                            <div className="w-full aspect-square bg-white rounded-lg overflow-hidden flex items-center justify-center relative">
                              <img
                                src={sticker.url}
                                alt={sticker.name}
                                className="w-full h-full object-contain hover:scale-105 transition-all"
                                referrerPolicy="no-referrer"
                              />
                            </div>

                            {/* Delete hovering icon button - placed on the relative parent card to avoid clipping and support mobile touch */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                handleDeleteSticker(sticker.id);
                              }}
                              className="absolute -top-1 -right-1 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white rounded-full w-5 h-5 shadow-md flex items-center justify-center transition-all z-20 md:opacity-0 md:group-hover:opacity-100 opacity-100 cursor-pointer"
                              title="删除表情"
                            >
                              <X className="w-3 h-3 text-white" />
                            </button>

                            {/* Direct name edit text field */}
                            <input
                              type="text"
                              value={sticker.name}
                              onChange={(e) =>
                                handleUpdateStickerName(sticker.id, e.target.value)
                              }
                              className="w-full text-[9px] font-extrabold text-slate-700 text-center mt-1.5 border border-transparent hover:border-slate-200 focus:border-slate-300 rounded focus:outline-none bg-transparent hover:bg-slate-50 focus:bg-white truncate px-0.5"
                              placeholder="命名"
                              maxLength={12}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center bg-white rounded-2xl border border-dashed border-slate-200/80">
                      <p className="text-xs text-slate-400">当前分组内暂无表情，请在右侧导入本地图片或输入链接 🐾</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* URL Import Modal */}
      {showUrlImportModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in text-slate-800">
          <div className="bg-white rounded-[24px] w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 animate-scale-up p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800">批量导入表情包链接</h3>
              <button
                onClick={() => setShowUrlImportModal(false)}
                className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] text-slate-400 font-extrabold uppercase">
                每行输入“表情包名称 + 图片 URL”
              </label>
              <textarea
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                rows={6}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all resize-none"
                placeholder="开心 | https://example.com/happy.png&#10;委屈：https://example.com/sad.jpg&#10;震惊https://example.com/shocked.webp"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowUrlImportModal(false)}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleBulkUrlsImport}
                className="px-4 py-1.5 text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl shadow-sm hover:shadow transition-all"
              >
                导入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in text-slate-800">
          <div className="bg-white rounded-[24px] w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 animate-scale-up p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800">新建表情包分组</h3>
              <button
                onClick={() => setShowCreateGroupModal(false)}
                className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] text-slate-400 font-extrabold uppercase">
                请输入分组名称
              </label>
              <input
                type="text"
                value={newGroupNameVal}
                onChange={(e) => setNewGroupNameVal(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all font-semibold"
                placeholder="例如：柴犬、搞笑"
                maxLength={12}
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCreateGroupModal(false)}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!newGroupNameVal.trim()) return;
                  const newGroup: StickerGroup = {
                    id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    name: newGroupNameVal.trim(),
                    stickers: [],
                  };
                  try {
                    await stickerDb.saveGroup(newGroup);
                    const updated = [...stickerGroups, newGroup];
                    onUpdateStickerGroups(updated);
                    setActiveGroupIdx(updated.length - 1);
                    setExpandedGroups((prev) => ({ ...prev, [newGroup.id]: true }));
                    setShowCreateGroupModal(false);
                  } catch (err) {
                    console.error("Failed to create sticker group:", err);
                  }
                }}
                className="px-4 py-1.5 text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl shadow-sm hover:shadow transition-all"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Iframe-Safe Custom Confirm & Alert Modal */}
      {modalConfig && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in text-slate-800">
          <div className="bg-white rounded-[24px] w-full max-w-xs overflow-hidden shadow-2xl border border-slate-100 animate-scale-up p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 shrink-0 mt-0.5">
                <Smile className="w-5 h-5" />
              </div>
              <div className="text-left flex-1">
                <h3 className="text-xs font-bold text-slate-800">{modalConfig.title}</h3>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{modalConfig.message}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              {modalConfig.showCancel && (
                <button
                  type="button"
                  onClick={() => setModalConfig(null)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                >
                  取消
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  const cb = modalConfig.onConfirm;
                  setModalConfig(null);
                  await cb();
                }}
                className="px-4 py-1.5 text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl shadow-sm hover:shadow transition-all"
              >
                {modalConfig.confirmText || "确定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
