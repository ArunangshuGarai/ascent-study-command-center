import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  ChartNoAxesColumn,
  Columns3,
  LayoutDashboard,
  Library,
  Moon,
  Plus,
  Route as RouteIcon,
  Settings,
  Sparkles,
  Terminal,
  Timer,
  Waves,
} from 'lucide-react';
import type { SlotId, Task, View } from '../types';
import { usePlanner } from '../hooks/usePlanner';
import { api } from '../lib/api';
import { prepareState } from '../lib/storage';
import { createICS, downloadFile, streakInfo, todayISO } from '../lib/utils';
import { planningEnd, primaryTarget } from '../lib/targets';
import type { OnboardingInput } from '../hooks/usePlanner';
import { CommandCenter } from './CommandCenter';
import { BoardView } from './BoardView';
import { JourneyView } from './JourneyView';
import { SyllabusView } from './SyllabusView';
import { InsightsView } from './InsightsView';
import { SettingsView } from './SettingsView';
import { Sidebar, MobileNav } from './Sidebar';
import { Topbar } from './Topbar';
import { Onboarding } from './Onboarding';
import { TaskDetail } from './TaskDetail';
import { AddTaskModal } from './AddTaskModal';
import { FocusOverlay } from './FocusOverlay';
import { RippleDrawer } from './RippleDrawer';
import { BlueprintDrawer } from './BlueprintDrawer';
import { CommandPalette, type PaletteCommand } from './CommandPalette';
import { CommandConsole } from './CommandConsole';
import { ToastHost } from './ToastHost';
import { ScoreDialog } from './ScoreDialog';
import type { AccountStats, AccountUser } from '../lib/api';
import type { AppState } from '../types';

interface HashRoute {
  view: View;
  date?: string;
}

const VIEWS: View[] = ['today', 'board', 'journey', 'syllabus', 'insights', 'settings'];

function parseHash(): HashRoute {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [viewRaw, dateRaw] = raw.split('/');
  const view = VIEWS.includes(viewRaw as View) ? (viewRaw as View) : 'today';
  const date = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined;
  return { view, date };
}

function hashFor(view: View, date?: string) {
  return `#/${view}${date ? `/${date}` : ''}`;
}

function clampDate(date: string, endDate: string) {
  const today = todayISO();
  if (date < today) return today;
  if (date > endDate) return endDate;
  return date;
}

export function Workspace({
  user,
  serverState,
  accountStats,
  onStats,
  onUser,
  onSignOut,
}: {
  user: AccountUser;
  serverState: AppState | null;
  accountStats: AccountStats | null;
  onStats: (stats: AccountStats) => void;
  onUser: (user: AccountUser) => void;
  onSignOut: () => Promise<void>;
}) {
  const [bootstrap] = useState(() => prepareState(serverState, user.name));
  const planner = usePlanner({
    initialState: bootstrap.state,
    saveInitial: Boolean(bootstrap.rollover || bootstrap.migrated),
    rollover: bootstrap.rollover,
    persist: async (snapshot) => {
      const result = await api.savePlanner(snapshot);
      return { stats: result.stats, user: result.user };
    },
    onSaved: (result) => {
      onStats(result.stats);
      onUser(result.user);
    },
  });

  const {
    state,
    toasts,
    removeToast,
    undo,
    undoAvailable,
    syncStatus,
    flushSave,
    completeTask,
    uncompleteTask,
    skipTask,
    deferTask,
    addTask,
    addBlocks,
    deleteTask,
    setTaskNote,
    setTaskScore,
    updateProfile,
    setConfidence,
    toggleRestDay,
    boostSubject,
    updateSettings,
    addTarget,
    updateTarget,
    focusTarget,
    archiveTarget,
    restoreTarget,
    addSubject,
    addTopic,
    updateTopic,
    deleteTopic,
    applyImport,
    finishOnboarding,
    resetProgress,
    resetAll,
    importData,
  } = planner;

  const [route, setRoute] = useState<HashRoute>(() => parseHash());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [addState, setAddState] = useState<{ open: boolean; date: string; slot?: SlotId }>({
    open: false,
    date: todayISO(),
  });
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | undefined>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [rippleOpen, setRippleOpen] = useState(false);
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [scoreTaskId, setScoreTaskId] = useState<string | null>(null);

  const today = todayISO();
  const horizonEnd = planningEnd(state, today);
  const target = primaryTarget(state);
  const selectedDate = route.view === 'board' ? clampDate(route.date ?? today, horizonEnd) : today;

  const streak = useMemo(() => streakInfo(state.tasks), [state.tasks]);

  const nextTodayTask = useMemo(
    () => state.tasks
      .filter((task) => task.date === today && task.status === 'todo' && task.kind !== 'rest')
      .sort((a, b) => a.start.localeCompare(b.start))[0],
    [state.tasks, today],
  );

  const navigate = useCallback((view: View, date?: string) => {
    const next = view === 'board' ? clampDate(date ?? today, horizonEnd) : undefined;
    window.location.hash = hashFor(view, next);
    setRoute({ view, date: next });
  }, [horizonEnd, today]);

  const openTask = useCallback((task: Task) => {
    setDetailId(task.id);
  }, []);

  const openFocus = useCallback((task?: Task) => {
    setFocusTaskId(task?.id);
    setFocusOpen(true);
  }, []);

  const openAdd = useCallback((date?: string, slot?: SlotId) => {
    setAddState({ open: true, date: clampDate(date ?? today, horizonEnd), slot });
  }, [horizonEnd, today]);

  const handleGrade = useCallback((taskId: string, score: number) => {
    const task = state.tasks.find((entry) => entry.id === taskId);
    if (!task) return;
    if (task.status === 'todo') completeTask(taskId, score);
    else setTaskScore(taskId, score);
  }, [completeTask, setTaskScore, state.tasks]);

  const handleOnboarding = useCallback((input: OnboardingInput) => {
    finishOnboarding(input);
    window.location.hash = hashFor('today');
    setRoute({ view: 'today' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [finishOnboarding]);

  const handleResetAll = useCallback(() => {
    resetAll();
    window.location.hash = hashFor('today');
    setRoute({ view: 'today' });
  }, [resetAll]);

  const handleSignOut = useCallback(async () => {
    await flushSave();
    await onSignOut();
  }, [flushSave, onSignOut]);

  useEffect(() => {
    if (!window.location.hash) window.location.hash = hashFor('today');
    const onHash = () => {
      const next = parseHash();
      setRoute(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route.view]);

  useEffect(() => {
    if (detailId && !state.tasks.some((task) => task.id === detailId)) setDetailId(null);
    if (scoreTaskId && !state.tasks.some((task) => task.id === scoreTaskId)) setScoreTaskId(null);
    if (focusTaskId && !state.tasks.some((task) => task.id === focusTaskId)) setFocusTaskId(undefined);
  }, [state.tasks, detailId, scoreTaskId, focusTaskId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setPromptOpen((open) => !open);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const editing = target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      );
      if (editing || paletteOpen || promptOpen || focusOpen || detailId || addState.open || rippleOpen || blueprintOpen) return;
      const key = event.key.toLowerCase();
      if (key === 't') navigate('today');
      else if (key === 'b') navigate('board', today);
      else if (key === 'j') navigate('journey');
      else if (key === 's') navigate('syllabus');
      else if (key === 'i') navigate('insights');
      else if (key === 'p') navigate('settings');
      else if (key === 'f') openFocus(nextTodayTask);
      else if (event.key === '?') setBlueprintOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    navigate,
    today,
    nextTodayTask,
    openFocus,
    paletteOpen,
    promptOpen,
    focusOpen,
    detailId,
    addState.open,
    rippleOpen,
    blueprintOpen,
  ]);

  const detailTask = detailId ? state.tasks.find((task) => task.id === detailId) : undefined;
  const detailTargetDate = detailTask
    ? state.targets.find((entry) => entry.id === detailTask.targetId)?.date
    : undefined;
  const detailMoveEnd = detailTargetDate && detailTargetDate < horizonEnd ? detailTargetDate : horizonEnd;
  const detailConfidence = detailTask?.topicId
    ? state.topicProgress.find((entry) => entry.topicId === detailTask.topicId)?.confidence ?? 3
    : 3;
  const focusTask = focusTaskId ? state.tasks.find((task) => task.id === focusTaskId) : undefined;
  const scoreTask = scoreTaskId ? state.tasks.find((task) => task.id === scoreTaskId) : undefined;

  const commands: PaletteCommand[] = [
    {
      id: 'prompt',
      label: 'Command the center',
      hint: 'Add study or life blocks in plain language',
      group: 'Act',
      icon: <Terminal size={15} />,
      run: () => setPromptOpen(true),
    },
    {
      id: 'today',
      label: 'Go to command center',
      hint: 'Today’s vitals, quests and board',
      group: 'Navigate',
      icon: <LayoutDashboard size={15} />,
      run: () => navigate('today'),
    },
    {
      id: 'board',
      label: 'Open sprint board',
      hint: 'Six time-of-day columns, every day',
      group: 'Navigate',
      icon: <Columns3 size={15} />,
      run: () => navigate('board', today),
    },
    {
      id: 'journey',
      label: 'Open the ascent',
      hint: 'Every day until exam day',
      group: 'Navigate',
      icon: <RouteIcon size={15} />,
      run: () => navigate('journey'),
    },
    {
      id: 'syllabus',
      label: 'Open syllabus cartography',
      hint: `${state.subjects.length} subjects · ${state.topics.reduce((sum, topic) => sum + topic.units, 0)} units`,
      group: 'Navigate',
      icon: <Library size={15} />,
      run: () => navigate('syllabus'),
    },
    {
      id: 'insights',
      label: 'Open insights',
      hint: 'XP, streak, mastery and mock lab',
      group: 'Navigate',
      icon: <ChartNoAxesColumn size={15} />,
      run: () => navigate('insights'),
    },
    {
      id: 'settings',
      label: 'Open mission control',
      hint: 'Exam date, templates, account and data',
      group: 'Navigate',
      icon: <Settings size={15} />,
      run: () => navigate('settings'),
    },
    {
      id: 'focus',
      label: 'Start a focus session',
      hint: nextTodayTask ? nextTodayTask.title : 'Open a clean timer',
      group: 'Act',
      icon: <Timer size={15} />,
      run: () => openFocus(nextTodayTask),
    },
    {
      id: 'add',
      label: 'Add a block to today',
      hint: 'Manual blocks stay pinned',
      group: 'Act',
      icon: <Plus size={15} />,
      run: () => openAdd(today),
    },
    {
      id: 'rest',
      label: state.restDays.includes(today) ? 'Restore today as a study day' : 'Make today a recovery day',
      hint: 'The unresolved queue re-flows',
      group: 'Act',
      icon: <Moon size={15} />,
      run: () => toggleRestDay(today),
    },
    {
      id: 'blueprint',
      label: 'Open the daily blueprint',
      hint: 'PYQ → deep work → test method',
      group: 'Learn',
      icon: <Sparkles size={15} />,
      run: () => setBlueprintOpen(true),
    },
    {
      id: 'ripple',
      label: 'Inspect the last ripple',
      hint: state.lastRipple ? state.lastRipple.reason : 'No changes applied yet',
      group: 'Learn',
      icon: <Waves size={15} />,
      run: () => setRippleOpen(true),
    },
    {
      id: 'ics',
      label: 'Export calendar (.ics)',
      hint: 'Every scheduled block, all calendars',
      group: 'Data',
      icon: <CalendarPlus size={15} />,
      run: () => downloadFile(`ascent-study-plan-${today}.ics`, createICS(state), 'text/calendar'),
    },
  ];

  const renderView = () => {
    switch (route.view) {
      case 'board':
        return (
          <BoardView
            state={state}
            selectedDate={selectedDate}
            onSelectDate={(date) => navigate('board', date)}
            onOpenTask={openTask}
            onComplete={(task) => completeTask(task.id)}
            onAddTask={openAdd}
            onToggleRest={toggleRestDay}
            onMoveTask={(task, date, slot) => deferTask(task.id, date, slot)}
            onOpenFocus={openFocus}
            onOpenRipple={() => setRippleOpen(true)}
          />
        );
      case 'journey':
        return (
          <JourneyView
            state={state}
            onNavigate={navigate}
            onOpenTask={openTask}
            onOpenRipple={() => setRippleOpen(true)}
          />
        );
      case 'syllabus':
        return (
          <SyllabusView
            state={state}
            onBoost={boostSubject}
            onSetConfidence={setConfidence}
            onNavigate={navigate}
          />
        );
      case 'insights':
        return (
          <InsightsView
            state={state}
            onOpenTask={openTask}
            onLogScore={(task) => setScoreTaskId(task.id)}
            onStartFocus={openFocus}
            onNavigate={navigate}
            onOpenRipple={() => setRippleOpen(true)}
          />
        );
      case 'settings':
        return (
          <SettingsView
            state={state}
            account={user}
            accountStats={accountStats}
            syncStatus={syncStatus}
            onRetrySync={flushSave}
            onSignOut={handleSignOut}
            onUpdateSettings={updateSettings}
            onUpdateProfile={updateProfile}
            onResetProgress={resetProgress}
            onResetAll={handleResetAll}
            onImport={importData}
            onAddTarget={addTarget}
            onUpdateTarget={updateTarget}
            onFocusTarget={focusTarget}
            onArchiveTarget={archiveTarget}
            onRestoreTarget={restoreTarget}
            onAddSubject={addSubject}
            onAddTopic={addTopic}
            onUpdateTopic={updateTopic}
            onDeleteTopic={deleteTopic}
            onApplyImport={applyImport}
          />
        );
      default:
        return (
          <CommandCenter
            state={state}
            target={target}
            streak={streak.current}
            onNavigate={navigate}
            onOpenTask={openTask}
            onComplete={(task) => completeTask(task.id)}
            onAddTask={openAdd}
            onToggleRest={toggleRestDay}
            onOpenBlueprint={() => setBlueprintOpen(true)}
            onOpenPrompt={() => setPromptOpen(true)}
            onOpenFocus={openFocus}
            onOpenRipple={() => setRippleOpen(true)}
            onMoveTask={(task, date, slot) => deferTask(task.id, date, slot)}
          />
        );
    }
  };

  if (!state.profile.onboarded) {
    return (
      <>
        <div className="app-ambient" aria-hidden />
        <Onboarding
          defaultName={state.profile.name || user.name}
          accountEmail={user.email}
          onComplete={handleOnboarding}
        />
        <ToastHost toasts={toasts} onDismiss={removeToast} />
      </>
    );
  }

  return (
    <>
      <div className="app-ambient" aria-hidden />
      <div className="app-shell">
        <Sidebar
          state={state}
          view={route.view}
          navigate={navigate}
          streak={streak}
          email={user.email}
          syncStatus={syncStatus}
          onOpenBlueprint={() => setBlueprintOpen(true)}
          onOpenPrompt={() => setPromptOpen(true)}
          onSignOut={handleSignOut}
        />

        <div className="app-main">
          <Topbar
            state={state}
            view={route.view}
            target={target}
            streak={streak.current}
            email={user.email}
            syncStatus={syncStatus}
            undoAvailable={undoAvailable}
            onUndo={undo}
            onFocus={() => openFocus(nextTodayTask)}
            onPalette={() => setPaletteOpen(true)}
            onOpenPrompt={() => setPromptOpen(true)}
            onRetrySync={flushSave}
            onOpenSettings={() => navigate('settings')}
            onOpenRipple={() => setRippleOpen(true)}
          />
          <main className="app-content">{renderView()}</main>
        </div>

        <MobileNav view={route.view} navigate={navigate} onOpenPrompt={() => setPromptOpen(true)} />
      </div>

      <TaskDetail
        task={detailTask}
        confidence={detailConfidence}
        examDate={detailMoveEnd}
        onClose={() => setDetailId(null)}
        onComplete={(task) => completeTask(task.id)}
        onUncomplete={(task) => uncompleteTask(task.id)}
        onSkip={(task) => {
          skipTask(task.id);
          setDetailId(null);
        }}
        onDelete={(task) => {
          deleteTask(task.id);
          setDetailId(null);
        }}
        onDefer={(taskId, date, slot, start) => deferTask(taskId, date, slot, start)}
        onSetNote={setTaskNote}
        onSetConfidence={setConfidence}
        onStartFocus={(task) => {
          setDetailId(null);
          openFocus(task);
        }}
        onGrade={handleGrade}
      />

      <AddTaskModal
        open={addState.open}
        date={addState.date}
        slot={addState.slot}
        endDate={horizonEnd}
        subjects={state.subjects}
        targets={state.targets}
        defaultTargetId={state.settings.primaryTargetId}
        onClose={() => setAddState((current) => ({ ...current, open: false }))}
        onAdd={addTask}
      />

      <CommandConsole
        open={promptOpen}
        state={state}
        onClose={() => setPromptOpen(false)}
        onAddBlocks={addBlocks}
      />

      <FocusOverlay
        open={focusOpen}
        task={focusTask}
        onClose={() => {
          setFocusOpen(false);
          setFocusTaskId(undefined);
        }}
        onComplete={(task) => completeTask(task.id)}
      />

      <RippleDrawer
        open={rippleOpen}
        report={state.lastRipple}
        onClose={() => setRippleOpen(false)}
        onNavigate={navigate}
      />

      <BlueprintDrawer
        open={blueprintOpen}
        state={state}
        onClose={() => setBlueprintOpen(false)}
        onNavigate={navigate}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        tasks={state.tasks}
        onOpenTask={openTask}
      />

      <ScoreDialog
        task={scoreTask}
        onClose={() => setScoreTaskId(null)}
        onSave={handleGrade}
      />

      <ToastHost toasts={toasts} onDismiss={removeToast} />
    </>
  );
}
