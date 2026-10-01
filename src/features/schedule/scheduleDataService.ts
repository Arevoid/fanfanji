import {
  listCharacterScheduleByScope,
  removeCharacterScheduleByIds,
  loadCharacterScheduleStore,
  removeCharacterScheduleForRelations,
  saveCharacterScheduleEntry,
} from "../../core/storage/repositories/characterScheduleRepository";
import {
  loadPeriodStore,
  removePeriodRecordById,
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
  removePeriodRecordById,
  savePeriodRecord,
  loadUserScheduleStore,
  removeUserScheduleEntry,
  saveUserScheduleEntry,
};
