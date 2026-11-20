import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Crosshair,
  Flag,
  Flame,
  Mountain,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Waves,
  Zap,
} from 'lucide-react';
import type { AppState, Task, View } from '../types';
import { computePhases, describeDayType } from '../lib/schedule';
import { hasGateTarget, planningEnd, primaryTarget } from '../lib/targets';
import {
  cx,
  diffDays,
  formatDate,
  formatDuration,
  formatMonth,
  hoursLabel,
  plural,
  rangeInclusive,
  startOfWeek,
  sumMinutes,
  todayISO,
  weekdayShort,
} from '../lib/utils';
import { AnimatedNumber, Badge, ProgressRing, Reveal, ScrollRail } from './ui';
import { TaskCard } from './TaskCard';

type RangeFilter = 'all' | '30' | 'milestones';

const RANGE_FILTERS: { id: RangeFilter; label: string }[] = [
  { id: 'all', label: 'Full horizon' },
  { id: '30', label: 'Next 30 days' },
  { id: 'milestones', label: 'Milestones only' },
];

const MILESTONE_KINDS = new Set<Task['kind']>(['mock', 'exam', 'analysis', 'revision']);

function dayLabel(
  tasks: Task[],
  isRest: boolean,
  inMockPhase: boolean,
  flowMode?: 'study' | 'mock' | 'revision' | 'rest',
) {
  if (tasks.some((task) => task.kind === 'exam')) return { label: 'Showtime', tone: 'rose' as const };
  if (isRest || flowMode === 'rest' || tasks.some((task) => task.kind === 'rest')) {
    return { label: 'Recovery', tone: 'neutral' as const };
  }
  if (flowMode === 'mock' || tasks.some((task) => task.kind === 'mock')) {
    return { label: 'Mock day', tone: 'amber' as const };
  }
  if (flowMode === 'revision') return { label: 'Final revision', tone: 'violet' as const };
  if (inMockPhase) return { label: 'Repair lab', tone: 'violet' as const };
  if (tasks.some((task) => task.kind === 'pyq')) return { label: 'Recon day', tone: 'violet' as const };
  return { label: 'Study day', tone: 'lime' as const };
}

export function JourneyView({
  state,
  onNavigate,
  onOpenTask,
  onOpenRipple,
}: {
  state: AppState;
  onNavigate: (view: View, date?: string) => void;
  onOpenTask: (task: Task) => void;
  onOpenRipple: () => void;
}) {
  const [range, setRange] = useState<RangeFilter>('all');
  const today = todayISO();
  const horizonEnd = planningEnd(state, today);
  const target = primaryTarget(state);
  const gate = hasGateTarget(state);
  const targetDates = state.targets
    .filter((entry) => !entry.archivedAt && entry.date)
    .map((entry) => entry.date as string);
  const phases = useMemo(() => computePhases(state.settings), [state.settings]);
  const allDates = useMemo(() => rangeInclusive(today, horizonEnd), [today, horizonEnd]);
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    state.tasks.forEach((task) => {
      const list = map.get(task.date) ?? [];
      list.push(task);
      map.set(task.date, list);
    });
    return map;
  }, [state.tasks]);

  const milestoneTasks = useMemo(
    () => state.tasks
      .filter((task) => task.kind === 'mock' || task.kind === 'exam')
      .filter((task) => task.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [state.tasks, today],
  );

  const visibleDates = useMemo(() => {
    if (range === '30') return allDates.slice(0, 31);
    if (range === 'milestones') {
      return allDates.filter((date) => {
        if (targetDates.includes(date)) return true;
        if (gate && phases.mockDates.includes(date)) return true;
        if (state.restDays.includes(date)) return true;
        return (tasksByDate.get(date) ?? []).some((task) => MILESTONE_KINDS.has(task.kind));
      });
    }
    return allDates;
  }, [range, allDates, phases.mockDates, state.restDays, tasksByDate, targetDates, gate]);

  const monthGroups = useMemo(() => {
    const groups: { key: string; label: string; dates: string[] }[] = [];
    visibleDates.forEach((date) => {
      const key = date.slice(0, 7);
      const last = groups[groups.length - 1];
      if (!last || last.key !== key) {
        groups.push({ key, label: formatMonth(date), dates: [date] });
      } else {
        last.dates.push(date);
      }
    });
    return groups;
  }, [visibleDates]);

  const totalPlanned = state.tasks.filter((task) => task.status !== 'skipped' && task.kind !== 'rest').length;
  const totalDone = state.tasks.filter((task) => task.status === 'done').length;
  const totalHours = sumMinutes(state.tasks.filter((task) => task.kind !== 'rest'));
  const doneHours = sumMinutes(state.tasks.filter((task) => task.status === 'done'));
  const mocksDone = state.tasks.filter((task) => task.kind === 'mock' && task.status === 'done').length;
  const missionPct = totalPlanned ? Math.round((totalDone / totalPlanned) * 100) : 0;
  const daysLeft = target?.date ? Math.max(0, diffDays(today, target.date)) : null;
  const weeksLeft = Math.ceil((daysLeft ?? state.settings.horizonDays) / 7);
  const activeMocks = milestoneTasks.filter((task) => task.kind === 'mock');
  const restCount = state.restDays.filter((date) => date >= today && date <= horizonEnd).length;

  return (
    <div className="journey-view">
      <section className="journey-hero">
        <div className="journey-hero-glow" aria-hidden />
        <div className="journey-hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> THE ASCENT · EVERY DAY UNTIL SHOWTIME</div>
          <h1>
            A plan you can<br />
            <em>see the end of.</em>
          </h1>
          <p>
            {daysLeft !== null
              ? gate
                ? `${daysLeft} days. ${weeksLeft} weekly arcs. Every PYQ, deep-work block and validation test laid out end-to-end — so you never have to wonder what today is for.`
                : `${daysLeft} days. ${weeksLeft} weekly arcs. Every session, milestone and deep-work block laid out end-to-end — so you never have to wonder what today is for.`
              : gate
                ? 'A rolling horizon with no countdown. Every PYQ, deep-work block and validation test laid out end-to-end — so you never have to wonder what today is for.'
                : 'A rolling horizon with no countdown. Every session, milestone and deep-work block laid out end-to-end — so you never have to wonder what today is for.'}
          </p>
          <div className="journey-hero-actions">
            <button className="primary-button" onClick={() => onNavigate('board', today)}>
              Open today’s board <ArrowRight size={15} />
            </button>
            <button className="ghost-button" onClick={onOpenRipple}>
              <Waves size={14} /> Ripple report
            </button>
          </div>
          <div className="journey-hero-stats">
            <div><strong><AnimatedNumber value={daysLeft ?? state.settings.horizonDays} /></strong><span>{daysLeft !== null ? 'days left' : 'day window'}</span></div>
            <div>
              <strong>{gate ? plural(activeMocks.length, 'mock') : milestoneTasks.length}</strong>
              <span>{gate ? 'boss fights' : 'milestones'}</span>
            </div>
            <div><strong>{restCount}</strong><span>recovery days</span></div>
            <div><strong>{hoursLabel(doneHours)}</strong><span>already banked</span></div>
          </div>
        </div>

        <div className="journey-orbit-card">
          <div className="journey-orbit-ring ring-a" aria-hidden />
          <div className="journey-orbit-ring ring-b" aria-hidden />
          <ProgressRing value={missionPct} size={196} stroke={11} label={`${missionPct}% of all planned sessions complete`}>
            <span className="journey-ring-value"><AnimatedNumber value={missionPct} /><small>%</small></span>
            <span className="journey-ring-label">mission complete</span>
          </ProgressRing>
          <div className="journey-orbit-nodes">
            <span><Circle size={9} fill="currentColor" /> {totalDone} cleared</span>
            <span><Circle size={9} /> {Math.max(0, totalPlanned - totalDone)} ahead</span>
          </div>
          <div className="journey-orbit-foot">
            <Crosshair size={12} /> {target?.date
              ? `${formatDate(target.date, 'short')} · ${target.title}`
              : `${target?.title ?? 'Rolling plan'} · no countdown`}
          </div>
        </div>
      </section>

      <Reveal className="journey-milestones" delay={60}>
        <div className="journey-section-head">
          <div>
            <span className="eyebrow">{gate ? 'BOSS FIGHTS' : 'KEY MILESTONES'}</span>
            <h2>The milestones that matter.</h2>
          </div>
          <span className="journey-section-note">
            <Swords size={13} /> {gate
              ? `${mocksDone}/${activeMocks.length} mocks defeated`
              : `${milestoneTasks.filter((task) => task.status === 'done').length}/${milestoneTasks.length} milestones cleared`}
          </span>
        </div>
        <ScrollRail
          scrollerClassName="milestone-scroll"
          hint="Scroll the milestones"
          label="milestones"
          scrollAmount={340}
        >
          {milestoneTasks.map((task) => {
            const done = task.status === 'done';
            const isExam = task.kind === 'exam';
            return (
              <button
                key={task.id}
                className={cx('milestone-card', isExam && 'is-exam', done && 'is-done')}
                onClick={() => onOpenTask(task)}
              >
                <span className="milestone-card-top">
                  <span className="milestone-icon">
                    {isExam ? <Trophy size={17} /> : <Swords size={17} />}
                  </span>
                  <Badge tone={isExam ? 'rose' : done ? 'green' : 'amber'}>
                    {done ? 'Done' : isExam ? (gate ? 'Final boss' : 'Target day') : 'Scheduled'}
                  </Badge>
                </span>
                <strong>{isExam ? `${target?.title ?? state.settings.examLabel} · Showtime` : task.title.replace('Full ', '')}</strong>
                <span className="milestone-date">{formatDate(task.date, 'long')}</span>
                <span className="milestone-meta">
                  <Clock3 size={11} /> {task.start} · {formatDuration(task.duration)}
                  {typeof task.score === 'number' && <b> · {task.score}/100</b>}
                </span>
                <span className="milestone-arrow"><ArrowUpRight size={14} /></span>
              </button>
            );
          })}
        </ScrollRail>
      </Reveal>

      <div className="journey-timeline-head">
        <div>
          <span className="eyebrow">THE FULL MAP</span>
          <h2>Day by day. No blind spots.</h2>
        </div>
        <div className="journey-filters">
          {RANGE_FILTERS.map((item) => (
            <button
              key={item.id}
              className={cx('filter-pill', range === item.id && 'is-active')}
              onClick={() => setRange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="journey-overview-strip">
        <div><span className="strip-icon lime"><Target size={14} /></span><small>SESSIONS MAPPED</small><strong>{totalPlanned}</strong></div>
        <div><span className="strip-icon violet"><Clock3 size={14} /></span><small>STUDY HOURS</small><strong>{hoursLabel(totalHours)}</strong></div>
        <div><span className="strip-icon amber"><Flame size={14} /></span><small>COMPLETED</small><strong>{totalDone}</strong></div>
        <div><span className="strip-icon sky"><Mountain size={14} /></span><small>WEEKS LEFT</small><strong>{weeksLeft}</strong></div>
      </div>

      <div className="journey-timeline">
        {monthGroups.map((month, monthIndex) => {
          const monthMinutes = month.dates.reduce((sum, date) => sum + sumMinutes(tasksByDate.get(date) ?? []), 0);
          return (
            <section key={month.key} className="journey-month" aria-label={month.label}>
              <header className="journey-month-head">
                <div>
                  <span className="month-index">{String(monthIndex + 1).padStart(2, '0')}</span>
                  <h3>{month.label}</h3>
                </div>
                <div className="month-meta">
                  <span>{plural(month.dates.length, 'day')}</span>
                  <span>{hoursLabel(monthMinutes)} planned</span>
                </div>
              </header>

              <div className="journey-days">
                {month.dates.map((date) => {
                  const tasks = tasksByDate.get(date) ?? [];
                  const shown = range === 'milestones'
                    ? tasks.filter((task) => MILESTONE_KINDS.has(task.kind) || task.kind === 'mock')
                    : tasks;
                  const done = tasks.filter((task) => task.status === 'done');
                  const isToday = date === today;
                  const isRest = state.restDays.includes(date);
                  const inMockPhase = gate && date >= phases.phaseStart;
                  const meta = dayLabel(tasks, isRest, inMockPhase);
                  const minutes = sumMinutes(tasks);
                  const progress = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
                  const isWeekStart = date === today || weekdayShort(date) === 'Mon';
                  const type = describeDayType(date, state.settings, { gate, targetDates });
                  const isExam = Boolean(target?.date) && date === target?.date;
                  return (
                    <div key={date} className={cx('journey-week-block', isWeekStart && 'is-week-start')}>
                      {isWeekStart && (
                        <div className="journey-week-label">
                          <span>{startOfWeek(date) === startOfWeek(today) ? 'This week' : `Week of ${formatDate(startOfWeek(date), 'short')}`}</span>
                          <span className="journey-week-line" />
                        </div>
                      )}
                      <div
                        className={cx(
                          'journey-day',
                          isToday && 'is-today',
                          isRest && 'is-rest',
                          isExam && 'is-exam',
                          type === 'mock' && 'is-mock',
                          done.length > 0 && done.length === tasks.length && tasks.length > 0 && 'is-complete',
                        )}
                        onClick={() => onNavigate('board', date)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onNavigate('board', date);
                          }
                        }}
                      >
                        <div className="journey-day-date">
                          <span>{weekdayShort(date)}</span>
                          <strong>{Number(date.slice(-2))}</strong>
                          <small>{formatDate(date, 'short').split(' ')[1]}</small>
                          <i className={cx('day-node', isToday && 'is-now')} />
                        </div>

                        <div className="journey-day-content">
                          <div className="journey-day-top">
                            <div className="journey-day-badges">
                              {isToday && <Badge tone="lime">Today</Badge>}
                              <Badge tone={meta.tone}>{isRest ? 'Recovery' : meta.label}</Badge>
                              {tasks.length > 0 && (
                                <span className="journey-day-meta">
                                  {plural(tasks.length, 'block')} · {minutes ? formatDuration(minutes) : 'flexible'}
                                </span>
                              )}
                            </div>
                            <div className="journey-day-right">
                              {tasks.length > 0 && (
                                <span className="journey-day-progress">
                                  <span className="mini-bar"><span style={{ width: `${progress}%` }} /></span>
                                  {done.length}/{tasks.length}
                                </span>
                              )}
                              <ChevronRight size={15} className="journey-day-chevron" />
                            </div>
                          </div>

                          {shown.length > 0 ? (
                            <div className="journey-task-list">
                              {shown.slice(0, 5).map((task) => (
                                <TaskCard key={task.id} task={task} onOpen={onOpenTask} journey />
                              ))}
                              {shown.length > 5 && (
                                <span className="journey-more">+{shown.length - 5} more</span>
                              )}
                            </div>
                          ) : (
                            <div className="journey-day-empty">
                              {isToday ? (
                                <><Sparkles size={12} /> Open canvas — map a block and make the day count.</>
                              ) : (
                                <><Circle size={9} /> Nothing mapped. The queue will fill this if needed.</>
                              )}
                            </div>
                          )}

                          {isExam && (
                            <div className="journey-exam-note">
                              <Flag size={14} /> The day the compounding stops. Walk in ready.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {monthGroups.length === 0 && (
          <div className="journey-empty">
            <Zap size={22} />
            <strong>No days match that filter.</strong>
            <span>Switch back to the full horizon to see the complete arc.</span>
          </div>
        )}
      </div>

      <footer className="journey-footer">
        <div>
          <Check size={14} /> Completed work stays fixed.
        </div>
        <div>
          <CalendarDays size={14} /> {target?.date
            ? `${formatDate(target.date, 'long')} · ${target.title}`
            : `Rolling ${state.settings.horizonDays}-day plan${target ? ` · ${target.title}` : ''}`}
        </div>
        <div>
          <span className="live-dot" /> {state.lastRipple ? 'Plan re-flowed recently' : 'Plan is stable'}
        </div>
      </footer>
    </div>
  );
}
