import { readString, remove, writeString } from "./storageAdapter";
import { storageKeys } from "./storageKeys";

const ENABLED_VALUE = "1";

export const isMessageEntryStoreEnabled = (): boolean => readString(storageKeys.messageEntryStoreEnabled).value === ENABLED_VALUE;
export const isOfflineStoryEntryStoreEnabled = (): boolean => readString(storageKeys.offlineStoryEntryStoreEnabled).value === ENABLED_VALUE;

export const enableMessageEntryStore = () => writeString(storageKeys.messageEntryStoreEnabled, ENABLED_VALUE);
export const enableOfflineStoryEntryStore = () => writeString(storageKeys.offlineStoryEntryStoreEnabled, ENABLED_VALUE);
export const disableMessageEntryStore = () => remove(storageKeys.messageEntryStoreEnabled);
export const disableOfflineStoryEntryStore = () => remove(storageKeys.offlineStoryEntryStoreEnabled);
