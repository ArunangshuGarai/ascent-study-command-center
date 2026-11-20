import { useEffect, useState, type CSSProperties } from 'react';
import {
  Brain,
  CalendarDays,
  Clock3,
  Coffee,
  Crosshair,
  Plus,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import type { NewTaskInput, SlotId, StudyTarget, Subject, SubjectId, TaskKind } from '../types';
import {
  cx,
  endTime,
  formatDate,
  formatDuration,
  slotDefaultTime,
  slotMeta,
  slotForTime,
  todayISO,
} from '../lib/utils';
import { Modal } from './ui';

const KIND_OPTIONS: { id: TaskKind; label: string; icon: typeof Brain; duration: number; placeholder: string }[] = [
  { id: 'study', label: 'Deep work', icon: Brain, duration: 45, placeholder: 'e.g. Cache mapping — tag/index/offset' },
  { id: 'pyq', label: 'PYQ recon', icon: Crosshair, duration: 45, placeholder: 'e.g. 2023 OS paper — archetype scan' },
  { id: 'test', label: 'Validation test', icon: Target, duration: 45, placeholder: 'e.g. TOC closure properties quiz' },
  { id: 'revision', label: 'Revision', icon: Sparkles, duration: 30, placeholder: 'e.g. Formula sheet recall' },
  { id: 'practice', label: 'Practice', icon: Zap, duration: 45, placeholder: 'e.g. Mixed CN calculation set' },
  { id: 'personal', label: 'Personal', icon: Coffee, duration: 30, placeholder: 'e.g. Gym · walk · family call' },
];

const QUICK_STARTS: { label: string; kind: TaskKind; duration: number; icon: typeof Brain }[] = [
  { label: 'PYQ recon', kind: 'pyq', duration: 45, icon: Crosshair },
  { label: 'Deep work', kind: 'study', duration: 45, icon: Brain },
  { label: 'Validation', kind: 'test', duration: 45, icon: Target },
  { label: 'Personal', kind: 'personal', duration: 30, icon: Coffee },
];

export function AddTaskModal({
  open,
  date,
  slot,
  endDate,
  subjects,
  targets,
  defaultTargetId,
  onClose,
  onAdd,
}: {
  open: boolean;
  date: string;
  slot?: SlotId;
  endDate: string;
  subjects: Subject[];
  targets: StudyTarget[];
  defaultTargetId?: string;
  onClose: () => void;
  onAdd: (input: NewTaskInput) => void;
}) {
  const today = todayISO();
  const activeTargets = targets.filter((target) => !target.archivedAt);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TaskKind>('study');
  const [targetId, setTargetId] = useState(defaultTargetId ?? activeTargets[0]?.id ?? '');
  const [subjectId, setSubjectId] = useState<SubjectId | ''>('');
  const [targetDate, setTargetDate] = useState(date);
  const [start, setStart] = useState(slotDefaultTime(slot ?? 'morning'));
  const [duration, setDuration] = useState(45);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    const initialSlot = slot ?? 'morning';
    setTitle('');
    setKind('study');
    setTargetId(defaultTargetId ?? activeTargets[0]?.id ?? '');
    setSubjectId('');
    setTargetDate(date < today ? today : date);
    setStart(slotDefaultTime(initialSlot));
    setDuration(45);
    setNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date, slot, today, defaultTargetId]);

  const kindMeta = KIND_OPTIONS.find((option) => option.id === kind) ?? KIND_OPTIONS[0];
  const targetSubjects = subjects.filter((subject) => !targetId || subject.targetId === targetId);
  const selectedTarget = activeTargets.find((target) => target.id === targetId);
  const maxDate = selectedTarget?.date && selectedTarget.date < endDate ? selectedTarget.date : endDate;
  const valid = title.trim().length > 0 && targetDate >= today && targetDate <= maxDate;

  const chooseKind = (next: TaskKind) => {
    setKind(next);
    const option = KIND_OPTIONS.find((entry) => entry.id === next);
    if (option) setDuration(option.duration);
  };

  const chooseQuick = (quick: typeof QUICK_STARTS[number]) => {
    setKind(quick.kind);
    setDuration(quick.duration);
    if (!title.trim()) setTitle(quick.label);
  };

  const pickTarget = (nextTargetId: string) => {
    setTargetId(nextTargetId);
    const nextTarget = activeTargets.find((target) => target.id === nextTargetId);
    if (nextTarget?.date && targetDate > nextTarget.date) setTargetDate(nextTarget.date);
    const stillValid = subjects.some(
      (subject) => subject.id === subjectId && subject.targetId === nextTargetId,
    );
    if (!stillValid) setSubjectId('');
  };

  const submit = () => {
    if (!valid) return;
    onAdd({
      title: title.trim(),
      date: targetDate,
      start,
      duration,
      kind,
      targetId: targetId || undefined,
      subjectId: subjectId || undefined,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} className="add-task-modal" wide labelledBy="add-task-title">
      <div className="modal-heading">
        <div className="modal-heading-icon"><Plus size={20} /></div>
        <div>
          <div className="eyebrow">MAP A BLOCK</div>
          <h2 id="add-task-title">Add a deliberate block.</h2>
          <p>Manual blocks stay pinned when the plan re-flows around them.</p>
        </div>
      </div>

      <div className="quick-start-row">
        <span>Quick start</span>
        {QUICK_STARTS.map((quick) => {
          const Icon = quick.icon;
          return (
            <button
              key={quick.label}
              className={cx('quick-start-chip', kind === quick.kind && 'is-active')}
              onClick={() => chooseQuick(quick)}
            >
              <Icon size={12} /> {quick.label}
              <b>{quick.duration}m</b>
            </button>
          );
        })}
      </div>

      <div className="add-task-grid">
        <div className="add-task-main">
          <label className="field">
            <span className="field-label">What are you doing?</span>
            <input
              className="text-input large"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={kindMeta.placeholder}
              maxLength={90}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter' && valid) submit();
              }}
            />
          </label>

          <div className="field">
            <span className="field-label">Target <em>which plan does this belong to?</em></span>
            <div className="target-picker">
              {activeTargets.map((target) => (
                <button
                  key={target.id}
                  className={cx('target-option', targetId === target.id && 'is-active')}
                  style={{ '--target-color': target.color } as CSSProperties}
                  onClick={() => pickTarget(target.id)}
                  title={target.title}
                >
                  <i style={{ background: target.color }} />
                  {target.title}
                  {target.date && <small>{formatDate(target.date, 'short')}</small>}
                </button>
              ))}
              {!activeTargets.length && (
                <span className="field-hint">Add a target in Settings before mapping blocks.</span>
              )}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Block type</span>
            <div className="kind-picker">
              {KIND_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    className={cx('kind-option', kind === option.id && 'is-active', `kind-option-${option.id}`)}
                    onClick={() => chooseKind(option.id)}
                  >
                    <Icon size={14} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-two-col">
            <label className="field">
              <span className="field-label">Date</span>
              <div className="input-with-icon">
                <CalendarDays size={15} />
                <input
                  type="date"
                  className="text-input"
                  value={targetDate}
                  min={today}
                  max={maxDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                />
              </div>
              <span className="field-hint">{formatDate(targetDate, 'long')}</span>
            </label>
            <label className="field">
              <span className="field-label">Start time</span>
              <div className="input-with-icon">
                <Clock3 size={15} />
                <input
                  type="time"
                  className="text-input"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </div>
              <span className="field-hint">{slotMeta(slotForTime(start)).label} · ends {endTime(start, duration)}</span>
            </label>
          </div>

          <label className="field">
            <span className="field-label">Subject <em>optional</em></span>
            <div className="subject-select-row">
              <button
                className={cx('subject-option', subjectId === '' && 'is-active')}
                onClick={() => setSubjectId('')}
              >
                No subject
              </button>
              {targetSubjects.map((subject) => (
                <button
                  key={subject.id}
                  className={cx('subject-option', subjectId === subject.id && 'is-active')}
                  style={{ '--subject-color': subject.color } as CSSProperties}
                  onClick={() => setSubjectId(subject.id)}
                  title={subject.name}
                >
                  <i style={{ background: subject.color }} />
                  {subject.short}
                </button>
              ))}
            </div>
          </label>
        </div>

        <aside className="add-task-side">
          <div className="duration-panel">
            <span className="field-label">Duration</span>
            <div className="duration-display">
              <strong>{duration}</strong>
              <span>minutes</span>
            </div>
            <div className="duration-presets">
              {[15, 25, 30, 45, 60, 90].map((value) => (
                <button
                  key={value}
                  className={cx('duration-chip', duration === value && 'is-active')}
                  onClick={() => setDuration(value)}
                >
                  {value}m
                </button>
              ))}
            </div>
            <input
              type="range"
              min={5}
              max={180}
              step={5}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              aria-label="Duration in minutes"
            />
            <div className="duration-window">
              <Clock3 size={12} />
              {start} → {endTime(start, duration)}
            </div>
          </div>

          <label className="field">
            <span className="field-label">Notes <em>optional</em></span>
            <textarea
              className="text-area"
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What does done look like? One clean sentence."
              maxLength={300}
            />
          </label>

          <div className="add-task-summary">
            <span className="add-task-summary-icon">
              <kindMeta.icon size={14} />
            </span>
            <div>
              <strong>{title.trim() || 'Untitled block'}</strong>
              <span>{formatDate(targetDate, 'short')} · {formatDuration(duration)} · {kindMeta.label}</span>
            </div>
          </div>

          <button className="primary-button full" onClick={submit} disabled={!valid}>
            <Plus size={15} /> Map this block
          </button>
          <button className="text-button full" onClick={onClose}>Cancel</button>
        </aside>
      </div>
    </Modal>
  );
}
