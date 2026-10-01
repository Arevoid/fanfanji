import {
  listCharacterScheduleByScope,
  removeCharacterScheduleByIds,
  loadCharacterScheduleStore,
  removeCharacterScheduleForRelations,
  saveCharacterScheduleEntry,
} from "../../core/storage/repositories/characterScheduleRepository";
import {
  loadPeriodStore,
  savePeriodRecord,
} from "../../core/storage/repositories/periodRepository";
import {
  loadUserScheduleStore,
  removeUserScheduleEntry,
  saveUserScheduleEntry,
} from "../../core/storage/repositories/userScheduleRepository";

/** Feature boundary for schedule persistence; UI callers do not depend on storage adapters. */
export {
  listCharacterScheduleByScope,
  removeCharacterScheduleByIds,
  loadCharacterScheduleStore,
  removeCharacterScheduleForRelations,
  saveCharacterScheduleEntry,
  loadPeriodStore,
  savePeriodRecord,
  loadUserScheduleStore,
  removeUserScheduleEntry,
  saveUserScheduleEntry,
};
