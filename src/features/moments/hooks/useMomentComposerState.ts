import { useState } from "react";
import type { MomentComment } from "../../../types";

export function useMomentComposerState() {
  const [momentInputText, setMomentInputText] = useState("");
  const [momentAttachedImage, setMomentAttachedImage] = useState<string | null>(null);
  const [momentTextImageDescription, setMomentTextImageDescription] = useState("");
  const [showTextImageInput, setShowTextImageInput] = useState(false);
  const [viewingImageDescription, setViewingImageDescription] = useState<string | null>(null);
  const [showMomentPublisher, setShowMomentPublisher] = useState(false);
  const [inlineCommentsTexts, setInlineCommentsTexts] = useState<Record<string, string>>({});
  const [showCommentInputMap, setShowCommentInputMap] = useState<Record<string, boolean>>({});
  const [replyingToCommentMap, setReplyingToCommentMap] = useState<Record<string, MomentComment>>({});
  return {
    momentInputText, setMomentInputText, momentAttachedImage, setMomentAttachedImage,
    momentTextImageDescription, setMomentTextImageDescription, showTextImageInput, setShowTextImageInput,
    viewingImageDescription, setViewingImageDescription, showMomentPublisher, setShowMomentPublisher,
    inlineCommentsTexts, setInlineCommentsTexts, showCommentInputMap, setShowCommentInputMap,
    replyingToCommentMap, setReplyingToCommentMap,
  };
}
