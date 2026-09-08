import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Rule = "ui-to-storage-or-provider" | "domain-to-feature-or-ui" | "core-to-concrete-feature" | "port-to-concrete-adapter";
type Edge = { rule: Rule; from: string; to: string };

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");
const baselinePath = path.join(projectRoot, "scripts", "dependency-direction-baseline.json");

function normalize(value: string): string {
  return value.replaceAll(path.sep, "/").replace(/^\.\//u, "");
}

function discover(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return discover(absolute);
    return /\.tsx?$/u.test(entry.name) ? [absolute] : [];
  });
}

function resolveImport(importer: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  const found = candidates.find((candidate) => existsSync(candidate));
  return found ? normalize(path.relative(projectRoot, found)) : null;
}

function importsFrom(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers = new Set<string>();
  const staticImport = /(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?["'](\.{1,2}\/[^"]+)["']/gu;
  const dynamicImport = /import\(\s*["'](\.{1,2}\/[^"]+)["']\s*\)/gu;
  for (const match of source.matchAll(staticImport)) specifiers.add(match[1]);
  for (const match of source.matchAll(dynamicImport)) specifiers.add(match[1]);
  return [...specifiers];
}

function isUi(file: string): boolean {
  return file === "src/App.tsx" || file.startsWith("src/components/");
}

function isDomain(file: string): boolean { return file.startsWith("src/domain/"); }
function isCore(file: string): boolean { return file.startsWith("src/core/"); }
function isPort(file: string): boolean { return file.startsWith("src/core/ports/") || file.startsWith("src/core/contracts/"); }
function isFeature(file: string): boolean { return file.startsWith("src/features/"); }
function isProvider(file: string): boolean {
  return file.startsWith("src/server/") || file.startsWith("src/cloudflare/");
}
function isStorage(file: string): boolean { return file.startsWith("src/core/storage/"); }

function classify(from: string, to: string): Rule | null {
  if (isUi(from) && (isStorage(to) || isProvider(to))) return "ui-to-storage-or-provider";
  if (isDomain(from) && (isUi(to) || isFeature(to))) return "domain-to-feature-or-ui";
  if (isCore(from) && (isUi(to) || isFeature(to) || isProvider(to))) return "core-to-concrete-feature";
  if (isPort(from) && isProvider(to)) return "port-to-concrete-adapter";
  return null;
}

function sortedEdges(edges: Edge[]): Edge[] {
  return [...edges].sort((left, right) => `${left.rule}:${left.from}:${left.to}`.localeCompare(`${right.rule}:${right.from}:${right.to}`));
}

function collectGraph(): { edges: Edge[]; graph: Map<string, string[]> } {
  const graph = new Map<string, string[]>();
  const edges: Edge[] = [];
  for (const absolute of discover(sourceRoot)) {
    const from = normalize(path.relative(projectRoot, absolute));
    const targets: string[] = [];
    for (const specifier of importsFrom(absolute)) {
      const target = resolveImport(absolute, specifier);
      if (!target) continue;
      targets.push(target);
      const rule = classify(from, target);
      if (rule) edges.push({ rule, from, to: target });
    }
    graph.set(from, targets);
  }
  return { edges: sortedEdges(edges), graph };
}

function stronglyConnectedComponents(graph: Map<string, string[]>): string[][] {
  let index = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const visit = (node: string) => {
    indexes.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) || []) {
      if (!indexes.has(next)) {
        visit(next);
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(next)!));
      } else if (onStack.has(next)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indexes.get(next)!));
      }
    }
    if (lowLinks.get(node) !== indexes.get(node)) return;
    const component: string[] = [];
    let current: string;
    do {
      current = stack.pop()!;
      onStack.delete(current);
      component.push(current);
    } while (current !== node);
    if (component.length > 1 || graph.get(component[0])?.includes(component[0])) components.push(component.sort());
  };
  for (const node of graph.keys()) if (!indexes.has(node)) visit(node);
  return components.sort((left, right) => left.join("|").localeCompare(right.join("|")));
}

function cycleKey(component: string[]): string { return [...component].sort().join(" <-> "); }

function edgeKey(edge: Edge): string { return `${edge.rule}|${edge.from}|${edge.to}`; }

const { edges, graph } = collectGraph();
const cycles = stronglyConnectedComponents(graph).map(cycleKey);
const violationCounts = edges.reduce<Partial<Record<Rule, number>>>((counts, edge) => {
  counts[edge.rule] = (counts[edge.rule] || 0) + 1;
  return counts;
}, {});
if (!existsSync(baselinePath)) {
  console.error(JSON.stringify({ violationCounts, cycles }, null, 2));
  throw new Error(`Missing ${baselinePath}; capture the reviewed baseline before running this gate.`);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
  violationCounts?: Partial<Record<Rule, number>>;
  edges?: Edge[];
  cycles?: string[];
};
assert.ok(Array.isArray(baseline.edges), `Missing concrete dependency edges in ${baselinePath}; capture the reviewed baseline before running this gate.`);
const baselineEdgeKeys = new Set(baseline.edges!.map(edgeKey));
const newEdges = edges.filter((edge) => !baselineEdgeKeys.has(edgeKey(edge)));
assert.deepEqual(newEdges, [], `Dependency direction gained ${newEdges.length} unallowlisted edge(s): ${newEdges.map(edgeKey).join(", ")}`);
for (const rule of new Set(edges.map((edge) => edge.rule))) {
  const currentCount = violationCounts[rule] || 0;
  const baselineCount = baseline.violationCounts?.[rule] || 0;
  assert.ok(currentCount <= baselineCount, `Dependency direction rule ${rule} grew from ${baselineCount} to ${currentCount} edge(s).`);
}

const baselineCycles = new Set(baseline.cycles || []);
const newCycles = cycles.filter((cycle) => !baselineCycles.has(cycle));
assert.ok(cycles.length <= baselineCycles.size, `Dependency cycles increased from ${baselineCycles.size} to ${cycles.length}.`);
assert.deepEqual(newCycles, [], `Dependency direction gained ${newCycles.length} unallowlisted cycle(s).`);

console.log(`PASS dependency direction baseline (${edges.length} allowlisted boundary edges; ${cycles.length} cycles, no increase)`);
