export type CharacterRoutinePeriod = "morning" | "afternoon" | "evening" | "night";

export type CharacterRoutineState = "active" | "sleeping" | "working" | "resting";

/** A local-clock range. The end is exclusive; start after end means crossing midnight. */
export interface CharacterRoutineTimeRange {
  start: string;
  end: string;
}

/** Weekday follows JavaScript Date: Sunday=0 through Saturday=6. */
export type CharacterRoutineWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Character life rhythm only describes plausibility. It does not schedule,
 * send, or suppress any message or Moment.
 */
export interface CharacterRoutine {
  activeHours?: readonly CharacterRoutineTimeRange[];
  sleepHours?: readonly CharacterRoutineTimeRange[];
  workHours?: readonly CharacterRoutineTimeRange[];
  restDays?: readonly CharacterRoutineWeekday[];
  preferredActivityPeriods?: readonly CharacterRoutinePeriod[];
  /** IANA timezone used to interpret all ranges, for example Asia/Shanghai. */
  timezone?: string;
}

export type CharacterRoutineInput = Partial<CharacterRoutine>;
