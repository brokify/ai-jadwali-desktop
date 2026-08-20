import type {
  MoveValidation,
  ScheduleConstraint,
  SolverAdapter,
  SolverInput,
  SolverRequirement,
  SolverResult,
  TimetableEntry,
} from "./types";

type Block = { requirement: SolverRequirement; length: number; index: number };
type Candidate = { weekday: number; periodIndex: number; penalty: number };

function activeConstraints(input: SolverInput, type: ScheduleConstraint["constraintType"]) {
  return input.constraints.filter((constraint) => constraint.enabled && constraint.constraintType === type);
}

function isUnavailable(
  constraints: ScheduleConstraint[],
  key: "teacherId" | "roomId",
  id: string | null,
  weekday: number,
  periodIndex: number,
) {
  if (!id) return false;
  return constraints.some((constraint) =>
    constraint.strength === "hard"
    && constraint.payload[key] === id
    && constraint.payload.weekday === weekday
    && constraint.payload.periodIndex === periodIndex,
  );
}

function collision(entries: TimetableEntry[], requirement: SolverRequirement, weekday: number, periodIndex: number, ignoredId?: string) {
  return entries.some((entry) => entry.id !== ignoredId && entry.weekday === weekday && entry.periodIndex === periodIndex && (
    entry.sectionId === requirement.sectionId
    || Boolean(requirement.teacherId && entry.teacherId === requirement.teacherId)
    || Boolean(requirement.roomId && entry.roomId === requirement.roomId)
  ));
}

function teacherLimitExceeded(input: SolverInput, entries: TimetableEntry[], requirement: SolverRequirement, weekday: number, addedPeriods = 1) {
  if (!requirement.teacherId) return false;
  const teacher = input.teachers.find((item) => item.id === requirement.teacherId);
  if (!teacher) return false;
  const daily = entries.filter((entry) => entry.teacherId === teacher.id && entry.weekday === weekday).length;
  const weekly = entries.filter((entry) => entry.teacherId === teacher.id).length;
  return Boolean(
    (teacher.maxPeriodsPerDay && daily + addedPeriods > teacher.maxPeriodsPerDay)
    || (teacher.maxPeriodsPerWeek && weekly + addedPeriods > teacher.maxPeriodsPerWeek),
  );
}

function softPenalty(input: SolverInput, entries: TimetableEntry[], requirement: SolverRequirement, weekday: number, periodIndex: number) {
  let penalty = 0;
  const day = input.days.find((item) => item.weekday === weekday);
  for (const constraint of activeConstraints(input, "avoid_last_period")) {
    const subjectMatches = !constraint.payload.subjectId || constraint.payload.subjectId === requirement.subjectId;
    if (constraint.strength === "soft" && subjectMatches && day && periodIndex === day.periods - 1) penalty += constraint.weight;
  }
  for (const constraint of activeConstraints(input, "prefer_distribution")) {
    const subjectMatches = !constraint.payload.subjectId || constraint.payload.subjectId === requirement.subjectId;
    const sectionMatches = !constraint.payload.sectionId || constraint.payload.sectionId === requirement.sectionId;
    if (constraint.strength === "soft" && subjectMatches && sectionMatches
      && entries.some((entry) => entry.sectionId === requirement.sectionId && entry.subjectId === requirement.subjectId && entry.weekday === weekday)) {
      penalty += constraint.weight;
    }
  }
  return penalty;
}

function blocksFor(requirement: SolverRequirement) {
  const blocks: Block[] = [];
  let remaining = requirement.periodsPerWeek;
  let index = 0;
  while (remaining > 0) {
    const length = Math.min(Math.max(1, requirement.consecutivePeriods), remaining);
    blocks.push({ requirement, length, index });
    remaining -= length;
    index += 1;
  }
  return blocks;
}

function candidates(input: SolverInput, entries: TimetableEntry[], block: Block) {
  const teacherUnavailable = activeConstraints(input, "teacher_unavailable");
  const roomUnavailable = activeConstraints(input, "room_unavailable");
  const result: Candidate[] = [];
  for (const day of input.days) {
    for (let start = 0; start + block.length <= day.periods; start += 1) {
      let valid = true;
      let penalty = 0;
      if (teacherLimitExceeded(input, entries, block.requirement, day.weekday, block.length)) continue;
      for (let offset = 0; offset < block.length; offset += 1) {
        const period = start + offset;
        if (collision(entries, block.requirement, day.weekday, period)
          || isUnavailable(teacherUnavailable, "teacherId", block.requirement.teacherId, day.weekday, period)
          || isUnavailable(roomUnavailable, "roomId", block.requirement.roomId, day.weekday, period)) {
          valid = false;
          break;
        }
        penalty += softPenalty(input, entries, block.requirement, day.weekday, period);
      }
      if (valid) result.push({ weekday: day.weekday, periodIndex: start, penalty });
    }
  }
  return result.sort((a, b) => a.penalty - b.penalty || a.weekday - b.weekday || a.periodIndex - b.periodIndex);
}

function makeEntries(block: Block, candidate: Candidate): TimetableEntry[] {
  return Array.from({ length: block.length }, (_, offset) => ({
    id: `${block.requirement.id}-${block.index}-${offset}`,
    lessonRequirementId: block.requirement.id,
    sectionId: block.requirement.sectionId,
    subjectId: block.requirement.subjectId,
    teacherId: block.requirement.teacherId,
    roomId: block.requirement.roomId,
    weekday: candidate.weekday,
    periodIndex: candidate.periodIndex + offset,
  }));
}

export class LocalSolverAdapter implements SolverAdapter {
  generate(input: SolverInput): SolverResult {
    const blocks = input.requirements.flatMap(blocksFor).sort((a, b) => {
      const aWeight = a.length * 10 + Number(Boolean(a.requirement.teacherId)) + Number(Boolean(a.requirement.roomId));
      const bWeight = b.length * 10 + Number(Boolean(b.requirement.teacherId)) + Number(Boolean(b.requirement.roomId));
      return bWeight - aWeight;
    });
    if (!input.days.length || !blocks.length) {
      return { status: "failed", entries: [], conflicts: [{ requirementId: "", message: "لا توجد أيام دوام أو متطلبات حصص قابلة للجدولة.", missingPeriods: 0 }], penaltyScore: 0, exploredNodes: 0 };
    }
    const maxNodes = Math.max(1_000, Math.min(input.maxSearchNodes ?? 40_000, 250_000));
    const totalPeriods = blocks.reduce((sum, block) => sum + block.length, 0);
    let exploredNodes = 0;
    let bestEntries: TimetableEntry[] = [];
    let bestPenalty = Number.POSITIVE_INFINITY;

    const visit = (index: number, entries: TimetableEntry[], penalty: number): boolean => {
      exploredNodes += 1;
      if (entries.length > bestEntries.length || (entries.length === bestEntries.length && penalty < bestPenalty)) {
        bestEntries = [...entries];
        bestPenalty = penalty;
      }
      if (index === blocks.length) return entries.length === totalPeriods;
      if (exploredNodes >= maxNodes) return false;
      for (const candidate of candidates(input, entries, blocks[index])) {
        const placed = makeEntries(blocks[index], candidate);
        if (visit(index + 1, [...entries, ...placed], penalty + candidate.penalty)) return true;
      }
      if (exploredNodes < maxNodes) visit(index + 1, entries, penalty);
      return false;
    };

    const success = visit(0, [], 0);
    const missingByRequirement = new Map<string, number>();
    for (const requirement of input.requirements) {
      const placed = bestEntries.filter((entry) => entry.lessonRequirementId === requirement.id).length;
      if (placed < requirement.periodsPerWeek) missingByRequirement.set(requirement.id, requirement.periodsPerWeek - placed);
    }
    const conflicts = [...missingByRequirement.entries()].map(([requirementId, missingPeriods]) => ({
      requirementId,
      missingPeriods,
      message: `تعذر وضع ${missingPeriods} حصة بسبب امتلاء الأوقات أو تعارض المعلم أو الشعبة أو القاعة أو عدم التوفر.`,
    }));
    return {
      status: success ? "success" : bestEntries.length ? "partial" : "failed",
      entries: bestEntries,
      conflicts,
      penaltyScore: Number.isFinite(bestPenalty) ? bestPenalty : 0,
      exploredNodes,
    };
  }
}

export function validateMove(input: SolverInput, entries: TimetableEntry[], entryId: string, weekday: number, periodIndex: number): MoveValidation {
  const entry = entries.find((item) => item.id === entryId);
  if (!entry) return { valid: false, message: "الحصة المطلوبة غير موجودة.", penaltyDelta: 0 };
  const day = input.days.find((item) => item.weekday === weekday);
  if (!day || periodIndex < 0 || periodIndex >= day.periods) return { valid: false, message: "الوقت الجديد خارج أيام أو حصص الدوام.", penaltyDelta: 0 };
  const requirement = input.requirements.find((item) => item.id === entry.lessonRequirementId);
  if (!requirement) return { valid: false, message: "متطلب الحصة غير موجود.", penaltyDelta: 0 };
  if (collision(entries, requirement, weekday, periodIndex, entryId)) return { valid: false, message: "يوجد تعارض للشعبة أو المعلم أو القاعة في هذا الوقت.", penaltyDelta: 0 };
  if (isUnavailable(activeConstraints(input, "teacher_unavailable"), "teacherId", entry.teacherId, weekday, periodIndex)) return { valid: false, message: "المعلم غير متاح في هذا الوقت.", penaltyDelta: 0 };
  if (isUnavailable(activeConstraints(input, "room_unavailable"), "roomId", entry.roomId, weekday, periodIndex)) return { valid: false, message: "القاعة غير متاحة في هذا الوقت.", penaltyDelta: 0 };
  const otherEntries = entries.filter((item) => item.id !== entryId);
  const before = softPenalty(input, otherEntries, requirement, entry.weekday, entry.periodIndex);
  const after = softPenalty(input, otherEntries, requirement, weekday, periodIndex);
  return { valid: true, message: after > before ? "النقل صالح لكنه يزيد جزاء القيود المرنة." : "النقل صالح.", penaltyDelta: after - before };
}

export const localSolver = new LocalSolverAdapter();
