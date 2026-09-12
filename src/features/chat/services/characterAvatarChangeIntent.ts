/**
 * Conservative detector for a user explicitly asking the character to use a
 * recently shared image as their profile avatar. A media message by itself is
 * never sufficient; the follow-up text must contain an explicit avatar/change
 * request so ordinary photo sharing cannot mutate character data.
 */
export function isExplicitCharacterAvatarChangeRequest(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  const hasAvatarTarget = /(?:头像|头图|profile\s*photo|profile\s*picture|avatar)/iu.test(normalized);
  const hasChangeAction = /(?:换|更换|改成|改用|换成|用(?:这张|这个)|设置成|设为|换个|更新).{0,12}(?:头像|头图|profile\s*photo|profile\s*picture|avatar)|(?:头像|头图|profile\s*photo|profile\s*picture|avatar).{0,12}(?:换|更换|改成|改用|设置|设为|更新)/iu.test(normalized);
  const hasCoupleRequest = /(?:情侣头像|情头|couple\s*(?:avatar|profile\s*photo)|配对头像)/iu.test(normalized);
  return hasAvatarTarget && (hasChangeAction || hasCoupleRequest);
}

export interface CharacterAvatarChangeTiming {
  /** Ordinary personas may update shortly after the explicit request. */
  delayMs: number;
  /** Persona cues that call for a reply before the profile update. */
  waitForReply: boolean;
}

/**
 * Keeps avatar changes from looking like an instantaneous UI mutation while
 * giving clearly marked tsundere/guarded personas room to react first. This
 * is intentionally a small, deterministic presentation policy: it does not
 * inspect or rewrite prompts and it never turns an ordinary image into a
 * profile change.
 */
export function resolveCharacterAvatarChangeTiming(personality = "", backstory = ""): CharacterAvatarChangeTiming {
  const persona = `${personality}\n${backstory}`;
  const waitsForReply = /(?:傲娇|嘴硬|口是心非|别扭|不坦率|高冷|傲慢|毒舌|傲气)/iu.test(persona);
  return waitsForReply
    ? { delayMs: 12_000, waitForReply: true }
    : { delayMs: 900, waitForReply: false };
}

/** Detect an explicit refusal so a guarded persona can change a little later. */
export function characterAvatarReplyRefusesChange(text: string): boolean {
  return /(?:才不换|不换(?:头像)?|不想换|不要换|偏不|休想|别想|才不会|不可能)/iu.test(text);
}
