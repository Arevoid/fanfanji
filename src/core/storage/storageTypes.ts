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
  | "rollback";

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
