import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Check,
  Clock3,
  Crosshair,
  Cloud,
  CloudOff,
  Database,
  Download,
  FileJson,
  Loader2,
  LogOut,
  Moon,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Timer,
  Trash2,
  Upload,
  UserRound,
  Volume2,
  Waves,
  PartyPopper,
  Zap,
  X,
} from 'lucide-react';
import type { AppState, BlockTemplate, BlockRole, PlannerSettings, StudyTarget } from '../types';
import type { AccountStats, AccountUser } from '../lib/api';
import type { ImportApplyOptions, ImportApplyResult, NewTargetInput } from '../hooks/usePlanner';
import type { ImportPlan } from '../lib/bulkImport';
import type { SyncStatus } from '../hooks/usePlanner';
import { defaultSettings, TOPIC_MAP } from '../data/curriculum';
import {
  FLOW_PLAN_START,
  FLOW_PLAN_END,
  STUDY_PLAN,
  planForDate,
  studyFlowForDate,
} from '../data/dailyFlow';
import { computePhases } from '../lib/schedule';
import { primaryTarget, targetDaysLeft } from '../lib/targets';
import {
  addDays,
  createICS,
  cx,
  diffDays,
  downloadFile,
  formatDate,
  formatDuration,
  hoursLabel,
  minutesFromTime,
  rangeInclusive,
  timeFromMinutes,
  todayISO,
  uid,
  weekdayIndex,
} from '../lib/utils';
import { Badge, Toggle } from './ui';
import { ConfirmDialog } from './ConfirmDialog';
import { DailyFlowRail } from './DailyFlowRail';
import { TargetManager } from './TargetManager';
import { ImportPanel } from './ImportPanel';

const ROLE_LABEL: Record<BlockRole, string> = {
  pyq: 'PYQ recon',
  core: 'Deep work',
  test: 'Validation',
  deepdive: 'Deep dive',
  weekly: 'Weekly test',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type TemplateGroup = 'weekday' | 'weekend';

export function SettingsView({
  state,
  account,
  accountStats,
  syncStatus,
  onRetrySync,
  onSignOut,
  onUpdateSettings,
  onUpdateProfile,
  onResetProgress,
  onResetAll,
  onImport,
  onAddTarget,
  onUpdateTarget,
  onFocusTarget,
  onArchiveTarget,
  onRestoreTarget,
  onAddSubject,
  onAddTopic,
  onUpdateTopic,
  onDeleteTopic,
  onApplyImport,
}: {
  state: AppState;
  account: AccountUser;
  accountStats: AccountStats | null;
  syncStatus: SyncStatus;
  onRetrySync: () => Promise<boolean> | void;
  onSignOut: () => void | Promise<void>;
  onUpdateSettings: (settings: PlannerSettings) => void;
  onUpdateProfile: (name: string) => void;
  onResetProgress: () => void;
  onResetAll: () => void;
  onImport: (text: string) => void;
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
  onApplyImport: (plan: ImportPlan, options: ImportApplyOptions) => ImportApplyResult | null;
}) {
  const today = todayISO();
  const totalUnits = state.topics.reduce((sum, topic) => sum + topic.units, 0);
  const hasGate = state.targets.some((target) => target.preset === 'gate-cse' && !target.archivedAt);
  const gateTarget = state.targets.find((target) => target.preset === 'gate-cse' && !target.archivedAt);
  const capacityUnits = gateTarget
    ? state.topics.filter((topic) => topic.targetId === gateTarget.id).reduce((sum, topic) => sum + topic.units, 0)
    : totalUnits;
  const focusTarget = primaryTarget(state);
  const focusDays = focusTarget ? targetDaysLeft(focusTarget) : null;
  const [draft, setDraft] = useState<PlannerSettings>(state.settings);
  const [name, setName] = useState(state.profile.name);
  const [confirm, setConfirm] = useState<'progress' | 'all' | 'import' | null>(null);
  const [pendingImport, setPendingImport] = useState<{ text: string; label: string } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [flowPreviewDate, setFlowPreviewDate] = useState(
    today >= FLOW_PLAN_START && today <= FLOW_PLAN_END ? today : FLOW_PLAN_START,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(state.settings);
  }, [state.settings]);

  useEffect(() => {
    setName(state.profile.name);
  }, [state.profile.name]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings);
  const examValid = Boolean(draft.examDate) && diffDays(today, draft.examDate) >= 1;
  const daysToExam = examValid ? Math.max(0, diffDays(today, draft.examDate)) : 0;
  const nameValid = name.trim().length > 0 && name.trim() !== state.profile.name;

  const coreCounts = useMemo(() => ({
    weekday: draft.weekday.filter((block) => block.role === 'core').length,
    weekend: draft.weekend.filter((block) => block.role === 'core').length,
  }), [draft.weekday, draft.weekend]);

  const duplicateStarts = useMemo(() => {
    const check = (blocks: BlockTemplate[]) => {
      const seen = new Set<string>();
      return blocks.some((block) => {
        if (seen.has(block.start)) return true;
        seen.add(block.start);
        return false;
      });
    };
    return check(draft.weekday) || check(draft.weekend);
  }, [draft.weekday, draft.weekend]);

  const validArchitecture = examValid
    && (draft.dailyFlow || (coreCounts.weekday > 0 && coreCounts.weekend > 0 && !duplicateStarts));

  const flowPreviewOptions = useMemo(() => {
    const within = STUDY_PLAN.filter((row) => row.date <= draft.examDate);
    const pick = (mode: 'study' | 'mock' | 'revision' | 'rest') => within.find((row) => row.mode === mode);
    const options: { label: string; date: string }[] = [];
    const study = pick('study');
    if (study) options.push({ label: 'Study day', date: study.date });
    const mock = pick('mock');
    if (mock) options.push({ label: 'Mock day', date: mock.date });
    const revision = pick('revision');
    if (revision) options.push({ label: 'Final revision', date: revision.date });
    const rest = pick('rest');
    if (rest) options.push({ label: 'Rest day', date: rest.date });
    return options;
  }, [draft.examDate]);

  useEffect(() => {
    if (!flowPreviewOptions.some((option) => option.date === flowPreviewDate)) {
      setFlowPreviewDate(flowPreviewOptions[0]?.date ?? FLOW_PLAN_START);
    }
  }, [flowPreviewOptions, flowPreviewDate]);

  const preview = useMemo(() => {
    if (!examValid) {
      return {
        studyDays: 0,
        sessions: 0,
        minutes: 0,
        mocks: 0,
        phaseStart: today,
        fits: true,
        applicable: false,
        mappedUnits: 0,
        sittings: 0,
        flow: false,
      };
    }
    const phases = computePhases(draft);

    if (draft.dailyFlow) {
      const planDates = STUDY_PLAN
        .filter((row) => row.date >= today && row.date < draft.examDate)
        .filter((row) => !state.restDays.includes(row.date));
      const minutes = planDates.reduce(
        (sum, row) => sum + (row.mode === 'rest' ? 150 : 420),
        0,
      );
      const sessions = planDates.reduce(
        (sum, row) => sum + studyFlowForDate(row.date).length,
        0,
      );
      const mappedUnits = new Set<string>();
      const gateTopicIds = new Set(
        state.topics.filter((topic) => topic.targetId === gateTarget?.id).map((topic) => topic.id),
      );
      STUDY_PLAN
        .filter((row) => row.date < draft.examDate)
        .forEach((row) => {
          if (!row.topicId || !gateTopicIds.has(row.topicId)) return;
          const units = TOPIC_MAP.get(row.topicId)?.units ?? 1;
          for (let index = 1; index <= units; index += 1) mappedUnits.add(`${row.topicId}:${index}`);
        });
      return {
        studyDays: planDates.length,
        sessions,
        minutes,
        mocks: planDates.filter((row) => row.mode === 'mock').length,
        phaseStart: phases.phaseStart,
        fits: !hasGate || mappedUnits.size >= capacityUnits,
        applicable: hasGate,
        mappedUnits: mappedUnits.size,
        sittings: planDates.filter((row) => row.mode === 'study').length,
        flow: true,
      };
    }

    const studyDates = rangeInclusive(today, addDays(phases.phaseStart, -1))
      .filter((date) => date < draft.examDate && !state.restDays.includes(date));
    let minutes = 0;
    studyDates.forEach((date) => {
      const heavy = draft.heavyDays.includes(weekdayIndex(date));
      const template = heavy ? draft.weekend : draft.weekday;
      minutes += template.filter((block) => block.role === 'core').reduce((sum, block) => sum + block.duration, 0);
    });
    const sessions = studyDates.reduce((sum, date) => {
      const heavy = draft.heavyDays.includes(weekdayIndex(date));
      return sum + (heavy ? coreCounts.weekend : coreCounts.weekday);
    }, 0);
    const sittings = Math.floor(minutes / 45);
    return {
      studyDays: studyDates.length,
      sessions,
      minutes,
      mocks: phases.mockDates.length,
      phaseStart: phases.phaseStart,
      fits: !hasGate || sittings >= capacityUnits,
      applicable: hasGate,
      mappedUnits: Math.min(sittings, capacityUnits),
      sittings,
      flow: false,
    };
  }, [draft, examValid, state.restDays, state.topics, today, coreCounts, capacityUnits, hasGate, gateTarget]);

  const weeklyMinutes = useMemo(() => {
    if (draft.dailyFlow) {
      return rangeInclusive(today, addDays(today, 6)).reduce((sum, date) => {
        const flow = planForDate(date);
        if (flow && !state.restDays.includes(date)) {
          return sum + studyFlowForDate(date).reduce((total, block) => total + block.duration, 0);
        }
        const heavy = draft.heavyDays.includes(weekdayIndex(date));
        const template = heavy ? draft.weekend : draft.weekday;
        return sum + template.reduce((total, block) => total + block.duration, 0);
      }, 0);
    }
    const weekdayTotal = draft.weekday.reduce((sum, block) => sum + block.duration, 0);
    const weekendTotal = draft.weekend.reduce((sum, block) => sum + block.duration, 0);
    const heavyCount = draft.heavyDays.length;
    return weekdayTotal * (7 - heavyCount) + weekendTotal * heavyCount;
  }, [draft, state.restDays, today]);

  const patch = (partial: Partial<PlannerSettings>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  };

  const updateBlock = (group: TemplateGroup, id: string, patchBlock: Partial<BlockTemplate>) => {
    setDraft((prev) => {
      const blocks = prev[group].map((block) => (block.id === id ? { ...block, ...patchBlock } : block));
      return group === 'weekday' ? { ...prev, weekday: blocks } : { ...prev, weekend: blocks };
    });
  };

  const removeBlock = (group: TemplateGroup, id: string) => {
    setDraft((prev) => {
      const target = prev[group].find((block) => block.id === id);
      if (!target) return prev;
      if (target.role === 'core' && prev[group].filter((block) => block.role === 'core').length <= 1) return prev;
      const blocks = prev[group].filter((block) => block.id !== id);
      return group === 'weekday' ? { ...prev, weekday: blocks } : { ...prev, weekend: blocks };
    });
  };

  const addBlock = (group: TemplateGroup) => {
    setDraft((prev) => {
      const blocks = prev[group];
      const last = blocks[blocks.length - 1];
      const start = last
        ? timeFromMinutes(Math.min(23 * 60 + 30, minutesFromTime(last.start) + last.duration + 15))
        : '09:00';
      const block: BlockTemplate = {
        id: uid('block'),
        role: 'core',
        label: 'Extra Deep Work',
        start,
        duration: 45,
      };
      return group === 'weekday'
        ? { ...prev, weekday: [...prev.weekday, block] }
        : { ...prev, weekend: [...prev.weekend, block] };
    });
  };

  const toggleHeavyDay = (day: number) => {
    setDraft((prev) => ({
      ...prev,
      heavyDays: prev.heavyDays.includes(day)
        ? prev.heavyDays.filter((entry) => entry !== day)
        : [...prev.heavyDays, day].sort(),
    }));
  };

  const resetTemplates = () => {
    const defaults = defaultSettings(draft.examDate);
    patch({
      weekday: defaults.weekday.map((block) => ({ ...block })),
      weekend: defaults.weekend.map((block) => ({ ...block })),
      heavyDays: defaults.heavyDays,
    });
  };

  const exportPlanner = () => {
    downloadFile(
      `ascent-planner-${today}.json`,
      JSON.stringify(state, null, 2),
      'application/json',
    );
  };

  const exportCalendar = () => {
    downloadFile(`ascent-study-plan-${today}.ics`, createICS(state), 'text/calendar');
  };

  const onFilePicked = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      setPendingImport({ text, label: file.name });
      setConfirm('import');
    } catch {
      setPendingImport({ text: '', label: 'unreadable file' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const applyImport = () => {
    if (!pendingImport?.text) return;
    onImport(pendingImport.text);
    setPendingImport(null);
    setPasteText('');
    setPasteOpen(false);
  };

  const applyArchitecture = () => {
    if (!validArchitecture) return;
    onUpdateSettings({
      ...draft,
      examLabel: draft.examLabel.trim() || 'Study plan',
    });
  };

  const formatCheckpoint = (date: string) => (date ? formatDate(date, 'short') : '—');
  const syncLabel = syncStatus === 'saved'
    ? 'All changes saved'
    : syncStatus === 'saving'
      ? 'Saving to account…'
      : 'Save interrupted';
  const syncTime = accountStats?.updatedAt
    ? new Date(accountStats.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Not synced yet';

  return (
    <div className="settings-view">
      <header className="page-head">
        <div className="page-head-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> MISSION CONTROL</div>
          <h1>Change the machine.</h1>
          <p className="page-lede">
            Every knob here re-flows the future. Completed work and manual blocks stay pinned; the
            unresolved queue adapts around them.
          </p>
        </div>
        <div className="page-actions">
          {dirty ? (
            <Badge tone="amber"><AlertTriangle size={12} /> Unsaved changes</Badge>
          ) : (
            <Badge tone="green"><Check size={12} /> Plan in sync</Badge>
          )}
          <button className="small-button ghost" onClick={exportPlanner}>
            <Download size={14} /> Export
          </button>
        </div>
      </header>

      <div className="settings-layout">
        <div className="settings-main">
          <section className="settings-card account-card">
            <div className="settings-card-head">
              <span className="settings-card-icon sky"><ShieldCheck size={17} /></span>
              <div>
                <span className="eyebrow">OPERATOR ACCOUNT</span>
                <h3>Your private command center.</h3>
              </div>
              <span className={cx('account-sync-badge', `is-${syncStatus}`)}>
                {syncStatus === 'saving' ? <Loader2 size={12} className="spin" /> : syncStatus === 'offline' ? <CloudOff size={12} /> : <Cloud size={12} />}
                {syncLabel}
              </span>
            </div>

            <div className="account-identity">
              <span className="account-avatar">{(state.profile.name || account.name || 'A').slice(0, 1).toUpperCase()}</span>
              <div className="account-identity-copy">
                <strong>{account.name}</strong>
                <span>{account.email}</span>
                <small>Operator since {formatDate(account.createdAt.slice(0, 10), 'medium')}</small>
              </div>
              <div className="account-actions">
                {syncStatus === 'offline' && (
                  <button className="small-button ghost" onClick={() => void onRetrySync()}>
                    <RotateCcw size={13} /> Retry save
                  </button>
                )}
                <button className="small-button danger-ghost" onClick={() => void onSignOut()}>
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            </div>

            <div className="account-ledger">
              <div>
                <span>XP banked</span>
                <strong>{accountStats ? accountStats.xp.toLocaleString() : '—'}</strong>
                <small>lifetime, cloud ledger</small>
              </div>
              <div>
                <span>Sessions done</span>
                <strong>{accountStats ? accountStats.completed.toLocaleString() : '—'}</strong>
                <small>{accountStats ? formatDuration(accountStats.studyMinutes) : '—'} of study</small>
              </div>
              <div>
                <span>Best streak</span>
                <strong>{accountStats ? `${accountStats.bestStreak}d` : '—'}</strong>
                <small>{accountStats?.mocksTaken ? `${accountStats.mocksTaken} mocks · ${accountStats.mockAvg}% avg` : 'no mocks logged yet'}</small>
              </div>
              <div>
                <span>Coverage</span>
                <strong>{accountStats ? `${accountStats.coverage}%` : '—'}</strong>
                <small>syllabus cleared</small>
              </div>
            </div>

            <div className="account-foot">
              <span><Database size={12} /> Per-user planner + stats database</span>
              <span>{syncTime}</span>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-card-icon lime"><UserRound size={17} /></span>
              <div>
                <span className="eyebrow">PILOT & HORIZON</span>
                <h3>Who is flying, and to when.</h3>
              </div>
            </div>

            <div className="settings-profile-row">
              <div className="settings-avatar">{(state.profile.name || 'A').slice(0, 1).toUpperCase()}</div>
              <label className="field grow">
                <span className="field-label">Pilot name</span>
                <div className="inline-field">
                  <input
                    className="text-input"
                    value={name}
                    maxLength={32}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <button className="small-button ghost" disabled={!nameValid} onClick={() => onUpdateProfile(name)}>
                    <Save size={13} /> Save
                  </button>
                </div>
              </label>
              <div className="settings-member-since">
                <small>PILOT SINCE</small>
                <strong>{formatDate(state.profile.createdAt.slice(0, 10), 'short')}</strong>
              </div>
            </div>

            <div className="settings-two-col">
              <label className="field">
                <span className="field-label">Primary target date</span>
                <div className="input-with-icon">
                  <CalendarClock size={15} />
                  <input
                    type="date"
                    className={cx('text-input', !examValid && 'has-error')}
                    value={draft.examDate}
                    min={addDays(today, 1)}
                    onChange={(event) => patch({ examDate: event.target.value })}
                  />
                </div>
                <span className={cx('field-hint', !examValid && 'field-error')}>
                  {examValid
                    ? `${formatDate(draft.examDate, 'long')} · ${daysToExam} days from today`
                    : 'Target date must be at least tomorrow.'}
                </span>
                <div className="date-quick-picks">
                  {[30, 60, 90, 180].map((offset) => (
                    <button key={offset} onClick={() => patch({ examDate: addDays(today, offset) })}>
                      +{offset}d
                    </button>
                  ))}
                </div>
              </label>
              <label className="field">
                <span className="field-label">Primary target label</span>
                <input
                  className="text-input"
                  value={draft.examLabel}
                  maxLength={48}
                  onChange={(event) => patch({ examLabel: event.target.value })}
                  placeholder="GATE CSE 2027 or Semester finals"
                />
                <span className="field-hint">Shows in the topbar, countdown and calendar export.</span>
                <div className="exam-preview">
                  <span className="live-dot" />
                  {draft.examLabel.trim() || 'Main target'} · {formatCheckpoint(draft.examDate)}
                </div>
              </label>
            </div>

            <div className="settings-two-col settings-horizon-row">
              <label className="field">
                <span className="field-label">Rolling horizon <b>{draft.horizonDays} days</b></span>
                <input
                  type="range"
                  min={7}
                  max={120}
                  step={1}
                  value={draft.horizonDays}
                  onChange={(event) => patch({ horizonDays: Number(event.target.value) })}
                />
                <span className="field-hint">
                  Targets without a date get this many days of fresh plan. It rolls forward every day,
                  so progress never stops for a countdown.
                </span>
              </label>
            </div>
          </section>

          <TargetManager
            state={state}
            onAddTarget={onAddTarget}
            onUpdateTarget={onUpdateTarget}
            onFocusTarget={onFocusTarget}
            onArchiveTarget={onArchiveTarget}
            onRestoreTarget={onRestoreTarget}
            onAddSubject={onAddSubject}
            onAddTopic={onAddTopic}
            onUpdateTopic={onUpdateTopic}
            onDeleteTopic={onDeleteTopic}
          />

          <ImportPanel state={state} onApply={onApplyImport} />

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-card-icon violet"><SlidersHorizontal size={17} /></span>
              <div>
                <span className="eyebrow">PLAN ARCHITECTURE</span>
                <h3>How the endgame is built.</h3>
              </div>
            </div>
            {!hasGate && (
              <div className="settings-inline-warning">
                <AlertTriangle size={14} /> These Daily Flow and template controls belong to the GATE
                preset. Your custom targets use the universal scheduler and their own curriculum.
              </div>
            )}

            <div className="settings-two-col">
              <label className="field">
                <span className="field-label">Mock phase <b>{draft.mockPhaseDays} days</b></span>
                <input
                  type="range"
                  min={6}
                  max={30}
                  step={1}
                  value={draft.mockPhaseDays}
                  onChange={(event) => patch({ mockPhaseDays: Number(event.target.value) })}
                />
                <span className="field-hint">Final stretch reserved for simulations, autopsies and repair.</span>
              </label>
              <label className="field">
                <span className="field-label">Full mocks <b>{draft.mockCount}</b></span>
                <input
                  type="range"
                  min={1}
                  max={Math.min(10, draft.mockPhaseDays)}
                  step={1}
                  value={draft.mockCount}
                  onChange={(event) => patch({ mockCount: Number(event.target.value) })}
                />
                <span className="field-hint">Spread evenly across the mock phase. Each gets an autopsy day.</span>
              </label>
            </div>
            <div className="settings-two-col">
              <label className="field">
                <span className="field-label">Quiet revision days <b>{draft.revisionDays}</b></span>
                <input
                  type="range"
                  min={0}
                  max={6}
                  step={1}
                  value={draft.revisionDays}
                  onChange={(event) => patch({ revisionDays: Number(event.target.value) })}
                />
                <span className="field-hint">Formula sheet passes at the end. No new testing.</span>
              </label>
              <div className="field">
                <span className="field-label">Heavy-lift days</span>
                <div className="day-picker">
                  {DAY_NAMES.map((day, index) => (
                    <button
                      key={day}
                      className={cx('day-pill', draft.heavyDays.includes(index) && 'is-active')}
                      onClick={() => toggleHeavyDay(index)}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <span className="field-hint">These days use the longer weekend template and weekly test.</span>
              </div>
            </div>
          </section>

          <section className="settings-card flow-card">
            <div className="settings-card-head">
              <span className="settings-card-icon lime"><Waves size={17} /></span>
              <div>
                <span className="eyebrow">DAILY FLOW</span>
                <h3>The 7-hour rhythm.</h3>
              </div>
              <Badge tone={draft.dailyFlow ? 'lime' : 'neutral'}>
                {draft.dailyFlow ? 'Active' : 'Parked'}
              </Badge>
            </div>

            <Toggle
              checked={draft.dailyFlow}
              onChange={(value) => patch({ dailyFlow: value })}
              label="Five study windows, every day"
              description="PYQ recon 09:30 · Core dive 11:00 · Practice 16:00 · Revision 18:30 · Validation 20:30. Gym, meals, walks and the nap are fixed anchors."
            />

            <div className="flow-preview-controls">
              <span className="flow-preview-label">Preview the rhythm</span>
              <div className="flow-preview-chips">
                {flowPreviewOptions.map((option) => (
                  <button
                    key={option.date}
                    type="button"
                    className={cx('flow-preview-chip', flowPreviewDate === option.date && 'is-active')}
                    onClick={() => setFlowPreviewDate(option.date)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={cx('flow-preview-frame', !draft.dailyFlow && 'is-parked')}>
              <DailyFlowRail date={flowPreviewDate} tasks={[]} preview bare />
            </div>

            <div className="flow-plan-facts">
              <span><CalendarDays size={12} /> 84-day plan · 15 Nov → 6 Feb</span>
              <span><Swords size={12} /> 5 full mocks · 31 Jan → 4 Feb</span>
              <span><Crosshair size={12} /> Final revision · 5 Feb</span>
              <span><Moon size={12} /> Rest · 6 Feb</span>
            </div>

            {!draft.dailyFlow && (
              <div className="settings-inline-warning">
                <AlertTriangle size={14} /> Daily Flow is parked. The custom templates below own the day.
              </div>
            )}
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-card-icon amber"><Clock3 size={17} /></span>
              <div>
                <span className="eyebrow">DAILY TEMPLATES</span>
                <h3>The shape of a day.</h3>
              </div>
              <button
                className="text-button settings-reset-templates"
                onClick={resetTemplates}
                disabled={draft.dailyFlow}
              >
                <RotateCcw size={12} /> Reset defaults
              </button>
            </div>
            {draft.dailyFlow && (
              <div className="template-locked-note">
                <Waves size={14} /> Daily Flow owns this schedule. Turn it off above to hand-shape weekday and weekend templates.
              </div>
            )}
            <div className={cx('template-grid', draft.dailyFlow && 'is-locked')}>
              {(['weekday', 'weekend'] as TemplateGroup[]).map((group) => {
                const blocks = draft[group];
                const total = blocks.reduce((sum, block) => sum + block.duration, 0);
                return (
                  <div key={group} className="template-column">
                    <div className="template-column-head">
                      <div>
                        <strong>{group === 'weekday' ? 'Standard day' : 'Heavy-lift day'}</strong>
                        <span>{formatDuration(total)} of structure · {blocks.filter((block) => block.role === 'core').length} deep-work blocks</span>
                      </div>
                      <Badge tone={group === 'weekday' ? 'violet' : 'amber'}>{group === 'weekday' ? 'Mon–Fri' : 'Weekend'}</Badge>
                    </div>
                    <div className="template-rows">
                      {blocks.map((block) => (
                        <div key={block.id} className="template-row">
                          <span className={cx('template-role', `role-${block.role}`)}>{ROLE_LABEL[block.role]}</span>
                          <input
                            className="template-label"
                            value={block.label}
                            maxLength={24}
                            disabled={draft.dailyFlow}
                            aria-label={`${ROLE_LABEL[block.role]} label`}
                            onChange={(event) => updateBlock(group, block.id, { label: event.target.value })}
                          />
                          <input
                            className="template-time"
                            type="time"
                            value={block.start}
                            disabled={draft.dailyFlow}
                            aria-label={`${block.label} start time`}
                            onChange={(event) => updateBlock(group, block.id, { start: event.target.value })}
                          />
                          <label className="template-duration">
                            <input
                              type="number"
                              min={15}
                              max={180}
                              step={5}
                              value={block.duration}
                              disabled={draft.dailyFlow}
                              aria-label={`${block.label} duration in minutes`}
                              onChange={(event) => updateBlock(group, block.id, {
                                duration: Math.max(15, Math.min(180, Number(event.target.value) || 15)),
                              })}
                            />
                            <span>m</span>
                          </label>
                          <button
                            className="template-remove"
                            onClick={() => removeBlock(group, block.id)}
                            disabled={draft.dailyFlow || (block.role === 'core' && blocks.filter((entry) => entry.role === 'core').length <= 1)}
                            aria-label={`Remove ${block.label}`}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button className="template-add" onClick={() => addBlock(group)} disabled={draft.dailyFlow}>
                      <Plus size={13} /> Add deep-work block
                    </button>
                  </div>
                );
              })}
            </div>
            {duplicateStarts && (
              <div className="settings-inline-warning">
                <AlertTriangle size={14} /> Two blocks share a start time. Give each block its own slot before applying.
              </div>
            )}
            <div className="settings-footnote">
              <Sparkles size={13} />
              {draft.dailyFlow
                ? <>Daily Flow rewrites the 84-day plan from today. Manual blocks stay pinned; study windows slide around them. Switch it off to hand-shape the templates.</>
                : <>Template changes only apply when you press <strong>Apply & ripple</strong>. Generated future sessions are rebuilt; completed work stays exactly where it is.</>}
            </div>
          </section>

          <section className="settings-card danger-zone">
            <div className="settings-card-head">
              <span className="settings-card-icon rose"><AlertTriangle size={17} /></span>
              <div>
                <span className="eyebrow">DANGER ZONE</span>
                <h3>Irreversible moves.</h3>
              </div>
            </div>
            <div className="danger-row">
              <div>
                <strong>Reset progress, keep the plan design</strong>
                <span>Clears completions, notes, confidence and XP. Regenerates a clean queue with your current settings.</span>
              </div>
              <button className="small-button ghost" onClick={() => setConfirm('progress')}>
                <RotateCcw size={13} /> Reset progress
              </button>
            </div>
            <div className="danger-row">
              <div>
                <strong>Erase everything</strong>
                <span>Wipes the browser save, returns to onboarding, and asks for a new horizon. Export first if you care about this run.</span>
              </div>
              <button className="small-button danger-button" onClick={() => setConfirm('all')}>
                <Trash2 size={13} /> Erase all
              </button>
            </div>
          </section>
        </div>

        <aside className="settings-aside">
          <section className="settings-card preview-card">
            <div className="settings-card-head compact">
              <span className="settings-card-icon sky"><CalendarDays size={17} /></span>
              <div>
                <span className="eyebrow">LIVE PREVIEW</span>
                <h3>What this builds.</h3>
              </div>
            </div>
            <div className="preview-countdown">
              <strong>{focusDays ?? draft.horizonDays}</strong>
              <span>{focusDays !== null ? 'days to showtime' : 'day rolling window'}</span>
              <small>
                {focusTarget?.date
                  ? `${formatCheckpoint(focusTarget.date)} · ${focusTarget.title}`
                  : `No countdown · ${focusTarget?.title ?? (draft.examLabel || 'Study plan')}`}
              </small>
            </div>
            <div className="preview-stats">
              <div><span>Study days</span><strong>{preview.studyDays}</strong></div>
              <div><span>Deep sessions</span><strong>{preview.sessions}</strong></div>
              <div><span>Study hours</span><strong>{hoursLabel(preview.minutes)}</strong></div>
              <div><span>Boss fights</span><strong>{preview.mocks}</strong></div>
            </div>
            <div className="preview-fit">
              <div className="preview-fit-head">
                <span>Syllabus capacity</span>
                <strong className={preview.fits ? 'is-good' : 'is-risk'}>
                  {!preview.applicable
                    ? 'Universal planner'
                    : preview.fits
                      ? `All ${capacityUnits} units fit`
                      : `${Math.max(0, capacityUnits - preview.mappedUnits)} units at risk`}
                </strong>
              </div>
              {preview.applicable ? (
                <>
                  <div className="preview-fit-bar">
                    <span style={{ width: `${Math.min(100, (preview.mappedUnits / Math.max(1, capacityUnits)) * 100)}%` }} />
                    <i style={{ left: `${Math.min(100, (capacityUnits / Math.max(1, preview.mappedUnits)) * 100)}%` }} />
                  </div>
                  <small>
                    {preview.flow
                      ? `${preview.mappedUnits} units mapped by the fixed plan · ${capacityUnits} required`
                      : `${preview.sittings} × 45-min sittings available · ${capacityUnits} required`}
                  </small>
                </>
              ) : (
                <small>
                  Capacity applies to the GATE preset. Your custom targets are distributed by the universal scheduler.
                </small>
              )}
            </div>
            <div className="preview-window">
              <div><span className="live-dot" /> Study window</div>
              <strong>{formatCheckpoint(today)} → {formatCheckpoint(addDays(preview.phaseStart, -1))}</strong>
              <div><span className="mock-dot" /> Mock window</div>
              <strong>{formatCheckpoint(preview.phaseStart)} → {formatCheckpoint(draft.examDate)}</strong>
            </div>
            <div className="preview-weekly">
              <Timer size={13} />
              <span>{hoursLabel(weeklyMinutes)} of structured study per week</span>
            </div>
            {!preview.fits && examValid && (
              <div className="preview-warning">
                <AlertTriangle size={13} />
                The calendar cannot carry the entire syllabus with this architecture. Add a core block, extend the horizon, or accept adaptive practice sprints.
              </div>
            )}
          </section>

          <section className="settings-card">
            <div className="settings-card-head compact">
              <span className="settings-card-icon lime"><Zap size={17} /></span>
              <div>
                <span className="eyebrow">EXPERIENCE</span>
                <h3>Reward the loop.</h3>
              </div>
            </div>
            <div className="settings-toggles">
              <Toggle
                checked={draft.sound}
                onChange={(value) => patch({ sound: value })}
                label="Completion chimes"
                description="Synthesised sound on completion and rank-up."
              />
              <Toggle
                checked={draft.confetti}
                onChange={(value) => patch({ confetti: value })}
                label="Confetti bursts"
                description="Respects reduced-motion preferences automatically."
              />
            </div>
            <div className="settings-note-row">
              <Volume2 size={13} />
              <span>Sound is generated in the browser. No audio files, no tracking.</span>
            </div>
            <div className="settings-note-row">
              <PartyPopper size={13} />
              <span>The engine celebrates completed loops, not opened pages.</span>
            </div>
          </section>

          <section className="settings-card data-card">
            <div className="settings-card-head compact">
              <span className="settings-card-icon violet"><Database size={17} /></span>
              <div>
                <span className="eyebrow">YOUR DATA</span>
                <h3>Server-backed. Account-private.</h3>
              </div>
            </div>
            <p className="settings-data-copy">
              Your plan lives in your ASCENT account, not this browser. Every change syncs to the
              database, and only you can read it. Export a snapshot whenever you want an offline copy.
            </p>
            <div className="data-stat-row">
              <div><span>Blocks saved</span><strong>{state.tasks.length}</strong></div>
              <div><span>Save version</span><strong>v{state.version}</strong></div>
            </div>
            <div className="data-actions">
              <button className="ghost-button full" onClick={exportPlanner}>
                <FileJson size={14} /> Export planner JSON
              </button>
              <button className="ghost-button full" onClick={exportCalendar}>
                <CalendarPlus size={14} /> Export calendar (.ics)
              </button>
              <button className="ghost-button full" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Import planner JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                onChange={(event) => void onFilePicked(event.target.files?.[0])}
              />
              <button
                className={cx('text-button data-paste-toggle', pasteOpen && 'is-active')}
                onClick={() => setPasteOpen((open) => !open)}
              >
                or paste JSON manually
              </button>
            </div>
            {pasteOpen && (
              <div className="paste-import">
                <textarea
                  className="text-area"
                  rows={5}
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder='{"profile": … }'
                />
                <button
                  className="small-button"
                  disabled={!pasteText.trim()}
                  onClick={() => {
                    setPendingImport({ text: pasteText, label: 'pasted JSON' });
                    setConfirm('import');
                  }}
                >
                  <Upload size={13} /> Review import
                </button>
              </div>
            )}
            <div className="settings-version">
              <Moon size={11} /> ASCENT · v1.1 · adaptive study planner
            </div>
          </section>
        </aside>
      </div>

      {dirty && (
        <div className="settings-savebar">
          <div className="savebar-copy">
            <span className="savebar-pulse" />
            <div>
              <strong>Unsaved architecture changes</strong>
              <span>Saving rebuilds the future from today and fires a ripple report.</span>
            </div>
          </div>
          <div className="savebar-actions">
            <button className="ghost-button" onClick={() => setDraft(state.settings)}>
              Discard
            </button>
            <button
              className="primary-button"
              onClick={applyArchitecture}
              disabled={!validArchitecture}
              title={!validArchitecture ? 'Fix the exam date, duplicate starts, or empty core blocks first.' : undefined}
            >
              <Save size={14} /> Apply & ripple
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'progress'}
        onClose={() => setConfirm(null)}
        title="Reset all progress?"
        copy="Completions, XP, notes, confidence ratings and your achievement shelf will be cleared. Your settings and the generated plan design stay intact. This cannot be undone."
        confirmLabel="Reset progress"
        tone="warning"
        onConfirm={onResetProgress}
      />
      <ConfirmDialog
        open={confirm === 'all'}
        onClose={() => setConfirm(null)}
        title="Erase the entire planner?"
        copy="This wipes the local save and returns you to onboarding. There is no cloud backup. Export your planner first if this run matters."
        confirmLabel="Erase everything"
        tone="danger"
        onConfirm={onResetAll}
      />
      <ConfirmDialog
        open={confirm === 'import'}
        onClose={() => {
          setConfirm(null);
          setPendingImport(null);
        }}
        title="Import this planner?"
        copy={`${pendingImport?.label ?? 'This file'} will replace the current plan, tasks, XP and settings. The imported state is re-flowed to today. This cannot be undone.`}
        confirmLabel="Import & replace"
        tone="warning"
        onConfirm={applyImport}
      />
    </div>
  );
}
