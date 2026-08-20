import { describe, expect, test } from "vitest";
import { LocalSolverAdapter, validateMove } from "./solver";
import type { SolverInput } from "./types";

function input(): SolverInput {
  return {
    days: [{ weekday: 0, label: "الأحد", periods: 3 }, { weekday: 1, label: "الاثنين", periods: 3 }],
    teachers: [{ id: "t1", maxPeriodsPerDay: 2, maxPeriodsPerWeek: 4 }],
    requirements: [
      { id: "r1", sectionId: "s1", subjectId: "math", teacherId: "t1", roomId: "room1", periodsPerWeek: 2, consecutivePeriods: 1 },
      { id: "r2", sectionId: "s2", subjectId: "science", teacherId: "t1", roomId: "room2", periodsPerWeek: 2, consecutivePeriods: 1 },
    ],
    constraints: [{ id: "c1", constraintType: "teacher_unavailable", strength: "hard", weight: 1, payload: { teacherId: "t1", weekday: 0, periodIndex: 0 }, enabled: true }],
  };
}

describe("local timetable solver", () => {
  test("creates a complete timetable without hard collisions", () => {
    const source = input();
    const result = new LocalSolverAdapter().generate(source);
    expect(result.status).toBe("success");
    expect(result.entries).toHaveLength(4);
    expect(result.entries.some((entry) => entry.weekday === 0 && entry.periodIndex === 0)).toBe(false);
    const keys = result.entries.map((entry) => `${entry.teacherId}-${entry.weekday}-${entry.periodIndex}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("returns an Arabic partial explanation when capacity is insufficient", () => {
    const source = input();
    source.days = [{ weekday: 0, label: "الأحد", periods: 1 }];
    source.constraints = [];
    const result = new LocalSolverAdapter().generate(source);
    expect(result.status).toBe("partial");
    expect(result.conflicts[0].message).toContain("تعذر وضع");
  });

  test("rejects a move that creates a teacher collision", () => {
    const source = input();
    const result = new LocalSolverAdapter().generate(source);
    const first = result.entries[0];
    const other = result.entries.find((entry) => entry.id !== first.id)!;
    const validation = validateMove(source, result.entries, first.id, other.weekday, other.periodIndex);
    expect(validation.valid).toBe(false);
    expect(validation.message).toContain("تعارض");
  });

  test("continues after an impossible requirement to produce the best partial result", () => {
    const source = input();
    source.days = [{ weekday: 0, label: "الأحد", periods: 2 }];
    source.requirements[1] = { ...source.requirements[1], teacherId: null, roomId: null };
    source.constraints = [0, 1].map((periodIndex) => ({ id: `c-${periodIndex}`, constraintType: "teacher_unavailable", strength: "hard", weight: 1, payload: { teacherId: "t1", weekday: 0, periodIndex }, enabled: true }));
    const result = new LocalSolverAdapter().generate(source);
    expect(result.status).toBe("partial");
    expect(result.entries.every((entry) => entry.lessonRequirementId === "r2")).toBe(true);
    expect(result.entries).toHaveLength(2);
  });
});
