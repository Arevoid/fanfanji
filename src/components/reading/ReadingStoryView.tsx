import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  FileText,
  ListChecks,
  Save,
  ScrollText,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import type { ReadingBook } from "../../domain/reading/types";
import type {
  ReadingStoryLength,
  ReadingStoryState,
} from "../../domain/reading/storyTypes";
import type { UserSettings } from "../../types";
import { listReadingStories } from "../../core/storage/repositories/readingStoryRepository";
import {
  createReadingStory,
  commitReadingStoryTurn,
  createReadingStorySave,
  deleteReadingStory,
  getReadingStory,
  listReadingStorySaves,
  listReadingStoryTurns,
  loadReadingStorySave,
  ReadingStoryError,
  updateReadingStoryMetadata,
} from "../../features/reading/story/readingStory";
import { generateReadingStoryTurn } from "../../features/reading/story/readingStoryGeneration";
import { ensureDistinctReadingStoryChoices } from "../../features/reading/story/readingStoryChoices";
import { getReadingBookBible } from "../../core/storage/repositories/readingAnalysisRepository";
import ReadingStoryPlayShell, {
  type ReadingStoryPanel,
} from "./ReadingStoryPlayShell";
import ReadingStoryGenerationSettingsDialog from "./ReadingStoryGenerationSettingsDialog";

interface ReadingStoryViewProps {
  userIdentityId: string;
  book?: ReadingBook;
  initialStoryId?: string;
  settings?: UserSettings;
  onClose: () => void;
}
const makeId = (): string =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function ReadingStoryView({
  userIdentityId,
  book,
  initialStoryId,
  settings,
  onClose,
}: ReadingStoryViewProps) {
  const [stories, setStories] = useState(() =>
    listReadingStories(userIdentityId),
  );
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(
    () =>
      initialStoryId || listReadingStories(userIdentityId)[0]?.storyId || null,
  );
  const [action, setAction] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGenerationSettingsOpen, setIsGenerationSettingsOpen] = useState(false);
  const story = useMemo(
    () =>
      selectedStoryId
        ? getReadingStory({ userIdentityId, storyId: selectedStoryId })
        : undefined,
    [selectedStoryId, stories, userIdentityId],
  );
  const scope = story ? { userIdentityId, storyId: story.storyId } : null;
  const turns = useMemo(
    () => (scope ? listReadingStoryTurns(scope) : []),
    [scope, stories],
  );
  const saves = useMemo(
    () => (scope ? listReadingStorySaves(scope) : []),
    [scope, stories],
  );
  const bookBible = book
    ? getReadingBookBible({ userIdentityId, bookId: book.id })
    : undefined;
  const refresh = (next?: ReadingStoryState) => {
    setStories(listReadingStories(userIdentityId));
    if (next) setSelectedStoryId(next.storyId);
  };

  const createOpening = (target: ReadingStoryState) =>
    commitReadingStoryTurn({
      scope: target,
      result: {
        narrative: `《${book?.title || "这个世界"}》的文字在眼前散开，你以“${target.characterName}”的身份真正落入故事。原有剧情已经开始运转，远处传来的动静预示着第一场事件即将发生。`,
        dialogue: [],
        choices: [
          { id: "a", label: "先观察周围，确认当前位置与时间" },
          { id: "b", label: "寻找一位原故事人物，判断剧情进度" },
          { id: "c", label: "检查自己的身份、物品和目标" },
          { id: "d", label: "按自己的想法行动或说话" },
        ],
        stateChanges: ["故事已开始"],
        discoveredIntel: [],
        taskChanges: [],
        relationshipChanges: [],
        currentLocation: "故事入口",
        currentTime: "故事开始",
        chapterProgress: 0.05,
        shouldEndChapter: false,
      },
    });

  useEffect(() => {
    if (!story || turns.length > 0) return;
    try {
      createOpening(story);
      refresh(story);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "故事引子创建失败");
    }
  }, [story?.storyId, turns.length]);

  const startStory = (length: ReadingStoryLength) => {
    if (!book) return;
    try {
      const next = createReadingStory({
        scope: { userIdentityId, storyId: `story-${makeId()}` },
        title: `穿书：《${book.title}》`,
        bookId: book.id,
        entryMode: "soul_wear",
        length,
        characterName: "未命名角色",
        characterRole: "待设定",
        goals: ["在故事中活下来，找到自己的道路"],
      });
      createOpening(next);
      refresh(next);
      setMessage("故事引子已经生成，可以从选项或自由行动继续。");
    } catch (error) {
      setMessage(
        error instanceof ReadingStoryError ? error.message : "故事创建失败",
      );
    }
  };

  const submitAction = async () => {
    if (!story || !settings || !action.trim() || isGenerating) return;
    if (story.status !== "active") {
      setMessage(
        story.status === "completed"
          ? "故事已经完成，不能继续生成。"
          : "故事已暂停，请先在管理面板中继续故事。",
      );
      return;
    }
    setIsGenerating(true);
    setMessage("正在生成下一回合，模型只会看到当前故事状态和最近回合。");
    try {
      const generated = await generateReadingStoryTurn({
        story,
        userAction: action,
        requestId: makeId(),
        bookTitle: book?.title,
        bookContext: bookBible
          ? [
              bookBible.premise,
              ...bookBible.worldRules,
              ...bookBible.storyLines,
              ...bookBible.timeline,
            ]
              .filter(Boolean)
              .join("\n")
          : undefined,
        settings: {
          apiKey: settings.apiKey || "",
          selectedModel: settings.selectedModel || "",
          apiEndpoint: settings.apiEndpoint,
          apiTemperature: settings.apiTemperature,
          streamCompatible: settings.streamCompatible,
        },
      });
      setAction("");
      refresh(generated.story);
      setMessage("新回合已生成并自动保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "故事回合生成失败");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveStory = () => {
    if (!scope || !turns.length) return;
    try {
      createReadingStorySave({ scope, label: `第 ${turns.length} 回合` });
      refresh(story);
      setMessage("已创建手动存档。");
    } catch (error) {
      setMessage(
        error instanceof ReadingStoryError ? error.message : "存档失败",
      );
    }
  };
  const saveGenerationSettings = (generationPreferences: NonNullable<ReadingStoryState["generationPreferences"]>) => {
    if (!scope) return;
    try {
      refresh(updateReadingStoryMetadata({ scope, generationPreferences }));
      setIsGenerationSettingsOpen(false);
      setMessage("剧情生成设置已保存，将从下一节点开始生效。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "剧情生成设置保存失败");
    }
  };
  const loadSave = (saveId: string) => {
    if (!scope) return;
    try {
      const loaded = loadReadingStorySave({ scope, saveId });
      refresh(loaded);
      setMessage("已读档，故事状态已恢复。");
    } catch (error) {
      setMessage(
        error instanceof ReadingStoryError ? error.message : "读档失败",
      );
    }
  };
  const renameStory = () => {
    if (!scope || !story) return;
    const title = window.prompt("修改故事名称", story.title);
    if (!title?.trim() || title.trim() === story.title) return;
    try {
      refresh(updateReadingStoryMetadata({ scope, title }));
      setMessage("故事名称已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重命名失败");
    }
  };
  const toggleStoryStatus = () => {
    if (!scope || !story || story.status === "completed") return;
    try {
      const next = updateReadingStoryMetadata({
        scope,
        status: story.status === "paused" ? "active" : "paused",
      });
      refresh(next);
      setMessage(next.status === "paused" ? "故事已暂停。" : "故事已继续。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "状态更新失败");
    }
  };
  const removeStory = () => {
    if (
      !scope ||
      !window.confirm("删除后将同时移除该故事的全部回合和存档，确定继续吗？")
    )
      return;
    try {
      deleteReadingStory({ scope });
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除故事失败");
    }
  };

  if (!story)
    return (
      <div
        data-theme-page="reading-story"
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
          <h1 className="text-base font-bold">穿书</h1>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto max-w-md space-y-4">
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                故事宇宙
              </p>
              <h2 className="mt-2 text-xl font-bold">
                进入《{book?.title || "自定义世界"}》
              </h2>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                选择故事长度建立独立存档；穿书内容不会同步到现实关系记忆。
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(["short", "medium", "long"] as ReadingStoryLength[]).map(
                  (length) => (
                    <button
                      key={length}
                      type="button"
                      onClick={() => startStory(length)}
                      className="rounded-2xl border border-[var(--border)] p-3 text-left"
                    >
                      <p className="text-sm font-bold">
                        {length === "short"
                          ? "短篇"
                          : length === "medium"
                            ? "中篇"
                            : "长篇"}
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                        {length === "short"
                          ? "约 3 章"
                          : length === "medium"
                            ? "约 8 章"
                            : "约 20 章"}
                      </p>
                    </button>
                  ),
                )}
              </div>
            </section>
            {stories.length > 0 && (
              <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h2 className="text-sm font-bold">继续已有故事</h2>
                <div className="mt-3 space-y-2">
                  {stories.map((item) => (
                    <button
                      key={item.storyId}
                      type="button"
                      onClick={() => setSelectedStoryId(item.storyId)}
                      className="flex w-full items-center gap-3 rounded-2xl bg-[var(--surface-raised)] p-3 text-left"
                    >
                      <ScrollText className="h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate text-xs font-bold">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        第 {item.currentChapter}/{item.targetChapters} 章
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

  const latestTurn = turns.at(-1);
  const latestChoices = latestTurn?.choices.length
    ? ensureDistinctReadingStoryChoices(latestTurn.choices)
    : story.status === "completed"
      ? []
      : [
          { id: "a", label: "观察眼前变化，确认最值得注意的线索" },
          { id: "b", label: "主动接触在场的人，开口回应或询问" },
          { id: "c", label: "谨慎行动，先确保自身处境安全" },
          { id: "d", label: "按自己的想法行动或说话" },
        ];
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
              ["篇幅", `${story.currentChapter}/${story.targetChapters} 章`],
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
            所有回合都会自动保存；手动存档用于保留关键节点。
          </p>
        </div>
      ),
    },
    {
      id: "profile",
      label: "角色",
      icon: <UserRound className="h-4 w-4" />,
      content: (
        <div className={panelClass}>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-sm font-black text-white">
              {story.characterName}
            </p>
            <p>{story.characterRole || "身份待设定"}</p>
            <p className="mt-2">
              穿法：{story.entryMode === "soul_wear" ? "魂穿" : "身穿"}
            </p>
            <p className="mt-2">目标：{story.goals.join("、") || "尚未设定"}</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="font-bold text-white">物品</p>
            <p className="mt-1">{story.inventory.join("、") || "暂无物品"}</p>
          </div>
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
            保存当前节点
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
        </div>
      ),
    },
  ];

  return (
    <>
    <ReadingStoryPlayShell
      title={story.title}
      subtitle={`${story.characterName} · 单人故事`}
      currentChapter={story.currentChapter}
      targetChapters={story.targetChapters}
      currentLocation={story.currentLocation}
      currentTime={story.currentTime}
      statusLabel={story.status === "completed" ? "故事已完成" : "自动保存"}
      choices={latestChoices}
      action={action}
      actionPlaceholder="输入你的行动，或先选择一个方向……"
      submitLabel={settings ? "提交行动" : "请先配置 AI"}
      busy={isGenerating}
      submitDisabled={!action.trim() || !settings || isGenerating}
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
      onActionChange={setAction}
      onSubmit={submitAction}
      onBack={onClose}
    >
      <section aria-label="故事正文" className="min-h-[45vh]">
        {turns.length ? (
          turns.map((turn) => (
            <article key={turn.id} className="mb-8 last:mb-0">
              <p className="whitespace-pre-wrap text-[15px] leading-8 text-[#eee8df]/90">
                {turn.narrative}
              </p>
              {turn.dialogue.map((line, index) => (
                <p
                  key={`${turn.id}-${index}`}
                  className="mt-4 border-l border-amber-400/25 pl-4 text-sm leading-7 text-amber-50/85"
                >
                  <strong>{line.speaker}：</strong>
                  {line.text}
                </p>
              ))}
            </article>
          ))
        ) : (
          <div className="py-16 text-center">
            <FileText className="mx-auto h-8 w-8 text-white/20" />
            <p className="mt-4 text-sm font-bold">故事引子正在准备</p>
            <p className="mt-2 text-xs leading-5 text-white/40">
              无需决定如何开始，第一幕会自动出现。
            </p>
          </div>
        )}
      </section>
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
