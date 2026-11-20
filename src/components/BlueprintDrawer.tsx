import {
  ArrowRight,
  Brain,
  CalendarDays,
  Check,
  Crosshair,
  Flame,
  Mountain,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
} from 'lucide-react';
import type { AppState, View } from '../types';
import {
  BLUEPRINT,
  STRATEGY_PHASES,
} from '../data/curriculum';
import {
  cx,
  formatDate,
  formatDuration,
  hoursLabel,
  todayISO,
} from '../lib/utils';
import { Badge, Drawer } from './ui';

const BLUEPRINT_ICONS: Record<string, typeof Crosshair> = {
  crosshair: Crosshair,
  brain: Brain,
  target: Target,
  mountain: Mountain,
};

const UNIVERSAL_BLUEPRINT = [
  {
    id: 'plan',
    title: 'Plan the block',
    when: 'Start of day · 5 min',
    copy: 'Choose one clear outcome before you begin. A block with no objective turns into open-ended scrolling.',
    icon: 'target',
  },
  {
    id: 'focus',
    title: 'Deep Work',
    when: 'Your best window · 45–120 min',
    copy: 'One subject, one objective, one timer. Protect the block from notifications and finish the rep.',
    icon: 'brain',
  },
  {
    id: 'review',
    title: 'Review & Repair',
    when: 'End of day · 10 min',
    copy: 'Mark what stuck, note what needs another pass, and move the next block forward. Tomorrow starts from this note.',
    icon: 'crosshair',
  },
];

const ROLE_ACCENT: Record<string, string> = {
  pyq: 'violet',
  core: 'lime',
  test: 'amber',
  deepdive: 'violet',
  weekly: 'rose',
};

export function BlueprintDrawer({
  open,
  state,
  onClose,
  onNavigate,
}: {
  open: boolean;
  state: AppState;
  onClose: () => void;
  onNavigate: (view: View, date?: string) => void;
}) {
  const settings = state.settings;
  const subjects = state.subjects;
  const topics = state.topics;
  const totalUnits = topics.reduce((sum, topic) => sum + topic.units, 0);
  const hasGate = state.targets.some((target) => target.preset === 'gate-cse' && !target.archivedAt);
  const blueprintSteps = hasGate ? BLUEPRINT : UNIVERSAL_BLUEPRINT;
  const topSubjects = [...subjects].sort((a, b) => b.weight - a.weight);
  const maxWeight = Math.max(...subjects.map((subject) => subject.weight), 1);
  const weekdayMinutes = settings.weekday.reduce((sum, block) => sum + block.duration, 0);
  const weekendMinutes = settings.weekend.reduce((sum, block) => sum + block.duration, 0);
  const heavyLabels = settings.heavyDays.map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]);
  const highYield = topics.filter((topic) => topic.highYield).length;

  return (
    <Drawer open={open} onClose={onClose} className="blueprint-drawer" labelledBy="blueprint-title">
      <div className="blueprint-shell">
        <header className="blueprint-head">
          <div className="blueprint-head-icon"><Sparkles size={20} /></div>
          <div>
            <span className="eyebrow">THE METHOD</span>
            <h2 id="blueprint-title">{hasGate ? 'Built from the paper, not a vibe.' : 'Built around your curriculum.'}</h2>
            <p>
              {hasGate
                ? 'Fifteen years of GATE CSE patterns turned into a daily operating system.'
                : 'Your targets, topics and time turned into a repeatable daily operating system.'}
            </p>
          </div>
          <Badge tone="lime">{hasGate ? '15-year analysis' : 'Adaptive method'}</Badge>
        </header>

        <div className="blueprint-source-strip">
          <div><strong>{subjects.length}</strong><span>subjects</span></div>
          <div><strong>{topics.length}</strong><span>focus topics</span></div>
          <div><strong>{totalUnits}</strong><span>45-min units</span></div>
          <div><strong>{highYield}</strong><span>high-yield topics</span></div>
          <div><strong>{heavyLabels.join(' · ') || '—'}</strong><span>heavy-lift days</span></div>
        </div>

        <section className="blueprint-section">
          <div className="blueprint-section-head">
            <div>
              <span className="eyebrow">THE DAILY LOOP</span>
              <h3>{hasGate ? 'Recon. Deep work. Validate.' : 'Plan. Focus. Review.'}</h3>
            </div>
            <span className="blueprint-note"><Timer size={12} /> {hoursLabel(weekdayMinutes)} on a standard day</span>
          </div>
          <div className="blueprint-steps">
            {blueprintSteps.map((step, index) => {
              const Icon = BLUEPRINT_ICONS[step.icon] ?? Crosshair;
              return (
                <div key={step.id} className="blueprint-step">
                  <span className="blueprint-step-index">0{index + 1}</span>
                  <span className="blueprint-step-icon"><Icon size={16} /></span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.when}</small>
                    <p>{step.copy}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="blueprint-section">
          <div className="blueprint-section-head">
            <div>
              <span className="eyebrow">YOUR RHYTHM</span>
              <h3>The actual timetable.</h3>
            </div>
            <span className="blueprint-note"><Mountain size={12} /> {hoursLabel(weekendMinutes)} on heavy days</span>
          </div>
          <div className="rhythm-grid">
            {[
              { label: 'Standard day', blocks: settings.weekday, meta: `${hoursLabel(weekdayMinutes)} structured` },
              { label: 'Heavy-lift day', blocks: settings.weekend, meta: `${hoursLabel(weekendMinutes)} structured` },
            ].map((group) => (
              <div key={group.label} className="rhythm-column">
                <div className="rhythm-column-head">
                  <strong>{group.label}</strong>
                  <span>{group.meta}</span>
                </div>
                {group.blocks.map((block) => (
                  <div key={block.id} className="rhythm-row">
                    <span className={cx('rhythm-dot', `dot-${ROLE_ACCENT[block.role] ?? 'neutral'}`)} />
                    <span className="rhythm-time">{block.start}</span>
                    <span className="rhythm-label">{block.label}</span>
                    <span className="rhythm-duration">{formatDuration(block.duration)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="blueprint-section">
          <div className="blueprint-section-head">
            <div>
              <span className="eyebrow">THE ARC</span>
              <h3>{hasGate ? 'Ten weeks, four phases.' : 'Every target on one map.'}</h3>
            </div>
            <span className="blueprint-note">
              <CalendarDays size={12} /> {hasGate
                ? 'From foundations to showtime'
                : `${state.targets.filter((target) => !target.archivedAt).length} active targets`}
            </span>
          </div>
          <div className="phase-list">
            {hasGate ? STRATEGY_PHASES.map((phase) => (
              <div key={phase.id} className="phase-row">
                <span className="phase-marker">{phase.label}</span>
                <div className="phase-copy">
                  <div>
                    <strong>{phase.name}</strong>
                    <span>{phase.weeks}</span>
                  </div>
                  <p>{phase.copy}</p>
                  <div className="phase-subjects">
                    {phase.subjects.map((subject) => <span key={subject}>{subject}</span>)}
                  </div>
                </div>
              </div>
            )) : state.targets.filter((target) => !target.archivedAt).map((target, index) => {
              const targetSubjects = subjects.filter((subject) => subject.targetId === target.id);
              const targetTopics = topics.filter((topic) => topic.targetId === target.id);
              return (
                <div key={target.id} className="phase-row">
                  <span className="phase-marker">{String(index + 1).padStart(2, '0')}</span>
                  <div className="phase-copy">
                    <div>
                      <strong>{target.title}</strong>
                      <span>
                        {target.date
                          ? `${formatDate(target.date, 'short')} · ${target.kind}`
                          : `Rolling ${state.settings.horizonDays}-day plan`}
                      </span>
                    </div>
                    <p>
                      {target.notes?.trim()
                        || `${targetSubjects.length} subjects · ${targetTopics.length} topics · ${targetTopics.reduce((sum, topic) => sum + topic.units, 0)} units.`}
                    </p>
                    <div className="phase-subjects">
                      {targetSubjects.slice(0, 8).map((subject) => (
                        <span key={subject.id}>{subject.short}</span>
                      ))}
                      {targetSubjects.length > 8 && <span>+{targetSubjects.length - 8}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="blueprint-section">
          <div className="blueprint-section-head">
            <div>
              <span className="eyebrow">WHERE THE MARKS LIVE</span>
              <h3>Weightage, sorted.</h3>
            </div>
            <span className="blueprint-note"><Star size={12} /> {hasGate ? '15-year paper frequency' : 'Your priority weights'}</span>
          </div>
          <div className="weightage-list">
            {topSubjects.map((subject, index) => (
              <div key={subject.id} className="weightage-row">
                <span className="weightage-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="weightage-short" style={{ color: subject.color }}>{subject.short}</span>
                <span className="weightage-name">{subject.name}</span>
                <div className="weightage-track">
                  <span style={{ width: `${(subject.weight / maxWeight) * 100}%`, background: subject.color }} />
                </div>
                <strong>{subject.weight}%</strong>
                {subject.tier === 1 && <Badge tone="lime"><Flame size={10} /> Core</Badge>}
              </div>
            ))}
          </div>
        </section>

        <div className="blueprint-lesson">
          <Trophy size={17} />
          <div>
            <strong>The one rule that compounds.</strong>
            <p>
              {hasGate
                ? 'Never study a topic without a past-paper reason. Never finish a session without a test. Never let a missed day silently disappear — re-flow it and keep moving.'
                : 'Never start a block without a clear outcome. Never let a missed day silently disappear — re-flow it and keep moving. Show up for the next rep.'}
            </p>
          </div>
        </div>

        <div className="blueprint-actions">
          <button
            className="primary-button"
            onClick={() => {
              onNavigate('board', todayISO());
              onClose();
            }}
          >
            Apply it to today <ArrowRight size={14} />
          </button>
          <button
            className="ghost-button"
            onClick={() => {
              onNavigate('journey');
              onClose();
            }}
          >
            <CalendarDays size={14} /> See the full ascent
          </button>
        </div>

        <footer className="blueprint-foot">
          <span><Check size={12} /> {hasGate ? 'Built from your attached GATE CSE paper topic analysis' : 'Built from your subjects, topics and priorities'}</span>
          <span>v1.1</span>
        </footer>
      </div>
    </Drawer>
  );
}
