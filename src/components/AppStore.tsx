import React, { useState } from "react";
import { Download, Star, ChevronLeft, Search, TrendingUp, ShieldAlert, BadgeInfo, Trash2 } from "lucide-react";

interface AppItem {
  id: string;
  name: string;
  category: string;
  icon: string;
  iconBg: string;
  rating: number;
  reviews: string;
  size: string;
  description: string;
}

const APPS_LIST: AppItem[] = [
  {
    id: "chat",
    name: "聊天",
    category: "社交与即时通讯",
    icon: "💬",
    iconBg: "bg-blue-500",
    rating: 4.9,
    reviews: "3.5万",
    size: "12.8 MB",
    description: "模拟最真实的QQ与微信聊天体验，内置实时回复机制，支持用户管理联系人、置顶聊天、甚至自定义专属的背景图和备注名。"
  },
  {
    id: "archives",
    name: "档案馆",
    category: "角色创作与档案",
    icon: "👥",
    iconBg: "bg-emerald-500",
    rating: 4.8,
    reviews: "1.9万",
    size: "8.4 MB",
    description: "您的大脑创意寄存处。支持自由上传头像、量身订造姓名、性别、年龄、MBTI 甚至一整套说话语气，还可以将他们快捷添加进通讯录。"
  },
  {
    id: "worldbook",
    name: "世界书",
    category: "世界观与维基",
    icon: "📖",
    iconBg: "bg-amber-500",
    rating: 4.7,
    reviews: "9200",
    size: "6.1 MB",
    description: "打造沉浸式科幻、历史或奇幻故事线。在这里为每个世界线撰写独特的背景档案、大事件记叙，建立专属于您设定的维基图书馆。"
  },
  {
    id: "music",
    name: "音乐",
    category: "多媒体与播放器",
    icon: "🎵",
    iconBg: "bg-rose-500",
    rating: 4.8,
    reviews: "2.4万",
    size: "24.5 MB",
    description: "全新重置的高端流媒体播放器，支持添加并导入自定义音乐，附带极致极简的唱片旋转特效与高保真动态均衡器。"
  },
  {
    id: "forum",
    name: "论坛",
    category: "社区与话题讨论",
    icon: "💻",
    iconBg: "bg-purple-500",
    rating: 4.7,
    reviews: "1.1万",
    size: "15.2 MB",
    description: "连接所有人的兴趣广场，发表您对于人设研究、世界观搭建或者音乐列表的深度看法，与虚拟朋友们一同留言共鸣。"
  },
  {
    id: "notes",
    name: "备忘录",
    category: "效率与生活记录",
    icon: "📝",
    iconBg: "bg-amber-600",
    rating: 4.8,
    reviews: "1.4万",
    size: "5.3 MB",
    description: "清爽纯净的本地记事与日程待办工具，支持多栏笔记管理及每日待办，与桌面代办小组件完全同步，助您轻松打理生活与灵感。"
  }
];

interface AppStoreProps {
  installedAppIds: string[];
  onInstallApp: (id: string) => void;
  onUninstallApp: (id: string) => void;
  onClose: () => void;
  renderAppIcon?: (id: string, className?: string) => React.ReactNode;
}

export default function AppStore({
  installedAppIds = ["chat", "archives", "worldbook", "music", "notes"],
  onInstallApp,
  onUninstallApp,
  onClose,
  renderAppIcon
}: AppStoreProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const startDownload = (id: string) => {
    setDownloadingId(id);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          onInstallApp(id);
          setDownloadingId(null);
          return 100;
        }
        // Smoothly increment by an organic step every 45ms (approx. 2 seconds total)
        const randIncrement = 1.8 + Math.random() * 1.5;
        const next = prev + randIncrement;
        if (next >= 100) {
          clearInterval(interval);
          onInstallApp(id);
          setDownloadingId(null);
          return 100;
        }
        return next;
      });
    }, 45);
  };

  const filteredApps = APPS_LIST.filter((app) =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-transparent z-10 shrink-0 relative">
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
        >
          <ChevronLeft className="w-4 h-4 text-slate-700" />
        </button>
        
        <h1 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">应用商店</h1>
        <div className="w-8 h-8" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <div className="max-w-md mx-auto space-y-5">
          {/* Quick Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索应用或分类..."
              className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs"
            />
          </div>

          {/* Featured Apps list */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>系统应用目录</span>
            </h3>

            <div className="space-y-3">
              {filteredApps.map((app) => {
                const isInstalled = installedAppIds.includes(app.id);

                return (
                  <div
                    key={app.id}
                    className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start justify-between gap-3.5"
                  >
                    {/* Icon */}
                    <div 
                      className="w-12 h-12 bg-white border border-[#f0f0f3] flex items-center justify-center shadow-[0_3px_8px_rgba(0,0,0,0.05)] overflow-hidden shrink-0"
                      style={{ borderRadius: "var(--app-icon-radius, 35%)" }}
                    >
                      {renderAppIcon ? (
                        <div className="w-full h-full flex items-center justify-center scale-90 text-stone-800">
                          {renderAppIcon(app.id, "w-6 h-6")}
                        </div>
                      ) : (
                        <span className="text-xl">{app.icon}</span>
                      )}
                    </div>

                    {/* Body Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{app.name}</h4>
                        <span className="px-1 py-0.2 bg-slate-100 text-slate-500 text-[9px] font-bold rounded">
                          {app.size}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{app.category}</p>
                      
                      {/* Rating info */}
                      <div className="flex items-center space-x-1.5 mt-1">
                        <div className="flex items-center text-amber-500">
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                          <span className="text-[10px] font-bold ml-0.5">{app.rating}</span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-medium">({app.reviews}次评分)</span>
                      </div>

                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                        {app.description}
                      </p>
                    </div>

                    {/* Download/Uninstall Action button */}
                    <div className="shrink-0 pt-0.5 flex flex-col gap-2 items-end">
                      {downloadingId === app.id ? (
                        <div className="relative w-[72px] h-[26px] bg-slate-100 rounded-full overflow-hidden border border-slate-200 flex items-center justify-center select-none shadow-sm">
                          {/* Smooth expanding fill */}
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-neutral-950 transition-all duration-75 ease-out"
                            style={{ width: `${progress}%` }}
                          />
                          {/* Live percentage text with active color inversion contrast */}
                          <span className="relative z-10 text-[10px] font-extrabold text-white mix-blend-difference">
                            {Math.round(progress)}%
                          </span>
                        </div>
                      ) : isInstalled ? (
                        <button
                          onClick={() => onUninstallApp(app.id)}
                          className="w-[72px] h-[26px] text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-full text-[10px] font-bold text-center transition-all flex items-center justify-center gap-1 shadow-sm"
                        >
                          <Trash2 className="w-3 h-3 shrink-0" />
                          <span>卸载</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => startDownload(app.id)}
                          className="w-[72px] h-[26px] bg-neutral-950 hover:bg-neutral-900 text-white font-bold rounded-full text-[10px] tracking-wide transition-all shadow-sm flex items-center justify-center gap-1"
                        >
                          <Download className="w-3 h-3 shrink-0" />
                          <span>安装</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredApps.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-xs">
                  未找到匹配的应用。
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
