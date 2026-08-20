import { create } from "zustand";
import type { SolverContext, TimetableOverview } from "../lib/tauri";

type ScheduleState = {
  context: SolverContext | null;
  overview: TimetableOverview | null;
  setContext: (context: SolverContext) => void;
  setOverview: (overview: TimetableOverview) => void;
};

export const useScheduleStore = create<ScheduleState>((set) => ({
  context: null,
  overview: null,
  setContext: (context) => set({ context }),
  setOverview: (overview) => set({ overview }),
}));
