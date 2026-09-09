import type { KnowledgeSourceAuthorship } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type {
  MemoryExtractionRole,
} from "../../../domain/memory/memoryExtractionSchema";
import type { MemoryExtractionSourceEnvelope } from "../../../domain/memory/memoryExtractionSourceEnvelope";

export type MemorySourceBindingStatus = "valid" | "partial" | "invalid" | "missing" | "scope_mismatch";

export interface DirectChatMemorySourceBindingScope {
  characterId?: string;
  relationId?: string;
  userIdentityId?: string;
  conversationId?: string;
}

export interface DirectChatMemorySourceBinding {
  status: MemorySourceBindingStatus;
  modelSourceHints: readonly string[];
  /** Every in-batch hint after deterministic de-duplication. */
  validatedSourceMessageIds: readonly string[];
  /** Non-empty only when every supplied hint is valid and scope matches. */
  trustedSourceMessageIds: readonly string[];
  invalidSourceMessageIds: readonly string[];
  duplicateSourceMessageIds: readonly string[];
  missingSource: boolean;
  partialValid: boolean;
  scopeMatches: boolean;
  sourceTimestamps: readonly number[];
  authorship: KnowledgeSourceAuthorship;
}

const normalize = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const sortedUnique = (values: readonly string[]): string[] => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();

function scopeMatches(
  envelope: MemoryExtractionSourceEnvelope,
  expected?: DirectChatMemorySourceBindingScope,
): boolean {
  if (!expected) return true;
  return (["characterId", "relationId", "userIdentityId", "conversationId"] as const).every((key) => {
    const expectedValue = normalize(expected[key]);
    return !expectedValue || normalize(envelope[key]) === expectedValue;
  });
}

function sourceAuthorship(
  sourceIds: readonly string[],
  envelope: MemoryExtractionSourceEnvelope,
): KnowledgeSourceAuthorship {
  const roles = new Set(envelope.messageSources
    .filter((source) => sourceIds.includes(source.messageId))
    .map((source) => source.role));
  if (roles.size === 1 && roles.has("user")) return "user";
  if (roles.size === 1 && roles.has("character")) return "character";
  return "unknown";
}

/**
 * Resolve model-provided source hints against one runtime-owned batch.  This
 * function never searches storage or other conversations and never guesses a
 * replacement ID.
 */
export function bindDirectChatMemorySourceHints(input: {
  envelope: MemoryExtractionSourceEnvelope;
  modelSourceHints?: readonly string[];
  expectedScope?: DirectChatMemorySourceBindingScope;
}): DirectChatMemorySourceBinding {
  const modelSourceHints = (input.modelSourceHints || [])
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = new Set(input.envelope.allowedSourceMessageIds);
  const seen = new Set<string>();
  const validated: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  modelSourceHints.forEach((hint) => {
    if (seen.has(hint)) {
      duplicates.push(hint);
      return;
    }
    seen.add(hint);
    if (allowed.has(hint)) validated.push(hint);
    else invalid.push(hint);
  });
  const normalizedValidated = sortedUnique(validated);
  const normalizedInvalid = sortedUnique(invalid);
  const normalizedDuplicates = sortedUnique(duplicates);
  const hasScopeMismatch = !scopeMatches(input.envelope, input.expectedScope);
  const missingSource = modelSourceHints.length === 0;
  const partialValid = normalizedValidated.length > 0 && normalizedInvalid.length > 0;
  const status: MemorySourceBindingStatus = hasScopeMismatch
    ? "scope_mismatch"
    : missingSource
      ? "missing"
      : normalizedValidated.length === 0
        ? "invalid"
        : partialValid
          ? "partial"
          : "valid";
  const trustedSourceMessageIds = status === "valid" ? normalizedValidated : [];
  const sourceTimestamps = trustedSourceMessageIds
    .map((id) => input.envelope.messageSources.find((source) => source.messageId === id)?.timestamp)
    .filter((value): value is number => Number.isFinite(value));
  return {
    status,
    modelSourceHints,
    validatedSourceMessageIds: normalizedValidated,
    trustedSourceMessageIds,
    invalidSourceMessageIds: normalizedInvalid,
    duplicateSourceMessageIds: normalizedDuplicates,
    missingSource,
    partialValid,
    scopeMatches: !hasScopeMismatch,
    sourceTimestamps,
    authorship: sourceAuthorship(trustedSourceMessageIds, input.envelope),
  };
}

export function resolveDirectChatMemoryRoleId(
  role: MemoryExtractionRole | undefined,
  envelope: MemoryExtractionSourceEnvelope,
): string | undefined {
  if (role === "user") return normalize(envelope.userIdentityId);
  if (role === "character") return normalize(envelope.characterId);
  if (role === "relationship") return normalize(envelope.relationId);
  return undefined;
}

export function resolveDirectChatMemoryActorTarget(input: {
  actorRole?: MemoryExtractionRole;
  targetRole?: MemoryExtractionRole;
  envelope: MemoryExtractionSourceEnvelope;
}): { actorId?: string; targetId?: string } {
  const actorId = resolveDirectChatMemoryRoleId(input.actorRole, input.envelope);
  const targetId = resolveDirectChatMemoryRoleId(input.targetRole, input.envelope);
  return {
    ...(actorId ? { actorId } : {}),
    ...(targetId ? { targetId } : {}),
  };
}

