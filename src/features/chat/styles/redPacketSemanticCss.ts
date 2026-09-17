/**
 * The semantic red-packet DOM is a deliberate opt-in for chat themes that
 * actually style its stable hooks.  The built-in theme template documents
 * those hooks with an empty selector block, so checking for a class-name
 * mention alone would incorrectly replace the legacy/default Pay card.
 */
export function hasWechatRedPacketSemanticCss(sources: ReadonlyArray<string | null | undefined>): boolean {
  return sources.some((source) => {
    if (!source) return false;

    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
    // Look at individual rules rather than the whole stylesheet.  A semantic
    // selector only opts in when its declaration block contains at least one
    // real CSS declaration; empty hook/interface blocks do not.
    const semanticRule = /[^{}]*\.wechat-redpacket__[\w-]+[^{}]*\{([^{}]*)\}/g;
    for (const match of withoutComments.matchAll(semanticRule)) {
      if (/(?:^|;)\s*[\w-]+\s*:/m.test(match[1])) return true;
    }
    return false;
  });
}
