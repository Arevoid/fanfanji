const RED_PACKET_SEMANTIC_SELECTOR = /\.wechat-redpacket__[a-z0-9_-]+\b/i;
const CSS_PROPERTY = /^-?(?:-?[a-z_])[a-z0-9_-]*$/i;

function stripCssComments(source: string): string {
  let output = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    output += character;
  }
  return output;
}

function stripQuotedText(source: string): string {
  let output = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      output += " ";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      output += " ";
      continue;
    }
    output += character;
  }
  return output;
}

function findMatchingBrace(source: string, openingIndex: number): number {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return source.length;
}

function hasEffectiveDeclaration(block: string): boolean {
  let segmentStart = 0;
  let parentheses = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  const segments: string[] = [];
  const pushSegment = (end: number) => {
    const segment = block.slice(segmentStart, end).trim();
    if (segment) segments.push(segment);
    segmentStart = end + 1;
  };

  for (let index = 0; index < block.length; index += 1) {
    const character = block[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (character === ";" && parentheses === 0) pushSegment(index);
  }
  pushSegment(block.length);

  return segments.some((segment) => {
    const colonIndex = segment.indexOf(":");
    if (colonIndex <= 0) return false;
    const property = segment.slice(0, colonIndex).trim();
    const value = segment.slice(colonIndex + 1).trim().replace(/!important\s*$/i, "").trim();
    return CSS_PROPERTY.test(property) && value.length > 0;
  });
}

function hasSemanticRule(source: string, start = 0, end = source.length): boolean {
  let cursor = start;
  while (cursor < end) {
    const openingIndex = source.indexOf("{", cursor);
    if (openingIndex < 0 || openingIndex >= end) return false;
    const closingIndex = Math.min(findMatchingBrace(source, openingIndex), end);
    const prelude = stripQuotedText(source.slice(cursor, openingIndex).trim());
    const block = source.slice(openingIndex + 1, closingIndex);
    if (RED_PACKET_SEMANTIC_SELECTOR.test(prelude) && hasEffectiveDeclaration(block)) return true;
    if (closingIndex > openingIndex + 1 && hasSemanticRule(source, openingIndex + 1, closingIndex)) return true;
    cursor = closingIndex + 1;
  }
  return false;
}

/**
 * The semantic red-packet DOM is a deliberate opt-in for chat themes that
 * actually use its stable hooks. Merely copying the empty hook declarations
 * from the built-in theme template (or mentioning a hook in a comment) must
 * keep the legacy/default Pay card active.
 */
export function hasWechatRedPacketSemanticCss(sources: ReadonlyArray<string | null | undefined>): boolean {
  return sources.some((source) => Boolean(source && hasSemanticRule(stripCssComments(source))));
}
