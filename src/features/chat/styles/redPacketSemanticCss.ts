/**
 * The semantic red-packet DOM is a deliberate opt-in for chat themes that
 * actually use its stable hooks. Unrelated custom chat CSS should keep the
 * legacy/default card layout.
 */
export function hasWechatRedPacketSemanticCss(sources: ReadonlyArray<string | null | undefined>): boolean {
  return sources.some((source) => {
    if (!source) return false;
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
    return /\.wechat-redpacket__[\w-]+/.test(withoutComments);
  });
}
