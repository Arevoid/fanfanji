import React, { useState } from "react";
import { Character, UserSettings, WorldBookEntry } from "../types";
import { apiSummarizePersonality } from "../utils/apiHelper";
import { Plus, Trash2, User, ChevronLeft, AlertCircle, X, Image, Sparkles, Brain, BookOpen, FileText, MessageSquare, Volume2, Download } from "lucide-react";
import { parsePngChunks, decodeCharaData, mapSillyTavernToCharacter, mapSillyTavernEntry, compressImage, safeParseDocx } from "../utils/pngParser";
import { getSpeechForText } from "../utils/minimaxTts";
import { buildCharacterExport, characterExportFilename, createCharacterFromImportedProfile, createCharacterFromRawDocument } from "../features/archives/characterExport";
import { buildCharacterTtsOptions, type TtsProvider } from "../features/voice/ttsConfig";

interface AppArchivesProps {
  characters: Character[];
  onSaveCharacter: (character: Character) => void | boolean | Promise<boolean>;
  onDeleteCharacter: (id: string, skipConfirm?: boolean) => void;
  onClose: () => void;
  worldBookEntries?: WorldBookEntry[];
  onSaveWorldBookEntries?: (entries: WorldBookEntry[]) => void;
}

const MBTI_LIST = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP"
];


export default function AppArchives({
  characters,
  onSaveCharacter,
  onDeleteCharacter,
  onClose,
  worldBookEntries = [],
  onSaveWorldBookEntries,
}: AppArchivesProps) {
  const visibleCharacters = characters.filter((c) => !c.isGroupChat && !c.isContactInstance);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportCharacterId, setExportCharacterId] = useState<string>("");
  const [includeBoundWorldBook, setIncludeBoundWorldBook] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [newRefTitle, setNewRefTitle] = useState("");
  const [newRefContent, setNewRefContent] = useState("");

  // Custom Confirmation & Alert Dialog States
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  const showConfirm = (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(null);
      },
      onCancel: () => {
        if (onCancel) onCancel();
        setConfirmDialog(null);
      }
    });
  };

  const showAlert = (title: string, message: string) => {
    setAlertDialog({
      isOpen: true,
      title,
      message
    });
  };

  const downloadCharacterExport = () => {
    const character = visibleCharacters.find((item) => item.id === exportCharacterId);
    if (!character) return;
    const payload = buildCharacterExport(character, worldBookEntries, includeBoundWorldBook);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = characterExportFilename(character.name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportDialog(false);
    showAlert("导出成功", includeBoundWorldBook
      ? `已导出「${character.name}」角色卡及其专属世界书。`
      : `已导出「${character.name}」角色卡。`);
  };

  // Form State
  const [name, setName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [gender, setGender] = useState("");
  const [mbti, setMbti] = useState("");
  const [avatar, setAvatar] = useState("");
  const [personality, setPersonality] = useState("");
  const [replyLanguage, setReplyLanguage] = useState("");
  const [, setBackstory] = useState("");
  const [greeting, setGreeting] = useState("");
  const [initialChatMode, setInitialChatMode] = useState<"greeting" | "context">("greeting");
  const [album, setAlbum] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [minimaxVoiceId, setMinimaxVoiceId] = useState("");
  const [mosslandVoiceId, setMosslandVoiceId] = useState("");
  const [isAuditioning, setIsAuditioning] = useState(false);
  const [auditionProvider, setAuditionProvider] = useState<TtsProvider | null>(null);
  const [auditionAudio, setAuditionAudio] = useState<HTMLAudioElement | null>(null);

  const handleAudition = async (provider: TtsProvider) => {
    if (isAuditioning) {
      const shouldSwitchProvider = auditionProvider !== provider;
      if (auditionAudio) {
        auditionAudio.pause();
        setAuditionAudio(null);
      }
      setIsAuditioning(false);
      setAuditionProvider(null);
      if (!shouldSwitchProvider) return;
    }

    try {
      setIsAuditioning(true);
      setAuditionProvider(provider);
      setErrorMsg("");

      let settings: any = {};
      try {
        const saved = localStorage.getItem("phone_settings");
        if (saved) settings = JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }

      const ttsOptions = buildCharacterTtsOptions(settings as UserSettings, {
        minimaxVoiceId,
        mosslandVoiceId,
      }, provider);

      const auditionText = "您好！我已经成功绑定了此项语音。请问您喜欢我的这个声音吗？";
      const blob = await getSpeechForText(auditionText, ttsOptions);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      setAuditionAudio(audio);
      audio.onended = () => {
        setIsAuditioning(false);
        setAuditionProvider(null);
        setAuditionAudio(null);
      };
      audio.onerror = (e) => {
        console.error("Audition playback failed:", e);
        setErrorMsg(`试听音频播放失败，请检查 ${provider === "mossland" ? "Mossland" : "MiniMax"} 配置`);
        setIsAuditioning(false);
        setAuditionProvider(null);
        setAuditionAudio(null);
      };
      audio.play();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || `试听合成失败，请确认 ${provider === "mossland" ? "Mossland" : "MiniMax"} 语音配置有效！`);
      setIsAuditioning(false);
      setAuditionProvider(null);
    }
  };

  const resetForm = () => {
    setName("");
    setAge("");
    setGender("");
    setMbti("");
    setAvatar("");
    setPersonality("");
    setReplyLanguage("");
    setBackstory("");
    setGreeting("");
    setAlbum([]);
    setErrorMsg("");
    setMinimaxVoiceId("");
    setMosslandVoiceId("");
    if (auditionAudio) {
      auditionAudio.pause();
      setAuditionAudio(null);
    }
    setIsAuditioning(false);
    setAuditionProvider(null);
    setEditingId(null);
    setIsCreating(false);
  };

  const handleEdit = (char: Character) => {
    setEditingId(char.id);
    setName(char.name);
    setAge(char.age);
    setGender(char.gender);
    setMbti(char.mbti);
    setAvatar(char.avatar);
    setMinimaxVoiceId(char.minimaxVoiceId || "");
    setMosslandVoiceId(char.mosslandVoiceId || "");
    
    // Combine existing backstory if populated and valid
    let combined = char.personality;
    if (char.backstory && char.backstory !== "暂无背景设定。" && char.backstory !== "暂无背景故事。" && char.backstory.trim() !== "") {
      combined += "\n\n【背景故事】\n" + char.backstory;
    }
    setPersonality(combined);
    setReplyLanguage(char.replyLanguage || "");
    setBackstory("");
    setGreeting(char.initialChatContext || char.greeting || "");
    setInitialChatMode(char.initialChatMode || (char.initialChatContext ? "context" : "greeting"));
    setAlbum(char.album || []);
    setErrorMsg("");
    setIsCreating(true);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 400, 400, 0.75);
        setAvatar(compressed);
        setErrorMsg("");
      } catch (err) {
        console.error("Avatar compression failed:", err);
        setErrorMsg("图片压缩失败，请重试");
      }
    }
  };

  const handleCharacterImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const isPng = file.name.toLowerCase().endsWith(".png");
      const isJson = file.name.toLowerCase().endsWith(".json");
      const isTxt = file.name.toLowerCase().endsWith(".txt");
      const isDocx = file.name.toLowerCase().endsWith(".docx");
      
      let importedChar: Character;
      let characterBook: any = null;

      if (isPng) {
        const charaStr = await parsePngChunks(file);
        if (!charaStr) {
          throw new Error("此 PNG 图片中未检测到内嵌的角色卡数据 (chara)！");
        }
        const parsedJson = decodeCharaData(charaStr);
        let imgDataUrl = "";
        try {
          imgDataUrl = await compressImage(file, 400, 400, 0.75);
        } catch (compErr) {
          console.error("Failed to compress PNG avatar, using fallback raw load:", compErr);
          imgDataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = () => reject(new Error("读取头像图片失败"));
            r.readAsDataURL(file);
          });
        }
        importedChar = mapSillyTavernToCharacter(parsedJson, imgDataUrl);
      } else if (isJson) {
        const text = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(new Error("读取 JSON 配置文件失败"));
          r.readAsText(file);
        });
        const parsedJson = JSON.parse(text);
        const innerData = parsedJson.data || parsedJson;
        const embeddedCharacter = innerData?.extensions?.fanfanji?.character;
        importedChar = embeddedCharacter && typeof embeddedCharacter === "object"
          ? createCharacterFromImportedProfile(embeddedCharacter, "char-import-" + Date.now())
          : mapSillyTavernToCharacter(parsedJson, "");
        const mwb = innerData.mountedWorldbooks || innerData.mounted_worldbooks || innerData.mounted_world_books || parsedJson.mountedWorldbooks || parsedJson.mounted_worldbooks || parsedJson.mounted_world_books;
        if (mwb && Array.isArray(mwb)) {
          characterBook = { entries: mwb };
        } else {
          characterBook = innerData.character_book || innerData.world_book || innerData.worldbook;
        }
      } else if (isTxt) {
        const text = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(new Error("读取 TXT 配置文件失败"));
          r.readAsText(file);
        });
        importedChar = createCharacterFromRawDocument(text, file.name, "char-import-" + Date.now());
      } else if (isDocx) {
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as ArrayBuffer);
          r.onerror = () => reject(new Error("读取 DOCX 配置文件失败"));
          r.readAsArrayBuffer(file);
        });
        const text = await safeParseDocx(arrayBuffer);
        importedChar = createCharacterFromRawDocument(text, file.name, "char-import-" + Date.now());
      } else {
        throw new Error("请上传 .png 角色卡、.json 配置文件、.txt 或 .docx 文档文件！");
      }

      // All supported formats pass through the same persona-only boundary.
      // This also protects imports made by older Fanfanji builds that embedded
      // the entire Character object, including chat and relationship settings.
      importedChar = createCharacterFromImportedProfile(importedChar, importedChar.id);

      const finishImport = async (importEntries: boolean) => {
        try {
          let importedEntriesCount = 0;
          const rawEntries = Array.isArray(characterBook?.entries)
            ? characterBook.entries
            : characterBook?.entries && typeof characterBook.entries === "object"
              ? Object.values(characterBook.entries)
              : [];
          if (importEntries && rawEntries.length > 0) {
            const mappedEntries = rawEntries
              .map((entry: any) => {
                try {
                  const mapped = mapSillyTavernEntry(entry, importedChar.id);
                  if (mapped) {
                    mapped.category = `${importedChar.name || "未命名"}世界书`;
                  }
                  return mapped;
                } catch (e) {
                  console.error("Failed to map entry:", entry, e);
                  return null;
                }
              })
              .filter(Boolean) as WorldBookEntry[];

            if (mappedEntries.length > 0 && onSaveWorldBookEntries) {
              onSaveWorldBookEntries(mappedEntries);
              importedEntriesCount = mappedEntries.length;
            }
          }

          const saved = await onSaveCharacter(importedChar);
          if (saved === false) throw new Error("角色档案保存失败，请检查浏览器存储权限或剩余空间");

          let successMsg = `成功导入角色「${importedChar.name}」！`;
          if (importedEntriesCount > 0) {
            successMsg += `\n并自动识别并绑定导入了其附带的 ${importedEntriesCount} 条世界书词条！已链接到世界书。`;
          }
          showAlert("导入成功", successMsg);
        } catch (error: any) {
          console.error("Error in finishImport:", error);
          showAlert("导入失败", error.message || "未知错误");
        }
      };

      const importedWorldBookCount = Array.isArray(characterBook?.entries)
        ? characterBook.entries.length
        : characterBook?.entries && typeof characterBook.entries === "object"
          ? Object.keys(characterBook.entries).length
          : 0;
      if (importedWorldBookCount > 0) {
        showConfirm(
          "导入关联世界书词条",
          `检测到该角色设定中包含 ${importedWorldBookCount} 条世界书关联词条，是否同时导入并关联至世界书？`,
          () => finishImport(true),
          () => finishImport(false)
        );
      } else {
        finishImport(false);
      }
    } catch (err: any) {
      console.error(err);
      showAlert("导入失败", err.message);
    } finally {
      e.target.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg("请输入姓名！");
      return;
    }
    if (age !== "" && isNaN(Number(age))) {
      setErrorMsg("请输入正确的年龄！");
      return;
    }

    const originalChar = editingId ? characters.find(c => c.id === editingId) : null;
    const finalAvatar = avatar || "https://img.remit.ee/api/file/BQACAgUAAyEGAASHRsPbAAEW4T5qT0zAjLfrXvRikuEGegScd-tWAQAC4yIAAuHegVbmzmM_t9RkTDwE.jpg";
    const finalPersonality = personality.trim();

    const savedChar: Character = {
      id: editingId || Date.now().toString(),
      name: name.trim(),
      age: age === "" ? "" : Number(age),
      gender,
      mbti,
      avatar: finalAvatar,
      personality: finalPersonality,
      backstory: "",
      replyLanguage: replyLanguage.trim() || undefined,
      greeting: initialChatMode === "greeting" ? greeting.trim() : undefined,
      initialChatContext: initialChatMode === "context" ? greeting.trim() : undefined,
      initialChatMode,
      album: album,
      momentsCover: originalChar ? originalChar.momentsCover : undefined,
      isPinned: originalChar ? originalChar.isPinned : false,
      chatBg: originalChar ? originalChar.chatBg : undefined,
      references: originalChar ? originalChar.references : [],
      minimaxVoiceId: minimaxVoiceId,
      mosslandVoiceId: mosslandVoiceId,
    };

    onSaveCharacter(savedChar);
    resetForm();
  };

  const handleAlbumImageUpload = (char: Character, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          const currentAlbum = char.album || [];
          const updatedChar = {
            ...char,
            album: [...currentAlbum, reader.result],
          };
          onSaveCharacter(updatedChar);
        }
      };
      reader.readAsDataURL(file);
    }
  };


  const handleDeleteAlbumImage = (char: Character, indexToDelete: number) => {
    const currentAlbum = char.album || [];
    const updatedAlbum = currentAlbum.filter((_, idx) => idx !== indexToDelete);
    
    // If the deleted image was currently selected as momentsCover, clear or update it
    let updatedCover = char.momentsCover;
    if (char.momentsCover === currentAlbum[indexToDelete]) {
      updatedCover = updatedAlbum.length > 0 ? updatedAlbum[0] : undefined;
    }
    
    const updatedChar = {
      ...char,
      album: updatedAlbum,
      momentsCover: updatedCover,
    };
    onSaveCharacter(updatedChar);
  };

  const handleAiSummarize = async (char: Character) => {
    if (!char.references || char.references.length === 0) {
      showAlert("提示", "请至少先添加一个参考内容卡片后再进行 AI 总结！");
      return;
    }
    
    setIsSummarizing(true);
    try {
      const rawSettings = localStorage.getItem("phone_settings");
      let apiKey = "";
      let model = "";
      let apiEndpoint = "";
      
      if (rawSettings) {
        try {
          const parsed = JSON.parse(rawSettings);
          apiKey = parsed.apiKey || "";
          model = parsed.selectedModel || "";
          apiEndpoint = parsed.apiEndpoint || "";
        } catch (e) {
          console.error("Failed to parse settings", e);
        }
      }

      const data = await apiSummarizePersonality({
        references: char.references,
        apiKey,
        model,
        apiEndpoint
      });

      const aiResult = data.text;
      if (!aiResult || !aiResult.trim()) {
        throw new Error("AI 未能提炼出有效内容，请检查参考资料是否足够丰富。");
      }

      showConfirm(
        "AI 总结人设成功",
        `总结内容如下：\n\n${aiResult.slice(0, 300)}...\n\n是否立即应用并将本段总结保存为角色的「详细人设与说话特征」？`,
        () => {
          const updatedChar = {
            ...char,
            personality: aiResult.trim()
          };
          onSaveCharacter(updatedChar);
          setPersonality(aiResult.trim()); // update form state too if open
          showAlert("成功", "性格特征应用成功！已存入档案馆。");
        }
      );
    } catch (error: any) {
      console.error(error);
      showAlert("AI 总结失败", error.message);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div data-theme-page="archives" className="flex flex-col h-full bg-[var(--app-bg)] text-[var(--text-primary)] font-sans">
      {/* App Header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-transparent z-10 shrink-0 relative">
        <button
          type="button"
          onClick={isCreating ? resetForm : onClose}
          className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
          id="archives_back_btn"
        >
          <ChevronLeft className="w-4 h-4 text-slate-700" />
        </button>
        <h1 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max max-w-[180px] truncate">
          {isCreating
            ? (editingId ? "修改人设" : "创建人设")
            : "档案馆"
          }
        </h1>
        <div className="w-14 h-9 flex items-center justify-end z-10">
          {isCreating ? (
            editingId && (
              <button
                type="button"
                onClick={() => {
                  showConfirm(
                    "删除角色",
                    `确定要彻底删除角色“${name}”吗？此操作无法撤销！`,
                    () => {
                      onDeleteCharacter(editingId, true);
                      resetForm();
                    }
                  );
                }}
                className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center hover:bg-rose-100 border border-rose-100 transition-colors"
                title="删除角色"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
              </button>
            )
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="w-8 h-8 bg-neutral-950 hover:bg-neutral-900 text-white rounded-full transition-colors shadow flex items-center justify-center"
                id="archives_add_btn"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
              {showAddMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                  <div className="absolute right-0 top-10 bg-white border border-slate-200 shadow-xl rounded-[12px] p-1.5 z-50 flex flex-col gap-0.5 min-w-[130px] animate-fade-in text-left">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddMenu(false);
                        resetForm();
                        setIsCreating(true);
                      }}
                      className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-100 rounded-[16px] transition-colors text-left w-full"
                    >
                      <Plus className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                      <span>新建人设</span>
                    </button>
                    <label className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-100 rounded-[16px] transition-colors cursor-pointer text-left w-full">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>导入设定</span>
                      <input
                        type="file"
                        accept=".png,.json,.txt,.docx"
                        onChange={(e) => {
                          setShowAddMenu(false);
                          handleCharacterImport(e);
                        }}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddMenu(false);
                        setExportCharacterId(visibleCharacters[0]?.id || "");
                        setIncludeBoundWorldBook(true);
                        setShowExportDialog(true);
                      }}
                      disabled={visibleCharacters.length === 0}
                      className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-100 rounded-[16px] transition-colors text-left w-full disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>导出角色</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 pb-20">
        {isCreating ? (
          <form onSubmit={handleSubmit} className="settings-panel-card space-y-4 max-w-md mx-auto p-5 animate-slide-up">
            
            {/* Error Message Alert */}
            {errorMsg && (
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl flex items-center gap-2 text-xs font-semibold border border-rose-100">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Avatar Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                上传角色头像 (选填)
              </label>
              <div className="flex items-center gap-4">
                {avatar ? (
                  <img
                    src={avatar}
                    alt="Avatar preview"
                    className="w-14 h-14 rounded-full object-cover border-2 border-neutral-950 shadow-md bg-slate-100 shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full border-2 border-slate-300 border-dashed bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                    <User className="w-6 h-6" />
                  </div>
                )}
                
                <label className="cursor-pointer px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-bold transition-colors border border-neutral-200 flex items-center gap-1.5 shadow-sm">
                  <span>选择本地图片上传</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  姓名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="请输入姓名"
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-sm font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  年龄
                </label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value === "" ? "" : parseInt(e.target.value))}
                  placeholder="请输入年龄"
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-sm font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  性别
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-sm font-medium"
                >
                  <option value="">请选择性别 (选填)</option>
                  <option value="女">女</option>
                  <option value="男">男</option>
                  <option value="神秘">神秘</option>
                  <option value="AI / 智械">AI / 智械</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  MBTI 人格
                </label>
                <select
                  value={mbti}
                  onChange={(e) => setMbti(e.target.value)}
                  className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-sm font-medium"
                >
                  <option value="">请选择MBTI (选填)</option>
                  {MBTI_LIST.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Detailed Personality and Backstory */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">角色回复语言（选填）</label>
              <input
                type="text"
                value={replyLanguage}
                onChange={(e) => setReplyLanguage(e.target.value)}
                placeholder="例如：日语、English；留空则从人设/国籍自动识别"
                className="w-full px-3 py-2 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                详细人设与背景 (选填)
              </label>
              <textarea
                rows={8}
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="在此输入详细的人格性格设定、语气特征、来历背景、生活背景或各种设定细节..."
                className="w-full px-5 py-4 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs resize-none leading-relaxed font-medium"
              />
            </div>

            <div className="initial-chat-setup">
              <label className="block text-xs font-semibold text-slate-500 mb-1">初次聊天设定（选填）</label>
              <p className="text-[10px] leading-relaxed text-slate-400 mb-2">
                场景 / 关系只会作为 AI 首轮聊天参考，不显示为聊天消息；开场白语言则会作为角色的第一条消息发送。
              </p>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setInitialChatMode("greeting")}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${initialChatMode === "greeting" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-slate-500 border-slate-200"}`}
                >
                  开场白语言
                </button>
                <button
                  type="button"
                  onClick={() => setInitialChatMode("context")}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${initialChatMode === "context" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-slate-500 border-slate-200"}`}
                >
                  场景 / 关系
                </button>
              </div>
              <style>{`.initial-chat-setup + div > label { display: none; }`}</style>
            </div>

            {/* Greeting */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                开场白 (选填)
              </label>
              <textarea
                rows={3}
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="在此输入角色的开场白。开启聊天时，角色会自动、主动发送这段话..."
                className="w-full px-5 py-4 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs resize-none leading-relaxed font-semibold"
              />
            </div>

            {/* Voice ID bindings */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                绑定专属音色 ID (选填)
              </label>
              <div className="space-y-2">
                {([
                  { provider: "mossland" as const, label: "Mossland", value: mosslandVoiceId, setValue: setMosslandVoiceId },
                  { provider: "minimax" as const, label: "MiniMax", value: minimaxVoiceId, setValue: setMinimaxVoiceId },
                ]).map(({ provider, label, value, setValue }) => (
                  <div key={provider} className="flex gap-2">
                    <input
                      type="text"
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                      placeholder={`${label} Voice ID`}
                      aria-label={`${label} Voice ID`}
                      className="flex-1 min-w-0 px-5 py-3 rounded-[8px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs font-semibold"
                    />
                    <button
                      type="button"
                      disabled={!value}
                      onClick={() => handleAudition(provider)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 shrink-0 ${
                        !value
                          ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                          : isAuditioning && auditionProvider === provider
                          ? "bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                      title={`试听 ${label} 音色`}
                    >
                      <Volume2 className={`w-3.5 h-3.5 ${isAuditioning && auditionProvider === provider ? "animate-pulse text-rose-500" : ""}`} />
                      <span>{isAuditioning && auditionProvider === provider ? "停止" : "试听"}</span>
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400 font-medium">
                两个平台的 ID 分开保存；实际聊天使用“设置” → “语音设置”中当前选择的平台。
              </p>
            </div>

            {/* Save Button Only */}
            <div className="settings-wide-action-group pt-2">
              <button
                type="submit"
                className="settings-wide-action settings-wide-action-primary"
              >
                <span>保存人设</span>
              </button>
            </div>
          </form>
        ) : selectedCharId ? (
          (() => {
            const char = characters.find(c => c.id === selectedCharId);
            if (!char) {
              setSelectedCharId(null);
              return null;
            }
            return (
              <div className="space-y-4 max-w-md mx-auto animate-slide-up pb-10">
                {/* Profile Header Card */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-r from-neutral-800 to-neutral-950 opacity-10" />
                  
                  <div className="relative mt-4">
                    <img
                      src={char.avatar}
                      alt={char.name}
                      className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md bg-slate-100"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  
                  <h2 className="text-xl font-bold text-slate-800 mt-3">{char.name}</h2>
                  <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1.5 font-semibold">
                    <span className="px-2 py-0.5 bg-[var(--badge-bg)] text-[var(--badge-text)] rounded-md text-[10px] tracking-wide font-black">
                      {char.mbti}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span>{char.gender}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span>{char.age}岁</span>
                  </p>
                </div>

                {/* Personality Card */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-neutral-800" />
                    <span>详细人设与背景设定</span>
                  </h3>
                  <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded-xl border border-slate-100 font-semibold">
                    {char.personality}
                  </div>
                </div>

                {/* Backstory Card */}
                {char.backstory && char.backstory !== "暂无背景设定。" && char.backstory !== "暂无背景故事。" && char.backstory.trim() !== "" && (
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-neutral-800" />
                      <span>独立背景故事设定</span>
                    </h3>
                    <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded-xl border border-slate-100">
                      {char.backstory}
                    </div>
                  </div>
                )}

                {/* Greeting Card */}
                {char.greeting && (
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-neutral-800" />
                      <span>开场白设定</span>
                    </h3>
                    <div className="text-xs text-slate-600 bg-amber-50/50 border border-amber-100/60 leading-relaxed whitespace-pre-wrap p-4 rounded-xl font-semibold italic">
                      “ {char.greeting} ”
                    </div>
                  </div>
                )}

                {/* Photo Album */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5 text-neutral-800" />
                      <span>相册图库 ({(char.album || []).length})</span>
                    </h3>
                    <label className="cursor-pointer text-[10px] font-bold text-neutral-950 hover:underline flex items-center gap-1">
                      <span>+ 添加照片</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleAlbumImageUpload(char, e)}
                        className="hidden"
                      />
                    </label>
                  </div>
                  
                  {(char.album || []).length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {(char.album || []).map((img, idx) => {
                        const isCurrentBg = char.momentsCover === img;
                        return (
                          <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 bg-slate-50 group">
                            <img src={img} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => handleDeleteAlbumImage(char, idx)}
                              className="absolute top-1 right-1 p-0.5 bg-black/60 hover:bg-rose-600 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100"
                              title="删除此照片"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                            {isCurrentBg ? (
                              <div className="absolute inset-x-0 bottom-0 bg-emerald-500/90 text-white text-[8px] py-0.5 text-center font-bold">
                                朋友圈背景
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = { ...char, momentsCover: img };
                                  onSaveCharacter(updated);
                                }}
                                className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-[8px] py-0.5 text-center font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                设为背景
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      暂无照片，上传一些生活照或候选朋友圈背景吧！
                    </div>
                  )}
                </div>

                {/* References and AI summarization */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-neutral-800" />
                      <span>人设提炼参考资料 ({(char.references || []).length})</span>
                    </h3>
                  </div>

                  {/* AI Summarize Personality Button */}
                  {(char.references || []).length > 0 && (
                    <button
                      type="button"
                      disabled={isSummarizing}
                      onClick={() => handleAiSummarize(char)}
                      className={`w-full py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm ${
                        isSummarizing
                          ? "bg-neutral-100 text-slate-400 cursor-not-allowed"
                          : "bg-gradient-to-r from-neutral-900 via-stone-900 to-neutral-950 text-white hover:from-neutral-800 hover:to-neutral-900 active:scale-98"
                      }`}
                    >
                      {isSummarizing ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                          <span>AI 正在分析故事并提炼人设性格...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                          <span>AI 一键深度总结人设与说话口癖</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Reference Cards List */}
                  {(char.references || []).length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {(char.references || []).map((ref) => (
                        <div key={ref.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 relative group text-left">
                          <button
                            type="button"
                            onClick={() => {
                              showConfirm(
                                "删除参考资料",
                                `确定要删除参考资料“${ref.title}”吗？`,
                                () => {
                                  const updatedChar = {
                                    ...char,
                                    references: (char.references || []).filter(r => r.id !== ref.id)
                                  };
                                  onSaveCharacter(updatedChar);
                                }
                              );
                            }}
                            className="absolute top-2 right-2 p-1 bg-white hover:bg-rose-50 border border-slate-100 text-slate-400 hover:text-rose-500 rounded-lg transition-colors shadow-sm opacity-0 group-hover:opacity-100"
                            title="删除参考卡片"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <h4 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-1">
                            <span className="w-1 h-3 bg-neutral-950 rounded-full" />
                            <span>{ref.title}</span>
                          </h4>
                          <p className="text-[11px] text-slate-500 leading-relaxed whitespace-pre-wrap line-clamp-4">
                            {ref.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      还没有添加任何参考内容。您可以通过导入人物的故事、日记、小说章节或对话片段，以便让 AI 总结出传神精准的人物口癖与性格！
                    </div>
                  )}

                  {/* Add New Reference Card Form */}
                  <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200/50 space-y-3 text-left">
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      添加参考资料卡片
                    </h4>
                    <div>
                      <input
                        type="text"
                        value={newRefTitle}
                        onChange={(e) => setNewRefTitle(e.target.value)}
                        placeholder="请输入参考标题，如：对白片段一 / 经典日志"
                        className="w-full px-3 py-2 bg-white rounded-[8px] border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-950 font-semibold"
                      />
                    </div>
                    <div>
                      <textarea
                        rows={3}
                        value={newRefContent}
                        onChange={(e) => setNewRefContent(e.target.value)}
                        placeholder="请输入该角色相关的故事描述、生活日志、或是经典原著对白内容。建议多提供能反映角色性格特征或说话口癖的句子..."
                        className="w-full px-3 py-2 bg-white rounded-[8px] border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-950 resize-none leading-relaxed"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!newRefTitle.trim() || !newRefContent.trim()) {
                          alert("请输入参考卡片的标题与具体内容！");
                          return;
                        }
                        const newRef = {
                          id: "ref-" + Date.now().toString(),
                          title: newRefTitle.trim(),
                          content: newRefContent.trim()
                        };
                        const updatedChar = {
                          ...char,
                          references: [...(char.references || []), newRef]
                        };
                        onSaveCharacter(updatedChar);
                        setNewRefTitle("");
                        setNewRefContent("");
                      }}
                      className="w-full py-2 bg-neutral-950 hover:bg-neutral-900 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>保存此参考卡片</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          <div className="space-y-3 max-w-md mx-auto">
            {visibleCharacters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400 border border-slate-200">
                  <User className="w-8 h-8" />
                </div>
                <h3 className="text-base font-semibold text-slate-700">档案馆空空如也</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                  点击右上角的加号按钮，创建一个属于您自己的虚拟人设，可以自由上传头像并定制说话语气！
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="mt-4 px-4 py-2 bg-neutral-950 hover:bg-neutral-900 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
                >
                  现在去创建
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {visibleCharacters.map((char) => (
                  <div
                    key={char.id}
                    onClick={() => handleEdit(char)}
                    className="flex items-start bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow transition-all group relative overflow-hidden cursor-pointer hover:border-slate-300 text-left"
                  >
                    {/* Character Tag */}
                    <div className="absolute top-3 right-3 flex items-center space-x-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                      <span className="px-1.5 py-0.5 bg-[var(--badge-bg)] text-[var(--badge-text)] text-[10px] font-bold rounded-md">
                        {char.mbti}
                      </span>
                      <span className="px-1.5 py-0.5 bg-[var(--badge-muted-bg)] text-[var(--badge-muted-text)] text-[10px] font-bold rounded-md">
                        {char.age}岁
                      </span>
                    </div>

                    {/* Avatar */}
                    <img
                      src={char.avatar}
                      alt={char.name}
                      className="w-14 h-14 rounded-full object-cover mr-4 border-2 border-slate-100 bg-slate-100 shadow-inner shrink-0"
                      referrerPolicy="no-referrer"
                    />

                    {/* Biography details */}
                    <div className="flex-1 pr-14">
                      <h3 className="font-bold text-slate-800 text-base flex items-center gap-1.5">
                        {char.name}
                        <span className="text-xs font-normal text-slate-400">({char.gender})</span>
                      </h3>

                      {/* Character description preview */}
                      <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                        {char.personality}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showExportDialog && (
        <div className="fixed inset-0 z-[9999] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-fade-in" onClick={() => setShowExportDialog(false)}>
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-2xl space-y-4 animate-slide-up" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">导出角色</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">导出为 JSON 角色卡，可选择附带该角色专属世界书。</p>
              </div>
              <button type="button" onClick={() => setShowExportDialog(false)} className="p-1.5 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-600">选择角色</span>
              <select value={exportCharacterId} onChange={(event) => setExportCharacterId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-slate-400">
                {visibleCharacters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
              </select>
            </label>
            <label className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3.5 cursor-pointer">
              <input type="checkbox" checked={includeBoundWorldBook} onChange={(event) => setIncludeBoundWorldBook(event.target.checked)} className="mt-0.5 h-4 w-4 accent-neutral-950" />
              <span className="space-y-0.5"><span className="block text-xs font-bold text-slate-700">同时导出专属世界书</span><span className="block text-[11px] leading-relaxed text-slate-400">仅包含绑定到所选角色的世界书词条；不勾选则只导出角色卡。</span></span>
            </label>
            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={() => setShowExportDialog(false)} className="flex-1 rounded-full bg-slate-100 py-2.5 text-xs font-bold text-slate-600">取消</button>
              <button type="button" onClick={downloadCharacterExport} disabled={!exportCharacterId} className="flex-1 rounded-full bg-neutral-950 py-2.5 text-xs font-bold text-white disabled:opacity-40">导出 JSON</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Dialogs */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-white w-full max-w-xs rounded-[32px] p-6 border border-slate-100 shadow-2xl text-center space-y-4">
            <h3 className="text-base font-bold text-slate-800">{confirmDialog.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">{confirmDialog.message}</p>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={confirmDialog.onCancel || (() => setConfirmDialog(null))}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-bold transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full text-xs font-bold transition-all"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {alertDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-white w-full max-w-xs rounded-[32px] p-6 border border-slate-100 shadow-2xl text-center space-y-4">
            <h3 className="text-base font-bold text-slate-800">{alertDialog.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap">{alertDialog.message}</p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setAlertDialog(null)}
                className="w-full py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white rounded-full text-xs font-bold transition-all"
              >
                好的
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
