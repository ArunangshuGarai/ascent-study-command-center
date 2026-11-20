import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudSun,
  Moon,
  Plus,
  Sun,
  Sunrise,
  Sunset,
} from 'lucide-react';
import type { DayData, SlotId, Task } from '../types';
import { TIME_SLOTS } from '../data/curriculum';
import {
  addDays,
  cx,
  diffDays,
  formatClock,
  formatDate,
  formatDuration,
  hoursLabel,
  minutesFromTime,
  slotForTime,
  sumMinutes,
  todayISO,
  weekdayShort,
} from '../lib/utils';
import { TaskCard } from './TaskCard';

const SLOT_ICONS: Record<SlotId, typeof Sun> = {
  dawn: Sunrise,
  morning: Sun,
  midday: CloudSun,
  afternoon: Cloud,
  evening: Sunset,
  night: Moon,
};

export function DraggableTask({
  task,
  children,
  disabled,
}: {
  task: Task;
  children: ReactNode;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={cx('draggable-task', isDragging && 'is-dragging')}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}

function BoardColumn({
  date,
  slot,
  tasks,
  isToday,
  onOpen,
  onComplete,
  onAddTask,
  completionDisabled,
  nowMinutes,
  isDropTarget,
}: {
  date: string;
  slot: (typeof TIME_SLOTS)[number];
  tasks: Task[];
  isToday: boolean;
  onOpen: (task: Task) => void;
  onComplete: (task: Task) => void;
  onAddTask: (slot: SlotId) => void;
  completionDisabled: boolean;
  nowMinutes: number;
  isDropTarget: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot::${date}::${slot.id}`,
    data: { date, slot: slot.id },
  });
  const Icon = SLOT_ICONS[slot.id];
  const planned = sumMinutes(tasks);
  const done = tasks.filter((task) => task.status === 'done').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <section
      ref={setNodeRef}
      className={cx(
        'board-column',
        isOver && 'is-over',
        isDropTarget && 'is-drop-target',
        isToday && 'is-today-column',
      )}
      data-slot={slot.id}
    >
      <header className="column-head">
        <div className="column-title-row">
          <span className={cx('column-icon', `slot-${slot.id}`)}>
            <Icon size={14} />
          </span>
          <div>
            <h3>{slot.label}</h3>
            <span className="column-range">{slot.range}</span>
          </div>
          <span className="column-count">{tasks.length}</span>
        </div>
        <div className="column-meta">
          <span>{planned ? hoursLabel(planned) : 'Open'}</span>
          {tasks.length > 0 && (
            <span className="column-progress">
              <span className="mini-bar"><span style={{ width: `${pct}%` }} /></span>
              {done}/{tasks.length}
            </span>
          )}
        </div>
      </header>
      <div className="column-body">
        {tasks.map((task) => {
          const overdue =
            isToday &&
            task.status === 'todo' &&
            minutesFromTime(task.start) + task.duration < nowMinutes;
          return (
            <DraggableTask key={task.id} task={task} disabled={task.kind === 'exam' || task.kind === 'rest' || task.status !== 'todo'}>
              <TaskCard
                task={task}
                onOpen={onOpen}
                onComplete={onComplete}
                completionDisabled={completionDisabled}
                overdue={overdue}
                showDragHandle
              />
            </DraggableTask>
          );
        })}
        {tasks.length === 0 && (
          <button className="column-empty" onClick={() => onAddTask(slot.id)}>
            <span className="column-empty-icon"><Plus size={14} /></span>
            <span>{slot.hint}</span>
            <small>Map a block</small>
          </button>
        )}
        {tasks.length > 0 && (
          <button className="column-add" onClick={() => onAddTask(slot.id)}>
            <Plus size={13} /> add block
          </button>
        )}
      </div>
    </section>
  );
}

export function BoardSurface({
  date,
  tasks,
  onOpen,
  onComplete,
  onAddTask,
  completionDisabled,
  filter = 'all',
  isDropTarget,
}: {
  date: string;
  tasks: Task[];
  onOpen: (task: Task) => void;
  onComplete: (task: Task) => void;
  onAddTask: (slot: SlotId) => void;
  completionDisabled: boolean;
  filter?: 'all' | 'study' | 'test' | 'personal';
  isDropTarget?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isToday = date === todayISO();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      if (filter === 'all') return true;
      if (filter === 'study') return ['study', 'practice', 'pyq', 'revision'].includes(task.kind);
      if (filter === 'test') return ['test', 'mock', 'analysis'].includes(task.kind);
      return ['personal', 'rest'].includes(task.kind);
    });
  }, [tasks, filter]);
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.start.localeCompare(b.start)),
    [filtered],
  );

  const scrollBoard = (direction: number) => {
    scrollRef.current?.scrollBy({ left: direction * 320, behavior: 'smooth' });
  };

  return (
    <div className="board-wrap">
      <div className="board-scroll-controls">
        <span className="board-scroll-hint">Scroll the day →</span>
        <div>
          <button className="icon-button small" onClick={() => scrollBoard(-1)} aria-label="Scroll board left">
            <ChevronLeft size={16} />
          </button>
          <button className="icon-button small" onClick={() => scrollBoard(1)} aria-label="Scroll board right">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="board-columns" ref={scrollRef}>
        {TIME_SLOTS.map((slot) => (
          <BoardColumn
            key={slot.id}
            date={date}
            slot={slot}
            tasks={sorted.filter((task) => task.slot === slot.id)}
            isToday={isToday}
            onOpen={onOpen}
            onComplete={onComplete}
            onAddTask={onAddTask}
            completionDisabled={completionDisabled}
            nowMinutes={nowMinutes}
            isDropTarget={Boolean(isDropTarget)}
          />
        ))}
      </div>
    </div>
  );
}

function DateChip({
  date,
  active,
  isToday,
  tasks,
  restDays,
  onClick,
  droppable,
}: {
  date: string;
  active: boolean;
  isToday: boolean;
  tasks: Task[];
  restDays: string[];
  onClick: () => void;
  droppable: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day::${date}`,
    data: { date },
    disabled: !droppable,
  });
  const done = tasks.filter((task) => task.status === 'done').length;
  const hasMock = tasks.some((task) => task.kind === 'mock' || task.kind === 'exam');
  const isRest = restDays.includes(date);
  const monthStart = date.endsWith('-01') || date === todayISO();
  return (
    <button
      ref={setNodeRef}
      className={cx(
        'date-chip',
        active && 'is-active',
        isToday && 'is-today',
        isRest && 'is-rest',
        hasMock && 'has-mock',
        isOver && 'is-over',
      )}
      onClick={onClick}
      aria-label={formatDate(date, 'long')}
      title={formatDate(date, 'long')}
    >
      <span className="date-chip-month">{monthStart ? formatDate(date, 'short').split(' ')[1] : '\u00A0'}</span>
      <span className="date-chip-weekday">{weekdayShort(date).slice(0, 2)}</span>
      <span className="date-chip-day">{Number(date.slice(-2))}</span>
      <span className="date-chip-dots">
        {isRest ? (
          <i className="dot rest" />
        ) : hasMock ? (
          <i className="dot mock" />
        ) : (
          <>
            {tasks.some((task) => task.kind === 'study') && <i className="dot study" />}
            {tasks.some((task) => task.kind === 'test') && <i className="dot test" />}
            {tasks.length > 0 && done === tasks.length && <i className="dot done" />}
          </>
        )}
      </span>
    </button>
  );
}

export function DateRibbon({
  selected,
  onSelect,
  tasks,
  restDays,
  examDate,
  droppable = false,
  showPastDays = 0,
}: {
  selected: string;
  onSelect: (date: string) => void;
  tasks: Task[];
  restDays: string[];
  examDate: string;
  droppable?: boolean;
  showPastDays?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = todayISO();
  const start = addDays(today, -showPastDays);
  const totalDays = diffDays(start, examDate);
  const dates = Array.from({ length: Math.max(0, totalDays + 1) }, (_, index) => addDays(start, index));
  const dateTasks = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((task) => {
      const list = map.get(task.date) ?? [];
      list.push(task);
      map.set(task.date, list);
    });
    return map;
  }, [tasks]);

  useEffect(() => {
    const active = scrollRef.current?.querySelector<HTMLElement>('.date-chip.is-active');
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const scrollRibbon = (direction: number) => {
    scrollRef.current?.scrollBy({ left: direction * 420, behavior: 'smooth' });
  };

  return (
    <div className="date-ribbon-wrap">
      <button className="ribbon-arrow left" onClick={() => scrollRibbon(-1)} aria-label="Scroll dates left">
        <ChevronLeft size={16} />
      </button>
      <div className="date-ribbon" ref={scrollRef}>
        {dates.map((date) => (
          <DateChip
            key={date}
            date={date}
            active={date === selected}
            isToday={date === today}
            tasks={dateTasks.get(date) ?? []}
            restDays={restDays}
            onClick={() => onSelect(date)}
            droppable={droppable}
          />
        ))}
      </div>
      <button className="ribbon-arrow right" onClick={() => scrollRibbon(1)} aria-label="Scroll dates right">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function DndStage({
  children,
  tasks,
  onDragEnd,
  onOpen,
}: {
  children: ReactNode;
  tasks: Task[];
  onDragEnd: (task: Task, targetDate: string, targetSlot: SlotId) => void;
  onOpen: (task: Task) => void;
}) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor),
  );
  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((item) => item.id === event.active.id);
    setActiveTask(task ?? null);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const task = tasks.find((item) => item.id === event.active.id);
    if (!task || !event.over) return;
    const overId = String(event.over.id);
    if (overId.startsWith('slot::')) {
      const [, date, slot] = overId.split('::');
      onDragEnd(task, date, slot as SlotId);
    } else if (overId.startsWith('day::')) {
      onDragEnd(task, overId.replace('day::', ''), task.slot);
    }
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      {children}
      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
        {activeTask ? (
          <div className="drag-overlay-card">
            <TaskCard
              task={activeTask}
              onOpen={onOpen}
              compact={false}
              showDragHandle
            />
            <div className="drag-overlay-hint">Drop to reschedule → ripple the plan</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export function NowMarker() {
  return (
    <span className="now-marker">
      <i /> now
    </span>
  );
}

export function TaskCompleteSpark() {
  return (
    <span className="task-complete-spark"><Check size={12} /></span>
  );
}

export function DayMetaLine({ day, examDate }: { day: DayData; examDate: string }) {
  const minutes = sumMinutes(day.tasks);
  if (day.date === examDate) {
    return <span className="day-meta-line">Exam day · {formatDate(day.date, 'long')}</span>;
  }
  return (
    <span className="day-meta-line">
      {formatDate(day.date, 'medium')} · {minutes ? formatDuration(minutes) : 'Open'} · {day.tasks.length} blocks
    </span>
  );
}

export function timeLabel(time: string) {
  return formatClock(time);
}

export function taskSlot(task: Task) {
  return slotForTime(task.start);
}
