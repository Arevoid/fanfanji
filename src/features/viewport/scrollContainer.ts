export interface ScrollContainerLike {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
  scrollTo?: (options: ScrollToOptions) => void;
}

/**
 * Scroll only the chat's overflow container. Element#scrollIntoView may also
 * move the page and feed back into iOS Safari's animated visual viewport.
 */
export function scrollContainerToBottom(
  container: ScrollContainerLike,
  behavior: ScrollBehavior = "auto",
): void {
  const top = Math.max(0, container.scrollHeight - container.clientHeight);
  if (behavior === "smooth" && typeof container.scrollTo === "function") {
    container.scrollTo({ top, behavior });
    return;
  }
  container.scrollTop = top;
}
