import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Brain,
  CalendarClock,
  Check,
  Clock3,
  Crosshair,
  GraduationCap,
  Layers,
  Lock,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { SUBJECTS, TOPICS } from '../data/curriculum';
import { addDays, defaultExamDate, diffDays, formatDate, todayISO, weekdayIndex } from '../lib/utils';
import type { PrepLevel } from '../types';
import type { OnboardingInput } from '../hooks/usePlanner';

type Preset = 'gate' | 'blank';

const PREP_OPTIONS: { id: PrepLevel; label: string; hint: string }[] = [
  { id: 'first-time', label: 'First time', hint: 'Build from foundations' },
  { id: 'some-prep', label: 'Some prep', hint: 'One pass already done' },
  { id: 'exam-ready', label: 'Exam ready', hint: 'Revision + full mocks' },
];

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEK_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Onboarding({
  onComplete,
  defaultName = '',
  accountEmail,
}: {
  onComplete: (input: OnboardingInput) => void;
  defaultName?: string;
  accountEmail?: string;
}) {
  const today = todayISO();
  const [name, setName] = useState(defaultName);
  const [preset, setPreset] = useState<Preset>('gate');
  const [targetTitle, setTargetTitle] = useState('GATE CSE 2027');
  const [targetDate, setTargetDate] = useState(defaultExamDate());
  const [subjectSequence, setSubjectSequence] = useState<string[]>(
    SUBJECTS.map((subject) => subject.id),
  );
  const [excludedSubjects, setExcludedSubjects] = useState<Set<string>>(new Set());
  const [prepLevel, setPrepLevel] = useState<PrepLevel>('first-time');
  const [dayMinutes, setDayMinutes] = useState<number[]>(() => Array(7).fill(420));
  const minDate = addDays(today, 1);
  const hasDate = Boolean(targetDate) && diffDays(today, targetDate) >= 1;
  const days = hasDate ? Math.max(1, diffDays(today, targetDate)) : 30;
  const includedSubjects = subjectSequence.filter((id) => !excludedSubjects.has(id));
  const includedSet = new Set(includedSubjects);
  const selectedUnits = TOPICS
    .filter((topic) => includedSet.has(topic.subjectId))
    .reduce((sum, topic) => sum + topic.units, 0);
  const weeklyMinutes = dayMinutes.reduce((sum, value) => sum + value, 0);
  const mappedMinutes = useMemo(() => {
    if (!hasDate) return 0;
    let total = 0;
    for (let index = 0; index < days; index += 1) {
      total += dayMinutes[weekdayIndex(addDays(today, index))] ?? 0;
    }
    return total;
  }, [dayMinutes, days, hasDate, today]);
  const totalHours = Math.round(mappedMinutes / 60);
  const gateReady = includedSubjects.length > 0 && weeklyMinutes >= 60;
  const valid = Boolean(name.trim())
    && Boolean(targetTitle.trim())
    && (preset === 'blank' || (hasDate && gateReady));

  const choosePreset = (next: Preset) => {
    setPreset(next);
    if (next === 'gate') {
      setTargetTitle('GATE CSE 2027');
      setTargetDate(defaultExamDate());
    } else {
      setTargetTitle('My target');
      setTargetDate('');
    }
  };

  const moveSubject = (id: string, direction: -1 | 1) => {
    setSubjectSequence((prev) => {
      const index = prev.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const toggleSubject = (id: string) => {
    setExcludedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setDayHours = (day: number, hours: number) => {
    const minutes = Math.max(0, Math.min(16 * 60, Math.round((Number.isFinite(hours) ? hours : 0) * 60)));
    setDayMinutes((prev) => prev.map((value, index) => (index === day ? minutes : value)));
  };

  return (
    <div className="onboarding-layer">
      <div className="onboarding-glow glow-a" />
      <div className="onboarding-glow glow-b" />
      <div className="onboarding-grid" aria-hidden />
      <div className="onboarding-shell">
        <div className="onboarding-copy">
          <div className="onboarding-brand">
            <span className="brand-mark large" aria-hidden><i /><i /><i /><b /></span>
            <span>ASCENT <em>/</em> STUDY COMMAND CENTER</span>
          </div>
          <div className="onboarding-eyebrow"><Sparkles size={13} /> Any target. Any horizon. One command center.</div>
          <h1>
            Turn <span>{hasDate ? days : 30}</span> days<br />
            into a <em>machine.</em>
          </h1>
          <p className="onboarding-lede">
            Run an exam, a course and a skill at the same time. Every session is mapped to the hour,
            adaptive to every change, and engineered to compound — with or without a deadline.
          </p>

          <div className="onboarding-orbit" aria-hidden>
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className="orbit-core">
              <Trophy size={22} />
              <span>{hasDate ? 'SHOWTIME' : 'ROLLING'}</span>
              <strong>{hasDate ? `${days}d` : '30d'}</strong>
            </div>
            <div className="orbit-card card-a"><Crosshair size={14} /><span>Deep work</span><b>45m</b></div>
            <div className="orbit-card card-b"><Brain size={14} /><span>Recall</span><b>1.5h</b></div>
            <div className="orbit-card card-c"><Target size={14} /><span>Validation</span><b>45m</b></div>
          </div>

          <div className="onboarding-proof">
            <span><Check size={12} /> Multiple targets, one shared daily board</span>
            <span><Check size={12} /> Optional dates · no-date targets keep rolling</span>
            <span><Check size={12} /> Import a timetable or curriculum in bulk</span>
            <span><Check size={12} /> Private to your account · synced securely</span>
          </div>
        </div>

        <form
          className="onboarding-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) {
              onComplete({
                name: name.trim(),
                targetTitle: targetTitle.trim(),
                targetDate: hasDate ? targetDate : undefined,
                preset,
                subjectOrder: preset === 'gate' ? includedSubjects : undefined,
                prepLevel: preset === 'gate' ? prepLevel : undefined,
                dayMinutes: preset === 'gate' ? dayMinutes : undefined,
              });
            }
          }}
        >
          <div className="onboarding-form-head">
            <span className="eyebrow">INITIALIZE MISSION</span>
            <h2>Choose your first target.</h2>
            <p>Start from the GATE preset or a blank canvas. Add more targets any time.</p>
          </div>

          {accountEmail && (
            <div className="onboarding-account">
              <span className="onboarding-account-dot" />
              <span>Signed in as <b>{accountEmail}</b></span>
            </div>
          )}

          <label className="field">
            <span className="field-label">What should we call you?</span>
            <input
              className="text-input large"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your first name"
              autoFocus
              maxLength={32}
            />
          </label>

          <div className="field">
            <span className="field-label">Starting point</span>
            <div className="onboarding-preset-grid">
              <button
                type="button"
                className={`onboarding-preset ${preset === 'gate' ? 'is-active' : ''}`}
                onClick={() => choosePreset('gate')}
              >
                <span className="onboarding-preset-icon"><Trophy size={16} /></span>
                <span>
                  <strong>GATE CSE preset</strong>
                  <small>Daily Flow, 12 subjects and the full 209-unit map, ready to run.</small>
                </span>
                {preset === 'gate' && <Check size={14} className="onboarding-preset-check" />}
              </button>
              <button
                type="button"
                className={`onboarding-preset ${preset === 'blank' ? 'is-active' : ''}`}
                onClick={() => choosePreset('blank')}
              >
                <span className="onboarding-preset-icon"><Layers size={16} /></span>
                <span>
                  <strong>Start blank</strong>
                  <small>Any exam, course or skill. Import your own curriculum and timetable.</small>
                </span>
                {preset === 'blank' && <Check size={14} className="onboarding-preset-check" />}
              </button>
            </div>
          </div>

          <label className="field">
            <span className="field-label">Target name</span>
            <input
              className="text-input large"
              value={targetTitle}
              onChange={(event) => setTargetTitle(event.target.value)}
              placeholder={preset === 'gate' ? 'GATE CSE 2027' : 'e.g. AWS Solutions Architect'}
              maxLength={64}
            />
          </label>

          <label className="field">
            <span className="field-label">
              Target date <em>{preset === 'gate' ? 'required for the preset' : 'optional · leave blank to roll'}</em>
            </span>
            <div className="input-with-icon">
              <CalendarClock size={16} />
              <input
                type="date"
                className="text-input"
                value={targetDate}
                min={minDate}
                onChange={(event) => setTargetDate(event.target.value)}
              />
            </div>
            <span className="field-hint">
              {hasDate
                ? `${formatDate(targetDate, 'long')} · ${days} days from today`
                : preset === 'blank'
                  ? 'No date: a rolling 30-day plan that refreshes every day, with no countdown.'
                  : 'Choose a date at least tomorrow to anchor the GATE plan.'}
            </span>
          </label>

          {preset === 'gate' && (
            <div className="gate-setup">
              <div className="gate-setup-head">
                <span><GraduationCap size={14} /> GATE plan setup</span>
                <small>These choices shape the generated calendar, not just the theme.</small>
              </div>

              <div className="field">
                <span className="field-label">Preparation level</span>
                <div className="gate-prep-grid">
                  {PREP_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`gate-prep-option ${prepLevel === option.id ? 'is-active' : ''}`}
                      onClick={() => setPrepLevel(option.id)}
                    >
                      <strong>{option.label}</strong>
                      <small>{option.hint}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span className="field-label">
                  Subject sequence <em>{includedSubjects.length} of {SUBJECTS.length} included</em>
                </span>
                <div className="gate-subject-list">
                  {subjectSequence.map((id, index) => {
                    const subject = SUBJECTS.find((entry) => entry.id === id);
                    const included = !excludedSubjects.has(id);
                    return (
                      <div key={id} className={`gate-subject-row ${included ? '' : 'is-off'}`}>
                        <button
                          type="button"
                          className={`gate-subject-check ${included ? 'is-on' : ''}`}
                          onClick={() => toggleSubject(id)}
                          aria-pressed={included}
                          aria-label={`${included ? 'Exclude' : 'Include'} ${subject?.name ?? id}`}
                        >
                          {included && <Check size={10} />}
                        </button>
                        <span className="gate-subject-order">
                          {included ? includedSubjects.indexOf(id) + 1 : '—'}
                        </span>
                        <span className="gate-subject-name">
                          <strong>{subject?.name ?? id}</strong>
                          <small>{subject?.short ?? 'Subject'}</small>
                        </span>
                        <span className="gate-subject-move">
                          <button
                            type="button"
                            onClick={() => moveSubject(id, -1)}
                            disabled={index === 0}
                            aria-label={`Move ${subject?.name ?? id} up`}
                          >
                            <ArrowUp size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSubject(id, 1)}
                            disabled={index === subjectSequence.length - 1}
                            aria-label={`Move ${subject?.name ?? id} down`}
                          >
                            <ArrowDown size={11} />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <span className="field-hint">
                  The scheduler fills your available hours in this order. Unchecked subjects stay out of the plan.
                </span>
              </div>

              <div className="field">
                <span className="field-label">
                  Available study hours <em>{Math.round((weeklyMinutes / 60) * 10) / 10}h / week</em>
                </span>
                <div className="gate-hours-grid">
                  {WEEK_ORDER.map((day, index) => (
                    <label key={day} className="gate-hour">
                      <span><Clock3 size={9} /> {WEEK_LABEL[index]}</span>
                      <input
                        type="number"
                        min={0}
                        max={16}
                        step={0.5}
                        value={Number((dayMinutes[day] / 60).toFixed(2))}
                        onChange={(event) => setDayHours(day, Number(event.target.value))}
                      />
                    </label>
                  ))}
                </div>
                <span className="field-hint">
                  Per weekday. Use 0 for a full rest day — the GATE flow trims blocks to fit the hours you actually have.
                </span>
              </div>
            </div>
          )}

          <div className="onboarding-stats">
            {preset === 'gate' ? (
              <>
                <div><b>{includedSubjects.length}</b><span>subjects</span></div>
                <div><b>{selectedUnits}</b><span>units</span></div>
                <div><b>~{totalHours}h</b><span>mapped arc</span></div>
              </>
            ) : (
              <>
                <div><b>1</b><span>target to start</span></div>
                <div><b>{hasDate ? days : 30}</b><span>day window</span></div>
                <div><b>CSV</b><span>bulk import</span></div>
              </>
            )}
          </div>

          <button className="primary-button onboarding-submit" type="submit" disabled={!valid}>
            <span>Build my command center</span>
            <ArrowRight size={17} />
          </button>

          <div className="onboarding-privacy">
            <Lock size={12} />
            <span>Private to your account. Your plan syncs to the ASCENT database.</span>
          </div>

          <div className="onboarding-footnote">
            <span>{preset === 'gate' ? `GATE CSE ${targetDate.slice(0, 4) || new Date().getFullYear()}` : 'Universal study planner'} · adaptive scheduling</span>
            <span>v1.1</span>
          </div>
        </form>
      </div>
    </div>
  );
}
