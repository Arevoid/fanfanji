import type { apiChat } from "../../../utils/apiHelper";
import type { AiChatRequest, AiChatResponse } from "./chatServiceTypes";

/** Executes exactly one already-composed AI request; UI and persistence stay with the caller. */
export function requestAiReply(requestAi: typeof apiChat, request: AiChatRequest): Promise<AiChatResponse> {
  return requestAi(request);
}
