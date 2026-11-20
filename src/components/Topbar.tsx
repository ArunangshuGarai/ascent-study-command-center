import {
  CalendarClock,
  Cloud,
  CloudOff,
  Command,
  Flame,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Terminal,
  Timer,
  Waves,
} from 'lucide-react';
import type { AppState, StudyTarget, View } from '../types';
import type { SyncStatus } from '../hooks/usePlanner';
import { cx, formatDate, todayISO } from '../lib/utils';
import { targetDaysLeft } from '../lib/targets';

const VIEW_LABEL: Record<View, string> = {
  today: 'Command center',
  board: 'Sprint board',
  journey: 'The ascent',
  syllabus: 'Syllabus cartography',
  insights: 'Insights',
  settings: 'Settings',
};

export function Topbar({
  state,
  view,
  target,
  streak,
  email,
  syncStatus,
  undoAvailable,
  onUndo,
  onFocus,
  onPalette,
  onOpenPrompt,
  onRetrySync,
  onOpenSettings,
  onOpenRipple,
}: {
  state: AppState;
  view: View;
  target?: StudyTarget;
  streak: number;
  email: string;
  syncStatus: SyncStatus;
  undoAvailable: boolean;
  onUndo: () => void;
  onFocus: () => void;
  onPalette: () => void;
  onOpenPrompt: () => void;
  onRetrySync: () => Promise<boolean> | void;
  onOpenSettings: () => void;
  onOpenRipple: () => void;
}) {
  const dateLabel = formatDate(todayISO(), 'medium');
  const initial = (state.profile.name || 'A').slice(0, 1).toUpperCase();
  const syncLabel = syncStatus === 'saved' ? 'Synced' : syncStatus === 'saving' ? 'Saving' : 'Retry sync';
  const daysToTarget = target ? targetDaysLeft(target) : null;
  const targetTitle = target?.title ?? 'No target';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-breadcrumb">
          <span className="topbar-app">ASCENT</span>
          <span className="topbar-slash">/</span>
          <span className="topbar-view">{VIEW_LABEL[view]}</span>
        </div>
        <div className="topbar-date">{dateLabel}</div>
      </div>

      <div className="topbar-actions">
        <button
          className={cx('topbar-sync', `is-${syncStatus}`)}
          onClick={() => {
            if (syncStatus === 'offline') void onRetrySync();
            else onOpenSettings();
          }}
          title={
            syncStatus === 'offline'
              ? 'Cloud save failed — click to retry'
              : syncStatus === 'saving'
                ? 'Saving your plan to the account database'
                : 'Plan saved to your account'
          }
        >
          {syncStatus === 'saving'
            ? <Loader2 size={13} className="spin" />
            : syncStatus === 'offline'
              ? <CloudOff size={13} />
              : <Cloud size={13} />}
          <span>{syncLabel}</span>
        </button>
        <button
          className={cx('topbar-pill countdown-pill', daysToTarget !== null && daysToTarget <= 14 && 'is-urgent')}
          onClick={onOpenSettings}
          title={
            target?.date
              ? `${targetTitle} — ${formatDate(target.date, 'long')}`
              : `${targetTitle} — rolling ${state.settings.horizonDays}-day plan`
          }
        >
          <CalendarClock size={14} />
          {daysToTarget !== null
            ? <span><b>{daysToTarget}</b> days to target</span>
            : <span><b>{state.settings.horizonDays}</b>-day rolling plan</span>}
        </button>
        <div className="topbar-pill streak-pill" title="Consecutive days with at least one completed session">
          <Flame size={14} />
          <span><b>{streak}</b> day streak</span>
        </div>
        <button
          className="topbar-command"
          onClick={onOpenPrompt}
          title="Command prompt — add blocks in plain language (Ctrl/Cmd + J)"
        >
          <Terminal size={15} />
          <span className="topbar-command-label">Command</span>
          <span className="topbar-kbd"><Command size={10} />J</span>
        </button>
        {state.lastRipple && (
          <button className="topbar-icon hide-mobile" onClick={onOpenRipple} aria-label="Latest ripple report" title="Latest ripple report">
            <Waves size={16} />
          </button>
        )}
        <button className="topbar-icon hide-mobile" onClick={onPalette} aria-label="Open command palette" title="Command palette">
          <Search size={17} />
          <span className="topbar-kbd"><Command size={10} />K</span>
        </button>
        <button
          className="topbar-icon hide-mobile"
          onClick={onUndo}
          disabled={!undoAvailable}
          aria-label="Undo last change"
          title="Undo last change"
        >
          <RotateCcw size={16} />
        </button>
        <button
          className="topbar-avatar"
          onClick={onOpenSettings}
          title={`${email} — account & settings`}
          aria-label="Account and settings"
        >
          {initial}
          <span className={cx('topbar-avatar-dot', `is-${syncStatus}`)} />
        </button>
        <button className="focus-cta" onClick={onFocus}>
          <span className="focus-cta-icon"><Play size={13} fill="currentColor" /></span>
          <span className="focus-cta-label">Focus</span>
          <span className="focus-cta-meta"><Timer size={11} /> 25</span>
        </button>
      </div>
    </header>
  );
}
