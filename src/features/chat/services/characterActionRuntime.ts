import type { CharacterActionDirective } from "./characterActionProtocol";
import { evaluateCharacterActionCapability, type CharacterActionExecutionMode } from "./characterActionCapabilities";

export interface CharacterActionRuntimeResult {
  status: "success" | "rejected";
  code: string;
  messageMarkup?: string;
}

function encode(value: string): string {
  return encodeURIComponent(value.trim());
}

function label(value: string | undefined, fallback: string, maxLength: number): string {
  return (value || fallback)
    .replace(/[|\r\n]+/gu, " ")
    .trim()
    .slice(0, maxLength) || fallback;
}

/**
 * Convert a validated local action into the same attachment markup understood
 * by the online chat renderer. Keeping this conversion pure makes it safe to
 * use from offline stories and easy to test without mounting React.
 */
export function materializeCharacterAction(
  directive: CharacterActionDirective,
  mode: CharacterActionExecutionMode,
): CharacterActionRuntimeResult {
  const capability = evaluateCharacterActionCapability(directive, mode);
  if (!capability.allowed) return { status: "rejected", code: capability.code };

  switch (directive.type) {
    case "send_red_packet":
      return {
        status: "success",
        code: "red_packet_materialized",
        messageMarkup: `[红包]|${directive.amount!.toFixed(2)}|${label(directive.greeting, "恭喜发财，万事如意", 120)}`,
      };
    case "send_transfer":
      return {
        status: "success",
        code: "transfer_materialized",
        messageMarkup: `[转账]|${directive.amount!.toFixed(2)}|${label(directive.memo, "转账", 120)}|${directive.confirmed === true ? "true" : "false"}`,
      };
    case "send_location":
      return { status: "success", code: "location_materialized", messageMarkup: `[位置]|${label(directive.location, "未命名位置", 240)}` };
    case "send_file":
      return {
        status: "success",
        code: "file_materialized",
        messageMarkup: `[文件]|${label(directive.fileName, "未命名文件", 160)}|${encode((directive.fileContent || "").slice(0, 6000))}`,
      };
    case "send_music":
      return {
        status: "success",
        code: "music_materialized",
        messageMarkup: `[音乐]|${label(directive.musicTitle, "未知曲目", 160)}|${label(directive.musicArtist, "未知歌手", 160)}`,
      };
    case "send_voice": {
      const voiceText = label(directive.contentHint, "", 500);
      const seconds = Math.max(1, Math.min(60, Math.round(voiceText.length / 3.5) || 1));
      return { status: "success", code: "voice_materialized", messageMarkup: `[语音]|${seconds}|${voiceText}` };
    }
    case "send_sticker":
      return {
        status: "success",
        code: "sticker_materialized",
        messageMarkup: `[表情]|${label(directive.stickerName, "表情", 120)}|sticker://${label(directive.stickerId, "unknown", 160)}|${encode(label(directive.contentHint, directive.stickerName || "表情", 500))}`,
      };
    default:
      return { status: "rejected", code: `action_not_materializable:${directive.type}` };
  }
}
