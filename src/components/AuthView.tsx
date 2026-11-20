import { useEffect, useRef, useState, type FormEvent, type PointerEvent, type WheelEvent } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  AtSign,
  Check,
  Database,
  Eye,
  EyeOff,
  Fingerprint,
  LineChart,
  Loader2,
  Lock,
  Mail,
  Radar,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { cx } from '../lib/utils';

type Mode = 'login' | 'register';

const SIGNALS = [
  {
    tag: 'PLAN',
    icon: Radar,
    title: 'Every day, mapped.',
    copy: 'Any target, any horizon. Build a curriculum, map every session to the hour, and let the board re-flow around your life.',
    stat: '∞',
    statLabel: 'targets at once',
  },
  {
    tag: 'SYNC',
    icon: Database,
    title: 'One operator. One plan.',
    copy: 'Your account keeps your board, XP and mock history private. Sign in anywhere and pick up exactly where you left off.',
    stat: 'AES',
    statLabel: 'httpOnly sessions',
  },
  {
    tag: 'COMPOUND',
    icon: LineChart,
    title: 'Small loops. Violent compounding.',
    copy: 'Deep work, recall and validation tests turn every study day into evidence. The dashboard remembers what you earned.',
    stat: '45m',
    statLabel: 'session units',
  },
];

const PROOF = [
  'Private planner state',
  'Server-backed stats',
  'Secure password hashing',
];

function strengthOf(password: string) {
  const checks = [
    password.length >= 8,
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ];
  return checks.filter(Boolean).length;
}

export function AuthView({
  onLogin,
  onRegister,
  initialError,
}: {
  onLogin: (input: { email: string; password: string }) => Promise<unknown>;
  onRegister: (input: { name: string; email: string; password: string }) => Promise<unknown>;
  initialError?: string | null;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [errorField, setErrorField] = useState<'name' | 'email' | 'password' | 'confirm' | null>(null);
  const [shake, setShake] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [activeSignal, setActiveSignal] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const wheelAccum = useRef(0);
  const lastSignalSwitch = useRef(0);
  const strength = strengthOf(password);
  const strengthLabel = ['Empty', 'Fragile', 'Getting there', 'Strong', 'Elite'][strength];
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordValid = password.length >= 8;
  const nameValid = name.trim().length >= 2;
  const confirmValid = confirm === password && confirm.length > 0;
  const ready = mode === 'login'
    ? emailValid && password.length > 0
    : nameValid && emailValid && passwordValid && confirmValid;
  const signal = SIGNALS[activeSignal];
  const SignalIcon = signal.icon;

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSignal((current) => (current + 1) % SIGNALS.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, []);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const node = shellRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    node.style.setProperty('--px', `${x * 100}%`);
    node.style.setProperty('--py', `${y * 100}%`);
    node.style.setProperty('--tilt-x', `${(0.5 - y) * 6}deg`);
    node.style.setProperty('--tilt-y', `${(x - 0.5) * 8}deg`);
    node.style.setProperty('--parallax-x', `${(x - 0.5) * 22}px`);
    node.style.setProperty('--parallax-y', `${(y - 0.5) * 18}px`);
  };

  const resetPointer = () => {
    const node = shellRef.current;
    if (!node) return;
    node.style.setProperty('--px', '50%');
    node.style.setProperty('--py', '40%');
    node.style.setProperty('--tilt-x', '0deg');
    node.style.setProperty('--tilt-y', '0deg');
    node.style.setProperty('--parallax-x', '0px');
    node.style.setProperty('--parallax-y', '0px');
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < 6) return;
    wheelAccum.current += event.deltaY;
    shellRef.current?.style.setProperty('--wheel-spin', `${Math.max(-18, Math.min(18, wheelAccum.current / 24))}deg`);
    const now = Date.now();
    if (Math.abs(wheelAccum.current) > 130 && now - lastSignalSwitch.current > 700) {
      setActiveSignal((current) => (current + (event.deltaY > 0 ? 1 : SIGNALS.length - 1)) % SIGNALS.length);
      wheelAccum.current = 0;
      lastSignalSwitch.current = now;
    }
  };

  const fail = (message: string, field: typeof errorField = null) => {
    setError(message);
    setErrorField(field);
    setShake(true);
    window.setTimeout(() => setShake(false), 500);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setErrorField(null);
    setPassword('');
    setConfirm('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (mode === 'register') {
      if (!nameValid) return fail('Give the command center a name to call you.', 'name');
      if (!emailValid) return fail('Enter a valid email address.', 'email');
      if (!passwordValid) return fail('Use at least 8 characters for your password.', 'password');
      if (!confirmValid) return fail('The two passwords do not match.', 'confirm');
    } else {
      if (!emailValid) return fail('Enter the email linked to your account.', 'email');
      if (!password) return fail('Enter your password.', 'password');
    }

    setBusy(true);
    setError(null);
    setErrorField(null);
    try {
      if (mode === 'login') {
        await onLogin({ email: email.trim().toLowerCase(), password });
      } else {
        await onRegister({ name: name.trim(), email: email.trim().toLowerCase(), password });
      }
    } catch (caught) {
      if (caught instanceof ApiError) {
        const field = caught.field === 'email' ? 'email' : null;
        fail(caught.message, field);
      } else {
        fail(caught instanceof Error ? caught.message : 'Could not complete that request.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-ambient" aria-hidden>
        <span className="auth-aurora aurora-a" />
        <span className="auth-aurora aurora-b" />
        <span className="auth-aurora aurora-c" />
        <span className="auth-grain" />
        <span className="auth-gridlines" />
      </div>

      <div
        className={cx('auth-shell', shake && 'is-shaking')}
        ref={shellRef}
        onPointerMove={onPointerMove}
        onPointerLeave={resetPointer}
      >
        <section className="auth-story" onWheel={onWheel}>
          <div className="auth-brand-row">
            <span className="brand-mark large" aria-hidden><i /><i /><i /><b /></span>
            <span className="auth-brand-copy">
              <strong>ASCENT</strong>
              <small>STUDY COMMAND CENTER</small>
            </span>
            <span className="auth-access-pill"><span className="live-dot" /> PRIVATE ACCESS</span>
          </div>

          <div className="auth-headline">
            <div className="eyebrow"><Sparkles size={13} /> YOUR ASCENT STARTS WITH A KEY</div>
            <h1>
              Build the version<br />
              of you that <em>walks out</em><br />
              of that hall.
            </h1>
            <p>
              The universal study operating system — a living plan for every day, a board that
              re-flows around your life, and a record of every session you earn.
            </p>
          </div>

          <div className="auth-stage" aria-hidden>
            <div className="auth-orbit-glow" />
            <div className="auth-orbit-ring ring-a" />
            <div className="auth-orbit-ring ring-b" />
            <div className="auth-orbit-ring ring-c" />
            <div className="auth-orbit-core">
              <span className="auth-core-label">HORIZON</span>
              <strong>ANY</strong>
              <small>every day mapped</small>
              <span className="auth-core-pulse" />
            </div>
            <span className="auth-node node-a"><Database size={13} /> EXAM</span>
            <span className="auth-node node-b"><Activity size={13} /> COURSE</span>
            <span className="auth-node node-c"><LineChart size={13} /> SKILL</span>
            <span className="auth-node node-d"><ShieldCheck size={13} /> HABIT</span>
            <span className="auth-stage-ring" />
            <span className="auth-stage-tick tick-a" />
            <span className="auth-stage-tick tick-b" />
            <span className="auth-stage-tick tick-c" />
          </div>

          <div className="auth-signal" key={signal.tag}>
            <div className="auth-signal-top">
              <span className="auth-signal-tag"><SignalIcon size={12} /> {signal.tag}</span>
              <div className="auth-signal-dots">
                {SIGNALS.map((entry, index) => (
                  <button
                    key={entry.tag}
                    className={cx('auth-signal-dot', index === activeSignal && 'is-active')}
                    onClick={() => setActiveSignal(index)}
                    aria-label={`Show ${entry.tag} signal`}
                  />
                ))}
              </div>
            </div>
            <h3>{signal.title}</h3>
            <p>{signal.copy}</p>
            <div className="auth-signal-foot">
              <strong>{signal.stat}</strong>
              <span>{signal.statLabel}</span>
              <span className="auth-scroll-hint">SCROLL TO CYCLE</span>
            </div>
          </div>

          <div className="auth-proof-row">
            {PROOF.map((item) => (
              <span key={item}><Check size={11} /> {item}</span>
            ))}
          </div>

          <div className="auth-story-foot">
            <span>UNIVERSAL STUDY PLANNER · ANY TARGET, ANY HORIZON</span>
            <span>DESIGNED FOR THE LONG GAME</span>
          </div>

          <div className="auth-story-scan" aria-hidden />
        </section>

        <section className="auth-panel-wrap">
          <div className="auth-panel">
            <div className="auth-panel-top">
              <div>
                <span className="eyebrow">{mode === 'login' ? 'OPERATOR SIGN IN' : 'INITIALIZE OPERATOR'}</span>
                <h2>{mode === 'login' ? 'Welcome back, pilot.' : 'Claim your command center.'}</h2>
                <p>
                  {mode === 'login'
                    ? 'Your board, stats and streak are exactly where you left them.'
                    : 'One account. Your own exam horizon, plan and progress.'}
                </p>
              </div>
              <span className="auth-panel-mark"><Fingerprint size={20} /></span>
            </div>

            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <span className={cx('auth-tab-indicator', mode === 'register' && 'is-right')} aria-hidden />
              <button
                role="tab"
                aria-selected={mode === 'login'}
                className={cx('auth-tab', mode === 'login' && 'is-active')}
                onClick={() => switchMode('login')}
              >
                Sign in
              </button>
              <button
                role="tab"
                aria-selected={mode === 'register'}
                className={cx('auth-tab', mode === 'register' && 'is-active')}
                onClick={() => switchMode('register')}
              >
                Create account
              </button>
            </div>

            <form className="auth-form" onSubmit={submit} noValidate>
              {mode === 'register' && (
                <label className={cx('auth-field', errorField === 'name' && 'has-error')}>
                  <span><UserRound size={13} /> Name</span>
                  <div className="auth-input-shell">
                    <UserRound size={16} />
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="What should the board call you?"
                      autoComplete="name"
                      maxLength={48}
                      autoFocus
                    />
                  </div>
                </label>
              )}

              <label className={cx('auth-field', errorField === 'email' && 'has-error')}>
                <span><AtSign size={13} /> Email</span>
                <div className="auth-input-shell">
                  <Mail size={16} />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@domain.com"
                    autoComplete="email"
                    inputMode="email"
                    maxLength={160}
                    autoFocus={mode === 'login'}
                  />
                  {email.length > 0 && emailValid && <span className="auth-input-check"><Check size={12} /></span>}
                </div>
              </label>

              <label className={cx('auth-field', errorField === 'password' && 'has-error')}>
                <span>
                  <Lock size={13} /> Password
                  {mode === 'register' && <em>8+ characters</em>}
                </span>
                <div className="auth-input-shell">
                  <Lock size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyUp={(event) => setCapsLock(event.getModifierState?.('CapsLock') ?? false)}
                    placeholder={mode === 'login' ? 'Your password' : 'Build something you can remember'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    maxLength={200}
                  />
                  <button
                    type="button"
                    className="auth-eye"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {capsLock && <span className="auth-caps">Caps Lock is on</span>}
              </label>

              {mode === 'register' && (
                <>
                  <div className={cx('auth-strength', `strength-${strength}`)}>
                    <div className="auth-strength-bars" aria-hidden>
                      {[1, 2, 3, 4].map((step) => (
                        <span key={step} className={step <= strength ? 'is-on' : ''} />
                      ))}
                    </div>
                    <span>Password signal · <b>{strengthLabel}</b></span>
                  </div>

                  <label className={cx('auth-field', errorField === 'confirm' && 'has-error')}>
                    <span><ShieldCheck size={13} /> Confirm password</span>
                    <div className="auth-input-shell">
                      <Lock size={16} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirm}
                        onChange={(event) => setConfirm(event.target.value)}
                        placeholder="Type it again"
                        autoComplete="new-password"
                        maxLength={200}
                      />
                      {confirm.length > 0 && confirmValid && <span className="auth-input-check"><Check size={12} /></span>}
                    </div>
                  </label>
                </>
              )}

              {error && (
                <div className="auth-error" role="alert">
                  <AlertCircle size={15} />
                  <span>{error}</span>
                </div>
              )}

              <button className={cx('auth-submit', busy && 'is-busy')} type="submit" disabled={busy || !ready}>
                <span className="auth-submit-shine" aria-hidden />
                {busy ? (
                  <>
                    <Loader2 size={17} className="spin" />
                    {mode === 'login' ? 'Verifying operator…' : 'Building your account…'}
                  </>
                ) : (
                  <>
                    {mode === 'login' ? 'Enter the command center' : 'Create my account'}
                    <ArrowRight size={17} />
                  </>
                )}
              </button>

              <div className="auth-switch">
                {mode === 'login' ? (
                  <>
                    <span>New to ASCENT?</span>
                    <button type="button" onClick={() => switchMode('register')}>
                      Create your account <ArrowUpRight size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <span>Already have a command center?</span>
                    <button type="button" onClick={() => switchMode('login')}>
                      Sign in instead <ArrowUpRight size={13} />
                    </button>
                  </>
                )}
              </div>
            </form>

            <div className="auth-trust">
              <span><ShieldCheck size={13} /> scrypt-hashed passwords</span>
              <span><Lock size={13} /> httpOnly session cookie</span>
              <span><Database size={13} /> private planner data</span>
            </div>

            <div className="auth-panel-foot">
              <span>ASCENT v1.0</span>
              <span><span className="live-dot" /> SERVER ONLINE</span>
            </div>
          </div>

          <div className="auth-panel-caption">
            <span className="auth-panel-caption-line" />
            <span>Your data is isolated to your account. Every user gets their own plan, stats and streak.</span>
          </div>
        </section>
      </div>
    </div>
  );
}
