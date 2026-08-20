import { invoke } from "@tauri-apps/api/core";

export type SchoolSettings = {
  schoolName: string;
  academicYear: string;
  workingDays: string[];
  periodsPerDay: number;
  periodDurationMinutes: number;
  dayStartTime: string;
  language: "ar" | "en";
};

export type SchoolDatabase = { path: string; settings: SchoolSettings };

export const desktopApi = {
  createSchoolDatabase: (settings: SchoolSettings) =>
    invoke<SchoolDatabase>("create_school_database", { settings }),
  openSchoolDatabase: () => invoke<SchoolDatabase | null>("open_school_database"),
  getSchoolSettings: () => invoke<SchoolSettings>("get_school_settings"),
  saveSchoolSettings: (settings: SchoolSettings) =>
    invoke<SchoolSettings>("save_school_settings", { settings }),
};

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}
