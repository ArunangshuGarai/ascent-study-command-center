import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Check,
  Circle,
  Clock3,
  Coffee,
  Footprints,
  Moon,
  Utensils,
  Waves,
} from 'lucide-react';
import type { Task } from '../types';
import {
  DAILY_FLOW,
  FLOW_PLAN_END,
  FLOW_PLAN_START,
  planForDate,
  studyFlowForDate,
} from '../data/dailyFlow';
import {
  cx,
  endTime,
  formatClock,
  formatDate,
  formatDuration,
  minutesFromTime,
  todayISO,
} from '../lib/utils';
import { ScrollRail } from './ui';

const DAY_START = 6 * 60 + 30;
const DAY_END = 22 * 60 + 30;
const SPAN = DAY_END - DAY_START;

const CATEGORY_ICON = {
  gym: Activity,
  meal: Utensils,
  break: Coffee,
  nap: Moon,
  walk: Footprints,
  prep: Clock3,
  buffer: Waves,
  study: Clock3,
};

function positionStyle(start: string, duration: number) {
  const left = ((minutesFromTime(start) - DAY_START) / SPAN) * 100;
  const width = Math.max(0.8, (duration / SPAN) * 100);
  return {
    left: `${left}%`,
    width: `calc(${width}% - 3px)`,
  };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && aEnd > bStart;
}

export function DailyFlowRail({
  date,
  tasks,
  onOpenTask,
  preview = false,
  compact = false,
  bare = false,
}: {
  date: string;
  tasks: Task[];
  onOpenTask?: (task: Task) => void;
  preview?: boolean;
  compact?: boolean;
  bare?: boolean;
}) {
  const today = todayISO();
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const plannedStudy = useMemo(() => studyFlowForDate(date), [date]);
  const plan = planForDate(date);

  const studyBlocks = useMemo(() => {
    return plannedStudy.map((block) => {
      const signature = `flow:${date}:${block.role}`;
      const task = tasks.find((entry) => entry.planSignature === signature);
      return {
        block,
        task,
        start: task?.start ?? block.start,
        duration: task?.duration ?? block.duration,
      };
    });
  }, [date, plannedStudy, tasks]);

  const lifeBlocks = useMemo(() => {
    const life = DAILY_FLOW.filter((block) => block.category !== 'study');
    return life.filter((block) => {
      const start = minutesFromTime(block.start);
      const end = start + block.duration;
      return !studyBlocks.some((study) => {
        const studyStart = minutesFromTime(study.start);
        return overlaps(start, end, studyStart, studyStart + study.duration);
      });
    });
  }, [studyBlocks]);

  const hasFlowTasks = tasks.some((task) => task.planSignature?.startsWith('flow:'));
  const isPlanWindow = date >= FLOW_PLAN_START && date <= FLOW_PLAN_END;
  const isToday = date === today;
  const beforePlan = date < FLOW_PLAN_START;
  if (!preview && !hasFlowTasks && !isPlanWindow && !(isToday && beforePlan)) return null;

  const showNow = isToday && nowMinutes >= DAY_START && nowMinutes <= DAY_END;
  const nowLeft = ((nowMinutes - DAY_START) / SPAN) * 100;

  const modeLabel = isToday && beforePlan
    ? `Goes live ${formatDate(FLOW_PLAN_START, 'short')} · the 7-hour rhythm`
    : plan?.mode === 'mock'
    ? 'Mock day · simulation + autopsy'
    : plan?.mode === 'revision'
      ? 'Final polish · no new questions'
      : plan?.mode === 'rest'
        ? 'Rest & mental prep · eve of exam'
        : 'PYQ → core → practice → revision → test';

  const hourMarks = ['06:30', '09:00', '12:00', '15:00', '18:00', '21:00', '22:30'];

  return (
    <section className={cx('daily-flow', compact && 'is-compact', preview && 'is-preview')}>
      {!bare && (
        <header className="daily-flow-head">
          <div className="daily-flow-title">
            <span className="daily-flow-mark" aria-hidden><i /><i /><i /><b /></span>
            <div>
              <span className="eyebrow">DAILY FLOW</span>
              <h3>The 7-hour rhythm.</h3>
              <p>{modeLabel}</p>
            </div>
          </div>
          <div className="daily-flow-meta">
            <span className="daily-flow-badge"><Clock3 size={12} /> 420 min study · 5 windows</span>
            {!preview && (
              <span className="daily-flow-status">
                <span className={cx('status-pulse', hasFlowTasks && 'is-live')} />
                {hasFlowTasks ? 'Flow mapped' : 'Flow preview'}
              </span>
            )}
          </div>
        </header>
      )}

      <ScrollRail
        scrollerClassName="daily-flow-scroll"
        hint={compact ? 'Scroll the rhythm' : 'Scroll the 7-hour rhythm'}
        label="daily flow"
        scrollAmount={320}
      >
        <div className="daily-flow-canvas">
          <div className="daily-flow-hours" aria-hidden>
            {hourMarks.map((mark) => (
              <span key={mark} style={{ left: `${((minutesFromTime(mark) - DAY_START) / SPAN) * 100}%` }}>
                {mark}
              </span>
            ))}
          </div>

          <div className="daily-flow-study-lane">
            <span className="daily-flow-lane-label">STUDY</span>
            {studyBlocks.map(({ block, task, start, duration }) => {
              const current = isToday && nowMinutes >= minutesFromTime(start) && nowMinutes < minutesFromTime(start) + duration;
              const done = task?.status === 'done';
              const missed = task?.status === 'missed' || task?.status === 'skipped';
              return (
                <button
                  key={block.role}
                  type="button"
                  className={cx(
                    'flow-study-block',
                    `role-${block.role}`,
                    done && 'is-done',
                    current && 'is-now',
                    missed && 'is-missed',
                    !task && 'is-empty',
                  )}
                  style={positionStyle(start, duration)}
                  title={`${block.label} · ${formatClock(start)}–${formatClock(endTime(start, duration))}`}
                  onClick={() => task && onOpenTask?.(task)}
                  disabled={!task || !onOpenTask}
                >
                  <span className="flow-study-top">
                    <span className="flow-study-short">{block.short}</span>
                    <span className="flow-study-tiny">{block.short.split(' ')[0]}</span>
                    <span className="flow-study-state">
                      {done ? <Check size={11} strokeWidth={3} /> : missed ? <span>·</span> : <Circle size={9} />}
                    </span>
                  </span>
                  <span className="flow-study-time">{formatClock(start)}</span>
                  <span className="flow-study-duration">{formatDuration(duration)}</span>
                </button>
              );
            })}
          </div>

          <div className="daily-flow-life-lane">
            <span className="daily-flow-lane-label">LIFE</span>
            {lifeBlocks.map((block) => {
              const Icon = CATEGORY_ICON[block.category];
              return (
                <span
                  key={block.id}
                  className={cx('flow-life-block', `cat-${block.category}`)}
                  style={positionStyle(block.start, block.duration)}
                  title={`${block.label} · ${formatClock(block.start)}–${formatClock(endTime(block.start, block.duration))}`}
                >
                  <Icon size={10} />
                </span>
              );
            })}
          </div>

          {showNow && (
            <div className="daily-flow-track" aria-hidden>
              <span className="daily-flow-now" style={{ left: `${nowLeft}%` }}>
                <i />
                <small>now</small>
              </span>
            </div>
          )}
        </div>
      </ScrollRail>

      {!bare && (
        <footer className="daily-flow-foot">
          <div className="daily-flow-legend">
            <span><i className="legend-study" /> Study</span>
            <span><i className="legend-life" /> Life & recovery</span>
            <span><i className="legend-now" /> Now</span>
          </div>
          {!preview && (
            <span className="daily-flow-note">
              <ArrowUpRight size={12} /> Fixed anchors. Delayed study slides into the next core slot;
              gym, meals and sleep never move.
            </span>
          )}
        </footer>
      )}
    </section>
  );
}
