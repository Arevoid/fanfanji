const NESTED_AT_RULES = /^(?:@media|@supports|@container|@layer|@document|@scope)\b/i;
const NON_SELECTOR_AT_RULES = /^(?:@(?:-\w+-)?keyframes|@font-face|@page|@property)\b/i;
const SCOPE_SELECTOR = "#conv-screen.user-custom-chat-css:not([data-chat-settings-open=\"true\"]) #api-chat-screen > .chat-content-scope";
const ROOT_CLASS_SELECTOR = /^(?:\.chat-page|\.chat-theme|\.style-liquid-glass|\.user-custom-chat-css)(?=[.#:\[\s]|$)/i;

export function normalizeChatCssSyntax(css: string): string {
  return css.replace(/[\u2010-\u2015\u2212]/g, "-");
}

function splitLeadingCssTrivia(value: string): { leading: string; body: string } {
  let index = 0;
  while (index < value.length) {
    if (/\s/.test(value[index])) { index += 1; continue; }
    if (value.startsWith("/*", index)) {
      const end = value.indexOf("*/", index + 2);
      if (end < 0) return { leading: value, body: "" };
      index = end + 2;
      continue;
    }
    break;
  }
  return { leading: value.slice(0, index), body: value.slice(index) };
}

function splitCssSelectorList(value: string): string[] {
  const selectors: string[] = [];
  let start = 0, parentheses = 0, brackets = 0, quote = "", comment = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index], next = value[index + 1];
    if (comment) { if (char === "*" && next === "/") { comment = false; index += 1; } continue; }
    if (!quote && char === "/" && next === "*") { comment = true; index += 1; continue; }
    if (quote) { if (char === "\\") index += 1; else if (char === quote) quote = ""; continue; }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "(") parentheses += 1;
    else if (char === ")") parentheses = Math.max(0, parentheses - 1);
    else if (char === "[") brackets += 1;
    else if (char === "]") brackets = Math.max(0, brackets - 1);
    else if (char === "," && parentheses === 0 && brackets === 0) { selectors.push(value.slice(start, index)); start = index + 1; }
  }
  selectors.push(value.slice(start));
  return selectors;
}

function prefixSelectors(prelude: string): string {
  const { leading, body } = splitLeadingCssTrivia(prelude);
  const trimmed = body.trim();
  if (!trimmed || trimmed.startsWith("@")) return prelude;
  const selectorBody = body.trimEnd();
  const trailing = body.slice(selectorBody.length);
  const prefixed = splitCssSelectorList(selectorBody).map((selector) => {
    const current = selector.trim();
    if (!current || current.startsWith(SCOPE_SELECTOR)) return selector;
    if (current.startsWith("#conv-screen")) return selector.replace("#conv-screen", SCOPE_SELECTOR);
    if (ROOT_CLASS_SELECTOR.test(current)) return selector.replace(current, `${SCOPE_SELECTOR}${current}`);
    if (current === ":root") return selector.replace(current, SCOPE_SELECTOR);
    if (current.startsWith(":root")) return selector.replace(current, `${SCOPE_SELECTOR}${current.slice(5)}`);
    if (/^(?:html|body)(?:\b|\s|[.#:\[])/i.test(current)) {
      return selector.replace(current, `${SCOPE_SELECTOR}${current.slice(current.match(/^(?:html|body)/i)?.[0].length || 0)}`);
    }
    return selector.replace(current, `${SCOPE_SELECTOR} ${current}`);
  }).join(",");
  return `${leading}${prefixed}${trailing}`;
}

/** Prefixes user selectors while preserving declarations, comments and keyframes. */
export function scopeUserChatCss(input: string): string {
  const css = normalizeChatCssSyntax(input);
  const output: string[] = [];
  const stack: Array<{ prefixRules: boolean; segmentStart: number }> = [{ prefixRules: true, segmentStart: 0 }];
  let emittedUntil = 0, comment = false, quote = "";
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index], next = css[index + 1];
    if (comment) { if (char === "*" && next === "/") { comment = false; index += 1; } continue; }
    if (!quote && char === "/" && next === "*") { comment = true; index += 1; continue; }
    if (quote) { if (char === "\\") index += 1; else if (char === quote) quote = ""; continue; }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === ";") { stack[stack.length - 1].segmentStart = index + 1; continue; }
    if (char === "{") {
      const current = stack[stack.length - 1];
      const prelude = css.slice(current.segmentStart, index);
      const atRule = splitLeadingCssTrivia(prelude).body.trim();
      const nested = NESTED_AT_RULES.test(atRule), nonSelector = NON_SELECTOR_AT_RULES.test(atRule);
      output.push(css.slice(emittedUntil, current.segmentStart), current.prefixRules && !atRule.startsWith("@") && !nonSelector ? prefixSelectors(prelude) : prelude, "{", "");
      stack.push({ prefixRules: current.prefixRules && (nested || !atRule.startsWith("@")) && !nonSelector, segmentStart: index + 1 });
      emittedUntil = index + 1;
      continue;
    }
    if (char === "}") {
      const current = stack.pop();
      if (!current) continue;
      output.push(css.slice(emittedUntil, index), "}");
      emittedUntil = index + 1;
      if (stack.length) stack[stack.length - 1].segmentStart = index + 1;
    }
  }
  output.push(css.slice(emittedUntil));
  return output.join("");
}

function appendImportant(segment: string): string {
  const trimmed = segment.replace(/\s+$/, "");
  if (!trimmed || /!\s*important\s*$/i.test(trimmed)) return segment;
  return `${trimmed} !important${segment.slice(trimmed.length)}`;
}

/** Makes user declarations the last authority without altering keyframe descriptors. */
export function prioritizeUserChatCss(css: string): string {
  const output: string[] = [];
  const stack: Array<{ declarationBlock: boolean; skipPriority: boolean; segmentStart: number }> = [{ declarationBlock: false, skipPriority: false, segmentStart: 0 }];
  let emittedUntil = 0, comment = false, quote = "", parentheses = 0;
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index], next = css[index + 1];
    if (comment) { if (char === "*" && next === "/") { comment = false; index += 1; } continue; }
    if (!quote && char === "/" && next === "*") { comment = true; index += 1; continue; }
    if (quote) { if (char === "\\") index += 1; else if (char === quote) quote = ""; continue; }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "(") { parentheses += 1; continue; }
    if (char === ")") { parentheses = Math.max(0, parentheses - 1); continue; }
    if (parentheses > 0) continue;
    if (char === ";") {
      const current = stack[stack.length - 1];
      if (current.declarationBlock && !current.skipPriority) {
        output.push(css.slice(emittedUntil, current.segmentStart), appendImportant(css.slice(current.segmentStart, index)), ";");
        emittedUntil = index + 1;
      }
      current.segmentStart = index + 1;
      continue;
    }
    if (char === "{") {
      const current = stack[stack.length - 1], prelude = css.slice(current.segmentStart, index);
      const atRule = splitLeadingCssTrivia(prelude).body.trim(), nonSelector = NON_SELECTOR_AT_RULES.test(atRule);
      output.push(css.slice(emittedUntil, current.segmentStart), prelude, "{");
      emittedUntil = index + 1;
      stack.push({ declarationBlock: !atRule.startsWith("@") && !current.skipPriority, skipPriority: current.skipPriority || nonSelector, segmentStart: index + 1 });
      continue;
    }
    if (char === "}") {
      const current = stack.pop();
      if (!current) continue;
      if (current.declarationBlock && !current.skipPriority) output.push(css.slice(emittedUntil, current.segmentStart), appendImportant(css.slice(current.segmentStart, index)));
      else output.push(css.slice(emittedUntil, index));
      output.push("}");
      emittedUntil = index + 1;
      const parent = stack[stack.length - 1];
      if (parent) parent.segmentStart = index + 1;
    }
  }
  output.push(css.slice(emittedUntil));
  return output.join("");
}
