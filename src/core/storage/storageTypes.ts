export type StorageErrorKind = "unavailable" | "read" | "parse" | "write" | "remove";

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
