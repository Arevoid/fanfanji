import type { ReadingCoStoryActionMode, ReadingCoStoryActionRisk, ReadingStoryAiActionResult } from "../../../domain/reading/coStoryTypes";

export class ReadingCoStoryPolicyError extends Error {
  constructor(message: string, public readonly code: "invalid" | "approval_required" | "forbidden") {
    super(message);
    this.name = "ReadingCoStoryPolicyError";
  }
}

export interface ReadingCoStoryActionDecision {
  status: "accepted" | "approval_required";
  action: string;
  rationale: string;
  risk: ReadingCoStoryActionRisk;
  mode: ReadingCoStoryActionMode;
  controlsUserCharacter: false;
  requiresUserApproval: boolean;
}

export function validateReadingStoryAiAction(raw: unknown): ReadingStoryAiActionResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ReadingCoStoryPolicyError("AI 好友行动必须是对象", "invalid");
  const value = raw as Record<string, unknown>;
  const action = typeof value.action === "string" ? value.action.trim().slice(0, 2000) : "";
  const rationale = typeof value.rationale === "string" ? value.rationale.trim().slice(0, 2000) : "";
  const risk = value.risk === "major" ? "major" : value.risk === "low" ? "low" : undefined;
  if (!action || !rationale || !risk) throw new ReadingCoStoryPolicyError("AI 好友行动缺少必要字段", "invalid");
  return {
    action,
    rationale,
    risk,
    requiresUserApproval: Boolean(value.requiresUserApproval),
    controlsUserCharacter: Boolean(value.controlsUserCharacter),
  };
}

export function evaluateReadingStoryAiAction(input: { result: ReadingStoryAiActionResult; mode: ReadingCoStoryActionMode }): ReadingCoStoryActionDecision {
  const result = validateReadingStoryAiAction(input.result);
  if (result.controlsUserCharacter) throw new ReadingCoStoryPolicyError("AI 好友不能替用户控制角色", "forbidden");
  const requiresApproval = result.risk === "major" || result.requiresUserApproval;
  return {
    status: requiresApproval ? "approval_required" : "accepted",
    action: result.action,
    rationale: result.rationale,
    risk: result.risk,
    mode: input.mode,
    controlsUserCharacter: false,
    requiresUserApproval: requiresApproval,
  };
}
