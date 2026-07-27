const IMAGE_NOUN = "(?:照片|图片|图像|相片|自拍(?:照)?)";
const EXPLICIT_IMAGE_REQUEST = new RegExp(
  `(?:给我|给咱|发我|来|拍|生成).{0,18}${IMAGE_NOUN}|(?:发|拍|生成).{0,10}${IMAGE_NOUN}.{0,12}(?:给我|给咱|发我|看看)|${IMAGE_NOUN}.{0,12}(?:给我|给咱|发我|看看|来一张|生成)`,
  "i",
);
const NEGATED_OR_QUOTED = new RegExp(
  `(?:不要|别|无需|不用|禁止|不想|别再|没让你|我没让你|并非|不是).{0,18}(?:发|拍|生成)?.{0,12}${IMAGE_NOUN}|(?:“|"|《).{0,40}(?:发.{0,8}${IMAGE_NOUN}|生成.{0,8}${IMAGE_NOUN})`,
  "i",
);

/** Conservative by design: uncertainty never spends image quota. */
export function isExplicitImageRequest(text: string): boolean {
  const normalized = text.trim();
  return normalized.length > 0 && !NEGATED_OR_QUOTED.test(normalized) && EXPLICIT_IMAGE_REQUEST.test(normalized);
}

export function assertImageGenerationTrigger(trigger: "manual" | "explicit-user-text", userText?: string): void {
  if (trigger === "manual") return;
  if (trigger === "explicit-user-text" && isExplicitImageRequest(userText || "")) return;
  throw new Error("图片生成已拦截：只有明确的用户图片请求或手动确认可以调用图片 API。");
}
