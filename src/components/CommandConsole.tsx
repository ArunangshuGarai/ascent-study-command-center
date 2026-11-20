import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  Brain,
  CalendarDays,
  Clock3,
  Coffee,
  CornerDownLeft,
  Crosshair,
  RefreshCw,
  Sparkles,
  Target,
  Terminal,
  Trash2,
  WandSparkles,
  Zap,
} from 'lucide-react';
import type { AppState, NewTaskInput } from '../types';
import {
  cx,
  endTime,
  formatDate,
  formatDuration,
  minutesFromTime,
  subjectById,
  todayISO,
} from '../lib/utils';
import { dateOffsetLabel, parseCommand, type ParsedBlock } from '../lib/commandParser';
import { Modal } from './ui';

const EXAMPLES = [
  { label: '2h DBMS normalization tomorrow at 9am', icon: Brain },
  { label: 'gym today 7pm for 1 hour', icon: Coffee },
  { label: 'PYQ OS 2023 paper Saturday 10am 90m', icon: Crosshair },
  { label: 'revise TOC every weekday at 8pm for 2 weeks', icon: RefreshCw },
  { label: 'mock test Sunday 9am 3h', icon: Target },
  { label: 'call mom Sunday at 6pm', icon: Coffee },
];

const KIND_ICON: Record<string, typeof Brain> = {
  study: Brain,
  pyq: Crosshair,
  test: Target,
  mock: Target,
  analysis: AlertTriangle,
  revision: Sparkles,
  practice: Zap,
  personal: Coffee,
  rest: Coffee,
};

function blockConflicts(block: ParsedBlock, state: AppState) {
  const start = minutesFromTime(block.start);
  const end = start + block.duration;
  return state.tasks.filter((task) => {
    if (task.date !== block.date) return false;
    if (task.status === 'skipped' || task.status === 'missed' || task.kind === 'rest' || task.kind === 'exam') return false;
    const taskStart = minutesFromTime(task.start);
    return start < taskStart + task.duration && taskStart < end;
  });
}

export function CommandConsole({
  open,
  state,
  onClose,
  onAddBlocks,
}: {
  open: boolean;
  state: AppState;
  onClose: () => void;
  onAddBlocks: (blocks: NewTaskInput[]) => void;
}) {
  const [text, setText] = useState('');
  const deferred = useDeferredValue(text);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const today = todayISO();

  useEffect(() => {
    if (!open) {
      setText('');
      setRemoved(new Set());
      setApplied(false);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 90);
    return () => window.clearTimeout(timer);
  }, [open]);

  const parsed = useMemo(
    () => parseCommand(deferred, state.settings.examDate, today),
    [deferred, state.settings.examDate, today],
  );

  const blocks = useMemo(
    () => parsed.blocks.filter((block) => !removed.has(block.id)),
    [parsed.blocks, removed],
  );

  const conflicts = useMemo(() => {
    const map = new Map<string, string[]>();
    blocks.forEach((block) => {
      const hits = blockConflicts(block, state);
      if (hits.length) map.set(block.id, hits.map((task) => task.title));
    });
    return map;
  }, [blocks, state]);

  const summary = useMemo(() => {
    if (!blocks.length) return null;
    const dates = new Set(blocks.map((block) => block.date));
    const minutes = blocks.reduce((sum, block) => sum + block.duration, 0);
    return { count: blocks.length, days: dates.size, minutes };
  }, [blocks]);

  const apply = () => {
    if (!blocks.length || applied) return;
    setApplied(true);
    const payload: NewTaskInput[] = blocks.map((block) => ({
      title: block.title,
      date: block.date,
      start: block.start,
      duration: block.duration,
      kind: block.kind,
      subjectId: block.subjectId,
      notes: block.notes ? `Command: ${block.notes}` : undefined,
    }));
    onAddBlocks(payload);
    window.setTimeout(() => {
      onClose();
    }, 350);
  };

  const removeBlock = (id: string) => {
    setRemoved((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  const restore = () => {
    setRemoved(new Set());
    setApplied(false);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, ParsedBlock[]>();
    blocks.forEach((block) => {
      const list = map.get(block.date) ?? [];
      list.push(block);
      map.set(block.date, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [blocks]);

  return (
    <Modal open={open} onClose={onClose} className="command-console-modal" wide labelledBy="command-console-title">
      <div className="console-scanline" aria-hidden />
      <div className="modal-heading console-heading">
        <div className="console-heading-mark">
          <Terminal size={20} />
          <span className="console-live-dot" />
        </div>
        <div>
          <div className="eyebrow">NATURAL LANGUAGE · LIVE PARSER</div>
          <h2 id="command-console-title">Command the center.</h2>
          <p>One line per block. Study or life — I’ll find the date, time, subject and duration.</p>
        </div>
        <div className="console-status">
          <span className="console-status-dot" />
          {blocks.length ? `${blocks.length} block${blocks.length === 1 ? '' : 's'} armed` : 'Awaiting command'}
        </div>
      </div>

      <div className="console-grid">
        <div className="console-input-pane">
          <div className="console-prompt-shell">
            <span className="console-chevron">›</span>
            <textarea
              ref={inputRef}
              className="console-input"
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  apply();
                }
              }}
              placeholder={'e.g. 45 min DBMS normalization tomorrow at 6pm\ngym Sunday 8am for 1 hour\nrevise TOC every weekday at 9pm for 2 weeks'}
              spellCheck={false}
            />
            <span className="console-caret" aria-hidden />
          </div>

          <div className="console-hint-row">
            <span><CornerDownLeft size={12} /> New line for another block</span>
            <span><b>⌘</b> + <b>Enter</b> to map</span>
          </div>

          <div className="console-suggestions">
            <span className="console-suggestions-label">Try a command</span>
            <div className="console-chip-row">
              {EXAMPLES.map((example) => {
                const Icon = example.icon;
                return (
                  <button
                    key={example.label}
                    className="console-chip"
                    onClick={() => {
                      setText((current) => (current.trim() ? `${current.trim()}\n${example.label}` : example.label));
                      setRemoved(new Set());
                      inputRef.current?.focus();
                    }}
                  >
                    <Icon size={12} />
                    {example.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="console-logic">
            <div className="console-logic-head">
              <WandSparkles size={14} /> How the parser reads you
            </div>
            <div className="console-logic-grid">
              <span><b>Date</b> today · tomorrow · Friday · in 3 days</span>
              <span><b>Time</b> 6pm · 18:30 · morning · night</span>
              <span><b>Length</b> 45m · 1.5h · for an hour</span>
              <span><b>Subject</b> DBMS · OS · TOC · maths</span>
              <span><b>Life</b> gym · call · lunch · rest</span>
              <span><b>Repeat</b> every day · weekdays · Monday</span>
            </div>
          </div>

          {(parsed.warnings.length > 0 || conflicts.size > 0) && (
            <div className="console-warnings">
              {parsed.warnings.map((warning) => (
                <div className="console-warning" key={warning}>
                  <AlertTriangle size={13} />
                  <span>{warning}</span>
                </div>
              ))}
              {conflicts.size > 0 && (
                <div className="console-warning is-conflict">
                  <AlertTriangle size={13} />
                  <span>
                    {conflicts.size} block{conflicts.size === 1 ? '' : 's'} overlap an existing session. You can still map
                    them — the board will show both.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="console-preview-pane">
          <div className="console-preview-head">
            <div>
              <span className="eyebrow">PARSED OUTPUT</span>
              <h3>{summary ? `${summary.count} sessions · ${summary.days} day${summary.days === 1 ? '' : 's'}` : 'Nothing parsed yet.'}</h3>
            </div>
            {removed.size > 0 && (
              <button className="console-restore" onClick={restore}>
                Restore {removed.size}
              </button>
            )}
          </div>

          <div className="console-preview-body">
            {!text.trim() && (
              <div className="console-empty">
                <span className="console-empty-orbit" aria-hidden><i /><i /><b /></span>
                <strong>Type a command.</strong>
                <p>The preview assembles here before anything touches your plan.</p>
              </div>
            )}

            {text.trim() && blocks.length === 0 && (
              <div className="console-empty">
                <AlertTriangle size={20} />
                <strong>No readable block found.</strong>
                <p>Try naming an activity, a date and a length: “2h DBMS tomorrow at 9am”.</p>
              </div>
            )}

            {grouped.map(([date, dateBlocks]) => (
              <div className="console-day-group" key={date}>
                <div className="console-day-head">
                  <span>{dateOffsetLabel(date, today)}</span>
                  <b>{formatDate(date, 'medium')}</b>
                  <small>{dateBlocks.length} block{dateBlocks.length === 1 ? '' : 's'}</small>
                </div>
                {dateBlocks.map((block) => {
                  const Icon = KIND_ICON[block.kind] ?? Brain;
                  const subject = subjectById(block.subjectId);
                  const overlap = conflicts.get(block.id);
                  return (
                    <div
                      className={cx(
                        'console-block',
                        `console-block-${block.kind}`,
                        overlap && 'has-conflict',
                      )}
                      key={block.id}
                    >
                      <div className="console-block-time">
                        <strong>{block.start}</strong>
                        <span>{endTime(block.start, block.duration)}</span>
                        <small>{formatDuration(block.duration)}</small>
                      </div>
                      <div className="console-block-main">
                        <div className="console-block-title">
                          <Icon size={14} />
                          <strong>{block.title}</strong>
                          {subject && (
                            <span className="console-subject" style={{ '--subject-color': subject.color } as CSSProperties}>
                              <i /> {subject.short}
                            </span>
                          )}
                        </div>
                        <div className="console-block-meta">
                          <span>{block.explanation || block.subjectLabel}</span>
                          {overlap && <em>Overlaps: {overlap.slice(0, 2).join(', ')}</em>}
                        </div>
                      </div>
                      <button
                        className="console-block-remove"
                        onClick={() => removeBlock(block.id)}
                        aria-label={`Remove ${block.title}`}
                        title="Remove from batch"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="console-footer">
            <div className="console-summary">
              <span><CalendarDays size={13} /> {summary ? `${summary.days} day${summary.days === 1 ? '' : 's'}` : '—'}</span>
              <span><Clock3 size={13} /> {summary ? formatDuration(summary.minutes) : '—'}</span>
            </div>
            <div className="console-actions">
              <button className="text-button" onClick={onClose}>Cancel</button>
              <button className="primary-button console-apply" onClick={apply} disabled={!blocks.length || applied}>
                {applied ? <RefreshCw size={15} className="spin" /> : <CornerDownLeft size={15} />}
                {applied ? 'Mapping…' : `Map ${blocks.length || ''} block${blocks.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
