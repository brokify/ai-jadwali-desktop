import { create } from "zustand";
import type { EntityKind, EntityRecord } from "../lib/tauri";

export const entityKinds: EntityKind[] = [
  "grades",
  "sections",
  "subjects",
  "teachers",
  "rooms",
  "lesson_requirements",
];

type DataState = {
  records: Record<EntityKind, EntityRecord[]>;
  setRecords: (kind: EntityKind, records: EntityRecord[]) => void;
  upsertRecord: (kind: EntityKind, record: EntityRecord) => void;
};

const emptyRecords: Record<EntityKind, EntityRecord[]> = {
  grades: [],
  sections: [],
  subjects: [],
  teachers: [],
  rooms: [],
  lesson_requirements: [],
};

export const useDataStore = create<DataState>((set) => ({
  records: emptyRecords,
  setRecords: (kind, records) =>
    set((state) => ({ records: { ...state.records, [kind]: records } })),
  upsertRecord: (kind, record) =>
    set((state) => {
      const current = state.records[kind];
      const exists = current.some((item) => item.id === record.id);
      return {
        records: {
          ...state.records,
          [kind]: exists
            ? current.map((item) => (item.id === record.id ? record : item))
            : [record, ...current],
        },
      };
    }),
}));
