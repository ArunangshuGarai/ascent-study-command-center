import type { NewTaskInput, Subject, SubjectId, TaskKind, Topic } from '../types';
import { registrySubjects, registryTopics } from './curriculumRegistry';
import {
  addDays,
  clamp,
  diffDays,
  minutesFromTime,
  slotDefaultTime,
  todayISO,
  weekdayIndex,
} from './utils';

export interface ParsedBlock extends NewTaskInput {
  id: string;
  source: string;
  subjectLabel?: string;
  explanation: string;
}

export interface CommandParseResult {
  blocks: ParsedBlock[];
  warnings: string[];
}

interface SubjectAlias {
  id: SubjectId;
  aliases: string[];
}

const SUBJECT_ALIASES: SubjectAlias[] = [
  { id: 'ga', aliases: ['general aptitude', 'aptitude', 'ga'] },
  { id: 'em', aliases: ['engineering mathematics', 'engineering maths', 'engg maths', 'engg math', 'mathematics', 'maths', 'math', 'em'] },
  { id: 'dm', aliases: ['discrete mathematics', 'discrete maths', 'discrete math', 'dm'] },
  { id: 'pds', aliases: ['programming and data structures', 'programming & data structures', 'data structures', 'programming', 'c programming', 'pds', 'ds'] },
  { id: 'coa', aliases: ['computer organization', 'computer organisation', 'computer architecture', 'coa', 'organization', 'organisation'] },
  { id: 'os', aliases: ['operating systems', 'operating system', 'os'] },
  { id: 'cn', aliases: ['computer networks', 'computer network', 'networking', 'networks', 'cn'] },
  { id: 'toc', aliases: ['theory of computation', 'theory of computing', 'automata', 'toc'] },
  { id: 'dbms', aliases: ['database management systems', 'database management', 'databases', 'database', 'dbms', 'sql'] },
  { id: 'algo', aliases: ['algorithms', 'algorithm', 'algo', 'daa'] },
  { id: 'dl', aliases: ['digital logic', 'digital electronics', 'digital circuits', 'dl'] },
  { id: 'cd', aliases: ['compiler design', 'compilers', 'compiler', 'cd'] },
];

const KIND_PATTERNS: { kind: TaskKind; pattern: RegExp }[] = [
  { kind: 'rest', pattern: /\b(rest day|recovery day|rest|sleep|nap|do nothing|day off)\b/i },
  { kind: 'personal', pattern: /\b(gym|workout|work out|exercise|walk|run|jog|yoga|meditat\w*|call|phone|family|friends|dinner|lunch|breakfast|brunch|cook|cooking|clean|cleaning|laundry|errand|groceries|grocery|shopping|haircut|doctor|appointment|commute|travel|movie|game|gaming|journal|shower|temple|party|birthday)\b/i },
  { kind: 'mock', pattern: /\b(mock|full[- ]length test|grand test|simulation)\b/i },
  { kind: 'pyq', pattern: /\b(pyq|pyqs|previous year|past paper|past papers|question paper)\b/i },
  { kind: 'test', pattern: /\b(test|quiz|validation|diagnostic|assessment)\b/i },
  { kind: 'analysis', pattern: /\b(analysis|analyse|analyze|error log|mistake review|post[- ]mortem|review errors)\b/i },
  { kind: 'revision', pattern: /\b(revision|revise|recall|flashcards?|formula sheet|quick review)\b/i },
  { kind: 'practice', pattern: /\b(practice|problem set|problems|drill|exercise set|solve)\b/i },
  { kind: 'study', pattern: /\b(study|learn|read|deep work|cover|finish|chapter|lecture)\b/i },
];

const KIND_LABEL: Record<string, string> = {
  study: 'Deep work',
  pyq: 'PYQ recon',
  test: 'Validation test',
  mock: 'Mock test',
  analysis: 'Error analysis',
  revision: 'Revision',
  practice: 'Practice',
  personal: 'Personal',
  rest: 'Recovery',
};

const DEFAULT_DURATION: Record<string, number> = {
  study: 120,
  pyq: 60,
  test: 60,
  mock: 180,
  analysis: 60,
  revision: 60,
  practice: 120,
  personal: 30,
  rest: 60,
};

const DEFAULT_START: Record<string, string> = {
  study: '11:00',
  pyq: '09:30',
  test: '20:30',
  mock: '09:30',
  analysis: '16:00',
  revision: '18:30',
  practice: '16:00',
  personal: '19:00',
  rest: '21:30',
};

const WEEKDAY_LOOKUP: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasAlias(text: string, alias: string) {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(alias)}([^a-z0-9]|$)`, 'i').test(text);
}

export function detectSubject(text: string, subjects: Subject[] = registrySubjects()): SubjectId | undefined {
  let matched: { id: SubjectId; length: number } | null = null;
  const dynamic: SubjectAlias[] = subjects.map((subject) => ({
    id: subject.id,
    aliases: [subject.name.toLowerCase(), subject.short.toLowerCase()].filter((alias) => alias.length >= 2),
  }));
  for (const entry of [...dynamic, ...SUBJECT_ALIASES]) {
    if (!subjects.some((subject) => subject.id === entry.id)) continue;
    for (const alias of entry.aliases) {
      if (!hasAlias(text, alias)) continue;
      if (!matched || alias.length > matched.length) matched = { id: entry.id, length: alias.length };
    }
  }
  return matched?.id;
}

function detectTopic(text: string, subjectId?: SubjectId, topics: Topic[] = registryTopics()) {
  const prepared = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  let best: { topic: Topic; score: number } | null = null;
  topics.forEach((topic) => {
    const words = topic.title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length >= 4);
    let score = words.filter((word) => prepared.includes(word)).length;
    if (prepared.join(' ').includes(topic.title.toLowerCase())) score += 4;
    if (subjectId && topic.subjectId !== subjectId) score -= 1;
    if (best === null || score > best.score) best = { topic, score };
  });
  if (best === null) return undefined;
  const candidate = best as { topic: Topic; score: number };
  return candidate.score >= 2 ? candidate.topic : undefined;
}

function detectKind(text: string, subjectId?: SubjectId, topicTitle?: string): TaskKind {
  for (const entry of KIND_PATTERNS) {
    if (entry.pattern.test(text)) return entry.kind;
  }
  if (subjectId || topicTitle) return 'study';
  return 'study';
}

function parseClock(text: string): { start: string; matched: string } | null {
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = ampm[2] ? Number(ampm[2]) : 0;
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const suffix = ampm[3].toLowerCase();
    if (suffix === 'pm' && hour !== 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    return {
      start: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      matched: ampm[0],
    };
  }
  const twentyFour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFour) {
    return {
      start: `${twentyFour[1].padStart(2, '0')}:${twentyFour[2]}`,
      matched: twentyFour[0],
    };
  }
  const named: { pattern: RegExp; start: string }[] = [
    { pattern: /\b(noon|midday)\b/i, start: '12:00' },
    { pattern: /\bmidnight\b/i, start: '00:00' },
    { pattern: /\b(early morning|dawn)\b/i, start: '06:00' },
    { pattern: /\bmorning\b/i, start: '08:00' },
    { pattern: /\bafternoon\b/i, start: '14:00' },
    { pattern: /\bevening\b/i, start: '18:30' },
    { pattern: /\bnight\b/i, start: '21:00' },
  ];
  const hit = named.find((entry) => entry.pattern.test(text));
  if (hit) {
    const match = text.match(hit.pattern);
    return { start: hit.start, matched: match?.[0] ?? '' };
  }
  return null;
}

function parseTimeWindow(text: string): { start: string; matched: string } | null {
  const range = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (range) {
    const start = parseClock(`${range[1]}${range[2] ? `:${range[2]}` : ''}${range[3] ?? ''}`);
    if (start) return start;
  }
  return parseClock(text);
}

function parseDate(text: string, today: string): { date: string; matched: string; explicit: boolean } {
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const month = String(Number(iso[2])).padStart(2, '0');
    const day = String(Number(iso[3])).padStart(2, '0');
    return { date: `${iso[1]}-${month}-${day}`, matched: iso[0], explicit: true };
  }
  const relative = text.match(/\bin\s+(\d{1,2})\s+(day|days|week|weeks)\b/i);
  if (relative) {
    const count = Number(relative[1]) * (relative[2].toLowerCase().startsWith('week') ? 7 : 1);
    return { date: addDays(today, count), matched: relative[0], explicit: true };
  }
  if (/\bday after tomorrow\b/i.test(text)) {
    return { date: addDays(today, 2), matched: 'day after tomorrow', explicit: true };
  }
  if (/\btomorrow\b/i.test(text)) {
    return { date: addDays(today, 1), matched: 'tomorrow', explicit: true };
  }
  if (/\btoday\b/i.test(text)) {
    return { date: today, matched: 'today', explicit: true };
  }
  if (/\btonight\b/i.test(text)) {
    return { date: today, matched: 'tonight', explicit: true };
  }
  const weekday = text.match(/\b(next|this|coming)?\s*(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/i);
  if (weekday) {
    const target = WEEKDAY_LOOKUP[weekday[2].toLowerCase()];
    const current = weekdayIndex(today);
    let delta = (target - current + 7) % 7;
    if (delta === 0) delta = 7;
    if ((weekday[1] || '').toLowerCase() === 'next' && delta < 7) delta += 7;
    return { date: addDays(today, delta), matched: weekday[0].trim(), explicit: true };
  }
  return { date: today, matched: '', explicit: false };
}

function parseDuration(text: string): { minutes: number; matched: string } | null {
  if (/\bhalf an hour\b/i.test(text)) return { minutes: 30, matched: 'half an hour' };
  if (/\ban hour\b/i.test(text)) return { minutes: 60, matched: 'an hour' };
  const hours = text.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  if (hours) {
    return { minutes: Math.round(Number(hours[1]) * 60), matched: hours[0] };
  }
  const minutes = text.match(/\b(\d+)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (minutes) {
    return { minutes: Number(minutes[1]), matched: minutes[0] };
  }
  return null;
}

interface Recurrence {
  type: 'daily' | 'weekday' | 'weekly';
  weekday?: number;
  count: number;
  label: string;
}

function parseRecurrence(text: string): Recurrence | null {
  const every = text.match(/\bevery\s+(day|weekday|weekdays|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)
    ?? (/\bdaily\b/i.test(text) ? ['daily', 'day'] as RegExpMatchArray : null);
  if (!every) return null;

  let count = 7;
  const explicit = text.match(/\bfor\s+(\d{1,2})\s+(day|days|week|weeks|month|months)\b/i);
  if (explicit) {
    const amount = Number(explicit[1]);
    const unit = explicit[2].toLowerCase();
    if (unit.startsWith('day')) count = amount;
    else if (unit.startsWith('week')) count = amount * 7;
    else count = amount * 30;
  } else {
    count = /\bweekday/i.test(every[0]) ? 10 : 7;
  }
  count = clamp(count, 1, 60);

  const target = every[1].toLowerCase();
  if (/\bweekday/.test(target)) {
    // "Every weekday for 2 weeks" means ten weekday sessions, not fourteen
    // calendar days. Convert the span to weekdays before expanding.
    const sessions = explicit
      ? explicit[2].toLowerCase().startsWith('week')
        ? Number(explicit[1]) * 5
        : explicit[2].toLowerCase().startsWith('month')
          ? Number(explicit[1]) * 22
          : count
      : count;
    const bounded = clamp(sessions, 1, 60);
    return { type: 'weekday', count: bounded, label: `every weekday · ${bounded} sessions` };
  }
  if (WEEKDAY_LOOKUP[target] !== undefined) {
    const weeklyCount = explicit ? Math.max(1, Math.ceil(count / 7)) : 8;
    return {
      type: 'weekly',
      weekday: WEEKDAY_LOOKUP[target],
      count: clamp(weeklyCount, 1, 26),
      label: `every ${target} · ${clamp(weeklyCount, 1, 26)} sessions`,
    };
  }
  return { type: 'daily', count, label: `every day · ${count} sessions` };
}

function expandDates(base: string, recurrence: Recurrence | null, examDate: string, today: string) {
  if (!recurrence) return [base];
  const dates: string[] = [];
  let cursor = base;
  let guard = 0;
  while (dates.length < recurrence.count && guard < 200) {
    guard += 1;
    if (cursor > examDate) break;
    const weekday = weekdayIndex(cursor);
    const matches = recurrence.type === 'daily'
      || (recurrence.type === 'weekday' && weekday >= 1 && weekday <= 5)
      || (recurrence.type === 'weekly' && weekday === recurrence.weekday);
    if (matches && cursor >= today) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates.length ? dates : [base];
}

function stripNoise(text: string, matched: string[]) {
  let result = text;
  matched.forEach((fragment) => {
    if (!fragment) return;
    result = result.replace(new RegExp(`\\b${escapeRe(fragment)}\\b`, 'ig'), ' ');
  });
  result = result
    .replace(/^\s*(please\s+)?(add|create|schedule|plan|map|put|remind me to|i need to|block out)\s+/i, '')
    .replace(/\b(for|on|at|by|from|to|in)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return result;
}

function titleCase(value: string) {
  return value
    .replace(/\b(ga|em|dm|pds|coa|os|cn|toc|dbms|algo|dl|cd|pyq|pyqs)\b/gi, (match) => match.toUpperCase())
    .replace(/^[a-z]/, (match) => match.toUpperCase());
}

function nextUsableStart(today: string, requestedDate: string, start: string) {
  if (requestedDate !== today) return { date: requestedDate, start, shifted: false };
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (minutesFromTime(start) > nowMinutes + 10) return { date: requestedDate, start, shifted: false };
  const next = Math.ceil((nowMinutes + 30) / 15) * 15;
  if (next <= 21 * 60 + 30) {
    const hours = Math.floor(next / 60);
    const mins = next % 60;
    return {
      date: requestedDate,
      start: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
      shifted: true,
    };
  }
  return { date: addDays(today, 1), start: '09:00', shifted: true };
}

export function parseCommandLine(raw: string, examDate: string, referenceDate = todayISO()): CommandParseResult {
  const warnings: string[] = [];
  const blocks: ParsedBlock[] = [];
  const source = raw.trim();
  if (!source) return { blocks, warnings };

  const subjectId = detectSubject(source);
  const topic = detectTopic(source, subjectId);
  const baseSubject = subjectId ?? topic?.subjectId;
  const kind = detectKind(source, baseSubject, topic?.title);

  const dateInfo = parseDate(source, referenceDate);
  const timeInfo = parseTimeWindow(source);
  const durationInfo = parseDuration(source);
  const recurrence = parseRecurrence(source);

  const duration = clamp(durationInfo?.minutes ?? DEFAULT_DURATION[kind] ?? 45, 5, 360);
  let start = timeInfo?.start ?? DEFAULT_START[kind] ?? slotDefaultTime('morning');
  let date = dateInfo.date;
  if (date > examDate) {
    warnings.push(`“${source}” falls after exam day — pulled back to ${examDate}.`);
    date = examDate;
  }
  if (date < referenceDate) {
    warnings.push(`“${source}” was in the past — moved to today.`);
    date = referenceDate;
  }

  const matchedFragments = [
    dateInfo.matched,
    timeInfo?.matched ?? '',
    durationInfo?.matched ?? '',
    recurrence ? recurrence.label.split(' · ')[0] : '',
  ];
  let title = stripNoise(source, matchedFragments)
    .replace(/[.;,]+$/g, '')
    .trim();
  title = title.replace(/\b(?:every\s+(?:day|weekday|weekdays|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|daily)\b/gi, '').trim();
  title = title.replace(/\bfor\s+\d{1,2}\s+(?:days?|weeks?|months?)\b/gi, '').trim();
  title = title.replace(/\s+/g, ' ').replace(/^[-,:;]+|[-,:;]+$/g, '').trim();
  title = title.replace(/^(?:at|on|by|from|to|in|for|around)\s+/i, '').trim();
  title = title.replace(/\s+\b(?:at|on|by|from|to|in|for|around|starting)$/i, '').trim();

  const subject = baseSubject ? registrySubjects().find((entry) => entry.id === baseSubject) : undefined;
  if (!title) {
    title = topic
      ? topic.title
      : subject
        ? `${KIND_LABEL[kind] ?? 'Deep work'} · ${subject.short}`
        : KIND_LABEL[kind] ?? 'Planned block';
    warnings.push('No clear title found — I named it from the block type and subject. You can edit it after adding.');
  }
  title = titleCase(title).slice(0, 90);

  const shifted = nextUsableStart(referenceDate, date, start);
  if (shifted.shifted) {
    warnings.push(
      shifted.date !== date
        ? 'That window has already passed — moved to tomorrow at 09:00.'
        : `That time has passed today — using the next open window at ${shifted.start}.`,
    );
  }
  date = shifted.date;
  start = shifted.start;

  if (date > examDate) {
    warnings.push('The shifted block would land after exam day. Move your exam date or choose another time.');
    return { blocks, warnings };
  }

  const dates = expandDates(date, recurrence, examDate, referenceDate);
  if (recurrence && dates.length < recurrence.count) {
    warnings.push(`Only ${dates.length} of ${recurrence.count} recurring sessions fit before exam day.`);
  }

  const subjectLabel = subject
    ? subject.name
    : topic
      ? 'Curriculum topic'
      : 'Personal plan';

  dates.forEach((taskDate, index) => {
    blocks.push({
      id: `cmd-${Date.parse(`${taskDate}T${start}:00`) || Date.now()}-${index}`,
      date: taskDate,
      start,
      duration,
      kind,
      title,
      subjectId: baseSubject,
      notes: source,
      source,
      subjectLabel: topic ? `${subjectLabel} · ${topic.title}` : subjectLabel,
      explanation: [
        KIND_LABEL[kind] ?? 'Block',
        subject ? subject.short : null,
        topic ? topic.title : null,
        recurrence ? recurrence.label : null,
      ].filter(Boolean).join(' · '),
    });
  });

  warnings.unshift(
    ...(recurrence
      ? [`Expanded into ${blocks.length} session${blocks.length === 1 ? '' : 's'} across the calendar.`]
      : []),
  );

  return { blocks, warnings };
}

export function parseCommand(text: string, examDate: string, referenceDate = todayISO()): CommandParseResult {
  const lines = text
    .split(/\n|;/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);

  if (!lines.length) return { blocks: [], warnings: [] };

  const blocks: ParsedBlock[] = [];
  const warnings: string[] = [];
  lines.forEach((line) => {
    const result = parseCommandLine(line, examDate, referenceDate);
    if (result.blocks.length) blocks.push(...result.blocks);
    warnings.push(...result.warnings);
  });

  if (blocks.length > 60) {
    warnings.push('That is a lot of blocks — I kept the first 60 so the board stays readable.');
    return { blocks: blocks.slice(0, 60), warnings };
  }
  return { blocks, warnings };
}

export function dateOffsetLabel(date: string, referenceDate = todayISO()) {
  const delta = diffDays(referenceDate, date);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  return `In ${delta} days`;
}
