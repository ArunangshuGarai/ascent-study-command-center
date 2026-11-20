import { useEffect, useRef, useState } from 'react';
import {
  Brain,
  Check,
  Coffee,
  Crosshair,
  Flame,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Volume2,
  X,
} from 'lucide-react';
import type { Task } from '../types';
import { cx, endTime, formatClock, formatDuration, playChime, subjectById, todayISO } from '../lib/utils';
import { taskKindMeta } from './TaskCard';
import { Modal, ProgressRing } from './ui';

function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

const DEFAULT_PRESETS = [25, 45, 50, 90];

export function FocusOverlay({
  open,
  task,
  onClose,
  onComplete,
}: {
  open: boolean;
  task?: Task;
  onClose: () => void;
  onComplete: (task: Task) => void;
}) {
  const initialMinutes = task?.duration ?? 25;
  const presets = Array.from(new Set([...DEFAULT_PRESETS, initialMinutes])).sort((a, b) => a - b);
  const [minutes, setMinutes] = useState(initialMinutes);
  const [remaining, setRemaining] = useState(initialMinutes * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const next = task?.duration ?? 25;
    setMinutes(next);
    setRemaining(next * 60);
    setRunning(false);
    setDone(false);
    completedRef.current = false;
  }, [open, task?.id, task?.duration]);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      setRemaining((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (!open || remaining > 0) return;
    setRunning(false);
    setDone(true);
    const bankable = !task || task.kind !== 'exam';
    if (!task) playChime('level');
    if (task && bankable && !completedRef.current) {
      completedRef.current = true;
      onComplete(task);
    }
  }, [open, remaining, task, onComplete]);

  const totalSeconds = minutes * 60;
  const progress = totalSeconds ? ((totalSeconds - remaining) / totalSeconds) * 100 : 0;
  const subject = subjectById(task?.subjectId);
  const meta = task ? taskKindMeta(task) : undefined;
  const Icon = meta?.icon ?? Timer;
  const bankable = !task || task.kind !== 'exam';
  const elapsedMinutes = Math.max(0, Math.round((totalSeconds - remaining) / 60));

  const selectPreset = (value: number) => {
    if (running || done) return;
    setMinutes(value);
    setRemaining(value * 60);
  };

  const resetTimer = () => {
    setRunning(false);
    setDone(false);
    setRemaining(minutes * 60);
    completedRef.current = false;
  };

  const finishEarly = () => {
    if (remaining === 0) return;
    setRunning(false);
    setDone(true);
    setRemaining(0);
  };

  return (
    <Modal open={open} onClose={onClose} className="focus-modal" wide labelledBy="focus-title">
      <div className="focus-aurora" aria-hidden />
      <div className="focus-grid" aria-hidden />
      <div className="focus-shell">
        <header className="focus-head">
          <div className="focus-brand">
            <span className="brand-mark" aria-hidden><i /><i /><i /><b /></span>
            <span>DEEP WORK CHAMBER</span>
          </div>
          <div className="focus-head-right">
            <span className={cx('focus-live-state', running && 'is-live')}>
              <span className="live-dot" /> {done ? 'SESSION CLOSED' : running ? 'IN FLIGHT' : 'READY'}
            </span>
            <button className="icon-button" onClick={onClose} aria-label="Close focus mode">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="focus-body">
          <div className="focus-timer-column">
            <div className="focus-task-line">
              {task ? (
                <>
                  <span className="focus-kind" style={{ color: subject?.color ?? meta?.color }}>
                    <Icon size={13} /> {meta?.label ?? 'Session'}
                  </span>
                  {subject && <span className="focus-subject">{subject.name}</span>}
                  <span className="focus-time">{formatClock(task.start)} · {formatDuration(task.duration)}</span>
                </>
              ) : (
                <span className="focus-kind"><Timer size={13} /> Open focus block</span>
              )}
            </div>

            <h2 id="focus-title" className="focus-title">
              {done ? 'Loop closed.' : task ? task.title : 'One block. One objective.'}
            </h2>
            {task?.subtitle && <p className="focus-subtitle">{task.subtitle}</p>}

            <div className={cx('focus-ring-shell', done && 'is-done', running && 'is-running')}>
              <div className="focus-orbit orbit-one" aria-hidden />
              <div className="focus-orbit orbit-two" aria-hidden />
              <ProgressRing
                value={done ? 100 : progress}
                size={318}
                stroke={12}
                color={done ? 'var(--lime)' : 'var(--violet)'}
                label={`${Math.round(progress)}% of focus session elapsed`}
              >
                <div className="focus-clock">
                  {done ? (
                    <>
                      <span className="focus-done-icon"><Check size={36} strokeWidth={2.5} /></span>
                      <span className="focus-done-copy">Banked</span>
                    </>
                  ) : (
                    <>
                      <span className="focus-clock-label">{running ? 'FOCUSED' : 'READY'}</span>
                      <strong>{clock(remaining)}</strong>
                      <span className="focus-clock-total">of {minutes} minutes</span>
                    </>
                  )}
                </div>
              </ProgressRing>
              {running && <span className="focus-pulse-ring" aria-hidden />}
            </div>

            <div className="focus-presets">
              {presets.map((value) => (
                <button
                  key={value}
                  className={cx('focus-preset', minutes === value && 'is-active')}
                  onClick={() => selectPreset(value)}
                  disabled={running || done}
                >
                  {value} min
                </button>
              ))}
            </div>

            <div className="focus-controls">
              {done ? (
                <>
                  <button className="primary-button" onClick={onClose}>
                    <Check size={15} /> Return to the board
                  </button>
                  <button className="ghost-button" onClick={resetTimer}>
                    <RotateCcw size={14} /> Go another round
                  </button>
                </>
              ) : (
                <>
                  <button className="primary-button focus-start" onClick={() => setRunning((value) => !value)}>
                    {running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                    {running ? 'Pause' : remaining === totalSeconds ? 'Begin session' : 'Resume'}
                  </button>
                  <button className="ghost-button" onClick={resetTimer}>
                    <RotateCcw size={14} /> Reset
                  </button>
                  {task?.kind !== 'exam' && (
                    <button className="text-button" onClick={finishEarly}>
                      <Check size={13} /> {task && task.date > todayISO() ? 'Bank it early' : 'Finish early'}
                    </button>
                  )}
                </>
              )}
            </div>
            {!bankable && (
              <p className="focus-warning">
                <Sparkles size={12} /> The final boss can only be banked when exam day arrives.
              </p>
            )}
            {done && bankable && (
              <p className="focus-reward">
                <Trophy size={13} />{' '}
                {task
                  ? `+${task.xp} XP secured.${task.earlyCompleted
                    ? ' Later topics pulled forward; spaced recall is queued.'
                    : ' The plan updated itself.'}`
                  : 'Focus block complete. Carry the clarity into the next move.'}
              </p>
            )}
          </div>

          <aside className="focus-side">
            <div className="focus-side-card">
              <span className="eyebrow">SESSION CONTRACT</span>
              <h3>Make it clean.</h3>
              <div className="focus-contract">
                <div><span>01</span><p>Phone in another room. Not face-down — another room.</p></div>
                <div><span>02</span><p>One objective. If a thought interrupts, park it on paper and return.</p></div>
                <div><span>03</span><p>Log every miss. The error log writes tomorrow’s queue.</p></div>
              </div>
            </div>

            <div className="focus-side-card focus-session-card">
              <span className="eyebrow">THIS SESSION</span>
              {task ? (
                <>
                  <div className="focus-task-meta">
                    <div><small>DATE</small><strong>{task.date}</strong></div>
                    <div><small>WINDOW</small><strong>{task.start}–{endTime(task.start, task.duration)}</strong></div>
                  </div>
                  <p className="focus-desc">{task.description ?? 'Close every tab that is not this objective. Protect the block.'}</p>
                  <div className="focus-session-foot">
                    <span><Brain size={12} /> {task.kind === 'study' ? 'Deep work' : meta?.label}</span>
                    <span><Sparkles size={12} /> +{task.xp} XP</span>
                  </div>
                </>
              ) : (
                <p className="focus-desc">
                  No task attached. Use this as a clean timer for your own objective — still one block,
                  still one outcome.
                </p>
              )}
            </div>

            <div className="focus-ambient">
              <span className={running ? 'is-live' : ''}><Volume2 size={13} /> {running ? 'Deep work in progress' : 'Chamber is quiet'}</span>
              <div className="focus-ambient-bars" aria-hidden>
                {Array.from({ length: 16 }).map((_, index) => <i key={index} style={{ animationDelay: `${index * 90}ms` }} />)}
              </div>
            </div>

            <div className="focus-ritual-row">
              <span><Coffee size={12} /> Water nearby</span>
              <span><Crosshair size={12} /> One tab</span>
              <span><Flame size={12} /> {elapsedMinutes}m focused</span>
              <span><Target size={12} /> Close the loop</span>
            </div>
          </aside>
        </div>
      </div>
    </Modal>
  );
}
