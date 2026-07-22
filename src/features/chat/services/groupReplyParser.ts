import type { Character } from "../../../types";

export interface ParsedGroupReply { charName: string; content: string; }

export function parseGroupReplies(rawText: string): ParsedGroupReply[] {
  const parsedReplies: ParsedGroupReply[] = [];
  let currentReply: ParsedGroupReply | null = null;
  for (const line of rawText.split("\n")) {
    const senderMatch = line.match(/^\[SENDER_NAME:\s*(.+?)\]/i);
    if (senderMatch) {
      if (currentReply?.content.trim()) parsedReplies.push(currentReply);
      currentReply = { charName: senderMatch[1].trim(), content: "" };
    } else if (currentReply) {
      currentReply.content += (currentReply.content ? "\n" : "") + line;
    }
  }
  if (currentReply?.content.trim()) parsedReplies.push(currentReply);
  return parsedReplies;
}

export function matchGroupReplyMembers(replies: readonly ParsedGroupReply[], members: readonly Character[]) {
  return replies.map((reply, index) => ({
    reply,
    index,
    member: members.find((member) => member.name.toLowerCase() === reply.charName.toLowerCase()
      || (member.remark && member.remark.toLowerCase() === reply.charName.toLowerCase())),
  })).filter((item): item is { reply: ParsedGroupReply; index: number; member: Character } => Boolean(item.member));
}
