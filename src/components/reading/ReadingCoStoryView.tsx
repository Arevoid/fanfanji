import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  Handshake,
  ListChecks,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { Character, UserSettings } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import type { ReadingBook } from "../../domain/reading/types";
import type { ReadingCoStoryState } from "../../domain/reading/coStoryTypes";
import {
  getReadingCoStory,
  listReadingCoStories,
  listReadingCoStorySaves,
  listReadingCoStoryTurns,
} from "../../core/storage/repositories/readingCoStoryRepository";
import {
  createReadingCoStory,
  createReadingCoStoryOpening,
  createReadingCoStorySave,
  deleteReadingCoStory,
  loadReadingCoStorySave,
  ReadingCoStoryError,
  resolveReadingCoStoryApproval,
  updateReadingCoStoryMetadata,
} from "../../features/reading/story/readingCoStory";
import { generateReadingCoStoryTurn } from "../../features/reading/story/readingCoStoryGeneration";
import { ensureDistinctReadingStoryChoices } from "../../features/reading/story/readingStoryChoices";
import ReadingStoryPlayShell, {
  type ReadingStoryPanel,
} from "./ReadingStoryPlayShell";
import ReadingStoryGenerationSettingsDialog from "./ReadingStoryGenerationSettingsDialog";

interface FriendOption {
  relationship: CharacterRelationship;
  character: Character;
}
interface ReadingCoStoryViewProps {
  userIdentityId: string;
  book?: ReadingBook;
  initialCoStoryId?: string;
  friends: FriendOption[];
  settings?: UserSettings;
  onClose: () => void;
}
const makeId = (): string =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function ReadingCoStoryView({
  userIdentityId,
  book,
  initialCoStoryId,
  friends,
  settings,
  onClose,
}: ReadingCoStoryViewProps) {
  const [stories, setStories] = useState(() =>
    listReadingCoStories(userIdentityId),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    () =>
      initialCoStoryId ||
      listReadingCoStories(userIdentityId)[0]?.coStoryId ||
      null,
  );
  const [friendId, setFriendId] = useState(friends[0]?.relationship.id || "");
  const [length, setLength] = useState<"short" | "medium" | "long">("short");
  const [userAction, setUserAction] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isGenerationSettingsOpen, setIsGenerationSettingsOpen] = useState(false);
  const selectedSummary = stories.find((item) => item.coStoryId === selectedId);
  const story = useMemo(
    () =>
      selectedSummary
        ? getReadingCoStory({
            userIdentityId,
            coStoryId: selectedSummary.coStoryId,
            relationId: selectedSummary.relationId,
            characterId: selectedSummary.characterId,
          })
        : undefined,
    [selectedSummary, userIdentityId],
  );
  const turns = useMemo(
    () => (story ? listReadingCoStoryTurns(story) : []),
    [story, stories],
  );
  const saves = useMemo(
    () => (story ? listReadingCoStorySaves(story) : []),
    [story, stories],
  );
  const latestTurn = turns.at(-1);
  const latestChoices = latestTurn?.choices.length
    ? ensureDistinctReadingStoryChoices(latestTurn.choices, {
        narrative: latestTurn.narrative,
        currentLocation: latestTurn.currentLocation,
      })
    : story?.status === "completed"
      ? []
      : [
          { id: "a", label: "观察眼前变化，确认最值得注意的线索" },
          { id: "b", label: `和 ${story?.aiFriend.displayName || "TA"} 交换判断后行动` },
          { id: "c", label: "主动回应在场的人，推动当前事件" },
          { id: "d", label: "按自己的想法行动或说话" },
        ];
  const selectedFriend = friends.find(
    (item) => item.relationship.id === friendId,
  );
  const refresh = (next?: ReadingCoStoryState) => {
    setStories(listReadingCoStories(userIdentityId));
    if (next) setSelectedId(next.coStoryId);
  };

  useEffect(() => {
    if (!story || turns.length > 0) return;
    try {
      createReadingCoStoryOpening({
        scope: story,
        narrative: story.worldDefinition
          ? `${story.worldDefinition.synopsis}\n\n你与 ${story.aiFriend.displayName} 已经置身于这个世界。第一幕正在眼前发生，TA 会读取自己的人设与世界规则自主参与。`
          : `书页在眼前化为真实场景。你与 ${story.aiFriend.displayName} 已分别进入故事身份，原本的剧情已在远处开始运转。`,
        choices: [
          { id: "a", label: "观察环境，确认当前位置与时间" },
          { id: "b", label: `与 ${story.aiFriend.displayName} 交换眼前发现` },
          { id: "c", label: "寻找故事中最先出现的关键人物" },
          { id: "d", label: "按自己的想法行动或说话" },
        ],
      });
      refresh(story);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "故事引子创建失败");
    }
  }, [story?.coStoryId, turns.length]);

  const createStory = () => {
    if (!book || !selectedFriend) return;
    try {
      const { relationship, character } = selectedFriend;
      const next = createReadingCoStory({
        scope: {
          userIdentityId,
          coStoryId: `co-story-${makeId()}`,
          relationId: relationship.id,
          characterId: character.id,
        },
        title: `共同穿书：《${book.title}》`,
        universeStoryId: book.id,
        length,
        userCharacterName: "未命名角色",
        userCharacterRole: "待设定",
        userGoals: ["和 AI 好友一起找到故事出口"],
        aiFriend: {
          relationId: relationship.id,
          characterId: character.id,
          displayName: character.name,
          characterName: character.name,
          characterRole: relationship.relationship,
          personaSummary:
            `${character.personality}\n${character.backstory}`.trim(),
          knownIntel: [],
          knownTurnIds: [],
        },
      });
      createReadingCoStoryOpening({
        scope: next,
        narrative: `《${book.title}》的第一页在你们面前化作真实场景。你与 ${character.name} 已分别进入各自的身份，远处的原故事正在发生，而 TA 会依据自己的人设、世界规则与当前所知自主行动。`,
        choices: [
          { id: "a", label: "观察眼前环境，判断故事进行到哪里" },
          { id: "b", label: `先与 ${character.name} 确认彼此的身份` },
          { id: "c", label: "寻找最近出现的原故事人物" },
          { id: "d", label: "按自己的想法行动或说话" },
        ],
      });
      refresh(next);
      setMessage("故事引子已经生成；你始终控制自己的角色，AI 好友会自主参与。");
    } catch (error) {
      setMessage(
        error instanceof ReadingCoStoryError
          ? error.message
          : "共同故事创建失败",
      );
    }
  };

  const submitUserAction = async () => {
    if (
      !story ||
      !settings ||
      !userAction.trim() ||
      busy ||
      story.pendingApproval
    )
      return;
    if (story.status !== "active") {
      setMessage(
        story.status === "completed"
          ? "共同故事已经完成，不能继续生成。"
          : "共同故事已暂停，请先在管理面板中继续故事。",
      );
      return;
    }
    setBusy(true);
    setMessage("正在生成共同故事下一回合，双方身份和知识边界保持隔离。");
    try {
      const next = await generateReadingCoStoryTurn({
        story,
        userAction,
        requestId: makeId(),
        settings: {
          apiKey: settings.apiKey || "",
          selectedModel: settings.selectedModel || "",
          apiEndpoint: settings.apiEndpoint,
          apiTemperature: settings.apiTemperature,
          streamCompatible: settings.streamCompatible,
        },
      });
      setUserAction("");
      refresh(next.story);
      setMessage("共同故事新回合已生成并自动保存。");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "共同故事回合生成失败",
      );
    } finally {
      setBusy(false);
    }
  };

  const resolveApproval = (approve: boolean) => {
    if (!story?.pendingApproval) return;
    try {
      const next = resolveReadingCoStoryApproval({
        scope: story,
        actionId: story.pendingApproval.actionId,
        approve,
      });
      refresh(next);
      setMessage(approve ? "已接受 AI 好友行动。" : "已拒绝 AI 好友行动。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "处理行动失败");
    }
  };

  const saveStory = () => {
    if (!story || !turns.length) return;
    try {
      createReadingCoStorySave({
        scope: story,
        label: `第 ${turns.length} 回合`,
      });
      refresh(story);
      setMessage("已创建共同故事手动存档。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "存档失败");
    }
  };
  const saveGenerationSettings = (generationPreferences: NonNullable<ReadingCoStoryState["generationPreferences"]>) => {
    if (!story) return;
    try {
      refresh(updateReadingCoStoryMetadata({ scope: story, generationPreferences }));
      setIsGenerationSettingsOpen(false);
      setMessage("剧情生成设置已保存，将从下一节点开始生效。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "剧情生成设置保存失败");
    }
  };
  const loadSave = (saveId: string) => {
    if (!story) return;
    try {
      const restored = loadReadingCoStorySave({ scope: story, saveId });
      refresh(restored);
      setMessage("已读档，双方身份与知识状态已恢复。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读档失败");
    }
  };
  const renameStory = () => {
    if (!story) return;
    const title = window.prompt("修改故事名称", story.title);
    if (!title?.trim() || title.trim() === story.title) return;
    try {
      refresh(updateReadingCoStoryMetadata({ scope: story, title }));
      setMessage("故事名称已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重命名失败");
    }
  };
  const toggleStoryStatus = () => {
    if (!story || story.status === "completed") return;
    try {
      const next = updateReadingCoStoryMetadata({
        scope: story,
        status: story.status === "paused" ? "active" : "paused",
      });
      refresh(next);
      setMessage(
        next.status === "paused" ? "共同故事已暂停。" : "共同故事已继续。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "状态更新失败");
    }
  };
  const removeStory = () => {
    if (
      !story ||
      !window.confirm(
        "删除后将同时移除这个共同故事的全部回合和存档，确定继续吗？",
      )
    )
      return;
    try {
      deleteReadingCoStory({ scope: story });
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除共同故事失败");
    }
  };

  if (!story)
    return (
      <div
        data-theme-page="reading-co-story"
        className="flex h-full flex-col bg-[var(--app-bg)] text-[var(--text-primary)]"
      >
        <header className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="返回阅读"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h1 className="text-base font-bold">共同穿书</h1>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto max-w-md space-y-4">
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                AI 好友共同进入故事宇宙
              </p>
              <h2 className="mt-2 text-xl font-bold">和谁一起穿书？</h2>
              <div className="mt-3 space-y-2">
                {friends.map((item) => (
                  <button
                    key={item.relationship.id}
                    type="button"
                    onClick={() => setFriendId(item.relationship.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${friendId === item.relationship.id ? "border-[var(--button-primary-bg)] bg-[var(--surface-raised)]" : "border-[var(--border)]"}`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-raised)] font-bold">
                      {item.character.avatar ? (
                        <img
                          src={item.character.avatar}
                          alt=""
                          className="h-full w-full rounded-xl object-cover"
                        />
                      ) : (
                        item.character.name.slice(0, 1)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {item.character.name}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {item.relationship.relationship} · 独立故事记忆
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(["short", "medium", "long"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setLength(item)}
                    className={`rounded-xl border p-2 text-xs font-bold ${length === item ? "border-[var(--button-primary-bg)] bg-[var(--surface-raised)]" : "border-[var(--border)]"}`}
                  >
                    {item === "short"
                      ? "短篇"
                      : item === "medium"
                        ? "中篇"
                        : "长篇"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!selectedFriend}
                onClick={createStory}
                className="mt-4 h-11 w-full rounded-2xl bg-[var(--button-primary-bg)] text-xs font-bold text-[var(--button-primary-text)] disabled:opacity-40"
              >
                建立共同故事
              </button>
            </section>
            {stories.length > 0 && (
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h2 className="text-sm font-bold">继续已有共同故事</h2>
                <div className="mt-3 space-y-2">
                  {stories.map((item) => (
                    <button
                      key={item.coStoryId}
                      type="button"
                      onClick={() => setSelectedId(item.coStoryId)}
                      className="flex w-full items-center gap-3 rounded-xl bg-[var(--surface-raised)] p-3 text-left"
                    >
                      <UsersRound className="h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate text-xs font-bold">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {item.aiFriend.displayName}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    );

  const panelClass = "space-y-3 text-xs leading-6 text-white/70";
  const panels: ReadingStoryPanel[] = [
    {
      id: "status",
      label: "状态",
      icon: <ListChecks className="h-4 w-4" />,
      content: (
        <div className={panelClass}>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["故事状态", story.status === "completed" ? "已完成" : "进行中"],
              [
                "行动方",
                story.activeActor === "user"
                  ? "你"
                  : story.aiFriend.displayName,
              ],
              ["当前位置", story.currentLocation],
              ["当前时间", story.currentTime],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white/5 p-3">
                <p className="text-[10px] text-white/35">{label}</p>
                <p className="mt-1 font-bold text-white/80">{value}</p>
              </div>
            ))}
          </div>
          <p className="text-white/35">
            共同故事自动保存，并按关系、角色和故事 ID 完全隔离。
          </p>
        </div>
      ),
    },
    {
      id: "roles",
      label: "角色",
      icon: <UserRound className="h-4 w-4" />,
      content: (
        <div className={panelClass}>
          <section className="rounded-2xl bg-cyan-400/5 p-4">
            <p className="text-[10px] text-cyan-200/60">你的角色</p>
            <p className="mt-1 text-sm font-black text-white">
              {story.userCharacterName}
            </p>
            <p>{story.userCharacterRole || "身份待设定"}</p>
            <p className="mt-2">
              目标：{story.userGoals.join("、") || "尚未设定"}
            </p>
          </section>
          <section className="rounded-2xl bg-amber-400/5 p-4">
            <p className="text-[10px] text-amber-200/60">AI 好友</p>
            <p className="mt-1 text-sm font-black text-white">
              {story.aiFriend.characterName}
            </p>
            <p>{story.aiFriend.characterRole || story.aiFriend.displayName}</p>
            <p className="mt-2 whitespace-pre-wrap">
              {story.aiFriend.personaSummary || "沿用既有人设"}
            </p>
          </section>
        </div>
      ),
    },
    {
      id: "saves",
      label: "存档",
      icon: <Save className="h-4 w-4" />,
      content: (
        <div className={panelClass}>
          <button
            type="button"
            onClick={saveStory}
            disabled={!turns.length}
            className="h-11 w-full rounded-2xl bg-amber-600 font-bold text-amber-50 disabled:opacity-40"
          >
            保存当前共同节点
          </button>
          {saves.length ? (
            <div className="space-y-2">
              {saves.map((save) => (
                <button
                  key={save.id}
                  type="button"
                  onClick={() => loadSave(save.id)}
                  className="flex w-full items-center justify-between rounded-2xl bg-white/5 p-4 text-left"
                >
                  <span>{save.label}</span>
                  <span className="text-[10px] text-amber-300">读档</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-white/35">还没有手动存档</p>
          )}
          <p className="text-white/35">
            存档包含双方身份、故事状态和重大行动确认状态。
          </p>
        </div>
      ),
    },
    {
      id: "manage",
      label: "管理",
      icon: <ListChecks className="h-4 w-4" />,
      content: (
        <div className={panelClass}>
          <button
            type="button"
            onClick={renameStory}
            className="h-11 w-full rounded-2xl bg-white/5 font-bold text-white"
          >
            修改故事名称
          </button>
          <button
            type="button"
            onClick={toggleStoryStatus}
            disabled={story.status === "completed"}
            className="h-11 w-full rounded-2xl bg-white/5 font-bold text-white disabled:opacity-35"
          >
            {story.status === "paused" ? "继续故事" : "暂停故事"}
          </button>
          <button
            type="button"
            onClick={removeStory}
            className="h-11 w-full rounded-2xl border border-red-400/25 bg-red-500/10 font-bold text-red-200"
          >
            删除故事及存档
          </button>
          <p className="text-white/35">
            删除只影响当前关系与当前故事宇宙，不会删除原书、其他好友的故事或现实关系记录。
          </p>
        </div>
      ),
    },
  ];

  return (
    <>
    <ReadingStoryPlayShell
      title={story.title}
      subtitle={`${story.aiFriend.displayName} · ${story.origin === "custom" ? "自建世界" : "共同穿书"}`}
      currentChapter={story.currentChapter}
      targetChapters={story.targetChapters}
      currentLocation={story.currentLocation}
      currentTime={story.currentTime}
      statusLabel={story.pendingApproval ? "等待你确认" : "自动保存"}
      choices={latestChoices}
      action={userAction}
      actionPlaceholder="输入你的行动；AI 好友不会替你选择……"
      submitLabel={settings ? "提交我的行动" : "请先配置 AI"}
      busy={busy}
      submitDisabled={
        !userAction.trim() || !settings || Boolean(story.pendingApproval)
      }
      notice={message}
      panels={panels}
      headerAction={
        <button
          type="button"
          onClick={() => setIsGenerationSettingsOpen(true)}
          aria-label="剧情生成设置"
          className="flex h-9 w-9 items-center justify-center rounded-full"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      }
      onActionChange={setUserAction}
      onSubmit={submitUserAction}
      onBack={onClose}
    >
      <section aria-label="共同故事正文" className="min-h-[45vh]">
        {turns.length ? (
          turns.map((turn) => (
            <article key={turn.turnId} className="mb-8 last:mb-0">
              <p className="whitespace-pre-wrap text-[15px] leading-8 text-[#eee8df]/90">
                {turn.narrative}
              </p>
              {turn.dialogue.map((line, index) => (
                <p
                  key={`${turn.turnId}-dialogue-${index}`}
                  className="mt-4 border-l border-amber-400/25 pl-4 text-sm leading-7 text-amber-50/85"
                >
                  <strong>{line.speaker}：</strong>
                  {line.text}
                </p>
              ))}
              {turn.userAction && (
                <p className="mt-3 border-l border-cyan-300/30 pl-4 text-xs leading-6 text-cyan-100/80">
                  你的视角：{turn.userAction}
                </p>
              )}
              {turn.aiAction && (
                <p className="mt-3 border-l border-amber-300/30 pl-4 text-xs leading-6 text-amber-100/80">
                  {story.aiFriend.displayName} 的视角：{turn.aiAction}
                </p>
              )}
            </article>
          ))
        ) : (
          <div className="py-16 text-center">
            <Handshake className="mx-auto h-8 w-8 text-white/20" />
            <p className="mt-4 text-sm font-bold">故事引子正在准备</p>
            <p className="mt-2 text-xs text-white/40">
              无需决定如何开始，第一幕会自动出现。
            </p>
          </div>
        )}
      </section>
      {story.pendingApproval && (
        <section className="mt-6 rounded-3xl border border-amber-300/30 bg-amber-400/10 p-4">
          <div className="flex gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-bold">AI 好友提出重大行动</p>
              <p className="mt-2 text-xs leading-5 text-white/70">
                {story.pendingApproval.action}
              </p>
              <p className="mt-1 text-[10px] text-white/40">
                {story.pendingApproval.reason}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => resolveApproval(false)}
              className="h-10 rounded-xl border border-white/10 text-xs font-bold"
            >
              拒绝
            </button>
            <button
              type="button"
              onClick={() => resolveApproval(true)}
              className="h-10 rounded-xl bg-amber-600 text-xs font-bold"
            >
              接受
            </button>
          </div>
        </section>
      )}
    </ReadingStoryPlayShell>
    {isGenerationSettingsOpen && (
      <ReadingStoryGenerationSettingsDialog
        value={story.generationPreferences}
        onSave={saveGenerationSettings}
        onClose={() => setIsGenerationSettingsOpen(false)}
      />
    )}
    </>
  );
}
