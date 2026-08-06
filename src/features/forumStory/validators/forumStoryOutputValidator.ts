import type {
  ForumStoryInitialCandidate,
} from "../../characterCognitive/promptAdapters/forumStoryPromptAdapter";
import type {
  ForumStoryCommentCandidate,
} from "../../characterCognitive/promptAdapters/forumStoryCommentPromptAdapter";
import type {
  ForumStoryUpdateCandidate,
} from "../../characterCognitive/promptAdapters/forumStoryUpdatePromptAdapter";

export type ForumStoryOutputKind = "initial" | "comments" | "update";

export interface ForumStoryOutputValidationContext {
  /** The only story scope that may appear in the output. */
  storyId?: string;
  /** Optional allowlists for story-scoped references. */
  storyCharacterIds?: readonly string[];
  storyThreadIds?: readonly string[];
  storyEventIds?: readonly string[];
  /** IDs of real Character entities that must never appear in story output. */
  forbiddenCharacterIds?: readonly string[];
  /** Used by adapters to reject embedded scope IDs before normalization drops them. */
  rejectEmbeddedScopeReferences?: boolean;
}

export interface ForumStoryOutputValidationResult<T> {
  allowed: boolean;
  sanitizedData?: T;
  rejectedReasons: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizeKey = (key: string): string => key.replace(/[^a-z0-9]/gi, "").toLowerCase();

const forbiddenKeys = new Set([
  "relationid",
  "useridentityid",
  "conversationid",
  "memory",
  "relationship",
  "innervoice",
  "privatecontext",
  "chathistory",
  "offlinestory",
  "characterevent",
  "privateactor",
  "characterid",
  "characterids",
  "realcharacterid",
  "realcharacterids",
  "characterref",
  "characterreference",
]);

const isForbiddenKey = (normalized: string): boolean => forbiddenKeys.has(normalized)
  || normalized.startsWith("memory")
  || normalized.startsWith("relationship")
  || normalized.startsWith("innervoice")
  || normalized.includes("chathistory")
  || normalized.includes("offlinestory")
  || normalized.includes("characterevent")
  || normalized.startsWith("private");

const privateContentPattern = /(?:private[_\s-]*(?:memory|relationship|chat|context|message|data)|\b(?:memory|relationship|inner\s*voice|chat\s*history|offline\s*story|character\s*event)\b)/i;

const addReason = (reasons: string[], reason: string): void => {
  if (!reasons.includes(reason)) reasons.push(reason);
};

const storyScopedReference = (key: string): "character" | "thread" | "event" | undefined => {
  if (key === "storycharacterid" || key === "storycharacterids") return "character";
  if (key === "storythreadid" || key === "storythreadids") return "thread";
  if (key === "storyeventid" || key === "storyeventids") return "event";
  return undefined;
};

const allowlistedReference = (
  kind: "character" | "thread" | "event",
  value: string,
  context: ForumStoryOutputValidationContext,
): boolean => {
  const list = kind === "character"
    ? context.storyCharacterIds
    : kind === "thread" ? context.storyThreadIds : context.storyEventIds;
  return !list || list.includes(value);
};

const hasForeignStoryPrefix = (value: string, context: ForumStoryOutputValidationContext): boolean => {
  if (!context.storyId || !value.includes(":")) return false;
  return !value.startsWith(`${context.storyId}:`);
};

const scanValue = (
  value: unknown,
  path: string,
  context: ForumStoryOutputValidationContext,
  reasons: string[],
): void => {
  if (typeof value === "string") {
    if (privateContentPattern.test(value)) addReason(reasons, `${path}: forbidden private content`);
    for (const forbiddenId of context.forbiddenCharacterIds || []) {
      if (forbiddenId && value.includes(forbiddenId)) {
        addReason(reasons, `${path}: real Character reference`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, `${path}[${index}]`, context, reasons));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    const childPath = path ? `${path}.${key}` : key;
    if (isForbiddenKey(normalized)) {
      addReason(reasons, `${childPath}: forbidden private or real Character field`);
      continue;
    }
    if (normalized === "storyid" && typeof nested === "string") {
      if (context.storyId && nested !== context.storyId) {
        addReason(reasons, `${childPath}: cross-story storyId reference`);
      } else if (context.rejectEmbeddedScopeReferences) {
        addReason(reasons, `${childPath}: embedded storyId is not allowed in AI output`);
      }
    }
    const referenceKind = storyScopedReference(normalized);
    if (referenceKind && typeof nested === "string") {
      if (context.rejectEmbeddedScopeReferences) {
        addReason(reasons, `${childPath}: embedded story-scoped reference is not allowed in AI output`);
      }
      if (!allowlistedReference(referenceKind, nested, context)) {
        addReason(reasons, `${childPath}: story-scoped reference is not allowlisted`);
      }
      if (hasForeignStoryPrefix(nested, context)) {
        addReason(reasons, `${childPath}: cross-story reference`);
      }
    }
    if (normalized === "id" && typeof nested === "string") {
      if (hasForeignStoryPrefix(nested, context)) addReason(reasons, `${childPath}: cross-story id reference`);
      else if (context.rejectEmbeddedScopeReferences && nested.includes(":")) {
        addReason(reasons, `${childPath}: embedded story-scoped id is not allowed in AI output`);
      }
    }
    scanValue(nested, childPath, context, reasons);
  }
};

const validateRequiredText = (
  record: Record<string, unknown>,
  key: string,
  path: string,
  reasons: string[],
): void => {
  if (typeof record[key] !== "string" || !record[key].trim()) {
    addReason(reasons, `${path}.${key}: required text is missing`);
  }
};

const cloneData = <T>(value: T): T => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

const finish = <T>(data: T, reasons: string[]): ForumStoryOutputValidationResult<T> =>
  reasons.length > 0
    ? { allowed: false, rejectedReasons: reasons }
    : { allowed: true, sanitizedData: cloneData(data), rejectedReasons: [] };

/**
 * Scans the raw parsed AI object before a prompt adapter normalizes it. This
 * prevents forbidden fields from being silently discarded by normalization.
 */
export const validateForumStoryRawOutput = (
  data: unknown,
  context: ForumStoryOutputValidationContext = {},
): ForumStoryOutputValidationResult<unknown> => {
  const reasons: string[] = [];
  scanValue(data, "output", context, reasons);
  return finish(data, reasons);
};

export const validateForumStoryInitialCandidate = (
  data: unknown,
  context: ForumStoryOutputValidationContext = {},
): ForumStoryOutputValidationResult<ForumStoryInitialCandidate> => {
  const reasons: string[] = [];
  scanValue(data, "output", context, reasons);
  if (!isRecord(data)) {
    addReason(reasons, "output: empty or invalid story output");
    return finish(data as ForumStoryInitialCandidate, reasons);
  }
  for (const key of ["title", "body", "storyBackground", "initialState"]) {
    validateRequiredText(data, key, "output", reasons);
  }
  if (!isRecord(data.author)) addReason(reasons, "output.author: author is missing");
  else for (const key of ["name", "role", "personaSummary"]) validateRequiredText(data.author, key, "output.author", reasons);
  if (!Array.isArray(data.characters) || data.characters.length === 0) {
    addReason(reasons, "output.characters: at least one story character is required");
  } else {
    data.characters.forEach((character, index) => {
      if (!isRecord(character)) addReason(reasons, `output.characters[${index}]: invalid story character`);
      else for (const key of ["name", "role", "personaSummary"]) validateRequiredText(character, key, `output.characters[${index}]`, reasons);
    });
  }
  return finish(data as unknown as ForumStoryInitialCandidate, reasons);
};

export const validateForumStoryCommentCandidates = (
  data: unknown,
  context: ForumStoryOutputValidationContext = {},
): ForumStoryOutputValidationResult<ForumStoryCommentCandidate[]> => {
  const reasons: string[] = [];
  scanValue(data, "output", context, reasons);
  if (!Array.isArray(data) || data.length === 0) {
    addReason(reasons, "output: empty comment output");
    return finish(data as ForumStoryCommentCandidate[], reasons);
  }
  data.forEach((comment, index) => {
    if (!isRecord(comment)) {
      addReason(reasons, `output[${index}]: invalid comment`);
      return;
    }
    for (const key of ["style", "authorName", "content"]) validateRequiredText(comment, key, `output[${index}]`, reasons);
  });
  return finish(data as ForumStoryCommentCandidate[], reasons);
};

export const validateForumStoryUpdateCandidate = (
  data: unknown,
  context: ForumStoryOutputValidationContext = {},
): ForumStoryOutputValidationResult<ForumStoryUpdateCandidate> => {
  const reasons: string[] = [];
  scanValue(data, "output", context, reasons);
  if (!isRecord(data)) {
    addReason(reasons, "output: empty or invalid update output");
    return finish(data as ForumStoryUpdateCandidate, reasons);
  }
  validateRequiredText(data, "content", "output", reasons);
  validateRequiredText(data, "eventProgression", "output", reasons);
  if (data.title !== undefined && typeof data.title !== "string") addReason(reasons, "output.title: invalid title");
  return finish(data as unknown as ForumStoryUpdateCandidate, reasons);
};

export const validateForumStoryOutput = (
  kind: ForumStoryOutputKind,
  data: unknown,
  context: ForumStoryOutputValidationContext = {},
): ForumStoryOutputValidationResult<ForumStoryInitialCandidate | ForumStoryCommentCandidate[] | ForumStoryUpdateCandidate> => {
  switch (kind) {
    case "initial": return validateForumStoryInitialCandidate(data, context);
    case "comments": return validateForumStoryCommentCandidates(data, context);
    case "update": return validateForumStoryUpdateCandidate(data, context);
  }
};

export const ForumStoryOutputValidator = {
  validate: validateForumStoryOutput,
  validateInitial: validateForumStoryInitialCandidate,
  validateComments: validateForumStoryCommentCandidates,
  validateUpdate: validateForumStoryUpdateCandidate,
};
