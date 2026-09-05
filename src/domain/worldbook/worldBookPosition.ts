import type { WorldBookPosition } from "../../types";

export type WorldBookImportProfile = "generic" | "silly-tavern";

export function normalizeImportedWorldBookPosition(
  rawPosition: unknown,
  profile: WorldBookImportProfile = "generic",
): WorldBookPosition {
  if (profile === "silly-tavern") {
    if (rawPosition === undefined || rawPosition === null) return "after_char_def";
    const value = String(rawPosition).toLowerCase();
    if (value.includes("author") || value === "3") return "after_char_def";
    if (value.includes("before_char") || value.includes("before_body") || value === "0") return "before_char_def";
    if (value.includes("after_char") || value.includes("after_body") || value === "1") return "after_char_def";
    if (value.includes("chat") || value.includes("story") || value === "2") return "before_chat_history";
    if (value.includes("depth") || value === "4") return "at_depth";
    if (value.includes("main")) return "after_main_prompt";
    return "after_char_def";
  }

  if (typeof rawPosition === "string") {
    const value = rawPosition.toLowerCase();
    if (value.includes("system") || value.includes("main") || value.includes("first")) return "after_main_prompt";
    if (value.includes("before_char")) return "before_char_def";
    if (value.includes("after_char")) return "after_char_def";
    if (value.includes("an") || value.includes("author") || value.includes("note")) return "after_char_def";
    if (value === "at_depth" || value.includes("at-depth") || value.includes("depth")) return "at_depth";
    if (value.includes("history") || value.includes("chat")) return "before_chat_history";
    return "after_char_def";
  }
  if (typeof rawPosition === "number") {
    if (rawPosition === 0) return "before_char_def";
    if (rawPosition === 1 || rawPosition === 2 || rawPosition === 3) return "after_char_def";
    if (rawPosition === 4) return "at_depth";
    return "after_main_prompt";
  }
  return "after_char_def";
}
