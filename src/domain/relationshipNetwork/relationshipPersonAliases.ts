const key = (value: string) => value.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
const uniqueFamilyTitle = /^(?:父亲|母亲|爸爸|妈妈|爷爷|奶奶|外公|外婆|小姨)$/u;

/** Only explicit aliases and unambiguous singular family titles; no semantic guess or model call. */
export function mergeRelationshipPersonAliases<T extends { name: string; relationship: string; evidence: string }>(rows: readonly T[]): T[] {
  const aliasOwners = new Map<string, Set<number>>();
  const familyOwners = new Map<string, number[]>();
  const addAlias = (alias: string, index: number) => {
    const normalized = key(alias.replace(/^["'“「]+|["'”」]+$/gu, ""));
    if (!normalized) return;
    const owners = aliasOwners.get(normalized) || new Set<number>(); owners.add(index); aliasOwners.set(normalized, owners);
  };
  rows.forEach((row, index) => {
    addAlias(row.name, index);
    // A quote saying “网名: 韦制，本名: 沈韦” supplies an explicit identity link.
    // Only use it when the row's own name is among those fields.
    const fields = [...row.evidence.matchAll(/(?:网名|本名|姓名|昵称|别名)\s*[:：]\s*([^，,；;\n|]{1,60})/gu)].map(match => match[1].trim());
    if (fields.some(field => key(field) === key(row.name))) fields.forEach(field => addAlias(field, index));
    if (!uniqueFamilyTitle.test(row.name) && uniqueFamilyTitle.test(row.relationship)) {
      const owners = familyOwners.get(row.relationship) || []; owners.push(index); familyOwners.set(row.relationship, owners);
    }
  });
  const parent = rows.map((_, index) => index);
  const root = (index: number): number => parent[index] === index ? index : (parent[index] = root(parent[index]));
  const join = (left: number, right: number) => { parent[root(right)] = root(left); };
  rows.forEach((row, index) => {
    const candidates = aliasOwners.get(key(row.name));
    if (candidates?.size) {
      const explicit = [...candidates].filter(candidate => key(rows[candidate].name) !== key(row.name));
      if (explicit.length === 1) join(index, explicit[0]);
    }
    const family = uniqueFamilyTitle.test(row.name) && row.relationship === row.name ? familyOwners.get(row.name) : undefined;
    if (family?.length === 1) join(index, family[0]);
  });
  const groups = new Map<number, number[]>();
  rows.forEach((_, index) => { const id = root(index); const group = groups.get(id) || []; group.push(index); groups.set(id, group); });
  const score = (row: T) => {
    const realNames = [...row.evidence.matchAll(/(?:本名|姓名)\s*[:：]\s*([^，,；;\n|]{1,60})/gu)].map(match => key(match[1]));
    return realNames.includes(key(row.name)) ? 2 : uniqueFamilyTitle.test(row.name) ? 0 : 1;
  };
  return [...groups.values()].map(group => rows[group.reduce((best, index) => score(rows[index]) > score(rows[best]) ? index : best)]);
}
