import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Command,
  CornerDownLeft,
  Search,
  Sparkles,
} from 'lucide-react';
import type { Task } from '../types';
import {
  cx,
  relativeDayLabel,
  subjectById,
  todayISO,
} from '../lib/utils';
import { taskKindMeta } from './TaskCard';
import { Modal } from './ui';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  keywords?: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  commands,
  tasks,
  onOpenTask,
}: {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
  tasks: Task[];
  onOpenTask: (task: Task) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayISO();

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  const commandResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.hint ?? ''} ${command.group ?? ''} ${command.keywords ?? ''}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [commands, query]);

  const taskResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const sorted = [...tasks].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.start.localeCompare(b.start);
    });
    const pool = normalized
      ? sorted.filter((task) => {
        const subject = subjectById(task.subjectId)?.name ?? '';
        return `${task.title} ${task.subtitle ?? ''} ${subject} ${task.kind} ${task.date}`
          .toLowerCase()
          .includes(normalized);
      })
      : sorted.filter((task) => task.date >= today && task.status === 'todo');
    return pool.slice(0, 8);
  }, [tasks, query, today]);

  const total = commandResults.length + taskResults.length;
  const clamped = Math.min(active, Math.max(0, total - 1));

  useEffect(() => {
    setActive(0);
  }, [query]);

  const activate = (index: number) => {
    if (index < commandResults.length) {
      const command = commandResults[index];
      onClose();
      window.setTimeout(() => command.run(), 20);
      return;
    }
    const task = taskResults[index - commandResults.length];
    if (task) {
      onClose();
      window.setTimeout(() => onOpenTask(task), 20);
    }
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((value) => (total ? (value + 1) % total : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) => (total ? (value - 1 + total) % total : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (total) activate(clamped);
    }
  };

  return (
    <Modal open={open} onClose={onClose} className="palette-modal" wide instant>
      <div className="palette-search">
        <Search size={19} />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKey}
          placeholder="Jump to a view, find a block, run an action…"
          aria-label="Search commands and tasks"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="palette-esc">ESC</span>
      </div>

      <div className="palette-body">
        {commandResults.length > 0 && (
          <div className="palette-section">
            <div className="palette-section-label">ACTIONS & DESTINATIONS</div>
            {commandResults.map((command, index) => (
              <button
                key={command.id}
                className={cx('palette-row', clamped === index && 'is-active')}
                onMouseEnter={() => setActive(index)}
                onClick={() => activate(index)}
              >
                <span className="palette-icon">{command.icon}</span>
                <span className="palette-row-copy">
                  <strong>{command.label}</strong>
                  {command.hint && <small>{command.hint}</small>}
                </span>
                {command.group && <span className="palette-group">{command.group}</span>}
                <CornerDownLeft size={12} className="palette-enter" />
              </button>
            ))}
          </div>
        )}

        {taskResults.length > 0 && (
          <div className="palette-section">
            <div className="palette-section-label">
              {query ? 'MATCHING BLOCKS' : 'UP NEXT'}
            </div>
            {taskResults.map((task, index) => {
              const meta = taskKindMeta(task);
              const Icon = meta.icon;
              const subject = subjectById(task.subjectId);
              const globalIndex = commandResults.length + index;
              return (
                <button
                  key={task.id}
                  className={cx('palette-row', clamped === globalIndex && 'is-active')}
                  onMouseEnter={() => setActive(globalIndex)}
                  onClick={() => activate(globalIndex)}
                >
                  <span className="palette-icon" style={{ color: subject?.color ?? meta.color }}>
                    <Icon size={15} />
                  </span>
                  <span className="palette-row-copy">
                    <strong>{task.title}</strong>
                    <small>
                      {relativeDayLabel(task.date)} · {task.start} · {subject?.short ?? meta.label}
                    </small>
                  </span>
                  <span className={cx('palette-task-status', `status-${task.status}`)}>{task.status}</span>
                  <CornerDownLeft size={12} className="palette-enter" />
                </button>
              );
            })}
          </div>
        )}

        {total === 0 && (
          <div className="palette-empty">
            <Sparkles size={24} />
            <strong>No matches.</strong>
            <span>Try a subject, a task name, or a view like “journey”.</span>
          </div>
        )}
      </div>

      <footer className="palette-foot">
        <span><ArrowUp size={11} /><ArrowDown size={11} /> navigate</span>
        <span><CornerDownLeft size={11} /> select</span>
        <span><Command size={11} /> K toggle</span>
        <span className="palette-count">{total} results</span>
      </footer>
    </Modal>
  );
}
