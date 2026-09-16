import type { InnerVoiceRecord } from "../../../types";
import type { StorageWriteResult } from "../../../core/storage/storageTypes";
import { saveInnerVoiceRecord } from "../../../core/storage/repositories/innerVoiceRepository";

type SaveInlineRecord = (record: InnerVoiceRecord) => Promise<StorageWriteResult>;

/** Sidecar durability must never veto delivery of the public chat reply. */
export async function persistInlineInnerVoiceBestEffort(
  record: InnerVoiceRecord,
  onFailure?: (error: string) => void,
  persist: SaveInlineRecord = saveInnerVoiceRecord,
): Promise<boolean> {
  try {
    const result = await persist(record);
    if (result.success) return true;
    onFailure?.(result.error || "write");
    return false;
  } catch (error) {
    onFailure?.(error instanceof Error ? error.message : "write");
    return false;
  }
}
