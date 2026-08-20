export type ScheduleDay = { weekday: number; label: string; periods: number };

export type SolverRequirement = {
  id: string;
  sectionId: string;
  subjectId: string;
  teacherId: string | null;
  roomId: string | null;
  periodsPerWeek: number;
  consecutivePeriods: number;
};

export type SolverTeacher = {
  id: string;
  maxPeriodsPerDay: number | null;
  maxPeriodsPerWeek: number | null;
};

export type ScheduleConstraint = {
  id: string;
  constraintType: "teacher_unavailable" | "room_unavailable" | "prefer_distribution" | "avoid_last_period";
  strength: "hard" | "soft";
  weight: number;
  payload: Record<string, string | number | null>;
  enabled: boolean;
};

export type SolverInput = {
  days: ScheduleDay[];
  requirements: SolverRequirement[];
  teachers: SolverTeacher[];
  constraints: ScheduleConstraint[];
  maxSearchNodes?: number;
};

export type TimetableEntry = {
  id: string;
  lessonRequirementId: string;
  sectionId: string;
  subjectId: string;
  teacherId: string | null;
  roomId: string | null;
  weekday: number;
  periodIndex: number;
};

export type SolverConflict = {
  requirementId: string;
  message: string;
  missingPeriods: number;
};

export type SolverResult = {
  status: "success" | "partial" | "failed";
  entries: TimetableEntry[];
  conflicts: SolverConflict[];
  penaltyScore: number;
  exploredNodes: number;
};

export interface SolverAdapter {
  generate(input: SolverInput): SolverResult;
}

export type MoveValidation = { valid: boolean; message: string; penaltyDelta: number };
