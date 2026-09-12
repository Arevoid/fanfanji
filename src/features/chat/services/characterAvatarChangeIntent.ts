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
