import { useMemo, useRef, type PointerEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  CalendarClock,
  Check,
  ChevronRight,
  Circle,
  Crosshair,
  Flame,
  Plus,
  Sparkles,
  Target,
  Terminal,
  Timer,
  Trophy,
  Waves,
  Zap,
} from 'lucide-react';
import type { AppState, SlotId, StudyTarget, Task } from '../types';
import { BLUEPRINT } from '../data/curriculum';
import {
  cx,
  coverageStats,
  formatDate,
  formatDuration,
  formatMonth,
  getStreakEmoji,
  hoursLabel,
  levelInfo,
  plural,
  relativeDayLabel,
  subjectById,
  sumMinutes,
  taskXp,
  todayISO,
  topicById,
  topicUnitsDone,
} from '../lib/utils';
import { computePhases } from '../lib/schedule';
import { hasGateTarget, targetDaysLeft } from '../lib/targets';
import { AnimatedNumber, Badge, ProgressRing, Reveal, SectionHead } from './ui';
import { BoardSurface, DndStage } from './Board';
import { KIND_META } from './TaskCard';
import { DailyFlowRail } from './DailyFlowRail';

export function CommandCenter({
  state,
  target,
  streak,
  onNavigate,
  onOpenTask,
  onComplete,
  onAddTask,
  onToggleRest,
  onOpenBlueprint,
  onOpenPrompt,
  onOpenFocus,
  onOpenRipple,
  onMoveTask,
}: {
  state: AppState;
  target?: StudyTarget;
  streak: number;
  onNavigate: (view: 'today' | 'board' | 'journey' | 'syllabus' | 'insights' | 'settings', date?: string) => void;
  onOpenTask: (task: Task) => void;
  onComplete: (task: Task) => void;
  onAddTask: (date: string, slot?: SlotId) => void;
  onToggleRest: (date: string) => void;
  onOpenBlueprint: () => void;
  onOpenPrompt: () => void;
  onOpenFocus: (task?: Task) => void;
  onOpenRipple: () => void;
  onMoveTask: (task: Task, date: string, slot: SlotId) => void;
}) {
  const today = todayISO();
  const gate = hasGateTarget(state);
  const daysToTarget = target ? targetDaysLeft(target) : null;
  const heroRef = useRef<HTMLDivElement>(null);
  const todayTasks = state.tasks.filter((task) => task.date === today);
  const baseTasks = todayTasks.filter((task) => task.kind !== 'rest');
  const doneTasks = baseTasks.filter((task) => task.status === 'done');
  const studyTasks = todayTasks.filter((task) => task.kind === 'study');
  const doneStudy = studyTasks.filter((task) => task.status === 'done');
  const pyqTasks = todayTasks.filter((task) => task.kind === 'pyq');
  const testTasks = todayTasks.filter((task) => task.kind === 'test' || task.kind === 'mock');
  const todayMinutes = sumMinutes(baseTasks);
  const doneMinutes = sumMinutes(doneTasks);
  const todayXp = doneTasks.reduce((sum, task) => sum + task.xp, 0);
  const pct = baseTasks.length ? Math.round((doneTasks.length / baseTasks.length) * 100) : 0;
  const coverage = useMemo(() => coverageStats(state.tasks), [state.tasks]);
  const doneUnits = useMemo(
    () => Array.from(topicUnitsDone(state.tasks).values()).reduce((sum, value) => sum + value, 0),
    [state.tasks],
  );
  const level = levelInfo(taskXp(state.tasks));
  const nextTask = [...baseTasks]
    .filter((task) => task.status === 'todo')
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const focusTask = nextTask ?? undefined;
  const phases = computePhases(state.settings);
  const isRest = state.restDays.includes(today);
  const isMockPhase = today >= phases.phaseStart;
  const nextStudy = state.tasks.find(
    (task) => task.date >= today && task.kind === 'study' && task.status === 'todo' && task.topicId,
  );
  const nextTopic = nextStudy?.topicId ? topicById(nextStudy.topicId) : undefined;
  const phaseLabel = !gate
    ? target?.date
      ? 'Target sprint'
      : 'Rolling plan'
    : isMockPhase
      ? 'Exam simulation phase'
      : nextTopic
        ? `Phase ${nextTopic.phase} · ${
          nextTopic.phase === 1
            ? 'Foundation build'
            : nextTopic.phase === 2
              ? 'High-yield systems'
              : 'Architecture & theory'
        }`
        : 'Final polish';
  const focusSubjects = Array.from(new Set(
    studyTasks.map((task) => task.subjectId).filter(Boolean),
  )).map((id) => subjectById(id!)).filter((subject): subject is NonNullable<typeof subject> => Boolean(subject));
  const nextMock = state.tasks
    .filter((task) => task.kind === 'mock' && task.date >= today && task.status !== 'done')
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const examTask = state.tasks.find((task) => task.kind === 'exam');
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();
  const quests = gate
    ? [
      {
        label: 'Bank a deep-work block',
        detail: studyTasks.length ? `${doneStudy.length}/${studyTasks.length} sessions` : 'Recovery day',
        done: studyTasks.length > 0 && doneStudy.length === studyTasks.length,
        icon: Brain,
      },
      {
        label: 'Touch the past paper',
        detail: pyqTasks.length ? `${pyqTasks.filter((task) => task.status === 'done').length}/${pyqTasks.length} recon` : 'No PYQ today',
        done: pyqTasks.length > 0 && pyqTasks.every((task) => task.status === 'done'),
        icon: Crosshair,
      },
      {
        label: 'Close the validation loop',
        detail: testTasks.length ? `${testTasks.filter((task) => task.status === 'done').length}/${testTasks.length} test` : 'No test today',
        done: testTasks.length > 0 && testTasks.every((task) => task.status === 'done'),
        icon: Target,
      },
    ]
    : [
      {
        label: 'Bank a deep-work block',
        detail: studyTasks.length ? `${doneStudy.length}/${studyTasks.length} sessions` : 'Nothing scheduled today',
        done: studyTasks.length > 0 && doneStudy.length === studyTasks.length,
        icon: Brain,
      },
      {
        label: 'Clear the day',
        detail: baseTasks.length ? `${doneTasks.length}/${baseTasks.length} blocks` : 'Open canvas',
        done: baseTasks.length > 0 && doneTasks.length === baseTasks.length,
        icon: Target,
      },
      {
        label: 'Protect the streak',
        detail: streak ? `${streak}-day streak · keep it lit` : 'One session lights the flame',
        done: streak > 0,
        icon: Flame,
      },
    ];

  const methodSteps = gate
    ? BLUEPRINT.slice(0, 3)
    : [
      {
        id: 'plan',
        title: 'Plan the block',
        when: 'Start of day',
        copy: 'Choose one clear outcome before you open a book. A block without an objective becomes scrolling.',
      },
      {
        id: 'focus',
        title: 'Do the deep work',
        when: 'Focus window',
        copy: 'One subject, one target, one timer. Finish the rep before you judge the session.',
      },
      {
        id: 'review',
        title: 'Review the loop',
        when: 'End of day',
        copy: 'Mark what stuck and what needs another pass. Tomorrow starts from this note, not from zero.',
      },
    ];

  const onHeroMove = (event: PointerEvent<HTMLDivElement>) => {
    const target = heroRef.current;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    target.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    target.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  const progressMessage = pct === 100
    ? 'Day cleared. Every loop closed.'
    : pct >= 50
      ? 'Over the halfway ridge. Keep the line.'
      : doneTasks.length > 0
        ? 'Momentum is live. One block at a time.'
        : 'The board is set. Make the first move.';

  return (
    <div className="command-center">
      <section className="hero-grid">
        <div className="hero-panel" ref={heroRef} onPointerMove={onHeroMove}>
          <div className="hero-noise" aria-hidden />
          <div className="hero-topline">
            <span className="live-label"><span className="live-dot" /> LIVE PLAN · {phaseLabel.toUpperCase()}</span>
            <span className="hero-top-meta">{target?.title ?? state.settings.examLabel} · {formatMonth(today)}</span>
          </div>

          <div className="hero-body">
            <div className="hero-copy">
              <h1>
                {greeting}, {state.profile.name.split(' ')[0] || 'Pilot'}.<br />
                <em>
                  {daysToTarget === null
                    ? 'The plan rolls. Keep showing up.'
                    : daysToTarget === 0
                      ? 'Showtime.'
                      : `${daysToTarget} days to showtime.`}
                </em>
              </h1>
              <p>
                Every session is a compounding vote for the version of you who finishes knowing the
                work was done.
              </p>
              <div className="hero-actions">
                <button
                  className="primary-button"
                  onClick={() => onOpenFocus(focusTask)}
                  disabled={!focusTask}
                >
                  <span className="button-icon"><Timer size={15} /></span>
                  {focusTask ? 'Enter focus mode' : 'Today is cleared'}
                  <ArrowRight size={15} />
                </button>
                <button
                  className="ghost-button"
                  onClick={() => document.getElementById('today-board')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  Today’s board
                  <ChevronRight size={15} />
                </button>
                <button className="text-button" onClick={onOpenBlueprint}>
                  <Sparkles size={14} /> Daily blueprint
                </button>
              </div>
              <button className="hero-command-bar" onClick={onOpenPrompt}>
                <span className="hero-command-mark"><Terminal size={15} /></span>
                <span className="hero-command-copy">
                  <strong>Command the center</strong>
                  <small>“45m DBMS normalization tomorrow 6pm” · “gym Sunday 8am”</small>
                </span>
                <span className="hero-command-key">⌘J</span>
                <ArrowRight size={15} className="hero-command-arrow" />
              </button>
              <div className="hero-metrics">
                <div>
                  <span>Syllabus cleared</span>
                  <strong><AnimatedNumber value={doneUnits} format={(value) => `${value} / ${coverage.totalUnits}`} /></strong>
                  <small>{coverage.pct}% mapped · {coverage.deferredTopicCount} topics ahead</small>
                </div>
                <div>
                  <span>Hours invested</span>
                  <strong><AnimatedNumber value={Math.round(sumMinutes(state.tasks.filter((task) => task.status === 'done')) / 60)} format={(value) => `${value}h`} /></strong>
                  <small>{hoursLabel(todayMinutes)} planned today</small>
                </div>
                <div>
                  <span>Streak</span>
                  <strong>{getStreakEmoji(streak)} {streak} {streak === 1 ? 'day' : 'days'}</strong>
                  <small>{streak ? 'flame alive · keep it lit' : 'one session lights the flame'}</small>
                </div>
              </div>
            </div>

            <div className="hero-countdown">
              <div className="countdown-orbit orbit-outer" />
              <div className="countdown-orbit orbit-inner" />
              <div className="countdown-ring">
                <div className="countdown-value">
                  <span className="countdown-label">{daysToTarget !== null ? 'DAYS TO' : 'PLANNING'}</span>
                  <strong><AnimatedNumber value={daysToTarget ?? state.settings.horizonDays} /></strong>
                  <span className="countdown-sub">{daysToTarget !== null ? 'SHOWTIME' : 'DAY WINDOW'}</span>
                </div>
              </div>
              <div className="orbit-node node-one" />
              <div className="orbit-node node-two" />
              <div className="countdown-footer">
                <CalendarClock size={12} />
                {target
                  ? target.date
                    ? `${formatDate(target.date, 'short')} · ${target.title}`
                    : `${target.title} · rolling plan, no countdown`
                  : `Rolling ${state.settings.horizonDays}-day plan`}
              </div>
              {examTask && (
                <button className="exam-flag" onClick={() => onOpenTask(examTask)}>
                  <Trophy size={12} /> Final boss on the calendar
                </button>
              )}
            </div>
          </div>

          <div className="hero-status-strip">
            <span><span className={cx('status-pulse', isRest && 'rest')} /> {isRest ? 'Recovery mode' : 'Plan synced'}</span>
            <span>{formatDate(today, 'long')}</span>
            <span className="hero-status-end">Ripple engine armed · last change {state.lastRipple ? 're-flowed' : 'none yet'}</span>
          </div>
        </div>

        <aside className="pulse-card">
          <div className="pulse-head">
            <span className="eyebrow">TODAY’S PULSE</span>
            <Badge tone={pct === 100 ? 'lime' : 'neutral'}>{plural(doneTasks.length, 'block')} cleared</Badge>
          </div>
          <div className="pulse-main">
            <ProgressRing value={pct} size={128} stroke={9} label={`${pct}% of today's plan complete`}>
              <span className="ring-big">{pct}<small>%</small></span>
              <span className="ring-sub">{doneTasks.length}/{baseTasks.length || 0} blocks</span>
            </ProgressRing>
            <div className="pulse-stats">
              <div>
                <span>EXP today</span>
                <strong><AnimatedNumber value={todayXp} format={(value) => `+${value}`} /></strong>
              </div>
              <div>
                <span>Focus time</span>
                <strong>{hoursLabel(doneMinutes)}</strong>
              </div>
              <div>
                <span>Rank</span>
                <strong className="rank-name">{level.name}</strong>
              </div>
            </div>
          </div>
          <p className="pulse-message">{progressMessage}</p>
          <div className="quest-list">
            <div className="quest-title">Today’s quests</div>
            {quests.map((quest) => {
              const Icon = quest.icon;
              return (
                <div key={quest.label} className={cx('quest-item', quest.done && 'is-done')}>
                  <span className="quest-check">{quest.done ? <Check size={11} strokeWidth={3} /> : <Circle size={11} />}</span>
                  <Icon size={14} />
                  <span className="quest-label">{quest.label}</span>
                  <span className="quest-detail">{quest.detail}</span>
                </div>
              );
            })}
          </div>
          <div className="pulse-foot">
            <span className="xp-track"><span style={{ width: `${level.progress * 100}%` }} /></span>
            <span>{level.nextAt ? `${level.toNext} XP to ${level.nextName}` : 'Max rank'}</span>
          </div>
        </aside>
      </section>

      <Reveal className="vitals-row" delay={80}>
        <div className="vital-card">
          <span className="vital-icon lime"><Zap size={15} /></span>
          <div><small>TOTAL XP</small><strong>{taskXp(state.tasks).toLocaleString()}</strong></div>
          <span className="vital-note">{level.name} · Lv {level.index}</span>
        </div>
        <div className="vital-card">
          <span className="vital-icon violet"><Timer size={15} /></span>
          <div><small>DEEP WORK</small><strong>{hoursLabel(sumMinutes(state.tasks.filter((task) => task.status === 'done' && task.kind === 'study')))}</strong></div>
          <span className="vital-note">{hoursLabel(sumMinutes(state.tasks.filter((task) => task.kind === 'study')))} mapped</span>
        </div>
        <div className="vital-card">
          <span className="vital-icon amber"><Flame size={15} /></span>
          <div><small>DONE SESSIONS</small><strong>{state.tasks.filter((task) => task.status === 'done').length}</strong></div>
          <span className="vital-note">{state.tasks.filter((task) => task.status === 'todo').length} ahead</span>
        </div>
        <div className="vital-card">
          <span className="vital-icon sky"><CalendarClock size={15} /></span>
          <div><small>NEXT MILESTONE</small><strong>{nextMock ? formatDate(nextMock.date, 'short') : target?.date ? formatDate(target.date, 'short') : 'Rolling plan'}</strong></div>
          <span className="vital-note">
            {nextMock ? nextMock.title.replace('Full Mock', 'Mock') : gate ? 'Final boss' : target?.title ?? 'No countdown'}
          </span>
        </div>
      </Reveal>

      {state.settings.dailyFlow && gate && (
        <Reveal delay={100}>
          <DailyFlowRail date={today} tasks={todayTasks} onOpenTask={onOpenTask} />
        </Reveal>
      )}

      <Reveal className="today-board-section" delay={120}>
        <div id="today-board" className="board-anchor" />
        <SectionHead
          eyebrow={`${formatDate(today, 'long')} · ${plural(baseTasks.length, 'block')} mapped`}
          title={isRest ? 'Today is a recovery simulation.' : 'Today’s flight plan'}
          description={
            isRest
              ? 'Planned rest is a performance decision. Recover fully, then return sharper.'
              : focusSubjects.length
                ? `Focus: ${focusSubjects.map((subject) => subject.short).join(' · ')}. Drag any card to re-time it; drag onto another day in the Sprint Board to re-flow the rest of the plan.`
                : 'No study blocks mapped yet. Add one, or open the Sprint Board to explore the horizon.'
          }
          actions={
            <div className="board-actions">
              <button className="small-button ghost" onClick={() => onAddTask(today)}>
                <Plus size={14} /> Add block
              </button>
              <button className={cx('small-button ghost', isRest && 'is-active')} onClick={() => onToggleRest(today)}>
                {isRest ? 'Remove recovery day' : 'Make it a rest day'}
              </button>
              <button className="small-button" onClick={() => onNavigate('board', today)}>
                Open full board <ArrowUpRight size={14} />
              </button>
            </div>
          }
        />
        <div className="day-progress-strip">
          <span className="day-progress-label">DAY COMPLETION</span>
          <span className="day-progress-track"><span style={{ width: `${pct}%` }} /></span>
          <span className="day-progress-value">{pct}%</span>
          <span className="day-progress-meta">
            {formatDuration(doneMinutes)} / {formatDuration(todayMinutes)} banked
          </span>
        </div>
        <DndStage
          tasks={state.tasks}
          onDragEnd={(task, date, slot) => onMoveTask(task, date, slot)}
          onOpen={onOpenTask}
        >
          <BoardSurface
            date={today}
            tasks={todayTasks}
            onOpen={onOpenTask}
            onComplete={onComplete}
            onAddTask={(slot) => onAddTask(today, slot)}
            completionDisabled={false}
          />
        </DndStage>
      </Reveal>

      <div className="today-bottom-grid">
        <Reveal className="method-card" delay={60}>
          <div className="card-head-inline">
            <div>
              <span className="eyebrow">THE METHOD</span>
              <h3>{gate ? 'PYQ before theory. Test before sleep.' : 'Plan the work. Work the plan. Review the loop.'}</h3>
            </div>
            <button className="icon-button small" onClick={onOpenBlueprint} aria-label="Open daily blueprint">
              <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="method-steps">
            {methodSteps.map((step, index) => {
              const done = gate
                ? index === 0
                  ? pyqTasks.length > 0 && pyqTasks.every((task) => task.status === 'done')
                  : index === 1
                    ? studyTasks.length > 0 && doneStudy.length === studyTasks.length
                    : testTasks.length > 0 && testTasks.every((task) => task.status === 'done')
                : index === 0
                  ? baseTasks.length > 0 && doneTasks.length > 0
                  : index === 1
                    ? studyTasks.length > 0 && doneStudy.length === studyTasks.length
                    : baseTasks.length > 0 && doneTasks.length === baseTasks.length;
              return (
                <div key={step.id} className={cx('method-step', done && 'is-done')}>
                  <span className="method-index">{done ? <Check size={12} /> : `0${index + 1}`}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.when}</small>
                    <p>{step.copy}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>

        <Reveal className="next-card" delay={120}>
          <div className="card-head-inline">
            <div>
              <span className="eyebrow">NEXT ON DECK</span>
              <h3>{nextTask ? 'The next right move.' : 'Everything is cleared.'}</h3>
            </div>
            <button className="icon-button small" onClick={() => onNavigate('journey')} aria-label="Open journey">
              <ArrowUpRight size={16} />
            </button>
          </div>
          {nextTask ? (
            <button className="next-task-row" onClick={() => onOpenTask(nextTask)}>
              <span className="next-task-time">{nextTask.start}</span>
              <span className="next-task-dot" style={{ background: subjectById(nextTask.subjectId)?.color ?? KIND_META[nextTask.kind].color }} />
              <span className="next-task-copy">
                <strong>{nextTask.title}</strong>
                <small>{relativeDayLabel(nextTask.date)} · {formatDuration(nextTask.duration)} · {nextTask.xp} XP</small>
              </span>
              <span className="next-task-go"><ArrowRight size={15} /></span>
            </button>
          ) : (
            <div className="day-cleared">
              <span className="day-cleared-icon"><Trophy size={26} /></span>
              <strong>Day cleared. Flame protected.</strong>
              <p>Rest is earned. Tomorrow’s queue is already waiting.</p>
              <button className="ghost-button" onClick={() => onNavigate('journey')}>See the ascent <ArrowRight size={15} /></button>
            </div>
          )}
          <div className="next-divider" />
          <div className="next-foot">
            {gate ? (
              <>
                <div>
                  <span className="eyebrow">NEXT MOCK</span>
                  <strong>{nextMock ? formatDate(nextMock.date, 'medium') : 'All mocks done'}</strong>
                </div>
                <div>
                  <span className="eyebrow">MOCKS LEFT</span>
                  <strong>{state.tasks.filter((task) => task.kind === 'mock' && task.status !== 'done').length}</strong>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="eyebrow">TARGET DATE</span>
                  <strong>{target?.date ? formatDate(target.date, 'medium') : 'Rolling'}</strong>
                </div>
                <div>
                  <span className="eyebrow">DAYS LEFT</span>
                  <strong>{daysToTarget ?? '—'}</strong>
                </div>
              </>
            )}
            <div>
              <span className="eyebrow">SYLLABUS</span>
              <strong>{coverage.pct}% mapped</strong>
            </div>
          </div>
        </Reveal>

        <Reveal className="ripple-card" delay={180}>
          <div className="card-head-inline">
            <div>
              <span className="eyebrow">RIPPLE ENGINE</span>
              <h3>{state.lastRipple ? 'Your last change, propagated.' : 'Change one thing. Re-flow everything.'}</h3>
            </div>
            <span className="ripple-icon"><Waves size={17} /></span>
          </div>
          {state.lastRipple ? (
            <>
              <p className="ripple-reason">{state.lastRipple.reason}</p>
              <div className="ripple-stats">
                <div><strong>{state.lastRipple.sessionsMoved}</strong><span>sessions moved</span></div>
                <div><strong>{state.lastRipple.daysAffected}</strong><span>days touched</span></div>
                <div><strong>{state.lastRipple.coverageBefore}→{state.lastRipple.coverageAfter}%</strong><span>coverage</span></div>
              </div>
              <button className="ghost-button full" onClick={onOpenRipple}>
                View ripple report <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <>
              <p className="ripple-reason">Skip a session, move a block, take a rest day or change the exam date. The engine re-packs every unresolved unit into the remaining calendar.</p>
              <div className="ripple-rule">
                <span>Completed work stays fixed.</span>
                <span>Manual blocks stay pinned.</span>
                <span>Everything else adapts.</span>
              </div>
              <button className="ghost-button full" onClick={() => onNavigate('board', today)}>
                Try it on the board <ArrowRight size={14} />
              </button>
            </>
          )}
        </Reveal>
      </div>
    </div>
  );
}
