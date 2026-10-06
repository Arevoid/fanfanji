const CONTACT_AVATAR_COLORS = [
  "#e9d5ff",
  "#bfdbfe",
  "#bae6fd",
  "#bbf7d0",
  "#fde68a",
  "#fed7aa",
  "#fecdd3",
  "#c7d2fe",
] as const;

const CONTACT_AVATAR_TEXT_COLORS = [
  "#6b21a8",
  "#1d4ed8",
  "#0c4a6e",
  "#166534",
  "#854d0e",
  "#9a3412",
  "#9f1239",
  "#3730a3",
] as const;

function hashText(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return hash;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Returns a deterministic initials avatar for contacts that are not linked to
 * a real user, character, or relationship-network NPC. Keeping this as an SVG
 * data URL means it works offline and remains stable across phone renders.
 */
export function createCharacterPhoneInitialAvatar(name: string): string {
  const normalized = name.trim().replace(/\s+/g, "");
  const initial = Array.from(normalized)[0] || "人";
  const colorIndex = hashText(normalized || "联系人") % CONTACT_AVATAR_COLORS.length;
  const background = CONTACT_AVATAR_COLORS[colorIndex];
  const foreground = CONTACT_AVATAR_TEXT_COLORS[colorIndex];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${background}"/><text x="48" y="52" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans CJK SC',sans-serif" font-size="42" font-weight="700" fill="${foreground}">${escapeXml(initial)}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function resolveCharacterPhoneContactAvatar(contact: {
  name: string;
  avatar?: string;
  source?: "user" | "linked" | "generated";
  linkedCharacterId?: string;
  relationshipNetworkNpcId?: string;
}): string {
  const hasLinkedAvatar = contact.source === "user"
    || contact.source === "linked"
    || Boolean(contact.linkedCharacterId || contact.relationshipNetworkNpcId);
  return hasLinkedAvatar && contact.avatar ? contact.avatar : createCharacterPhoneInitialAvatar(contact.name);
}

/**
 * Cleans an AI-provided contact name without changing known human names. The
 * old parser accepted the beginning of a sentence (for example “我都开始怀疑
 * 你是不”) as a contact title because it only checked string length.
 */
export function normalizeCharacterPhoneContactName(
  value: unknown,
  knownNames: readonly string[] = [],
  options: { allowPronounStart?: boolean } = {},
): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  const known = knownNames.find((name) => name.trim().toLocaleLowerCase() === raw.toLocaleLowerCase());
  if (known) return known.trim();
  const cleaned = raw
    .replace(/^[\s"“”‘’'「」『』【】()[\]{}]+|[\s"“”‘’'「」『』【】()[\]{}]+$/g, "")
    .replace(/^(?:联系人|姓名|名字|昵称)\s*[：:＝=]\s*/i, "")
    .split(/[\r\n。！？!?；;，,：:、|]/, 1)[0]
    .trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 16) return "";
  if (/^(?:很多|不少|一些|若干|几个|几位|一群|一堆|各种|多人|无|没有|未知|不详|user|npc|contact|unknown|内容|备注|角色|用户)$/i.test(cleaned)) return "";
  // A provider occasionally returns a sentence fragment made only from
  // conjunctions/particles (for example “而不” or “若啊”) as a contact name.
  // These are never reliable person names, while the known-name fast path
  // above still preserves an explicitly linked character with an unusual
  // nickname.
  if (/^(?:而|且|或|若|则|故|但|却|还|又|也|都|不|无|未|将|会|能|可|应|该|啊|呀|呢|吧|嘛|哦|嗯|哈|唉|哎)+$/.test(cleaned)) return "";
  // A name beginning with a first/second/third-person pronoun is almost
  // always a sentence fragment. Real linked names are returned by the known
  // name fast path above and therefore remain untouched.
  if (!options.allowPronounStart && /^(?:我|你|他|她|它|这|那|因为|所以|感觉|看来|其实|可能|怎么|是不是|有没有|不如|如果)/.test(cleaned)) return "";
  // Providers occasionally omit punctuation and return the beginning of an
  // instruction or an explanatory sentence as `contacts[].name`. These are
  // not recoverable names: keeping them makes every refresh create another
  // fake contact (for example “两人依然可以正常作” or “允许一个没有写进设定的人后来成”).
  // Use conservative sentence-leading/function-word checks while allowing
  // short, ordinary nicknames and known linked names above.
  if (!options.allowPronounStart && (
    /^(?:两人|两个|多个|一位|一名|允许|更多|实际上|应该|可以|应该|不会|没有|正在|开始|拒绝|同意|全部|说明|详见|成为|关系网)/.test(cleaned)
    || (cleaned.length >= 4 && /^(?:喜欢|当然|但是|然而|无论)/.test(cleaned))
    || (cleaned.length >= 6 && /(?:可以|应该|不会|没有|已经|正式|内容|人物|形式|接受|生成|设定|说明)/.test(cleaned))
  )) return "";
  if (/[。！？!?；;，,：:]/.test(cleaned)) return "";
  return cleaned;
}
