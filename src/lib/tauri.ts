import { invoke } from "@tauri-apps/api/core";

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
};

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}
