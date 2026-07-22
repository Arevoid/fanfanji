import type { StylePreset } from "../../../types";
import { storageKeys } from "../storageKeys";
import { readArray, writeArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export const loadPresets = (fallback: StylePreset[]): StorageResult<StylePreset[]> => readArray(storageKeys.presets, fallback);
export const savePresets = (presets: StylePreset[]): StorageWriteResult => writeArray(storageKeys.presets, presets);
