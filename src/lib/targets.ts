import type { AppState, PrepLevel, StudyTarget, Subject, TargetKind, Topic } from '../types';
import { SUBJECTS, TOPICS } from '../data/curriculum';
import { addDays, diffDays, todayISO } from './utils';

export const GATE_TARGET_ID = 'gate-cse';

export const PREP_LEVEL_LABEL: Record<PrepLevel, string> = {
  'first-time': 'First time',
  'some-prep': 'Some prep',
  'exam-ready': 'Exam ready',
};

export const DEFAULT_GATE_DAY_MINUTES = [420, 420, 420, 420, 420, 420, 420];

export const TARGET_COLORS = [
  '#D8FF6A',
  '#97A7FF',
  '#63E6CE',
  '#FFC46B',
  '#FF8B9B',
  '#C69BFF',
  '#7ED4FF',
  '#FFD166',
];

export const TARGET_KIND_LABEL: Record<TargetKind, string> = {
  exam: 'Exam',
  course: 'Course',
  skill: 'Skill',
  habit: 'Habit',
  custom: 'Target',
};

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function gateTarget(examDate: string, title = 'GATE CSE 2027'): StudyTarget {
  return {
    id: GATE_TARGET_ID,
    title,
    kind: 'exam',
    date: examDate,
    color: TARGET_COLORS[0],
    createdAt: new Date().toISOString(),
    preset: 'gate-cse',
    dailyMinutes: 420,
    subjectOrder: SUBJECTS.map((subject) => subject.id),
    prepLevel: 'first-time',
    dayMinutes: [...DEFAULT_GATE_DAY_MINUTES],
  };
}

export function createTarget(input: {
  title: string;
  kind?: TargetKind;
  date?: string;
  color?: string;
  dailyMinutes?: number;
}): StudyTarget {
  return {
    id: createId('target'),
    title: input.title.trim() || 'My target',
    kind: input.kind ?? 'exam',
    date: input.date || undefined,
    color: input.color ?? TARGET_COLORS[1],
    createdAt: new Date().toISOString(),
    dailyMinutes: input.dailyMinutes ?? 120,
  };
}

export function seedGateCurriculum(
  targetId = GATE_TARGET_ID,
  subjectIds?: string[],
): { subjects: Subject[]; topics: Topic[] } {
  const allowed = subjectIds?.length ? new Set(subjectIds) : null;
  return {
    subjects: SUBJECTS
      .filter((subject) => !allowed || allowed.has(subject.id))
      .map((subject) => ({ ...subject, targetId })),
    topics: TOPICS
      .filter((topic) => !allowed || allowed.has(topic.subjectId))
      .map((topic) => ({ ...topic, targetId })),
  };
}

/** Average available minutes per day, falling back to the legacy dailyMinutes. */
export function targetDailyMinutes(target: StudyTarget): number {
  const days = target.dayMinutes?.filter((value) => Number.isFinite(value));
  if (days?.length) {
    return Math.round(days.reduce((sum, value) => sum + value, 0) / days.length);
  }
  return target.dailyMinutes ?? 120;
}

export function activeTargets(state: Pick<AppState, 'targets'>): StudyTarget[] {
  return state.targets.filter((target) => !target.archivedAt);
}

export function hasGateTarget(state: Pick<AppState, 'targets'>): boolean {
  return state.targets.some((target) => target.preset === 'gate-cse' && !target.archivedAt);
}

export function targetById(state: Pick<AppState, 'targets'>, id?: string): StudyTarget | undefined {
  if (!id) return undefined;
  return state.targets.find((target) => target.id === id);
}

/** Explicitly focused target, else nearest dated active target, else first active. */
export function primaryTarget(
  state: Pick<AppState, 'targets' | 'settings'>,
): StudyTarget | undefined {
  const active = activeTargets(state);
  const focused = active.find((target) => target.id === state.settings.primaryTargetId);
  if (focused) return focused;
  const dated = active
    .filter((target) => Boolean(target.date))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  return dated[0] ?? active[0];
}

/** Last date the planner should keep populated. */
export function planningEnd(
  state: Pick<AppState, 'targets' | 'settings'>,
  today = todayISO(),
): string {
  const horizon = Math.max(7, state.settings.horizonDays || 30);
  const rolling = addDays(today, horizon);
  const furthest = activeTargets(state)
    .map((target) => target.date)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  return furthest && furthest > rolling ? furthest : rolling;
}

export function targetHorizon(
  target: StudyTarget,
  fallbackHorizonDays: number,
  today = todayISO(),
): string {
  return target.date ?? addDays(today, Math.max(7, fallbackHorizonDays || 30));
}

export function subjectMap(subjects: Subject[]): Map<string, Subject> {
  return new Map(subjects.map((subject) => [subject.id, subject]));
}

export function topicMap(topics: Topic[]): Map<string, Topic> {
  return new Map(topics.map((topic) => [topic.id, topic]));
}

export function subjectsForTarget(state: Pick<AppState, 'subjects'>, targetId?: string): Subject[] {
  return targetId
    ? state.subjects.filter((subject) => subject.targetId === targetId)
    : state.subjects;
}

export function topicsForTarget(state: Pick<AppState, 'topics'>, targetId?: string): Topic[] {
  return targetId
    ? state.topics.filter((topic) => topic.targetId === targetId)
    : state.topics;
}

export function targetDaysLeft(target: StudyTarget, today = todayISO()): number | null {
  if (!target.date) return null;
  return Math.max(0, diffDays(today, target.date));
}
