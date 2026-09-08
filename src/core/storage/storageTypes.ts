export type StorageErrorKind =
  | "unavailable"
  | "read"
  | "parse"
  | "serialize"
  | "validation"
  | "quota"
  | "write"
  | "remove"
  | "verification"
  | "rollback"
  | "scope"
  | "duplicate"
  | "missing";

export interface StorageResult<T> {
  value: T;
  found: boolean;
  valid: boolean;
  error?: StorageErrorKind;
}

export interface StorageWriteResult {
  success: boolean;
  error?: StorageErrorKind;
}
