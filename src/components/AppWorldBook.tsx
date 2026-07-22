import React, { useState, useEffect } from "react";
import { WorldBookEntry, Character } from "../types";
import { Plus, Trash2, Edit, Search, ChevronLeft, Save, BookOpen, Layers, Globe, User, X, Key, Zap, Link2, ChevronDown, ChevronRight } from "lucide-react";
import { parsePngChunks, decodeCharaData, mapSillyTavernEntry, parseTextToWorldBookEntries, safeParseDocx } from "../utils/pngParser";
import { buildUniqueCharacterOptions } from "../domain/worldbook/characterOptions";

export const parseWorldBookEntryItem = (e: any, defaultCharId?: string): WorldBookEntry | null => {
  if (!e || typeof e !== "object") return null;

  // Extract content
  let content = e.content || e.text || e.value || "";
  if (typeof content !== "string") {
    content = JSON.stringify(content, null, 2);
  }
  if (!content.trim()) return null;

  // Title
  let title = e.comment || e.title || e.name || "";
  if (!title.trim()) {
    const keysArray = e.keys || e.key || [];
    if (Array.isArray(keysArray) && keysArray.length > 0) {
      title = keysArray[0];
    } else if (typeof keysArray === "string" && keysArray.trim()) {
      title = keysArray.split(/[,，]/)[0];
    } else {
      title = "未命名词条";
    }
  }

  // Keywords
  let keywords = "";
  const rawKeys = e.keys || e.key || "";
  if (Array.isArray(rawKeys)) {
    keywords = rawKeys.join(",");
  } else if (typeof rawKeys === "string") {
    keywords = rawKeys;
  }

  // Trigger Type
  let triggerType: "keys" | "constant" | "vector" = "keys";
  if (e.constant === true || e.always_active === true) {
    triggerType = "constant";
  } else if (e.vector === true || e.selective === true || e.triggerType === "vector") {
    triggerType = "vector";
  } else if (e.triggerType === "constant") {
    triggerType = "constant";
  }

  // Position Mapping (Requirement 4: author notes to approximate after character definition)
  let position: "after_main_prompt" | "before_char_def" | "after_char_def" | "before_chat_history" = "after_char_def";
  const rawPos = e.position;
  if (typeof rawPos === "string") {
    const lp = rawPos.toLowerCase();
    if (lp.includes("system") || lp.includes("main") || lp.includes("first")) {
      position = "after_main_prompt";
    } else if (lp.includes("before_char")) {
      position = "before_char_def";
    } else if (lp.includes("after_char")) {
      position = "after_char_def";
    } else if (lp.includes("an") || lp.includes("author") || lp.includes("note")) {
      position = "after_char_def";
    } else if (lp.includes("history") || lp.includes("chat")) {
      position = "before_chat_history";
    }
  } else if (typeof rawPos === "number") {
    if (rawPos === 0) position = "before_char_def";
    else if (rawPos === 1) position = "after_char_def";
    else if (rawPos === 2 || rawPos === 3) position = "after_char_def";
    else if (rawPos === 4) position = "before_chat_history";
    else position = "after_main_prompt";
  } else if (e.position) {
    position = e.position;
  }

  // Depth (1-15)
  let depth = 5;
  const rawDepth = e.insertion_order !== undefined ? e.insertion_order : (e.depth !== undefined ? e.depth : 5);
  if (typeof rawDepth === "number") {
    depth = Math.min(15, Math.max(1, rawDepth));
  } else if (e.depth !== undefined) {
    depth = Math.min(15, Math.max(1, Number(e.depth)));
  }

  // Active status
  let isActive = true;
  if (e.enabled === false || e.isActive === false || e.active === false) {
    isActive = false;
  }

  let characterId = defaultCharId || "global";
  if (e.characterId) {
    characterId = e.characterId;
  } else if (e.global === true || e.bindingType === "global") {
    characterId = "global";
  }

  return {
    id: "wb-import-" + Date.now() + "-" + Math.floor(Math.random() * 100000),
    title,
    category: "常规",
    content,
    timestamp: Date.now(),
    characterId,
    triggerType,
    keywords,
    isActive,
    position,
    depth,
  };
};

export const parseWorldBookImport = (json: any): WorldBookEntry[] => {
  const entries: WorldBookEntry[] = [];
  let rawEntries: any[] = [];

  if (Array.isArray(json)) {
    rawEntries = json;
  } else if (json && typeof json === "object") {
    const mwb = json.mountedWorldbooks || json.mounted_worldbooks || json.mounted_world_books || (json.data && (json.data.mountedWorldbooks || json.data.mounted_worldbooks || json.data.mounted_world_books));
    if (mwb && Array.isArray(mwb)) {
      rawEntries = mwb;
    } else if (Array.isArray(json.entries)) {
      rawEntries = json.entries;
    } else if (json.entries && typeof json.entries === "object") {
      rawEntries = Object.values(json.entries);
    } else {
      const possibleArrays = Object.values(json).filter(val => Array.isArray(val));
      if (possibleArrays.length > 0) {
        rawEntries = possibleArrays[0] as any[];
      } else {
        rawEntries = [json];
      }
    }
  }

  rawEntries.forEach((item) => {
    const entry = parseWorldBookEntryItem(item, "global");
    if (entry) {
      entries.push(entry);
    }
  });

  return entries;
};

interface AppWorldBookProps {
  entries: WorldBookEntry[];
  characters?: Character[];
  onSaveEntry: (entry: WorldBookEntry) => void;
  onSaveEntries?: (entries: WorldBookEntry[]) => void;
  onDeleteEntry: (id: string) => void;
  onClose: () => void;
}

export default function AppWorldBook({
  entries,
  characters = [],
  onSaveEntry,
  onSaveEntries,
  onDeleteEntry,
  onClose,
}: AppWorldBookProps) {
  const characterOptions = buildUniqueCharacterOptions(characters);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBinding, setSelectedBinding] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("worldbook_collapsed_categories");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("worldbook_collapsed_categories", JSON.stringify(collapsedCategories));
    } catch (e) {
      console.error(e);
    }
  }, [collapsedCategories]);

  const [showAddMenu, setShowAddMenu] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  // Category Edit and Delete States & Handlers
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(null);
  const [newCategoryNameInput, setNewCategoryNameInput] = useState("");

  const handleRenameCategory = (oldName: string, newName: string) => {
    const trimmedNewName = newName.trim();
    if (!trimmedNewName) {
      showAlert("提示", "分组名称不能为空！");
      return;
    }
    if (oldName === trimmedNewName) {
      setEditingCategoryName(null);
      return;
    }

    const affectedEntries = entries.filter(e => (e.category || "常规") === oldName);
    const updatedEntries = affectedEntries.map(e => ({
      ...e,
      category: trimmedNewName
    }));

    if (onSaveEntries) {
      onSaveEntries(updatedEntries);
    } else {
      updatedEntries.forEach(onSaveEntry);
    }

    setCollapsedCategories(prev => {
      const copy = { ...prev };
      if (copy[oldName] !== undefined) {
        copy[trimmedNewName] = copy[oldName];
        delete copy[oldName];
      }
      return copy;
    });

    setEditingCategoryName(null);
    showAlert("成功", `已成功将分组“${oldName}”重命名为“${trimmedNewName}”！`);
  };

  const handleDeleteCategory = (catName: string) => {
    const affectedEntries = entries.filter(e => (e.category || "常规") === catName);
    if (affectedEntries.length === 0) {
      showConfirm(
        "删除分组",
        `确定要删除分组“${catName}”吗？此操作无法撤销。`,
        () => {
          // No entries to delete, just close or clear collapsedCategories state
          setCollapsedCategories(prev => {
            const copy = { ...prev };
            delete copy[catName];
            return copy;
          });
        }
      );
      return;
    }

    showConfirm(
      "删除分组及词条",
      `确定要删除分组“${catName}”吗？这将会删除该分组下的所有 ${affectedEntries.length} 个词条设定！此操作无法撤销。`,
      () => {
        affectedEntries.forEach(e => onDeleteEntry(e.id));
        setCollapsedCategories(prev => {
          const copy = { ...prev };
          delete copy[catName];
          return copy;
        });
      }
    );
  };

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
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("常规");
  const [content, setContent] = useState("");
  const [bindingType, setBindingType] = useState<"global" | "character">("global");
  const [boundCharacterId, setBoundCharacterId] = useState<string>("");
  const [triggerType, setTriggerType] = useState<"keys" | "constant" | "vector">("keys");
  const [keywords, setKeywords] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [position, setPosition] = useState<"after_main_prompt" | "before_char_def" | "after_char_def" | "before_chat_history">("after_char_def");
  const [depth, setDepth] = useState<number>(5);
  const [formError, setFormError] = useState("");
  const [isCreatingNewCategory, setIsCreatingNewCategory] = useState(false);

  const resetForm = () => {
    setTitle("");
    setContent("");
    setCategory("常规");
    setBindingType("global");
    setBoundCharacterId(characters[0]?.id || "");
    setTriggerType("keys");
    setKeywords("");
    setIsActive(true);
    setPosition("after_char_def");
    setDepth(5);
    setFormError("");
    setEditingId(null);
    setIsEditing(false);
    setIsCreatingNewCategory(false);
  };

  const handleEdit = (entry: WorldBookEntry) => {
    setEditingId(entry.id);
    setTitle(entry.title);
    setCategory(entry.category || "常规");
    setContent(entry.content);
    if (entry.characterId && entry.characterId !== "global") {
      setBindingType("character");
      setBoundCharacterId(entry.characterId);
    } else {
      setBindingType("global");
      setBoundCharacterId("");
    }
    setTriggerType(entry.triggerType || "keys");
    setKeywords(entry.keywords || "");
    setIsActive(entry.isActive !== false);
    setPosition(entry.position || "after_char_def");
    setDepth(entry.depth || 5);
    setFormError("");
    setIsEditing(true);
    setIsCreatingNewCategory(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!title.trim() || !content.trim()) {
      setFormError("请填写词条名称和设定内容");
      return;
    }

    if (triggerType === "keys" && !keywords.trim()) {
      setFormError("选择关键词触发条件时，必须添加关键词内容！");
      return;
    }

    const newEntry: WorldBookEntry = {
      id: editingId || Date.now().toString(),
      title: title.trim(),
      category: category.trim() || "常规",
      content: content.trim(),
      timestamp: Date.now(),
      characterId: bindingType === "global" ? "global" : boundCharacterId,
      triggerType,
      keywords: triggerType === "keys" ? keywords.trim() : "",
      isActive,
      position,
      depth,
    };

    onSaveEntry(newEntry);
    resetForm();
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const isPng = file.name.toLowerCase().endsWith(".png");
      const isJson = file.name.toLowerCase().endsWith(".json");
      const isTxt = file.name.toLowerCase().endsWith(".txt");
      const isDocx = file.name.toLowerCase().endsWith(".docx");

      let imported: WorldBookEntry[] = [];

      if (isPng) {
        const charaStr = await parsePngChunks(file);
        if (!charaStr) {
          throw new Error("此 PNG 图片中未检测到内嵌的角色卡数据！");
        }
        const parsedJson = decodeCharaData(charaStr);
        const innerData = parsedJson.data || parsedJson;
        const charName = innerData.name || "";
        const characterBook = innerData.character_book || innerData.world_book || innerData.worldbook;
        if (characterBook && Array.isArray(characterBook.entries)) {
          imported = characterBook.entries.map((entry: any) => {
            const mapped = mapSillyTavernEntry(entry, "global");
            if (mapped && charName) {
              mapped.category = `${charName}世界书`;
            }
            return mapped;
          }).filter(Boolean);
        } else {
          throw new Error("该 PNG 角色卡中不包含任何世界书 (character_book) 词条设定。");
        }
      } else if (isJson) {
        const text = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(new Error("读取 JSON 失败"));
          r.readAsText(file);
        });
        const parsedJson = JSON.parse(text);
        const innerData = parsedJson.data || parsedJson;
        const charName = innerData.name || "";
        let characterBook = innerData.character_book || innerData.world_book || innerData.worldbook;
        const mwb = innerData.mountedWorldbooks || innerData.mounted_worldbooks || innerData.mounted_world_books || parsedJson.mountedWorldbooks || parsedJson.mounted_worldbooks || parsedJson.mounted_world_books;
        if (mwb && Array.isArray(mwb)) {
          characterBook = { entries: mwb };
        }
        if (characterBook && Array.isArray(characterBook.entries)) {
          imported = characterBook.entries.map((entry: any) => {
            const mapped = mapSillyTavernEntry(entry, "global");
            if (mapped && charName) {
              mapped.category = `${charName}世界书`;
            }
            return mapped;
          }).filter(Boolean);
        } else {
          imported = parseWorldBookImport(parsedJson);
        }
      } else if (isTxt) {
        const text = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(new Error("读取 TXT 失败"));
          r.readAsText(file);
        });
        imported = parseTextToWorldBookEntries(text, file.name);
      } else if (isDocx) {
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as ArrayBuffer);
          r.onerror = () => reject(new Error("读取 DOCX 失败"));
          r.readAsArrayBuffer(file);
        });
        const text = await safeParseDocx(arrayBuffer);
        imported = parseTextToWorldBookEntries(text, file.name);
      } else {
        throw new Error("请上传 .json 配置文件、.png 角色卡、.txt 或 .docx 文档文件！");
      }

      if (imported.length > 0) {
        if (onSaveEntries) {
          onSaveEntries(imported);
        } else {
          imported.forEach((entry) => onSaveEntry(entry));
        }
        showAlert("导入成功", `成功识别并导入 ${imported.length} 条世界书词条！`);
      } else {
        showAlert("导入提示", "未能在此文件中识别出任何有效的世界书设定词条。");
      }
    } catch (err: any) {
      console.error(err);
      showAlert("导入失败", err.message || "文件导入解析失败，请检查文件格式。");
    } finally {
      e.target.value = "";
    }
  };

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.content.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Binding matches
    let matchesBinding = true;
    if (selectedBinding === "global") {
      matchesBinding = !entry.characterId || entry.characterId === "global";
    } else if (selectedBinding) {
      matchesBinding = entry.characterId === selectedBinding;
    }

    return matchesSearch && matchesBinding;
  });

  return (
    <div className="flex flex-col h-full bg-stone-50 text-stone-800 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-transparent z-10 shrink-0 relative">
        <button
          onClick={isEditing ? resetForm : onClose}
          className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
          id="worldbook_back_btn"
        >
          <ChevronLeft className="w-4 h-4 text-slate-700" />
        </button>
        
        <h1 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">
          <span>{isEditing ? (editingId ? "修改词条" : "新建词条") : "世界书"}</span>
        </h1>

        <div className="w-8 h-8 flex items-center justify-end z-10">
          {!isEditing ? (
            <div className="relative">
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="w-8 h-8 bg-neutral-950 hover:bg-neutral-900 text-white rounded-full transition-colors shadow flex items-center justify-center"
                id="worldbook_add_btn"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
              {showAddMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                  <div className="absolute right-0 top-10 bg-white border border-stone-200 shadow-xl rounded-[12px] p-1.5 z-50 flex flex-col gap-0.5 min-w-[130px] animate-fade-in text-left">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddMenu(false);
                        resetForm();
                        setIsEditing(true);
                      }}
                      className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-100 rounded-[16px] transition-colors text-left w-full"
                    >
                      <Plus className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                      <span>新建词条</span>
                    </button>
                    <label className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-100 rounded-[16px] transition-colors cursor-pointer text-left w-full">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>导入设定</span>
                      <input
                        type="file"
                        accept=".png,.json,.txt,.docx"
                        onChange={(e) => {
                          setShowAddMenu(false);
                          handleFileImport(e);
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                </>
              )}
            </div>
          ) : (
            editingId && (
              <button
                type="button"
                onClick={() => {
                  showConfirm(
                    "删除世界书词条",
                    "确定要删除这条世界书设定吗？此操作无法撤销！",
                    () => {
                      onDeleteEntry(editingId);
                      resetForm();
                    }
                  );
                }}
                className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center hover:bg-rose-100 border border-rose-100 transition-colors"
                title="删除词条"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto bg-white p-5 rounded-xl shadow-sm border border-stone-200/40 animate-fade-in">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium animate-fade-in text-left">
                ⚠️ {formError}
              </div>
            )}

            <div className="divide-y divide-stone-100">
              {/* 1. Name */}
              <div className="py-3.5 space-y-1.5 text-left">
                <label className="text-xs font-extrabold text-stone-600">词条名称</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="如: 修真界、奥术核心"
                  className="w-full px-3 py-2 rounded-[8px] bg-stone-50/50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs font-semibold"
                />
              </div>

              {/* 1.5 Group Settings */}
              <div className="py-3.5 space-y-1.5 text-left">
                <label className="text-xs font-extrabold text-stone-600">分组设置</label>
                {isCreatingNewCategory ? (
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="输入新分组名称，如: 地理、魔法"
                      className="w-full px-3 py-2 rounded-[8px] bg-stone-50/50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingNewCategory(false);
                        setCategory("常规");
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-500 hover:text-stone-700 font-extrabold"
                    >
                      返回选择
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    {(() => {
                      const uniqueCategories = Array.from(new Set(entries.map(e => e.category || "常规")))
                        .map(c => c.trim())
                        .filter(Boolean);

                      if (!uniqueCategories.includes("常规")) {
                        uniqueCategories.unshift("常规");
                      }

                      const selectValue = uniqueCategories.includes(category) ? category : (category === "" ? "__new_group__" : "custom_input");

                      return (
                        <>
                          <select
                            value={selectValue}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "__new_group__") {
                                setIsCreatingNewCategory(true);
                                setCategory("");
                              } else {
                                setCategory(val);
                              }
                            }}
                            className="w-full pl-3 pr-8 py-2 rounded-[8px] bg-stone-50/50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs font-extrabold text-stone-700 appearance-none cursor-pointer"
                          >
                            {uniqueCategories.map(cat => (
                              <option key={cat} value={cat}>
                                {cat === "常规" ? "常规 (默认)" : cat}
                              </option>
                            ))}
                            {selectValue === "custom_input" && (
                              <option value="custom_input">{category}</option>
                            )}
                            <option value="__new_group__" className="text-indigo-600 font-bold">
                              + 新建分组
                            </option>
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-stone-400">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* 2. Binding Scope */}
              <div className="py-3.5 space-y-2 text-left">
                <label className="text-xs font-extrabold text-stone-600">生效范围</label>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBindingType("global")}
                      className={`py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                        bindingType === "global"
                          ? "bg-neutral-950 border-neutral-950 !text-white shadow-xs"
                          : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"
                      }`}
                    >
                      全局生效
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBindingType("character");
                        if (!boundCharacterId && characters.length > 0) {
                          setBoundCharacterId(characters[0].id);
                        }
                      }}
                      className={`py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                        bindingType === "character"
                          ? "bg-neutral-950 border-neutral-950 !text-white shadow-xs"
                          : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"
                      }`}
                    >
                      特定角色专属
                    </button>
                  </div>

                  {/* Target Character (conditional row) */}
                  {bindingType === "character" && characters.length > 0 && (
                    <div className="rounded-xl border border-stone-200 bg-stone-50/30 p-2.5 space-y-1 animate-fade-in">
                      <label className="text-[10px] font-extrabold text-stone-400">选择绑定的专属角色</label>
                      <div className="relative">
                        <select
                          value={boundCharacterId}
                          onChange={(e) => setBoundCharacterId(e.target.value)}
                          className="w-full pl-3 pr-8 py-1.5 rounded-[8px] bg-white border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs font-semibold appearance-none cursor-pointer"
                        >
                          {characterOptions.map(({ id, label }) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-stone-400">
                          <ChevronDown className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Trigger Condition */}
              <div className="py-3.5 space-y-2 text-left">
                <label className="text-xs font-extrabold text-stone-600">触发类型</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTriggerType("keys")}
                    className={`py-2 rounded-xl text-xs font-extrabold border transition-all ${
                      triggerType === "keys"
                        ? "bg-neutral-950 border-neutral-950 !text-white shadow-xs"
                        : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100"
                    }`}
                  >
                    关键词
                  </button>
                  <button
                    type="button"
                    onClick={() => setTriggerType("constant")}
                    className={`py-2 rounded-xl text-xs font-extrabold border transition-all ${
                      triggerType === "constant"
                        ? "bg-neutral-950 border-neutral-950 !text-white shadow-xs"
                        : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100"
                    }`}
                  >
                    常驻
                  </button>
                  <button
                    type="button"
                    onClick={() => setTriggerType("vector")}
                    className={`py-2 rounded-xl text-xs font-extrabold border transition-all ${
                      triggerType === "vector"
                        ? "bg-neutral-950 border-neutral-950 !text-white shadow-xs"
                        : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100"
                    }`}
                  >
                    向量化
                  </button>
                </div>

                {/* UX Guidance on Constant vs Triggered entries and Habitual Speech (口癖) Setup */}
                <div className="mt-2.5 p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200/50 space-y-2 text-[11px] text-stone-500 leading-relaxed font-semibold">
                  {triggerType === "keys" && (
                    <p>
                      <span className="text-neutral-900 font-bold">✨ 关键词触发：</span>
                      仅当上下文聊天（最新2-3轮对话）中包含触发词时临时装载词条。适合绑定特定的背景秘密、特殊事件、特定道具、地理名词解释，保持 AI 上下文记忆的极度精简与高效。
                    </p>
                  )}
                  {triggerType === "constant" && (
                    <div className="space-y-2">
                      <p>
                        <span className="text-neutral-900 font-bold">✨ 常驻设定：</span>
                        只要角色配对正确，此设定都会100%强制在每次对话时装载，不受聊天内容影响。具有绝对、最高优先级别的逻辑引导。
                      </p>
                    </div>
                  )}
                  {triggerType === "vector" && (
                    <p>
                      <span className="text-neutral-900 font-bold">✨ 向量化关联：</span>
                      基于词条标题与聊天上下文的模糊语义相关度进行相似匹配。适合大规模小说、修真或庞大世界观，避免无关信息撑爆 AI 上下文。
                    </p>
                  )}
                </div>
              </div>

              {/* Keywords Input (conditional row) */}
              {triggerType === "keys" && (
                <div className="py-3.5 space-y-1.5 text-left animate-fade-in">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-stone-500">└ 触发关键词 (中英文逗号隔开)</label>
                    <span className="text-[10px] text-stone-400 font-medium">满足任一即触发</span>
                  </div>
                  <input
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="例如: 修真界, 飞升, 洞天福地"
                    className="w-full px-3 py-2 rounded-[8px] bg-stone-50/50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs font-medium"
                  />
                </div>
              )}

              {/* 3.5 Insertion Position */}
              <div className="py-3.5 space-y-1.5 text-left">
                <label className="text-xs font-extrabold text-stone-600">插入位置</label>
                <div className="relative">
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as any)}
                    className="w-full pl-3 pr-8 py-2 rounded-[8px] bg-stone-50/50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs font-extrabold text-stone-700 appearance-none cursor-pointer"
                  >
                    <option value="after_main_prompt">主提示词后 (System Prompt 之后)</option>
                    <option value="before_char_def">角色定义前 (人设 Profile 之前)</option>
                    <option value="after_char_def">角色定义后 (人设 Profile 之后)</option>
                    <option value="before_chat_history">聊天历史前 (聊天记录之上)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-stone-400">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* Depth Slider */}
              <div className="py-3.5 space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-stone-600">拼接深度 (装载优先级)</label>
                  <span className="text-xs font-extrabold text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
                    深度 {depth}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="15"
                    value={depth}
                    onChange={(e) => setDepth(parseInt(e.target.value))}
                    className="w-full accent-neutral-950 cursor-pointer h-1.5 bg-stone-200 rounded-lg appearance-none"
                  />
                </div>
              </div>

              {/* 4. Content Textarea */}
              <div className="py-3.5 space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-stone-600">设定详述内容</label>
                  <span className="text-[10px] font-semibold text-stone-400">支持纯文本 / JSON</span>
                </div>
                <textarea
                  required
                  rows={5}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="在此详述该地理、人物、组织、科学/魔法法则。支持纯文本，或粘贴 JSON 格式设定内容..."
                  className="w-full px-5 py-4 rounded-[8px] bg-stone-50/50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs resize-none leading-relaxed text-left font-medium"
                />
              </div>

              {/* 6. Active Toggle Switch - KEEP SINGLE ROW, PLACED AFTER CONTENT */}
              <div className="flex items-center justify-between py-3.5 text-left w-full">
                <label className="text-xs font-extrabold text-stone-600">启用此词条设定</label>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isActive ? "bg-emerald-500" : "bg-stone-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                      isActive ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-neutral-950 hover:bg-neutral-900 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-1.5 shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>保存设定</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Search and Binding Filters */}
            <div className="space-y-3.5 max-w-md mx-auto">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-stone-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索词条名称或设定细节..."
                  className="w-full pl-9 pr-4 py-2 bg-white rounded-[8px] border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs text-stone-800"
                />
              </div>

              {/* Binding Scope Filter Tags */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
                <button
                  onClick={() => setSelectedBinding(null)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all border ${
                    !selectedBinding
                      ? "bg-neutral-950 border-neutral-950 text-white shadow-sm"
                      : "bg-white border-stone-200 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  全部范围
                </button>
                <button
                  onClick={() => setSelectedBinding("global")}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                    selectedBinding === "global"
                      ? "bg-neutral-950 border-neutral-950 text-white shadow-sm"
                      : "bg-white border-stone-200 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  <span>全局生效</span>
                </button>
                {characterOptions.map(({ id, label, character: char }) => (
                  <button
                     key={id}
                     onClick={() => setSelectedBinding(id)}
                     className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                       selectedBinding === id
                         ? "bg-neutral-950 border-neutral-950 text-white shadow-sm"
                         : "bg-white border-stone-200 text-stone-600 hover:bg-stone-100"
                     }`}
                  >
                    <img src={char.avatar} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Entries list */}
            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-2xl border border-stone-200/50">
                <div className="w-14 h-14 bg-neutral-100 rounded-full flex items-center justify-center mb-4 text-neutral-850 border border-neutral-200">
                  <Layers className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-bold text-stone-700">没有查到相关记载</h3>
                <p className="text-xs text-stone-400 mt-1 max-w-xs leading-relaxed">
                  目前世界书中暂无对应词条，您可以点击右上角 “+” 自行记录该世界观下的规则、组织、秘闻或道具细节设定！
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-w-md mx-auto">
                {(() => {
                  // Group filteredEntries by category
                  const grouped: Record<string, WorldBookEntry[]> = {};
                  filteredEntries.forEach((entry) => {
                    const cat = entry.category || "常规";
                    if (!grouped[cat]) {
                      grouped[cat] = [];
                    }
                    grouped[cat].push(entry);
                  });

                  // We sort category names so "常规" is usually first, and the rest alphabetically
                  const categories = Object.keys(grouped).sort((a, b) => {
                    if (a === "常规") return -1;
                    if (b === "常规") return 1;
                    return a.localeCompare(b, "zh");
                  });

                  return categories.map((catName) => {
                    const groupEntries = grouped[catName];
                    const isCollapsed = collapsedCategories[catName] || false;

                    return (
                      <div key={catName} className="space-y-2">
                        {/* Collapsible Category Header with Actions */}
                        <div className="w-full flex items-center justify-between px-1.5 py-1 transition-colors select-none">
                          <button
                            type="button"
                            onClick={() => {
                              setCollapsedCategories((prev) => ({
                                ...prev,
                                [catName]: !prev[catName],
                              }));
                            }}
                            className="flex items-center gap-1.5 min-w-0 flex-1 py-1 text-left cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4 text-stone-500 shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-stone-500 shrink-0" />
                            )}
                            <span className="text-xs font-extrabold text-stone-600 truncate">
                              {catName}
                            </span>
                            <span className="text-[10px] text-stone-500 bg-stone-200/50 px-1.5 py-0.5 rounded-md font-bold shrink-0">
                              {groupEntries.length}
                            </span>
                          </button>

                          <div className="flex items-center gap-1 text-stone-500 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCategoryName(catName);
                                setNewCategoryNameInput(catName);
                              }}
                              className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-700 transition-colors"
                              title="重命名分组"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCategory(catName);
                              }}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-stone-400 hover:text-rose-600 transition-colors"
                              title="删除分组及词条"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Content */}
                        {!isCollapsed && (
                          <div className="space-y-2 animate-fade-in pl-0.5">
                            {groupEntries.map((entry) => {
                              // Find character bind info
                              const isGlobal = !entry.characterId || entry.characterId === "global";
                              const boundChar = !isGlobal ? characters.find((c) => c.id === entry.characterId) : null;
                              const isActive = entry.isActive !== false;

                              return (
                                <div
                                  key={entry.id}
                                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl border transition-all ${
                                    isActive
                                      ? "bg-white border-stone-200/60 shadow-sm hover:border-stone-300"
                                      : "bg-stone-50/70 border-stone-200/40 opacity-75"
                                  }`}
                                >
                                  {/* Left: Trigger Icon + Title */}
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    {/* 1. Trigger Condition Icon */}
                                    <div
                                      className="w-8 h-8 flex items-center justify-center text-stone-400 shrink-0"
                                      title={
                                        entry.triggerType === "constant"
                                          ? "常驻无条件生效"
                                          : entry.triggerType === "vector"
                                          ? "向量化语义匹配"
                                          : `关键词触发: ${entry.keywords || entry.title}`
                                      }
                                    >
                                      {entry.triggerType === "constant" ? (
                                        <Zap className="w-3.5 h-3.5 shrink-0" />
                                      ) : entry.triggerType === "vector" ? (
                                        <Layers className="w-3.5 h-3.5 shrink-0" />
                                      ) : (
                                        <Key className="w-3.5 h-3.5 shrink-0" />
                                      )}
                                    </div>

                                    {/* 2. Template Name */}
                                    <span
                                      className={`text-xs md:text-sm font-bold text-stone-800 truncate select-none ${
                                        !isActive ? "line-through text-stone-400" : ""
                                      }`}
                                      title={entry.title}
                                    >
                                      {entry.title}
                                    </span>
                                  </div>

                                  {/* Right: Actions and Link */}
                                  <div className="flex items-center gap-2.5 shrink-0">
                                    {/* 3. Link Icon (Hide if global, show link icon only if bound) */}
                                    {!isGlobal && boundChar && (
                                      <div
                                        className="w-8 h-8 flex items-center justify-center text-stone-400 shrink-0"
                                        title={`绑定专属角色: ${boundChar.name}`}
                                      >
                                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                                      </div>
                                    )}

                                    {/* 4. Edit Button */}
                                    <button
                                      type="button"
                                      onClick={() => handleEdit(entry)}
                                      className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-full transition-colors shrink-0"
                                      title="编辑词条设定"
                                    >
                                      <Edit className="w-3.5 h-3.5 shrink-0" />
                                    </button>

                                    {/* 5. Active Toggle Switch */}
                                    <button
                                      type="button"
                                      onClick={() => onSaveEntry({ ...entry, isActive: !isActive })}
                                      className={`relative inline-flex h-4 w-7.5 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none shrink-0 ${
                                        isActive ? "bg-emerald-500" : "bg-stone-300"
                                      }`}
                                      title={isActive ? "已启用此词条" : "已禁用此词条"}
                                    >
                                      <span
                                        className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                                          isActive ? "translate-x-3.5" : "translate-x-0"
                                        }`}
                                      />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
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

      {editingCategoryName && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRenameCategory(editingCategoryName, newCategoryNameInput);
            }}
            className="bg-white w-full max-w-xs rounded-[32px] p-6 border border-slate-100 shadow-2xl text-center space-y-4"
          >
            <h3 className="text-base font-bold text-slate-800">重命名分组</h3>
            <div className="space-y-1.5 text-left">
              <label className="text-[10px] font-extrabold text-stone-500">分组名称</label>
              <input
                type="text"
                required
                value={newCategoryNameInput}
                onChange={(e) => setNewCategoryNameInput(e.target.value)}
                placeholder="输入新的分组名称"
                className="w-full px-3.5 py-2.5 rounded-[8px] bg-stone-50/50 border border-stone-200 focus:outline-none focus:ring-2 focus:ring-neutral-950 text-xs font-semibold"
                autoFocus
              />
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEditingCategoryName(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-bold transition-all"
              >
                取消
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-neutral-950 hover:bg-neutral-900 text-white rounded-full text-xs font-bold transition-all"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
