import { useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookMarked,
  Brain,
  Check,
  ChevronDown,
  Circle,
  Crosshair,
  Flame,
  Layers,
  Search,
  Sparkles,
  Star,
  Target,
  Zap,
} from 'lucide-react';
import type { AppState, SubjectId, View } from '../types';
import {
  cx,
  formatDate,
  hoursLabel,
  plural,
  sumMinutes,
  taskXp,
  todayISO,
} from '../lib/utils';
import { Badge } from './ui';

type PhaseFilter = 'all' | 1 | 2 | 3;

const PHASE_FILTERS: { id: PhaseFilter; label: string }[] = [
  { id: 'all', label: 'All phases' },
  { id: 1, label: 'Phase 1 · Foundations' },
  { id: 2, label: 'Phase 2 · Systems' },
  { id: 3, label: 'Phase 3 · Theory' },
];

export function SyllabusView({
  state,
  onBoost,
  onSetConfidence,
  onNavigate,
}: {
  state: AppState;
  onBoost: (subjectId: SubjectId) => void;
  onSetConfidence: (topicId: string, confidence: number) => void;
  onNavigate: (view: View, date?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<PhaseFilter>('all');
  const [highYieldOnly, setHighYieldOnly] = useState(false);
  const [expanded, setExpanded] = useState<SubjectId | null>(null);
  const today = todayISO();
  const subjects = state.subjects;
  const topics = state.topics;
  const totalTopicUnits = topics.reduce((sum, topic) => sum + topic.units, 0);
  const normalizedQuery = query.trim().toLowerCase();
  const autoOpen = Boolean(normalizedQuery);

  const taskStats = useMemo(() => {
    const map = new Map<string, {
      done: number;
      planned: number;
      total: number;
      nextDate?: string;
      minutes: number;
    }>();
    topics.forEach((topic) => {
      map.set(topic.id, { done: 0, planned: 0, total: topic.units, minutes: 0 });
    });
    state.tasks.forEach((task) => {
      if (task.kind !== 'study' || !task.topicId) return;
      const entry = map.get(task.topicId);
      if (!entry) return;
      if (task.status === 'done') {
        entry.done += 1;
        entry.minutes += task.duration;
      }
      if (task.status !== 'skipped' && task.status !== 'missed') {
        entry.planned += 1;
        if (!entry.nextDate && task.status === 'todo' && task.date >= today) entry.nextDate = task.date;
      }
    });
    return map;
  }, [state.tasks, topics, today]);

  const confidenceMap = useMemo(
    () => new Map(state.topicProgress.map((entry) => [entry.topicId, entry.confidence])),
    [state.topicProgress],
  );

  const subjectStats = useMemo(() => {
    return subjects.map((subject) => {
      const subjectTopics = topics.filter((topic) => topic.subjectId === subject.id);
      const totalUnits = subjectTopics.reduce((sum, topic) => sum + topic.units, 0);
      const doneUnits = subjectTopics.reduce((sum, topic) => sum + (taskStats.get(topic.id)?.done ?? 0), 0);
      const plannedUnits = subjectTopics.reduce((sum, topic) => sum + (taskStats.get(topic.id)?.planned ?? 0), 0);
      const confidenceValues = subjectTopics.map((topic) => confidenceMap.get(topic.id) ?? 3);
      const confidence = confidenceValues.reduce((sum, value) => sum + value, 0) / Math.max(1, confidenceValues.length);
      const highYield = subjectTopics.filter((topic) => topic.highYield).length;
      const minutesDone = subjectTopics.reduce((sum, topic) => sum + (taskStats.get(topic.id)?.minutes ?? 0), 0);
      return {
        subject,
        topics: subjectTopics,
        totalUnits,
        doneUnits,
        plannedUnits,
        confidence,
        highYield,
        minutesDone,
        mastery: totalUnits ? Math.round((doneUnits / totalUnits) * 100) : 0,
        coverage: totalUnits ? Math.round((plannedUnits / totalUnits) * 100) : 0,
      };
    });
  }, [taskStats, confidenceMap, subjects, topics]);

  const filtered = useMemo(() => {
    return subjectStats
      .filter((entry) => phase === 'all' || entry.subject.phase === phase)
      .map((entry) => {
        const topics = entry.topics.filter((topic) => {
          if (highYieldOnly && !topic.highYield) return false;
          if (!normalizedQuery) return true;
          const subjectMatch = entry.subject.name.toLowerCase().includes(normalizedQuery)
            || entry.subject.short.toLowerCase().includes(normalizedQuery)
            || entry.subject.tagline.toLowerCase().includes(normalizedQuery);
          if (subjectMatch) return true;
          return topic.title.toLowerCase().includes(normalizedQuery)
            || topic.keyPoints.some((point) => point.toLowerCase().includes(normalizedQuery));
        });
        return { ...entry, topics };
      })
      .filter((entry) => entry.topics.length > 0)
      .sort((a, b) => b.subject.weight - a.subject.weight);
  }, [subjectStats, phase, highYieldOnly, normalizedQuery]);

  const coverage = useMemo(() => {
    const covered = subjectStats.reduce((sum, entry) => sum + Math.min(entry.totalUnits, entry.plannedUnits), 0);
    const done = subjectStats.reduce((sum, entry) => sum + entry.doneUnits, 0);
    return {
      coveredUnits: covered,
      doneUnits: done,
      pct: totalTopicUnits ? Math.round((covered / totalTopicUnits) * 100) : 0,
      mastery: totalTopicUnits ? Math.round((done / totalTopicUnits) * 100) : 0,
    };
  }, [subjectStats, totalTopicUnits]);

  const highYieldCount = topics.filter((topic) => topic.highYield).length;
  const targetNames = new Map(state.targets.map((target) => [target.id, target.title]));
  const totalHours = hoursLabel(sumMinutes(state.tasks.filter((task) => task.subjectId)));
  const avgConfidence = subjectStats.length
    ? subjectStats.reduce((sum, entry) => sum + entry.confidence, 0) / subjectStats.length
    : 0;
  const weakest = [...subjectStats].sort((a, b) => a.coverage - b.coverage || b.subject.weight - a.subject.weight)[0];

  return (
    <div className="syllabus-view">
      <header className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> SYLLABUS CARTOGRAPHY</div>
          <h1>{totalTopicUnits} units. {subjects.length} {subjects.length === 1 ? 'front' : 'fronts'}.</h1>
          <p className="page-lede">
            {state.targets.some((target) => target.preset === 'gate-cse' && !target.archivedAt)
              ? 'The full GATE CSE map, weighted by fifteen years of papers. Boost a weak front and the scheduler pulls it to the front of the queue.'
              : 'Every subject and topic across your targets, weighted by the priority you gave it. Boost a weak front and the scheduler pulls it forward.'}
          </p>
        </div>
        <div className="page-actions">
          <button
            className="small-button ghost"
            onClick={() => weakest && onBoost(weakest.subject.id)}
            title={`Boost ${weakest?.subject.name ?? 'the weakest subject'}`}
          >
            <Zap size={14} /> Boost weakest
          </button>
          <button className="small-button" onClick={() => onNavigate('board', today)}>
            Today’s board <ArrowUpRight size={15} />
          </button>
        </div>
      </header>

      <div className="syllabus-stats">
        <div className="syllabus-stat-card primary">
          <div className="syllabus-stat-head"><span>SYLLABUS ARC</span><Target size={15} /></div>
          <strong>{coverage.pct}<small>%</small></strong>
          <div className="syllabus-stat-bar"><span style={{ width: `${coverage.pct}%` }} /></div>
          <p>{coverage.coveredUnits} of {totalTopicUnits} units mapped across the calendar</p>
        </div>
        <div className="syllabus-stat-card">
          <div className="syllabus-stat-head"><span>MASTERED</span><Brain size={15} /></div>
          <strong>{coverage.mastery}<small>%</small></strong>
          <p>{coverage.doneUnits} units cleared · {totalHours} of study mapped</p>
          <div className="stat-foot">{coverage.doneUnits === 0 ? 'First session lights the map.' : 'Confidence through reps, not re-reading.'}</div>
        </div>
        <div className="syllabus-stat-card">
          <div className="syllabus-stat-head"><span>HIGH-YIELD UNITS</span><Star size={15} /></div>
          <strong>{highYieldCount}<small> topics</small></strong>
          <p>Recurring across the 15-year paper analysis</p>
          <div className="stat-foot">Every one is woven into your deep-work queue.</div>
        </div>
        <div className="syllabus-stat-card">
          <div className="syllabus-stat-head"><span>SELF-RATED CONFIDENCE</span><Flame size={15} /></div>
          <strong>{avgConfidence.toFixed(1)}<small>/5</small></strong>
          <p>Average across all twelve fronts</p>
          <div className="stat-foot">Rate honestly. The plan can only adapt to the truth.</div>
        </div>
      </div>

      <div className="weight-spine">
        <div className="weight-spine-head">
          <div>
            <span className="eyebrow">WEIGHTAGE SPINE</span>
            <h3>What the paper actually rewards.</h3>
          </div>
          <span className="weight-sup">Source · your curriculum priority weights</span>
        </div>
        <div className="weight-bar">
          {subjects.map((subject) => (
            <button
              key={subject.id}
              className={cx('weight-segment', state.boostedSubjects.includes(subject.id) && 'is-boosted')}
              style={{ background: subject.color, flexGrow: subject.weight }}
              title={`${subject.name} · ${subject.weight}% weight`}
              onClick={() => onBoost(subject.id)}
            >
              <span>{subject.short}</span>
              <b>{subject.weight}</b>
            </button>
          ))}
        </div>
        <div className="weight-legend">
          <span><i className="legend-line" /> Click a segment to boost that subject’s queue order</span>
          <span>{state.boostedSubjects.length ? `${state.boostedSubjects.length} boosted` : 'Standard priority order'}</span>
        </div>
      </div>

      <div className="syllabus-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search subjects, topics, traps…"
            aria-label="Search the syllabus"
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
              <Circle size={13} fill="currentColor" />
            </button>
          )}
        </label>
        <div className="filter-pills">
          {PHASE_FILTERS.map((item) => (
            <button
              key={String(item.id)}
              className={cx('filter-pill', phase === item.id && 'is-active')}
              onClick={() => setPhase(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button
            className={cx('filter-pill high-yield-filter', highYieldOnly && 'is-active')}
            onClick={() => setHighYieldOnly((value) => !value)}
          >
            <Star size={12} /> High-yield
          </button>
        </div>
      </div>

      <div className="subject-grid">
        {filtered.map((entry) => {
          const open = expanded === entry.subject.id || autoOpen;
          const boosted = state.boostedSubjects.includes(entry.subject.id);
          const completed = entry.doneUnits >= entry.totalUnits;
          return (
            <article
              key={entry.subject.id}
              className={cx(
                'subject-card',
                open && 'is-open',
                boosted && 'is-boosted',
                completed && 'is-complete',
              )}
              style={{ '--subject-color': entry.subject.color } as CSSProperties}
            >
              <div className="subject-color-rail" aria-hidden />
              <header
                className="subject-card-head"
                onClick={() => setExpanded(open ? null : entry.subject.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setExpanded(open ? null : entry.subject.id);
                  }
                }}
              >
                <div className="subject-ident">
                  <span className="subject-monogram" style={{ color: entry.subject.color }}>{entry.subject.short}</span>
                  <span className="subject-title-block">
                    <span className="subject-weight-label">
                      {entry.subject.weight}% weight · Tier {entry.subject.tier}
                      {entry.subject.targetId && targetNames.get(entry.subject.targetId) ? ` · ${targetNames.get(entry.subject.targetId)}` : ''}
                    </span>
                    <h3>{entry.subject.name}</h3>
                    <p>{entry.subject.tagline}</p>
                  </span>
                </div>
                <div className="subject-card-side">
                  <span className="subject-coverage-pct" style={{ color: entry.subject.color }}>{entry.mastery}%</span>
                  <span className="subject-coverage-label">mastered</span>
                  <ChevronDown size={16} className={cx('subject-chevron', open && 'is-open')} />
                </div>
              </header>

              <div className="subject-summary">
                <div className="subject-mini-stats">
                  <div><small>UNITS</small><strong>{entry.doneUnits}/{entry.totalUnits}</strong></div>
                  <div><small>SESSIONS</small><strong>{entry.plannedUnits} mapped</strong></div>
                  <div><small>HOURS</small><strong>{hoursLabel(entry.minutesDone)}</strong></div>
                  <div><small>CONFIDENCE</small><strong>{entry.confidence.toFixed(1)}/5</strong></div>
                </div>
                <div className="subject-bars">
                  <div className="subject-bar-row">
                    <span>Coverage</span>
                    <div className="subject-bar"><span style={{ width: `${entry.coverage}%`, background: entry.subject.color }} /></div>
                    <b>{entry.coverage}%</b>
                  </div>
                  <div className="subject-bar-row">
                    <span>Mastery</span>
                    <div className="subject-bar"><span style={{ width: `${entry.mastery}%`, background: entry.subject.color }} /></div>
                    <b>{entry.mastery}%</b>
                  </div>
                </div>
              </div>

              <footer className="subject-card-foot">
                <div className="subject-tags">
                  <Badge tone={boosted ? 'lime' : 'neutral'}>{boosted ? 'Boosted' : `Phase ${entry.subject.phase}`}</Badge>
                  <span className="subject-hy"><Star size={11} /> {entry.highYield} high-yield</span>
                  {completed && <span className="subject-complete-tag"><Check size={11} /> Arc complete</span>}
                </div>
                <div className="subject-actions">
                  <button
                    className={cx('mini-action', boosted && 'is-on')}
                    onClick={(event) => {
                      event.stopPropagation();
                      onBoost(entry.subject.id);
                    }}
                  >
                    <Zap size={12} /> {boosted ? 'Boosted' : 'Boost'}
                  </button>
                  <button
                    className="mini-action ghost"
                    onClick={(event) => {
                      event.stopPropagation();
                      setExpanded(open ? null : entry.subject.id);
                    }}
                  >
                    {open ? 'Collapse' : `${entry.topics.length} topics`}
                    <ChevronDown size={12} className={cx('mini-chevron', open && 'is-open')} />
                  </button>
                </div>
              </footer>

              {open && (
                <div className="subject-topics">
                  <div className="subject-topics-head">
                    <span><Layers size={12} /> TOPIC BREAKDOWN</span>
                    <span>Rate confidence · plan adapts to your weak spots</span>
                  </div>
                  {entry.topics.map((topic) => {
                    const stats = taskStats.get(topic.id) ?? { done: 0, planned: 0, total: topic.units, minutes: 0 };
                    const confidence = confidenceMap.get(topic.id) ?? 3;
                    const complete = stats.done >= topic.units;
                    return (
                      <div key={topic.id} className={cx('topic-row', complete && 'is-complete')}>
                        <div className="topic-main">
                          <span className="topic-status">
                            {complete ? <Check size={11} /> : <Circle size={9} />}
                          </span>
                          <div className="topic-copy">
                            <h4>
                              {topic.title}
                              {topic.highYield && <span className="hy-star" title="High yield"><Star size={11} fill="currentColor" /></span>}
                            </h4>
                            <p>{topic.keyPoints.slice(0, 3).join(' · ')}</p>
                            <div className="topic-meta">
                              <span>{stats.done}/{topic.units} sittings done</span>
                              {stats.nextDate ? (
                                <button
                                  className="topic-next"
                                  onClick={() => onNavigate('board', stats.nextDate)}
                                >
                                  <Crosshair size={10} /> next {formatDate(stats.nextDate, 'short')}
                                </button>
                              ) : (
                                <span className="topic-next muted"><BookMarked size={10} /> {complete ? 'banked' : 'queued'}</span>
                              )}
                              {topic.keyPoints.length > 3 && <span>+{topic.keyPoints.length - 3} traps</span>}
                            </div>
                          </div>
                          <div className="topic-pips" title={`${stats.done} of ${topic.units} sessions complete`}>
                            {Array.from({ length: topic.units }).map((_, index) => (
                              <i
                                key={index}
                                className={cx(index < stats.done && 'is-done', index < stats.planned && index >= stats.done && 'is-planned')}
                              />
                            ))}
                          </div>
                          <div className="confidence-control" aria-label={`Confidence for ${topic.title}`}>
                            <span>Confidence</span>
                            <div>
                              {[1, 2, 3, 4, 5].map((value) => (
                                <button
                                  key={value}
                                  className={cx('confidence-dot', value <= confidence && 'is-on')}
                                  onClick={() => onSetConfidence(topic.id, value)}
                                  aria-label={`Set confidence ${value} of 5`}
                                  title={`${value}/5`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state syllabus-empty">
          <span className="empty-icon"><Search size={22} /></span>
          <div className="empty-title">No matching topics.</div>
          <p>Try a different phrase, clear the high-yield filter, or jump back to the full map.</p>
          <button
            className="small-button"
            onClick={() => {
              setQuery('');
              setPhase('all');
              setHighYieldOnly(false);
            }}
          >
            Reset filters <ArrowRight size={13} />
          </button>
        </div>
      )}

      <div className="syllabus-foot">
        <div className="syllabus-foot-icon"><Sparkles size={18} /></div>
        <div>
          <strong>Every unit has a seat in the calendar.</strong>
          <span>{plural(topics.length, 'topic')} · {totalTopicUnits} forty-five-minute sittings · {taskXp(state.tasks).toLocaleString()} XP earned so far</span>
        </div>
        <button className="ghost-button" onClick={() => onNavigate('journey')}>
          See the full ascent <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
