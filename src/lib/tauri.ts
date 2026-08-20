import { invoke } from "@tauri-apps/api/core";
import type { ScheduleConstraint, ScheduleDay, SolverRequirement, SolverTeacher, TimetableEntry } from "../features/scheduler/types";

export type SchoolSettings = {
  schoolName: string;
  academicYear: string;
  workingDays: string[];
  periodsPerDay: number;
  periodsByDay: Record<string, number>;
  periodDurationMinutes: number;
  dayStartTime: string;
  language: "ar" | "en";
};

export type SchoolDatabase = { path: string; settings: SchoolSettings };

export type EntityKind =
  | "grades"
  | "sections"
  | "subjects"
  | "teachers"
  | "rooms"
  | "lesson_requirements";

export type EntityFields = Record<string, string | number | null>;

export type EntityRecord = {
  id: string;
  entityType: EntityKind;
  fields: EntityFields;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedReason: string | null;
};

export type ImportFile = { fileName: string; extension: string; bytesBase64: string };
export type ImportCommitRequest = {
  entityType: EntityKind;
  fileName: string;
  worksheet: string;
  mapping: Record<string, string>;
  templateName?: string;
  rows: { rowNumber: number; payload: EntityFields }[];
};
export type ImportCommitResult = {
  jobId: string;
  totalRows: number;
  importedRows: number;
  errorRows: number;
  errors: { rowNumber: number; message: string }[];
};
export type ImportOverview = {
  jobs: { id: string; fileName: string; entityType: string; status: string; totalRows: number; importedRows: number; errorRows: number; createdAt: string }[];
  templates: { id: string; name: string; entityType: string; mapping: Record<string, string> }[];
  errors: { importJobId: string; rowNumber: number; message: string }[];
};

export type LookupItem = { id: string; name: string };
export type SolverContext = {
  days: ScheduleDay[];
  requirements: SolverRequirement[];
  teachers: SolverTeacher[];
  constraints: ScheduleConstraint[];
  sections: LookupItem[];
  subjects: LookupItem[];
  teacherNames: LookupItem[];
  rooms: LookupItem[];
};
export type ConstraintInput = Omit<ScheduleConstraint, "id"> & { id?: string };
export type TimetableVersion = {
  id: string;
  name: string;
  status: "draft" | "published" | "archived";
  solverStatus: "success" | "partial" | "failed" | null;
  penaltyScore: number | null;
  sourceVersionId: string | null;
  createdAt: string;
};
export type TimetableOverview = {
  versions: TimetableVersion[];
  selectedVersionId: string | null;
  entries: TimetableEntry[];
  canUndo: boolean;
  canRedo: boolean;
};
export type GenerateTimetableRequest = {
  name: string;
  solverStatus: "success" | "partial" | "failed";
  penaltyScore: number;
  entries: Omit<TimetableEntry, "id">[];
};
export type MoveLessonRequest = { versionId: string; entryId: string; weekday: number; periodIndex: number };

export const desktopApi = {
  createSchoolDatabase: (settings: SchoolSettings) =>
    invoke<SchoolDatabase>("create_school_database", { settings }),
  openSchoolDatabase: () => invoke<SchoolDatabase | null>("open_school_database"),
  getSchoolSettings: () => invoke<SchoolSettings>("get_school_settings"),
  saveSchoolSettings: (settings: SchoolSettings) =>
    invoke<SchoolSettings>("save_school_settings", { settings }),
  listEntities: (entityType: EntityKind, includeArchived = false) =>
    invoke<EntityRecord[]>("list_entities", { entityType, includeArchived }),
  createEntity: (entityType: EntityKind, payload: EntityFields) =>
    invoke<EntityRecord>("create_entity", { entityType, payload }),
  updateEntity: (entityType: EntityKind, id: string, payload: EntityFields) =>
    invoke<EntityRecord>("update_entity", { entityType, id, payload }),
  archiveEntity: (entityType: EntityKind, id: string, reason?: string) =>
    invoke<EntityRecord>("archive_entity", { entityType, id, reason }),
  restoreEntity: (entityType: EntityKind, id: string) =>
    invoke<EntityRecord>("restore_entity", { entityType, id }),
  importParseFile: () => invoke<ImportFile | null>("import_parse_file"),
  importCommit: (request: ImportCommitRequest) =>
    invoke<ImportCommitResult>("import_commit", { request }),
  getImportOverview: () => invoke<ImportOverview>("get_import_overview"),
  getSolverContext: () => invoke<SolverContext>("get_solver_context"),
  listConstraints: () => invoke<ScheduleConstraint[]>("list_constraints"),
  saveConstraint: (input: ConstraintInput) => invoke<ScheduleConstraint>("save_constraint", { input }),
  archiveConstraint: (id: string) => invoke<void>("archive_constraint", { id }),
  generateTimetable: (request: GenerateTimetableRequest) => invoke<TimetableOverview>("generate_timetable", { request }),
  getTimetableOverview: (versionId?: string) => invoke<TimetableOverview>("get_timetable_overview", { versionId }),
  validateLessonMove: (request: MoveLessonRequest) => invoke<{ valid: boolean; message: string }>("validate_lesson_move", { request }),
  moveLesson: (request: MoveLessonRequest) => invoke<TimetableOverview>("move_lesson", { request }),
  undoTimetableChange: (versionId: string) => invoke<TimetableOverview>("undo_timetable_change", { versionId }),
  redoTimetableChange: (versionId: string) => invoke<TimetableOverview>("redo_timetable_change", { versionId }),
  revertTimetableVersion: (sourceVersionId: string, name: string) => invoke<TimetableOverview>("revert_timetable_version", { sourceVersionId, name }),
  setTimetableStatus: (versionId: string, status: TimetableVersion["status"]) => invoke<TimetableOverview>("set_timetable_status", { versionId, status }),
};

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}
