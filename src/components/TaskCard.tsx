import type { CSSProperties } from 'react';
import type { Task } from '../types';
import {
  Brain,
  Check,
  Circle,
  Coffee,
  Crosshair,
  GripVertical,
  Moon,
  NotebookPen,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { cx, endTime, formatClock, formatDuration, subjectById } from '../lib/utils';
import { GATE_TARGET_ID } from '../lib/targets';

export const KIND_META: Record<
  Task['kind'],
  { label: string; icon: typeof Brain; color: string; tone: string }
> = {
  study: { label: 'Deep work', icon: Brain, color: '#D8FF6A', tone: 'lime' },
  practice: { label: 'Practice', icon: Zap, color: '#8BE8B8', tone: 'green' },
  pyq: { label: 'Past papers', icon: Crosshair, color: '#97A7FF', tone: 'violet' },
  test: { label: 'Checkpoint', icon: Target, color: '#C8A8FF', tone: 'violet' },
  mock: { label: 'Mock exam', icon: Swords, color: '#FFC46B', tone: 'amber' },
  analysis: { label: 'Review', icon: ShieldCheck, color: '#FF8FA4', tone: 'rose' },
  revision: { label: 'Revision', icon: ScrollText, color: '#63E6CE', tone: 'green' },
  personal: { label: 'Personal', icon: Coffee, color: '#6BD6FF', tone: 'sky' },
  rest: { label: 'Recovery', icon: Moon, color: '#A7ACB8', tone: 'neutral' },
  exam: { label: 'Target day', icon: Trophy, color: '#FFD36E', tone: 'amber' },
};

export const GATE_KIND_META: typeof KIND_META = {
  ...KIND_META,
  pyq: { ...KIND_META.pyq, label: 'PYQ recon' },
  test: { ...KIND_META.test, label: 'Validation' },
  analysis: { ...KIND_META.analysis, label: 'Autopsy' },
  exam: { ...KIND_META.exam, label: 'Final boss' },
};

/** GATE keeps its exam vocabulary; every other target gets neutral labels. */
export function taskKindMeta(task: Task) {
  return task.targetId === GATE_TARGET_ID ? GATE_KIND_META[task.kind] : KIND_META[task.kind];
}

function statusLabel(task: Task) {
  if (task.status === 'done') return task.earlyCompleted ? 'Cleared early' : 'Cleared';
  if (task.status === 'skipped') return 'Skipped';
  if (task.status === 'missed') return 'Missed';
  return null;
}

export function TaskCard({
  task,
  onOpen,
  onComplete,
  completionDisabled,
  overdue,
  isNext,
  compact,
  journey,
  showDragHandle = false,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  onComplete?: (task: Task) => void;
  completionDisabled?: boolean;
  overdue?: boolean;
  isNext?: boolean;
  compact?: boolean;
  journey?: boolean;
  showDragHandle?: boolean;
}) {
  const subject = subjectById(task.subjectId);
  const meta = taskKindMeta(task);
  const Icon = meta.icon;
  const accent = subject?.color ?? meta.color;
  const status = statusLabel(task);
  const isMockish = task.kind === 'mock' || task.kind === 'exam';
  const sessionPct = task.sessionNo && task.sessionTotal
    ? Math.round((task.sessionNo / task.sessionTotal) * 100)
    : null;

  if (journey) {
    return (
      <button
        type="button"
        className={cx(
          'journey-task',
          `kind-${task.kind}`,
          task.status === 'done' && 'is-done',
          task.status === 'skipped' && 'is-skipped',
          task.status === 'missed' && 'is-missed',
        )}
        onClick={(event) => {
          event.stopPropagation();
          onOpen(task);
        }}
        title={`${task.title} · ${formatClock(task.start)}`}
      >
        <span className="journey-task-time">{task.start}</span>
        <span className="journey-task-dot" style={{ background: accent }} />
        <span className="journey-task-title">{task.title}</span>
        {task.status === 'done' && <Check size={10} className="journey-task-check" />}
      </button>
    );
  }

  return (
    <article
      className={cx(
        'task-card',
        `kind-${task.kind}`,
        compact && 'task-card-compact',
        isMockish && 'task-card-boss',
        task.status === 'done' && 'is-done',
        task.earlyCompleted && 'is-early',
        task.status === 'skipped' && 'is-skipped',
        task.status === 'missed' && 'is-missed',
        overdue && 'is-overdue',
        isNext && 'is-next',
        task.manual && 'is-manual',
      )}
      style={{ '--task-accent': accent } as CSSProperties}
      onClick={() => onOpen(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(task);
        }
      }}
      aria-label={`${task.title}, ${formatClock(task.start)}, ${formatDuration(task.duration)}, ${status ?? 'planned'}`}
    >
      <span className="task-accent" aria-hidden />
      {isNext && <span className="next-flag">Up next</span>}
      <div className="task-top">
        <span className="task-kind" style={{ color: accent }}>
          <Icon size={12} strokeWidth={2.2} />
          <span>{meta.label}</span>
        </span>
        <div className="task-card-tools">
          {showDragHandle && <GripVertical size={14} className="drag-grip" aria-hidden />}
          {onComplete && (
            <button
              type="button"
              className={cx('task-check', task.status === 'done' && 'is-checked')}
              aria-label={task.status === 'done' ? 'Completed' : 'Mark session complete'}
              disabled={completionDisabled || task.status !== 'todo'}
              onClick={(event) => {
                event.stopPropagation();
                if (task.status === 'todo' && !completionDisabled) onComplete(task);
              }}
            >
              {task.status === 'done' ? <Check size={12} strokeWidth={3} /> : <Circle size={13} strokeWidth={1.8} />}
            </button>
          )}
        </div>
      </div>

      <h4 className="task-title">{task.title}</h4>
      {task.subtitle && <p className="task-subtitle">{task.subtitle}</p>}

      {task.status !== 'todo' && status && (
        <span className={cx('task-status-chip', `status-${task.status}`)}>
          {status}
        </span>
      )}

      {sessionPct !== null && !compact && (
        <div className="session-progress" aria-hidden>
          <div className="session-bar">
            <span style={{ width: `${sessionPct}%`, background: accent }} />
          </div>
          <span className="session-label">
            {task.sessionNo}/{task.sessionTotal}
          </span>
        </div>
      )}

      <footer className="task-meta">
        <span className="task-time">
          {formatClock(task.start)}
          <span className="task-time-sep">–</span>
          {formatClock(endTime(task.start, task.duration))}
        </span>
        <span className="task-meta-right">
          {subject && <span className="task-subject" style={{ color: subject.color }}>{subject.short}</span>}
          {!compact && task.xp > 0 && <span className="task-xp">{task.xp} XP</span>}
        </span>
      </footer>

      {task.notes && (
        <span className="task-note-flag" title="Has notes">
          <NotebookPen size={11} />
        </span>
      )}
      {task.status === 'todo' && task.kind === 'study' && (
        <span className="task-corner-spark" aria-hidden>
          <Sparkles size={11} />
        </span>
      )}
    </article>
  );
}
