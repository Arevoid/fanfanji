/** Task-specific data minimization, never a mutation of the original persona. */
const unrelatedSection = /(?:nsfw|sexual|intimacy|kinks?|fetish|attack[_ ]?style|speech[_ ]?system|communication|example[_ ]?dialogues?|chat[_ ]?guidelines?|narrative[_ ]?notes|性癖|性幻想|性行为|性爱|性生活|性场景|性相关|性碎碎念|亲密细节|床事|床上偏好|聊天规范|语言规范|对话示例|语言示例|碎碎念)/iu;
const unrelatedDetail = /(?:自慰|手淫|勃起|射精|阴茎|阴道|乳头|口交|肛交|性器官|性交|做爱|高潮|性虐|情趣用品|内射|后入|淫|pornograph|masturbat|ejaculat|penetrat|orgasm|erection)/iu;

export function projectRelationshipSource(source: string): string {
  const output: string[] = [];
  let blockedIndent: number | undefined;
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    const indent = line.match(/^\s*/u)![0].length;
    const heading = trimmed.match(/^([^:：]{1,85})[:：]\s*(?:[|>][-+]?)?\s*$/u);
    if (blockedIndent != null) {
      if (!trimmed) continue;
      if (heading && indent <= blockedIndent) blockedIndent = undefined;
      else if (indent <= blockedIndent && /^(?:角色|人设|背景|世界书【)/u.test(trimmed)) blockedIndent = undefined;
      else continue;
    }
    if (heading && unrelatedSection.test(heading[1])) { blockedIndent = indent; continue; }
    // Inline legacy sections can contain several sentences on the same line.
    // Drop irrelevant explicit clauses, retaining other complete source clauses.
    const safe = line.split(/(?<=[。！？!?；;])/u).filter(clause => !unrelatedDetail.test(clause) && !unrelatedSection.test(clause)).join("");
    if (safe.trim()) output.push(safe);
  }
  return output.join("\n");
}
