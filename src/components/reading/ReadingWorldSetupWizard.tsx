import React, { useMemo, useState } from "react";
import { ChevronLeft, Globe2, Sparkles, UsersRound } from "lucide-react";
import type { Character, UserSettings } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import {
  validateReadingWorldSetup,
  type ReadingWorldSetupDraft,
} from "../../features/reading/story/readingWorldSetup";

interface FriendOption {
  relationship: CharacterRelationship;
  character: Character;
}

export default function ReadingWorldSetupWizard({
  friends,
  settings,
  onClose,
  onCreate,
}: {
  friends: FriendOption[];
  settings?: UserSettings;
  onClose: () => void;
  onCreate: (draft: ReadingWorldSetupDraft) => void;
}) {
  const [step, setStep] = useState(0);
  const [relationId, setRelationId] = useState(
    friends[0]?.relationship.id || "",
  );
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [worldView, setWorldView] = useState("");
  const [userIdentity, setUserIdentity] = useState("");
  const [friendIdentity, setFriendIdentity] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [intendedEnding, setIntendedEnding] = useState("");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const friend = friends.find((item) => item.relationship.id === relationId);
  const draft = useMemo(
    (): ReadingWorldSetupDraft => ({
      relationId,
      title,
      genre,
      worldView,
      userIdentity,
      friendIdentity,
      synopsis,
      intendedEnding,
      length,
    }),
    [
      friendIdentity,
      genre,
      intendedEnding,
      length,
      relationId,
      synopsis,
      title,
      userIdentity,
      worldView,
    ],
  );
  const error = validateReadingWorldSetup(draft);
  const canContinue =
    step === 0
      ? Boolean(relationId && title.trim() && genre.trim())
      : step === 1
        ? Boolean(worldView.trim() && synopsis.trim())
        : !error;
  const inputClass =
    "mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm outline-none";
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--app-bg)] pt-[max(0.75rem,env(safe-area-inset-top))] text-[var(--text-primary)]"
      role="dialog"
      aria-modal="true"
      aria-label="新建原创世界"
    >
      <header className="flex min-h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <button
          type="button"
          onClick={step ? () => setStep((value) => value - 1) : onClose}
          aria-label="返回"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <h2 className="text-sm font-black">
            {step === 0
              ? "故事与同行者"
              : step === 1
                ? "世界与剧情"
                : "宇宙契约"}
          </h2>
          <p className="text-[9px] text-[var(--text-muted)]">{step + 1}/3</p>
        </div>
        <Globe2 className="h-5 w-5" />
      </header>
      <div className="h-1 shrink-0 bg-[var(--surface-raised)]">
        <div
          className="h-full bg-[var(--button-primary-bg)] transition-all"
          style={{ width: `${((step + 1) / 3) * 100}%` }}
        />
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-md space-y-4">
          {step === 0 && (
            <>
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-center gap-2">
                  <UsersRound className="h-4 w-4" />
                  <h3 className="text-sm font-black">选择 AI 好友</h3>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-[var(--text-muted)]">
                  原创世界仍按关系完全隔离，好友会沿用已有角色卡和表达习惯。
                </p>
                <div className="mt-3 space-y-2">
                  {friends.map((item) => (
                    <button
                      key={item.relationship.id}
                      type="button"
                      onClick={() => setRelationId(item.relationship.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${relationId === item.relationship.id ? "border-[var(--button-primary-bg)] bg-[var(--surface-raised)]" : "border-[var(--border)]"}`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-raised)] font-bold">
                        {item.character.avatar ? (
                          <img
                            src={item.character.avatar}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          item.character.name.slice(0, 1)
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold">
                          {item.character.name}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {item.relationship.relationship}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <label className="block text-xs font-bold">
                  故事名称
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="例：雾港来信"
                    className={`${inputClass} h-11`}
                  />
                </label>
                <label className="mt-3 block text-xs font-bold">
                  故事题材
                  <input
                    value={genre}
                    onChange={(event) => setGenre(event.target.value)}
                    placeholder="悬疑、奇幻、校园、末日……"
                    className={`${inputClass} h-11`}
                  />
                </label>
              </section>
            </>
          )}
          {step === 1 && (
            <>
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <label className="block text-xs font-bold">
                  世界观
                  <textarea
                    value={worldView}
                    onChange={(event) => setWorldView(event.target.value)}
                    rows={5}
                    placeholder="世界运行规则、时代、地域、势力与禁忌……"
                    className={`${inputClass} resize-none p-3`}
                  />
                </label>
                <label className="mt-3 block text-xs font-bold">
                  故事梗概
                  <textarea
                    value={synopsis}
                    onChange={(event) => setSynopsis(event.target.value)}
                    rows={4}
                    placeholder="故事从哪里开始，主要矛盾是什么？"
                    className={`${inputClass} resize-none p-3`}
                  />
                </label>
                <label className="mt-3 block text-xs font-bold">
                  预期结局
                  <textarea
                    value={intendedEnding}
                    onChange={(event) => setIntendedEnding(event.target.value)}
                    rows={2}
                    placeholder="选填；允许故事过程自然偏离"
                    className={`${inputClass} resize-none p-3`}
                  />
                </label>
              </section>
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h3 className="text-sm font-black">两人身份</h3>
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                  留空会沿用当前用户资料和好友既有人设。
                </p>
                <label className="mt-3 block text-xs font-bold">
                  你的身份
                  <textarea
                    value={userIdentity}
                    onChange={(event) => setUserIdentity(event.target.value)}
                    rows={2}
                    placeholder={`${settings?.name || "你"} · 沿用现有人设`}
                    className={`${inputClass} resize-none p-3`}
                  />
                </label>
                <label className="mt-3 block text-xs font-bold">
                  {friend?.character.name || "好友"}的身份
                  <textarea
                    value={friendIdentity}
                    onChange={(event) => setFriendIdentity(event.target.value)}
                    rows={2}
                    placeholder="留空沿用好友人设"
                    className={`${inputClass} resize-none p-3`}
                  />
                </label>
              </section>
            </>
          )}
          {step === 2 && (
            <>
              <section className="rounded-3xl border border-amber-300/30 bg-amber-500/10 p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-300" />
                  <h3 className="text-base font-black">{title}</h3>
                </div>
                <dl className="mt-4 space-y-3 text-xs">
                  <div>
                    <dt className="text-[10px] font-bold text-[var(--text-muted)]">
                      题材
                    </dt>
                    <dd className="mt-1">{genre}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold text-[var(--text-muted)]">
                      同行者
                    </dt>
                    <dd className="mt-1">{friend?.character.name}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold text-[var(--text-muted)]">
                      世界规则
                    </dt>
                    <dd className="mt-1 line-clamp-4 leading-5">{worldView}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold text-[var(--text-muted)]">
                      故事梗概
                    </dt>
                    <dd className="mt-1 line-clamp-4 leading-5">{synopsis}</dd>
                  </div>
                </dl>
              </section>
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h3 className="text-sm font-black">篇幅长度</h3>
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
              <p className="rounded-2xl bg-[var(--surface)] p-3 text-[10px] leading-4 text-[var(--text-muted)]">
                这个世界的剧情、关系与结局只保存在独立宇宙，不会写入现实主记忆。AI
                好友不能替你决定重大行动。
              </p>
            </>
          )}
        </div>
      </main>
      <footer className="grid shrink-0 grid-cols-2 gap-3 border-t border-[var(--border)] bg-[var(--surface)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={step ? () => setStep((value) => value - 1) : onClose}
          className="h-11 rounded-2xl border border-[var(--border)] text-xs font-bold"
        >
          {step ? "上一步" : "取消"}
        </button>
        <button
          type="button"
          disabled={!canContinue}
          onClick={() =>
            step < 2 ? setStep((value) => value + 1) : onCreate(draft)
          }
          className="h-11 rounded-2xl bg-[var(--button-primary-bg)] text-xs font-bold text-[var(--button-primary-text)] disabled:opacity-40"
        >
          {step < 2 ? "继续" : "开启故事"}
        </button>
      </footer>
    </div>
  );
}
