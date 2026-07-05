import React, { useState } from "react";
import { Character, WorldBookEntry } from "../types";
import { Plus, Trash2, Edit2, User, ChevronLeft, Save, AlertCircle, X, Camera, Image, Sparkles, Brain, BookOpen, FileText, MessageSquare } from "lucide-react";

interface AppArchivesProps {
  characters: Character[];
  onSaveCharacter: (character: Character) => void;
  onDeleteCharacter: (id: string, skipConfirm?: boolean) => void;
  onClose: () => void;
  onSaveWorldBookEntries?: (entries: WorldBookEntry[]) => void;
}

const MBTI_LIST = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP"
];

// PNG Character Card text chunk parser
async function parsePngChunks(file: File): Promise<string | null> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  
  if (view.getUint32(0) !== 0x89504E47 || view.getUint32(4) !== 0x0D0A1A0A) {
    throw new Error("不是一个有效的 PNG 图片文件！");
  }
  
  let offset = 8;
  const length = buffer.byteLength;
  
  while (offset < length) {
    if (offset + 8 > length) break;
    const chunkLength = view.getUint32(offset);
    const chunkType = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );
    
    if (chunkType === "tEXt" || chunkType === "iTXt") {
      const chunkDataOffset = offset + 8;
      const chunkData = new Uint8Array(buffer, chunkDataOffset, chunkLength);
      const textDecoder = new TextDecoder("utf-8");
      const decoded = textDecoder.decode(chunkData);
      
      if (chunkType === "tEXt") {
        const parts = decoded.split("\0");
        if (parts.length >= 2) {
          const key = parts[0];
          const val = parts.slice(1).join("\0");
          if (key === "chara") {
            return val;
          }
        }
      } else if (chunkType === "iTXt") {
        const parts = decoded.split("\0");
        if (parts.length >= 2) {
          const key = parts[0];
          if (key === "chara") {
            let index = key.length + 3;
            while (index < decoded.length && decoded[index] !== "\0") {
              index++;
            }
            index++;
            while (index < decoded.length && decoded[index] !== "\0") {
              index++;
            }
            index++;
            const val = decoded.substring(index);
            return val;
          }
        }
      }
    }
    offset += 12 + chunkLength;
  }
  return null;
}

function decodeCharaData(rawData: string): any {
  let text = rawData.trim();
  if (!text.startsWith("{")) {
    try {
      text = atob(text);
    } catch (e) {
      // ignore
    }
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("无法将解析出的数据转换为 JSON 格式: " + err);
  }
}

const mapSillyTavernToCharacter = (json: any, defaultAvatar: string): Character => {
  const data = json.data || json;
  const charName = data.name || data.char_name || "未命名角色";
  
  let pDetails = "";
  if (data.personality) pDetails += `【性格】\n${data.personality}\n\n`;
  if (data.description || data.char_persona) pDetails += `【详细人设】\n${data.description || data.char_persona}\n\n`;
  if (data.scenario || data.world_scenario) pDetails += `【背景/情境】\n${data.scenario || data.world_scenario}\n\n`;
  if (data.mes_example) pDetails += `【对话范例】\n${data.mes_example}\n\n`;
  
  let bstory = data.creator_notes || data.creator || "";
  if (!bstory.trim()) {
    bstory = "暂无背景故事。";
  }

  let ageNum: number | "" = "";
  if (data.age !== undefined && data.age !== null && data.age !== "") {
    const parsedAge = parseInt(String(data.age));
    if (!isNaN(parsedAge)) {
      ageNum = parsedAge;
    }
  } else {
    const ageMatch = pDetails.match(/(?:年龄|Age|age|岁)[:：\s]*(\d+)/);
    if (ageMatch) {
      ageNum = parseInt(ageMatch[1]);
    }
  }

  let genderStr = "";
  if (data.gender !== undefined && data.gender !== null && data.gender !== "") {
    genderStr = String(data.gender).trim();
  } else {
    if (pDetails.includes("女") || pDetails.toLowerCase().includes("female") || pDetails.toLowerCase().includes("girl")) {
      genderStr = "女";
    } else if (pDetails.includes("男") || pDetails.toLowerCase().includes("male") || pDetails.toLowerCase().includes("boy")) {
      genderStr = "男";
    }
  }

  let mbtiStr = "";
  const mbtiMatch = pDetails.match(/\b([IE][NS][TF][JP])\b/i);
  if (mbtiMatch) {
    mbtiStr = mbtiMatch[1].toUpperCase();
  }

  return {
    id: "char-import-" + Date.now(),
    name: charName,
    avatar: defaultAvatar || "/avatars/default.png",
    age: ageNum,
    gender: genderStr,
    mbti: mbtiStr,
    personality: pDetails.trim() || "导入的性格设定。",
    backstory: bstory.trim(),
    greeting: (data.first_mes || "").trim(),
    album: defaultAvatar ? [defaultAvatar] : [],
    references: [],
  };
};

const mapSillyTavernEntry = (stEntry: any, characterId: string): WorldBookEntry => {
  let title = stEntry.comment || stEntry.name || stEntry.title || "";
  if (!title && stEntry.keys && stEntry.keys.length > 0) {
    title = Array.isArray(stEntry.keys) ? stEntry.keys[0] : String(stEntry.keys).split(",")[0];
  }
  if (!title) {
    title = `未命名词条-${Math.random().toString(36).substring(2, 6)}`;
  }

  let kwString = "";
  if (Array.isArray(stEntry.keys)) {
    kwString = stEntry.keys.join(", ");
  } else if (typeof stEntry.keys === "string") {
    kwString = stEntry.keys;
  }

  let mappedPos: "after_main_prompt" | "before_char_def" | "after_char_def" | "before_chat_history" = "after_char_def";
  const stPos = stEntry.position;
  if (stPos !== undefined) {
    const pStr = String(stPos).toLowerCase();
    if (pStr.includes("author") || pStr === "3") {
      mappedPos = "after_char_def"; // authors_note maps to after_char_def
    } else if (pStr.includes("before_char") || pStr.includes("before_body") || pStr === "0") {
      mappedPos = "before_char_def";
    } else if (pStr.includes("after_char") || pStr.includes("after_body") || pStr === "1") {
      mappedPos = "after_char_def";
    } else if (pStr.includes("chat") || pStr.includes("story") || pStr === "2") {
      mappedPos = "before_chat_history";
    } else if (pStr.includes("main") || pStr.includes("depth") || pStr === "4") {
      mappedPos = "after_main_prompt";
    }
  }

  let mappedDepth = 5;
  if (stEntry.insertion_order !== undefined) {
    mappedDepth = Math.max(1, Math.min(15, Number(stEntry.insertion_order)));
  } else if (stEntry.depth !== undefined) {
    mappedDepth = Math.max(1, Math.min(15, Number(stEntry.depth)));
  }

  let trigger: "keys" | "constant" | "vector" = "keys";
  if (stEntry.constant === true || !kwString.trim()) {
    trigger = "constant";
  }

  return {
    id: `wb-entry-${characterId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: title,
    category: "世界书",
    content: stEntry.content || "",
    timestamp: Date.now(),
    characterId: characterId,
    triggerType: trigger,
    keywords: kwString || undefined,
    isActive: stEntry.enabled !== false,
    position: mappedPos,
    depth: mappedDepth
  };
};

export default function AppArchives({
  characters,
  onSaveCharacter,
  onDeleteCharacter,
  onClose,
  onSaveWorldBookEntries,
}: AppArchivesProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
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

  // Form State
  const [name, setName] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [gender, setGender] = useState("");
  const [mbti, setMbti] = useState("");
  const [avatar, setAvatar] = useState("");
  const [personality, setPersonality] = useState("");
  const [backstory, setBackstory] = useState("");
  const [greeting, setGreeting] = useState("");
  const [album, setAlbum] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const resetForm = () => {
    setName("");
    setAge("");
    setGender("");
    setMbti("");
    setAvatar("");
    setPersonality("");
    setBackstory("");
    setGreeting("");
    setAlbum([]);
    setErrorMsg("");
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
    setPersonality(char.personality);
    setBackstory(char.backstory);
    setGreeting(char.greeting || "");
    setAlbum(char.album || []);
    setErrorMsg("");
    setIsCreating(true);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setAvatar(reader.result);
          setErrorMsg("");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCharacterImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const isPng = file.name.toLowerCase().endsWith(".png");
      const isJson = file.name.toLowerCase().endsWith(".json");
      
      let parsedJson: any = null;
      let imgDataUrl = "";

      if (isPng) {
        const charaStr = await parsePngChunks(file);
        if (!charaStr) {
          throw new Error("此 PNG 图片中未检测到内嵌的角色卡数据 (chara)！");
        }
        parsedJson = decodeCharaData(charaStr);
        
        imgDataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(new Error("读取头像图片失败"));
          r.readAsDataURL(file);
        });
      } else if (isJson) {
        const text = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(new Error("读取 JSON 配置文件失败"));
          r.readAsText(file);
        });
        parsedJson = JSON.parse(text);
      } else {
        throw new Error("请上传 .png 角色卡图片或 .json 人设配置文件！");
      }

      const importedChar = mapSillyTavernToCharacter(parsedJson, imgDataUrl);
      
      const innerData = parsedJson.data || parsedJson;
      const characterBook = innerData.character_book || innerData.world_book || innerData.worldbook;
      
      const finishImport = (importEntries: boolean) => {
        let importedEntriesCount = 0;
        if (importEntries && characterBook && Array.isArray(characterBook.entries) && characterBook.entries.length > 0) {
          const mappedEntries = characterBook.entries.map((entry: any) => 
            mapSillyTavernEntry(entry, importedChar.id)
          );
          if (mappedEntries.length > 0 && onSaveWorldBookEntries) {
            onSaveWorldBookEntries(mappedEntries);
            importedEntriesCount = mappedEntries.length;
          }
        }

        onSaveCharacter(importedChar);

        let successMsg = `成功导入角色「${importedChar.name}」！`;
        if (importedEntriesCount > 0) {
          successMsg += `\n并自动识别并绑定导入了其附带的 ${importedEntriesCount} 条世界书词条！已链接到世界书。`;
        }
        showAlert("导入成功", successMsg);
      };

      if (characterBook && Array.isArray(characterBook.entries) && characterBook.entries.length > 0) {
        showConfirm(
          "导入关联世界书词条",
          `检测到该角色设定中包含 ${characterBook.entries.length} 条世界书关联词条，是否同时导入并关联至世界书？`,
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

    if (!avatar) {
      setErrorMsg("请先上传角色头像！");
      return;
    }
    if (!name.trim()) {
      setErrorMsg("请输入姓名！");
      return;
    }
    if (age !== "" && isNaN(Number(age))) {
      setErrorMsg("请输入正确的年龄！");
      return;
    }
    if (!personality.trim()) {
      setErrorMsg("请输入详细人设！");
      return;
    }

    const originalChar = editingId ? characters.find(c => c.id === editingId) : null;
    const savedChar: Character = {
      id: editingId || Date.now().toString(),
      name: name.trim(),
      age: age === "" ? "" : Number(age),
      gender,
      mbti,
      avatar,
      personality: personality.trim(),
      backstory: backstory.trim() || "暂无背景设定。",
      greeting: greeting.trim(),
      album: album,
      momentsCover: originalChar ? originalChar.momentsCover : undefined,
      isPinned: originalChar ? originalChar.isPinned : false,
      chatBg: originalChar ? originalChar.chatBg : undefined,
      references: originalChar ? originalChar.references : [],
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

  const handleRandomizeCover = (char: Character) => {
    const album = char.album || [];
    if (album.length === 0) return;
    const randomIndex = Math.floor(Math.random() * album.length);
    const selectedCover = album[randomIndex];
    const updatedChar = {
      ...char,
      momentsCover: selectedCover,
    };
    onSaveCharacter(updatedChar);
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

      const res = await fetch("/api/summarize-personality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          references: char.references,
          apiKey,
          model,
          apiEndpoint
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "服务器响应异常");
      }

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
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans">
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
                  <div className="absolute right-0 top-10 bg-white border border-slate-200 shadow-xl rounded-[24px] p-1.5 z-50 flex flex-col gap-0.5 min-w-[130px] animate-fade-in text-left">
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
                        accept=".png,.json"
                        onChange={(e) => {
                          setShowAddMenu(false);
                          handleCharacterImport(e);
                        }}
                        className="hidden"
                      />
                    </label>
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
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto bg-white p-5 rounded-2xl shadow-sm border border-slate-100 animate-slide-up">
            
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
                上传角色头像 <span className="text-rose-500">*</span>
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-sm font-medium"
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-sm font-medium"
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-sm font-medium"
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-sm font-medium"
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

            {/* Detailed Personality */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                详细人设 <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={5}
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="在此输入详细的人格性格设定、语气特征和交流行为惯例..."
                className="w-full px-5 py-4 rounded-[32px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs resize-none leading-relaxed font-medium"
              />
            </div>

            {/* Backstory */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                背景故事
              </label>
              <textarea
                rows={5}
                value={backstory}
                onChange={(e) => setBackstory(e.target.value)}
                placeholder="在此输入角色的来历、生活背景或各种设定细节..."
                className="w-full px-5 py-4 rounded-[32px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs resize-none leading-relaxed"
              />
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
                className="w-full px-5 py-4 rounded-[32px] bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs resize-none leading-relaxed font-semibold"
              />
            </div>

            {/* Save Button Only */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3 rounded-[32px] bg-neutral-950 hover:bg-neutral-900 text-white font-bold text-sm transition-colors flex items-center justify-center space-x-1.5 shadow-sm"
              >
                <Save className="w-4 h-4" />
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
                    <span className="px-2 py-0.5 bg-neutral-950 text-white rounded-md text-[10px] tracking-wide font-black">
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
                    <span>详细人设与口癖特征</span>
                  </h3>
                  <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded-xl border border-slate-100 font-semibold">
                    {char.personality}
                  </div>
                </div>

                {/* Backstory Card */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-neutral-800" />
                    <span>背景故事设定</span>
                  </h3>
                  <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded-xl border border-slate-100">
                    {char.backstory}
                  </div>
                </div>

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
                        className="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-950 font-semibold"
                      />
                    </div>
                    <div>
                      <textarea
                        rows={3}
                        value={newRefContent}
                        onChange={(e) => setNewRefContent(e.target.value)}
                        placeholder="请输入该角色相关的故事描述、生活日志、或是经典原著对白内容。建议多提供能反映角色性格特征或说话口癖的句子..."
                        className="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-950 resize-none leading-relaxed"
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
            {characters.length === 0 ? (
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
                {characters.map((char) => (
                  <div
                    key={char.id}
                    onClick={() => handleEdit(char)}
                    className="flex items-start bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow transition-all group relative overflow-hidden cursor-pointer hover:border-slate-300 text-left"
                  >
                    {/* Character Tag */}
                    <div className="absolute top-3 right-3 flex items-center space-x-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                      <span className="px-1.5 py-0.5 bg-neutral-950 text-white text-[10px] font-bold rounded-md">
                        {char.mbti}
                      </span>
                      <span className="px-1.5 py-0.5 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-md">
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
