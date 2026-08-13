import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  LoaderCircle,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import type {
  ReadingAnalysisEntity,
  ReadingBookBible,
} from "../../domain/reading/analysisTypes";
import type { ReadingBook } from "../../domain/reading/types";
import type { Character } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import {
  validateReadingStorySetup,
  type ReadingStoryIdentityDraft,
  type ReadingStorySetupDraft,
} from "../../features/reading/story/readingStorySetup";

interface FriendOption {
  relationship: CharacterRelationship;
  character: Character;
}
const emptyIdentity = (name = ""): ReadingStoryIdentityDraft => ({
  entryMode: "body_wear",
  name,
  role: "",
  persona: "",
  goal: "",
});

function IdentityEditor({
  label,
  value,
  characters,
  onChange,
}: {
  label: string;
  value: ReadingStoryIdentityDraft;
  characters: ReadingAnalysisEntity[];
  onChange: (next: ReadingStoryIdentityDraft) => void;
}) {
  const set = (patch: Partial<ReadingStoryIdentityDraft>) =>
    onChange({ ...value, ...patch });
  return (
    <section className="space-y-3 rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black">{label}</h3>
        <div className="grid grid-cols-2 rounded-xl border border-[var(--border)] p-0.5">
          {(
            [
              ["body_wear", "身穿"],
              ["soul_wear", "魂穿"],
            ] as const
          ).map(([mode, text]) => (
            <button
              key={mode}
              type="button"
              onClick={() =>
                set({
                  entryMode: mode,
                  originalCharacterId:
                    mode === "body_wear"
                      ? undefined
                      : value.originalCharacterId,
                })
              }
              className={`rounded-lg px-3 py-1.5 text-[10px] font-bold ${value.entryMode === mode ? "bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]" : "text-[var(--text-muted)]"}`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      {value.entryMode === "soul_wear" ? (
        <>
          <label className="block text-[11px] font-bold">
            绑定原故事角色
            <select
              value={value.originalCharacterId || ""}
              onChange={(event) => {
                const entity = characters.find(
                  (item) => item.id === event.target.value,
                );
                set({
                  originalCharacterId: event.target.value,
                  name: entity?.name || "",
                });
              }}
              className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs outline-none"
            >
              <option value="">选择角色</option>
              {characters.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {characters.length === 0 && (
            <label className="block text-[11px] font-bold">
              原角色姓名
              <input
                value={value.name}
                onChange={(event) =>
                  set({
                    name: event.target.value,
                    originalCharacterId: event.target.value.trim()
                      ? `manual:${event.target.value.trim()}`
                      : undefined,
                  })
                }
                placeholder="尚未分析出人物，可手动填写"
                className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs outline-none"
              />
            </label>
          )}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 text-[11px] font-bold">
            姓名
            <input
              value={value.name}
              onChange={(event) => set({ name: event.target.value })}
              className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs outline-none"
            />
          </label>
          <label className="text-[11px] font-bold">
            性别
            <input
              value={value.gender || ""}
              onChange={(event) => set({ gender: event.target.value })}
              placeholder="选填"
              className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs outline-none"
            />
          </label>
          <label className="text-[11px] font-bold">
            年龄
            <input
              value={value.age || ""}
              onChange={(event) => set({ age: event.target.value })}
              placeholder="选填"
              className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs outline-none"
            />
          </label>
        </div>
      )}
      <label className="block text-[11px] font-bold">
        身份与简单人设
        <textarea
          value={[value.role || "", value.persona || ""]
            .filter(Boolean)
            .join("\n")}
          onChange={(event) => {
            const [role = "", ...rest] = event.target.value.split("\n");
            set({ role, persona: rest.join("\n") });
          }}
          rows={2}
          placeholder="例：边城医师；谨慎但富有同情心"
          className="mt-2 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs outline-none"
        />
      </label>
      <label className="block text-[11px] font-bold">
        行为目标
        <input
          value={value.goal || ""}
          onChange={(event) => set({ goal: event.target.value })}
          placeholder="进入故事后最想完成的事"
          className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs outline-none"
        />
      </label>
    </section>
  );
}

export default function ReadingStorySetupWizard({
  book,
  friends,
  coreCharacters,
  bookBible,
  onPrepare,
  onClose,
  onCreate,
}: {
  book: ReadingBook;
  friends: FriendOption[];
  coreCharacters: ReadingAnalysisEntity[];
  bookBible?: ReadingBookBible;
  onPrepare: (onProgress: (progress: number) => void) => Promise<{
    coreCharacters: ReadingAnalysisEntity[];
    bookBible?: ReadingBookBible;
  }>;
  onClose: () => void;
  onCreate: (draft: ReadingStorySetupDraft) => void;
}) {
  const [step, setStep] = useState<"prepare" | "setup">("prepare");
  const initiallyPrepared =
    coreCharacters.length > 0 &&
    Boolean(
      bookBible?.premise &&
        bookBible.worldRules.length &&
        bookBible.storyLines.length,
    );
  const [progress, setProgress] = useState(initiallyPrepared ? 100 : 6);
  const [analysisStatus, setAnalysisStatus] = useState<
    "running" | "done" | "error"
  >(initiallyPrepared ? "done" : "running");
  const [analysisError, setAnalysisError] = useState("");
  const [recognizedCharacters, setRecognizedCharacters] =
    useState(coreCharacters);
  const [recognizedBible, setRecognizedBible] = useState(bookBible);
  const preparationIdRef = useRef(0);
  const [mode, setMode] = useState<"solo" | "together">("solo");
  const [relationId, setRelationId] = useState(
    friends[0]?.relationship.id || "",
  );
  const [user, setUser] = useState<ReadingStoryIdentityDraft>(() =>
    emptyIdentity("未命名角色"),
  );
  const [friend, setFriend] = useState<ReadingStoryIdentityDraft>(() =>
    emptyIdentity(friends[0]?.character.name || "AI 好友"),
  );
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const selectedFriend = friends.find(
    (item) => item.relationship.id === relationId,
  );
  const draft = useMemo(
    (): ReadingStorySetupDraft => ({
      mode,
      relationId: mode === "together" ? relationId : undefined,
      user,
      friend: mode === "together" ? friend : undefined,
      length,
    }),
    [friend, length, mode, relationId, user],
  );
  const error = validateReadingStorySetup(draft);

  const runPreparation = async () => {
    const preparationId = preparationIdRef.current + 1;
    preparationIdRef.current = preparationId;
    setAnalysisStatus("running");
    setAnalysisError("");
    setProgress(6);
    try {
      const result = await onPrepare((next) => {
        if (preparationIdRef.current === preparationId) setProgress(next);
      });
      if (preparationIdRef.current !== preparationId) return;
      setRecognizedCharacters(result.coreCharacters);
      setRecognizedBible(result.bookBible);
      setProgress(100);
      setAnalysisStatus("done");
    } catch (error) {
      if (preparationIdRef.current !== preparationId) return;
      setAnalysisError(
        error instanceof Error ? error.message : "小说资料识别失败",
      );
      setAnalysisStatus("error");
    }
  };
  useEffect(() => {
    if (!initiallyPrepared) void runPreparation();
    return () => {
      preparationIdRef.current += 1;
    };
  }, []);
  useEffect(() => {
    if (!selectedFriend || mode !== "together") return;
    setFriend((current) =>
      current.name === "AI 好友" || !current.name
        ? { ...current, name: selectedFriend.character.name }
        : current,
    );
  }, [mode, selectedFriend]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`穿书设置：${book.title}`}
    >
      <div className="flex max-h-full w-full max-w-md flex-col rounded-t-[30px] border border-[var(--border)] bg-[var(--app-bg)] shadow-2xl sm:max-h-[94%] sm:rounded-[30px]">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={step === "setup" ? () => setStep("prepare") : onClose}
            aria-label="返回"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"
          >
            {step === "setup" ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </button>
          <div className="min-w-0 text-center">
            <h2 className="truncate text-sm font-black">穿书 · {book.title}</h2>
            <p className="text-[9px] text-[var(--text-muted)]">独立故事宇宙</p>
          </div>
          <Sparkles className="h-5 w-5 text-amber-300" />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          {step === "prepare" ? (
            <div className="space-y-4">
              <section className="rounded-3xl border border-amber-300/30 bg-amber-500/10 p-5">
                <div className="flex items-center gap-3">
                  {analysisStatus === "running" ? (
                    <LoaderCircle className="h-6 w-6 animate-spin text-amber-300" />
                  ) : analysisStatus === "done" ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="h-4 w-4" />
                    </span>
                  ) : (
                    <X className="h-6 w-6 text-rose-300" />
                  )}
                  <div>
                    <h3 className="text-sm font-black">
                      {analysisStatus === "running"
                        ? "正在识别小说资料"
                        : analysisStatus === "done"
                          ? "故事资料已准备"
                          : "小说识别未完成"}
                    </h3>
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                      世界观 · 故事线 · 核心人物
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/20">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-2 text-right text-[10px] text-[var(--text-muted)]">
                  {progress}%
                </p>
                <p className="mt-3 text-[9px] leading-4 text-[var(--text-muted)]">
                  识别时仅将抽取的有限文本片段发送给你已配置的
                  API，不会上传整本小说。
                </p>
              </section>
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-xs font-bold">识别结果</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div className="rounded-xl bg-[var(--surface-raised)] p-3">
                    <p className="text-base font-black">{book.chapterCount}</p>
                    <p className="mt-1 text-[var(--text-muted)]">章节</p>
                  </div>
                  <div className="rounded-xl bg-[var(--surface-raised)] p-3">
                    <p className="text-base font-black">
                      {recognizedCharacters.length}
                    </p>
                    <p className="mt-1 text-[var(--text-muted)]">核心人物</p>
                  </div>
                  <div className="rounded-xl bg-[var(--surface-raised)] p-3">
                    <p className="text-base font-black">
                      {recognizedBible?.storyLines.length || 0}
                    </p>
                    <p className="mt-1 text-[var(--text-muted)]">故事线</p>
                  </div>
                </div>
                {recognizedBible && (
                  <div className="mt-3 space-y-2 rounded-2xl bg-[var(--surface-raised)] p-3 text-[10px] leading-4">
                    <p>
                      <strong>世界观：</strong>
                      {recognizedBible.worldRules.slice(0, 2).join("；")}
                    </p>
                    <p>
                      <strong>主线：</strong>
                      {recognizedBible.storyLines.slice(0, 2).join("；")}
                    </p>
                  </div>
                )}
                {analysisError && (
                  <p
                    role="alert"
                    className="mt-3 text-xs leading-5 text-rose-300"
                  >
                    {analysisError}
                  </p>
                )}
              </section>
              {analysisStatus === "error" ? (
                <button
                  type="button"
                  onClick={() => void runPreparation()}
                  className="h-11 w-full rounded-2xl border border-[var(--border)] text-xs font-bold"
                >
                  重新识别
                </button>
              ) : (
                <button
                  type="button"
                  disabled={analysisStatus !== "done"}
                  onClick={() => setStep("setup")}
                  className="h-11 w-full rounded-2xl bg-[var(--button-primary-bg)] text-xs font-bold text-[var(--button-primary-text)] disabled:opacity-40"
                >
                  继续设置身份
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h3 className="text-sm font-black">参与方式</h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("solo")}
                    className={`rounded-2xl border p-3 text-xs font-bold ${mode === "solo" ? "border-[var(--button-primary-bg)] bg-[var(--surface-raised)]" : "border-[var(--border)]"}`}
                  >
                    单人穿书
                  </button>
                  <button
                    type="button"
                    disabled={!friends.length}
                    onClick={() => setMode("together")}
                    className={`rounded-2xl border p-3 text-xs font-bold disabled:opacity-40 ${mode === "together" ? "border-[var(--button-primary-bg)] bg-[var(--surface-raised)]" : "border-[var(--border)]"}`}
                  >
                    <UsersRound className="mr-1 inline h-4 w-4" />
                    双人穿书
                  </button>
                </div>
                {mode === "together" && (
                  <label className="mt-3 block text-[11px] font-bold">
                    选择 AI 好友
                    <select
                      value={relationId}
                      onChange={(event) => setRelationId(event.target.value)}
                      className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-xs outline-none"
                    >
                      {friends.map((item) => (
                        <option
                          key={item.relationship.id}
                          value={item.relationship.id}
                        >
                          {item.character.name} ·{" "}
                          {item.relationship.relationship}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </section>
              <IdentityEditor
                label="你的身份"
                value={user}
                characters={recognizedCharacters}
                onChange={setUser}
              />
              {mode === "together" && (
                <IdentityEditor
                  label={`${selectedFriend?.character.name || "好友"}的身份`}
                  value={friend}
                  characters={recognizedCharacters}
                  onChange={setFriend}
                />
              )}
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h3 className="text-sm font-black">故事长度</h3>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(
                    [
                      ["short", "短", "约 3 章"],
                      ["medium", "中", "约 8 章"],
                      ["long", "长", "约 20 章"],
                    ] as const
                  ).map(([value, label, detail]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLength(value)}
                      className={`rounded-2xl border p-3 ${length === value ? "border-[var(--button-primary-bg)] bg-[var(--surface-raised)]" : "border-[var(--border)]"}`}
                    >
                      <p className="text-sm font-black">{label}</p>
                      <p className="mt-1 text-[9px] text-[var(--text-muted)]">
                        {detail}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
              {error && (
                <p role="alert" className="text-xs text-rose-300">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={Boolean(error)}
                onClick={() => onCreate(draft)}
                className="h-12 w-full rounded-2xl bg-[var(--button-primary-bg)] text-sm font-black text-[var(--button-primary-text)] disabled:opacity-40"
              >
                进入故事
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
