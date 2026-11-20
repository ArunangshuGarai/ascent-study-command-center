import type {
  AppState,
  RippleReport,
  SlotId,
  SubjectId,
  Task,
  Topic,
} from '../types';
import {
  ACHIEVEMENTS,
  LEVELS,
  TIME_SLOTS,
} from '../data/curriculum';
import {
  lookupSubject,
  lookupTopic,
  registrySubjects,
  registryTopics,
  registryTotalUnits,
} from './curriculumRegistry';

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISO(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISO(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = parseISO(iso);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function rangeInclusive(from: string, to: string): string[] {
  if (diffDays(from, to) < 0) return [];
  const out: string[] = [];
  let cursor = from;
  while (diffDays(cursor, to) >= 0) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function weekdayIndex(iso: string): number {
  return parseISO(iso).getDay();
}

export function startOfWeek(iso: string): string {
  const day = weekdayIndex(iso);
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(iso, offset);
}

export function endOfWeek(iso: string): string {
  return addDays(startOfWeek(iso), 6);
}

export function defaultExamDate(): string {
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), 1, 7, 12);
  const target = diffDays(todayISO(), toISO(thisYear)) >= 21
    ? thisYear
    : new Date(now.getFullYear() + 1, 1, 7, 12);
  return toISO(target);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDate(iso: string, style: 'long' | 'medium' | 'short' | 'day' = 'medium'): string {
  const date = parseISO(iso);
  if (style === 'long') {
    return `${WEEKDAYS_LONG[date.getDay()]}, ${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
  }
  if (style === 'short') return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  if (style === 'day') return WEEKDAYS[date.getDay()];
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatMonth(iso: string): string {
  return `${MONTHS_LONG[parseISO(iso).getMonth()]} ${parseISO(iso).getFullYear()}`;
}

export function monthShort(iso: string): string {
  return MONTHS[parseISO(iso).getMonth()];
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS[parseISO(iso).getDay()];
}

export function formatClock(start: string): string {
  const [hourRaw, minute] = start.split(':').map(Number);
  const hour = hourRaw % 12 || 12;
  const suffix = hourRaw >= 12 ? 'pm' : 'am';
  return `${hour}:${pad(minute)} ${suffix}`;
}

export function minutesFromTime(start: string): number {
  const [hour, minute] = start.split(':').map(Number);
  return hour * 60 + minute;
}

export function timeFromMinutes(total: number): string {
  const minutes = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function endTime(start: string, duration: number): string {
  return timeFromMinutes(minutesFromTime(start) + duration);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

export function hoursLabel(minutes: number): string {
  const value = minutes / 60;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}h`;
}

export function slotForTime(start: string): SlotId {
  const minutes = minutesFromTime(start);
  if (minutes < 8 * 60) return 'dawn';
  if (minutes < 11 * 60) return 'morning';
  if (minutes < 14 * 60) return 'midday';
  if (minutes < 17 * 60) return 'afternoon';
  if (minutes < 20 * 60) return 'evening';
  return 'night';
}

export function slotMeta(slot: SlotId) {
  return TIME_SLOTS.find((item) => item.id === slot) ?? TIME_SLOTS[0];
}

export function slotDefaultTime(slot: SlotId): string {
  return slotMeta(slot).defaultStart;
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function uid(prefix = 'task'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function subjectById(id?: SubjectId) {
  return lookupSubject(id);
}

export function topicById(id?: string) {
  return lookupTopic(id);
}

export function completedTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.status === 'done');
}

export function taskXp(tasks: Task[]): number {
  return completedTasks(tasks).reduce((sum, task) => sum + task.xp, 0);
}

export function levelInfo(xp: number) {
  let index = 0;
  LEVELS.forEach((level, i) => {
    if (xp >= level.min) index = i;
  });
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  const floor = current.min;
  const ceiling = next?.min ?? current.min + 1500;
  const progress = next ? clamp((xp - floor) / (ceiling - floor), 0, 1) : 1;
  return {
    index: index + 1,
    name: current.name,
    nextName: next?.name ?? 'Maximum rank',
    xp,
    nextAt: next?.min ?? null,
    toNext: next ? Math.max(0, next.min - xp) : 0,
    progress,
  };
}

/**
 * A 45-minute generated session maps to one topic unit. A Daily Flow core dive
 * is a two-hour block aimed at a single topic, so it carries `coversTopic` and
 * credits every unit of that topic instead of just one.
 */
function topicUnitKeys(task: Task): string[] {
  if (!task.topicId) return [];
  if (task.coversTopic) {
    const units = lookupTopic(task.topicId)?.units ?? 1;
    return Array.from({ length: units }, (_, index) => `${task.topicId}:${index + 1}`);
  }
  return [`${task.topicId}:${task.sessionNo ?? 1}`];
}

export function topicUnitsCovered(tasks: Task[]): Set<string> {
  const covered = new Set<string>();
  tasks.forEach((task) => {
    if (task.kind !== 'study') return;
    if (!task.topicId) return;
    if (task.status === 'skipped' || task.status === 'missed') return;
    topicUnitKeys(task).forEach((key) => covered.add(key));
  });
  return covered;
}

export function topicUnitsDone(tasks: Task[]): Map<string, number> {
  const map = new Map<string, number>();
  tasks.forEach((task) => {
    if (task.status !== 'done' || task.kind !== 'study' || !task.topicId) return;
    const numbers = map.get(task.topicId) ?? 0;
    map.set(task.topicId, numbers + topicUnitKeys(task).length);
  });
  return map;
}

export function coverageStats(tasks: Task[]) {
  const subjects = registrySubjects();
  const topics = registryTopics();
  const totalUnits = registryTotalUnits();
  const covered = topicUnitsCovered(tasks);
  const coveredBySubject = new Map<SubjectId, number>();
  covered.forEach((key) => {
    const topicId = key.split(':')[0];
    const topic = lookupTopic(topicId);
    if (!topic) return;
    coveredBySubject.set(topic.subjectId, (coveredBySubject.get(topic.subjectId) ?? 0) + 1);
  });
  const perSubject = subjects.map((subject) => {
    const total = topics.filter((topic) => topic.subjectId === subject.id).reduce(
      (sum, topic) => sum + topic.units,
      0,
    );
    const coveredUnits = coveredBySubject.get(subject.id) ?? 0;
    return {
      subject,
      total,
      covered: Math.min(total, coveredUnits),
      pct: total ? Math.round((Math.min(total, coveredUnits) / total) * 100) : 0,
    };
  });
  const coveredUnits = Math.min(totalUnits, covered.size);
  const deferred = topics.filter((topic) => {
    const units = Array.from(covered).filter((key) => key.startsWith(`${topic.id}:`)).length;
    return units < topic.units;
  });
  return {
    coveredUnits,
    totalUnits,
    pct: totalUnits ? Math.round((coveredUnits / totalUnits) * 100) : 0,
    perSubject,
    deferredTopics: deferred,
    deferredTopicCount: deferred.length,
  };
}

export function deferredTopics(tasks: Task[]): Topic[] {
  return coverageStats(tasks).deferredTopics;
}

export function subjectMastery(tasks: Task[]) {
  const done = topicUnitsDone(tasks);
  return registrySubjects().map((subject) => {
    const subjectTopics = registryTopics().filter((topic) => topic.subjectId === subject.id);
    const total = subjectTopics.reduce((sum, topic) => sum + topic.units, 0);
    const unitsDone = subjectTopics.reduce((sum, topic) => sum + Math.min(topic.units, done.get(topic.id) ?? 0), 0);
    return {
      subject,
      total,
      done: unitsDone,
      pct: total ? Math.round((unitsDone / total) * 100) : 0,
    };
  });
}

export function streakInfo(tasks: Task[]) {
  const days = new Set(
    completedTasks(tasks)
      .map((task) => (task.completedAt ? task.completedAt.slice(0, 10) : task.date))
      .filter(Boolean),
  );
  const sorted = Array.from(days).sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  sorted.forEach((day) => {
    if (previous && diffDays(previous, day) === 1) run += 1;
    else run = 1;
    best = Math.max(best, run);
    previous = day;
  });
  const today = todayISO();
  let current = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  if (days.has(cursor)) {
    current = 1;
    while (days.has(addDays(cursor, -1))) {
      cursor = addDays(cursor, -1);
      current += 1;
    }
  }
  return { current, best, studyDays: days.size };
}

export function computeRipple(
  before: Task[],
  after: Task[],
  reason: string,
  beforeCoverage: number,
  afterCoverage: number,
  deferredCount: number,
): RippleReport {
  const beforeMap = new Map<string, Task>();
  before.forEach((task) => {
    if (task.kind !== 'study' || !task.topicId) return;
    if (task.status === 'skipped' || task.status === 'missed') return;
    beforeMap.set(`${task.topicId}:${task.sessionNo ?? 1}`, task);
  });
  const afterMap = new Map<string, Task>();
  after.forEach((task) => {
    if (task.kind !== 'study' || !task.topicId) return;
    if (task.status === 'skipped' || task.status === 'missed') return;
    afterMap.set(`${task.topicId}:${task.sessionNo ?? 1}`, task);
  });
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  let sessionsMoved = 0;
  let daysShifted = 0;
  const topics = new Set<string>();
  const days = new Set<string>();
  keys.forEach((key) => {
    const oldTask = beforeMap.get(key);
    const newTask = afterMap.get(key);
    if (!oldTask || !newTask || oldTask.date !== newTask.date || oldTask.start !== newTask.start) {
      sessionsMoved += 1;
      const topicId = key.split(':')[0];
      topics.add(topicId);
      if (oldTask) days.add(oldTask.date);
      if (newTask) days.add(newTask.date);
      if (oldTask && newTask) {
        daysShifted = Math.max(daysShifted, Math.abs(diffDays(oldTask.date, newTask.date)));
      }
    }
  });
  return {
    reason,
    at: new Date().toISOString(),
    sessionsMoved,
    topicsMoved: topics.size,
    daysAffected: days.size,
    coverageBefore: Math.round(beforeCoverage),
    coverageAfter: Math.round(afterCoverage),
    deferredTopics: deferredCount,
    daysShifted,
  };
}

export function achievementsUnlocked(state: AppState): string[] {
  const done = completedTasks(state.tasks);
  const streak = streakInfo(state.tasks);
  const level = levelInfo(taskXp(state.tasks));
  const mastery = subjectMastery(state.tasks);
  const studySessions = done.filter((task) => task.kind === 'study').length;
  const tests = done.filter((task) => task.kind === 'test').length;
  const mocks = done.filter((task) => task.kind === 'mock').length;
  const unlocked: string[] = [];
  if (done.length >= 1) unlocked.push('first-light');
  if (studySessions >= 10) unlocked.push('deep-ten');
  if (tests >= 10) unlocked.push('test-pilot');
  if (streak.current >= 3 || streak.best >= 3) unlocked.push('streak-3');
  if (streak.current >= 7 || streak.best >= 7) unlocked.push('streak-7');
  if (streak.current >= 14 || streak.best >= 14) unlocked.push('streak-14');
  if (done.length >= 50) unlocked.push('half-century');
  if (done.length >= 100) unlocked.push('century');
  if (mastery.some((entry) => entry.pct >= 50)) unlocked.push('subject-adept');
  if (mocks >= 1) unlocked.push('mock-slayer');
  if (mocks >= state.settings.mockCount && mocks >= 1) unlocked.push('mock-army');
  if (level.index >= LEVELS.length) unlocked.push('titan');
  return ACHIEVEMENTS.filter((achievement) => unlocked.includes(achievement.id)).map((a) => a.id);
}

export function streakCalendar(state: AppState): { date: string; intensity: number; planned: number }[] {
  const exam = state.settings.examDate;
  const start = addDays(todayISO(), -28);
  const end = diffDays(todayISO(), exam) > 90 ? addDays(todayISO(), 62) : exam;
  return rangeInclusive(start, end).map((date) => {
    const dayTasks = state.tasks.filter((task) => task.date === date);
    const done = dayTasks.filter((task) => task.status === 'done').length;
    const planned = dayTasks.filter((task) => task.kind !== 'rest').length;
    return { date, intensity: done, planned };
  });
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createICS(state: AppState): string {
  const localStamp = (date: string, start: string, duration: number) => {
    const [y, m, d] = date.split('-');
    const [h, min] = start.split(':');
    const startDate = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
    const endDate = new Date(startDate.getTime() + duration * 60_000);
    const fmt = (value: Date) =>
      `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}T${pad(value.getHours())}${pad(value.getMinutes())}00`;
    return { start: fmt(startDate), end: fmt(endDate) };
  };
  const escape = (value: string) =>
    value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ASCENT//Study Command Center//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  state.tasks
    .filter((task) => task.status !== 'skipped' && task.status !== 'missed')
    .forEach((task) => {
      const stamps = localStamp(task.date, task.start, task.duration);
      const subject = task.subjectId ? lookupSubject(task.subjectId)?.name : '';
      lines.push(
        'BEGIN:VEVENT',
        `UID:${task.id}@ascent.study`,
        `DTSTAMP:${stamps.start}`,
        `DTSTART:${stamps.start}`,
        `DTEND:${stamps.end}`,
        `SUMMARY:${escape(`${task.kind === 'study' ? 'Study' : task.title} — ${task.title}`)}`,
        `DESCRIPTION:${escape(`${subject ? `${subject}. ` : ''}${task.description ?? ''} · ${task.xp} XP`)}`,
        `CATEGORIES:${escape(task.kind.toUpperCase())}`,
        'END:VEVENT',
      );
    });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function relativeDayLabel(iso: string): string {
  const difference = diffDays(todayISO(), iso);
  if (difference === 0) return 'Today';
  if (difference === 1) return 'Tomorrow';
  if (difference === -1) return 'Yesterday';
  if (difference > 1 && difference <= 6) return `In ${difference} days`;
  if (difference < -1) return `${Math.abs(difference)} days ago`;
  return formatDate(iso, 'short');
}

export function plural(count: number, singular: string, pluralWord?: string): string {
  return `${count} ${count === 1 ? singular : pluralWord ?? `${singular}s`}`;
}

export function fireConfetti(options?: { colors?: string[]; count?: number }) {
  if (typeof document === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const context = canvas.getContext('2d');
  if (!context) return;
  const colors = options?.colors ?? ['#D8FF6A', '#97A7FF', '#C8A8FF', '#63E6CE', '#FFC46B', '#FF8FA4'];
  const count = options?.count ?? 110;
  const particles = Array.from({ length: count }).map(() => ({
    x: window.innerWidth / 2 + (Math.random() - 0.5) * 260,
    y: window.innerHeight * 0.38 + (Math.random() - 0.5) * 80,
    vx: (Math.random() - 0.5) * 13,
    vy: Math.random() * -13 - 4,
    gravity: 0.24 + Math.random() * 0.14,
    size: 4 + Math.random() * 8,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.28,
    color: colors[Math.floor(Math.random() * colors.length)],
    opacity: 1,
  }));
  let frame = 0;
  const started = performance.now();
  const render = (now: number) => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += particle.gravity;
      particle.vx *= 0.992;
      particle.rotation += particle.spin;
      particle.opacity = Math.max(0, 1 - Math.max(0, now - started - 1100) / 900);
      context.save();
      context.globalAlpha = particle.opacity;
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;
      context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
      context.restore();
    });
    frame += 1;
    if (now - started < 2100) requestAnimationFrame(render);
    else canvas.remove();
  };
  requestAnimationFrame(render);
}

let audioContext: AudioContext | null = null;

export function playChime(kind: 'success' | 'level' | 'soft' = 'success') {
  try {
    if (!audioContext) {
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext = new AudioCtor();
    }
    if (audioContext.state === 'suspended') void audioContext.resume();
    const now = audioContext.currentTime;
    const notes = kind === 'level' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'soft' ? [659.25] : [523.25, 783.99];
    notes.forEach((frequency, index) => {
      const oscillator = audioContext!.createOscillator();
      const gain = audioContext!.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.11, now + index * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.45);
      oscillator.connect(gain);
      gain.connect(audioContext!.destination);
      oscillator.start(now + index * 0.09);
      oscillator.stop(now + index * 0.09 + 0.5);
    });
  } catch {
    // Sound is a progressive enhancement only.
  }
}

export function makeWeekLabel(date: string): string {
  const monday = startOfWeek(date);
  const sunday = endOfWeek(date);
  return `${formatDate(monday, 'short')} – ${formatDate(sunday, 'short')}`;
}

export function sumMinutes(tasks: Task[]): number {
  return tasks.reduce((sum, task) => sum + task.duration, 0);
}

export function subjectListLabel(ids: SubjectId[]): string {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return 'Mixed';
  const names = unique.map((id) => lookupSubject(id)?.name ?? id);
  const shorts = unique.map((id) => lookupSubject(id)?.short ?? id);
  if (unique.length === 1) return names[0];
  if (unique.length === 2) return `${shorts[0]} + ${shorts[1]}`;
  return `${shorts.slice(0, 2).join(' + ')} +${unique.length - 2}`;
}

export function getStreakEmoji(count: number): string {
  if (count >= 14) return '🌋';
  if (count >= 7) return '🔥';
  if (count >= 3) return '⚡';
  return '✦';
}

export function daysToExam(examDate: string): number {
  return Math.max(0, diffDays(todayISO(), examDate));
}
