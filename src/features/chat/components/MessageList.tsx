import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject, UIEvent } from "react";
import type { Message } from "../../../types";
import { MessageItem } from "./MessageItem";

/**
 * The chat state/storage layer keeps the complete message history.  This only
 * limits how many rows are mounted at once, so opening a long conversation
 * does not create an equally long DOM tree.
 */
export const DEFAULT_MESSAGE_RENDER_WINDOW_SIZE = 120;

interface MessageListProps {
  key?: string;
  messages: readonly Message[];
  scrollRef: RefObject<HTMLDivElement | null>;
  className: string;
  style: CSSProperties;
  renderMessage: (message: Message, index: number) => ReactNode;
  children: ReactNode;
  header?: ReactNode;
  contentClassName?: string;
  renderWindowSize?: number;
}

function normalizeWindowSize(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MESSAGE_RENDER_WINDOW_SIZE;
  return Math.max(1, Math.floor(value as number));
}

function getMessageId(message: Message | undefined): string | undefined {
  return message?.id;
}

function getInitialWindowStart(messageCount: number, windowSize: number): number {
  return Math.max(0, messageCount - windowSize);
}

export function MessageList({
  messages,
  scrollRef,
  className,
  style,
  renderMessage,
  children,
  header,
  contentClassName,
  renderWindowSize,
}: MessageListProps) {
  const windowSize = normalizeWindowSize(renderWindowSize);
  const firstMessageId = getMessageId(messages[0]);
  const lastMessageId = getMessageId(messages[messages.length - 1]);
  const windowStartRef = useRef(getInitialWindowStart(messages.length, windowSize));
  const messageSnapshotRef = useRef({
    length: messages.length,
    firstMessageId,
    lastMessageId,
  });
  const pendingExpansionRef = useRef(false);
  const [windowStart, setWindowStart] = useState(windowStartRef.current);

  const setRenderWindowStart = (nextStart: number) => {
    const normalizedStart = Math.max(0, Math.min(nextStart, getInitialWindowStart(messages.length, windowSize)));
    windowStartRef.current = normalizedStart;
    setWindowStart((previousStart) => previousStart === normalizedStart ? previousStart : normalizedStart);
  };

  // Keep the latest messages mounted when a new reply is appended, while
  // preserving the reader's position if they are reviewing older history.
  useEffect(() => {
    const previousSnapshot = messageSnapshotRef.current;
    const isNewMessageSequence = previousSnapshot.firstMessageId !== firstMessageId;
    const previousEndStart = getInitialWindowStart(previousSnapshot.length, windowSize);
    const currentStart = windowStartRef.current;

    if (isNewMessageSequence || messages.length < previousSnapshot.length) {
      setRenderWindowStart(getInitialWindowStart(messages.length, windowSize));
    } else if (messages.length > previousSnapshot.length) {
      const wasAtEnd = currentStart >= previousEndStart;
      setRenderWindowStart(wasAtEnd
        ? getInitialWindowStart(messages.length, windowSize)
        : currentStart);
    } else {
      setRenderWindowStart(currentStart);
    }

    messageSnapshotRef.current = { length: messages.length, firstMessageId, lastMessageId };
  }, [firstMessageId, lastMessageId, messages.length, windowSize]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    if (container.scrollTop > 160 || windowStartRef.current <= 0 || pendingExpansionRef.current) return;

    const previousHeight = container.scrollHeight;
    const previousTop = container.scrollTop;
    const nextStart = Math.max(0, windowStartRef.current - windowSize);
    pendingExpansionRef.current = true;
    setRenderWindowStart(nextStart);

    window.requestAnimationFrame(() => {
      const heightDelta = container.scrollHeight - previousHeight;
      // Browsers with scroll anchoring may already compensate for the
      // prepended rows. Only apply the delta when they did not.
      if (Math.abs(container.scrollTop - previousTop) < 16) {
        container.scrollTop = previousTop + heightDelta;
      }
      pendingExpansionRef.current = false;
    });
  };

  const effectiveWindowStart = Math.min(windowStart, getInitialWindowStart(messages.length, windowSize));
  const renderedMessages = messages.slice(effectiveWindowStart);

  return (
    <div ref={scrollRef} className={className} style={style} onScroll={handleScroll}>
      <div className={contentClassName}>
        {header}
        {renderedMessages.map((message, index) => (
          <MessageItem
            key={message.id}
            message={message}
            index={effectiveWindowStart + index}
            render={renderMessage}
          />
        ))}
        {children}
      </div>
    </div>
  );
}
