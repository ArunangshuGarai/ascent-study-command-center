import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Crosshair,
  Layers,
  Sparkles,
  Target,
  TrendingUp,
  Waves,
  Zap,
} from 'lucide-react';
import type { RippleReport, View } from '../types';
import {
  cx,
  formatDate,
  todayISO,
} from '../lib/utils';
import { Badge, Drawer, ProgressRing } from './ui';

export function RippleDrawer({
  open,
  report,
  onClose,
  onNavigate,
}: {
  open: boolean;
  report?: RippleReport;
  onClose: () => void;
  onNavigate: (view: View, date?: string) => void;
}) {
  const coverageDelta = report ? report.coverageAfter - report.coverageBefore : 0;
  const at = report ? new Date(report.at) : null;
  const timeLabel = at && !Number.isNaN(at.getTime())
    ? at.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <Drawer open={open} onClose={onClose} className="ripple-drawer" labelledBy="ripple-title">
      <div className="ripple-shell">
        <header className="ripple-head">
          <div className="ripple-head-icon"><Waves size={20} /></div>
          <div>
            <span className="eyebrow">RIPPLE REPORT</span>
            <h2 id="ripple-title">{report ? 'One change. A different future.' : 'The engine is armed.'}</h2>
            <p>{report ? report.reason : 'Any change to the plan re-packs every unresolved session into the remaining calendar.'}</p>
          </div>
          <Badge tone={report ? 'lime' : 'neutral'}>{report ? 'Applied' : 'Standby'}</Badge>
        </header>

        {report ? (
          <>
            <div className="ripple-hero">
              <div className="ripple-hero-main">
                <span className="ripple-hero-number">{report.sessionsMoved}</span>
                <span className="ripple-hero-label">study sessions re-flowed</span>
                <span className="ripple-hero-time"><Clock3 size={11} /> {timeLabel}</span>
              </div>
              <ProgressRing value={report.coverageAfter} size={126} stroke={9}>
                <span className="ripple-ring-value">{report.coverageAfter}<small>%</small></span>
                <span className="ripple-ring-label">coverage</span>
              </ProgressRing>
            </div>

            <div className="ripple-stat-grid">
              <div><span><Layers size={13} /> TOPICS MOVED</span><strong>{report.topicsMoved}</strong></div>
              <div><span><CalendarClock size={13} /> DAYS TOUCHED</span><strong>{report.daysAffected}</strong></div>
              <div><span><TrendingUp size={13} /> MAX SHIFT</span><strong>{report.daysShifted}d</strong></div>
              <div><span><Target size={13} /> STILL DEFERRED</span><strong>{report.deferredTopics}</strong></div>
            </div>

            <div className="ripple-coverage">
              <div className="ripple-coverage-head">
                <span>SYLLABUS COVERAGE</span>
                <span className={cx('coverage-delta', coverageDelta >= 0 ? 'is-up' : 'is-down')}>
                  {coverageDelta >= 0 ? '+' : ''}{coverageDelta} pts
                </span>
              </div>
              <div className="ripple-coverage-bars">
                <div>
                  <span>Before</span>
                  <div className="coverage-track"><span style={{ width: `${report.coverageBefore}%` }} /></div>
                  <b>{report.coverageBefore}%</b>
                </div>
                <div>
                  <span>After</span>
                  <div className="coverage-track after"><span style={{ width: `${report.coverageAfter}%` }} /></div>
                  <b>{report.coverageAfter}%</b>
                </div>
              </div>
              <p>
                {report.deferredTopics > 0
                  ? `${report.deferredTopics} topics no longer fit into the remaining deep-work slots. Add capacity or boost priority to bring them back.`
                  : 'Every syllabus unit still has a seat in the remaining calendar.'}
              </p>
            </div>

            <div className="ripple-timeline">
              <span className="eyebrow">WHAT THE ENGINE DID</span>
              {[
                ['Preserved the record', 'Completed, early-banked and missed sessions stayed exactly where they happened.'],
                ['Pinned manual intent', 'Any block you authored or moved kept its place in the plan.'],
                ['Re-packed the queue', 'Unresolved plan rows were pulled forward into the next open core slots; completed topics were skipped.'],
                ['Scheduled spaced recall', 'Cleared topics return at 1, 3, 7 and 14 days until each recall pass is banked.'],
              ].map(([title, copy], index) => (
                <div key={title} className="ripple-step">
                  <span className="ripple-step-index">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{title}</strong>
                    <small>{copy}</small>
                  </div>
                  <CheckCircle2 size={14} />
                </div>
              ))}
            </div>

            <div className="ripple-note">
              <Sparkles size={14} />
              <p>
                Coverage can drop temporarily when the horizon shrinks or a recovery day is added.
                That is not failure — it is the truth surfacing early enough to act on.
              </p>
            </div>

            <div className="ripple-recovery">
              <span className="eyebrow">IF YOU FALL BEHIND</span>
              <div className="ripple-recovery-grid">
                <div>
                  <b>01</b>
                  <span><strong>Don’t stack two days.</strong> Today’s core slot takes the oldest unresolved topic; everything else slides one step.</span>
                </div>
                <div>
                  <b>02</b>
                  <span><strong>Recall stays due.</strong> A missed revision pass remains in the pool until you clear it — it does not silently disappear.</span>
                </div>
                <div>
                  <b>03</b>
                  <span><strong>Protect coverage.</strong> If deferred topics climb, boost a subject or add a block. The ripple report shows the cost.</span>
                </div>
              </div>
            </div>

            <div className="ripple-actions">
              <button
                className="primary-button"
                onClick={() => {
                  onNavigate('board', todayISO());
                  onClose();
                }}
              >
                Inspect today’s board <ArrowRight size={14} />
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  onNavigate('journey');
                  onClose();
                }}
              >
                See the new future <ArrowUpRight size={14} />
              </button>
            </div>
          </>
        ) : (
          <div className="ripple-empty">
            <div className="ripple-empty-orbit" aria-hidden>
              <span /><span /><span />
              <Waves size={30} />
            </div>
            <h3>Change anything. Watch the whole plan move.</h3>
            <p>
              Skip a session, drag a block to another day, take a recovery day, boost a subject or
              move the exam date. Completed work stays fixed. Manual blocks stay pinned. The rest of
              the future re-packs around it.
            </p>
            <div className="ripple-empty-rules">
              <span><Check size={12} /> Completed stays fixed</span>
              <span><Crosshair size={12} /> Manual stays pinned</span>
              <span><Zap size={12} /> Unresolved adapts</span>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                onNavigate('board', todayISO());
                onClose();
              }}
            >
              Try it on the board <ArrowRight size={14} />
            </button>
          </div>
        )}

        <footer className="ripple-foot">
          <span><Waves size={12} /> If it changed the plan, it belongs here.</span>
          <span>{formatDate(todayISO(), 'medium')}</span>
        </footer>
      </div>
    </Drawer>
  );
}
