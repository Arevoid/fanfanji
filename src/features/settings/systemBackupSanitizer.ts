import type { HomeScreenItem } from "../../types";
import { readString } from "../../core/storage/storageAdapter";
import { normalizeHomeScreenLayout } from "../home/homeGrid";
import { sanitizeAppearanceSettings } from "../theme/theme";

/**
 * Removes private or invalid fields from module payloads before a system
 * backup is exported or written back during restore. The function only
 * handles JSON data; it never evaluates imported strings as code.
 */
export function sanitizeSystemBackupValue(
  key: string,
  value: string | null,
  source?: Record<string, unknown>,
): string | null {
  if (!value) return value;
  if (key === "phone_appearance_settings") {
    try {
      return JSON.stringify(sanitizeAppearanceSettings(JSON.parse(value)));
    } catch {
      return JSON.stringify({ themeMode: "light" });
    }
  }
  if (key === "phone_homescreen_items") {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(normalizeHomeScreenLayout(
        Array.isArray(parsed) ? parsed as HomeScreenItem[] : [],
      ));
    } catch {
      return "[]";
    }
  }
  if (["phone_diary_entries", "phone_diary_shares", "phone_diary_generation_tasks", "phone_diary_translations", "phone_diary_drafts"].includes(key)) {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return "[]";
      const relationshipRaw = source?.phone_character_relationships;
      const relationships = typeof relationshipRaw === "string"
        ? JSON.parse(relationshipRaw)
        : JSON.parse(readString("phone_character_relationships").value || "[]");
      const relationMap = new Map(Array.isArray(relationships)
        ? relationships.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string"))
          .map((item) => [item.id as string, item])
        : []);
      const safe = parsed.filter((item) => {
        if (!item || typeof item !== "object") return false;
        const record = item as Record<string, unknown>;
        if (typeof record.id !== "string" || typeof record.ownerIdentityId !== "string") return false;
        if (key === "phone_diary_entries") {
          if (record.authorType === "user") return typeof record.body === "string";
          const relation = typeof record.relationId === "string" ? relationMap.get(record.relationId) : undefined;
          return Boolean(relation && relation.userIdentityId === record.ownerIdentityId && relation.characterId === record.characterId && relation.conversationId === record.conversationId && typeof record.body === "string");
        }
        if (key === "phone_diary_shares") {
          const relation = typeof record.targetRelationId === "string" ? relationMap.get(record.targetRelationId) : undefined;
          return Boolean(relation && relation.userIdentityId === record.ownerIdentityId && relation.conversationId === record.conversationId && record.snapshot && typeof record.snapshot === "object");
        }
        if (key === "phone_diary_generation_tasks") {
          const relation = typeof record.relationId === "string" ? relationMap.get(record.relationId) : undefined;
          return Boolean(relation && relation.userIdentityId === record.ownerIdentityId);
        }
        if (key === "phone_diary_translations") {
          return typeof record.diaryEntryId === "string" && typeof record.translatedBody === "string";
        }
        return typeof record.body === "string";
      });
      return JSON.stringify(safe);
    } catch {
      return "[]";
    }
  }
  if (key === "phone_forum_threads") {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return "[]";
      return JSON.stringify(parsed.map((thread) => {
        if (!thread || typeof thread !== "object") return thread;
        const { privateAuthorRelationId: _relation, privateAuthorCharacterId: _character, ...publicThread } = thread as Record<string, unknown>;
        return publicThread;
      }));
    } catch {
      return "[]";
    }
  }
  if (key === "phone_forum_replies") {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return "[]";
      return JSON.stringify(parsed.map((reply) => {
        if (!reply || typeof reply !== "object") return reply;
        const { privateActor: _privateActor, ...publicReply } = reply as Record<string, unknown>;
        return publicReply;
      }));
    } catch {
      return "[]";
    }
  }
  if (key === "phone_forum_generation_tasks") {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return "[]";
      const relationshipRaw = source?.phone_character_relationships;
      const relationships = typeof relationshipRaw === "string"
        ? JSON.parse(relationshipRaw)
        : JSON.parse(readString("phone_character_relationships").value || "[]");
      const validRelationIds = new Set(
        Array.isArray(relationships)
          ? relationships.flatMap((item) => item && typeof item === "object" && typeof item.id === "string" ? [item.id] : [])
          : [],
      );
      return JSON.stringify(parsed.filter((task) => task && typeof task === "object" && (typeof task.relationId !== "string" || validRelationIds.has(task.relationId))));
    } catch {
      return "[]";
    }
  }
  if (["phone_forum_actor_states", "phone_forum_activity_tasks"].includes(key)) {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return "[]";
      return JSON.stringify(parsed.map((item) => {
        if (!item || typeof item !== "object") return item;
        const { actor: _actor, privateActor: _privateActor, pendingEvents: _events, ...safe } = item as Record<string, unknown>;
        return safe;
      }).filter((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).ownerIdentityId === "string"));
    } catch { return "[]"; }
  }
  if (["phone_forum_profiles", "phone_forum_visit_history", "phone_forum_like_history", "phone_forum_notifications"].includes(key)) {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return "[]";
      return JSON.stringify(parsed.map((item) => {
        if (!item || typeof item !== "object") return item;
        const { avatarAssetId: _asset, privateActor: _actor, privateAuthorRelationId: _relation, privateAuthorCharacterId: _character, ...safe } = item as Record<string, unknown>;
        return safe;
      }));
    } catch {
      return "[]";
    }
  }
  return value;
}
