import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Flame,
  Moon,
  Plus,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Zap,
} from 'lucide-react';
import type { AppState, SlotId, Task } from '../types';
import { describeDayType } from '../lib/schedule';
import { planningEnd, hasGateTarget, primaryTarget } from '../lib/targets';
import {
  addDays,
  cx,
  diffDays,
  formatDate,
  formatDuration,
  hoursLabel,
  relativeDayLabel,
  slotMeta,
  subjectListLabel,
  sumMinutes,
  todayISO,
} from '../lib/utils';
import { Badge } from './ui';
import { BoardSurface, DateRibbon, DndStage } from './Board';
import { taskKindMeta } from './TaskCard';
import { DailyFlowRail } from './DailyFlowRail';

type BoardFilter = 'all' | 'study' | 'test' | 'personal';

const FILTERS: { id: BoardFilter; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'study', label: 'Study arc' },
  { id: 'test', label: 'Tests & mocks' },
  { id: 'personal', label: 'Life & recovery' },
];

const DAY_TYPE_META = {
  study: { label: 'Study day', tone: 'lime' as const },
  rest: { label: 'Recovery', tone: 'neutral' as const },
  mock: { label: 'Mock day', tone: 'amber' as const },
  revision: { label: 'Final revision', tone: 'violet' as const },
  exam: { label: 'Final boss', tone: 'rose' as const },
};

export function BoardView({
  state,
  selectedDate,
  onSelectDate,
  onOpenTask,
  onComplete,
  onAddTask,
  onToggleRest,
  onMoveTask,
  onOpenFocus,
  onOpenRipple,
}: {
  state: AppState;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onOpenTask: (task: Task) => void;
  onComplete: (task: Task) => void;
  onAddTask: (date: string, slot?: SlotId) => void;
  onToggleRest: (date: string) => void;
  onMoveTask: (task: Task, date: string, slot: SlotId) => void;
  onOpenFocus: (task?: Task) => void;
  onOpenRipple: () => void;
}) {
  const [filter, setFilter] = useState<BoardFilter>('all');
  const today = todayISO();
  const gate = hasGateTarget(state);
  const horizonEnd = planningEnd(state, today);
  const target = primaryTarget(state);
  const date = selectedDate < today ? today : selectedDate > horizonEnd ? horizonEnd : selectedDate;
  const dayTasks = useMemo(
    () => state.tasks.filter((task) => task.date === date),
    [state.tasks, date],
  );
  const coreTasks = dayTasks.filter((task) => task.status !== 'skipped' && task.status !== 'missed');
  const doneTasks = dayTasks.filter((task) => task.status === 'done');
  const pending = coreTasks.filter((task) => task.status === 'todo');
  const plannedMinutes = sumMinutes(dayTasks.filter((task) => task.kind !== 'rest'));
  const doneMinutes = sumMinutes(doneTasks);
  const pct = coreTasks.length ? Math.round((doneTasks.length / coreTasks.length) * 100) : 0;
  const totalXp = pending.reduce((sum, task) => sum + task.xp, 0);
  const subjects = Array.from(
    new Set(dayTasks.filter((task) => task.subjectId).map((task) => task.subjectId!)),
  );
  const nextTask = [...pending].sort((a, b) => a.start.localeCompare(b.start))[0];
  const dayType = describeDayType(date, state.settings, {
    gate,
    targetDates: state.targets.filter((entry) => !entry.archivedAt && entry.date).map((entry) => entry.date as string),
  });
  const typeMeta = DAY_TYPE_META[dayType];
  const isRest = state.restDays.includes(date);
  const isToday = date === today;
  const isPast = date < today;
  const dayNumber = diffDays(today, date) + 1;
  const daysLeft = target?.date ? diffDays(date, target.date) : null;
  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);
  const canPrev = prevDate >= today;
  const canNext = nextDate <= horizonEnd;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      ) return;
      if (event.key === 'ArrowLeft' && canPrev) {
        event.preventDefault();
        onSelectDate(prevDate);
      } else if (event.key === 'ArrowRight' && canNext) {
        event.preventDefault();
        onSelectDate(nextDate);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canPrev, canNext, nextDate, onSelectDate, prevDate]);
  const slotCounts = dayTasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.slot] = (acc[task.slot] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="board-view">
      <header className="page-head board-page-head">
        <div className="page-head-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            SPRINT BOARD · {isToday ? 'TODAY' : relativeDayLabel(date).toUpperCase()}
          </div>
          <div className="board-date-line">
            <button
              className="icon-button soft"
              onClick={() => canPrev && onSelectDate(prevDate)}
              disabled={!canPrev}
              aria-label="Previous day"
            >
              <ChevronLeft size={18} />
            </button>
            <h1>{formatDate(date, 'long')}</h1>
            <button
              className="icon-button soft"
              onClick={() => canNext && onSelectDate(nextDate)}
              disabled={!canNext}
              aria-label="Next day"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="page-subline board-subline">
            <Badge tone={isRest ? 'neutral' : typeMeta.tone}>{isRest ? 'Recovery day' : typeMeta.label}</Badge>
            {dayNumber > 0 && <span>Day {dayNumber} of your ascent</span>}
            <span>
              {daysLeft === null
                ? 'Rolling plan · no countdown'
                : daysLeft > 0
                  ? `${daysLeft} days to ${target?.title ?? 'target'}`
                  : `${target?.title ?? 'Target'} day`}
            </span>
            <span>{coreTasks.length} blocks mapped</span>
          </div>
        </div>

        <div className="page-actions board-page-actions">
          {isToday ? (
            <button className="small-button ghost" onClick={() => onOpenFocus(nextTask)} disabled={!nextTask}>
              <Timer size={14} /> Focus next
            </button>
          ) : (
            <button className="small-button ghost" onClick={() => onSelectDate(today)}>
              <Crosshair size={14} /> Back to today
            </button>
          )}
          <button
            className={cx('small-button ghost', isRest && 'is-active')}
            onClick={() => onToggleRest(date)}
            disabled={isPast || date === horizonEnd}
          >
            <Moon size={14} /> {isRest ? 'Restore day' : 'Mark recovery'}
          </button>
          <button className="small-button" onClick={() => onAddTask(date)} disabled={date === horizonEnd}>
            <Plus size={15} /> Add block
          </button>
        </div>
      </header>

      <DateRibbon
        selected={date}
        onSelect={onSelectDate}
        tasks={state.tasks}
        restDays={state.restDays}
        examDate={horizonEnd}
      />

      {!isToday && !isPast && (
        <div className="board-early-note">
          <Sparkles size={13} />
          <span>
            <strong>Already know this?</strong> Tick any block to bank it now. The queue pulls later
            topics forward and schedules spaced recall from today.
          </span>
        </div>
      )}

      {state.settings.dailyFlow && hasGateTarget(state) && (
        <DailyFlowRail date={date} tasks={dayTasks} onOpenTask={onOpenTask} compact />
      )}

      <div className="day-telemetry">
        <div className="telemetry-cell telemetry-progress">
          <div className="telemetry-top">
            <span className="telemetry-icon lime"><CheckCircle2 size={14} /></span>
            <span>DAY COMPLETION</span>
            <strong>{pct}%</strong>
          </div>
          <div className="telemetry-bar">
            <span style={{ width: `${pct}%` }} />
          </div>
          <small>{doneTasks.length}/{coreTasks.length} blocks cleared · {formatDuration(doneMinutes)} banked</small>
        </div>
        <div className="telemetry-cell">
          <span className="telemetry-icon violet"><Timer size={14} /></span>
          <div>
            <small>PLANNED LOAD</small>
            <strong>{plannedMinutes ? hoursLabel(plannedMinutes) : '—'}</strong>
          </div>
          <span className="telemetry-note">{subjects.length ? subjectListLabel(subjects) : 'No study focus'}</span>
        </div>
        <div className="telemetry-cell">
          <span className="telemetry-icon amber"><Zap size={14} /></span>
          <div>
            <small>XP ON THE TABLE</small>
            <strong>{totalXp}</strong>
          </div>
          <span className="telemetry-note">Roughly {Math.round(totalXp / 10) * 10} compounding votes</span>
        </div>
        <div className="telemetry-cell telemetry-next">
          <span className="telemetry-icon sky"><Target size={14} /></span>
          <div>
            <small>NEXT MOVE</small>
            <strong>{nextTask ? nextTask.start : 'Cleared'}</strong>
          </div>
          {nextTask ? (
            <button className="telemetry-link" onClick={() => onOpenTask(nextTask)}>
              {nextTask.title} <ArrowRight size={12} />
            </button>
          ) : (
            <span className="telemetry-note">Every loop is closed.</span>
          )}
        </div>
      </div>

      <div className="board-toolbar">
        <div className="filter-pills" role="tablist" aria-label="Filter board">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={filter === item.id}
              className={cx('filter-pill', filter === item.id && 'is-active')}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              {item.id === 'all' && <b>{dayTasks.length}</b>}
            </button>
          ))}
        </div>
        <div className="board-toolbar-right">
          <span className="board-drag-hint">
            <Flame size={12} /> Drag any card to re-time it. Drop it on another day in the ribbon to ripple the plan.
          </span>
          {state.lastRipple && (
            <button className="text-button" onClick={onOpenRipple}>
              <Sparkles size={13} /> Last ripple
            </button>
          )}
        </div>
      </div>

      {isPast ? (
        <div className="locked-day-banner">
          <Trophy size={16} />
          <div>
            <strong>This day is locked history.</strong>
            <span>Completed and missed sessions are preserved so the record stays honest. Jump forward to reshape the plan.</span>
          </div>
          <button className="small-button" onClick={() => onSelectDate(today)}>
            Back to today <ArrowRight size={13} />
          </button>
        </div>
      ) : (
        <DndStage
          tasks={state.tasks}
          onDragEnd={onMoveTask}
          onOpen={onOpenTask}
        >
          <BoardSurface
            date={date}
            tasks={dayTasks}
            onOpen={onOpenTask}
            onComplete={onComplete}
            onAddTask={(slot) => onAddTask(date, slot)}
            completionDisabled={false}
            filter={filter}
          />
        </DndStage>
      )}

      <div className="board-foot-grid">
        <div className="board-foot-card">
          <div className="board-foot-head">
            <div>
              <span className="eyebrow">TIME-OF-DAY LOAD</span>
              <h3>Where the hours land.</h3>
            </div>
            <CalendarDays size={18} className="foot-icon" />
          </div>
          <div className="slot-load-list">
            {Object.entries(slotCounts).length === 0 && (
              <p className="muted-copy">No blocks yet. Map one above, or let tomorrow’s ripple fill the gap.</p>
            )}
            {Object.entries(slotCounts)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([slotId, count]) => (
                <div key={slotId} className="slot-load-row">
                  <span className={`slot-load-dot slot-${slotId}`} />
                  <span>{slotMeta(slotId as SlotId).label}</span>
                  <span className="slot-load-mini">
                    {Array.from({ length: Math.min(4, count) }).map((_, index) => (
                      <i key={index} />
                    ))}
                  </span>
                  <strong>{count}</strong>
                </div>
              ))}
          </div>
        </div>

        <div className="board-foot-card">
          <div className="board-foot-head">
            <div>
              <span className="eyebrow">DAY PROTOCOL</span>
              <h3>
                {isRest
                  ? 'Recover on purpose.'
                  : dayType === 'mock'
                    ? gate ? 'Simulate. Then autopsy.' : 'Milestone day. Show up ready.'
                    : gate ? 'PYQ → deep work → test.' : 'Plan → focus → review.'}
              </h3>
            </div>
            <span className="foot-icon-wrap"><Target size={18} /></span>
          </div>
          <div className="protocol-steps">
            {(isRest
              ? [
                ['01', 'No study inputs', 'Walk, eat properly, sleep early.'],
                ['02', 'Protect the streak', 'A recovery day still counts as the plan working.'],
                ['03', 'Return sharper', 'Tomorrow’s queue is already packed.'],
              ]
              : gate
                ? [
                  ['01', 'Recon first', 'Let past papers choose what matters.'],
                  ['02', 'Two clean deep-work blocks', 'One topic, one objective, one block.'],
                  ['03', 'Close the loop', 'Test exactly what you learned. Log the misses.'],
                ]
                : [
                  ['01', 'Plan the block', 'One clear outcome before the timer starts.'],
                  ['02', 'Do the work', 'One subject, one objective, one block.'],
                  ['03', 'Review the loop', 'Mark what stuck and schedule the next pass.'],
                ]
            ).map(([index, title, copy]) => (
              <div key={index} className="protocol-step">
                <span>{index}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{copy}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="board-foot-card board-foot-note">
          <div className="board-foot-head">
            <div>
              <span className="eyebrow">RIPPLE ENGINE</span>
              <h3>One change. Whole future adapts.</h3>
            </div>
            <span className="foot-icon-wrap"><Zap size={18} /></span>
          </div>
          <p>
            Move a block, skip a session or take a recovery day. The scheduler preserves completed
            work and manual anchors, then re-packs every unresolved syllabus unit into the remaining
            calendar.
          </p>
          <div className="ripple-rule mini">
            <span><CheckCircle2 size={11} /> History stays fixed</span>
            <span><CheckCircle2 size={11} /> Manual stays pinned</span>
            <span><CheckCircle2 size={11} /> Future re-flows</span>
          </div>
          <div className="board-foot-actions">
            <button className="ghost-button full" onClick={onOpenRipple}>
              Inspect latest ripple <ArrowLeft size={13} />
            </button>
            <button className="text-button" onClick={() => onOpenFocus(nextTask)} disabled={!nextTask}>
              <Timer size={13} /> Focus on {nextTask ? taskKindMeta(nextTask).label.toLowerCase() : 'nothing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
