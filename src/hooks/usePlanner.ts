import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppState,
  NewTaskInput,
  PlannerSettings,
  PrepLevel,
  StudyTarget,
  Subject,
  SubjectId,
  TargetKind,
  Task,
  ToastMessage,
  Topic,
} from '../types';
import {
  addDays,
  achievementsUnlocked,
  computeRipple,
  coverageStats,
  diffDays,
  fireConfetti,
  formatDate,
  formatDuration,
  hashString,
  levelInfo,
  playChime,
  plural,
  slotDefaultTime,
  slotForTime,
  taskXp,
  todayISO,
  uid,
} from '../lib/utils';
import {
  ACHIEVEMENTS,
  defaultSettings,
} from '../data/curriculum';
import { importStateFromText } from '../lib/storage';
import { createEmptyState, createInitialState, generateTasks } from '../lib/schedule';
import { beaconSave, type AccountStats, type AccountUser } from '../lib/api';
import {
  TARGET_COLORS,
  createId,
  createTarget,
  planningEnd,
  primaryTarget as primaryTargetOf,
  targetById,
} from '../lib/targets';
import { setCurriculumRegistry } from '../lib/curriculumRegistry';
import type {
  CurriculumImportRow,
  ImportApplyMode,
  ImportPlan,
  TimetableImportRow,
} from '../lib/bulkImport';

export interface NewTargetInput {
  title: string;
  kind?: TargetKind;
  date?: string;
  color?: string;
  dailyMinutes?: number;
  focus?: boolean;
}

export interface OnboardingInput {
  name: string;
  targetTitle: string;
  targetDate?: string;
  preset: 'gate' | 'blank';
  subjectOrder?: SubjectId[];
  prepLevel?: PrepLevel;
  dayMinutes?: number[];
}

export interface ImportApplyOptions {
  mode: ImportApplyMode;
  targetId?: string;
}

export type SyncStatus = 'saved' | 'saving' | 'offline';

function toastId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function cleanName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function xpForKind(kind: Task['kind'], duration: number): number {
  const base: Partial<Record<Task['kind'], number>> = {
    study: 35,
    pyq: 30,
    test: 25,
    revision: 25,
    practice: 25,
    mock: 80,
    personal: 10,
    rest: 5,
    analysis: 30,
    exam: 500,
  };
  return base[kind] ?? Math.max(10, Math.round(duration / 2));
}

function minutesOf(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function nextFreeStart(date: string, duration: number, tasks: Task[]): string {
  const busy = tasks
    .filter((task) => task.date === date && task.status !== 'skipped' && !task.earlyCompleted)
    .map((task) => {
      const from = minutesOf(task.start);
      return { from, to: from + task.duration };
    });
  for (let minute = 8 * 60; minute + duration <= 22 * 60 + 30; minute += 15) {
    if (!busy.some((entry) => minute < entry.to && minute + duration > entry.from)) {
      return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    }
  }
  return '09:00';
}

interface UsePlannerOptions {
  initialState: AppState;
  saveInitial?: boolean;
  rollover?: string;
  persist: (state: AppState) => Promise<{ stats: AccountStats; user: AccountUser }>;
  onSaved?: (result: { stats: AccountStats; user: AccountUser }) => void;
}

export interface ImportApplyResult {
  added: number;
  skipped: number;
  curriculum: number;
  targetId: string;
  targetTitle: string;
}

export function usePlanner({
  initialState,
  saveInitial = false,
  rollover,
  persist,
  onSaved,
}: UsePlannerOptions) {
  const [state, setState] = useState<AppState>(initialState);
  const stateRef = useRef(state);
  // Display helpers read the active curriculum from this registry. Updating it
  // during the hook render keeps cards and labels in step with the state.
  setCurriculumRegistry(state.subjects, state.topics);
  const baselineRef = useRef(initialState);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const undoRef = useRef<AppState | null>(null);
  const timers = useRef<number[]>([]);
  const rolloverShown = useRef(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('saved');
  const dirtyRef = useRef(saveInitial);
  const saveTimerRef = useRef<number | null>(null);
  const persistRef = useRef(persist);
  const onSavedRef = useRef(onSaved);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const saveFailureRef = useRef(false);
  const mutatedRef = useRef(false);

  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const clock = window.setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 || now.getHours() === 1) {
        // A cheap idempotent check; it exits immediately after the first run.
        checkNewDay();
      }
    }, 60_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkNewDay();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = toastId();
    setToasts((list) => [...list.slice(-3), { ...toast, id }]);
    const timer = window.setTimeout(() => {
      setToasts((list) => list.filter((item) => item.id !== id));
    }, 6200);
    timers.current.push(timer);
  }, []);

  useEffect(() => {
    if (rollover && !rolloverShown.current) {
      rolloverShown.current = true;
      addToast({
        kind: 'info',
        title: 'A new day. Plan rebalanced.',
        message: rollover,
      });
    }
  }, [addToast, rollover]);

  const removeToast = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const persistSnapshot = useCallback((snapshot: AppState) => {
    const task = queueRef.current.then(async () => {
      setSyncStatus('saving');
      try {
        const result = await persistRef.current(snapshot);
        if (stateRef.current === snapshot) {
          dirtyRef.current = false;
          setSyncStatus('saved');
        }
        saveFailureRef.current = false;
        onSavedRef.current?.(result);
      } catch (error) {
        if (stateRef.current === snapshot) setSyncStatus('offline');
        if (!saveFailureRef.current) {
          saveFailureRef.current = true;
          addToast({
            kind: 'error',
            title: 'Cloud save interrupted',
            message: 'Your plan is still open. Retry from the sync badge in the topbar.',
          });
        }
        throw error;
      }
    });
    queueRef.current = task.catch(() => undefined);
    return task;
  }, [addToast]);

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!dirtyRef.current) return true;
    try {
      await persistSnapshot(stateRef.current);
      return true;
    } catch {
      return false;
    }
  }, [persistSnapshot]);

  useEffect(() => {
    if (!mutatedRef.current && state === baselineRef.current && !saveInitial) {
      setSyncStatus('saved');
      return;
    }
    dirtyRef.current = true;
    setSyncStatus('saving');
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistSnapshot(stateRef.current).catch(() => undefined);
    }, 650);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [state, saveInitial, persistSnapshot]);

  useEffect(() => {
    const onPageHide = () => {
      if (dirtyRef.current) beaconSave(stateRef.current);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      if (dirtyRef.current) beaconSave(stateRef.current);
    };
  }, []);

  const setNextState = useCallback((next: AppState, prev: AppState, options?: { undo?: boolean }) => {
    mutatedRef.current = true;
    let processed = next;
    const unlocked = achievementsUnlocked(processed).filter(
      (id) => !processed.seenAchievements.includes(id),
    );
    if (unlocked.length) {
      processed = {
        ...processed,
        seenAchievements: [...processed.seenAchievements, ...unlocked],
      };
    }
    if (options?.undo !== false) {
      undoRef.current = prev;
      setUndoAvailable(true);
    }
    stateRef.current = processed;
    setState(processed);
    if (unlocked.length) {
      unlocked.slice(0, 2).forEach((id, index) => {
        const achievement = ACHIEVEMENTS.find((entry) => entry.id === id);
        if (!achievement) return;
        const timer = window.setTimeout(() => {
          addToast({
            kind: 'achievement',
            title: `Badge unlocked · ${achievement.name}`,
            message: achievement.description,
            icon: achievement.icon,
          });
        }, 450 + index * 500);
        timers.current.push(timer);
      });
    }
  }, [addToast]);

  const rebalance = useCallback((base: AppState, reason: string, fromDate?: string, undoBase?: AppState) => {
    setCurriculumRegistry(base.subjects, base.topics);
    const today = todayISO();
    const targetFrom = fromDate ?? addDays(today, 1);
    const snapshot = undoBase ?? base;
    const before = snapshot.tasks;
    const nextTasks = generateTasks(base, targetFrom).tasks;
    const coverageBefore = coverageStats(before);
    const coverageAfter = coverageStats(nextTasks);
    const report = computeRipple(
      before,
      nextTasks,
      reason,
      coverageBefore.pct,
      coverageAfter.pct,
      coverageAfter.deferredTopicCount,
    );
    const next: AppState = {
      ...base,
      tasks: nextTasks,
      generatedFor: today,
      lastRipple: report,
    };
    setNextState(next, snapshot);
    const summary = report.sessionsMoved
      ? `${report.sessionsMoved} sessions re-flowed · ${report.daysAffected} days touched · coverage ${report.coverageAfter}%`
      : `coverage ${report.coverageAfter}% · study queue unchanged`;
    addToast({
      kind: 'ripple',
      title: report.sessionsMoved ? 'Ripple applied' : 'Plan refreshed',
      message: `${reason}. ${summary}${report.deferredTopics ? ` · ${report.deferredTopics} topics still deferred` : ''}`,
    });
    if (report.deferredTopics > 0 && coverageAfter.pct < coverageBefore.pct) {
      addToast({
        kind: 'info',
        title: 'Coverage pressure detected',
        message: `${report.deferredTopics} topics no longer fit the calendar. Boost a subject or add daily capacity.`,
      });
    }
    return report;
  }, [addToast, setNextState]);

  const completeTask = useCallback((taskId: string, score?: number) => {
    const prev = stateRef.current;
    const task = prev.tasks.find((item) => item.id === taskId);
    if (!task || task.status !== 'todo') return;
    const today = todayISO();
    const isFuture = task.date > today;
    if (isFuture && task.kind === 'exam') {
      addToast({
        kind: 'info',
        title: 'The final boss waits',
        message: 'Exam day can only be banked when it actually arrives.',
      });
      return;
    }
    const earlyCore = isFuture && task.kind === 'study' && Boolean(task.topicId);
    const completedTask: Task = {
      ...task,
      status: 'done' as const,
      completedAt: new Date().toISOString(),
      score: typeof score === 'number' ? Math.max(0, Math.min(100, score)) : task.score,
      ...(earlyCore
        ? {
          earlyCompleted: true,
          // Release the day slot so the re-flow can put the next topic in it.
          planSignature: task.planSignature ? `early:${task.planSignature}` : `early:${task.id}`,
        }
        : {}),
    };
    const nextTasks = prev.tasks.map((item) => (item.id === taskId ? completedTask : item));
    const next: AppState = { ...prev, tasks: nextTasks, generatedFor: today };
    if (earlyCore) {
      rebalance(
        next,
        `“${task.title}” banked early — later topics pulled forward, spaced recall queued`,
        today,
        prev,
      );
    } else {
      setNextState(next, prev);
    }
    const gained = taskXp(nextTasks) - taskXp(prev.tasks);
    const levelBefore = levelInfo(taskXp(prev.tasks));
    const levelAfter = levelInfo(taskXp(nextTasks));
    const taskLabel = earlyCore
      ? 'Banked ahead of schedule.'
      : task.kind === 'mock'
        ? 'Boss down.'
        : task.kind === 'exam'
          ? 'You did it.'
          : task.kind === 'test'
            ? 'Loop closed.'
            : task.kind === 'study'
              ? 'Deep work banked.'
              : 'Momentum banked.';
    addToast({
      kind: 'xp',
      title: `${taskLabel} +${gained} XP`,
      message: earlyCore
        ? `${task.title} · revision passes scheduled from today.`
        : task.title,
    });
    if (levelAfter.index > levelBefore.index) {
      addToast({
        kind: 'achievement',
        title: `Rank up · ${levelAfter.name}`,
        message: 'The ascent continues. Your XP is compounding.',
        icon: 'crown',
      });
    }
    if (prev.settings.sound) playChime(levelAfter.index > levelBefore.index ? 'level' : 'success');
    if (prev.settings.confetti) {
      fireConfetti({
        count: task.kind === 'mock' || task.kind === 'exam' ? 180 : 90,
        colors: ['#D8FF6A', '#97A7FF', '#63E6CE', '#FFC46B'],
      });
    }
  }, [addToast, rebalance, setNextState]);

  const uncompleteTask = useCallback((taskId: string) => {
    const prev = stateRef.current;
    const task = prev.tasks.find((item) => item.id === taskId);
    if (!task || task.status !== 'done') return;
    if (task.date < todayISO()) {
      addToast({
        kind: 'info',
        title: 'Too far back',
        message: 'Completed history is locked. Keep the record honest and move forward.',
      });
      return;
    }
    const wasEarly = Boolean(task.earlyCompleted);
    const restoredSignature = task.planSignature?.startsWith('early:flow:')
      ? task.planSignature.slice('early:'.length)
      : task.planSignature?.startsWith('early:')
        ? undefined
        : task.planSignature;
    const next: AppState = {
      ...prev,
      tasks: prev.tasks.map((item) =>
        item.id === taskId
          ? {
            ...item,
            status: 'todo',
            completedAt: undefined,
            earlyCompleted: false,
            planSignature: restoredSignature,
          }
          : item,
      ),
    };
    if (wasEarly) {
      rebalance(next, `“${task.title}” reopened — the queue reinserted it`, todayISO(), prev);
    } else {
      setNextState(next, prev);
    }
    addToast({
      kind: 'info',
      title: 'Completion undone',
      message: wasEarly
        ? 'XP removed. The topic is back in the queue and later sessions re-flowed.'
        : 'XP removed. The plan remains intact.',
    });
  }, [addToast, rebalance, setNextState]);

  const skipTask = useCallback((taskId: string) => {
    const prev = stateRef.current;
    const task = prev.tasks.find((item) => item.id === taskId);
    if (!task || task.status === 'done') return;
    const next: AppState = {
      ...prev,
      tasks: prev.tasks.map((item) =>
        item.id === taskId ? { ...item, status: 'skipped' as const } : item,
      ),
    };
    if (task.kind === 'study') {
      rebalance(next, `Skipped “${task.title}” — backlog re-flowed`, addDays(todayISO(), 1), prev);
    } else {
      setNextState(next, prev);
      addToast({
        kind: 'info',
        title: 'Skipped',
        message: task.kind === 'mock' ? 'That mock will not count toward your boss total.' : task.title,
      });
    }
  }, [addToast, rebalance, setNextState]);

  const deferTask = useCallback((taskId: string, targetDate: string, targetSlot: Task['slot'], targetStart?: string) => {
    const prev = stateRef.current;
    const task = prev.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const today = todayISO();
    if (task.kind === 'exam' || task.kind === 'rest') {
      addToast({ kind: 'info', title: 'This one stays put', message: 'Exam day and recovery blocks are anchors.' });
      return;
    }
    if (targetDate < today) {
      addToast({ kind: 'info', title: 'Past is past', message: 'Choose today or a future date.' });
      return;
    }
    if (targetDate > planningEnd(prev, today)) {
      addToast({ kind: 'info', title: 'Outside the horizon', message: 'Choose a date inside your current planning window.' });
      return;
    }
    const taskTarget = task.targetId
      ? prev.targets.find((target) => target.id === task.targetId)
      : undefined;
    if (taskTarget?.date && targetDate > taskTarget.date) {
      addToast({
        kind: 'info',
        title: 'Outside this target',
        message: `${taskTarget.title} ends ${formatDate(taskTarget.date, 'short')}. Pick a date on or before it.`,
      });
      return;
    }
    const sameDay = task.date === targetDate;
    const sameSlot = task.slot === targetSlot;
    if (sameDay && sameSlot && !targetStart) return;
    const start = targetStart ?? (sameSlot ? task.start : slotDefaultTime(targetSlot));
    const next: AppState = {
      ...prev,
      tasks: prev.tasks.map((item) =>
        item.id === taskId
          ? {
            ...item,
            date: targetDate,
            start,
            slot: targetSlot,
            manual: task.kind === 'personal' ? item.manual : true,
            planSignature: task.planSignature?.startsWith('flow:') && targetDate !== task.date
              ? `moved:${task.planSignature}:${targetDate}`
              : item.planSignature,
          }
          : item,
      ),
    };
    const shouldRipple = task.kind === 'personal' || targetDate !== today || task.date !== today;
    if (shouldRipple) {
      const from = task.kind === 'personal'
        ? (task.date < targetDate ? task.date : targetDate)
        : addDays(today, 1);
      rebalance(next, `“${task.title}” moved to ${formatDate(targetDate, 'short')}`, from, prev);
    } else {
      setNextState(next, prev);
      addToast({
        kind: 'info',
        title: 'Rescheduled',
        message: `${task.title} · ${formatDate(targetDate, 'short')} at ${start}`,
      });
    }
  }, [addToast, rebalance, setNextState]);

  const buildManualTask = (input: NewTaskInput): Task => {
    const duration = Math.max(5, Math.min(360, Math.round(input.duration)));
    const start = input.start || slotDefaultTime(slotForTime(input.start || '09:00'));
    const xpByKind: Partial<Record<Task['kind'], number>> = {
      study: 35,
      pyq: 30,
      test: 25,
      revision: 25,
      practice: 25,
      mock: 80,
      personal: 10,
      rest: 5,
    };
    const subtitleByKind: Partial<Record<Task['kind'], string>> = {
      personal: 'Life block · your plan',
      rest: 'Recovery · your plan',
      revision: 'Self-directed revision',
      study: 'Command-added deep work',
      pyq: 'Command-added PYQ recon',
      test: 'Command-added validation',
      practice: 'Command-added practice',
    };
    const explicitTarget = input.targetId && prevTargetExists(input.targetId) ? input.targetId : undefined;
    const subjectTarget = input.subjectId
      ? stateRef.current.subjects.find((subject) => subject.id === input.subjectId)?.targetId
      : undefined;
    const targetId = explicitTarget
      ?? subjectTarget
      ?? stateRef.current.settings.primaryTargetId
      ?? primaryTargetOf(stateRef.current)?.id;
    return {
      id: uid('task'),
      date: input.date,
      start,
      duration,
      slot: slotForTime(start),
      kind: input.kind,
      title: input.title.trim() || 'Untitled block',
      subtitle: subtitleByKind[input.kind] ?? 'Personal plan',
      description: input.notes,
      targetId,
      subjectId: input.subjectId,
      xp: xpByKind[input.kind] ?? 10,
      status: 'todo',
      manual: true,
      notes: input.notes,
      planSignature: `manual:${input.date}:${start}:${Date.now()}`,
    };
  };

  const prevTargetExists = (targetId: string) =>
    stateRef.current.targets.some((target) => target.id === targetId);

  const validInput = (input: NewTaskInput, prev: AppState) => {
    const today = todayISO();
    if (!input.date || input.date < today) return false;
    if (input.date > planningEnd(prev, today)) return false;
    if (!input.title.trim()) return false;
    return true;
  };

  const addBlocks = useCallback((inputs: NewTaskInput[]) => {
    const prev = stateRef.current;
    const valid = inputs.filter((input) => validInput(input, prev)).map(buildManualTask);
    if (!valid.length) {
      addToast({
        kind: 'error',
        title: 'No blocks mapped',
        message: 'Dates must fall between today and exam day, and every block needs a title.',
      });
      return;
    }
    const next: AppState = {
      ...prev,
      tasks: [...prev.tasks, ...valid].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return a.start.localeCompare(b.start);
      }),
    };
    const earliest = valid.reduce((min, task) => (task.date < min ? task.date : min), valid[0].date);
    const totalMinutes = valid.reduce((sum, task) => sum + task.duration, 0);
    const days = new Set(valid.map((task) => task.date)).size;
    const reason = valid.length === 1
      ? `Mapped “${valid[0].title}” · ${formatDate(valid[0].date, 'short')} at ${valid[0].start}`
      : `Mapped ${valid.length} blocks · ${formatDuration(totalMinutes)} across ${days} day${days === 1 ? '' : 's'}`;
    rebalance(next, reason, earliest, prev);
  }, [addToast, rebalance]);

  const addTask = useCallback((input: NewTaskInput) => {
    addBlocks([input]);
  }, [addBlocks]);

  const deleteTask = useCallback((taskId: string) => {
    const prev = stateRef.current;
    const task = prev.tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (!task.manual) {
      skipTask(taskId);
      return;
    }
    const next: AppState = {
      ...prev,
      tasks: prev.tasks.filter((item) => item.id !== taskId),
    };
    if (task.date >= todayISO()) {
      rebalance(
        next,
        task.kind === 'study'
          ? `Removed “${task.title}” — the queue re-flowed`
          : `Removed “${task.title}” — the day re-flowed`,
        task.date,
        prev,
      );
    } else {
      setNextState(next, prev);
      addToast({ kind: 'info', title: 'Block removed', message: task.title });
    }
  }, [addToast, rebalance, setNextState, skipTask]);

  const setTaskNote = useCallback((taskId: string, notes: string) => {
    const prev = stateRef.current;
    const next: AppState = {
      ...prev,
      tasks: prev.tasks.map((item) => (item.id === taskId ? { ...item, notes } : item)),
    };
    setNextState(next, prev, { undo: false });
  }, [setNextState]);

  const setTaskScore = useCallback((taskId: string, score: number) => {
    const prev = stateRef.current;
    const next: AppState = {
      ...prev,
      tasks: prev.tasks.map((item) =>
        item.id === taskId
          ? { ...item, score: Math.max(0, Math.min(100, Math.round(score))) }
          : item,
      ),
    };
    setNextState(next, prev);
    addToast({
      kind: 'info',
      title: 'Mock score logged',
      message: `${Math.round(score)} / 100 · the error log is where the next jump comes from.`,
    });
  }, [addToast, setNextState]);

  const updateProfile = useCallback((name: string) => {
    const prev = stateRef.current;
    const clean = name.trim().slice(0, 32) || 'Aspirant';
    const next: AppState = {
      ...prev,
      profile: { ...prev.profile, name: clean },
    };
    setNextState(next, prev, { undo: false });
    addToast({ kind: 'info', title: 'Pilot renamed', message: `The board now answers to ${clean.split(' ')[0]}.` });
  }, [addToast, setNextState]);

  const setConfidence = useCallback((topicId: string, confidence: number) => {
    const prev = stateRef.current;
    const value = Math.max(1, Math.min(5, confidence));
    const exists = prev.topicProgress.some((entry) => entry.topicId === topicId);
    const next: AppState = {
      ...prev,
      topicProgress: exists
        ? prev.topicProgress.map((entry) =>
          entry.topicId === topicId ? { ...entry, confidence: value } : entry,
        )
        : [...prev.topicProgress, { topicId, confidence: value }],
    };
    setNextState(next, prev, { undo: false });
  }, [setNextState]);

  const toggleRestDay = useCallback((date: string) => {
    const prev = stateRef.current;
    const today = todayISO();
    if (date < today) return;
    if (date > planningEnd(prev, today)) return;
    const adding = !prev.restDays.includes(date);
    const next: AppState = {
      ...prev,
      restDays: adding
        ? [...prev.restDays, date]
        : prev.restDays.filter((entry) => entry !== date),
    };
    rebalance(
      next,
      adding ? `${formatDate(date, 'short')} is now a recovery day` : `${formatDate(date, 'short')} is back in the plan`,
      date === today ? today : addDays(today, 1),
      prev,
    );
  }, [rebalance]);

  const boostSubject = useCallback((subjectId: SubjectId) => {
    const prev = stateRef.current;
    const isBoosted = prev.boostedSubjects.includes(subjectId);
    const next: AppState = {
      ...prev,
      boostedSubjects: isBoosted
        ? prev.boostedSubjects.filter((id) => id !== subjectId)
        : [...prev.boostedSubjects, subjectId],
    };
    const subject = prev.subjects.find((entry) => entry.id === subjectId);
    rebalance(
      next,
      isBoosted
        ? `${subject?.name ?? 'Subject'} returned to normal order`
        : `${subject?.name ?? 'Subject'} boosted to the front of the queue`,
      addDays(todayISO(), 1),
      prev,
    );
  }, [rebalance]);

  const addTarget = useCallback((input: NewTargetInput) => {
    const prev = stateRef.current;
    const today = todayISO();
    if (input.date && input.date < today) {
      addToast({ kind: 'error', title: 'Target date is in the past', message: 'Leave the date blank for a rolling plan, or choose a future date.' });
      return;
    }
    const target = createTarget(input);
    if (input.focus !== false) {
      target.color = input.color ?? TARGET_COLORS[(prev.targets.length + 1) % TARGET_COLORS.length];
    }
    const focus = input.focus !== false;
    const settings: PlannerSettings = focus
      ? {
        ...prev.settings,
        primaryTargetId: target.id,
        examLabel: target.title,
        ...(target.date ? { examDate: target.date } : {}),
      }
      : prev.settings;
    const next: AppState = {
      ...prev,
      targets: [...prev.targets, target],
      settings,
    };
    if (prev.profile.onboarded) {
      rebalance(next, `Target “${target.title}” added`, today, prev);
    } else {
      setNextState(next, prev);
    }
    addToast({
      kind: 'info',
      title: 'Target added',
      message: target.date
        ? `${target.title} · ${formatDate(target.date, 'long')}. Import a curriculum to fill it.`
        : `${target.title} · rolling plan. Import a curriculum or timetable to fill the next 30 days.`,
    });
  }, [addToast, rebalance, setNextState]);

  const focusTarget = useCallback((id: string) => {
    const prev = stateRef.current;
    const target = targetById(prev, id);
    if (!target || target.archivedAt) return;
    if (prev.settings.primaryTargetId === id) return;
    const settings: PlannerSettings = {
      ...prev.settings,
      primaryTargetId: id,
      examLabel: target.title,
      ...(target.date ? { examDate: target.date } : {}),
    };
    setNextState({ ...prev, settings }, prev, { undo: false });
    addToast({ kind: 'info', title: 'Target focused', message: target.title });
  }, [addToast, setNextState]);

  const updateTarget = useCallback((
    id: string,
    patch: Partial<Pick<StudyTarget, 'title' | 'kind' | 'date' | 'color' | 'dailyMinutes' | 'notes'>>,
  ) => {
    const prev = stateRef.current;
    const existing = targetById(prev, id);
    if (!existing) return;
    const today = todayISO();
    if (patch.date && patch.date < today) {
      addToast({ kind: 'error', title: 'Target date is in the past', message: 'Choose today, a future date, or clear it for a rolling plan.' });
      return;
    }
    const nextTarget: StudyTarget = {
      ...existing,
      ...patch,
      title: (patch.title ?? existing.title).trim() || existing.title,
      ...(patch.date !== undefined ? (patch.date ? { date: patch.date } : { date: undefined }) : {}),
    };
    const targets = prev.targets.map((target) => (target.id === id ? nextTarget : target));
    const isPrimary = prev.settings.primaryTargetId === id;
    const settings: PlannerSettings = isPrimary
      ? {
        ...prev.settings,
        examLabel: nextTarget.title,
        ...(nextTarget.date ? { examDate: nextTarget.date } : {}),
      }
      : prev.settings;
    const next: AppState = { ...prev, targets, settings };
    const dateChanged = existing.date !== nextTarget.date;
    if (dateChanged && prev.profile.onboarded) {
      rebalance(
        next,
        nextTarget.date
          ? `Target “${nextTarget.title}” now ends ${formatDate(nextTarget.date, 'short')}`
          : `Target “${nextTarget.title}” switched to a rolling plan`,
        today,
        prev,
      );
    } else {
      setNextState(next, prev);
      addToast({ kind: 'info', title: 'Target updated', message: nextTarget.title });
    }
  }, [addToast, rebalance, setNextState]);

  const archiveTarget = useCallback((id: string) => {
    const prev = stateRef.current;
    const target = targetById(prev, id);
    if (!target || target.archivedAt) return;
    const remaining = prev.targets.filter((entry) => entry.id !== id && !entry.archivedAt);
    if (!remaining.length) {
      addToast({ kind: 'error', title: 'Keep one target active', message: 'Add another target before archiving this one.' });
      return;
    }
    const today = todayISO();
    const targets = prev.targets.map((entry) =>
      entry.id === id ? { ...entry, archivedAt: new Date().toISOString() } : entry,
    );
    const tasks = prev.tasks.filter((task) => {
      if (task.targetId !== id) return true;
      if (task.date < today) return true;
      if (task.status === 'done' || task.status === 'skipped' || task.status === 'missed') return true;
      // Manual blocks before today are history. Pending manual and imported
      // blocks belong to the target's plan, so archiving takes them off the
      // board while leaving completed work untouched.
      return false;
    });
    const primary = primaryTargetOf({ ...prev, targets }) ?? remaining[0];
    const settings: PlannerSettings = {
      ...prev.settings,
      primaryTargetId: primary.id,
      examLabel: primary.title,
      ...(primary.date ? { examDate: primary.date } : {}),
    };
    const next: AppState = { ...prev, targets, tasks, settings };
    rebalance(next, `Target “${target.title}” archived — completed history stays readable`, today, prev);
    addToast({
      kind: 'info',
      title: 'Target archived',
      message: `${target.title} is out of the plan. Its completed sessions, XP and notes remain in your account.`,
    });
  }, [addToast, rebalance]);

  const restoreTarget = useCallback((id: string) => {
    const prev = stateRef.current;
    const target = targetById(prev, id);
    if (!target || !target.archivedAt) return;
    const targets = prev.targets.map((entry) =>
      entry.id === id ? { ...entry, archivedAt: undefined } : entry,
    );
    const settings: PlannerSettings = {
      ...prev.settings,
      primaryTargetId: id,
      examLabel: target.title,
      ...(target.date ? { examDate: target.date } : {}),
    };
    const next: AppState = { ...prev, targets, settings };
    rebalance(next, `Target “${target.title}” restored`, todayISO(), prev);
    addToast({ kind: 'info', title: 'Target restored', message: `${target.title} is back on the board.` });
  }, [addToast, rebalance]);

  const addSubject = useCallback((targetId: string, name: string, color?: string) => {
    const prev = stateRef.current;
    const target = targetById(prev, targetId);
    const clean = name.trim();
    if (!target || !clean) return;
    const words = clean.split(/\s+/);
    const short = words.length > 1
      ? words.map((word) => word[0]).join('').slice(0, 4).toUpperCase()
      : clean.slice(0, 4).toUpperCase();
    const subject: Subject = {
      id: createId('sub'),
      name: clean.slice(0, 64),
      short,
      color: color ?? TARGET_COLORS[(prev.subjects.length + 2) % TARGET_COLORS.length],
      weight: 1,
      tier: 2,
      phase: 1,
      tagline: '',
      archetypes: [],
      targetId,
    };
    const next: AppState = { ...prev, subjects: [...prev.subjects, subject] };
    setNextState(next, prev);
    addToast({ kind: 'info', title: 'Subject added', message: `${subject.name} is ready for topics.` });
  }, [addToast, setNextState]);

  const addTopic = useCallback((input: {
    targetId: string;
    subjectId: string;
    title: string;
    units?: number;
    keyPoints?: string[];
    highYield?: boolean;
  }) => {
    const prev = stateRef.current;
    const subject = prev.subjects.find((entry) => entry.id === input.subjectId);
    const title = input.title.trim();
    if (!subject || !title || subject.targetId !== input.targetId) return;
    const topic: Topic = {
      id: createId('topic'),
      subjectId: subject.id,
      title: title.slice(0, 120),
      units: Math.max(1, Math.min(100, Math.round(input.units ?? 1))),
      phase: subject.phase,
      keyPoints: (input.keyPoints ?? []).map(String).slice(0, 10),
      ...(input.highYield ? { highYield: true } : {}),
      targetId: input.targetId,
    };
    const next: AppState = {
      ...prev,
      topics: [...prev.topics, topic],
      topicProgress: [...prev.topicProgress, { topicId: topic.id, confidence: 3 }],
    };
    rebalance(next, `Topic “${topic.title}” added to ${subject.name}`, todayISO(), prev);
  }, [rebalance]);

  const updateTopic = useCallback((
    topicId: string,
    patch: Partial<Pick<Topic, 'title' | 'units' | 'keyPoints' | 'phase' | 'highYield'>>,
  ) => {
    const prev = stateRef.current;
    const existing = prev.topics.find((topic) => topic.id === topicId);
    if (!existing) return;
    const nextTopic: Topic = {
      ...existing,
      ...patch,
      title: (patch.title ?? existing.title).trim() || existing.title,
      units: Math.max(1, Math.min(100, Math.round(patch.units ?? existing.units))),
    };
    const topics = prev.topics.map((topic) => (topic.id === topicId ? nextTopic : topic));
    const next: AppState = { ...prev, topics };
    const schedulingChanged = nextTopic.units !== existing.units || nextTopic.title !== existing.title;
    if (schedulingChanged) {
      rebalance(next, `Topic “${nextTopic.title}” updated`, todayISO(), prev);
    } else {
      setNextState(next, prev);
      addToast({ kind: 'info', title: 'Topic updated', message: nextTopic.title });
    }
  }, [addToast, rebalance, setNextState]);

  const deleteTopic = useCallback((topicId: string) => {
    const prev = stateRef.current;
    const topic = prev.topics.find((entry) => entry.id === topicId);
    if (!topic) return;
    const today = todayISO();
    const tasks = prev.tasks.filter((task) => {
      if (task.topicId !== topicId) return true;
      if (task.status === 'done' || task.date < today) return true;
      if (task.manual) return true;
      return false;
    });
    const next: AppState = {
      ...prev,
      topics: prev.topics.filter((entry) => entry.id !== topicId),
      topicProgress: prev.topicProgress.filter((entry) => entry.topicId !== topicId),
      tasks,
    };
    rebalance(next, `Topic “${topic.title}” removed from the queue`, today, prev);
    addToast({ kind: 'info', title: 'Topic removed', message: `${topic.title} is off the plan. Completed history is untouched.` });
  }, [addToast, rebalance]);

  const importCurriculumRows = (
    rows: CurriculumImportRow[],
    targetId: string,
    subjects: Subject[],
    topics: Topic[],
    onTopic: (topicId: string) => void,
  ): number => {
    let changed = 0;
    rows.forEach((row) => {
      const cleanSubject = cleanName(row.subject);
      let subject = subjects.find(
        (entry) => entry.targetId === targetId && cleanName(entry.name) === cleanSubject,
      );
      if (!subject) {
        const words = row.subject.trim().split(/\s+/);
        const short = words.length > 1
          ? words.map((word) => word[0]).join('').slice(0, 4).toUpperCase()
          : row.subject.slice(0, 4).toUpperCase();
        subject = {
          id: createId('sub'),
          name: row.subject.trim().slice(0, 64),
          short,
          color: TARGET_COLORS[(subjects.length + 2) % TARGET_COLORS.length],
          weight: 1,
          tier: 2,
          phase: 1,
          tagline: '',
          archetypes: [],
          targetId,
        };
        subjects.push(subject);
      }
      const cleanTopic = cleanName(row.topic);
      const existing = topics.find(
        (topic) => topic.subjectId === subject!.id && cleanName(topic.title) === cleanTopic,
      );
      if (existing) {
        existing.units = Math.max(1, Math.min(100, row.units));
        if (row.keyPoints.length) {
          existing.keyPoints = Array.from(new Set([...row.keyPoints, ...existing.keyPoints])).slice(0, 10);
        }
        if (row.priority === 'high') existing.highYield = true;
      } else {
        const topic: Topic = {
          id: createId('topic'),
          subjectId: subject.id,
          title: row.topic.trim().slice(0, 120),
          units: Math.max(1, Math.min(100, row.units)),
          phase: subject.phase,
          keyPoints: row.keyPoints,
          ...(row.priority === 'high' ? { highYield: true } : {}),
          targetId,
        };
        topics.push(topic);
        onTopic(topic.id);
      }
      changed += 1;
    });
    return changed;
  };

  const addTimetableRows = (
    rows: TimetableImportRow[],
    targetId: string,
    subjects: Subject[],
    topics: Topic[],
    tasks: Task[],
    today: string,
    maxDate?: string,
  ): { added: number; skipped: number } => {
    let added = 0;
    let skipped = 0;
    rows.forEach((row) => {
      if (row.duplicate || row.date < today || (maxDate ? row.date > maxDate : false)) {
        skipped += 1;
        return;
      }
      const subject = row.subject
        ? subjects.find(
          (entry) => entry.targetId === targetId && cleanName(entry.name) === cleanName(row.subject!),
        )
        : undefined;
      const topic = row.topic && subject
        ? topics.find(
          (entry) => entry.subjectId === subject.id && cleanName(entry.title) === cleanName(row.topic!),
        )
        : undefined;
      const resolvedSubject = topic
        ? subjects.find((entry) => entry.id === topic.subjectId)
        : subject;
      const existing = tasks.some((task) =>
        task.date === row.date
        && cleanName(task.title) === cleanName(row.title)
        && (row.start ? task.start === row.start : true)
        && (task.status === 'todo' || task.status === 'done'),
      );
      if (existing) {
        skipped += 1;
        return;
      }
      const start = row.start ?? nextFreeStart(row.date, row.duration, tasks);
      const task: Task = {
        id: uid('imp'),
        date: row.date,
        start,
        duration: row.duration,
        slot: slotForTime(start),
        kind: row.kind,
        title: row.title.slice(0, 90),
        subtitle: `Imported · scheduled block`,
        description: row.notes,
        targetId,
        ...(resolvedSubject ? { subjectId: resolvedSubject.id } : {}),
        ...(topic ? { topicId: topic.id } : {}),
        xp: xpForKind(row.kind, row.duration),
        status: 'todo',
        manual: true,
        notes: row.notes,
        planSignature: `import:${targetId}:${row.date}:${start}:${hashString(row.title + row.date)}`,
      };
      tasks.push(task);
      added += 1;
    });
    return { added, skipped };
  };

  const applyImport = useCallback((plan: ImportPlan, options: ImportApplyOptions): ImportApplyResult | null => {
    const prev = stateRef.current;
    const today = todayISO();
    let targets = [...prev.targets];
    let target = options.targetId
      ? targets.find((entry) => entry.id === options.targetId && !entry.archivedAt)
      : undefined;
    let createdTarget = false;

    // The GATE preset keeps its specialised scheduler. Curriculum imported
    // alongside it belongs to a new custom target so nothing collides.
    if (plan.curriculum.length > 0 && target?.preset === 'gate-cse') {
      target = undefined;
    }
    if (!target) {
      const draft = plan.target ?? {
        title: plan.curriculum.length ? 'Imported curriculum' : 'Imported plan',
        kind: 'custom' as TargetKind,
      };
      const created = createTarget({
        title: draft.title,
        kind: draft.kind,
        date: draft.date,
        dailyMinutes: 120,
      });
      targets = [...targets, created];
      target = created;
      createdTarget = true;
    }
    const activeTarget = target;

    const subjects = [...prev.subjects];
    const topics = [...prev.topics];
    const topicProgress = [...prev.topicProgress];
    const newTopicIds: string[] = [];
    const curriculumChanged = importCurriculumRows(
      plan.curriculum,
      activeTarget.id,
      subjects,
      topics,
      (topicId) => newTopicIds.push(topicId),
    );

    const tasks = prev.tasks.filter((task) => {
      if (task.status === 'done' || task.date < today) return true;
      if (task.targetId !== activeTarget.id) return true;
      if (options.mode === 'append') return true;
      if (task.planSignature?.startsWith('import:')) return false;
      if (options.mode === 'replace-future') return true;
      if (!task.manual) return false;
      return true;
    });

    const timetableResult = addTimetableRows(
      plan.timetable,
      activeTarget.id,
      subjects,
      topics,
      tasks,
      today,
      activeTarget.date,
    );
    newTopicIds.forEach((topicId) => {
      if (!topicProgress.some((entry) => entry.topicId === topicId)) {
        topicProgress.push({ topicId, confidence: 3 });
      }
    });

    if (!timetableResult.added && !curriculumChanged) {
      addToast({
        kind: 'info',
        title: 'Nothing new to import',
        message: timetableResult.skipped
          ? `${timetableResult.skipped} matching or past-dated rows were skipped.`
          : 'The file had no usable rows.',
      });
      return null;
    }

    // A new target is the one case where an import should also become the
    // focus. Importing into an existing target never steals the focus ring.
    const settings: PlannerSettings = createdTarget
      ? {
        ...prev.settings,
        primaryTargetId: activeTarget.id,
        examLabel: activeTarget.title,
        ...(activeTarget.date ? { examDate: activeTarget.date } : {}),
      }
      : prev.settings;
    const interim: AppState = {
      ...prev,
      targets,
      subjects,
      topics,
      topicProgress,
      tasks,
      settings,
    };
    setCurriculumRegistry(interim.subjects, interim.topics);
    const finalTasks = generateTasks(interim, today).tasks;
    const coverageBefore = coverageStats(prev.tasks);
    const coverageAfter = coverageStats(finalTasks);
    const modeLabel = options.mode === 'append'
      ? 'append'
      : options.mode === 'replace-future'
        ? 'replace future'
        : 'replace all';
    const report = computeRipple(
      prev.tasks,
      finalTasks,
      `Import applied to “${activeTarget.title}” (${modeLabel})`,
      coverageBefore.pct,
      coverageAfter.pct,
      coverageAfter.deferredTopicCount,
    );
    const next: AppState = {
      ...interim,
      tasks: finalTasks,
      generatedFor: today,
      lastRipple: report,
    };
    setNextState(next, prev);
    addToast({
      kind: 'ripple',
      title: 'Import applied',
      message: [
        `${plural(timetableResult.added, 'block')}`,
        `${plural(curriculumChanged, 'curriculum row')}`,
        `target: ${activeTarget.title}`,
        timetableResult.skipped ? `${timetableResult.skipped} skipped` : '',
        `mode: ${modeLabel}`,
      ].filter(Boolean).join(' · '),
    });
    return {
      added: timetableResult.added,
      skipped: timetableResult.skipped,
      curriculum: curriculumChanged,
      targetId: activeTarget.id,
      targetTitle: activeTarget.title,
    };
  }, [addToast, setNextState]);

  const updateSettings = useCallback((nextSettings: PlannerSettings) => {
    const prev = stateRef.current;
    const today = todayISO();
    const gate = prev.targets.find((target) => target.preset === 'gate-cse' && !target.archivedAt);
    const examChanged = prev.settings.examDate !== nextSettings.examDate;
    if ((gate || examChanged) && (!nextSettings.examDate || diffDays(today, nextSettings.examDate) < 1)) {
      addToast({
        kind: 'error',
        title: 'Exam date needs at least one tomorrow',
        message: 'Pick a date in the future so the plan has room to breathe.',
      });
      return;
    }
    const flowChanged = prev.settings.dailyFlow !== nextSettings.dailyFlow;
    const planningChanged =
      prev.settings.examDate !== nextSettings.examDate ||
      prev.settings.examLabel !== nextSettings.examLabel ||
      prev.settings.horizonDays !== nextSettings.horizonDays ||
      flowChanged ||
      JSON.stringify(prev.settings.weekday) !== JSON.stringify(nextSettings.weekday) ||
      JSON.stringify(prev.settings.weekend) !== JSON.stringify(nextSettings.weekend) ||
      JSON.stringify(prev.settings.heavyDays) !== JSON.stringify(nextSettings.heavyDays) ||
      prev.settings.mockCount !== nextSettings.mockCount ||
      prev.settings.mockPhaseDays !== nextSettings.mockPhaseDays ||
      prev.settings.revisionDays !== nextSettings.revisionDays;

    const primaryId = prev.settings.primaryTargetId ?? primaryTargetOf(prev)?.id;
    const targets = prev.targets.map((target) => (
      target.id === primaryId
        ? {
          ...target,
          title: nextSettings.examLabel.trim() || target.title,
          ...(target.date && nextSettings.examDate ? { date: nextSettings.examDate } : {}),
        }
        : target
    ));
    const horizon = planningEnd({ targets, settings: nextSettings }, today);
    const restDays = prev.restDays.filter((date) => date <= horizon);
    const next: AppState = { ...prev, settings: nextSettings, targets, restDays };
    if (!planningChanged) {
      setNextState(next, prev, { undo: false });
      return;
    }
    const fromDate = examChanged || flowChanged || prev.settings.horizonDays !== nextSettings.horizonDays
      ? today
      : addDays(today, 1);
    const reason = examChanged
      ? `Exam moved to ${formatDate(nextSettings.examDate, 'short')}`
      : prev.settings.horizonDays !== nextSettings.horizonDays
        ? `Rolling horizon set to ${nextSettings.horizonDays} days`
        : flowChanged
          ? nextSettings.dailyFlow
            ? 'Daily Flow schedule engaged'
            : 'Daily Flow parked — custom templates active'
          : 'Plan architecture updated';
    rebalance(next, reason, fromDate, prev);
  }, [addToast, rebalance, setNextState]);

  const finishOnboarding = useCallback((input: OnboardingInput) => {
    const next = createInitialState(
      input.name,
      input.targetDate,
      true,
      {
        preset: input.preset,
        targetTitle: input.targetTitle,
        targetDate: input.targetDate,
        targetKind: input.preset === 'gate' ? 'exam' : 'custom',
        subjectOrder: input.subjectOrder,
        prepLevel: input.prepLevel,
        dayMinutes: input.dayMinutes,
      },
    );
    setNextState(next, stateRef.current);
    addToast({
      kind: 'achievement',
      title: `Command center online, ${next.profile.name.split(' ')[0]}`,
      message: next.tasks.length
        ? `${next.tasks.length} blocks mapped for ${next.targets[0]?.title ?? 'your plan'}.`
        : `${next.targets[0]?.title ?? 'Your plan'} is ready. Import a timetable or curriculum to fill the first days.`,
      icon: 'rocket',
    });
    if (next.settings.sound) playChime('level');
    if (next.settings.confetti) fireConfetti({ count: 130 });
  }, [addToast, setNextState]);

  const resetProgress = useCallback(() => {
    const prev = stateRef.current;
    const base: AppState = {
      ...prev,
      tasks: [],
      topicProgress: prev.topics.map((topic) => ({ topicId: topic.id, confidence: 3 })),
      generatedFor: null,
      seenAchievements: [],
      lastRipple: undefined,
    };
    const tasks = generateTasks(base, todayISO()).tasks;
    const next: AppState = { ...base, tasks, generatedFor: todayISO() };
    setNextState(next, prev);
    addToast({ kind: 'info', title: 'Progress reset', message: 'A clean slate with your current targets and curriculum.' });
  }, [addToast, setNextState]);

  const resetAll = useCallback(() => {
    const next = createEmptyState('Aspirant', defaultSettings(todayISO()).examDate, false);
    stateRef.current = next;
    setState(next);
    setUndoAvailable(false);
    undoRef.current = null;
    addToast({ kind: 'info', title: 'Everything cleared', message: 'Start fresh. Your command center is ready.' });
  }, [addToast]);

  const importData = useCallback((text: string) => {
    try {
      const imported = importStateFromText(text);
      const prev = stateRef.current;
      const today = todayISO();
      let tasks = imported.tasks;
      if (imported.generatedFor !== today) {
        const marked = tasks.map((task) =>
          task.date < today && task.status === 'todo' ? { ...task, status: 'missed' as const } : task,
        );
        tasks = generateTasks({ ...imported, tasks: marked }, today).tasks;
      }
      const next = { ...imported, tasks, generatedFor: today };
      setNextState(next, prev);
      addToast({ kind: 'ripple', title: 'Planner imported', message: 'Your saved command center has been restored.' });
    } catch (error) {
      addToast({
        kind: 'error',
        title: 'Import failed',
        message: error instanceof Error ? error.message : 'That file could not be read.',
      });
    }
  }, [addToast, setNextState]);

  const undo = useCallback(() => {
    const target = undoRef.current;
    if (!target) return;
    mutatedRef.current = true;
    undoRef.current = null;
    setUndoAvailable(false);
    stateRef.current = target;
    setState(target);
    addToast({ kind: 'info', title: 'Rewound', message: 'The previous plan and progress are back.' });
  }, [addToast]);

  function checkNewDay() {
    const prev = stateRef.current;
    const today = todayISO();
    if (prev.generatedFor === today || !prev.profile.onboarded) return;
    const carried = prev.tasks.filter(
      (task) =>
        task.date < today &&
        task.status === 'todo' &&
        ['study', 'practice', 'pyq', 'revision', 'test'].includes(task.kind),
    ).length;
    const marked = prev.tasks.map((task) =>
      task.date < today && task.status === 'todo' ? { ...task, status: 'missed' as const } : task,
    );
    const interim = { ...prev, tasks: marked };
    const tasks = generateTasks(interim, today).tasks;
    const coverageBefore = coverageStats(prev.tasks);
    const coverageAfter = coverageStats(tasks);
    const report = computeRipple(
      prev.tasks,
      tasks,
      'New day — unfinished sessions re-entered the queue',
      coverageBefore.pct,
      coverageAfter.pct,
      coverageAfter.deferredTopicCount,
    );
    const next = { ...interim, tasks, generatedFor: today, lastRipple: report };
    stateRef.current = next;
    setState(next);
    addToast({
      kind: 'info',
      title: 'New day, fresh board',
      message: carried
        ? `${carried} unfinished ${carried === 1 ? 'block was' : 'blocks were'} carried forward. The oldest unresolved topic takes the next core slot; later topics slide one step.`
        : 'Yesterday is locked. The queue is clean — today is exactly what you see.',
    });
  }

  return {
    state,
    toasts,
    removeToast,
    addToast,
    undo,
    undoAvailable,
    syncStatus,
    flushSave,
    completeTask,
    uncompleteTask,
    skipTask,
    deferTask,
    addTask,
    addBlocks,
    deleteTask,
    setTaskNote,
    setTaskScore,
    updateProfile,
    setConfidence,
    toggleRestDay,
    boostSubject,
    updateSettings,
    addTarget,
    updateTarget,
    focusTarget,
    archiveTarget,
    restoreTarget,
    addSubject,
    addTopic,
    updateTopic,
    deleteTopic,
    applyImport,
    finishOnboarding,
    resetProgress,
    resetAll,
    importData,
    checkNewDay,
  };
}

export type PlannerApi = ReturnType<typeof usePlanner>;
