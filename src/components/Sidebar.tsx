import {
  ChartNoAxesColumn,
  Columns3,
  Flame,
  LayoutDashboard,
  Library,
  LogOut,
  Route,
  Settings,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import type { AppState, View } from '../types';
import type { SyncStatus } from '../hooks/usePlanner';
import { cx, formatDate, formatMonth, getStreakEmoji, levelInfo, taskXp, todayISO } from '../lib/utils';
import { hasGateTarget } from '../lib/targets';

const NAV_ITEMS: { view: View; label: string; icon: typeof LayoutDashboard; shortcut: string }[] = [
  { view: 'today', label: 'Command Center', icon: LayoutDashboard, shortcut: 'T' },
  { view: 'board', label: 'Sprint Board', icon: Columns3, shortcut: 'B' },
  { view: 'journey', label: 'The Ascent', icon: Route, shortcut: 'J' },
  { view: 'syllabus', label: 'Syllabus', icon: Library, shortcut: 'S' },
  { view: 'insights', label: 'Insights', icon: ChartNoAxesColumn, shortcut: 'I' },
  { view: 'settings', label: 'Settings', icon: Settings, shortcut: 'P' },
];

export function Sidebar({
  state,
  view,
  navigate,
  streak,
  email,
  syncStatus,
  onOpenBlueprint,
  onOpenPrompt,
  onSignOut,
}: {
  state: AppState;
  view: View;
  navigate: (view: View, date?: string) => void;
  streak: { current: number; best: number };
  email: string;
  syncStatus: SyncStatus;
  onOpenBlueprint: () => void;
  onOpenPrompt: () => void;
  onSignOut: () => void;
}) {
  const xp = taskXp(state.tasks);
  const level = levelInfo(xp);
  const firstName = state.profile.name.split(' ')[0] || 'Pilot';
  const gate = hasGateTarget(state);
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('today')} aria-label="ASCENT home">
        <span className="brand-mark" aria-hidden>
          <i /><i /><i /><b />
        </span>
        <span className="brand-copy">
          <span className="brand-name">ASCENT</span>
          <span className="brand-sub">{gate ? 'GATE command center' : 'Study command center'}</span>
        </span>
      </button>

      <div className="sidebar-date">
        <span className="live-dot" />
        <span>{formatDate(todayISO(), 'medium')}</span>
        <span className="sidebar-date-sep">·</span>
        <span>{formatMonth(todayISO()).split(' ')[0]}</span>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        <div className="sidebar-label">Workspace</div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              className={cx('nav-item', active && 'is-active')}
              onClick={() => navigate(item.view)}
              aria-current={active ? 'page' : undefined}
            >
              <span className="nav-icon"><Icon size={18} strokeWidth={active ? 2.2 : 1.8} /></span>
              <span className="nav-label">{item.label}</span>
              {item.view === 'board' && state.lastRipple && <span className="nav-pip" title="Plan recently re-flowed" />}
              <span className="nav-shortcut">{item.shortcut}</span>
            </button>
          );
        })}
      </nav>

      <button className="blueprint-cta" onClick={onOpenBlueprint}>
        <span className="blueprint-cta-icon"><Sparkles size={15} /></span>
        <span>
          <strong>Daily blueprint</strong>
          <small>{gate ? 'PYQ → deep work → test' : 'Plan → focus → review'}</small>
        </span>
        <span className="blueprint-arrow">↗</span>
      </button>

      <button className="sidebar-command-cta" onClick={onOpenPrompt}>
        <span className="sidebar-command-icon"><Terminal size={15} /></span>
        <span className="sidebar-command-copy">
          <strong>Command prompt</strong>
          <small>“gym tomorrow 7pm”</small>
        </span>
        <span className="sidebar-command-key">⌘J</span>
      </button>

      <div className="sidebar-spacer" />

      <div className="streak-card">
        <div className="streak-flame">
          <Flame size={18} />
          <span>{streak.current}</span>
        </div>
        <div>
          <strong>{streak.current ? 'Flame alive' : 'Light the flame'}</strong>
          <small>
            {streak.current
              ? `${streak.current}-day streak · best ${streak.best}`
              : 'One session starts the streak'}
          </small>
        </div>
        <span className="streak-emoji">{getStreakEmoji(streak.current)}</span>
      </div>

      <button className="pilot-card" onClick={() => navigate('insights')} aria-label="View your profile and progress">
        <span className="pilot-avatar">{firstName.slice(0, 1).toUpperCase()}</span>
        <span className="pilot-copy">
          <span className="pilot-name">{firstName}</span>
          <span className="pilot-level">{level.name} · Lv {level.index}</span>
          <span className="pilot-xp-bar">
            <span style={{ width: `${Math.round(level.progress * 100)}%` }} />
          </span>
        </span>
        <span className="pilot-zap"><Zap size={13} /><b>{xp}</b></span>
      </button>

      <div className="sidebar-account">
        <span className="sidebar-account-avatar">{(state.profile.name || 'A').slice(0, 1).toUpperCase()}</span>
        <span className="sidebar-account-copy">
          <span className="sidebar-account-email" title={email}>{email}</span>
          <span className={cx('sidebar-account-sync', `is-${syncStatus}`)}>
            <i /> {syncStatus === 'saved' ? 'Plan synced to account' : syncStatus === 'saving' ? 'Syncing plan…' : 'Sync interrupted'}
          </span>
        </span>
        <button className="sidebar-signout" onClick={onSignOut} title="Sign out of ASCENT" aria-label="Sign out">
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}

export function MobileNav({
  view,
  navigate,
  onOpenPrompt,
}: {
  view: View;
  navigate: (view: View, date?: string) => void;
  onOpenPrompt: () => void;
}) {
  const items = NAV_ITEMS.filter((item) => item.view !== 'settings');
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.view}
            className={cx('mobile-nav-item', view === item.view && 'is-active')}
            onClick={() => navigate(item.view)}
            aria-current={view === item.view ? 'page' : undefined}
            aria-label={item.label}
          >
            <Icon size={20} strokeWidth={view === item.view ? 2.3 : 1.8} />
            <span>{item.view === 'today' ? 'Today' : item.label.split(' ').slice(-1)[0]}</span>
          </button>
        );
      })}
      <button
        className="mobile-nav-item mobile-nav-command"
        onClick={onOpenPrompt}
        aria-label="Open the command prompt"
      >
        <Terminal size={20} strokeWidth={1.9} />
        <span>Command</span>
      </button>
    </nav>
  );
}
