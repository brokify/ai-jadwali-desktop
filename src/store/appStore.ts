import { create } from "zustand";
import type { SchoolSettings } from "../lib/tauri";

type AppState = {
  settings: SchoolSettings | null;
  databasePath: string | null;
  setSchool: (settings: SchoolSettings, databasePath: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  settings: null,
  databasePath: null,
  setSchool: (settings, databasePath) => set({ settings, databasePath }),
}));
