import type { Character, Message } from "../../../types";

export interface GroupReplyDeliveryItem {
  message: Message;
  member: Character;
}

interface GroupReplyDeliveryInput {
  items: readonly GroupReplyDeliveryItem[];
  signal?: AbortSignal;
  onTypingMember: (member: Character | null) => void;
  onTyping: (typing: boolean) => void;
  onSend: (message: Message) => void;
  onComplete: (messages: readonly Message[]) => void;
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
}

/** Delivers generated group replies sequentially while keeping UI timing out of generation. */
export function scheduleGroupReplyDelivery(input: GroupReplyDeliveryInput): void {
  const setTimeoutFn = input.setTimeoutFn || setTimeout;
  const now = input.now || Date.now;
  let currentIndex = 0;
  const stop = () => {
    input.onTyping(false);
    input.onTypingMember(null);
  };
  const sendNext = () => {
    if (input.signal?.aborted) {
      stop();
      return;
    }
    if (currentIndex >= input.items.length) {
      stop();
      return;
    }
    const item = input.items[currentIndex];
    input.onTypingMember(item.member);
    input.onTyping(true);
    setTimeoutFn(() => {
      if (input.signal?.aborted) {
        stop();
        return;
      }
      item.message.timestamp = now();
      input.onSend(item.message);
      currentIndex += 1;
      if (currentIndex < input.items.length) {
        input.onTypingMember(input.items[currentIndex].member);
        input.onTyping(false);
        setTimeoutFn(sendNext, 400);
        return;
      }
      stop();
      input.onComplete(input.items.map((entry) => entry.message));
    }, 1500);
  };

  if (input.items.length === 0) return;
  input.onTypingMember(input.items[0].member);
  input.onTyping(true);
  setTimeoutFn(sendNext, 500);
}
