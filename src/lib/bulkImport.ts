import type {
  Subject,
  Task,
  TaskKind,
  TargetKind,
  Topic,
} from '../types';

export type ImportFormat = 'timetable' | 'curriculum' | 'combined';
export type ImportApplyMode = 'append' | 'replace-future' | 'replace-all';
export type ImportIssueSeverity = 'error' | 'warning';

export interface ImportIssue {
  row: number;
  field?: string;
  message: string;
  severity: ImportIssueSeverity;
}

export interface TimetableImportRow {
  row: number;
  date: string;
  start?: string;
  duration: number;
  title: string;
  kind: TaskKind;
  subject?: string;
  topic?: string;
  notes?: string;
  duplicate?: boolean;
}

export interface CurriculumImportRow {
  row: number;
  subject: string;
  topic: string;
  units: number;
  priority: 'low' | 'normal' | 'high';
  keyPoints: string[];
  duplicate?: boolean;
}

export interface ImportTargetDraft {
  title: string;
  kind: TargetKind;
  date?: string;
}

export interface ImportPlan {
  format: ImportFormat;
  target?: ImportTargetDraft;
  timetable: TimetableImportRow[];
  curriculum: CurriculumImportRow[];
  issues: ImportIssue[];
  canApply: boolean;
}

export const TIMETABLE_TEMPLATE = `date,start,duration,title,kind,subject,topic,notes
2026-11-18,09:30,90,Linear Algebra — Matrices,study,Mathematics,Matrices,"Lecture + 20 solved sums"
2026-11-18,18:30,45,Flashcard recall,revision,Mathematics,,
2026-11-19,,60,Mock Test #1,mock,,,"Full syllabus, timed"
2026-11-20,07:30,30,Morning walk,personal,,,
`;

export const CURRICULUM_TEMPLATE = `subject,topic,units,priority,key_points
Mathematics,Matrices,2,high,"determinants; rank; inverse"
Mathematics,Probability,3,normal,"Bayes; random variables; distributions"
Physics,Waves,2,normal,"standing waves; Doppler"
`;

const KIND_ALIASES: Record<string, TaskKind> = {
  study: 'study',
  learn: 'study',
  learning: 'study',
  deepwork: 'study',
  'deep work': 'study',
  core: 'study',
  revision: 'revision',
  revise: 'revision',
  recall: 'revision',
  review: 'revision',
  practice: 'practice',
  problems: 'practice',
  problem: 'practice',
  pyq: 'pyq',
  'pyq recon': 'pyq',
  'past paper': 'pyq',
  'previous year': 'pyq',
  test: 'test',
  quiz: 'test',
  validation: 'test',
  mock: 'mock',
  'mock exam': 'mock',
  'full mock': 'mock',
  analysis: 'analysis',
  autopsy: 'analysis',
  personal: 'personal',
  life: 'personal',
  gym: 'personal',
  rest: 'rest',
  recovery: 'rest',
  exam: 'exam',
  showtime: 'exam',
};

const PRIORITY_ALIASES: Record<string, 'low' | 'normal' | 'high'> = {
  low: 'low',
  l: 'low',
  minor: 'low',
  0: 'low',
  normal: 'normal',
  medium: 'normal',
  med: 'normal',
  m: 'normal',
  default: 'normal',
  1: 'normal',
  high: 'high',
  h: 'high',
  critical: 'high',
  must: 'high',
  2: 'high',
};

const HEADER_ALIASES: Record<string, string> = {
  date: 'date',
  day: 'date',
  scheduledate: 'date',
  schedule_date: 'date',
  start: 'start',
  starttime: 'start',
  start_time: 'start',
  time: 'start',
  duration: 'duration',
  minutes: 'duration',
  durationminutes: 'duration',
  duration_minutes: 'duration',
  length: 'duration',
  title: 'title',
  task: 'title',
  name: 'title',
  activity: 'title',
  kind: 'kind',
  type: 'kind',
  category: 'kind',
  subject: 'subject',
  area: 'subject',
  paper: 'subject',
  topic: 'topic',
  chapter: 'topic',
  unit: 'topic',
  notes: 'notes',
  note: 'notes',
  description: 'notes',
  details: 'notes',
  units: 'units',
  sessions: 'units',
  sittings: 'units',
  sessioncount: 'units',
  priority: 'priority',
  importance: 'priority',
  keypoints: 'key_points',
  key_points: 'key_points',
  keywords: 'key_points',
  points: 'key_points',
};

export interface ParseContext {
  existingTasks?: Task[];
  existingSubjects?: Subject[];
  existingTopics?: Topic[];
}

function normalizeHeader(value: string): string {
  const clean = value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return HEADER_ALIASES[clean.replace(/_/g, '')] ?? HEADER_ALIASES[clean] ?? clean;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}

function normalizeDate(value: string): { date?: string; issue?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { issue: 'Date is required.' };
  const normalized = /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(trimmed)
    ? trimmed.split('/').map((part, index) => (index === 0 ? part : part.padStart(2, '0'))).join('-')
    : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { issue: 'Use an ISO date: YYYY-MM-DD.' };
  }
  const date = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    return { issue: 'That date does not exist.' };
  }
  return { date: normalized };
}

function normalizeStart(value: string): { start?: string; issue?: string } {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) {
    return { issue: 'Use a 24-hour time: HH:MM.' };
  }
  const [hourRaw, minuteRaw] = trimmed.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (hour > 23 || minute > 59) return { issue: 'That time does not exist.' };
  return { start: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function normalizeKind(value: string): { kind: TaskKind; warning?: string } {
  const clean = value.trim().toLowerCase();
  if (!clean) return { kind: 'study' };
  const kind = KIND_ALIASES[clean] ?? KIND_ALIASES[clean.replace(/_/g, ' ')];
  if (kind) return { kind };
  return { kind: 'study', warning: `Unknown kind “${value}”. Imported as study.` };
}

function normalizePriority(value: string): 'low' | 'normal' | 'high' {
  return PRIORITY_ALIASES[value.trim().toLowerCase()] ?? 'normal';
}

function tasksMatch(
  row: TimetableImportRow,
  tasks: Task[],
): boolean {
  const title = normalizeText(row.title);
  return tasks.some((task) =>
    task.date === row.date
    && normalizeText(task.title) === title
    && (!row.start || task.start === row.start)
    && (task.status === 'todo' || task.status === 'done'),
  );
}

function topicExists(
  row: CurriculumImportRow,
  subjects: Subject[],
  topics: Topic[],
): boolean {
  const subject = subjects.find(
    (entry) => normalizeText(entry.name) === normalizeText(row.subject),
  );
  if (!subject) return false;
  return topics.some(
    (topic) => topic.subjectId === subject.id && normalizeText(topic.title) === normalizeText(row.topic),
  );
}

interface ImportRecord {
  values: Record<string, string>;
  row: number;
}

interface ParsedRows {
  timetable: TimetableImportRow[];
  curriculum: CurriculumImportRow[];
  issues: ImportIssue[];
}

function parseTimetableRecords(
  entries: ImportRecord[],
  context: ParseContext,
): ParsedRows {
  const timetable: TimetableImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  const existing = context.existingTasks ?? [];

  entries.forEach(({ values: record, row }) => {
    if (Object.values(record).every((value) => !value.trim())) return;
    const title = (record.title ?? '').trim();
    const dateResult = normalizeDate(record.date ?? '');
    const startResult = normalizeStart(record.start ?? '');
    const kindResult = normalizeKind(record.kind ?? '');
    const durationRaw = (record.duration ?? '').trim();
    const duration = durationRaw ? Number(durationRaw) : 45;
    let valid = true;

    if (!title) {
      issues.push({ row, field: 'title', message: 'Title is required.', severity: 'error' });
      valid = false;
    }
    if (dateResult.issue) {
      issues.push({ row, field: 'date', message: dateResult.issue, severity: 'error' });
      valid = false;
    }
    if (startResult.issue) {
      issues.push({ row, field: 'start', message: startResult.issue, severity: 'error' });
      valid = false;
    }
    if (!Number.isFinite(duration) || duration < 5 || duration > 600) {
      issues.push({ row, field: 'duration', message: 'Duration must be between 5 and 600 minutes.', severity: 'error' });
      valid = false;
    }
    if (kindResult.warning) {
      issues.push({ row, field: 'kind', message: kindResult.warning, severity: 'warning' });
    }
    if (!valid || !dateResult.date) return;

    const rowValue: TimetableImportRow = {
      row,
      date: dateResult.date,
      ...(startResult.start ? { start: startResult.start } : {}),
      duration: Math.round(duration),
      title,
      kind: kindResult.kind,
      ...(record.subject?.trim() ? { subject: record.subject.trim() } : {}),
      ...(record.topic?.trim() ? { topic: record.topic.trim() } : {}),
      ...(record.notes?.trim() ? { notes: record.notes.trim() } : {}),
    };
    const key = `${rowValue.date}|${rowValue.start ?? ''}|${normalizeText(rowValue.title)}`;
    if (seen.has(key)) {
      issues.push({ row, message: 'Duplicate row in this file — it will be skipped.', severity: 'warning' });
      rowValue.duplicate = true;
    }
    seen.add(key);
    if (tasksMatch(rowValue, existing)) {
      issues.push({ row, message: 'A matching block already exists on that date — it will be skipped.', severity: 'warning' });
      rowValue.duplicate = true;
    }
    timetable.push(rowValue);
  });

  return { timetable, curriculum: [], issues };
}

function parseCurriculumRecords(
  entries: ImportRecord[],
  context: ParseContext,
): ParsedRows {
  const curriculum: CurriculumImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();

  entries.forEach(({ values: record, row }) => {
    if (Object.values(record).every((value) => !value.trim())) return;
    const subject = (record.subject ?? '').trim();
    const topic = (record.topic ?? '').trim();
    const unitsRaw = (record.units ?? '').trim();
    const units = unitsRaw ? Number(unitsRaw) : 1;
    let valid = true;

    if (!subject) {
      issues.push({ row, field: 'subject', message: 'Subject is required.', severity: 'error' });
      valid = false;
    }
    if (!topic) {
      issues.push({ row, field: 'topic', message: 'Topic is required.', severity: 'error' });
      valid = false;
    }
    if (!Number.isFinite(units) || units < 1 || units > 100) {
      issues.push({ row, field: 'units', message: 'Units must be a whole number between 1 and 100.', severity: 'error' });
      valid = false;
    }
    if (!valid) return;

    const rowValue: CurriculumImportRow = {
      row,
      subject,
      topic,
      units: Math.round(units),
      priority: normalizePriority(record.priority ?? ''),
      keyPoints: (record.key_points ?? '')
        .split(/[;|]/)
        .map((point) => point.trim())
        .filter(Boolean)
        .slice(0, 10),
    };
    const key = `${normalizeText(subject)}|${normalizeText(topic)}`;
    if (seen.has(key)) {
      issues.push({ row, message: 'Duplicate topic in this file — the last row wins.', severity: 'warning' });
    }
    seen.add(key);
    if (topicExists(rowValue, context.existingSubjects ?? [], context.existingTopics ?? [])) {
      issues.push({ row, message: 'This topic already exists — its units and key points will be updated.', severity: 'warning' });
      rowValue.duplicate = true;
    }
    curriculum.push(rowValue);
  });

  return { timetable: [], curriculum, issues };
}

function parseJsonImport(text: string, context: ParseContext): ImportPlan {
  const issues: ImportIssue[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      format: 'combined',
      timetable: [],
      curriculum: [],
      issues: [{ row: 0, message: 'That JSON could not be parsed. Check for a missing comma or quote.', severity: 'error' }],
      canApply: false,
    };
  }

  const root = Array.isArray(parsed) ? { curriculum: parsed } : parsed as Record<string, unknown>;
  let target: ImportTargetDraft | undefined;
  if (root.target && typeof root.target === 'object') {
    const raw = root.target as Record<string, unknown>;
    const title = String(raw.title ?? '').trim();
    if (!title) {
      issues.push({ row: 0, field: 'target.title', message: 'Target title is required when a target is supplied.', severity: 'error' });
    } else {
      const dateResult = raw.date ? normalizeDate(String(raw.date)) : {};
      if (dateResult.issue) {
        issues.push({ row: 0, field: 'target.date', message: dateResult.issue, severity: 'error' });
      }
      const kindClean = String(raw.kind ?? 'exam').trim().toLowerCase();
      const kind: TargetKind = ['exam', 'course', 'skill', 'habit', 'custom'].includes(kindClean)
        ? kindClean as TargetKind
        : 'exam';
      target = { title, kind, ...(dateResult.date ? { date: dateResult.date } : {}) };
    }
  }

  const recordsFrom = (value: unknown): ImportRecord[] => {
    if (!Array.isArray(value)) return [];
    return value.map((entry, index) => {
      const record: Record<string, string> = {};
      if (entry && typeof entry === 'object') {
        Object.entries(entry as Record<string, unknown>).forEach(([key, value]) => {
          record[normalizeHeader(key)] = value === null || value === undefined
            ? ''
            : Array.isArray(value)
              ? value.map(String).join('; ')
              : String(value);
        });
      }
      return { values: record, row: index + 1 };
    });
  };

  const timetableRecords = recordsFrom(root.schedule ?? root.timetable ?? root.blocks);
  const curriculumRecords = recordsFrom(root.curriculum ?? root.topics);
  const timetableResult = parseTimetableRecords(timetableRecords, context);
  const curriculumResult = parseCurriculumRecords(curriculumRecords, context);
  const allIssues = [...issues, ...timetableResult.issues, ...curriculumResult.issues];
  const hasRows = timetableResult.timetable.length > 0 || curriculumResult.curriculum.length > 0;
  if (!hasRows) {
    allIssues.push({ row: 0, message: 'No schedule or curriculum rows found. Expected “schedule”, “curriculum” or “timetable”.', severity: 'error' });
  }

  return {
    format: timetableResult.timetable.length && curriculumResult.curriculum.length
      ? 'combined'
      : courseworkFormat(timetableResult.timetable.length > 0, curriculumResult.curriculum.length > 0),
    target,
    timetable: timetableResult.timetable,
    curriculum: curriculumResult.curriculum,
    issues: allIssues,
    canApply: hasRows,
  };
}

function courseworkFormat(hasTimetable: boolean, hasCurriculum: boolean): ImportFormat {
  if (hasTimetable && hasCurriculum) return 'combined';
  return hasTimetable ? 'timetable' : 'curriculum';
}

function parseCsvImport(text: string, context: ParseContext): ImportPlan {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return {
      format: 'combined',
      timetable: [],
      curriculum: [],
      issues: [{ row: 0, message: 'Add a header row and at least one data row.', severity: 'error' }],
      canApply: false,
    };
  }
  const headers = rows[0].map(normalizeHeader);
  const entries: ImportRecord[] = rows.slice(1).map((cells, index) => {
    const values: Record<string, string> = {};
    headers.forEach((header, cellIndex) => {
      if (header) values[header] = (cells[cellIndex] ?? '').trim();
    });
    return { values, row: index + 2 };
  });

  const hasTimetable = headers.includes('date') || headers.includes('title');
  const hasCurriculum = headers.includes('subject') || headers.includes('topic')
    || headers.includes('units') || headers.includes('key_points') || headers.includes('priority');
  if (!hasTimetable && !hasCurriculum) {
    return {
      format: 'combined',
      timetable: [],
      curriculum: [],
      issues: [{
        row: 0,
        message: 'Unrecognized headers. Timetable needs date,title; curriculum needs subject,topic,units.',
        severity: 'error',
      }],
      canApply: false,
    };
  }

  const isTimetableRow = (values: Record<string, string>) =>
    Boolean(values.date?.trim() || values.title?.trim());
  const hasCurriculumValues = (values: Record<string, string>) =>
    Boolean(
      values.subject?.trim()
      || values.topic?.trim()
      || values.units?.trim()
      || values.key_points?.trim()
      || values.priority?.trim(),
    );

  // A timetable CSV legitimately carries subject and topic columns, so only
  // treat a file as combined when it also declares curriculum-only headers.
  const combined = hasTimetable
    && (headers.includes('units') || headers.includes('key_points'));

  let timetableEntries: ImportRecord[];
  let curriculumEntries: ImportRecord[];
  if (combined) {
    timetableEntries = entries.filter(({ values }) => isTimetableRow(values));
    curriculumEntries = entries.filter(
      ({ values }) => !isTimetableRow(values) && hasCurriculumValues(values),
    );
    // Rows that match neither shape still get a visible validation error
    // instead of disappearing silently.
    const unassigned = entries.filter(
      ({ values }) => !isTimetableRow(values) && !hasCurriculumValues(values),
    );
    timetableEntries = [...timetableEntries, ...unassigned];
  } else if (hasTimetable) {
    timetableEntries = entries;
    curriculumEntries = [];
  } else {
    timetableEntries = [];
    curriculumEntries = entries;
  }

  const timetableResult = parseTimetableRecords(timetableEntries, context);
  const curriculumResult = parseCurriculumRecords(curriculumEntries, context);
  const issues = [...timetableResult.issues, ...curriculumResult.issues];
  const timetable = timetableResult.timetable;
  const curriculum = curriculumResult.curriculum;
  const empty = timetable.length === 0 && curriculum.length === 0;
  if (empty) {
    issues.push({ row: 0, message: 'No usable rows found. Fix the validation errors and try again.', severity: 'error' });
  }

  return {
    format: courseworkFormat(timetable.length > 0, curriculum.length > 0),
    timetable,
    curriculum,
    issues,
    canApply: !empty,
  };
}

export function parseImportText(text: string, context: ParseContext = {}): ImportPlan {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      format: 'combined',
      timetable: [],
      curriculum: [],
      issues: [{ row: 0, message: 'Paste a CSV or JSON file first.', severity: 'error' }],
      canApply: false,
    };
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseJsonImport(trimmed, context);
  }
  return parseCsvImport(trimmed, context);
}
