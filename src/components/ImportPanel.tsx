import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  ChevronDown,
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import type { AppState } from '../types';
import type { ImportApplyOptions, ImportApplyResult } from '../hooks/usePlanner';
import {
  CURRICULUM_TEMPLATE,
  TIMETABLE_TEMPLATE,
  parseImportText,
  type ImportApplyMode,
  type ImportPlan,
} from '../lib/bulkImport';
import { activeTargets } from '../lib/targets';
import { cx, downloadFile, formatDuration } from '../lib/utils';
import { Badge } from './ui';

const MODES: { id: ImportApplyMode; label: string; hint: string }[] = [
  {
    id: 'append',
    label: 'Append',
    hint: 'Keep every future block and add the file on top. Duplicates are skipped.',
  },
  {
    id: 'replace-future',
    label: 'Replace future imports',
    hint: 'Remove future blocks that came from an earlier import for this target. Completed, past and hand-made blocks stay.',
  },
  {
    id: 'replace-all',
    label: 'Replace all future',
    hint: 'Clear pending generated and imported blocks for this target from today onward. Completed, past and manual blocks stay.',
  },
];

const FORMAT_LABEL = {
  timetable: 'Timetable CSV',
  curriculum: 'Curriculum CSV',
  combined: 'Combined plan',
} as const;

export function ImportPanel({
  state,
  onApply,
}: {
  state: AppState;
  onApply: (plan: ImportPlan, options: ImportApplyOptions) => ImportApplyResult | null;
}) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [targetId, setTargetId] = useState(state.settings.primaryTargetId ?? '');
  const [mode, setMode] = useState<ImportApplyMode>('append');
  const [applied, setApplied] = useState<string | null>(null);
  const [showTables, setShowTables] = useState(true);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const targets = activeTargets(state);
  const selectedTarget = targets.find((target) => target.id === targetId);

  useEffect(() => {
    if (!targetId) return;
    const stillActive = state.targets.some((target) => target.id === targetId && !target.archivedAt);
    if (stillActive) return;
    const fallback = state.targets.find(
      (target) => target.id === state.settings.primaryTargetId && !target.archivedAt,
    );
    setTargetId(fallback?.id ?? '');
  }, [state.targets, state.settings.primaryTargetId, targetId]);
  const plan = useMemo(
    () => parseImportText(text, {
      existingTasks: state.tasks,
      existingSubjects: state.subjects,
      existingTopics: state.topics,
    }),
    [text, state.tasks, state.subjects, state.topics],
  );

  const errors = plan.issues.filter((issue) => issue.severity === 'error');
  const warnings = plan.issues.filter((issue) => issue.severity === 'warning');
  const canApply = Boolean(text.trim()) && plan.canApply && Boolean(targetId || plan.target);
  const planTargetDate = selectedTarget?.date ?? plan.target?.date;
  const lateBlocks = planTargetDate
    ? plan.timetable.filter((row) => row.date > planTargetDate).length
    : 0;

  const readFile = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    try {
      const content = await file.text();
      setText(content);
      setFileName(file.name);
      setApplied(null);
    } finally {
      setLoading(false);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const copyTemplate = (value: string) => {
    void navigator.clipboard?.writeText(value);
  };

  const apply = () => {
    if (!canApply) return;
    const result = onApply(plan, {
      mode,
      targetId: targetId || undefined,
    });
    setApplied(result
      ? [
        `${result.added} ${result.added === 1 ? 'block' : 'blocks'} added`,
        `${result.curriculum} curriculum ${result.curriculum === 1 ? 'row' : 'rows'}`,
        result.skipped ? `${result.skipped} skipped` : '',
        `target: ${result.targetTitle}`,
      ].filter(Boolean).join(' · ')
      : 'No new rows were added — check the validation report above.');
  };

  const targetNote = selectedTarget?.preset === 'gate-cse' && plan.curriculum.length > 0
    ? 'GATE keeps its specialised planner. This curriculum will be imported into a new custom target so the preset never collides.'
    : null;

  return (
    <section className="settings-card import-panel">
      <div className="settings-card-head">
        <span className="settings-card-icon sky"><Upload size={17} /></span>
        <div>
          <span className="eyebrow">BULK UPLOAD</span>
          <h3>Drop in a timetable or a whole curriculum.</h3>
        </div>
        <Badge tone={text.trim() ? (plan.canApply ? (errors.length ? 'amber' : 'green') : 'amber') : 'neutral'}>
          {text.trim() ? (plan.canApply ? (errors.length ? 'Partial' : 'Ready') : 'Needs fixes') : 'CSV or JSON'}
        </Badge>
      </div>
      <p className="settings-data-copy">
        Timetable rows are scheduled exactly where you put them. Curriculum rows become 45-minute
        sessions that the scheduler distributes across free core slots, respecting every target.
      </p>

      <div className="import-grid">
        <div className="import-input">
          <div className="import-input-head">
            <span className="field-label">File or paste</span>
            <div className="import-file-actions">
              <button className="small-button ghost" onClick={() => fileRef.current?.click()}>
                {loading ? <Loader2 size={13} className="spin" /> : <FileSpreadsheet size={13} />} Choose file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.json,text/csv,application/json,text/plain"
                className="visually-hidden"
                onChange={(event) => void readFile(event.target.files?.[0])}
              />
              {text && (
                <button
                  className="text-button"
                  onClick={() => {
                    setText('');
                    setFileName('');
                    setApplied(null);
                  }}
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>
          </div>
          <textarea
            className="text-area import-textarea"
            rows={10}
            value={text}
            spellCheck={false}
            onChange={(event) => {
              setText(event.target.value);
              setFileName('');
              setApplied(null);
            }}
            placeholder={`date,start,duration,title,kind,subject,topic,notes
2026-11-18,09:30,90,Linear Algebra — Matrices,study,Mathematics,Matrices,"Lecture + 20 sums"`}
          />
          <div className="import-input-foot">
            <span>{fileName || (text.trim() ? 'Pasted content' : 'No file selected')}</span>
            {text.trim() && <span>{plan.format === 'combined' ? 'Mixed format detected' : FORMAT_LABEL[plan.format]}</span>}
          </div>
        </div>

        <aside className="import-options">
          <label className="field">
            <span className="field-label">Apply to target</span>
            <select
              className="text-input"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="">Create a new target from the file</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.title}{target.date ? ` · ${target.date}` : ' · rolling'}
                </option>
              ))}
            </select>
            <span className="field-hint">
              Leave on “new target” when the file includes a combined JSON target block.
            </span>
          </label>

          <div className="field">
            <span className="field-label">Apply mode</span>
            <div className="import-mode-list">
              {MODES.map((entry) => (
                <button
                  key={entry.id}
                  className={cx('import-mode', mode === entry.id && 'is-active')}
                  onClick={() => setMode(entry.id)}
                >
                  <span className="import-mode-mark">{mode === entry.id ? <Check size={11} /> : <ChevronDown size={11} />}</span>
                  <span>
                    <strong>{entry.label}</strong>
                    <small>{entry.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {targetNote && (
            <div className="import-note">
              <AlertTriangle size={13} />
              <span>{targetNote}</span>
            </div>
          )}

          {applied && (
            <div className="import-note success">
              <Check size={13} />
              <span>Imported: {applied}</span>
            </div>
          )}

          {plan.canApply && errors.length > 0 && (
            <div className="import-note">
              <AlertTriangle size={13} />
              <span>
                {errors.length} invalid {errors.length === 1 ? 'row' : 'rows'} will be skipped.
                Every valid row still imports.
              </span>
            </div>
          )}

          {lateBlocks > 0 && (
            <div className="import-note">
              <AlertTriangle size={13} />
              <span>
                {lateBlocks} {lateBlocks === 1 ? 'block falls' : 'blocks fall'} after the target
                date and will be skipped.
              </span>
            </div>
          )}

          <button className="primary-button full" onClick={apply} disabled={!canApply}>
            <CalendarPlus size={14} /> Import & re-flow
          </button>
          <span className="field-hint">
            Progress, XP and completed history always survive every import mode.
          </span>
        </aside>
      </div>

      <div className="import-summary-row">
        <div><span>Schedule rows</span><strong>{plan.timetable.length}</strong></div>
        <div><span>Curriculum rows</span><strong>{plan.curriculum.length}</strong></div>
        <div><span>Duplicates flagged</span><strong>{[...plan.timetable, ...plan.curriculum].filter((row) => row.duplicate).length}</strong></div>
        <div><span>Validation errors</span><strong className={errors.length ? 'is-risk' : 'is-good'}>{errors.length}</strong></div>
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="import-issues">
          <div className="import-issues-head">
            <AlertTriangle size={13} /> Validation report
          </div>
          {errors.map((issue, index) => (
            <div key={`error-${index}`} className="import-issue is-error">
              <span>Row {issue.row || '—'}</span>
              {issue.field && <b>{issue.field}</b>}
              <span>{issue.message}</span>
            </div>
          ))}
          {warnings.map((issue, index) => (
            <div key={`warning-${index}`} className="import-issue is-warning">
              <span>Row {issue.row || '—'}</span>
              {issue.field && <b>{issue.field}</b>}
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {(plan.timetable.length > 0 || plan.curriculum.length > 0) && (
        <div className="import-preview-block">
          <button className="import-preview-toggle" onClick={() => setShowTables((value) => !value)}>
            <span><ClipboardCopy size={13} /> Import preview</span>
            <ChevronDown size={14} className={cx('mini-chevron', showTables && 'is-open')} />
          </button>
          {showTables && (
            <div className="import-tables">
              {plan.timetable.length > 0 && (
                <div className="import-table-wrap">
                  <div className="import-table-title">Timetable blocks</div>
                  <table className="import-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Start</th>
                        <th>Length</th>
                        <th>Title</th>
                        <th>Kind</th>
                        <th>Subject / topic</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.timetable.slice(0, 40).map((row) => (
                        <tr key={`${row.row}-${row.title}`} className={cx(row.duplicate && 'is-duplicate')}>
                          <td>{row.date}</td>
                          <td>{row.start ?? 'auto'}</td>
                          <td>{formatDuration(row.duration)}</td>
                          <td>
                            {row.title}
                            {row.duplicate && <small className="import-dupe-tag">duplicate</small>}
                          </td>
                          <td>{row.kind}</td>
                          <td>{[row.subject, row.topic].filter(Boolean).join(' · ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.timetable.length > 40 && (
                    <span className="field-hint">Showing 40 of {plan.timetable.length} rows.</span>
                  )}
                </div>
              )}

              {plan.curriculum.length > 0 && (
                <div className="import-table-wrap">
                  <div className="import-table-title">Curriculum topics</div>
                  <table className="import-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Topic</th>
                        <th>Units</th>
                        <th>Priority</th>
                        <th>Key points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.curriculum.slice(0, 40).map((row) => (
                        <tr key={`${row.row}-${row.topic}`} className={cx(row.duplicate && 'is-duplicate')}>
                          <td>{row.subject}</td>
                          <td>
                            {row.topic}
                            {row.duplicate && <small className="import-dupe-tag">updates</small>}
                          </td>
                          <td>{row.units}</td>
                          <td>{row.priority}</td>
                          <td>{row.keyPoints.join(' · ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="import-templates">
        <div>
          <strong>Templates</strong>
          <span>Start from a known-good header. ISO dates, 24-hour times, durations in minutes.</span>
        </div>
        <div className="import-template-actions">
          <button className="small-button ghost" onClick={() => setText(TIMETABLE_TEMPLATE)}>
            <Download size={13} /> Timetable CSV
          </button>
          <button className="small-button ghost" onClick={() => setText(CURRICULUM_TEMPLATE)}>
            <Download size={13} /> Curriculum CSV
          </button>
          <button
            className="small-button ghost"
            onClick={() => downloadFile('ascent-timetable-template.csv', TIMETABLE_TEMPLATE, 'text/csv')}
          >
            <Download size={13} /> Download timetable
          </button>
          <button
            className="small-button ghost"
            onClick={() => downloadFile('ascent-curriculum-template.csv', CURRICULUM_TEMPLATE, 'text/csv')}
          >
            <Download size={13} /> Download curriculum
          </button>
          <button className="text-button" onClick={() => copyTemplate(TIMETABLE_TEMPLATE)}>
            <ClipboardCopy size={12} /> Copy timetable
          </button>
        </div>
      </div>
    </section>
  );
}
