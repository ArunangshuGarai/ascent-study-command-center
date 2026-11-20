import type { AppState, StudyTarget, Subject, TargetKind, Task, Topic } from '../types';
import { defaultSettings } from '../data/curriculum';
import { FLOW_VERSION } from '../data/dailyFlow';
import { todayISO } from './utils';
import { createEmptyState, generateTasks } from './schedule';
import { setCurriculumRegistry } from './curriculumRegistry';
import {
  GATE_TARGET_ID,
  TARGET_COLORS,
  seedGateCurriculum,
} from './targets';

const TARGET_KINDS: TargetKind[] = ['exam', 'course', 'skill', 'habit', 'custom'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asDate(value: unknown): string | undefined {
  return typeof value === 'string' && ISO_DATE.test(value) ? value : undefined;
}

function sanitizeTarget(raw: StudyTarget, index: number): StudyTarget {
  const id = typeof raw.id === 'string' && raw.id ? raw.id : `target_${index}`;
  const date = asDate(raw.date);
  return {
    id,
    title: String(raw.title ?? 'Untitled target').slice(0, 64),
    kind: TARGET_KINDS.includes(raw.kind) ? raw.kind : 'custom',
    ...(date ? { date } : {}),
    color: typeof raw.color === 'string' && raw.color ? raw.color : TARGET_COLORS[index % TARGET_COLORS.length],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    ...(typeof raw.archivedAt === 'string' ? { archivedAt: raw.archivedAt } : {}),
    ...(raw.preset === 'gate-cse' ? { preset: 'gate-cse' as const } : {}),
    ...(typeof raw.dailyMinutes === 'number' ? { dailyMinutes: Math.max(30, Math.min(720, raw.dailyMinutes)) } : {}),
    ...(raw.notes ? { notes: String(raw.notes).slice(0, 500) } : {}),
  };
}

function sanitizeSubjects(raw: Subject[], targetIds: Set<string>, fallbackTargetId?: string): Subject[] {
  const seen = new Set<string>();
  const subjects: Subject[] = [];
  raw.forEach((subject) => {
    if (!subject || typeof subject.id !== 'string' || !subject.id) return;
    if (seen.has(subject.id)) return;
    seen.add(subject.id);
    const targetId = subject.targetId && targetIds.has(subject.targetId)
      ? subject.targetId
      : fallbackTargetId;
    if (!targetId) return;
    subjects.push({
      id: subject.id,
      name: String(subject.name ?? subject.id).slice(0, 64),
      short: String(subject.short ?? subject.name ?? subject.id).slice(0, 12),
      color: typeof subject.color === 'string' && subject.color ? subject.color : '#97A7FF',
      weight: Number.isFinite(subject.weight) ? subject.weight : 1,
      tier: ([1, 2, 3] as const).includes(subject.tier) ? subject.tier : 2,
      phase: ([1, 2, 3] as const).includes(subject.phase) ? subject.phase : 1,
      tagline: String(subject.tagline ?? '').slice(0, 160),
      archetypes: Array.isArray(subject.archetypes) ? subject.archetypes.map(String).slice(0, 8) : [],
      targetId,
    });
  });
  return subjects;
}

function sanitizeTopics(raw: Topic[], subjectMap: Map<string, Subject>): Topic[] {
  const seen = new Set<string>();
  const topics: Topic[] = [];
  raw.forEach((topic) => {
    if (!topic || typeof topic.id !== 'string' || !topic.id) return;
    if (seen.has(topic.id)) return;
    const subject = subjectMap.get(topic.subjectId);
    if (!subject) return;
    seen.add(topic.id);
    topics.push({
      id: topic.id,
      subjectId: topic.subjectId,
      title: String(topic.title ?? 'Untitled topic').slice(0, 120),
      units: Math.max(1, Math.min(100, Math.round(Number(topic.units) || 1))),
      phase: ([1, 2, 3] as const).includes(topic.phase) ? topic.phase : 1,
      keyPoints: Array.isArray(topic.keyPoints) ? topic.keyPoints.map(String).slice(0, 10) : [],
      ...(topic.highYield ? { highYield: true } : {}),
      targetId: subject.targetId,
    });
  });
  return topics;
}

/**
 * Normalize a planner payload from the server or an import file.
 * This never reads browser storage: accounts are the source of truth.
 *
 * Older saves have no targets/curriculum: they are migrated to the built-in
 * GATE preset so every completion, streak and XP point survives untouched.
 */
export function normalizeState(raw: Partial<AppState>): AppState | null {
  if (!raw || !raw.profile || !raw.settings || !Array.isArray(raw.tasks)) return null;
  const settings = { ...defaultSettings(raw.settings.examDate), ...raw.settings };

  let targets = Array.isArray(raw.targets)
    ? raw.targets
      .filter((target): target is StudyTarget => Boolean(target && typeof target.id === 'string'))
      .map(sanitizeTarget)
    : [];
  if (!targets.length) {
    targets = [{
      id: GATE_TARGET_ID,
      title: String(settings.examLabel || 'GATE CSE 2027').slice(0, 64),
      kind: 'exam',
      date: asDate(settings.examDate) ?? defaultSettings(todayISO()).examDate,
      color: TARGET_COLORS[0],
      createdAt: raw.profile.createdAt ?? new Date().toISOString(),
      preset: 'gate-cse',
      dailyMinutes: 240,
    }];
  }
  const targetIds = new Set(targets.map((target) => target.id));
  const gate = targets.find((target) => target.preset === 'gate-cse');
  const requestedPrimary = targets.find(
    (target) => target.id === settings.primaryTargetId && !target.archivedAt,
  );
  const dated = [...targets]
    .filter((target) => !target.archivedAt && target.date)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0];
  const primary = requestedPrimary
    ?? dated
    ?? targets.find((target) => !target.archivedAt)
    ?? targets[0];

  let subjects: Subject[];
  if (Array.isArray(raw.subjects) && raw.subjects.length) {
    subjects = sanitizeSubjects(
      raw.subjects,
      targetIds,
      gate?.id ?? primary.id,
    );
  } else if (gate) {
    subjects = seedGateCurriculum(gate.id).subjects;
  } else {
    subjects = [];
  }

  let topics: Topic[];
  if (Array.isArray(raw.topics) && raw.topics.length) {
    const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
    topics = sanitizeTopics(raw.topics, subjectMap);
  } else if (gate && subjects.length) {
    const seeded = seedGateCurriculum(gate.id).topics;
    const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
    topics = sanitizeTopics(seeded, subjectMap);
  } else {
    topics = [];
  }

  const topicMap = new Map(topics.map((topic) => [topic.id, topic]));
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const fallbackTargetId = gate?.id ?? primary.id;
  const validTargetId = (value: string | undefined): string | undefined =>
    value && targetIds.has(value) ? value : undefined;

  const topicProgress = Array.isArray(raw.topicProgress)
    ? raw.topicProgress.filter((entry) => entry && topicMap.has(entry.topicId))
    : [];
  topics.forEach((topic) => {
    if (!topicProgress.some((entry) => entry.topicId === topic.id)) {
      topicProgress.push({ topicId: topic.id, confidence: 3 });
    }
  });

  const tasks: Task[] = raw.tasks
    .filter((task): task is Task => Boolean(task && task.id && task.date && task.start))
    .map((task) => {
      const topic = task.topicId ? topicMap.get(task.topicId) : undefined;
      const subject = task.subjectId ? subjectMap.get(task.subjectId) : undefined;
      const resolved = validTargetId(task.targetId)
        ?? topic?.targetId
        ?? subject?.targetId
        ?? fallbackTargetId;
      return { ...task, ...(resolved ? { targetId: resolved } : {}) };
    });

  const budget = Number(settings.horizonDays);
  return {
    version: 2,
    profile: {
      name: String(raw.profile.name ?? 'Aspirant').slice(0, 48),
      createdAt: raw.profile.createdAt ?? new Date().toISOString(),
      onboarded: Boolean(raw.profile.onboarded),
    },
    settings: {
      examDate: primary.date ?? asDate(settings.examDate) ?? defaultSettings(todayISO()).examDate,
      examLabel: String(primary.title ?? settings.examLabel ?? 'Study plan').slice(0, 64),
      primaryTargetId: primary.id,
      horizonDays: Number.isFinite(budget) ? Math.max(7, Math.min(365, budget)) : 30,
      weekday: Array.isArray(settings.weekday) && settings.weekday.length
        ? settings.weekday
        : defaultSettings(settings.examDate).weekday,
      weekend: Array.isArray(settings.weekend) && settings.weekend.length
        ? settings.weekend
        : defaultSettings(settings.examDate).weekend,
      heavyDays: Array.isArray(settings.heavyDays) ? settings.heavyDays : [0, 6],
      mockPhaseDays: Number(settings.mockPhaseDays) || 12,
      mockCount: Number(settings.mockCount) || 5,
      revisionDays: Number(settings.revisionDays) || 2,
      dailyFlow: settings.dailyFlow !== false,
      flowVersion: FLOW_VERSION,
      sound: settings.sound !== false,
      confetti: settings.confetti !== false,
    },
    targets,
    subjects,
    topics,
    topicProgress,
    tasks,
    restDays: Array.isArray(raw.restDays) ? raw.restDays.filter(Boolean) : [],
    boostedSubjects: Array.isArray(raw.boostedSubjects) ? raw.boostedSubjects : [],
    generatedFor: raw.generatedFor ?? null,
    seenAchievements: Array.isArray(raw.seenAchievements) ? raw.seenAchievements : [],
    lastRipple: raw.lastRipple,
  };
}

/**
 * Hydrate a server planner state for the current day. Unfinished work from
 * previous days is marked missed and folded back into the queue.
 */
export function prepareState(
  saved: AppState | null,
  fallbackName: string,
): { state: AppState; rollover?: string; migrated?: boolean } {
  if (!saved) {
    return {
      state: createEmptyState(
        fallbackName,
        defaultSettings(todayISO()).examDate,
        false,
      ),
    };
  }

  const flowStale = saved.settings?.flowVersion !== FLOW_VERSION;
  const normalized = normalizeState(saved);
  if (!normalized) {
    return {
      state: createEmptyState(
        fallbackName,
        defaultSettings(todayISO()).examDate,
        false,
      ),
    };
  }

  const today = todayISO();
  if (!normalized.profile.onboarded) return { state: normalized };

  if (flowStale || !normalized.generatedFor || normalized.generatedFor !== today) {
    setCurriculumRegistry(normalized.subjects, normalized.topics);
    const carried = normalized.tasks.filter(
      (task) =>
        task.date < today &&
        task.status === 'todo' &&
        ['study', 'practice', 'pyq', 'revision', 'test'].includes(task.kind),
    ).length;
    const marked = normalized.tasks.map((task) =>
      task.date < today && task.status === 'todo' ? { ...task, status: 'missed' as const } : task,
    );
    const interim: AppState = { ...normalized, tasks: marked };
    // Rebuild from today, not tomorrow: the current day's plan must survive a
    // reload. Completed work and manually moved blocks are preserved by the
    // scheduler, so this is a deterministic re-flow rather than a reset.
    const tasks = generateTasks(interim, today).tasks;
    return {
      state: {
        ...interim,
        settings: { ...interim.settings, flowVersion: FLOW_VERSION },
        tasks,
        generatedFor: today,
        lastRipple: normalized.lastRipple,
      },
      rollover: flowStale
        ? undefined
        : carried
          ? `${carried} unfinished ${carried === 1 ? 'block was' : 'blocks were'} carried forward. The oldest unresolved topic takes the next core slot; later topics slide one step.`
          : 'Yesterday is locked. The queue is clean — today is exactly what you see.',
      migrated: flowStale,
    };
  }

  return { state: normalized };
}

export function importStateFromText(text: string): AppState {
  const parsed = JSON.parse(text) as Partial<AppState>;
  const normalized = normalizeState(parsed);
  if (!normalized) throw new Error('That file does not look like an ASCENT planner export.');
  return normalized;
}
