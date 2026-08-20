import React, { useState, useEffect, useRef } from "react";
import {
  ChevronLeft, 
  Search, 
  Plus, 
  Trash2, 
  Check, 
  StickyNote, 
  ClipboardList, 
  Clock, 
  X, 
  Save, 
  CheckSquare,
} from "lucide-react";
import { readString, remove as removeStoredValue, writeJson } from "../core/storage/storageAdapter";
import { readArray } from "../core/storage/repositories/repositoryUtils";

interface Note {
  id: string;
  title: string;
  content: string;
  timestamp: number;
}

interface Todo {
  id: string;
  text: string;
  checked: boolean;
}

interface AppNotesProps {
  onClose: () => void;
}

const SEED_NOTES: Note[] = [];

const SEED_TODOS: Todo[] = [];

export default function AppNotes({ onClose }: AppNotesProps) {
  // Navigation: "notes" or "todo"
  const [activeTab, setActiveTab] = useState<"notes" | "todo">(() => {
    const savedTab = readString("memo_active_tab").value;
    removeStoredValue("memo_active_tab"); // consume once
    return (savedTab === "todo" ? "todo" : "notes");
  });

  // Notes state
  const [notes, setNotes] = useState<Note[]>(() => readArray<Note>("phone_memo_notes", SEED_NOTES).value);

  // Todos state (shared with TodoWidget!)
  const [todos, setTodos] = useState<Todo[]>(() => readArray<Todo>("phone_memo_todos", SEED_TODOS).value);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  
  // New Note fields
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");

  // New Todo fields
  const [newTodoText, setNewTodoText] = useState("");
  const [isAddingTodo, setIsAddingTodo] = useState(false);
  const todoInputRef = useRef<HTMLInputElement>(null);

  // Auto open todo creator if triggered from widget
  useEffect(() => {
    const triggerEdit = readString("memo_open_todo_edit").value;
    if (triggerEdit === "true" && activeTab === "todo") {
      setIsAddingTodo(true);
      removeStoredValue("memo_open_todo_edit"); // consume
      setTimeout(() => {
        todoInputRef.current?.focus();
      }, 300);
    }
  }, [activeTab]);

  // Persist notes
  useEffect(() => {
    writeJson("phone_memo_notes", notes);
  }, [notes]);

  // Persist todos
  useEffect(() => {
    writeJson("phone_memo_todos", todos);
  }, [todos]);

  // Handle Note Save (Create or Update)
  const handleSaveNote = () => {
    if (!noteTitle.trim() && !noteContent.trim()) return;

    if (currentNote) {
      // Update
      const updated = notes.map((n) => 
        n.id === currentNote.id 
          ? { ...n, title: noteTitle || "无标题笔记", content: noteContent, timestamp: Date.now() }
          : n
      );
      setNotes(updated);
    } else {
      // Create new
      const newNote: Note = {
        id: "note-" + Date.now().toString(),
        title: noteTitle.trim() || "无标题笔记",
        content: noteContent,
        timestamp: Date.now()
      };
      setNotes([newNote, ...notes]);
    }

    // Reset fields & close editor
    setIsEditingNote(false);
    setCurrentNote(null);
    setNoteTitle("");
    setNoteContent("");
  };

  const handleOpenEditNote = (note: Note) => {
    setCurrentNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setIsEditingNote(true);
  };

  const handleOpenCreateNote = () => {
    setCurrentNote(null);
    setNoteTitle("");
    setNoteContent("");
    setIsEditingNote(true);
  };

  const handleDeleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotes(notes.filter((n) => n.id !== id));
    if (currentNote?.id === id) {
      setIsEditingNote(false);
      setCurrentNote(null);
    }
  };

  // Todo Operations
  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;

    const newTodo: Todo = {
      id: "todo-" + Date.now().toString(),
      text: newTodoText.trim(),
      checked: false
    };

    setTodos([newTodo, ...todos]);
    setNewTodoText("");
    setIsAddingTodo(false);
  };

  const handleToggleTodo = (id: string) => {
    setTodos(todos.map((t) => (t.id === id ? { ...t, checked: !t.checked } : t)));
  };

  const handleDeleteTodo = (id: string) => {
    setTodos(todos.filter((t) => t.id !== id));
  };

  const handleClearCompletedTodos = () => {
    setTodos(todos.filter((t) => !t.checked));
  };

  // Search filter
  const filteredNotes = notes.filter((note) => 
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const completedCount = todos.filter((t) => t.checked).length;
  const progressPercent = todos.length > 0 ? Math.round((completedCount / todos.length) * 100) : 0;

  return (
    <div data-theme-page="notes" className="flex flex-col h-full bg-[var(--app-bg)] text-[var(--text-primary)] font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-transparent z-10 shrink-0 relative">
        <button
          onClick={isEditingNote ? () => setIsEditingNote(false) : onClose}
          className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors z-10 shrink-0"
          title="返回"
        >
          <ChevronLeft className="w-4 h-4 text-slate-700" />
        </button>
        
        <h1 className="text-base font-bold text-slate-800 tracking-tight absolute left-1/2 -translate-x-1/2 w-max">
          {isEditingNote ? (currentNote ? "编辑笔记" : "新建笔记") : "备忘录"}
        </h1>

        <div className="w-8 h-8 flex items-center justify-end z-10">
          {isEditingNote ? (
            <button 
              onClick={handleSaveNote}
              className="w-8 h-8 rounded-full bg-neutral-950 hover:bg-neutral-900 text-white transition-all flex items-center justify-center shadow-sm"
              title="保存"
            >
              <Save className="w-4 h-4" />
            </button>
          ) : (
            activeTab === "notes" && (
              <button 
                onClick={handleOpenCreateNote}
                className="w-8 h-8 bg-neutral-950 hover:bg-neutral-900 text-white rounded-full transition-colors flex items-center justify-center shadow-sm"
                title="新建笔记"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Tabs bar */}
      {!isEditingNote && (
        <div className="flex bg-white border-b border-slate-100 py-2 px-4 justify-around shrink-0 z-10 text-xs font-bold">
          <button
            onClick={() => setActiveTab("notes")}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === "notes" ? "bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm" : "text-[var(--tab-inactive-text)] hover:text-[var(--text-primary)]"
            }`}
          >
            <StickyNote className="w-4 h-4" />
            <span>笔记 ({notes.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("todo")}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-2 ${
              activeTab === "todo" ? "bg-[var(--tab-active-bg)] text-[var(--tab-active-text)] shadow-sm" : "text-[var(--tab-inactive-text)] hover:text-[var(--text-primary)]"
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>待办 ({todos.length})</span>
          </button>
        </div>
      )}

      {/* Main Area */}
      <div className="flex-1 overflow-y-auto">
        {isEditingNote ? (
          /* NOTE EDITOR VIEW */
          <div className="h-full flex flex-col bg-white p-5 space-y-4 memo-editor-container">
            <style>{`
              .memo-editor-container input,
              .memo-editor-container textarea {
                border-radius: 4px !important;
                border: none !important;
                background-color: transparent !important;
                box-shadow: none !important;
                padding: 4px !important;
                margin: 0 !important;
              }
              .memo-editor-container input {
                font-size: calc(16px * var(--app-font-scale, 1)) !important;
                font-weight: 800 !important;
              }
              .memo-editor-container textarea {
                font-size: calc(14px * var(--app-font-scale, 1)) !important;
              }
            `}</style>
            <input
              type="text"
              placeholder="请输入标题..."
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className="w-full text-base font-extrabold text-slate-800 focus:outline-none placeholder-slate-300"
            />

            <textarea
              placeholder="开始输入你的笔记内容..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="w-full flex-1 text-sm text-slate-600 focus:outline-none placeholder-slate-300 resize-none leading-relaxed"
            />
          </div>
        ) : activeTab === "notes" ? (
          /* NOTES TAB VIEW */
          <div className="p-4 space-y-4 max-w-md mx-auto">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索你的笔记..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white rounded-[8px] border border-slate-200 focus:outline-none focus:ring-1 focus:ring-neutral-950 text-xs shadow-sm"
              />
            </div>

            {/* List */}
            <div className="space-y-2.5">
              {filteredNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => handleOpenEditNote(note)}
                  className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between relative group"
                >
                  <div className="pr-8">
                    <h3 className="text-xs font-extrabold text-slate-800 leading-snug truncate">
                      {note.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium line-clamp-2 mt-1 leading-relaxed">
                      {note.content || "无内容"}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-slate-50 text-[9px] font-bold text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(note.timestamp).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>

                  <button
                    onClick={(e) => handleDeleteNote(note.id, e)}
                    className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors z-20"
                    title="删除笔记"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {filteredNotes.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <StickyNote className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-400" />
                  <p className="text-xs font-semibold">
                    {searchQuery ? "未找到符合的笔记" : "还没有任何笔记，点击右上角加号创建"}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* TODOS TAB VIEW */
          <div className="p-4 space-y-4 max-w-md mx-auto">
            {/* Progress Card */}
            <div className="bg-[var(--surface-raised)] border border-[var(--border)] rounded-2xl p-4 text-[var(--text-primary)] shadow-md relative overflow-hidden flex items-center justify-between">
              <div className="space-y-1 z-10">
                <span className="bg-[var(--badge-bg)] text-[var(--badge-text)] px-2 py-0.5 rounded text-[9px] font-black tracking-wider uppercase">
                  自律待办管家
                </span>
                <h3 className="text-sm font-extrabold mt-1">
                  今日完成进度 {progressPercent}%
                </h3>
                <p className="text-[10px] text-[var(--text-secondary)]">
                  共 {todos.length} 项，已完成 {completedCount} 项
                </p>
              </div>
              <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                {/* Visual Circle Percentage */}
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="24"
                    cy="24"
                    r="18"
                    stroke="var(--progress-track)"
                    strokeWidth="3.5"
                    fill="transparent"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r="18"
                    stroke="var(--progress-value)"
                    strokeWidth="3.5"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 18}
                    strokeDashoffset={2 * Math.PI * 18 * (1 - progressPercent / 100)}
                  />
                </svg>
                <span className="absolute text-[10px] font-black">
                  {progressPercent}%
                </span>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex gap-2 justify-between items-center">
              <button
                onClick={() => setIsAddingTodo(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-neutral-950 hover:bg-neutral-900 text-white rounded-xl text-xs font-bold transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建待办</span>
              </button>

              {completedCount > 0 && (
                <button
                  onClick={handleClearCompletedTodos}
                  className="text-slate-400 hover:text-rose-500 text-[11px] font-bold transition-colors"
                >
                  清除已完成
                </button>
              )}
            </div>

            {/* Todo Editor overlay/box */}
            {isAddingTodo && (
              <form onSubmit={handleAddTodo} className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    新增待办内容
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setIsAddingTodo(false)}
                    className="p-1 hover:bg-slate-100 rounded-full text-slate-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    ref={todoInputRef}
                    type="text"
                    required
                    maxLength={30}
                    placeholder="输入要准备的事务，如: 约陆沉砚去写生..."
                    value={newTodoText}
                    onChange={(e) => setNewTodoText(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-[8px] px-3 py-2 text-base focus:outline-none focus:ring-1 focus:ring-neutral-950"
                  />
                  <button
                    type="submit"
                    className="bg-neutral-950 text-white hover:bg-neutral-900 rounded-xl px-4 py-2 text-xs font-bold shadow-sm shrink-0"
                  >
                    添加
                  </button>
                </div>
              </form>
            )}

            {/* Todo List */}
            <div className="space-y-2 bg-[var(--surface-raised)] p-3 rounded-2xl border border-[var(--border)] shadow-sm">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  onClick={() => handleToggleTodo(todo.id)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[var(--surface-muted)] transition-colors cursor-pointer group/todo"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {todo.checked ? (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-[var(--success)] bg-[var(--success)] text-white">
                        <Check className="h-3 w-3 stroke-[3px]" />
                      </span>
                    ) : (
                      <div className="w-4 h-4 rounded-md border-2 border-[var(--border-strong)] bg-[var(--surface)] shrink-0 group-hover/todo:border-[var(--accent)] group-active/todo:bg-[var(--surface-muted)] transition-colors"></div>
                    )}
                    <span className={`text-base truncate font-semibold leading-none ${todo.checked ? "text-[var(--text-secondary)] line-through" : "text-[var(--text-primary)]"}`}>
                      {todo.text}
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTodo(todo.id);
                    }}
                    className="p-1 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors opacity-0 group-hover/todo:opacity-100 shrink-0"
                    title="删除待办"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {todos.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-400" />
                  <p className="text-xs font-semibold">今天还没有任何待办哦，生活就要劳逸结合 🍵</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
