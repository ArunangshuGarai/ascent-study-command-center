import { useEffect, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CalendarDays,
  Check,
  Clock3,
  Crosshair,
  Flame,
  History,
  ListChecks,
  NotebookPen,
  Save,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Target,
  Timer,
  Trash2,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import type { Task } from '../types';
import {
  cx,
  endTime,
  formatDate,
  formatDuration,
  slotForTime,
  subjectById,
  todayISO,
  topicById,
} from '../lib/utils';
import { Badge, Drawer } from './ui';
import { taskKindMeta } from './TaskCard';

export function TaskDetail({
  task,
  confidence,
  examDate,
  onClose,
  onComplete,
  onUncomplete,
  onSkip,
  onDelete,
  onDefer,
  onSetNote,
  onSetConfidence,
  onStartFocus,
  onGrade,
}: {
  task?: Task;
  confidence: number;
  examDate: string;
  onClose: () => void;
  onComplete: (task: Task) => void;
  onUncomplete: (task: Task) => void;
  onSkip: (task: Task) => void;
  onDelete: (task: Task) => void;
  onDefer: (taskId: string, date: string, slot: Task['slot'], start?: string) => void;
  onSetNote: (taskId: string, notes: string) => void;
  onSetConfidence: (topicId: string, confidence: number) => void;
  onStartFocus: (task: Task) => void;
  onGrade: (taskId: string, score: number) => void;
}) {
  const today = todayISO();
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [noteSaved, setNoteSaved] = useState(false);
  const [moveDate, setMoveDate] = useState(task?.date ?? today);
  const [moveStart, setMoveStart] = useState(task?.start ?? '09:00');
  const [score, setScore] = useState(task?.score ?? 0);
  const [deleteArmed, setDeleteArmed] = useState(false);

  useEffect(() => {
    setNotes(task?.notes ?? '');
    setNoteSaved(false);
    setMoveDate(task?.date ?? today);
    setMoveStart(task?.start ?? '09:00');
    setScore(task?.score ?? 0);
    setDeleteArmed(false);
  }, [task?.id, task?.notes, task?.date, task?.start, task?.score, today]);

  if (!task) return null;

  const subject = subjectById(task.subjectId);
  const topic = topicById(task.topicId);
  const meta = taskKindMeta(task);
  const Icon = meta.icon;
  const accent = subject?.color ?? meta.color;
  const isDone = task.status === 'done';
  const isSkipped = task.status === 'skipped';
  const isMissed = task.status === 'missed';
  const isFuture = task.date > today;
  const isExam = task.kind === 'exam';
  const isRest = task.kind === 'rest';
  const canComplete = task.status === 'todo' && !isExam;
  const notesDirty = notes !== (task.notes ?? '');
  const moveDirty = moveDate !== task.date || moveStart !== task.start;
  const canMove = task.status === 'todo' && moveDate >= today && moveDate <= examDate && !isExam && !isRest;
  const scoreDirty = typeof task.score === 'number' ? score !== task.score : score > 0;
  const scoreEditable = task.kind === 'mock' && (task.status === 'done' || (!isFuture && task.status === 'todo'));

  const saveNote = () => {
    onSetNote(task.id, notes);
    setNoteSaved(true);
    window.setTimeout(() => setNoteSaved(false), 2200);
  };

  return (
    <Drawer open onClose={onClose} className="task-drawer" labelledBy="task-detail-title">
      <div className="task-detail" style={{ '--detail-accent': accent } as CSSProperties}>
        <div className="task-detail-hero">
          <div className="task-detail-glow" aria-hidden />
          <div className="task-detail-top">
            <span className="task-detail-kind" style={{ color: accent }}>
              <Icon size={13} /> {meta.label}
            </span>
            <Badge tone={isDone ? 'green' : isSkipped ? 'neutral' : isMissed ? 'rose' : isToday(task.date) ? 'lime' : 'violet'}>
              {isDone
                ? task.earlyCompleted
                  ? 'Cleared early'
                  : 'Cleared'
                : isSkipped
                  ? 'Skipped'
                  : isMissed
                    ? 'Missed'
                    : isToday(task.date)
                      ? 'Today'
                      : 'Upcoming'}
            </Badge>
          </div>
          <h2 id="task-detail-title">{task.title}</h2>
          <div className="task-detail-subline">
            {subject && (
              <span className="task-detail-subject" style={{ color: subject.color }}>
                <i style={{ background: subject.color }} /> {subject.name}
              </span>
            )}
            <span><CalendarDays size={12} /> {formatDate(task.date, 'medium')}</span>
            <span><Clock3 size={12} /> {task.start}–{endTime(task.start, task.duration)}</span>
            <span><Timer size={12} /> {formatDuration(task.duration)}</span>
          </div>
        </div>

        <div className="task-detail-body">
          <div className="task-action-row">
            {canComplete ? (
              <button className="primary-button" onClick={() => onComplete(task)}>
                <Check size={15} /> {isFuture ? 'Bank it early' : 'Complete session'}{' '}
                <span className="button-xp">+{task.xp} XP</span>
              </button>
            ) : isDone ? (
              <>
                <button className="small-button ghost" onClick={() => onUncomplete(task)} disabled={task.date < today}>
                  <History size={14} /> Undo completion
                </button>
                <button className="primary-button" onClick={() => onStartFocus(task)}>
                  <Timer size={14} /> Focus again
                </button>
              </>
            ) : (
              <button className="primary-button" onClick={() => onStartFocus(task)}>
                <Timer size={15} /> Enter focus mode
              </button>
            )}
            {!isDone && !isSkipped && !isExam && !isRest && (
              <button className="ghost-button" onClick={() => onSkip(task)}>
                <SkipForward size={14} /> Skip & re-flow
              </button>
            )}
            {!isDone && (
              <button className="text-button task-remove" onClick={() => {
                if (!task.manual) {
                  onSkip(task);
                  return;
                }
                if (!deleteArmed) {
                  setDeleteArmed(true);
                  return;
                }
                onDelete(task);
                onClose();
              }}>
                <Trash2 size={13} /> {task.manual ? (deleteArmed ? 'Confirm remove' : 'Remove block') : 'Remove from plan'}
              </button>
            )}
          </div>
          {isFuture && task.status === 'todo' && (
            <div className="task-lock-note is-early">
              <Sparkles size={13} />
              <span>
                <strong>Already covered this?</strong> Bank it now and the queue skips the topic.
                Later topics move up; spaced revision passes are scheduled from today. The original
                block stays in the record as cleared early.
              </span>
            </div>
          )}
          {isDone && task.date < today && (
            <div className="task-lock-note">
              <ShieldCheck size={13} /> History is locked. This completion is part of the permanent record now.
            </div>
          )}

          <div className="task-detail-grid">
            <div className="task-detail-section">
              <span className="eyebrow">THE BRIEF</span>
              <p className="task-description">
                {task.description ?? 'No extra brief yet. One objective, one clean block. Write the win condition in your notes.'}
              </p>
              {task.subtitle && <div className="task-subtitle-chip">{task.subtitle}</div>}
              <div className="task-kpi-row">
                <div><small>XP</small><strong>{task.xp}</strong></div>
                <div><small>SLOT</small><strong>{task.slot}</strong></div>
                <div><small>STATUS</small><strong>{task.status}</strong></div>
                {task.sessionNo && <div><small>SESSION</small><strong>{task.sessionNo}/{task.sessionTotal}</strong></div>}
              </div>
            </div>

            {topic && (
              <div className="task-detail-section topic-intel">
                <span className="eyebrow">TOPIC INTELLIGENCE</span>
                <div className="topic-intel-head">
                  <h3>{topic.title}</h3>
                  {topic.highYield && <Badge tone="amber"><Flame size={11} /> High yield</Badge>}
                </div>
                <ul className="topic-keypoints">
                  {topic.keyPoints.map((point) => (
                    <li key={point}><Zap size={11} /> {point}</li>
                  ))}
                </ul>
                <div className="topic-confidence">
                  <div>
                    <span>How automatic is this?</span>
                    <small>Confidence feeds the adaptive practice engine.</small>
                  </div>
                  <div className="confidence-control">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        className={cx('confidence-dot', value <= confidence && 'is-on')}
                        onClick={() => onSetConfidence(topic.id, value)}
                        aria-label={`Set confidence ${value} of 5`}
                      />
                    ))}
                  </div>
                  <b>{confidence}/5</b>
                </div>
              </div>
            )}

            {task.kind === 'mock' && (
              <div className="task-detail-section mock-score-section">
                <span className="eyebrow">MOCK LAB</span>
                <div className="mock-score-head">
                  <div>
                    <h3>Log the score.</h3>
                    <p>Feedback, not identity. The autopsy is where the rank moves.</p>
                  </div>
                  <span className="mock-score-value">{score}<small>/100</small></span>
                </div>
                <div className="mock-score-input">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={score}
                    disabled={!scoreEditable}
                    onChange={(event) => setScore(Number(event.target.value))}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={score}
                    disabled={!scoreEditable}
                    onChange={(event) => setScore(Math.max(0, Math.min(100, Number(event.target.value))))}
                  />
                  <button
                    className="small-button"
                    disabled={!scoreEditable || !scoreDirty}
                    onClick={() => onGrade(task.id, score)}
                  >
                    Save score
                  </button>
                </div>
                {!scoreEditable && (
                  <span className="field-hint">Sit the mock first. Scores can be logged on the day or after completion.</span>
                )}
              </div>
            )}

            <div className="task-detail-section">
              <div className="detail-section-head">
                <span className="eyebrow">ERROR LOG & NOTES</span>
                {noteSaved && <span className="note-saved"><Check size={11} /> Saved</span>}
              </div>
              <textarea
                className="text-area"
                rows={5}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="What broke? What rule prevents it next time? One honest line is enough."
                maxLength={1200}
              />
              <div className="note-actions">
                <span><NotebookPen size={12} /> {notes.length}/1200</span>
                <button className="small-button ghost" disabled={!notesDirty} onClick={saveNote}>
                  <Save size={13} /> Save note
                </button>
              </div>
            </div>

            {!isExam && !isRest && !isDone && (
              <div className="task-detail-section">
                <span className="eyebrow">RESCHEDULE</span>
                <div className="reschedule-row">
                  <label className="field compact">
                    <span className="field-label">Date</span>
                    <input
                      type="date"
                      className="text-input"
                      value={moveDate}
                      min={today}
                      max={examDate}
                      onChange={(event) => setMoveDate(event.target.value)}
                    />
                  </label>
                  <label className="field compact">
                    <span className="field-label">Start</span>
                    <input
                      type="time"
                      className="text-input"
                      value={moveStart}
                      onChange={(event) => setMoveStart(event.target.value)}
                    />
                  </label>
                  <button
                    className="small-button"
                    disabled={!canMove || !moveDirty}
                    onClick={() => {
                      onDefer(task.id, moveDate, slotForTime(moveStart), moveStart);
                      onClose();
                    }}
                  >
                    <ArrowRight size={13} /> Move & ripple
                  </button>
                </div>
                <div className="reschedule-quick">
                  <button onClick={() => setMoveDate(today)}>Today</button>
                  <button
                    onClick={() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
                      if (iso <= examDate) setMoveDate(iso);
                    }}
                  >
                    Tomorrow
                  </button>
                  <span>Moving a session re-flows the unresolved queue. Completed work stays pinned.</span>
                </div>
              </div>
            )}

            {isExam && (
              <div className="task-detail-section exam-brief">
                <span className="eyebrow">FINAL BOSS PROTOCOL</span>
                <div className="exam-brief-grid">
                  <div><ListChecks size={14} /><strong>Admit card + original ID</strong><span>Transparent pouch. No surprises at the venue.</span></div>
                  <div><Crosshair size={14} /><strong>Read every question twice</strong><span>Mark the easy questions first. Do not donate time to a single trap.</span></div>
                  <div><Brain size={14} /><strong>Breathe before section two</strong><span>The paper is designed to feel fast. Your preparation is the counterweight.</span></div>
                  <div><Trophy size={14} /><strong>You have already done the work</strong><span>Walk in like the result is a formality you are collecting.</span></div>
                </div>
              </div>
            )}

            {isRest && (
              <div className="task-detail-section rest-brief">
                <span className="eyebrow">RECOVERY PROTOCOL</span>
                <p>No inputs. Walk, eat properly, sleep early. Recovery is part of the method, not a detour from it.</p>
              </div>
            )}

            {isMissed && (
              <div className="task-detail-section missed-note">
                <AlertTriangle size={15} />
                <p>This session was missed and its unresolved study content has been folded into the remaining queue. There is nothing to punish — only the next right move.</p>
              </div>
            )}
          </div>

          <footer className="task-detail-foot">
            <div className="task-foot-id">
              <Target size={12} /> {task.id.slice(0, 18)}
            </div>
            <div className={cx('task-foot-status', `status-${task.status}`)}>
              <span /> {task.status === 'todo' ? 'Awaiting execution' : task.status === 'done' ? 'Banked in the record' : task.status}
            </div>
            <button className="icon-button small" onClick={onClose} aria-label="Close task detail">
              <X size={15} />
            </button>
          </footer>
        </div>
      </div>
    </Drawer>
  );
}

function isToday(date: string) {
  return date === todayISO();
}
