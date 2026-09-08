import { useEffect, useRef, useState } from "react";
import type { StickerGroup } from "../../../types";
import { stickerDb } from "../../../utils/stickerDb";

export function useChatStickerState() {
  const [stickerGroups, setStickerGroups] = useState<StickerGroup[]>([]);
  const stickerSemanticAnalysisInFlightRef = useRef(new Set<string>());
  const triggerCreateStickerGroupRef = useRef<(() => void) | null>(null);
  const [activeStickerGroupIndex, setActiveStickerGroupIndex] = useState(0);
  const [showStickerSelector, setShowStickerSelector] = useState(false);

  useEffect(() => {
    const loadStickers = async () => {
      try {
        const groups = await stickerDb.getGroups();
        if (groups.length === 0) {
          const defaultGroup: StickerGroup = {
            id: "default-sticker-group",
            name: "默认分组",
            stickers: [],
          };
          await stickerDb.saveGroup(defaultGroup);
          setStickerGroups([defaultGroup]);
        } else {
          setStickerGroups(groups);
        }
      } catch (err) {
        console.error("Failed to load sticker groups:", err);
      }
    };
    loadStickers();
  }, []);

  return {
    stickerGroups,
    setStickerGroups,
    stickerSemanticAnalysisInFlightRef,
    triggerCreateStickerGroupRef,
    activeStickerGroupIndex,
    setActiveStickerGroupIndex,
    showStickerSelector,
    setShowStickerSelector,
  };
}
