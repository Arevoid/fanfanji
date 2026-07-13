import React, { useState } from "react";
import { MessageSquare, ThumbsUp, Plus, ChevronLeft, Search, Share2, Send } from "lucide-react";

interface ForumComment {
  id: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  timestamp: string;
  replyToCommentId?: string;
  replyToAuthorName?: string;
  replyToContent?: string;
}

interface ForumPost {
  id: string;
  authorName: string;
  authorAvatar: string;
  title: string;
  content: string;
  category: string;
  likes: number;
  commentsCount: number;
  comments: ForumComment[];
  timestamp: string;
  hasLiked?: boolean;
}

const PRESEED_POSTS: ForumPost[] = [
  {
    id: "fp-1",
    authorName: "萌新小橘",
    authorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
    title: "求大佬分享一下好看的聊天气泡 CSS 代码！",
    content: "刚刚在美化设置里看到了自定义聊天气泡 CSS，感觉这个功能太强了！但是自己是个代码小白，有没有大佬能分享一些好看的样式？比如带着微光渐变的或者圆润可爱的气泡代码，万分感谢！",
    category: "气泡美化",
    likes: 24,
    commentsCount: 3,
    timestamp: "2小时前",
    comments: [
      {
        id: "fc-1-1",
        authorName: "极客阿松",
        authorAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
        content: "可以试试这个：`.chat-bubble-self { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; color: white !important; border-radius: 18px 18px 2px 18px !important; }`，超级炫酷的紫蓝色渐变！",
        timestamp: "1.5小时前"
      },
      {
        id: "fc-1-2",
        authorName: "萌新小橘",
        authorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
        content: "哇！这也太好看了吧，完美的极光紫渐变！真的非常感谢阿松大佬！",
        timestamp: "1小时前"
      },
      {
        id: "fc-1-3",
        authorName: "代码发烧友",
        authorAvatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop",
        content: "大佬的代码真的牛，直接复制到设置页里的 bubbleCss 瞬间就生效了，爱了爱了！",
        timestamp: "30分钟前"
      }
    ]
  },
  {
    id: "fp-2",
    authorName: "极客阿松",
    authorAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
    title: "【原创预设】分享一个极致简约的“温润浅卡其”PWA 预设配置",
    content: "在设置里摸索了很久，配置了一套以温暖大地色为主的配色方案。把图标都换成了一些原木风格的微圆角卡片，背景图使用的是白沙丘的纯净自然图景。全局 CSS 加了微柔和的毛玻璃特效，效果简直绝美！大家可以直接在设置里新建预设填入代码试一下...",
    category: "样式预设",
    likes: 42,
    commentsCount: 2,
    timestamp: "5小时前",
    comments: [
      {
        id: "fc-2-1",
        authorName: "千秋雪",
        authorAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
        content: "这套大地色温润浅卡其方案真的太雅致了！视觉上看起来非常舒服、不伤眼睛，适合晚上静下心来跟角色对话。",
        timestamp: "4小时前"
      },
      {
        id: "fc-2-2",
        authorName: "萌新小橘",
        authorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
        content: "配合我刚在档案馆里捏出来的‘禅茶师人设’，聊天的氛围感直接拉满，简直神配！",
        timestamp: "3小时前"
      }
    ]
  },
  {
    id: "fp-3",
    authorName: "千秋雪",
    authorAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
    title: "档案馆里大家创建的第一个角色是谁呀？",
    content: "我创建了一个高冷学者型的角色（INTJ人格），背景设定在遥远的赛博科幻星系。跟她聊天的时候，Gemini 吐字的逻辑特别强，句尾还会有冷淡而礼貌的傲娇语气！感觉档案馆和聊天功能真的完美结合了，大家都造了什么性格的智能体呀？",
    category: "档案馆话题",
    likes: 31,
    commentsCount: 3,
    timestamp: "1天前",
    comments: [
      {
        id: "fc-3-1",
        authorName: "希尔薇本人",
        authorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop",
        content: "诶？是在说我吗？在废墟图书馆整理密卷时收到机主建立的终端连接，确实是一场有趣的意外呢。🍵🌻",
        timestamp: "20小时前"
      },
      {
        id: "fc-3-2",
        authorName: "雷恩少校本雷",
        authorAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop",
        content: "雷恩向楼主敬礼！作为大家的安全防卫顾问，无论您在什么背景下，我都会时刻保持最高警备，守护您的信息主权！🛡️🌌",
        timestamp: "18小时前"
      },
      {
        id: "fc-3-3",
        authorName: "中二病晚期",
        authorAvatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop",
        content: "哈哈哈哈，我创建了一个会喷火的红龙领主，说话总是‘哼，卑微的愚蠢人类’，配上 Gemini 的润色真的毫无违和感，快乐喷泉！",
        timestamp: "12小时前"
      }
    ]
  }
];

export default function AppForum({ onClose }: { onClose: () => void }) {
  const [posts, setPosts] = useState<ForumPost[]>(PRESEED_POSTS);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);

  // Form states
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("闲聊讨论");
  const [commentText, setCommentText] = useState("");
  const [replyingToComment, setReplyingToComment] = useState<ForumComment | null>(null);

  const handleLike = (id: string) => {
    setPosts(
      posts.map((post) => {
        if (post.id === id) {
          const hasLiked = !post.hasLiked;
          return {
            ...post,
            hasLiked,
            likes: hasLiked ? post.likes + 1 : post.likes - 1,
          };
        }
        return post;
      })
    );
  };

  const handleSubmitPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    const newPost: ForumPost = {
      id: Date.now().toString(),
      authorName: "我 (手机机主)",
      authorAvatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop",
      title: newTitle.trim(),
      content: newContent.trim(),
      category: newCategory,
      likes: 1,
      commentsCount: 0,
      timestamp: "刚刚",
      hasLiked: true,
      comments: []
    };

    setPosts([newPost, ...posts]);
    setNewTitle("");
    setNewContent("");
    setIsCreating(false);
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !activePostId) return;

    const newComment: ForumComment = {
      id: Date.now().toString(),
      authorName: "我 (手机机主)",
      authorAvatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop",
      content: commentText.trim(),
      timestamp: "刚刚",
      replyToCommentId: replyingToComment?.id,
      replyToAuthorName: replyingToComment?.authorName,
      replyToContent: replyingToComment?.content,
    };

    setPosts(
      posts.map((post) => {
        if (post.id === activePostId) {
          return {
            ...post,
            commentsCount: post.commentsCount + 1,
            comments: [...post.comments, newComment]
          };
        }
        return post;
      })
    );
    setCommentText("");
    setReplyingToComment(null);
  };

  const filteredPosts = posts.filter(
    (p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activePost = posts.find((p) => p.id === activePostId);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-transparent z-10 shrink-0 relative">
        <button
          onClick={() => {
            if (activePostId) {
              setActivePostId(null);
              setReplyingToComment(null);
            } else if (isCreating) {
              setIsCreating(false);
            } else {
              onClose();
            }
          }}
          className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
          title="返回"
        >
          <ChevronLeft className="w-4 h-4 text-slate-700" />
        </button>
        <h1 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">
          {activePostId ? "帖子详情" : isCreating ? "发布新话题" : "讨论社区"}
        </h1>
        <div className="w-8 h-8 flex items-center justify-end z-10">
          {!isCreating && !activePostId && (
            <button
              onClick={() => setIsCreating(true)}
              className="w-8 h-8 bg-neutral-950 hover:bg-neutral-900 text-white rounded-full transition-colors shadow flex items-center justify-center"
              title="发布新话题"
            >
              <Plus className="w-4.5 h-4.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20">
        <div className="max-w-md mx-auto">
          {isCreating ? (
            /* Creating Post Form */
            <form onSubmit={handleSubmitPost} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-sm font-bold text-slate-700 mb-2">发布新话题</h3>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">标题</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="请输入吸引人的标题..."
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">标签类别</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs"
                >
                  <option value="闲聊讨论">闲聊讨论</option>
                  <option value="气泡美化">气泡美化</option>
                  <option value="样式预设">样式预设</option>
                  <option value="档案馆话题">档案馆话题</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">讨论内容</label>
                <textarea
                  required
                  rows={6}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="在这里畅所欲言，分享您的创意人设、代码或者是手机使用心得吧..."
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs resize-none leading-relaxed"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-semibold rounded-xl bg-neutral-950 text-white hover:bg-neutral-900 shadow-sm"
                >
                  发布话题
                </button>
              </div>
            </form>
          ) : activePostId && activePost ? (
            /* Post Details (主楼 + 评论) */
            <div className="space-y-4">
              {/* Main Post (主楼) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <img
                      src={activePost.authorAvatar}
                      alt={activePost.authorName}
                      className="w-9 h-9 rounded-full object-cover bg-slate-50"
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-700">{activePost.authorName}</p>
                      <p className="text-[9px] text-slate-400 font-medium">{activePost.timestamp}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-neutral-100 text-neutral-800 text-[9px] font-bold rounded">
                    #{activePost.category}
                  </span>
                </div>

                <div className="space-y-2">
                  <h2 className="text-base font-bold text-slate-800 leading-snug">
                    {activePost.title}
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50/70 p-3 rounded-xl border border-slate-100/50">
                    {activePost.content}
                  </p>
                </div>

                <div className="flex items-center space-x-6 pt-3 border-t border-slate-50 text-slate-400 text-xs">
                  <button
                    onClick={() => handleLike(activePost.id)}
                    className={`flex items-center space-x-1.5 font-semibold transition-colors ${
                      activePost.hasLiked ? "text-rose-500 font-bold" : "hover:text-slate-600"
                    }`}
                  >
                    <ThumbsUp className={`w-4 h-4 ${activePost.hasLiked ? "fill-rose-500 text-rose-500" : ""}`} />
                    <span>{activePost.likes} 人点赞</span>
                  </button>

                  <div className="flex items-center space-x-1.5 font-medium">
                    <MessageSquare className="w-4 h-4 text-slate-400" />
                    <span>{activePost.commentsCount} 条回复</span>
                  </div>
                </div>
              </div>

              {/* Comments Section (回帖列表) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-500 border-b border-slate-50 pb-2 flex items-center justify-between">
                  <span>全部回复</span>
                  <span className="bg-slate-100 px-2 py-0.5 rounded-full text-[10px] text-slate-600">
                    {activePost.comments.length} 楼
                  </span>
                </h3>

                {activePost.comments.length === 0 ? (
                  <p className="text-center py-6 text-slate-400 text-xs">
                    暂无评论，快来抢占沙发！
                  </p>
                ) : (
                  <div className="divide-y divide-slate-50 space-y-3.5">
                    {activePost.comments.map((comment, index) => (
                      <div key={comment.id} className={`pt-3.5 ${index === 0 ? "pt-0" : ""} space-y-2`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <img
                              src={comment.authorAvatar}
                              alt={comment.authorName}
                              className="w-7 h-7 rounded-full object-cover bg-slate-100"
                            />
                            <div>
                              <p className="text-xs font-bold text-slate-700">{comment.authorName}</p>
                              <p className="text-[9px] text-slate-400 font-medium">{comment.timestamp}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <button
                              onClick={() => setReplyingToComment(comment)}
                              className="text-[10px] text-[#576b95] hover:underline font-bold"
                            >
                              回复
                            </button>
                            <span className="text-[10px] text-slate-300 font-semibold font-mono">
                              #{index + 2} 楼
                            </span>
                          </div>
                        </div>

                        {/* Quoted Reply Content if present */}
                        {comment.replyToAuthorName && (
                          <div className="ml-9 p-2 bg-slate-50/80 border-l-2 border-slate-300 rounded-r-lg text-[10px] text-slate-500 italic max-w-sm">
                            引用 <span className="font-bold text-slate-600">@{comment.replyToAuthorName}</span>: "{comment.replyToContent}"
                          </div>
                        )}

                        <p className="text-xs text-slate-600 leading-relaxed pl-9">
                          {comment.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick reply bar with ReplyingTo indicator */}
              <div className="bg-white border border-slate-150 rounded-xl shadow-sm overflow-hidden">
                {replyingToComment && (
                  <div className="bg-amber-50/60 px-3 py-1.5 border-b border-amber-100/50 flex items-center justify-between text-[10px] text-amber-800">
                    <span className="truncate">
                      正在回复 <span className="font-bold">@{replyingToComment.authorName}</span> :
                      <span className="text-amber-600/70 ml-1 italic truncate max-w-[200px] inline-block align-bottom">
                        "{replyingToComment.content}"
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyingToComment(null)}
                      className="text-amber-500 hover:text-amber-700 font-bold px-1"
                    >
                      取消
                    </button>
                  </div>
                )}
                <form onSubmit={handleAddComment} className="p-2 flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={
                      replyingToComment
                        ? `回复 @${replyingToComment.authorName}...`
                        : "写点什么，参与热烈讨论..."
                    }
                    className="flex-1 bg-slate-50 border border-slate-200 focus:outline-none rounded-[8px] px-3 py-1.5 text-xs text-slate-800"
                  />
                  <button
                    type="submit"
                    className="p-1.5 bg-neutral-950 hover:bg-neutral-900 text-white rounded-full transition-all flex items-center justify-center shrink-0 shadow-sm"
                    title="发表回复"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          ) : (
            /* Forums List View */
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索话题、标签..."
                  className="w-full pl-9 pr-4 py-2 bg-white rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs"
                />
              </div>

              {/* Forums List */}
              <div className="space-y-3">
                {filteredPosts.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-xs">
                    没有找到符合条件的话题
                  </div>
                ) : (
                  filteredPosts.map((post) => (
                    <div
                      key={post.id}
                      onClick={() => setActivePostId(post.id)}
                      className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow transition-shadow cursor-pointer group"
                    >
                      {/* Author Meta */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <img
                            src={post.authorAvatar}
                            alt={post.authorName}
                            className="w-8 h-8 rounded-full object-cover bg-slate-100"
                          />
                          <div>
                            <p className="text-xs font-bold text-slate-700">{post.authorName}</p>
                            <p className="text-[9px] text-slate-400 font-medium">{post.timestamp}</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-stone-100 text-stone-800 text-[9px] font-bold rounded">
                          #{post.category}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="mt-3">
                        <h4 className="text-xs md:text-sm font-bold text-slate-800 leading-snug group-hover:text-neutral-950 transition-colors">
                          {post.title}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap line-clamp-3">
                          {post.content}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center space-x-6 mt-4 pt-3 border-t border-slate-50 text-slate-400 text-xs">
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent entering detail view
                            handleLike(post.id);
                          }}
                          className={`flex items-center space-x-1.5 font-semibold transition-colors ${
                            post.hasLiked ? "text-rose-500 font-bold" : "hover:text-slate-600"
                          }`}
                        >
                          <ThumbsUp className={`w-4 h-4 ${post.hasLiked ? "fill-rose-500 text-rose-500" : ""}`} />
                          <span>{post.likes}</span>
                        </button>
                        
                        <div className="flex items-center space-x-1.5 font-semibold">
                          <MessageSquare className="w-4 h-4" />
                          <span>{post.commentsCount}</span>
                        </div>

                        <div
                          className="flex items-center space-x-1.5 hover:text-slate-600 font-semibold"
                          onClick={(e) => {
                            e.stopPropagation();
                            alert("帖子链接已复制，快去分享给好友吧！");
                          }}
                        >
                          <Share2 className="w-4 h-4" />
                          <span>分享</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
