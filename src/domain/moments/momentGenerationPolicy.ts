/** Missing legacy preference means enabled, but never authorizes an idle request. */
export function canGenerateCharacterMoment(enabled: boolean | undefined, trigger: "startup" | "timer" | "user_requested"): boolean {
  return enabled !== false && trigger === "user_requested";
}

/** A model directive alone is not authorization to purchase another generation. */
export function hasExplicitMomentGenerationRequest(text: string): boolean {
  if (/(?:不要|别|不用|禁止|不许).{0,16}(?:朋友圈|moment)|(?:发过|会发|怎么发).{0,8}朋友圈/u.test(text)) return false;
  return /(?:请|帮我|替我|给我|你|现在|能不能|可以).{0,12}(?:发|发布|更新|生成|写|晒).{0,12}朋友圈|^(?:发|发布|更新|生成|写|晒).{0,12}朋友圈/u.test(text)
    || /(?:please|can you|could you).{0,30}(?:publish|post|generate).{0,20}(?:moment|朋友圈)/iu.test(text);
}
