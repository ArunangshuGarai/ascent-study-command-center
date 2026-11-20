import { useMemo } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Crosshair,
  Crown,
  Flame,
  Layers,
  Lock,
  Medal,
  Play,
  Shield,
  Sparkles,
  Star,
  Sunrise,
  Swords,
  Target,
  Timer,
  Trophy,
  Waves,
  Zap,
} from 'lucide-react';
import type { AppState, Task, View } from '../types';
import { ACHIEVEMENTS } from '../data/curriculum';
import {
  achievementsUnlocked,
  addDays,
  cx,
  formatDate,
  formatDuration,
  hoursLabel,
  levelInfo,
  rangeInclusive,
  relativeDayLabel,
  startOfWeek,
  streakInfo,
  subjectById,
  subjectMastery,
  sumMinutes,
  taskXp,
  todayISO,
} from '../lib/utils';
import { AnimatedNumber, Badge, ProgressRing, Reveal, ScrollRail, SectionHead } from './ui';
import { taskKindMeta } from './TaskCard';
import { hasGateTarget } from '../lib/targets';

const ACHIEVEMENT_ICONS: Record<string, typeof Trophy> = {
  sunrise: Sunrise,
  brain: Brain,
  target: Target,
  flame: Flame,
  medal: Medal,
  layers: Layers,
  swords: Swords,
  shield: Shield,
  crown: Crown,
};

const FOCUS_GROUPS: { label: string; kinds: Task['kind'][]; color: string }[] = [
  { label: 'Deep work', kinds: ['study', 'practice'], color: '#D8FF6A' },
  { label: 'Past papers', kinds: ['pyq'], color: '#97A7FF' },
  { label: 'Tests & mocks', kinds: ['test', 'mock', 'analysis'], color: '#C8A8FF' },
  { label: 'Revision', kinds: ['revision'], color: '#63E6CE' },
  { label: 'Life', kinds: ['personal'], color: '#6BD6FF' },
];

export function InsightsView({
  state,
  onOpenTask,
  onLogScore,
  onStartFocus,
  onNavigate,
  onOpenRipple,
}: {
  state: AppState;
  onOpenTask: (task: Task) => void;
  onLogScore: (task: Task) => void;
  onStartFocus: (task?: Task) => void;
  onNavigate: (view: View, date?: string) => void;
  onOpenRipple: () => void;
}) {
  const today = todayISO();
  const gate = hasGateTarget(state);
  const xp = taskXp(state.tasks);
  const level = levelInfo(xp);
  const streak = streakInfo(state.tasks);
  const mastery = useMemo(() => subjectMastery(state.tasks), [state.tasks]);
  const doneTasks = useMemo(() => state.tasks.filter((task) => task.status === 'done'), [state.tasks]);
  const unlocked = useMemo(() => new Set(achievementsUnlocked(state)), [state]);
  const doneMinutes = sumMinutes(doneTasks);
  const studyMinutes = sumMinutes(doneTasks.filter((task) => task.kind === 'study' || task.kind === 'practice'));
  const completionRate = (() => {
    const relevant = state.tasks.filter((task) => task.kind !== 'rest' && task.date <= today);
    const done = relevant.filter((task) => task.status === 'done').length;
    return relevant.length ? Math.round((done / relevant.length) * 100) : 0;
  })();
  const nextTask = state.tasks
    .filter((task) => task.date === today && task.status === 'todo' && task.kind !== 'rest')
    .sort((a, b) => a.start.localeCompare(b.start))[0];

  const mocks = useMemo(
    () => state.tasks.filter((task) => task.kind === 'mock').sort((a, b) => a.date.localeCompare(b.date)),
    [state.tasks],
  );
  const scoredMocks = mocks.filter((task) => typeof task.score === 'number');
  const avgScore = scoredMocks.length
    ? Math.round(scoredMocks.reduce((sum, task) => sum + (task.score ?? 0), 0) / scoredMocks.length)
    : null;
  const bestScore = scoredMocks.length ? Math.max(...scoredMocks.map((task) => task.score ?? 0)) : null;

  const recent = useMemo(
    () => [...doneTasks]
      .sort((a, b) => (b.completedAt ?? b.date).localeCompare(a.completedAt ?? a.date))
      .slice(0, 7),
    [doneTasks],
  );

  const focusMix = useMemo(() => {
    const total = FOCUS_GROUPS.reduce((sum, group) => {
      return sum + doneTasks.filter((task) => group.kinds.includes(task.kind)).reduce((inner, task) => inner + task.duration, 0);
    }, 0);
    return FOCUS_GROUPS.map((group) => {
      const minutes = doneTasks
        .filter((task) => group.kinds.includes(task.kind))
        .reduce((sum, task) => sum + task.duration, 0);
      return { ...group, minutes, pct: total ? (minutes / total) * 100 : 0 };
    });
  }, [doneTasks]);

  const focusGradient = useMemo(() => {
    let cursor = 0;
    const stops = focusMix
      .filter((group) => group.pct > 0)
      .map((group) => {
        const from = cursor;
        cursor += group.pct;
        return `${group.color} ${from.toFixed(1)}% ${cursor.toFixed(1)}%`;
      });
    return stops.length ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(rgba(255,255,255,.08) 0 100%)';
  }, [focusMix]);

  const heatWeeks = useMemo(() => {
    const start = startOfWeek(addDays(today, -28));
    const dates = rangeInclusive(start, addDays(start, 83));
    const taskMap = new Map<string, Task[]>();
    state.tasks.forEach((task) => {
      const list = taskMap.get(task.date) ?? [];
      list.push(task);
      taskMap.set(task.date, list);
    });
    const weeks: { start: string; days: { date: string; tasks: Task[] }[] }[] = [];
    dates.forEach((date, index) => {
      if (index % 7 === 0) weeks.push({ start: date, days: [] });
      weeks[weeks.length - 1].days.push({ date, tasks: taskMap.get(date) ?? [] });
    });
    return weeks;
  }, [state.tasks, today]);

  const weeklyLoad = useMemo(() => {
    const start = startOfWeek(today);
    return Array.from({ length: 8 }).map((_, index) => {
      const weekStart = addDays(start, index * 7);
      const dates = new Set(rangeInclusive(weekStart, addDays(weekStart, 6)));
      const tasks = state.tasks.filter((task) => dates.has(task.date) && task.kind !== 'rest');
      const done = tasks.filter((task) => task.status === 'done');
      return {
        weekStart,
        planned: sumMinutes(tasks),
        done: sumMinutes(done),
        count: tasks.length,
        doneCount: done.length,
      };
    });
  }, [state.tasks, today]);
  const maxWeekly = Math.max(60, ...weeklyLoad.map((week) => week.planned));

  const achievementTiers = ACHIEVEMENTS.reduce<Record<string, boolean>>((acc, achievement) => {
    acc[achievement.id] = unlocked.has(achievement.id);
    return acc;
  }, {});
  const nextLevelXp = level.nextAt;

  return (
    <div className="insights-view">
      <section className="insights-hero">
        <div className="insights-hero-glow" aria-hidden />
        <div className="insights-level-column">
          <ProgressRing value={level.progress * 100} size={184} stroke={10} label={`${Math.round(level.progress * 100)}% to ${level.nextName}`}>
            <span className="rank-overline">RANK {level.index}</span>
            <span className="rank-title">{level.name}</span>
            <span className="rank-xp"><AnimatedNumber value={xp} /> XP</span>
          </ProgressRing>
          <div className="rank-progress-note">
            {nextLevelXp ? (
              <><span>{level.toNext.toLocaleString()} XP</span> to {level.nextName}</>
            ) : (
              <><Crown size={13} /> Maximum rank secured</>
            )}
          </div>
        </div>

        <div className="insights-hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> PILOT DOSSIER · {formatDate(today, 'long')}</div>
          <h1>{state.profile.name.split(' ')[0] || 'Pilot'}, the numbers are <em>moving.</em></h1>
          <p>
            {doneTasks.length} sessions banked. {hoursLabel(doneMinutes)} of deliberate work.
            {' '}
            {streak.current > 0
              ? `A ${streak.current}-day flame is still alive.`
              : 'The next session is the one that starts the flame.'}
          </p>
          <div className="insights-hero-actions">
            <button className="primary-button" onClick={() => onStartFocus(nextTask)}>
              <Play size={13} fill="currentColor" /> {nextTask ? 'Start next session' : 'Open focus timer'}
            </button>
            <button className="ghost-button" onClick={() => onNavigate('board', today)}>
              Open sprint board <ArrowRight size={14} />
            </button>
          </div>
          <div className="insights-quick-stats">
            <div><small>COMPLETION RATE</small><strong>{completionRate}%</strong><span>sessions to date</span></div>
            <div><small>DEEP WORK</small><strong>{hoursLabel(studyMinutes)}</strong><span>focused study</span></div>
            <div><small>BEST STREAK</small><strong>{streak.best}<span className="inline-unit">d</span></strong><span>{streak.studyDays} active days</span></div>
          </div>
        </div>

        <div className="insights-quote-card">
          <span className="quote-mark">“</span>
          <p>
            {completionRate >= 70
              ? 'Consistency is becoming identity. Protect the boring repetition — it is quietly building the rank.'
              : doneTasks.length > 0
                ? 'The work is landing. The next level isn’t a new plan; it’s a tighter loop on the one you have.'
                : 'The first block is the hardest. After that, the board starts pulling you forward.'}
          </p>
          <div className="quote-meta">
            <span><Sparkles size={12} /> Command center signal</span>
            <span>{formatDate(state.settings.examDate, 'short')}</span>
          </div>
          <div className="quote-orbit" aria-hidden><i /><i /><i /></div>
        </div>
      </section>

      <Reveal className="insight-grid" delay={60}>
        <div className="insight-card span-two">
          <div className="card-head-inline">
            <div>
              <span className="eyebrow">MOMENTUM MAP</span>
              <h3>Twelve weeks of compounding.</h3>
            </div>
            <span className="heatmap-legend">
              <i className="heat-empty" /> empty
              <i className="heat-l1" /> planned
              <i className="heat-l3" /> active
              <i className="heat-l4" /> cleared
            </span>
          </div>
          <ScrollRail
            scrollerClassName="heatmap-shell"
            hint="Scroll the weeks"
            label="momentum map"
            scrollAmount={220}
          >
            <div className="heatmap-weekdays">
              <span>Mon</span><span>Wed</span><span>Fri</span><span>Sun</span>
            </div>
            <div className="heatmap-grid">
              {heatWeeks.map((week) => (
                <div key={week.start} className="heatmap-week">
                  {week.days.map(({ date, tasks }) => {
                    const done = tasks.filter((task) => task.status === 'done').length;
                    const planned = tasks.filter((task) => task.kind !== 'rest').length;
                    const isRest = state.restDays.includes(date);
                    const hasMock = tasks.some((task) => task.kind === 'mock' || task.kind === 'exam');
                    const missed = tasks.some((task) => task.status === 'missed');
                    const levelClass = isRest
                      ? 'heat-rest'
                      : hasMock
                        ? 'heat-mock'
                        : missed
                          ? 'heat-missed'
                          : done >= 3
                            ? 'heat-l4'
                            : done > 0
                              ? 'heat-l3'
                              : planned > 0
                                ? 'heat-l1'
                                : 'heat-empty';
                    return (
                      <span
                        key={date}
                        className={cx('heat-cell', levelClass, date === today && 'is-today')}
                        title={`${formatDate(date, 'medium')} · ${done}/${planned} blocks cleared`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </ScrollRail>
          <div className="heatmap-foot">
            <span><Flame size={12} /> {streak.current} current streak</span>
            <span>{streak.studyDays} study days logged</span>
            <span>{streak.best} best run</span>
          </div>
        </div>

        <div className="insight-card">
          <div className="card-head-inline">
            <div>
              <span className="eyebrow">FOCUS MIX</span>
              <h3>Where the hours went.</h3>
            </div>
            <Timer size={17} className="card-icon" />
          </div>
          <div className="focus-donut-wrap">
            <div className="focus-donut" style={{ background: focusGradient }}>
              <div className="focus-donut-center">
                <strong>{hoursLabel(doneMinutes)}</strong>
                <span>invested</span>
              </div>
            </div>
            <div className="focus-legend">
              {focusMix.map((group) => (
                <div key={group.label} className={cx('focus-legend-row', group.minutes === 0 && 'is-zero')}>
                  <i style={{ background: group.color }} />
                  <span>{group.label}</span>
                  <b>{group.minutes ? formatDuration(group.minutes) : '—'}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="focus-foot">
            <span><Crosshair size={12} /> {gate ? 'PYQ before theory' : 'Plan before you start'}</span>
            <span><Target size={12} /> {gate ? 'Test before sleep' : 'Review before you move on'}</span>
          </div>
        </div>

        <div className="insight-card span-two">
          <div className="card-head-inline">
            <div>
              <span className="eyebrow">SUBJECT MASTERY</span>
              <h3>The fronts, ranked by ground taken.</h3>
            </div>
            <button className="text-button" onClick={() => onNavigate('syllabus')}>
              Open syllabus <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="mastery-list">
            {[...mastery].sort((a, b) => b.subject.weight - a.subject.weight).map((entry) => (
              <button
                key={entry.subject.id}
                className="mastery-row"
                onClick={() => onNavigate('syllabus')}
              >
                <span className="mastery-short" style={{ color: entry.subject.color }}>{entry.subject.short}</span>
                <span className="mastery-name">{entry.subject.name}</span>
                <div className="mastery-bar"><span style={{ width: `${entry.pct}%`, background: entry.subject.color }} /></div>
                <b>{entry.pct}%</b>
                <small>{entry.done}/{entry.total}</small>
              </button>
            ))}
          </div>
          <div className="mastery-foot">
            <span><Star size={12} /> Weighted by 15-year paper frequency</span>
            <span><Brain size={12} /> Confidence ratings update the plan queue</span>
          </div>
        </div>

        <div className="insight-card">
          <div className="card-head-inline">
            <div>
              <span className="eyebrow">NEXT 8 WEEKS</span>
              <h3>Planned load.</h3>
            </div>
            <CalendarDays size={17} className="card-icon" />
          </div>
          <div className="weekly-chart">
            {weeklyLoad.map((week, index) => {
              const plannedHeight = Math.max(4, (week.planned / maxWeekly) * 100);
              const doneHeight = week.planned ? (week.done / week.planned) * plannedHeight : 0;
              return (
                <div key={week.weekStart} className="week-column" title={`Week of ${formatDate(week.weekStart, 'short')} · ${week.doneCount}/${week.count} sessions cleared`}>
                  <div className="week-bar-track">
                    <span className="week-bar" style={{ height: `${plannedHeight}%` }}>
                      <span className="week-bar-done" style={{ height: `${(doneHeight / plannedHeight) * 100}%` }} />
                    </span>
                  </div>
                  <span>{index === 0 ? 'Now' : formatDate(week.weekStart, 'short').split(' ')[0]}</span>
                  <small>{hoursLabel(week.planned)}</small>
                </div>
              );
            })}
          </div>
          <div className="weekly-foot">
            <span><span className="legend-dot planned" /> planned</span>
            <span><span className="legend-dot done" /> cleared</span>
          </div>
        </div>

        <div className="insight-card span-two mock-lab-card">
          <div className="card-head-inline">
            <div>
              <span className="eyebrow">MOCK LAB</span>
              <h3>Boss fights, scored.</h3>
            </div>
            <div className="mock-avg">
              <span>AVG</span>
              <strong>{avgScore !== null ? `${avgScore}%` : '—'}</strong>
              <small>{bestScore !== null ? `best ${bestScore}%` : 'no score logged'}</small>
            </div>
          </div>
          <div className="mock-row-list">
            {mocks.map((mock) => (
              <button
                key={mock.id}
                className={cx('mock-row', mock.status === 'done' && 'is-done')}
                onClick={() => onOpenTask(mock)}
              >
                <span className="mock-index">{mock.mockNo ?? '—'}</span>
                <span className="mock-copy">
                  <strong>{mock.title}</strong>
                  <small>{formatDate(mock.date, 'medium')} · {relativeDayLabel(mock.date)}</small>
                </span>
                <span className="mock-scorer">
                  {typeof mock.score === 'number' ? (
                    <>
                      <span className="mock-score-bar"><i style={{ width: `${mock.score}%` }} /></span>
                      <b>{mock.score}%</b>
                    </>
                  ) : mock.status === 'done' ? (
                    <span className="mock-log-score">Log score</span>
                  ) : (
                    <Badge tone={mock.status === 'missed' ? 'rose' : 'amber'}>
                      {mock.status === 'missed' ? 'Missed' : 'Ahead'}
                    </Badge>
                  )}
                </span>
                {mock.status === 'done' && typeof mock.score !== 'number' ? (
                  <span
                    className="mock-log-action"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onLogScore(mock);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.stopPropagation();
                        onLogScore(mock);
                      }
                    }}
                  >
                    <ArrowUpRight size={14} />
                  </span>
                ) : (
                  <ChevronRight size={15} className="mock-chevron" />
                )}
              </button>
            ))}
          </div>
          <div className="mock-foot">
            <span><Shield size={12} /> One full simulation per boss fight</span>
            <span><Waves size={12} /> Autopsy is mandatory. Score is feedback, not identity.</span>
          </div>
        </div>

        <div className="insight-card">
          <div className="card-head-inline">
            <div>
              <span className="eyebrow">RECENT LOG</span>
              <h3>Proof of work.</h3>
            </div>
            <button className="icon-button small" onClick={() => onNavigate('journey')} aria-label="Open journey">
              <ArrowUpRight size={15} />
            </button>
          </div>
          {recent.length === 0 ? (
            <div className="recent-empty">
              <Sunrise size={22} />
              <strong>No completed sessions yet.</strong>
              <span>Bank the first block and this log starts writing itself.</span>
            </div>
          ) : (
            <div className="recent-list">
              {recent.map((task) => {
                const meta = taskKindMeta(task);
                const Icon = meta.icon;
                return (
                  <button key={task.id} className="recent-row" onClick={() => onOpenTask(task)}>
                    <span className="recent-icon" style={{ color: meta.color }}><Icon size={14} /></span>
                    <span className="recent-copy">
                      <strong>{task.title}</strong>
                      <small>{relativeDayLabel(task.date)} · {subjectById(task.subjectId)?.short ?? meta.label}</small>
                    </span>
                    <span className="recent-xp">+{task.xp}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="recent-foot">
            <span><Check size={12} /> {doneTasks.length} total sessions cleared</span>
            <span><Clock3 size={12} /> {hoursLabel(doneMinutes)} banked</span>
          </div>
        </div>
      </Reveal>

      <Reveal className="achievement-section" delay={100}>
        <SectionHead
          eyebrow={`${unlocked.size}/${ACHIEVEMENTS.length} BADGES UNLOCKED`}
          title="The trophy shelf."
          description="Every badge is a behaviour. Not a participation sticker — a receipt for work that actually moved the plan."
          actions={<Badge tone="lime"><Award size={12} /> {unlocked.size} earned</Badge>}
        />
        <div className="achievement-grid">
          {ACHIEVEMENTS.map((achievement) => {
            const Icon = ACHIEVEMENT_ICONS[achievement.icon] ?? Trophy;
            const isUnlocked = achievementTiers[achievement.id];
            return (
              <div key={achievement.id} className={cx('achievement-card', `tier-${achievement.tier}`, isUnlocked && 'is-unlocked')}>
                <span className="achievement-medal">
                  {isUnlocked ? <Icon size={20} /> : <Lock size={17} />}
                </span>
                <div>
                  <strong>{achievement.name}</strong>
                  <p>{achievement.description}</p>
                </div>
                <Badge tone={isUnlocked ? 'lime' : 'neutral'}>{isUnlocked ? 'Unlocked' : achievement.tier}</Badge>
              </div>
            );
          })}
        </div>
      </Reveal>

      <footer className="insights-footer">
        <div className="insights-footer-copy">
          <span className="eyebrow">THE COMPOUND INTEREST OF SHOWING UP</span>
          <p>Your rank is a side effect. The real asset is the version of you who no longer negotiates with the plan.</p>
        </div>
        <div className="insights-footer-actions">
          {state.lastRipple && (
            <button className="ghost-button" onClick={onOpenRipple}>
              <Waves size={14} /> View last ripple
            </button>
          )}
          <button className="primary-button" onClick={() => onStartFocus(nextTask)}>
            <Zap size={14} /> {nextTask ? 'Start next block' : 'Focus timer'}
          </button>
        </div>
      </footer>
    </div>
  );
}
