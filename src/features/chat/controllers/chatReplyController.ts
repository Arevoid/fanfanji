import type { Message } from "../../../types";
import type { ChatRuntimeContext } from "../context/chatRuntimeContext";

export interface ChatReplyRequest {
  userMsg: Message | null;
  customHistoryOverride?: Message[];
  options?: { forumShareTrigger?: boolean };
}

export interface ChatReplyControllerDependencies {
  getContext: () => ChatRuntimeContext;
  generateGroupReply: (userMsg: Message | null, customHistoryOverride?: Message[]) => Promise<void> | void;
  generateDirectReply: (input: ChatReplyRequest & { context: ChatRuntimeContext }) => Promise<void> | void;
}

/**
 * Runtime boundary for one AI reply attempt.
 *
 * The direct pipeline is injected during this first migration so its existing
 * prompt, memory, offline-story, world-book, API, and persistence behavior stay
 * byte-for-byte compatible. Later phases can move those steps behind the same
 * controller without changing AppChat call sites again.
 */
export function createChatReplyController(dependencies: ChatReplyControllerDependencies) {
  return {
    async generate(request: ChatReplyRequest): Promise<void> {
      const context = dependencies.getContext();
      if (!context.characterId) return;

      if (context.isGroup) {
        await dependencies.generateGroupReply(request.userMsg, request.customHistoryOverride);
        return;
      }

      await dependencies.generateDirectReply({ ...request, context });
    },
  };
}
