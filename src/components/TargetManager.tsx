import { useMemo, useState } from 'react';
import {
  ArchiveRestore,
  CalendarDays,
  Check,
  ChevronDown,
  Plus,
  Target as TargetIcon,
  Trash2,
  Zap,
} from 'lucide-react';
import type { AppState, StudyTarget, Subject, TargetKind } from '../types';
import type { NewTargetInput } from '../hooks/usePlanner';
import { TARGET_KIND_LABEL, PREP_LEVEL_LABEL, targetDailyMinutes, targetDaysLeft } from '../lib/targets';
import { cx, formatDate, todayISO } from '../lib/utils';
import { Badge } from './ui';

const KINDS: TargetKind[] = ['exam', 'course', 'skill', 'habit', 'custom'];

export function TargetManager({
  state,
  onAddTarget,
  onUpdateTarget,
  onFocusTarget,
  onArchiveTarget,
  onRestoreTarget,
  onAddSubject,
  onAddTopic,
  onUpdateTopic,
  onDeleteTopic,
}: {
  state: AppState;
  onAddTarget: (input: NewTargetInput) => void;
  onUpdateTarget: (
    id: string,
    patch: Partial<Pick<StudyTarget, 'title' | 'kind' | 'date' | 'color' | 'dailyMinutes' | 'notes'>>,
  ) => void;
  onFocusTarget: (id: string) => void;
  onArchiveTarget: (id: string) => void;
  onRestoreTarget: (id: string) => void;
  onAddSubject: (targetId: string, name: string) => void;
  onAddTopic: (input: {
    targetId: string;
    subjectId: string;
    title: string;
    units?: number;
    keyPoints?: string[];
    highYield?: boolean;
  }) => void;
  onUpdateTopic: (topicId: string, patch: { units?: number; title?: string; highYield?: boolean }) => void;
  onDeleteTopic: (topicId: string) => void;
}) {
  const today = todayISO();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TargetKind>('exam');
  const [date, setDate] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(120);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [subjectDraft, setSubjectDraft] = useState<Record<string, string>>({});
  const [topicDraft, setTopicDraft] = useState<Record<string, { subjectId: string; title: string; units: string }>>({});

  const active = state.targets.filter((target) => !target.archivedAt);
  const archived = state.targets.filter((target) => target.archivedAt);
  const primaryId = state.settings.primaryTargetId;

  const stats = useMemo(() => {
    const map = new Map<string, {
      subjects: Subject[];
      topicCount: number;
      units: number;
      done: number;
      planned: number;
    }>();
    state.targets.forEach((target) => {
      const subjects = state.subjects.filter((subject) => subject.targetId === target.id);
      const topics = state.topics.filter((topic) => topic.targetId === target.id);
      const units = topics.reduce((sum, topic) => sum + topic.units, 0);
      const done = state.tasks.filter(
        (task) => task.targetId === target.id && task.kind === 'study' && task.status === 'done',
      ).length;
      const planned = state.tasks.filter(
        (task) => task.targetId === target.id && task.kind === 'study' && task.status !== 'skipped',
      ).length;
      map.set(target.id, { subjects, topicCount: topics.length, units, done, planned });
    });
    return map;
  }, [state.targets, state.subjects, state.topics, state.tasks]);

  const submitTarget = () => {
    if (!title.trim()) return;
    onAddTarget({
      title: title.trim(),
      kind,
      date: date || undefined,
      dailyMinutes,
      focus: true,
    });
    setTitle('');
    setDate('');
    setDailyMinutes(120);
  };

  const addSubject = (targetId: string) => {
    const value = (subjectDraft[targetId] ?? '').trim();
    if (!value) return;
    onAddSubject(targetId, value);
    setSubjectDraft((prev) => ({ ...prev, [targetId]: '' }));
  };

  const addTopic = (targetId: string, subjects: Subject[]) => {
    const draft = topicDraft[targetId] ?? { subjectId: subjects[0]?.id ?? '', title: '', units: '2' };
    if (!draft.title.trim() || !draft.subjectId) return;
    onAddTopic({
      targetId,
      subjectId: draft.subjectId,
      title: draft.title.trim(),
      units: Math.max(1, Number(draft.units) || 1),
    });
    setTopicDraft((prev) => ({
      ...prev,
      [targetId]: { ...draft, title: '', units: '2' },
    }));
  };

  return (
    <section className="settings-card target-manager">
      <div className="settings-card-head">
        <span className="settings-card-icon lime"><TargetIcon size={17} /></span>
        <div>
          <span className="eyebrow">TARGETS & CURRICULUM</span>
          <h3>Everything you are chasing.</h3>
        </div>
        <Badge tone="neutral">{active.length} active</Badge>
      </div>
      <p className="settings-data-copy">
        Run several targets at once. Each target owns its own subjects, topics and sessions. Targets
        without a date get a rolling {state.settings.horizonDays}-day plan with no countdown —
        progress keeps accumulating until you archive them.
      </p>

      <div className="target-add-form">
        <label className="field grow">
          <span className="field-label">New target</span>
          <input
            className="text-input"
            value={title}
            maxLength={64}
            placeholder="e.g. AWS Solutions Architect, Semester 6 finals, Spanish B1"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitTarget();
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Kind</span>
          <select
            className="text-input"
            value={kind}
            onChange={(event) => setKind(event.target.value as TargetKind)}
          >
            {KINDS.map((entry) => (
              <option key={entry} value={entry}>{TARGET_KIND_LABEL[entry]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Date <em>optional</em></span>
          <input
            type="date"
            className="text-input"
            value={date}
            min={today}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Daily minutes</span>
          <input
            type="number"
            className="text-input"
            min={30}
            max={720}
            step={15}
            value={dailyMinutes}
            onChange={(event) => setDailyMinutes(Math.max(30, Math.min(720, Number(event.target.value) || 120)))}
          />
        </label>
        <button className="small-button target-add-button" onClick={submitTarget} disabled={!title.trim()}>
          <Plus size={14} /> Add target
        </button>
      </div>

      <div className="target-list">
        {active.map((target) => {
          const entry = stats.get(target.id);
          const daysLeft = targetDaysLeft(target, today);
          const open = expanded === target.id;
          const subjects = entry?.subjects ?? [];
          const dailyLoad = targetDailyMinutes(target);
          const draft = topicDraft[target.id] ?? {
            subjectId: subjects[0]?.id ?? '',
            title: '',
            units: '2',
          };
          return (
            <article key={target.id} className={cx('target-card', primaryId === target.id && 'is-primary')}>
              <div className="target-card-head">
                <span className="target-color" style={{ background: target.color }} />
                <div className="target-card-title">
                  <input
                    className="target-title-input"
                    value={target.title}
                    maxLength={64}
                    aria-label="Target title"
                    onChange={(event) => onUpdateTarget(target.id, { title: event.target.value })}
                  />
                  <div className="target-meta">
                    <span>{TARGET_KIND_LABEL[target.kind]}</span>
                    {target.prepLevel && <span>{PREP_LEVEL_LABEL[target.prepLevel]}</span>}
                    <span>
                      {target.date
                        ? `${formatDate(target.date, 'medium')} · ${daysLeft === 0 ? 'today' : `${daysLeft} days left`}`
                        : `Rolling plan · ${state.settings.horizonDays}-day window`}
                    </span>
                    {primaryId === target.id && <span className="target-primary-tag"><Zap size={10} /> focused</span>}
                  </div>
                </div>
                <div className="target-card-actions">
                  <button
                    className={cx('mini-action', primaryId === target.id && 'is-on')}
                    title="Focus this target"
                    onClick={() => onFocusTarget(target.id)}
                    disabled={primaryId === target.id}
                  >
                    <Zap size={12} /> Focus
                  </button>
                  <button className="mini-action ghost" onClick={() => setExpanded(open ? null : target.id)}>
                    {open ? 'Collapse' : 'Curriculum'}
                    <ChevronDown size={12} className={cx('mini-chevron', open && 'is-open')} />
                  </button>
                  <button
                    className="mini-action danger-ghost"
                    title="Archive target"
                    onClick={() => onArchiveTarget(target.id)}
                    disabled={active.length <= 1}
                  >
                    <Trash2 size={12} /> Archive
                  </button>
                </div>
              </div>

              <div className="target-card-stats">
                <div><span>Subjects</span><strong>{subjects.length}</strong></div>
                <div><span>Topics</span><strong>{entry?.topicCount ?? 0}</strong></div>
                <div><span>Units</span><strong>{entry?.done ?? 0}/{entry?.units ?? 0}</strong></div>
                <div><span>Daily load</span><strong>{dailyLoad >= 60 ? `${Math.round((dailyLoad / 60) * 10) / 10}h` : `${dailyLoad}m`}</strong></div>
              </div>

              {open && (
                <div className="target-curriculum">
                  <div className="target-inline-form">
                    <input
                      className="text-input"
                      placeholder="Add a subject"
                      value={subjectDraft[target.id] ?? ''}
                      onChange={(event) => setSubjectDraft((prev) => ({ ...prev, [target.id]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') addSubject(target.id);
                      }}
                    />
                    <button
                      className="small-button ghost"
                      disabled={!(subjectDraft[target.id] ?? '').trim()}
                      onClick={() => addSubject(target.id)}
                    >
                      <Plus size={13} /> Subject
                    </button>
                  </div>

                  {subjects.length > 0 ? (
                    <>
                      <div className="target-inline-form">
                        <select
                          className="text-input"
                          value={draft.subjectId}
                          onChange={(event) => setTopicDraft((prev) => ({
                            ...prev,
                            [target.id]: { ...draft, subjectId: event.target.value },
                          }))}
                        >
                          {subjects.map((subject) => (
                            <option key={subject.id} value={subject.id}>{subject.name}</option>
                          ))}
                        </select>
                        <input
                          className="text-input"
                          placeholder="Add a topic"
                          value={draft.title}
                          onChange={(event) => setTopicDraft((prev) => ({
                            ...prev,
                            [target.id]: { ...draft, title: event.target.value },
                          }))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') addTopic(target.id, subjects);
                          }}
                        />
                        <input
                          className="text-input target-units-input"
                          type="number"
                          min={1}
                          max={100}
                          value={draft.units}
                          aria-label="Topic units (45-minute sessions)"
                          onChange={(event) => setTopicDraft((prev) => ({
                            ...prev,
                            [target.id]: { ...draft, units: event.target.value },
                          }))}
                        />
                        <button
                          className="small-button ghost"
                          disabled={!draft.title.trim()}
                          onClick={() => addTopic(target.id, subjects)}
                        >
                          <Plus size={13} /> Topic
                        </button>
                      </div>

                      <div className="target-topic-list">
                        {state.topics.filter((topic) => topic.targetId === target.id).map((topic) => {
                          const subject = subjects.find((entrySubject) => entrySubject.id === topic.subjectId);
                          return (
                            <div key={topic.id} className="target-topic-row">
                              <span className="target-topic-dot" style={{ background: subject?.color ?? target.color }} />
                              <span className="target-topic-subject">{subject?.short ?? '—'}</span>
                              <strong>{topic.title}</strong>
                              <label className="target-units-edit">
                                <input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={topic.units}
                                  aria-label={`${topic.title} units`}
                                  onChange={(event) => onUpdateTopic(topic.id, {
                                    units: Math.max(1, Number(event.target.value) || 1),
                                  })}
                                />
                                <span>u</span>
                              </label>
                              <button
                                className="target-topic-remove"
                                title="Remove topic"
                                onClick={() => onDeleteTopic(topic.id)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="field-hint">Add a subject, then topics — or import a curriculum CSV below.</p>
                  )}

                  <div className="target-date-row">
                    <label className="field">
                      <span className="field-label">Target date <em>blank = rolling</em></span>
                      <div className="input-with-icon">
                        <CalendarDays size={14} />
                        <input
                          type="date"
                          className="text-input"
                          value={target.date ?? ''}
                          min={today}
                          onChange={(event) => onUpdateTarget(target.id, { date: event.target.value })}
                        />
                      </div>
                    </label>
                    {target.date && (
                      <button
                        className="text-button"
                        onClick={() => onUpdateTarget(target.id, { date: undefined })}
                      >
                        Clear date → rolling
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {archived.length > 0 && (
        <div className="target-archive">
          <div className="target-archive-head">
            <ArchiveRestore size={14} />
            <strong>Archived targets</strong>
            <span>History stays readable. Restore any time.</span>
          </div>
          {archived.map((target) => (
            <div key={target.id} className="target-archive-row">
              <span className="target-color" style={{ background: target.color }} />
              <strong>{target.title}</strong>
              <span>{stats.get(target.id)?.done ?? 0} sessions banked</span>
              <button className="mini-action" onClick={() => onRestoreTarget(target.id)}>
                <Check size={12} /> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
