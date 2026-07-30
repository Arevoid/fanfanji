import { useEffect, useMemo, useState } from "react";
import {
  BookHeart,
  ChevronLeft,
  Heart,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type {
  Character,
  DiaryEntry,
  Message,
  UserIdentity,
  UserSettings,
} from "../types";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";
import { resolveCanonicalCharacterId } from "../domain/character/characterIdentity";
import { createDiaryId, getDiaryDayKey } from "../domain/diary/diaryData";
import {
  loadDiaryDrafts,
  loadDiaryEntries,
  loadDiaryGenerationTasks,
  removeDiaryEntryArtifacts,
  saveDiaryDrafts,
  saveDiaryEntries,
  saveDiaryGenerationTasks,
  subscribeDiaryState,
} from "../core/storage/repositories/diaryRepository";
import {
  generateDiaryEntry,
  canGenerateDiary,
} from "../features/diary/services/diaryGenerationService";

interface AppDiaryProps {
  activeIdentity: UserIdentity;
  characters: Character[];
  relationships: CharacterRelationship[];
  messages: Message[];
  settings: UserSettings;
  onClose: () => void;
  onSendMessage: (message: Message) => void;
  onOpenChat: (
    characterId: string,
    relationId: string,
    sourceMessageId: string,
  ) => void;
}

type Tab = "counterpart" | "mine" | "calendar";
const formatDate = (value: number) =>
  new Date(value).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
const truncate = (value: string, length = 96) =>
  value.length > length ? `${value.slice(0, length)}…` : value;

export default function AppDiary({
  activeIdentity,
  characters,
  relationships,
  messages,
  settings,
  onClose,
  onSendMessage,
  onOpenChat,
}: AppDiaryProps) {
  const [entries, setEntries] = useState<DiaryEntry[]>(
    () => loadDiaryEntries().value,
  );
  const [tab, setTab] = useState<Tab>("counterpart");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    body: "",
    emotionalState: "",
    tags: "",
  });
  const [busyRelationId, setBusyRelationId] = useState<string | null>(null);
  const [relationFilterId, setRelationFilterId] = useState<string | null>(null);

  useEffect(
    () => subscribeDiaryState(() => setEntries(loadDiaryEntries().value)),
    [],
  );
  useEffect(() => {
    if (!editing || !draft.body.trim()) return;
    const id = editing.id || `new-${activeIdentity.id}`;
    saveDiaryDrafts([
      {
        id,
        ownerIdentityId: activeIdentity.id,
        ...(editing.id ? { entryId: editing.id } : {}),
        title: draft.title || undefined,
        body: draft.body,
        emotionalState: draft.emotionalState || undefined,
        tags: draft.tags
          .split(/[，,]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        occurredAt: editing.occurredAt,
        updatedAt: Date.now(),
      },
      ...loadDiaryDrafts().value.filter((item) => item.id !== id),
    ]);
  }, [editing?.id, draft, activeIdentity.id]);
  const ownEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.ownerIdentityId === activeIdentity.id)
        .sort((a, b) => b.occurredAt - a.occurredAt),
    [entries, activeIdentity.id],
  );
  const directRelations = useMemo(
    () =>
      relationships
        .filter((relation) => relation.userIdentityId === activeIdentity.id)
        .map((relation) => ({
          relation,
          character: characters.find(
            (character) =>
              character.id ===
              resolveCanonicalCharacterId(relation.characterId, characters),
          ),
        }))
        .filter(
          (
            item,
          ): item is {
            relation: CharacterRelationship;
            character: Character;
          } =>
            Boolean(
              item.character &&
              !item.character.isGroupChat &&
              !item.character.isContactInstance,
            ),
        ),
    [relationships, activeIdentity.id, characters],
  );
  const selected = ownEntries.find((entry) => entry.id === selectedId) || null;
  const filtered = ownEntries.filter(
    (entry) =>
      !query ||
      `${entry.title || ""} ${entry.body} ${entry.tags.join(" ")} ${entry.authorNameSnapshot}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const counterpartEntries = filtered.filter(
    (entry) =>
      entry.authorType === "character" &&
      (!relationFilterId || entry.relationId === relationFilterId),
  );
  const personalEntries = filtered.filter(
    (entry) => entry.authorType === "user",
  );

  const persist = (next: DiaryEntry[]) => {
    saveDiaryEntries(next);
    setEntries(next);
  };
  const beginEdit = (entry?: DiaryEntry) => {
    setEditing(
      entry || {
        id: "",
        ownerIdentityId: activeIdentity.id,
        authorType: "user",
        authorNameSnapshot: activeIdentity.name,
        authorAvatarSnapshot: activeIdentity.avatar,
        body: "",
        tags: [],
        occurredAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: "manual",
        isFavorite: false,
      },
    );
    setDraft({
      title: entry?.title || "",
      body: entry?.body || "",
      emotionalState: entry?.emotionalState || "",
      tags: entry?.tags.join("，") || "",
    });
  };
  const saveEntry = () => {
    if (!editing || !draft.body.trim()) return;
    const now = Date.now();
    const entry: DiaryEntry = {
      ...editing,
      id: editing.id || createDiaryId(),
      title: draft.title.trim() || undefined,
      body: draft.body.trim().slice(0, 4000),
      emotionalState: draft.emotionalState.trim() || undefined,
      tags: draft.tags
        .split(/[，,]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8),
      updatedAt: now,
      createdAt: editing.createdAt || now,
      occurredAt: editing.occurredAt || now,
    };
    saveDiaryDrafts(
      loadDiaryDrafts().value.filter(
        (item) =>
          item.ownerIdentityId !== activeIdentity.id ||
          item.entryId !== editing.id,
      ),
    );
    persist([entry, ...entries.filter((item) => item.id !== entry.id)]);
    setEditing(null);
    setSelectedId(entry.id);
  };
  const removeEntry = (entry: DiaryEntry) => {
    if (!window.confirm("删除这篇日记？关联的翻译和分享快照也会删除。")) return;
    removeDiaryEntryArtifacts(entry.id);
    persist(entries.filter((item) => item.id !== entry.id));
    setSelectedId(null);
  };
  const generate = async (
    relation: CharacterRelationship,
    character: Character,
  ) => {
    if (!canGenerateDiary(ownEntries, relation.id)) {
      window.alert("该角色的日记生成已达频率上限，请稍后再试。");
      return;
    }
    if (
      !window.confirm(
        `让${character.remark || character.name}根据最近聊天写一篇日记？`,
      )
    )
      return;
    setBusyRelationId(relation.id);
    const result = await generateDiaryEntry({
      relation,
      character,
      ownerIdentityId: activeIdentity.id,
      messages,
      settings,
      trigger: "manual",
    });
    saveDiaryGenerationTasks([
      result.task,
      ...loadDiaryGenerationTasks().value.filter(
        (task) => task.taskKey !== result.task.taskKey,
      ),
    ]);
    if (result.entry) persist([result.entry, ...entries]);
    else window.alert("生成失败，请检查模型设置后重试。");
    setBusyRelationId(null);
  };
  const generateFromHeader = () => {
    const target = directRelations.find(
      ({ relation }) => relation.id === relationFilterId,
    ) || directRelations[0];
    if (!target) {
      window.alert("请先创建一位可写日记的好友关系。");
      return;
    }
    void generate(target.relation, target.character);
  };

  if (editing)
    return (
      <div
        data-theme-page="diary"
        className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--text-primary)]"
      >
        <header className="grid shrink-0 grid-cols-[40px_minmax(0,1fr)_40px] items-center px-3 py-2">
          <button
            onClick={() => setEditing(null)}
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-muted)]"
          >
            <ChevronLeft size={19} />
          </button>
          <h1 className="truncate text-center text-base font-bold">写日记</h1>
          <button
            onClick={saveEntry}
            className="h-9 rounded-full bg-[var(--segmented-active-bg)] text-xs font-bold text-[var(--segmented-active-text)]"
          >
            保存
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3">
          <input
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
            placeholder="标题（可选）"
            className="diary-editor-field w-full border-0 bg-transparent px-0 text-xl font-bold outline-none"
          />
          <textarea
            autoFocus
            value={draft.body}
            onChange={(event) =>
              setDraft({ ...draft, body: event.target.value })
            }
            placeholder="写下这一刻…"
            maxLength={4000}
            className="diary-editor-field mt-5 min-h-[48vh] w-full resize-none border-0 bg-transparent px-0 text-[15px] leading-7 outline-none"
          />
          <div className="mt-4 grid gap-3">
            <input
              value={draft.emotionalState}
              onChange={(event) =>
                setDraft({ ...draft, emotionalState: event.target.value })
              }
              placeholder="此刻心情（可选）"
              className="diary-editor-field rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
            />
            <input
              value={draft.tags}
              onChange={(event) =>
                setDraft({ ...draft, tags: event.target.value })
              }
              placeholder="标签，用逗号分隔"
              className="diary-editor-field rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
            />
          </div>
        </main>
      </div>
    );

  if (selected)
    return (
      <div
        data-theme-page="diary"
        className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--text-primary)]"
      >
        <header className="grid shrink-0 grid-cols-[40px_minmax(0,1fr)_40px] items-center px-3 py-2">
          <button
            onClick={() => setSelectedId(null)}
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-muted)]"
          >
            <ChevronLeft size={19} />
          </button>
          <h1 className="truncate text-center text-sm font-bold">日记详情</h1>
          {selected.authorType === "character" ? (
            <button
              onClick={() => removeEntry(selected)}
              className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-muted)] text-rose-500"
              title="删除日记"
            >
              <Trash2 size={16} />
            </button>
          ) : (
            <button
              onClick={() => beginEdit(selected)}
              className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-muted)]"
              title="编辑日记"
            >
              <Pencil size={16} />
            </button>
          )}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>
                {selected.authorNameSnapshot} ·{" "}
                {formatDate(selected.occurredAt)}
              </span>
              <button
                onClick={() =>
                  persist(
                    entries.map((item) =>
                      item.id === selected.id
                        ? {
                            ...item,
                            isFavorite: !item.isFavorite,
                            updatedAt: Date.now(),
                          }
                        : item,
                    ),
                  )
                }
              >
                <Heart
                  size={18}
                  className={selected.isFavorite ? "fill-current" : ""}
                />
              </button>
            </div>
            <h2 className="mt-4 text-xl font-bold">{selected.title}</h2>
            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7">
              {selected.body}
            </p>
            <p className="mt-4 text-sm text-[var(--text-secondary)]">
              {selected.emotionalState}
            </p>
            {selected.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {selected.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          {selected.authorType === "user" && (
            <div className="mt-4">
              <button
                onClick={() => removeEntry(selected)}
                className="diary-action w-full text-rose-500"
              >
                <Trash2 size={16} />
                删除
              </button>
            </div>
          )}
          {selected.authorType === "character" && selected.relationId && (
            <button
              onClick={() => {
                const relation = directRelations.find(
                  (item) => item.relation.id === selected.relationId,
                )?.relation;
                if (relation) onOpenChat(relation.characterId, relation.id, "");
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 text-sm text-[var(--text-secondary)]"
            >
              <MessageCircle size={16} />
              去和 TA 聊聊
            </button>
          )}
        </main>
      </div>
    );

  const list = tab === "counterpart" ? counterpartEntries : personalEntries;
  return (
    <div
      data-theme-page="diary"
      className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--text-primary)]"
    >
      <header className="grid shrink-0 grid-cols-[40px_minmax(0,1fr)_40px] items-center px-3 py-2">
        <button
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-muted)]"
        >
          <ChevronLeft size={19} />
        </button>
        <h1 className="truncate text-center text-base font-bold">日记</h1>
        {tab === "counterpart" ? (
          <button
            onClick={generateFromHeader}
            title="让 TA 写一篇日记"
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--segmented-active-bg)] text-[var(--segmented-active-text)]"
          >
            <BookHeart size={18} />
          </button>
        ) : (
          <button
            onClick={() => beginEdit()}
            title="新建日记"
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--segmented-active-bg)] text-[var(--segmented-active-text)]"
          >
            <Plus size={19} />
          </button>
        )}
      </header>
      <div className="grid shrink-0 grid-cols-3 gap-2 px-4 py-2">
        {(["counterpart", "mine", "calendar"] as Tab[]).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`rounded-xl py-2 text-xs font-bold ${tab === item ? "bg-[var(--segmented-active-bg)] text-[var(--segmented-active-text)]" : "bg-[var(--segmented-inactive-bg)] text-[var(--segmented-inactive-text)]"}`}
          >
            {item === "counterpart"
              ? "对方日记"
              : item === "mine"
                ? "我的日记"
                : "日历"}
          </button>
        ))}
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-2">
        {tab === "calendar" ? (
          <DiaryCalendar
            entries={ownEntries}
            onSelect={(entry) => setSelectedId(entry.id)}
          />
        ) : (
          <>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-2.5 text-[var(--text-secondary)]"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索日记、标签或作者"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] py-2 pl-9 pr-3 text-sm"
              />
            </div>
            {tab === "counterpart" && (
              <section className="mt-4">
                <h2 className="text-sm font-bold">当前关系</h2>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                  {directRelations.map(({ relation, character }) => (
                    <button
                      key={relation.id}
                      onClick={() =>
                        setRelationFilterId(
                          relation.id === relationFilterId ? null : relation.id,
                        )
                      }
                      disabled={busyRelationId === relation.id}
                      className={`shrink-0 rounded-2xl border px-3 py-2 text-left text-xs ${relation.id === relationFilterId ? "border-[var(--text-primary)] bg-[var(--surface-muted)]" : "border-[var(--border)] bg-[var(--surface)]"}`}
                    >
                      <span className="font-bold">
                        {character.remark || character.name}
                      </span>
                      <span className="diary-filter-hint ml-1 text-[var(--text-secondary)]">
                        {busyRelationId === relation.id ? "生成中…" : "筛选"}
                      </span>
                    </button>
                  ))}{" "}
                </div>
              </section>
            )}
            <section className="mt-3 space-y-3">
              {list.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>
                      {entry.authorNameSnapshot} ·{" "}
                      {formatDate(entry.occurredAt)}
                    </span>
                    {entry.isFavorite && (
                      <Heart size={14} className="fill-current" />
                    )}
                  </div>
                  <h3 className="mt-2 text-sm font-bold">
                    {entry.title || "无标题日记"}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    {truncate(entry.body)}
                  </p>
                </button>
              ))}
              {list.length === 0 && (
                <div className="py-16 text-center text-sm text-[var(--text-secondary)]">
                  <BookHeart className="mx-auto mb-3 opacity-40" size={42} />
                  {tab === "mine"
                    ? "还没有自己的日记，写下今天的第一句话吧。"
                    : "当前关系还没有日记。"}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <style>{`.diary-editor-field{border-radius:16px !important}.diary-action{display:flex;min-width:0;min-height:64px;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:1px solid var(--border);border-radius:12px;background:var(--surface);padding:8px 4px;font-size:13px;line-height:1.2}.diary-action svg{flex-shrink:0}.diary-action:disabled{opacity:.42}.diary-filter-hint{display:none}`}</style>
    </div>
  );
}

function DiaryCalendar({
  entries,
  onSelect,
}: {
  entries: DiaryEntry[];
  onSelect: (entry: DiaryEntry) => void;
}) {
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const byDay = new Map<string, DiaryEntry[]>();
  entries.forEach((entry) =>
    byDay.set(getDiaryDayKey(entry.occurredAt), [
      ...(byDay.get(getDiaryDayKey(entry.occurredAt)) || []),
      entry,
    ]),
  );
  const firstOffset = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [
    ...Array(firstOffset).fill(null),
    ...Array.from(
      { length: days },
      (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1),
    ),
  ];
  const dayEntries = selectedDay ? byDay.get(selectedDay) || [] : [];
  return (
    <section>
      <div className="flex items-center justify-between">
        <button
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
          className="rounded-lg px-2 py-1 text-sm"
        >
          ‹
        </button>
        <h2 className="text-sm font-bold">
          {month.getFullYear()} 年 {month.getMonth() + 1} 月
        </h2>
        <button
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
          className="rounded-lg px-2 py-1 text-sm"
        >
          ›
        </button>
      </div>
      <button
        onClick={() =>
          setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
        }
        className="mt-2 text-xs text-[var(--text-secondary)]"
      >
        回到今天
      </button>
      <div className="mt-3 grid grid-cols-7 text-center text-[10px] text-[var(--text-secondary)]">
        {"日一二三四五六".split("").map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {cells.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} />;
          const key = getDiaryDayKey(date.getTime());
          const items = byDay.get(key) || [];
          const mine = items.some((entry) => entry.authorType === "user");
          const other = items.some((entry) => entry.authorType === "character");
          const today = key === getDiaryDayKey(Date.now());
          return (
            <button
              key={key}
              onClick={() => setSelectedDay(key)}
              className={`relative aspect-square rounded-xl text-xs ${today ? "ring-1 ring-[var(--text-primary)]" : ""} ${selectedDay === key ? "bg-[var(--surface-muted)]" : ""}`}
            >
              {date.getDate()}
              {items.length > 0 && (
                <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                  {mine && (
                    <i className="h-1 w-1 rounded-full bg-[var(--text-primary)]" />
                  )}
                  {other && (
                    <i className="h-1 w-1 rounded-full bg-[var(--text-secondary)]" />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {selectedDay && (
        <div className="mt-5">
          <h3 className="text-sm font-bold">{selectedDay}</h3>
          {dayEntries.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              这天没有日记。
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {dayEntries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onSelect(entry)}
                  className="block w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left text-sm"
                >
                  <b>{entry.authorNameSnapshot}</b>
                  <span className="ml-2 text-[var(--text-secondary)]">
                    {entry.title || truncate(entry.body, 22)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
