import type { Message } from "../../../types";

export interface DirectReplyCandidatesForDelivery {
  messages: Message[];
  bubbleTexts: string[];
}

/**
 * Delivery keeps throwing the original failure to preserve the existing
 * caller contract, while exposing the messages that were already committed.
 * The executor uses this metadata to avoid reporting a false zero-delivery
 * result after a later bubble fails.
 */
export class DirectReplyDeliveryError extends Error {
  readonly deliveredMessages: readonly Message[];
  readonly originalError: unknown;

  constructor(originalError: unknown, deliveredMessages: readonly Message[]) {
    super(originalError instanceof Error ? originalError.message : String(originalError || "Direct reply delivery failed"));
    this.name = "DirectReplyDeliveryError";
    this.originalError = originalError;
    this.deliveredMessages = [...deliveredMessages];
  }
}

export async function deliverDirectReplyCandidates(input: {
  candidates: DirectReplyCandidatesForDelivery;
  signal?: AbortSignal;
  shouldCancel: () => boolean;
  onTyping: (typing: boolean) => void;
  onSendMessage: (message: Message) => void | Promise<void>;
  now?: () => number;
  random?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}): Promise<Message[]> {
  const now = input.now || Date.now;
  const random = input.random || Math.random;
  const wait = input.wait || ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const createdMessages: Message[] = [];
  try {
    for (let index = 0; index < input.candidates.messages.length; index += 1) {
      if (input.shouldCancel() || input.signal?.aborted) break;
      const message = input.candidates.messages[index];
      const bubbleText = input.candidates.bubbleTexts[index] || message.content;
      input.onTyping(true);
      const duration = Math.max(800, Math.min(3500, bubbleText.length * 100)) + (Math.floor(random() * 500) - 200);
      await wait(Math.max(500, duration));
      if (input.signal?.aborted || input.shouldCancel()) break;

      message.timestamp = now();
      const callSpeechCompletion = input.onSendMessage(message);
      createdMessages.push(message);
      if (callSpeechCompletion) await callSpeechCompletion;
      input.onTyping(false);
      if (input.shouldCancel() || input.signal?.aborted) break;

      if (index < input.candidates.messages.length - 1) {
        await wait(Math.max(400, Math.floor(random() * 400) + 400));
        if (input.signal?.aborted) break;
      }
    }
  } catch (error) {
    throw new DirectReplyDeliveryError(error, createdMessages);
  }
  return createdMessages;
}
