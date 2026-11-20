import type {
  AppState,
  StudyTarget,
  Subject,
  Task,
  Topic,
} from '../types';
import {
  addDays,
  diffDays,
  hashString,
  minutesFromTime,
  rangeInclusive,
  slotForTime,
  todayISO,
  weekdayIndex,
} from './utils';
import { activeTargets, TARGET_KIND_LABEL } from './targets';

interface Slot {
  start: string;
  duration: number;
}

interface Unit {
  topic: Topic;
  subject: Subject | undefined;
  sessionNo: number;
}

// The GATE preset owns the whole 7-hour rhythm, so its weekday template only
// exposes two core slots. Custom targets still need a weekday foothold: the
// 13:00 buffer is free in that rhythm, and the 20:30 validation window is free
// whenever GATE is not running (or has yielded it). Both are ordinary 45-minute
// core slots for accounts without the preset.
const OVERFLOW_SLOTS: Slot[] = [
  { start: '13:00', duration: 45 },
  { start: '20:30', duration: 45 },
];

function coreSlots(date: string, state: AppState): Slot[] {
  const heavy = state.settings.heavyDays.includes(weekdayIndex(date));
  const template = heavy ? state.settings.weekend : state.settings.weekday;
  const slots = template
    .filter((block) => block.role === 'core')
    .sort((a, b) => minutesFromTime(a.start) - minutesFromTime(b.start))
    .map((block) => ({ start: block.start, duration: block.duration }));
  const seeds = slots.length ? slots : [{ start: '09:30', duration: 45 }, { start: '16:00', duration: 45 }];
  const merged = [...seeds];
  OVERFLOW_SLOTS.forEach((slot) => {
    if (!merged.some((entry) => entry.start === slot.start)) merged.push(slot);
  });
  return merged.sort((a, b) => minutesFromTime(a.start) - minutesFromTime(b.start));
}

function overlaps(start: string, duration: number, tasks: Task[], date: string): boolean {
  const from = minutesFromTime(start);
  const to = from + duration;
  return tasks.some((task) => {
    if (task.date !== date || task.earlyCompleted) return false;
    const taskFrom = minutesFromTime(task.start);
    const taskTo = taskFrom + task.duration;
    return from < taskTo && to > taskFrom;
  });
}

function usedUnits(
  tasks: Task[],
  target: StudyTarget,
  rebuildStart: string,
): Map<string, Set<number>> {
  const used = new Map<string, Set<number>>();
  tasks.forEach((task) => {
    if (task.kind !== 'study' || !task.topicId) return;
    if (task.targetId !== target.id) return;
    if (task.status === 'skipped' || task.status === 'missed') return;
    // Pending generated rows on or after the rebuild date are about to be
    // replaced, so their units return to the queue. Rows before the rebuild
    // date survive the re-flow and must keep claiming their sessions.
    if (task.status === 'todo' && !task.manual && task.date >= rebuildStart) return;
    const set = used.get(task.topicId) ?? new Set<number>();
    const total = task.sessionTotal ?? 1;
    if (task.coversTopic) {
      for (let index = 1; index <= total; index += 1) set.add(index);
    } else {
      set.add(task.sessionNo ?? 1);
    }
    used.set(task.topicId, set);
  });
  return used;
}

function targetQueue(
  state: AppState,
  target: StudyTarget,
  tasks: Task[],
  rebuildStart: string,
): Map<string, Unit[]> {
  const topics = state.topics.filter((topic) => topic.targetId === target.id);
  const subjects = new Map(state.subjects.map((subject) => [subject.id, subject]));
  const used = usedUnits(tasks, target, rebuildStart);
  const queues = new Map<string, Unit[]>();
  topics.forEach((topic) => {
    const completed = used.get(topic.id) ?? new Set<number>();
    const units: Unit[] = [];
    for (let number = 1; number <= topic.units; number += 1) {
      if (!completed.has(number)) {
        units.push({ topic, subject: subjects.get(topic.subjectId), sessionNo: number });
      }
    }
    queues.set(topic.id, units);
  });
  return queues;
}

function nextUnit(queues: Map<string, Unit[]>, guard: Set<string>): Unit | undefined {
  for (const topicId of queues.keys()) {
    if (guard.has(topicId)) continue;
    const list = queues.get(topicId);
    if (list && list.length) return list.shift();
  }
  return undefined;
}

function taskFor(
  target: StudyTarget,
  unit: Unit,
  date: string,
  slot: Slot,
): Task {
  const duration = Math.max(15, slot.duration);
  const start = slot.start;
  return {
    id: `ut_${hashString(`${target.id}|${date}|${start}|${unit.topic.id}|${unit.sessionNo}`)}`,
    date,
    start,
    duration,
    slot: slotForTime(start),
    kind: 'study',
    title: unit.topic.title,
    subtitle: `${target.title} · Core block`,
    description: unit.topic.keyPoints.slice(0, 3).join(' · ') || undefined,
    targetId: target.id,
    subjectId: unit.topic.subjectId,
    topicId: unit.topic.id,
    sessionNo: unit.sessionNo,
    sessionTotal: unit.topic.units,
    xp: Math.max(20, Math.round(duration)),
    status: 'todo',
    planSignature: `target:${target.id}:${unit.topic.id}:${unit.sessionNo}`,
    planUnitId: `target:${target.id}:unit:${unit.topic.id}:${unit.sessionNo}`,
  };
}

function targetExamTask(target: StudyTarget, date: string, start: string): Task {
  return {
    id: `ut_exam_${hashString(`${target.id}|${date}`)}`,
    date,
    start,
    duration: 180,
    slot: slotForTime(start),
    kind: 'exam',
    title: target.kind === 'exam' ? `${target.title} · Final Boss` : `${target.title} · Target day`,
    subtitle: TARGET_KIND_LABEL[target.kind],
    description: 'The date you set is here. Everything before it was compounding for this moment. Arrive rested and ready.',
    targetId: target.id,
    xp: 500,
    status: 'todo',
    planSignature: `target:${target.id}:exam`,
  };
}

/**
 * Universal planner: distributes the units of every custom target across the
 * free core slots of the existing day templates. GATE keeps its own specialised
 * flow generator; everything else lands here.
 */
export function generateTargetTasks(
  state: AppState,
  existing: Task[],
  fromDate: string,
): Task[] {
  const today = todayISO();
  const start = fromDate < today ? today : fromDate;
  const horizon = Math.max(7, state.settings.horizonDays || 30);
  const targets = activeTargets(state).filter((target) => target.preset !== 'gate-cse');
  if (!targets.length) return [];

  const endFor = (target: StudyTarget) =>
    target.date ?? addDays(today, horizon);
  const end = targets.reduce(
    (latest, target) => (endFor(target) > latest ? endFor(target) : latest),
    addDays(today, horizon),
  );

  const generated: Task[] = [];
  const all = [...existing];
  const queues = new Map<string, Map<string, Unit[]>>();
  targets.forEach((target) => queues.set(target.id, targetQueue(state, target, all, start)));

  const order = [...targets].sort((a, b) => {
    const aDate = a.date ?? '9999-12-31';
    const bDate = b.date ?? '9999-12-31';
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.createdAt.localeCompare(b.createdAt);
  });

  const push = (task: Task) => {
    generated.push(task);
    all.push(task);
  };

  const dates = rangeInclusive(start, end);
  dates.forEach((date) => {
    if (state.restDays.includes(date)) return;
    const daily = new Map<string, number>();
    const slots = coreSlots(date, state);
    const usedSlots = new Set<number>();
    const available = order.filter((target) => {
      if (target.date && target.date < date) return false;
      if (date > endFor(target)) return false;
      return true;
    });
    if (!available.length) return;

    const assign = (target: StudyTarget, slotIndex: number): boolean => {
      if (usedSlots.has(slotIndex)) return false;
      const slot = slots[slotIndex];
      if (!slot) return false;
      if (overlaps(slot.start, slot.duration, all, date)) return false;
      const queue = queues.get(target.id);
      if (!queue) return false;
      const unit = nextUnit(queue, new Set());
      if (!unit) return false;
      usedSlots.add(slotIndex);
      daily.set(target.id, (daily.get(target.id) ?? 0) + slot.duration);
      push(taskFor(target, unit, date, slot));
      return true;
    };

    // Pass 1: every active target gets one block if a slot is free.
    available.forEach((target) => {
      for (let index = 0; index < slots.length; index += 1) {
        if (usedSlots.has(index)) continue;
        if (assign(target, index)) break;
      }
    });

    // Pass 2: fill remaining free slots, nearest target first, under the
    // target's daily capacity.
    available.forEach((target) => {
      const cap = Math.max(30, target.dailyMinutes ?? 120);
      for (let index = 0; index < slots.length; index += 1) {
        if ((daily.get(target.id) ?? 0) >= cap) break;
        assign(target, index);
      }
    });
  });

  // The target date itself is an anchor, even when no curriculum remains.
  targets.forEach((target) => {
    if (!target.date || target.date < start || diffDays(start, target.date) < 0) return;
    if (target.date > end) return;
    const exists = all.some(
      (task) => task.date === target.date && task.kind === 'exam' &&
        (task.targetId === target.id || task.title.startsWith(target.title)),
    );
    if (exists) return;
    const startTime = overlaps('09:30', 180, all, target.date) ? '14:30' : '09:30';
    push(targetExamTask(target, target.date, startTime));
  });

  return generated;
}
