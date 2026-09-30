import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  AI_REQUEST_LEDGER_UPDATED_EVENT,
  clearAiRequestLedger,
  loadAiRequestLedger,
  type AiRequestEnvelope,
  type AiRequestStatus,
} from "../../../core/monitoring/aiRequestLedger";

const PURPOSE_LABELS: Record<string, string> = {
  chat_reply: "聊天 · 角色回复",
  group_chat_reply: "群聊 · 角色回复",
  offline_story_generate: "线下 · 剧情续写",
  regenerate: "聊天 · 重新生成",
  proactive_message: "聊天 · 主动消息",
  memory_extract: "记忆 · 提取",
  translation: "翻译 · 生成",
  personality_summary: "人设 · 总结",
  inner_voice: "心声 · 生成",
  moment_generate: "朋友圈 · 生成",
  moment_comment: "朋友圈 · 评论",
  moment_reply: "朋友圈 · 回复",
  diary_generate: "日记 · 生成",
  character_phone_generate: "角色手机 · 生成",
  forum_generate: "论坛 · 生成",
  forum_story_generate: "论坛剧情 · 生成",
  reading_generate: "阅读 · 生成",
  cinema_generate: "观影 · 生成",
  image_generate: "图片 · 生成",
  image_analyze: "图片 · 分析",
  tts: "语音 · 合成",
  api_test: "API · 测试",
  model_list: "模型 · 列表",
};

const PURPOSE_CONTEXT_ITEMS: Record<string, string[]> = {
  chat_reply: ["角色人设", "关系上下文", "聊天历史"],
  group_chat_reply: ["群聊成员人设", "群聊关系", "群聊历史"],
  offline_story_generate: ["线下角色人设", "剧情历史", "世界书", "线上记忆"],
  regenerate: ["角色人设", "聊天历史", "原回复"],
  proactive_message: ["角色人设", "关系上下文", "最近对话"],
  memory_extract: ["待提取聊天历史"],
  moment_generate: ["角色人设", "朋友圈历史", "关系权限"],
  moment_comment: ["角色人设", "朋友圈正文", "关系权限"],
  moment_reply: ["角色人设", "朋友圈评论区", "关系权限"],
  diary_generate: ["角色人设", "日记历史", "近期生活记录"],
  reading_generate: ["阅读原文", "阅读历史", "角色人设"],
  character_phone_generate: ["角色人设", "手机应用上下文", "近期生活记录"],
};

const MAX_VISIBLE_RECORDS = 50;

function formatNumber(value: number): string {
  return Math.max(0, Math.floor(value || 0)).toLocaleString("zh-CN");
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "未知时间";
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function tokenFor(record: AiRequestEnvelope, kind: "input" | "output"): { value?: number; source: "actual" | "estimated" | "unavailable" } {
  const actual = kind === "input" ? record.actualInputTokens : record.actualOutputTokens;
  const estimated = kind === "input" ? record.estimatedInputTokens : record.estimatedOutputTokens;
  if (actual !== undefined) return { value: actual, source: "actual" };
  if (estimated !== undefined) return { value: estimated, source: "estimated" };
  return { source: "unavailable" };
}

function tokenTotal(record: AiRequestEnvelope): { value?: number; source: "actual" | "estimated" | "mixed" | "unavailable" } {
  const input = tokenFor(record, "input");
  const output = tokenFor(record, "output");
  if (input.value === undefined && output.value === undefined) return { source: "unavailable" };
  const source = input.source === output.source ? input.source : "mixed";
  return { value: (input.value || 0) + (output.value || 0), source };
}

function tokenSourceLabel(source: "actual" | "estimated" | "mixed" | "unavailable"): string {
  if (source === "actual") return "实际";
  if (source === "estimated") return "估算";
  if (source === "mixed") return "混合";
  return "暂无";
}

function statusLabel(status: AiRequestStatus): string {
  return status === "success" ? "成功" : "失败";
}

function purposeLabel(purpose: string): string {
  return PURPOSE_LABELS[purpose] || purpose;
}

function transportLabel(transport: AiRequestEnvelope["transport"]): string {
  if (transport === "backend_proxy") return "后端代理";
  if (transport === "browser_direct") return "浏览器直连";
  if (transport === "server_provider") return "服务端提供方";
  return "未知";
}

function contextItemsFor(record: AiRequestEnvelope): string[] {
  if (record.contextItems && record.contextItems.length > 0) return record.contextItems;
  return PURPOSE_CONTEXT_ITEMS[record.purpose] || ["历史记录未保存上下文明细"];
}

function cardClass(): string {
  return "rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm";
}

export function DetectionLogsPanel() {
  const [revision, setRevision] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const handleLedgerUpdate = () => setRevision((value) => value + 1);
    window.addEventListener(AI_REQUEST_LEDGER_UPDATED_EVENT, handleLedgerUpdate);
    return () => window.removeEventListener(AI_REQUEST_LEDGER_UPDATED_EVENT, handleLedgerUpdate);
  }, []);

  const records = useMemo(
    () => [...loadAiRequestLedger()]
      .sort((left, right) => right.recordedAt - left.recordedAt)
      .slice(0, MAX_VISIBLE_RECORDS),
    [revision],
  );

  const clearLogs = () => {
    if (!window.confirm("确定清空检测日志吗？只会删除本地调用记录，不会删除聊天、角色、朋友圈、记忆或其他正式数据。")) return;
    clearAiRequestLedger();
    setExpandedId(null);
    setNotice("检测日志已清空");
    setRevision((value) => value + 1);
  };

  return (
    <div className="space-y-4 text-left">
      <section aria-label="API 调用详情">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <h2 className="text-sm font-extrabold text-slate-800">API 调用详情</h2>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">按时间倒序显示全部调用；展开记录可查看本次请求使用的上下文、Token 与字数。</p>
        </div>
        <div className="mt-4 space-y-2">
          {records.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-[11px] text-slate-400">暂无调用记录</div>
          )}
          {records.map((record) => {
            const expanded = expandedId === record.requestId;
            const total = tokenTotal(record);
            const input = tokenFor(record, "input");
            const output = tokenFor(record, "output");
            return (
              <div key={record.requestId} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                <button type="button" onClick={() => setExpandedId(expanded ? null : record.requestId)} className="flex min-h-11 w-full items-start gap-2 text-left" aria-expanded={expanded}>
                  {record.status === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-extrabold text-slate-800">{purposeLabel(record.purpose)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${record.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{statusLabel(record.status)}</span>
                      {record.uncertainDelivery && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">结果待确认</span>}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-slate-400">
                      <span>{formatDate(record.recordedAt)}</span>
                      <span>{record.model || "未标注模型"}</span>
                      <span>{formatNumber(record.durationMs)} ms</span>
                      <span>{total.value === undefined ? "Token 暂无" : `${formatNumber(total.value)} Token · ${tokenSourceLabel(total.source)}`}</span>
                    </span>
                  </span>
                  <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {expanded && (
                  <div className="mt-3 border-t border-slate-200/80 pt-2 text-[10px] leading-4 text-slate-500">
                    <div className="space-y-1">
                      <div className="flex items-start gap-2"><span className="w-16 shrink-0 text-slate-400">调用内容</span><span className="min-w-0 flex-1 break-words">{contextItemsFor(record).join("、")}</span></div>
                      <div className="flex items-start gap-2"><span className="w-16 shrink-0 text-slate-400">模型接口</span><span className="min-w-0 flex-1 break-words">{record.provider || "未标注提供方"} · {record.model || "未标注模型"}{record.endpoint ? ` · ${record.endpoint}` : ""}</span></div>
                      <div className="flex items-start gap-2"><span className="w-16 shrink-0 text-slate-400">传输方式</span><span className="min-w-0 flex-1 break-words">{transportLabel(record.transport)} · 调用 {formatNumber(record.providerRequestCount)} 次</span></div>
                      <div className="flex items-start gap-2"><span className="w-16 shrink-0 text-slate-400">输入</span><span className="min-w-0 flex-1 break-words">{input.value === undefined ? "Token 暂无" : `${formatNumber(input.value)} Token · ${tokenSourceLabel(input.source)}`} · {record.inputCharacters === undefined ? "字数暂无" : `${formatNumber(record.inputCharacters)} 字`}</span></div>
                      <div className="flex items-start gap-2"><span className="w-16 shrink-0 text-slate-400">输出</span><span className="min-w-0 flex-1 break-words">{output.value === undefined ? "Token 暂无" : `${formatNumber(output.value)} Token · ${tokenSourceLabel(output.source)}`} · {record.outputCharacters === undefined ? "字数暂无" : `${formatNumber(record.outputCharacters)} 字`}</span></div>
                      <div className="flex items-start gap-2"><span className="w-16 shrink-0 text-slate-400">本次总计</span><span className="min-w-0 flex-1 break-words">{total.value === undefined ? "Token 暂无" : `${formatNumber(total.value)} Token · ${tokenSourceLabel(total.source)}`}</span></div>
                    </div>
                    {record.status === "failure" && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-rose-700">本次调用未成功：{record.errorCategory}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className={cardClass()} aria-label="日志保留说明">
        <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-500" aria-hidden="true" /><h2 className="text-sm font-extrabold text-slate-800">日志与隐私</h2></div>
        <p className="mt-2 text-[10px] leading-5 text-slate-500">详细调用记录最多保留 30 天或 300 条。日志只保存在本机，清空日志不会影响聊天、角色、朋友圈、记忆或其他正式数据。</p>
      </section>

      <button type="button" onClick={clearLogs} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300" aria-label="清空检测日志">
        <Trash2 className="h-4 w-4" aria-hidden="true" />清空检测日志
      </button>

      {notice && <p role="status" className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] text-slate-600">{notice}</p>}
    </div>
  );
}
