export interface CharacterLifeActivity {
  goalId: string; goal: string; kind: "hobby" | "habit" | "work" | "social" | "wellbeing";
  steps: string[]; progress: number; energy: number; stress: number; friction?: string;
}
export function isCharacterLifeActivity(value: unknown): value is CharacterLifeActivity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.goalId === "string" && item.goalId.length > 0 && typeof item.goal === "string" && item.goal.length >= 2 && item.goal.length <= 120
    && ["hobby", "habit", "work", "social", "wellbeing"].includes(String(item.kind))
    && Array.isArray(item.steps) && item.steps.length >= 1 && item.steps.length <= 6 && item.steps.every((step) => typeof step === "string" && step.length >= 2 && step.length <= 120)
    && Number.isInteger(item.progress) && Number(item.progress) >= 0 && Number(item.progress) <= item.steps.length
    && [item.energy, item.stress].every((amount) => typeof amount === "number" && Number.isFinite(amount) && amount >= 0 && amount <= 1)
    && (item.friction === undefined || typeof item.friction === "string" && item.friction.length <= 120);
}
export function proposeLifeActivity(raw: unknown, summary: string, id: string, completed: boolean): CharacterLifeActivity | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  const activity = { goalId: `goal:${id}`, goal: input.goal, kind: input.kind, steps: input.steps,
    progress: completed ? Array.isArray(input.steps) ? input.steps.length : 0 : 0, energy: .6, stress: .3,
    ...(typeof input.friction === "string" && summary.includes(input.friction) ? { friction: input.friction } : {}) };
  if (!isCharacterLifeActivity(activity) || !summary.includes(activity.goal)) return undefined;
  if (completed && activity.steps.length !== 1) return undefined;
  if ([activity.goal, ...activity.steps, activity.friction || ""].some((text) => /用户|对方|我们|见你|找你|给你|和你|你的|私聊|秘密|结婚|分手|死亡/u.test(text))) return undefined;
  return activity;
}
export function advanceLifeActivity(previous: CharacterLifeActivity, stepIndex: unknown, effects: unknown): CharacterLifeActivity | undefined {
  if (stepIndex !== previous.progress || previous.progress >= previous.steps.length) return undefined;
  const update = effects && typeof effects === "object" && !Array.isArray(effects) ? effects as Record<string, unknown> : {};
  const delta = (key: string) => typeof update[key] === "number" && Number.isFinite(update[key]) ? Math.max(-.1, Math.min(.1, update[key] as number)) : 0;
  return { ...previous, progress: previous.progress + 1,
    energy: Math.max(0, Math.min(1, previous.energy + delta("energy"))), stress: Math.max(0, Math.min(1, previous.stress + delta("stress"))) };
}
