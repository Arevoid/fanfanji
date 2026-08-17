import React, { useState } from "react";
import { Camera, ChevronLeft, FileText, Heart, Image as ImageIcon, Languages, MessageCircle, Plus, X } from "lucide-react";
import type { Character, Moment, MomentComment, UserSettings } from "../../types";
import { cleanAndExtractMoment, getMomentComments, renderMomentContent, sanitizeMomentPublishText } from "./services/momentContent";

export interface MomentsAppProps {
  moments: Moment[];
  characters: Character[];
  settings: UserSettings;
  translations: Record<string, string>;
  filterCharacterId: string | null;
  onClearFilter: () => void;
  onClose: () => void;
  onAddMoment: (moment: Moment) => void;
  onAddComment: (momentId: string, comment: MomentComment) => void;
  onDeleteComment: (momentId: string, commentId: string) => void;
  onDeleteMoment?: (momentId: string) => void;
  onLikeMoment: (momentId: string, userName: string) => void;
  onSaveSettings: (settings: UserSettings) => void;
  onPublishUserMoment: (input: { content: string; image: string | null; imageDescription: string }) => void;
  onPublishComment: (momentId: string, content: string, replyingTo?: MomentComment) => void;
  onUploadImage: (file: File, kind: "moment" | "cover") => Promise<string | undefined>;
  onAutoReply?: (momentId: string, content: string, replyingTo?: MomentComment) => void;
  onMomentTextContextMenu: (event: React.MouseEvent, momentId: string, text: string, authorName: string, authorAvatar: string, isOwn: boolean, timestamp: number) => void;
  onMomentTextPointerDown: (event: React.PointerEvent, momentId: string, text: string, authorName: string, authorAvatar: string, isOwn: boolean, timestamp: number) => void;
  onMomentTextPointerUpOrLeave: () => void;
  onMomentTextPointerMove: () => void;
  onCommentClick: (momentId: string, comment: MomentComment) => void;
  onCommentPointerDown: (event: React.PointerEvent, momentId: string, comment: MomentComment) => void;
  onClearCommentLongPress: () => void;
  showToast: (message: string) => void;
}

export const MomentsApp: React.FC<MomentsAppProps> = ({ moments, characters, settings, translations, filterCharacterId, onClearFilter, onClose, onAddMoment: _onAddMoment, onAddComment: _onAddComment, onDeleteComment, onDeleteMoment, onLikeMoment, onSaveSettings, onPublishUserMoment, onPublishComment, onUploadImage, showToast, onMomentTextContextMenu, onMomentTextPointerDown, onMomentTextPointerUpOrLeave, onMomentTextPointerMove, onCommentClick, onCommentPointerDown, onClearCommentLongPress }) => {
  const [showPublisher, setShowPublisher] = useState(false);
  const [content, setContent] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageDescription, setImageDescription] = useState("");
  const [showTextImage, setShowTextImage] = useState(false);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [showCommentInput, setShowCommentInput] = useState<Record<string, boolean>>({});
  const [replyingTo, setReplyingTo] = useState<Record<string, MomentComment>>({});
  const [viewingDescription, setViewingDescription] = useState<string | null>(null);

  const filterCharacter = filterCharacterId ? characters.find((character) => character.id === filterCharacterId) : null;
  const tabName = filterCharacter ? filterCharacter.remark || filterCharacter.name : settings.name;
  const tabAvatar = filterCharacter ? filterCharacter.avatar : settings.avatar;
  const tabCover = filterCharacter ? filterCharacter.momentsCover || "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&h=500&fit=crop" : settings.momentsCover || "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&h=500&fit=crop";
  const visibleMoments = filterCharacterId ? moments.filter((moment) => moment.characterId === filterCharacterId) : moments;

  const publish = (event: React.FormEvent) => {
    event.preventDefault();
    const publishedContent = sanitizeMomentPublishText(content);
    if (!publishedContent && !image && !imageDescription.trim()) return;
    onPublishUserMoment({ content: publishedContent, image, imageDescription });
    setContent("");
    setImage(null);
    setImageDescription("");
    setShowTextImage(false);
    setShowPublisher(false);
  };
  const upload = async (file: File, kind: "moment" | "cover") => {
    const uploaded = await onUploadImage(file, kind);
    if (kind === "moment" && uploaded) setImage(uploaded);
  };
  const submitComment = (momentId: string) => {
    const value = sanitizeMomentPublishText(commentInputs[momentId] || "");
    if (!value) return;
    const target = replyingTo[momentId];
    onPublishComment(momentId, value, target);
    setCommentInputs((current) => ({ ...current, [momentId]: "" }));
    setShowCommentInput((current) => ({ ...current, [momentId]: false }));
    setReplyingTo((current) => {
      const next = { ...current };
      delete next[momentId];
      return next;
    });
  };

  return (
    <div data-theme-page="moments" className="bg-[var(--app-bg)] text-[var(--text-primary)] min-h-full pb-20 overflow-y-auto">
      <div className="h-64 bg-slate-200 relative shrink-0">
        <img src={tabCover} alt="Moments Cover" className="w-full h-full object-cover" />
        <button onClick={onClose} className="absolute top-4 left-4 p-1.5 rounded-full bg-black/40 hover:bg-black/65 text-white z-20 transition-colors shadow-sm" title="返回主页">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="absolute top-4 right-4 flex gap-2.5 z-20">
          <label className="p-1.5 rounded-full bg-black/40 hover:bg-black/65 text-white cursor-pointer transition-colors shadow-sm" title="更换封面图">
            <Camera className="w-5 h-5" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file, "cover");
              }}
            />
          </label>
          <button onClick={() => setShowPublisher(true)} className="p-1.5 rounded-full bg-black/40 hover:bg-black/65 text-white transition-colors shadow-sm" title="发布新动态">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="absolute right-4 -bottom-6 flex items-end gap-3 z-30">
          <span className="text-sm font-bold text-white tracking-tight pb-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] select-none">{tabName}</span>
          <img src={tabAvatar} alt="" className="w-16 h-16 rounded-[12px] border-2 border-white object-cover bg-white shadow-md z-40" />
        </div>
      </div>
      <div className="h-10" />
      {filterCharacterId && (
        <div className="mx-4 my-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center text-xs">
          <span className="font-medium text-slate-500">正在查看好友的朋友圈</span>
          <button onClick={onClearFilter} className="text-blue-500 hover:text-blue-600 font-bold">
            查看全部
          </button>
        </div>
      )}
      {showPublisher && (
        <form onSubmit={publish} className="bg-white p-4 border border-slate-100 space-y-3 mx-4 my-3 rounded-2xl shadow-sm">
          <div className="flex justify-between items-center pb-1">
            <span className="text-xs font-bold text-slate-400">分享新鲜事...</span>
            <button type="button" onClick={() => setShowPublisher(false)} className="text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea rows={3} value={content} onChange={(event) => setContent(event.target.value)} placeholder="说点什么吧，可以配一个好看的插图..." className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-100 focus:outline-none text-xs resize-none leading-relaxed text-left" />
          <div className="flex justify-between items-center">
            <label className="cursor-pointer text-slate-400 hover:text-blue-500 flex items-center gap-1.5 text-xs font-semibold">
              <ImageIcon className="w-4 h-4" />
              <span>添加配图</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file, "moment");
                }}
              />
            </label>
            <button type="button" onClick={() => setShowTextImage((value) => !value)} className="text-slate-400 hover:text-blue-500 flex items-center gap-1.5 text-xs font-semibold">
              <FileText className="w-4 h-4" />
              <span>文字图</span>
            </button>
            <button type="submit" className="px-4 py-1.5 bg-neutral-950 hover:bg-neutral-900 text-white text-xs font-bold rounded-xl shadow-sm transition-all">
              发布动态
            </button>
          </div>
          {showTextImage && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-[11px] text-slate-500">填写图片描述。发布后会以文字图展示，点击可查看完整描述。</p>
              <textarea rows={2} value={imageDescription} onChange={(event) => setImageDescription(event.target.value)} placeholder="例如：傍晚的操场，跑道边放着一瓶喝了一半的水" className="w-full px-2.5 py-2 rounded-lg bg-white border border-slate-200 focus:outline-none text-xs resize-none" />
            </div>
          )}
          {image && (
            <div className="relative w-24 h-24 rounded-lg overflow-hidden border">
              <img src={image} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => setImage(null)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </form>
      )}
      <div className="px-4 divide-y divide-slate-100 max-w-md mx-auto">
        {visibleMoments.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-xs">暂无动态，点击右上角相机发布第一条朋友圈吧！</div>
        ) : (
          visibleMoments.map((moment) => {
            const character = moment.characterId ? characters.find((item) => item.id === moment.characterId) : undefined;
            const authorName = character ? character.remark || character.name : moment.authorName;
            const authorAvatar = character ? character.avatar : moment.authorAvatar;
            const textImageDescription = moment.imageDescription || cleanAndExtractMoment(moment.content).imageDescription;
            const comments = getMomentComments(moment);
            const liked = moment.likes.includes(settings.name);
            return (
              <div key={moment.id} className="py-5 flex gap-3">
                <img src={authorAvatar} alt="" className="w-10 h-10 rounded-[6px] object-cover bg-slate-50 shrink-0 border border-slate-100" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-[#576b95] hover:underline cursor-pointer">{authorName}</h4>
                  <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap mt-1 select-none cursor-pointer hover:bg-slate-50/50 rounded p-1 transition-colors relative" title="长按/右键 弹出菜单" onContextMenu={(event) => onMomentTextContextMenu(event, moment.id, renderMomentContent(moment.content), authorName, authorAvatar, moment.characterId === undefined || moment.characterId === null, moment.timestamp)} onPointerDown={(event) => onMomentTextPointerDown(event, moment.id, renderMomentContent(moment.content), authorName, authorAvatar, moment.characterId === undefined || moment.characterId === null, moment.timestamp)} onPointerUp={onMomentTextPointerUpOrLeave} onPointerLeave={onMomentTextPointerUpOrLeave} onPointerMove={onMomentTextPointerMove}>
                    {renderMomentContent(moment.content)}
                  </p>
                  {translations[moment.id] && (
                    <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 leading-relaxed bg-slate-50/60 p-2.5 rounded-lg animate-fade-in">
                      <div className="flex items-center gap-1 text-[9px] text-slate-400 mb-1 font-bold">
                        <Languages className="w-3 h-3" />
                        <span>翻译 (由 AI 翻译)</span>
                      </div>
                      <p className="whitespace-pre-wrap">{translations[moment.id]}</p>
                    </div>
                  )}
          {textImageDescription && !moment.image && (
                    <button type="button" onClick={() => setViewingDescription(textImageDescription)} className="moment-media-placeholder mt-2.5 max-w-[200px] min-h-28 rounded-lg border border-[var(--border)] bg-[var(--media-placeholder-bg)] px-4 py-3 text-left shadow-sm">
                      <ImageIcon className="w-4 h-4 text-[var(--media-placeholder-text)] mb-4" />
                      <p className="text-xs leading-relaxed text-[var(--text-primary)] line-clamp-3">{textImageDescription}</p>
                      <span className="block mt-2 text-[10px] text-[var(--media-placeholder-text)]">文字图 · 点击查看</span>
                    </button>
                  )}
                  {moment.image && (
                    <div className="mt-2.5 inline-flex max-w-full rounded-lg overflow-hidden border border-slate-100 bg-slate-50 align-top">
                      <img src={moment.image} alt={moment.imageDescription || "朋友圈配图"} width={moment.imageWidth} height={moment.imageHeight} className="block h-auto w-auto max-w-[200px] max-h-52 object-contain rounded-lg" />
                    </div>
                  )}
                  <div className="flex justify-between items-center mt-3">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {new Date(moment.timestamp).toLocaleDateString([], {
                        month: "2-digit",
                        day: "2-digit",
                      })}{" "}
                      {new Date(moment.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </span>
                    <div className="flex items-center gap-4">
                      <button onClick={() => onLikeMoment(moment.id, settings.name)} className={`flex items-center gap-1.5 text-[10px] font-semibold transition-colors ${liked ? "text-rose-500" : "text-slate-400 hover:text-slate-600"}`}>
                        <Heart className={`w-3.5 h-3.5 ${liked ? "fill-rose-500 text-rose-500" : ""}`} />
                        <span>{moment.likes.length || "赞"}</span>
                      </button>
                      <button
                        onClick={() =>
                          setShowCommentInput((current) => ({
                            ...current,
                            [moment.id]: !current[moment.id],
                          }))
                        }
                        className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-600 font-semibold transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{comments.length || "评论"}</span>
                      </button>
                    </div>
                  </div>
                  {(moment.likes.length > 0 || comments.length > 0) && (
                    <div className="moments-reaction-shelf bg-[#f7f7f7] rounded-[4px] p-2 text-[11px] mt-2 space-y-2">
                      {moment.likes.length > 0 && (
                        <div className="moments-reaction-divider flex items-center gap-1.5 text-[#576b95] font-bold flex-wrap pb-1">
                          <Heart className="w-3 h-3 text-rose-500 fill-current shrink-0" />
                          <span className="leading-tight">{moment.likes.join(", ")}</span>
                        </div>
                      )}
                      {comments.length > 0 && (
                        <div className="moments-comment-list py-0.5">
                          {comments.map((comment) => (
                            <div
                              key={comment.id}
                              onClick={() => {
                                onCommentClick(moment.id, comment);
                                setReplyingTo((current) => ({
                                  ...current,
                                  [moment.id]: comment,
                                }));
                                setShowCommentInput((current) => ({
                                  ...current,
                                  [moment.id]: true,
                                }));
                              }}
                              onPointerDown={(event) => onCommentPointerDown(event, moment.id, comment)}
                              onPointerUp={onClearCommentLongPress}
                              onPointerLeave={onClearCommentLongPress}
                              onPointerCancel={onClearCommentLongPress}
                              onContextMenu={(event) => event.preventDefault()}
                              className="py-1.5 leading-relaxed text-slate-800 cursor-pointer transition-colors text-[11px] block text-left moments-comment-item"
                              title="点击回复；长按删除评论"
                            >
                              <span className="font-bold text-[#576b95] mr-1">{comment.authorName}</span>
                              <span className="text-slate-700">{comment.content}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {showCommentInput[moment.id] && (
                    <div className="flex gap-2 items-center bg-[#f7f7f7] border border-slate-200/30 rounded-lg px-2.5 py-1 mt-2">
                      <input
                        type="text"
                        value={commentInputs[moment.id] || ""}
                        onChange={(event) =>
                          setCommentInputs((current) => ({
                            ...current,
                            [moment.id]: event.target.value,
                          }))
                        }
                        placeholder={replyingTo[moment.id] ? `回复${replyingTo[moment.id].authorName}：` : "发表评论..."}
                        className="flex-1 bg-transparent border-none focus:outline-none text-[10px] text-slate-700 py-0.5"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") submitComment(moment.id);
                        }}
                      />
                      <button onClick={() => submitComment(moment.id)} className="text-[10px] text-blue-500 hover:text-blue-600 font-bold px-1">
                        发送
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {viewingDescription && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-5">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5">
            <div className="flex justify-end">
              <button onClick={() => setViewingDescription(null)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{viewingDescription}</p>
          </div>
        </div>
      )}
    </div>
  );
};
