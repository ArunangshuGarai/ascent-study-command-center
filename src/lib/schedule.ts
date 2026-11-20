import type {
  AppState,
  BlockTemplate,
  PlannerSettings,
  PrepLevel,
  StudyTarget,
  SubjectId,
  TargetKind,
  Task,
  TaskKind,
} from '../types';
import {
  SUBJECTS,
  TOPICS,
  TOPIC_MAP,
  TOTAL_TOPIC_UNITS,
  defaultSettings,
} from '../data/curriculum';
import {
  createTarget,
  gateTarget,
  seedGateCurriculum,
} from './targets';
import { generateTargetTasks } from './universalSchedule';
import {
  FLOW_PLAN_END,
  FLOW_PLAN_START,
  PLAN_BY_DATE,
  STUDY_PLAN,
  planForDate,
  studyFlowForDate,
  type FlowStudyBlock,
  type PlanDay,
} from '../data/dailyFlow';
import {
  addDays,
  clamp,
  coverageStats,
  diffDays,
  endOfWeek,
  formatDate,
  hashString,
  hoursLabel,
  minutesFromTime,
  rangeInclusive,
  slotForTime,
  startOfWeek,
  subjectListLabel,
  sumMinutes,
  timeFromMinutes,
  toISO,
  todayISO,
  weekdayIndex,
} from './utils';

export interface PhaseInfo {
  phaseStart: string;
  phaseEnd: string;
  studyEnd: string;
  mockDates: string[];
  testingDates: string[];
  analysisDates: string[];
  revisionDates: string[];
}

export function computePhases(settings: PlannerSettings): PhaseInfo {
  const today = todayISO();
  const exam = settings.examDate;
  const phaseEnd = addDays(exam, -1);

  // When the exam is the one this 84-day plan was built for, the plan owns the
  // mock and revision calendar. Later exams fall back to the adaptive phase
  // logic so the horizon never runs dry.
  if (settings.dailyFlow && exam <= addDays(FLOW_PLAN_END, 1)) {
    const flowRows = STUDY_PLAN.filter((row) => row.date <= exam && row.date >= FLOW_PLAN_START);
    if (flowRows.length) {
      const mockDates = flowRows.filter((row) => row.mode === 'mock').map((row) => row.date);
      const revisionDates = flowRows
        .filter((row) => row.mode === 'revision' || row.mode === 'rest')
        .map((row) => row.date);
      const phaseStart = mockDates[0] ?? addDays(exam, -settings.mockPhaseDays);
      return {
        phaseStart,
        phaseEnd,
        studyEnd: addDays(phaseStart, -1),
        mockDates,
        testingDates: flowRows
          .filter((row) => row.mode === 'study' || row.mode === 'mock')
          .map((row) => row.date),
        analysisDates: [],
        revisionDates,
      };
    }
  }

  const desiredStart = addDays(exam, -settings.mockPhaseDays);
  const phaseStart = desiredStart > today ? desiredStart : today;
  const allPhaseDates = rangeInclusive(phaseStart, phaseEnd);
  const revisionCount = clamp(settings.revisionDays, 0, Math.max(0, allPhaseDates.length - 1));
  const testingDates = allPhaseDates.slice(0, Math.max(0, allPhaseDates.length - revisionCount));
  const revisionDates = allPhaseDates.slice(Math.max(0, allPhaseDates.length - revisionCount));
  const mockCount = clamp(settings.mockCount, 1, Math.max(1, testingDates.length));
  const positions = new Set<number>();
  if (testingDates.length <= mockCount) {
    testingDates.forEach((_, index) => positions.add(index));
  } else {
    for (let i = 0; i < mockCount; i += 1) {
      const position = mockCount === 1
        ? 0
        : Math.round((i * (testingDates.length - 1)) / (mockCount - 1));
      positions.add(position);
    }
  }
  const mockDates = Array.from(positions).sort((a, b) => a - b).map((index) => testingDates[index]);
  const analysisDates = testingDates.filter((date) => !mockDates.includes(date));
  return {
    phaseStart,
    phaseEnd,
    studyEnd: addDays(phaseStart, -1),
    mockDates,
    testingDates,
    analysisDates,
    revisionDates,
  };
}

export function isHeavyDay(date: string, settings: PlannerSettings): boolean {
  return settings.heavyDays.includes(weekdayIndex(date));
}

function templateFor(date: string, settings: PlannerSettings): BlockTemplate[] {
  return isHeavyDay(date, settings) ? settings.weekend : settings.weekday;
}

function coreSlots(date: string, settings: PlannerSettings): BlockTemplate[] {
  return templateFor(date, settings)
    .filter((block) => block.role === 'core')
    .sort((a, b) => minutesFromTime(a.start) - minutesFromTime(b.start));
}

/** Study minutes available on a date from the target's per-weekday budget. */
function targetDayBudget(target: StudyTarget | undefined, date: string): number | undefined {
  const value = target?.dayMinutes?.[weekdayIndex(date)];
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return clamp(Math.round(value), 0, 16 * 60);
}

/**
 * Keep the highest-value blocks that fit the day's available study minutes.
 * A block that almost fits is trimmed to the remaining quarter-hour instead of
 * silently overloading the day.
 */
function fitFlowBlocks(blocks: FlowStudyBlock[], budget: number | undefined): FlowStudyBlock[] {
  if (budget === undefined) return blocks;
  const priority: Partial<Record<FlowStudyBlock['role'], number>> = {
    mock: 0,
    core: 1,
    practice: 2,
    pyq: 3,
    test: 4,
    analysis: 5,
    revision: 6,
    night: 7,
    'rest-morning': 0,
    'rest-walk': 1,
    'rest-sleep': 2,
  };
  const ranked = blocks
    .map((block, index) => ({ block, index, rank: priority[block.role] ?? 20 }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  let remaining = budget;
  const selected = new Map<number, FlowStudyBlock>();
  ranked.forEach((entry) => {
    if (remaining < 45) return;
    if (entry.block.duration <= remaining) {
      selected.set(entry.index, entry.block);
      remaining -= entry.block.duration;
    } else {
      const duration = Math.max(45, Math.floor(remaining / 15) * 15);
      selected.set(entry.index, { ...entry.block, duration });
      remaining -= duration;
    }
  });
  return blocks
    .map((_, index) => selected.get(index))
    .filter((block): block is FlowStudyBlock => Boolean(block));
}

function fitCoreSlots(slots: BlockTemplate[], budget: number | undefined): BlockTemplate[] {
  if (budget === undefined) return slots;
  let remaining = budget;
  const kept: BlockTemplate[] = [];
  slots.forEach((slot) => {
    if (remaining < 45) return;
    if (slot.duration <= remaining) {
      kept.push(slot);
      remaining -= slot.duration;
    } else {
      const duration = Math.max(45, Math.floor(remaining / 15) * 15);
      kept.push({ ...slot, duration });
      remaining -= duration;
    }
  });
  return kept;
}

function generatedId(...parts: Array<string | number | undefined>): string {
  return `gen_${hashString(parts.filter(Boolean).join('|'))}`;
}

function makeTask(input: Omit<Task, 'id'> & { id?: string }): Task {
  return {
    ...input,
    id: input.id ?? generatedId(
      input.date,
      input.start,
      input.kind,
      input.topicId,
      input.sessionNo,
      input.title,
    ),
  };
}

function xpFor(kind: TaskKind, duration: number): number {
  switch (kind) {
    case 'study':
      return Math.max(20, Math.round(duration * 1));
    case 'practice':
      return 30;
    case 'pyq':
      return duration >= 60 ? 40 : 25;
    case 'test':
      return duration >= 90 ? 120 : 35;
    case 'mock':
      return 250;
    case 'analysis':
      return 60;
    case 'revision':
      return 40;
    case 'personal':
      return 10;
    case 'exam':
      return 500;
    default:
      return 0;
  }
}

function practiceSubject(date: string, index: number, allowed?: SubjectId[]): SubjectId {
  const pool = allowed?.length ? SUBJECTS.filter((subject) => allowed.includes(subject.id)) : SUBJECTS;
  const baseline = Math.abs(diffDays('2026-01-01', date));
  return pool[(baseline + index * 5) % pool.length].id;
}

interface GenerationResult {
  tasks: Task[];
  deferred: number;
  coverage: number;
}

interface AccountState {
  usedSessions: Map<string, Set<number>>;
}

function accountPreserved(preserved: Task[], today: string): AccountState {
  const usedSessions = new Map<string, Set<number>>();
  preserved.forEach((task) => {
    if (task.kind !== 'study' || !task.topicId) return;
    const counts = task.status === 'done' || (task.status === 'todo' && task.date >= today);
    if (!counts) return;
    const set = usedSessions.get(task.topicId) ?? new Set<number>();
    const number = task.sessionNo ?? 1;
    set.add(number);
    usedSessions.set(task.topicId, set);
  });
  return { usedSessions };
}

export function orderedTopics(
  boostedSubjects: SubjectId[],
  subjectOrder?: SubjectId[],
): typeof TOPICS {
  const boostSet = new Set(boostedSubjects);
  const allowed = subjectOrder?.length ? new Set(subjectOrder) : null;
  const rank = new Map((subjectOrder ?? SUBJECTS.map((subject) => subject.id)).map((id, index) => [id, index]));
  const pool = allowed ? TOPICS.filter((topic) => allowed.has(topic.subjectId)) : TOPICS;
  const boosted = pool.filter((topic) => boostSet.has(topic.subjectId));
  const regular = pool.filter((topic) => !boostSet.has(topic.subjectId));
  const byPhase = (phase: 1 | 2 | 3) => {
    const phaseTopics = regular.filter((topic) => topic.phase === phase);
    const subjectOrderForPhase = Array.from(new Set(phaseTopics.map((topic) => topic.subjectId)))
      .sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));
    const groups = subjectOrderForPhase.map((subjectId) => ({
      subjectId,
      topics: phaseTopics.filter((topic) => topic.subjectId === subjectId),
    }));
    const result: typeof TOPICS = [];
    let index = 0;
    while (groups.some((group) => index < group.topics.length)) {
      groups.forEach((group) => {
        if (group.topics[index]) result.push(group.topics[index]);
      });
      index += 1;
    }
    return result;
  };
  return [...boosted, ...byPhase(1), ...byPhase(2), ...byPhase(3)];
}

export function generateGateTasks(
  state: AppState,
  fromDate: string,
): GenerationResult {
  const today = todayISO();
  const settings = state.settings;
  const exam = settings.examDate;
  const start = fromDate < today ? today : fromDate;
  const gate = state.targets.find(
    (target) => target.preset === 'gate-cse' && !target.archivedAt,
  );

  // Without a GATE preset target the specialised Daily Flow has no curriculum
  // to schedule. Keep every durable task and let the universal generator own
  // the custom targets.
  if (!gate) {
    const preserved = state.tasks.filter(
      (task) => task.date < start || task.status === 'done' || task.manual,
    );
    const coverage = coverageStats(preserved);
    return {
      tasks: preserved.sort(compareTasks),
      deferred: coverage.deferredTopicCount,
      coverage: coverage.pct,
    };
  }

  const phases = computePhases(settings);
  const allDates = rangeInclusive(start, exam);
  const restSet = new Set(state.restDays.filter((date) => date >= start && date < exam));
  const heavySet = new Set(settings.heavyDays);
  const subjectOrder = gate.subjectOrder?.length ? gate.subjectOrder : undefined;
  const budgetFor = (date: string) => targetDayBudget(gate, date);

  // Preserve history, completed work, and user-authored/moved tasks. On a full
  // rebuild nothing pending on or after the start date survives — except work
  // that belongs to another target, which the universal generator owns.
  const preserved: Task[] = [];
  state.tasks.forEach((task) => {
    const isHistory = task.date < start;
    const isDone = task.status === 'done';
    const isManual = Boolean(task.manual) && task.date >= start;
    const isOtherTarget = Boolean(task.targetId && task.targetId !== gate.id);
    if (isOtherTarget) {
      if (isHistory || isDone || isManual) preserved.push(task);
      return;
    }
    if (isHistory || isDone || (isManual && task.date <= exam)) {
      if (task.date <= exam || isHistory) preserved.push(task);
    }
  });

  const existingByDate = new Map<string, Task[]>();
  preserved.forEach((task) => {
    const list = existingByDate.get(task.date) ?? [];
    list.push(task);
    existingByDate.set(task.date, list);
  });

  const generated: Task[] = [];
  const accounts = accountPreserved(preserved, today);
  const topicOrder = orderedTopics(state.boostedSubjects, subjectOrder);
  const topicRank = new Map(topicOrder.map((topic, index) => [topic.id, index]));
  const queue = topicOrder.flatMap((topic) => {
    const used = accounts.usedSessions.get(topic.id) ?? new Set<number>();
    const units: { topicId: string; sessionNo: number }[] = [];
    for (let number = 1; number <= topic.units; number += 1) {
      if (!used.has(number)) units.push({ topicId: topic.id, sessionNo: number });
    }
    return units;
  });

  // A normal completion retires only its own plan row. An early completion is
  // a declaration that the whole topic is already known, so every remaining
  // row for that topic is removed and the rest of the queue pulls forward.
  const planUnitId = (date: string) => `plan:${date}`;
  const taskUnitId = (task: Task): string | undefined => {
    if (task.planUnitId) return task.planUnitId;
    const match = task.planSignature?.match(/(?:early:|moved:)?flow:(\d{4}-\d{2}-\d{2}):core(?::|$)/);
    return match ? `plan:${match[1]}` : undefined;
  };
  const completedTopicDates = new Map<string, string>();
  const completedUnitIds = new Set<string>();
  const earlyTopicIds = new Set<string>();
  preserved.forEach((task) => {
    if (task.status !== 'done' || task.kind !== 'study') return;
    if (task.topicId) {
      const completedOn = task.completedAt ? toISO(new Date(task.completedAt)) : task.date;
      const previous = completedTopicDates.get(task.topicId);
      if (!previous || completedOn > previous) completedTopicDates.set(task.topicId, completedOn);
      if (task.earlyCompleted) earlyTopicIds.add(task.topicId);
    }
    const unitId = taskUnitId(task);
    if (unitId) completedUnitIds.add(unitId);
  });
  const reservedUnitIds = new Set(
    preserved
      .filter((task) => task.manual && task.kind === 'study')
      .map(taskUnitId)
      .filter((unitId): unitId is string => Boolean(unitId)),
  );
  // A re-flow that starts in the future (for example after adding a block next
  // week) keeps every pending generated row before that date. Those rows still
  // own their plan units, so the queue must not assign those units again.
  const carriedUnitIds = new Set(
    preserved
      .filter((task) => task.date < start && task.kind === 'study')
      .map(taskUnitId)
      .filter((unitId): unitId is string => Boolean(unitId)),
  );

  // Spaced recall: passes are counted from completed revision blocks. A pass
  // that is missed stays due until the operator actually clears it.
  const recallOffsets = [1, 3, 7, 14];
  const recallPasses = new Map<string, number>();
  const claimedRecallTopicIds = new Set<string>();
  preserved.forEach((task) => {
    if (task.status !== 'done' || task.kind !== 'revision' || !task.recallTopicIds?.length) return;
    new Set(task.recallTopicIds).forEach((topicId) => {
      const completedOn = completedTopicDates.get(topicId);
      if (!completedOn || task.date < completedOn) return;
      recallPasses.set(topicId, (recallPasses.get(topicId) ?? 0) + 1);
    });
  });
  const dueRecallFor = (date: string) => {
    const due: Array<{ topicId: string; title: string; subjectId?: SubjectId; dueDate: string }> = [];
    completedTopicDates.forEach((completedOn, topicId) => {
      if (claimedRecallTopicIds.has(topicId)) return;
      const pass = recallPasses.get(topicId) ?? 0;
      const offset = recallOffsets[pass];
      if (offset === undefined) return;
      const dueDate = addDays(completedOn, offset);
      if (dueDate > date) return;
      const topic = TOPIC_MAP.get(topicId);
      if (!topic) return;
      due.push({ topicId, title: topic.title, subjectId: topic.subjectId, dueDate });
    });
    return due.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);
  };

  // Topics the original 84-day plan never names have no row of their own. They
  // wait behind the plan as a reserve queue, so any slot freed by early
  // completion is used to widen coverage instead of going generic.
  const planTopicIds = new Set(
    STUDY_PLAN.map((row) => row.topicId).filter((topicId): topicId is string => Boolean(topicId)),
  );
  const gapTopics = topicOrder.filter(
    (topic) =>
      !planTopicIds.has(topic.id) &&
      !earlyTopicIds.has(topic.id) &&
      !completedUnitIds.has(`gap:${topic.id}`) &&
      !reservedUnitIds.has(`gap:${topic.id}`) &&
      !carriedUnitIds.has(`gap:${topic.id}`),
  );

  const weekSubjects = new Map<string, Set<SubjectId>>();
  preserved.forEach((task) => {
    if (task.kind !== 'study' || !task.subjectId) return;
    const week = startOfWeek(task.date);
    const set = weekSubjects.get(week) ?? new Set<SubjectId>();
    set.add(task.subjectId);
    weekSubjects.set(week, set);
  });

  const addTask = (task: Task) => {
    generated.push(task);
    const list = existingByDate.get(task.date) ?? [];
    list.push(task);
    existingByDate.set(task.date, list);
    if ((task.kind === 'study' || task.kind === 'practice') && task.subjectId) {
      const week = startOfWeek(task.date);
      const set = weekSubjects.get(week) ?? new Set<SubjectId>();
      set.add(task.subjectId);
      weekSubjects.set(week, set);
    }
  };

  const hasPreserved = (date: string, predicate: (task: Task) => boolean) =>
    (existingByDate.get(date) ?? []).some(predicate);

  interface Interval {
    start: number;
    end: number;
  }

  const busyIntervals = (date: string): Interval[] =>
    (existingByDate.get(date) ?? [])
      .filter((task) => !task.earlyCompleted)
      .map((task) => {
        const start = minutesFromTime(task.start);
        return { start, end: start + task.duration };
      });

  const collides = (start: number, duration: number, intervals: Interval[]) =>
    intervals.some((interval) => start < interval.end && start + duration > interval.start);

  // Fixed-role blocks keep their template time unless a manual block owns that
  // window. Then they slide to the next free quarter-hour so the day never
  // silently double-books the operator.
  const freeStart = (date: string, preferred: string, duration: number): string | null => {
    const intervals = busyIntervals(date);
    const limit = minutesFromTime('22:30');
    let candidate = minutesFromTime(preferred);
    while (candidate + duration <= limit) {
      if (!collides(candidate, duration, intervals)) return timeFromMinutes(candidate);
      candidate += 15;
    }
    return null;
  };

  // The Daily Flow is a fixed rhythm, not a suggestion. Study windows are
  // generated as ordinary tasks so they can be completed, moved and scored;
  // the surrounding gym/meal/walk blocks live in the visual timeline. Manual
  // blocks still win: a collision slides the flow session to the next open
  // quarter-hour, exactly like the template blocks.
  const flowEnabled = settings.dailyFlow !== false;
  const flowDates = new Set<string>();
  if (flowEnabled) {
    rangeInclusive(start, addDays(exam, -1)).forEach((date) => {
      if (restSet.has(date)) return;
      if (PLAN_BY_DATE.has(date)) flowDates.add(date);
    });
  }

  const preservedFlowSignatures = new Set(
    preserved
      .filter((task) => task.planSignature?.startsWith(`flow:${task.date}:`))
      .map((task) => task.planSignature as string),
  );

  // The queue is the plan in its original order, minus anything already
  // completed or manually pinned. Every remaining study day pulls the next
  // unit, so banking a future deep-dive pulls every later topic forward.
  const unitPlanId = (unit: PlanDay) =>
    unit.date ? planUnitId(unit.date) : `gap:${unit.topicId ?? unit.core}`;
  const subjectAllowed = subjectOrder ? new Set(subjectOrder) : undefined;
  const planUnits: PlanDay[] = STUDY_PLAN
    .filter(
      (row) =>
        row.mode === 'study' &&
        (!subjectAllowed || (row.subjectId ? subjectAllowed.has(row.subjectId) : true)) &&
        !completedUnitIds.has(planUnitId(row.date)) &&
        !reservedUnitIds.has(planUnitId(row.date)) &&
        !(row.topicId && earlyTopicIds.has(row.topicId)) &&
        !carriedUnitIds.has(planUnitId(row.date)),
    )
    .map((row) => ({ ...row }));
  const flowQueue: PlanDay[] = [
    ...planUnits,
    ...gapTopics.map((topic) => ({
      date: '',
      subjectId: topic.subjectId,
      subjectLabel: SUBJECTS.find((subject) => subject.id === topic.subjectId)?.name ?? topic.subjectId,
      core: topic.title,
      topicId: topic.id,
      sessionNo: 1,
      revision: '',
      test: '',
      mode: 'study' as const,
    })),
  ].sort((a, b) => {
    const aRank = a.topicId ? topicRank.get(a.topicId) ?? 9999 : 9999;
    const bRank = b.topicId ? topicRank.get(b.topicId) ?? 9999 : 9999;
    if (aRank !== bRank) return aRank - bRank;
    if ((a.sessionNo ?? 0) !== (b.sessionNo ?? 0)) return (a.sessionNo ?? 0) - (b.sessionNo ?? 0);
    return (a.date || '9999').localeCompare(b.date || '9999');
  });
  const flowStudyDates = Array.from(flowDates)
    .filter((date) => PLAN_BY_DATE.get(date)?.mode === 'study')
    .sort();
  const flowAssignments = new Map<string, PlanDay>();
  flowStudyDates.forEach((date) => {
    const budget = budgetFor(date);
    if (budget !== undefined && budget < 45) return;
    const unit = flowQueue.shift();
    if (unit) flowAssignments.set(date, unit);
  });

  const addFlowTask = (
    date: string,
    role: string,
    block: FlowStudyBlock,
    patch: {
      title: string;
      subtitle?: string;
      description?: string;
      subjectId?: SubjectId;
      topicId?: string;
      sessionNo?: number;
      sessionTotal?: number;
      coversTopic?: boolean;
      recallTopicIds?: string[];
      planUnitId?: string;
    },
  ): Task | undefined => {
    const signature = `flow:${date}:${role}`;
    if (preservedFlowSignatures.has(signature)) return undefined;
    const start = freeStart(date, block.start, block.duration);
    if (!start) return undefined;
    const task = makeTask({
      date,
      start,
      duration: block.duration,
      slot: slotForTime(start),
      kind: block.kind,
      title: patch.title,
      subtitle: patch.subtitle,
      description: patch.description,
      subjectId: patch.subjectId,
      topicId: patch.topicId,
      sessionNo: patch.sessionNo,
      sessionTotal: patch.sessionTotal,
      coversTopic: patch.coversTopic,
      recallTopicIds: patch.recallTopicIds,
      planUnitId: patch.planUnitId,
      xp: xpFor(block.kind, block.duration),
      status: 'todo',
      planSignature: signature,
    });
    addTask(task);
    return task;
  };

  const generateFlowDay = (date: string, plan: PlanDay, assignment?: PlanDay) => {
    const unit = assignment;
    const allowedSubject = (id?: SubjectId) =>
      id && (!subjectAllowed || subjectAllowed.has(id)) ? id : undefined;
    const subjectId = unit?.subjectId ?? allowedSubject(plan.subjectId);
    const subject = subjectId ? SUBJECTS.find((entry) => entry.id === subjectId) : undefined;
    const revisionSubjectId = allowedSubject(plan.revisionSubjectId);
    const revisionSubject = revisionSubjectId
      ? SUBJECTS.find((entry) => entry.id === revisionSubjectId)
      : undefined;
    const revisionLabel = plan.revisionSubjectId && !revisionSubjectId
      ? 'Earlier included topics'
      : plan.revision;
    const topic = unit?.topicId ? TOPIC_MAP.get(unit.topicId) : undefined;
    const subjectShort = subject?.short ?? unit?.subjectLabel ?? plan.subjectLabel;
    const coreTitle = unit?.core ?? plan.core;
    const sessionTotal = topic?.units ?? 1;
    const sessionNo = unit?.sessionNo ? ((unit.sessionNo - 1) % sessionTotal) + 1 : 1;
    const dueRecall = dueRecallFor(date).filter(
      (entry) => !subjectAllowed || (entry.subjectId ? subjectAllowed.has(entry.subjectId) : false),
    );
    const recallTitles = dueRecall.map((entry) => entry.title);
    const recallSubjectId = dueRecall[0]?.subjectId ?? revisionSubjectId;
    const recallSubject = recallSubjectId
      ? SUBJECTS.find((entry) => entry.id === recallSubjectId)
      : revisionSubject;
    const blocks = fitFlowBlocks(studyFlowForDate(date), budgetFor(date));

    if (plan.mode === 'mock') {
      blocks.forEach((block) => {
        if (block.role === 'mock') {
          addFlowTask(date, block.role, block, {
            title: `Full Mock #${plan.mockNo ?? 1} · GATE pattern`,
            subtitle: 'Boss fight · 3 hours',
            description: 'Sit the full simulation at your real GATE shift time. No notes, no pauses, no phone. Then dissect every miss.',
          });
        } else if (block.role === 'analysis') {
          addFlowTask(date, block.role, block, {
            title: 'Mock Autopsy',
            subtitle: 'Convert misses into tomorrow’s repair list',
            description: 'Classify every wrong answer: concept gap, calculation slip, misread, or time trap. Write the repair list for tomorrow.',
          });
        } else if (block.role === 'revision') {
          const created = addFlowTask(date, block.role, block, {
            title: recallTitles.length
              ? `Spaced Recall · ${recallTitles.length} due`
              : 'Formula & Pattern Recall',
            subtitle: recallTitles.length
              ? recallTitles.slice(0, 3).join(' · ')
              : 'Active recall, not re-reading',
            description: recallTitles.length
              ? `Blank-page these topics before the next mock: ${recallTitles.join(', ')}. Check, patch, repeat.`
              : 'Blank-page the formulas, shortcuts and archetypes the mock exposed. Check, patch, repeat.',
            subjectId: recallSubjectId,
            recallTopicIds: recallTitles.length ? dueRecall.map((entry) => entry.topicId) : undefined,
          });
          if (created) {
            dueRecall.forEach((entry) => claimedRecallTopicIds.add(entry.topicId));
          }
        } else {
          addFlowTask(date, block.role, block, {
            title: 'Error Log & Shutdown',
            subtitle: 'Close the loop before dinner',
            description: 'Rewrite the three rules you refuse to miss again. Then close the books and protect your sleep.',
          });
        }
      });
      return;
    }

    if (plan.mode === 'revision') {
      blocks.forEach((block) => {
        const isMorning = block.role === 'pyq';
        const isCore = block.role === 'core';
        const isPractice = block.role === 'practice';
        const created = addFlowTask(date, block.role, block, {
          title: block.role === 'revision' && recallTitles.length
            ? `Spaced Recall · ${recallTitles.length} due`
            : isMorning
              ? 'Formula Recall · Morning Pass'
              : isCore
                ? 'Full Formula Sheet Pass'
                : isPractice
                  ? 'Weak-Area Repair · No New Questions'
                  : block.role === 'revision'
                    ? 'Trap List & Pattern Recall'
                    : 'Light Skim · Close the Books',
          subtitle: block.role === 'revision' && recallTitles.length
            ? recallTitles.slice(0, 3).join(' · ')
            : isMorning
              ? 'Rapid active recall'
              : isCore
                ? 'Rotate every subject’s one-page sheet'
                : isPractice
                  ? 'Rebuild only what still feels brittle'
                  : block.role === 'revision'
                    ? 'Mark anything that is not automatic'
                    : 'No new testing. Protect the engine.',
          description: block.role === 'revision' && recallTitles.length
            ? `Due from spaced repetition: ${recallTitles.join(', ')}. Blank-page, check, patch. No new questions today.`
            : 'No new questions today. Active recall, patch the weak spots, then stop. Tomorrow rewards a rested brain.',
          subjectId: block.role === 'revision' ? recallSubjectId : undefined,
          recallTopicIds: block.role === 'revision' && recallTitles.length
            ? dueRecall.map((entry) => entry.topicId)
            : undefined,
        });
        if (created && block.role === 'revision') {
          dueRecall.forEach((entry) => claimedRecallTopicIds.add(entry.topicId));
        }
      });
      return;
    }

    if (plan.mode === 'rest') {
      blocks.forEach((block) => {
        addFlowTask(date, block.role, block, {
          title: block.label,
          subtitle: 'Eve of exam · protect the engine',
          description: 'Admit card, ID and pens ready. Walk, eat properly, stay off the scoreboard. Sleep is the last study session.',
        });
      });
      return;
    }

    blocks.forEach((block) => {
      if (block.role === 'pyq') {
        addFlowTask(date, block.role, block, {
          title: unit ? `PYQ Recon · ${subjectShort}` : 'PYQ Recon · Mixed set',
          subtitle: coreTitle,
          description: unit
            ? `Scan previous-year questions on ${coreTitle}. Do not solve end-to-end — map the archetypes, traps and recurring patterns before the deep dive.`
            : 'Scan a mixed previous-year set. Hunt archetypes and traps, then write tomorrow’s three highest-value repairs.',
          subjectId,
          topicId: unit?.topicId,
        });
      } else if (block.role === 'core') {
        if (unit) {
          addFlowTask(date, block.role, block, {
            title: coreTitle,
            subtitle: `Core Deep Dive · ${subjectShort}`,
            description: topic
              ? topic.keyPoints.slice(0, 3).join(' · ')
              : `Build the concept from first principles, then prove it with two exam-style questions.`,
            subjectId,
            topicId: unit.topicId,
            sessionNo,
            sessionTotal,
            coversTopic: Boolean(unit.topicId),
            planUnitId: unitPlanId(unit),
          });
        } else {
          addFlowTask(date, block.role, block, {
            title: `Consolidation · ${plan.subjectLabel}`,
            subtitle: 'Queue cleared · mixed recall',
            description: 'Every remaining plan row is already covered. Use this block for mixed PYQs, a timed section, or spaced recall from your error log.',
            subjectId: plan.subjectId,
          });
        }
      } else if (block.role === 'practice') {
        addFlowTask(date, block.role, block, {
          title: unit ? `Practice · ${subjectShort}` : 'Practice Sprint · Mixed set',
          subtitle: coreTitle,
          description: unit
            ? `Solve previous-year and exam-style problems on ${coreTitle}. Log every miss and tag the weak sub-topic.`
            : 'Run a mixed problem set across your weakest subjects. Log every miss and promote the top three into tomorrow’s repair list.',
          subjectId,
          topicId: unit?.topicId,
        });
      } else if (block.role === 'revision') {
        const created = addFlowTask(date, block.role, block, {
          title: recallTitles.length
            ? `Spaced Recall · ${recallTitles.length} due`
            : `Revision · ${recallSubject?.short ?? 'Earlier topics'}`,
          subtitle: recallTitles.length
            ? recallTitles.slice(0, 3).join(' · ')
            : revisionLabel,
          description: recallTitles.length
            ? `Due from spaced repetition: ${recallTitles.join(', ')}. Blank-page each one, check the gaps, then patch the rule you missed.`
            : `Active recall, not re-reading. Blank-page the formulas, traps and patterns from ${revisionLabel}.`,
          subjectId: recallSubjectId,
          recallTopicIds: recallTitles.length ? dueRecall.map((entry) => entry.topicId) : undefined,
        });
        if (created) {
          dueRecall.forEach((entry) => claimedRecallTopicIds.add(entry.topicId));
        }
      } else if (block.role === 'test') {
        addFlowTask(date, block.role, block, {
          title: plan.test,
          subtitle: unit ? `Validation · ${subjectShort}` : 'Validation · Mixed set',
          description: unit
            ? `Closed-book validation on ${coreTitle}. Log every miss and promote it to tomorrow’s repair list.`
            : 'Closed-book mixed validation. Log every miss and promote it to tomorrow’s repair list.',
          subjectId,
          topicId: unit?.topicId,
        });
      }
    });
  };

  flowDates.forEach((date) => {
    const plan = PLAN_BY_DATE.get(date);
    if (plan) {
      generateFlowDay(
        date,
        plan,
        plan.mode === 'study' ? flowAssignments.get(date) : undefined,
      );
    }
  });

  const studyDates = allDates.filter((date) => {
    if (flowDates.has(date)) return false;
    if (date >= phases.phaseStart) return false;
    if (restSet.has(date)) return false;
    return true;
  });

  // Fill every available deep-work slot with the next unresolved syllabus unit.
  // When the syllabus is exhausted, the slot becomes an adaptive practice sprint.
  studyDates.forEach((date) => {
    if (restSet.has(date)) return;
    const busy = busyIntervals(date);
    const slots = fitCoreSlots(coreSlots(date, settings), budgetFor(date)).filter(
      (slot) => !collides(minutesFromTime(slot.start), slot.duration, busy),
    );
    const dayFocus: SubjectId[] = (existingByDate.get(date) ?? [])
      .filter((task) => task.kind === 'study' && task.subjectId)
      .map((task) => task.subjectId as SubjectId);
    let practiceIndex = 0;
    slots.forEach((slot) => {
      const next = queue.shift();
      if (next) {
        const topic = TOPIC_MAP.get(next.topicId);
        if (!topic) return;
        const subject = SUBJECTS.find((entry) => entry.id === topic.subjectId)!;
        const task = makeTask({
          date,
          start: slot.start,
          duration: slot.duration,
          slot: slotForTime(slot.start),
          kind: 'study',
          title: topic.title,
          subtitle: `Session ${next.sessionNo} of ${topic.units} · ${subject.short}`,
          description: topic.keyPoints.slice(0, 3).join(' · '),
          subjectId: subject.id,
          topicId: topic.id,
          sessionNo: next.sessionNo,
          sessionTotal: topic.units,
          xp: xpFor('study', slot.duration),
          status: 'todo',
          planSignature: `study:${topic.id}:${next.sessionNo}`,
        });
        addTask(task);
        dayFocus.push(subject.id);
      } else {
        const subjectId = practiceSubject(date, practiceIndex, subjectOrder);
        const subject = SUBJECTS.find((entry) => entry.id === subjectId)!;
        const task = makeTask({
          date,
          start: slot.start,
          duration: slot.duration,
          slot: slotForTime(slot.start),
          kind: 'practice',
          title: `Practice Sprint · ${subject.short}`,
          subtitle: 'Adaptive extension',
          description: 'Mixed PYQ set and error log. Go deeper on a weak area or manufacture more exam-style reps.',
          subjectId,
          xp: xpFor('practice', slot.duration),
          status: 'todo',
          planSignature: `practice:${date}:${slot.start}`,
        });
        addTask(task);
        dayFocus.push(subjectId);
        practiceIndex += 1;
      }
    });

    const dayTasks = existingByDate.get(date) ?? [];
    const coreStudy = dayTasks.filter((task) =>
      task.status !== 'skipped' && (task.kind === 'study' || task.kind === 'practice'),
    );
    if (coreStudy.length === 0) return;

    const focus = Array.from(new Set(coreStudy.map((task) => task.subjectId).filter(Boolean))) as SubjectId[];
    const week = startOfWeek(date);
    const weekSet = weekSubjects.get(week) ?? new Set<SubjectId>();
    focus.forEach((id) => weekSet.add(id));
    weekSubjects.set(week, weekSet);
    const heavy = heavySet.has(weekdayIndex(date));
    const primary = focus[0] ?? practiceSubject(date, 0, subjectOrder);
    const primarySubject = SUBJECTS.find((subject) => subject.id === primary)!;

    const pyqBlock = templateFor(date, settings).find((block) => block.role === 'pyq');
    const pyqStart = pyqBlock ? freeStart(date, pyqBlock.start, pyqBlock.duration) : null;
    if (pyqBlock && pyqStart && !hasPreserved(date, (task) => task.kind === 'pyq')) {
      addTask(makeTask({
        date,
        start: pyqStart,
        duration: pyqBlock.duration,
        slot: slotForTime(pyqStart),
        kind: 'pyq',
        title: `${heavy ? 'Deep-Dive PYQ' : 'PYQ Recon'} · ${primarySubject.short}`,
        subtitle: heavy ? 'Reverse-engineer the hardest set' : 'Hunt archetypes before theory',
        description: heavy
          ? `Pick the hardest PYQs from this week and reverse-engineer the solution. Focus: ${subjectListLabel(focus)}.`
          : `Scan a past paper for ${primarySubject.name}. Do not solve end-to-end — identify the archetypes, traps and recurring patterns.`,
        subjectId: primary,
        xp: xpFor('pyq', pyqBlock.duration),
        status: 'todo',
        planSignature: `pyq:${date}`,
      }));
    }

    if (heavy) {
      const testBlock = templateFor(date, settings).find((block) => block.role === 'weekly');
      const testStart = testBlock ? freeStart(date, testBlock.start, testBlock.duration) : null;
      if (testBlock && testStart && !hasPreserved(date, (task) => task.kind === 'test')) {
        const weekLabel = `${formatDate(week, 'short')} – ${formatDate(endOfWeek(date), 'short')}`;
        addTask(makeTask({
          date,
          start: testStart,
          duration: testBlock.duration,
          slot: slotForTime(testStart),
          kind: 'test',
          title: 'Weekly Cumulative Test',
          subtitle: weekLabel,
          description: `Closed-book cumulative test covering this week's work: ${subjectListLabel(Array.from(weekSet))}. Log every miss and promote it to tomorrow's repair list.`,
          subjectId: primary,
          xp: xpFor('test', testBlock.duration),
          status: 'todo',
          planSignature: `weekly:${date}`,
        }));
      }
    } else {
      const testBlock = templateFor(date, settings).find((block) => block.role === 'test');
      const testStart = testBlock ? freeStart(date, testBlock.start, testBlock.duration) : null;
      if (testBlock && testStart && !hasPreserved(date, (task) => task.kind === 'test')) {
        addTask(makeTask({
          date,
          start: testStart,
          duration: testBlock.duration,
          slot: slotForTime(testStart),
          kind: 'test',
          title: `Validation Test · ${primarySubject.short}`,
          subtitle: subjectListLabel(focus),
          description: `Focused quiz on exactly what you learned today. Close the loop, log every mistake, and tag the weak sub-topic.`,
          subjectId: primary,
          xp: xpFor('test', testBlock.duration),
          status: 'todo',
          planSignature: `validation:${date}`,
        }));
      }
    }
  });

  // Mock phase: five full simulations at the real shift time, with repair days
  // between them and two quiet days before the exam.
  phases.testingDates.forEach((date) => {
    if (date < start || restSet.has(date)) return;
    if (flowDates.has(date)) return;
    if (date > phases.phaseEnd) return;
    const isMock = phases.mockDates.includes(date);
    if (isMock) {
      const number = phases.mockDates.indexOf(date) + 1;
      const mockStart = '09:30';
      const analysisStart = '14:30';
      addTask(makeTask({
        date,
        start: mockStart,
        duration: 180,
        slot: slotForTime(mockStart),
        kind: 'mock',
        title: `Full Mock #${number} · GATE pattern`,
        subtitle: 'Boss fight · 3 hours',
        description: 'Sit the full simulation at your real GATE shift time. No notes, no pauses, no phone. Then enter your score and dissect every miss.',
        xp: xpFor('mock', 180),
        status: 'todo',
        mockNo: number,
        planSignature: `mock:${number}`,
      }));
      addTask(makeTask({
        date,
        start: analysisStart,
        duration: 75,
        slot: slotForTime(analysisStart),
        kind: 'analysis',
        title: 'Mock Autopsy',
        subtitle: 'Convert misses into tomorrow’s plan',
        description: 'Classify every wrong answer: concept gap, calculation slip, misread, or time trap. Write the repair list for tomorrow.',
        xp: xpFor('analysis', 75),
        status: 'todo',
        planSignature: `autopsy:${date}`,
      }));
    } else if (phases.analysisDates.includes(date)) {
      const mocksBefore = phases.mockDates.filter((mockDate) => mockDate < date).length;
      addTask(makeTask({
        date,
        start: '09:30',
        duration: 120,
        slot: 'morning',
        kind: 'analysis',
        title: 'Error Log & Weak Topic Repair',
        subtitle: `After Mock #${Math.max(1, mocksBefore)}`,
        description: 'Rebuild the two weakest concepts the mock exposed. Redo the exact questions without looking, then write a one-line rule for each trap.',
        xp: xpFor('analysis', 120),
        status: 'todo',
        planSignature: `repair:${date}`,
      }));
      addTask(makeTask({
        date,
        start: '15:00',
        duration: 90,
        slot: 'afternoon',
        kind: 'revision',
        title: 'Formula & Pattern Recall',
        subtitle: 'Active recall, not re-reading',
        description: 'Blank-page recall: write the formulas, shortcuts and archetypes for the weakest subjects. Check, patch, repeat.',
        xp: xpFor('revision', 90),
        status: 'todo',
        planSignature: `formula:${date}`,
      }));
      addTask(makeTask({
        date,
        start: '19:30',
        duration: 30,
        slot: 'evening',
        kind: 'revision',
        title: 'Night Review',
        subtitle: 'Close the loop',
        description: 'Cross out repaired items. Pick the next mock’s focus. Close the books by 21:30.',
        xp: 20,
        status: 'todo',
        planSignature: `night:${date}`,
      }));
    }
  });

  phases.revisionDates.forEach((date, index) => {
    if (date < start || restSet.has(date) || date >= exam) return;
    if (flowDates.has(date)) return;
    const lastDay = index === phases.revisionDates.length - 1;
    addTask(makeTask({
      date,
      start: '10:00',
      duration: lastDay ? 60 : 120,
      slot: 'morning',
      kind: 'revision',
      title: lastDay ? 'Light Formula Skim' : 'Full Formula Sheet Pass',
      subtitle: lastDay ? 'No new testing. Protect the engine.' : 'Rapid active recall',
      description: lastDay
        ? 'Skim only the sheets you already know. No new questions after lunch. Set out your admit card, ID and pens, then switch off.'
        : 'Rotate through every subject’s one-page formula and trap sheet. Mark anything that does not feel automatic.',
      xp: lastDay ? 20 : 40,
      status: 'todo',
      planSignature: `revision:${date}`,
    }));
    if (lastDay) {
      addTask(makeTask({
        date,
        start: '20:00',
        duration: 15,
        slot: 'night',
        kind: 'revision',
        title: 'Shut Down Early',
        subtitle: 'Sleep is a performance tool',
        description: 'Screens off. Clothes laid out. Alarm set. You have done the work — now let the brain consolidate it.',
        xp: 10,
        status: 'todo',
        planSignature: `shutdown:${date}`,
      }));
    }
  });

  restSet.forEach((date) => {
    if (date < start || date >= exam) return;
    if (hasPreserved(date, (task) => task.kind === 'rest')) return;
    addTask(makeTask({
      date,
      start: '10:00',
      duration: 60,
      slot: 'morning',
      kind: 'rest',
      title: 'Rest & Recharge',
      subtitle: 'Planned recovery',
      description: 'No study. Walk, eat properly, sleep early. Recovery is part of the plan, not a failure of it.',
      xp: 0,
      status: 'todo',
      planSignature: `rest:${date}`,
    }));
  });

  if (exam >= start && !hasPreserved(exam, (task) => task.kind === 'exam')) {
    addTask(makeTask({
      date: exam,
      start: '09:30',
      duration: 180,
      slot: 'morning',
      kind: 'exam',
      title: `${gate.title} · Final Boss`,
      subtitle: 'Everything compounds to this moment',
      description: 'Admit card, original ID, pens, transparent water bottle. Reach the centre early. Read every question twice. Breathe. You are ready.',
      xp: 500,
      status: 'todo',
      planSignature: 'exam',
    }));
  }

  const merged = [...preserved, ...generated]
    .map((task) => (task.targetId ? task : { ...task, targetId: gate.id }))
    .sort(compareTasks);
  const coverage = coverageStats(merged);
  const deferred = coverage.deferredTopicCount;
  return { tasks: merged, deferred, coverage: coverage.pct };
}

function compareTasks(a: Task, b: Task): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return minutesFromTime(a.start) - minutesFromTime(b.start);
}

/**
 * Multi-target entry point. The specialised GATE flow runs first (when the
 * account owns the preset), then the universal generator fills remaining core
 * slots for every custom target. Tasks that belong to other targets are never
 * deleted by the GATE rebuild; only their pending generated rows are replaced.
 */
export function generateTasks(
  state: AppState,
  fromDate: string,
): GenerationResult {
  const gateResult = generateGateTasks(state, fromDate);
  const custom = generateTargetTasks(state, gateResult.tasks, fromDate);
  if (!custom.length) return gateResult;
  const merged = [...gateResult.tasks, ...custom].sort(compareTasks);
  const coverage = coverageStats(merged);
  return {
    tasks: merged,
    deferred: coverage.deferredTopicCount,
    coverage: coverage.pct,
  };
}

export interface CreateStateOptions {
  preset?: 'gate' | 'blank';
  targetTitle?: string;
  targetDate?: string;
  targetKind?: TargetKind;
  subjectOrder?: SubjectId[];
  prepLevel?: PrepLevel;
  dayMinutes?: number[];
}

const PREP_CONFIDENCE: Record<PrepLevel, number> = {
  'first-time': 2,
  'some-prep': 3,
  'exam-ready': 4,
};

const PREP_PLAN: Record<PrepLevel, Pick<PlannerSettings, 'mockCount' | 'mockPhaseDays' | 'revisionDays'>> = {
  'first-time': { mockCount: 5, mockPhaseDays: 14, revisionDays: 2 },
  'some-prep': { mockCount: 6, mockPhaseDays: 18, revisionDays: 2 },
  'exam-ready': { mockCount: 7, mockPhaseDays: 21, revisionDays: 3 },
};

function normalizeDayMinutes(input?: number[]): number[] | undefined {
  if (!input || input.length !== 7) return undefined;
  return input.map((value) => clamp(Math.round(Number.isFinite(value) ? value : 0), 0, 16 * 60));
}

export function createEmptyState(
  name: string,
  examDate: string,
  onboarded = false,
  options: CreateStateOptions = {},
): AppState {
  const today = todayISO();
  const date = examDate || defaultSettings(today).examDate;
  const preset = options.preset ?? 'gate';
  const title = options.targetTitle?.trim()
    || (preset === 'gate' ? 'GATE CSE 2027' : 'My target');
  const subjectOrder = options.subjectOrder?.length ? [...options.subjectOrder] : undefined;
  const dayMinutes = normalizeDayMinutes(options.dayMinutes);
  const prepLevel = options.prepLevel ?? 'first-time';
  const target: StudyTarget = preset === 'gate'
    ? gateTarget(options.targetDate || date, title)
    : createTarget({
      title,
      kind: options.targetKind ?? 'custom',
      date: options.targetDate,
      dailyMinutes: 120,
    });
  if (preset === 'gate') {
    if (options.targetDate) target.date = options.targetDate;
    if (subjectOrder) target.subjectOrder = subjectOrder;
    target.prepLevel = prepLevel;
    if (dayMinutes) {
      target.dayMinutes = dayMinutes;
      target.dailyMinutes = Math.round(dayMinutes.reduce((sum, value) => sum + value, 0) / 7);
    }
  }
  const seeds = preset === 'gate'
    ? seedGateCurriculum(target.id, subjectOrder)
    : { subjects: [] as AppState['subjects'], topics: [] as AppState['topics'] };
  const settings = {
    ...defaultSettings(date),
    ...(preset === 'gate' ? PREP_PLAN[prepLevel] : {}),
  };
  return {
    version: 2,
    profile: {
      name: name.trim() || 'Aspirant',
      createdAt: new Date().toISOString(),
      onboarded,
    },
    settings: {
      ...settings,
      examDate: target.date ?? date,
      examLabel: target.title,
      primaryTargetId: target.id,
      horizonDays: 30,
    },
    targets: [target],
    subjects: seeds.subjects,
    topics: seeds.topics,
    topicProgress: seeds.topics.map((topic) => ({
      topicId: topic.id,
      confidence: preset === 'gate' ? PREP_CONFIDENCE[prepLevel] : 3,
    })),
    tasks: [],
    restDays: [],
    boostedSubjects: [],
    generatedFor: null,
    seenAchievements: [],
  };
}

export function createInitialState(
  name = 'Aspirant',
  examDate?: string,
  onboarded = false,
  options: CreateStateOptions = {},
): AppState {
  const date = examDate ?? defaultSettings(todayISO()).examDate;
  const empty = createEmptyState(name, date, onboarded, options);
  const result = generateTasks(empty, todayISO());
  return {
    ...empty,
    tasks: result.tasks,
    generatedFor: todayISO(),
    seenAchievements: [],
  };
}

export function regenerateFrom(state: AppState, fromDate: string): Task[] {
  return generateTasks(state, fromDate).tasks;
}

export function firstStudyDayEnd(settings: PlannerSettings): string {
  return computePhases(settings).studyEnd;
}

export function plannerSummary(tasks: Task[], settings: PlannerSettings) {
  const coverage = coverageStats(tasks);
  const studyTasks = tasks.filter((task) => task.kind === 'study');
  const studyMinutes = sumMinutes(studyTasks);
  const phases = computePhases(settings);
  return {
    coverage,
    studyMinutes,
    studyHours: hoursLabel(studyMinutes),
    deferred: coverage.deferredTopicCount,
    mockCount: phases.mockDates.length,
    studyDays: new Set(studyTasks.map((task) => task.date)).size,
    unitsCovered: coverage.coveredUnits,
    totalUnits: TOTAL_TOPIC_UNITS,
  };
}

export function describeDayType(
  date: string,
  settings: PlannerSettings,
  options: { gate?: boolean; targetDates?: string[] } = {},
): 'study' | 'rest' | 'mock' | 'revision' | 'exam' {
  if (options.gate === false) {
    if (options.targetDates?.includes(date)) return 'exam';
    return 'study';
  }
  if (date === settings.examDate) return 'exam';
  if (settings.dailyFlow) {
    const plan = planForDate(date);
    if (plan) {
      if (plan.mode === 'rest') return 'rest';
      if (plan.mode === 'mock') return 'mock';
      if (plan.mode === 'revision') return 'revision';
      return 'study';
    }
  }
  const phases = computePhases(settings);
  if (phases.mockDates.includes(date)) return 'mock';
  if (date >= phases.phaseStart && date < settings.examDate) return 'revision';
  return 'study';
}

export function tasksForDate(tasks: Task[], date: string): Task[] {
  return tasks.filter((task) => task.date === date);
}

export function todayProgress(tasks: Task[]): { done: number; total: number; pct: number } {
  const date = todayISO();
  const todayTasks = coreDayTasks(tasksForDate(tasks, date));
  const done = todayTasks.filter((task) => task.status === 'done').length;
  return { done, total: todayTasks.length, pct: todayTasks.length ? Math.round((done / todayTasks.length) * 100) : 0 };
}

export function coreDayTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.status !== 'skipped' && task.status !== 'missed');
}

export function focusSubjectForDate(tasks: Task[], date: string): SubjectId | undefined {
  const study = tasksForDate(tasks, date).find((task) => task.kind === 'study' && task.subjectId);
  return study?.subjectId;
}

export function makeExamLabelCountdown(examDate: string, today: string): string {
  const days = diffDays(today, examDate);
  if (days <= 0) return 'Showtime';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}


