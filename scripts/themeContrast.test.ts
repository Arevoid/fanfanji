import assert from "node:assert/strict";

const hex = (value: string) => {
  const normalized = value.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
};
const luminance = (value: string) => hex(value).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

const tokens = {
  appBg: "#171719", surface: "#242426", input: "#303034",
  primary: "#f3f3f5", secondary: "#c0c0c6", tertiary: "#96969f",
  placeholder: "#aaaab2", disabled: "#696970", accent: "#81adff",
  accentContrast: "#101318", danger: "#ff8074", success: "#67ca8d", warning: "#f1bd61",
};
for (const [foreground, background, minimum] of [
  [tokens.primary, tokens.appBg, 7], [tokens.primary, tokens.surface, 7],
  [tokens.secondary, tokens.surface, 4.5], [tokens.tertiary, tokens.surface, 4.5],
  [tokens.placeholder, tokens.input, 4.5], [tokens.accentContrast, tokens.accent, 4.5],
  [tokens.danger, tokens.surface, 4.5], [tokens.success, tokens.surface, 4.5], [tokens.warning, tokens.surface, 4.5],
] as const) assert.ok(contrast(foreground, background) >= minimum, `${foreground} on ${background} is below ${minimum}:1`);
assert.ok(contrast(tokens.disabled, tokens.surface) >= 2, "disabled text must remain distinguishable");
console.log("PASS dark semantic-token contrast audit");
