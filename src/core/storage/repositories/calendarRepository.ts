import type { CalendarEvent } from "../../../types";
import { storageKeys } from "../storageKeys";
import { readArray, writeArray } from "./repositoryUtils";
import type { StorageResult, StorageWriteResult } from "../storageTypes";

export const loadCalendarEvents = (fallback: CalendarEvent[]): StorageResult<CalendarEvent[]> => readArray(storageKeys.calendarEvents, fallback);
export const saveCalendarEvents = (events: CalendarEvent[]): StorageWriteResult => writeArray(storageKeys.calendarEvents, events);
