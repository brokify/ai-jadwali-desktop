import type { SolverContext } from "../../lib/tauri";

export const demoSolverContext: SolverContext = {
  days: [
    { weekday: 0, label: "الأحد", periods: 6 },
    { weekday: 1, label: "الاثنين", periods: 6 },
    { weekday: 2, label: "الثلاثاء", periods: 6 },
    { weekday: 3, label: "الأربعاء", periods: 5 },
    { weekday: 4, label: "الخميس", periods: 5 },
  ],
  sections: [{ id: "section-a", name: "الأول أ" }, { id: "section-b", name: "الأول ب" }],
  subjects: [{ id: "math", name: "الرياضيات" }, { id: "arabic", name: "اللغة العربية" }, { id: "science", name: "العلوم" }],
  teacherNames: [{ id: "teacher-1", name: "أحمد سالم" }, { id: "teacher-2", name: "نورة علي" }, { id: "teacher-3", name: "منى حسن" }],
  rooms: [{ id: "room-1", name: "قاعة 101" }, { id: "lab", name: "مختبر العلوم" }],
  teachers: [
    { id: "teacher-1", maxPeriodsPerDay: 4, maxPeriodsPerWeek: 18 },
    { id: "teacher-2", maxPeriodsPerDay: 4, maxPeriodsPerWeek: 18 },
    { id: "teacher-3", maxPeriodsPerDay: 3, maxPeriodsPerWeek: 15 },
  ],
  requirements: [
    { id: "req-1", sectionId: "section-a", subjectId: "math", teacherId: "teacher-1", roomId: "room-1", periodsPerWeek: 5, consecutivePeriods: 1 },
    { id: "req-2", sectionId: "section-a", subjectId: "arabic", teacherId: "teacher-2", roomId: "room-1", periodsPerWeek: 5, consecutivePeriods: 1 },
    { id: "req-3", sectionId: "section-a", subjectId: "science", teacherId: "teacher-3", roomId: "lab", periodsPerWeek: 3, consecutivePeriods: 1 },
    { id: "req-4", sectionId: "section-b", subjectId: "math", teacherId: "teacher-1", roomId: "room-1", periodsPerWeek: 5, consecutivePeriods: 1 },
    { id: "req-5", sectionId: "section-b", subjectId: "arabic", teacherId: "teacher-2", roomId: "room-1", periodsPerWeek: 5, consecutivePeriods: 1 },
    { id: "req-6", sectionId: "section-b", subjectId: "science", teacherId: "teacher-3", roomId: "lab", periodsPerWeek: 3, consecutivePeriods: 1 },
  ],
  constraints: [
    { id: "demo-c1", constraintType: "teacher_unavailable", strength: "hard", weight: 1, payload: { teacherId: "teacher-1", weekday: 0, periodIndex: 0 }, enabled: true },
    { id: "demo-c2", constraintType: "prefer_distribution", strength: "soft", weight: 3, payload: {}, enabled: true },
    { id: "demo-c3", constraintType: "avoid_last_period", strength: "soft", weight: 2, payload: { subjectId: "math" }, enabled: true },
  ],
};
