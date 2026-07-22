/** Parenthesized actions, narration, and stage directions are never spoken voice bubbles. */
export const isBracketWrappedNarration = (text: string): boolean =>
  /^\s*[（(][\s\S]*[）)]\s*$/.test(text);
