import type { Moment } from "../../../types";
import { storageKeys } from "../storageKeys";
import { writeArray, readArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export const loadMoments = (fallback: Moment[]): StorageResult<Moment[]> => readArray(storageKeys.moments, fallback);
export const saveMoments = (moments: Moment[]): StorageWriteResult => writeArray(storageKeys.moments, moments);
