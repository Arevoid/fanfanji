import { createId } from "../../id/createId";
import { readArray, writeArray } from "./repositoryUtils";
import { storageKeys } from "../storageKeys";
import type { Character } from "../../../types";
import type { CharacterPhoneRecord } from "../../../domain/characterPhone/types";

const load = () =>
  readArray<CharacterPhoneRecord>(storageKeys.characterPhones, []);

export function normalizeCharacterPhonePasscode(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.padStart(4, "0").slice(-4);
}

const passcodeFor = (character: Character) => {
  void character;
  return "0000";
};

export function getCharacterPhone(
  ownerIdentityId: string,
  characterId: string,
): CharacterPhoneRecord | undefined {
  return load().value.find(
    (phone) =>
      phone.ownerIdentityId === ownerIdentityId &&
      phone.characterId === characterId,
  );
}

export function createCharacterPhone(
  ownerIdentityId: string,
  character: Character,
  now = Date.now(),
): CharacterPhoneRecord {
  const existing = getCharacterPhone(ownerIdentityId, character.id);
  if (existing) return existing;
  const phone: CharacterPhoneRecord = {
    id: createId("character-phone"),
    ownerIdentityId,
    characterId: character.id,
    passcode: normalizeCharacterPhonePasscode(passcodeFor(character)),
    failedAttempts: 0,
    createdAt: now,
    updatedAt: now,
    wallpaper: "linear-gradient(145deg, #d8e5df 0%, #f4eadc 100%)",
    appOrder: ["chat", "browser", "schedule", "gallery", "diary"],
    messages: [
      {
        id: createId("phone-message"),
        sender: character.name,
        body: character.greeting || "今天也有好好吃饭吗？",
        timestamp: now - 1000 * 60 * 45,
      },
      {
        id: createId("phone-message"),
        sender: "林晓",
        body: "你最近是不是又熬夜了？",
        timestamp: now - 1000 * 60 * 18,
        unread: true,
      },
    ],
    contacts: [
      {
        id: createId("phone-contact"),
        name: "林晓",
        relation: "现实朋友",
        isLongTerm: true,
        isNpc: true,
      },
      {
        id: createId("phone-contact"),
        name: "未命名联系人",
        relation: "偶尔联系的人",
        isLongTerm: false,
        isNpc: true,
      },
    ],
    threadMessages: [],
    posts: [
      {
        id: createId("phone-post"),
        author: character.name,
        content: "今天路过一家很安静的小店，暂时不想告诉别人。",
        timestamp: now - 1000 * 60 * 35,
        likes: 3,
        comments: ["看起来不错"],
        source: "generated",
      },
    ],
    browserHistory: [
      {
        id: createId("phone-search"),
        query: "怎么让重要的人开心",
        title: "让关系变得更亲密的几个小习惯",
        timestamp: now - 1000 * 60 * 90,
      },
      {
        id: createId("phone-search"),
        query: "附近适合一个人散步的地方",
        title: "安静路线与夜间散步建议",
        timestamp: now - 1000 * 60 * 28,
      },
    ],
    diaryEntries: [
      {
        id: createId("phone-diary"),
        title: "今天没有说出口的话",
        body: `${character.name} 把手机扣在桌面上，想了很久，还是没有把那句话发出去。`,
        timestamp: now - 1000 * 60 * 60 * 4,
      },
    ],
    scheduleItems: [
      {
        id: createId("phone-schedule"),
        title: "晚饭后散步",
        detail: "不带目的地，走到想停下来的地方。",
        timestamp: now + 1000 * 60 * 60 * 3,
      },
    ],
    galleryItems: [
      {
        id: createId("phone-gallery"),
        title: "窗边的光",
        caption: "一张没有发出去的照片。",
        timestamp: now - 1000 * 60 * 60 * 2,
        source: "generated",
      },
      {
        id: createId("phone-gallery"),
        title: "不想被看见的那张",
        caption: "隐藏相册 · 需要角色手机继续推进后才会出现。",
        timestamp: now - 1000 * 60 * 60 * 8,
        hidden: true,
        source: "generated",
      },
      {
        id: createId("phone-gallery"),
        title: "已删除的截图",
        caption: "最近删除 · 仍可能留下操作痕迹。",
        timestamp: now - 1000 * 60 * 60 * 24,
        deletedAt: now - 1000 * 60 * 60 * 2,
        source: "received",
      },
    ],
    activities: [],
  };
  phone.threadMessages = phone.messages.map((message, index) => ({
    id: createId("phone-thread-message"),
    contactId: phone.contacts[0].id,
    sender: index === 0 ? "character" : "contact",
    content: message.body,
    timestamp: message.timestamp,
  }));
  saveCharacterPhone(phone);
  return phone;
}

export function saveCharacterPhone(phone: CharacterPhoneRecord) {
  const current = load().value;
  return writeArray(storageKeys.characterPhones, [
    ...current.filter((item) => item.id !== phone.id),
    phone,
  ]);
}
