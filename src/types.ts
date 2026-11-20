export type View = 'today' | 'board' | 'journey' | 'syllabus' | 'insights' | 'settings';

export type SubjectId = string;

export type TargetKind = 'exam' | 'course' | 'skill' | 'habit' | 'custom';

export type PrepLevel = 'first-time' | 'some-prep' | 'exam-ready';

export interface StudyTarget {
  id: string;
  title: string;
  kind: TargetKind;
  /** Optional. A target without a date runs on a rolling horizon. */
  date?: string;
  color: string;
  createdAt: string;
  archivedAt?: string;
  preset?: 'gate-cse';
  dailyMinutes?: number;
  /** Preferred subject sequence. For the GATE preset this is also the included subject set. */
  subjectOrder?: SubjectId[];
  /** Preparation level gathered during onboarding. */
  prepLevel?: PrepLevel;
  /** Available study minutes indexed by JS weekday (0 = Sunday). */
  dayMinutes?: number[];
  notes?: string;
}

export interface Subject {
  id: SubjectId;
  name: string;
  short: string;
  color: string;
  weight: number;
  tier: 1 | 2 | 3;
  phase: 1 | 2 | 3;
  tagline: string;
  archetypes: string[];
  targetId?: string;
}

export interface Topic {
  id: string;
  subjectId: SubjectId;
  title: string;
  units: number;
  phase: 1 | 2 | 3;
  keyPoints: string[];
  highYield?: boolean;
  targetId?: string;
}

export type TaskKind =
  | 'pyq'
  | 'study'
  | 'test'
  | 'mock'
  | 'analysis'
  | 'revision'
  | 'practice'
  | 'personal'
  | 'rest'
  | 'exam';

export type TaskStatus = 'todo' | 'done' | 'skipped' | 'missed';

export type SlotId = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

export type BlockRole = 'pyq' | 'core' | 'test' | 'deepdive' | 'weekly';

export interface BlockTemplate {
  id: string;
  role: BlockRole;
  label: string;
  start: string;
  duration: number;
}

export interface PlannerSettings {
  /** Primary dated target. Kept for compatibility with the original planner. */
  examDate: string;
  examLabel: string;
  /** Primary target id shown by the legacy countdown surfaces. */
  primaryTargetId?: string;
  /** Rolling planning window for targets without a date. */
  horizonDays: number;
  weekday: BlockTemplate[];
  weekend: BlockTemplate[];
  heavyDays: number[];
  mockPhaseDays: number;
  mockCount: number;
  revisionDays: number;
  dailyFlow: boolean;
  flowVersion: number;
  sound: boolean;
  confetti: boolean;
}

export interface Task {
  id: string;
  date: string;
  start: string;
  duration: number;
  slot: SlotId;
  kind: TaskKind;
  title: string;
  subtitle?: string;
  description?: string;
  targetId?: string;
  subjectId?: SubjectId;
  topicId?: string;
  sessionNo?: number;
  sessionTotal?: number;
  coversTopic?: boolean;
  xp: number;
  status: TaskStatus;
  manual?: boolean;
  notes?: string;
  score?: number;
  mockNo?: number;
  completedAt?: string;
  planSignature?: string;
  planUnitId?: string;
  earlyCompleted?: boolean;
  recallTopicIds?: string[];
}

export interface TopicProgress {
  topicId: string;
  confidence: number;
}

export interface Profile {
  name: string;
  createdAt: string;
  onboarded: boolean;
}

export interface RippleReport {
  reason: string;
  at: string;
  sessionsMoved: number;
  topicsMoved: number;
  daysAffected: number;
  coverageBefore: number;
  coverageAfter: number;
  deferredTopics: number;
  daysShifted: number;
  note?: string;
}

export interface AppState {
  version: number;
  profile: Profile;
  settings: PlannerSettings;
  targets: StudyTarget[];
  subjects: Subject[];
  topics: Topic[];
  topicProgress: TopicProgress[];
  tasks: Task[];
  restDays: string[];
  boostedSubjects: SubjectId[];
  generatedFor: string | null;
  seenAchievements: string[];
  lastRipple?: RippleReport;
}

export interface DayData {
  date: string;
  weekday: number;
  isToday: boolean;
  isWeekend: boolean;
  type: 'study' | 'rest' | 'mock' | 'revision' | 'exam' | 'past';
  tasks: Task[];
  studyMinutes: number;
  doneMinutes: number;
  focusSubjects: SubjectId[];
}

export interface ToastMessage {
  id: number;
  kind: 'ripple' | 'xp' | 'info' | 'achievement' | 'error';
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: string;
}

export interface NewTaskInput {
  title: string;
  date: string;
  start: string;
  duration: number;
  kind: TaskKind;
  targetId?: string;
  subjectId?: SubjectId;
  notes?: string;
}
