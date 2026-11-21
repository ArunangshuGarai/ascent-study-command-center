import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cx } from '../lib/utils';

export function Reveal({
  children,
  className,
  delay = 0,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.06, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const Tag = as;
  return (
    <Tag
      ref={ref as never}
      className={cx('reveal', visible && 'is-visible', className)}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

export function AnimatedNumber({
  value,
  duration = 900,
  format,
}: {
  value: number;
  duration?: number;
  format?: (value: number) => string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{format ? format(display) : display.toLocaleString()}</>;
}

export function ProgressRing({
  value,
  size = 88,
  stroke = 7,
  color = 'var(--lime)',
  track = 'rgba(255,255,255,0.08)',
  children,
  className,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const id = useId();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <div
      className={cx('progress-ring', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(clamped)} percent`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)' }}
        />
        <defs>
          <linearGradient id={`ring-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor="var(--lime)" stopOpacity=".7" />
          </linearGradient>
        </defs>
      </svg>
      <div className="progress-ring-content">{children}</div>
    </div>
  );
}

export function ScrollRail({
  children,
  className,
  scrollerClassName,
  hint,
  label = 'panel',
  scrollAmount = 360,
}: {
  children: ReactNode;
  className?: string;
  scrollerClassName?: string;
  hint?: string;
  label?: string;
  scrollAmount?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth;
    const next = {
      left: node.scrollLeft > 4,
      right: max > 4 && node.scrollLeft < max - 4,
    };
    setEdges((previous) =>
      previous.left === next.left && previous.right === next.right ? previous : next,
    );
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    node.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener('scroll', update);
    };
  }, [update]);

  useEffect(() => {
    update();
  }, [children, update]);

  const scroll = (direction: number) => {
    ref.current?.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
  };

  return (
    <div className={cx('scroll-rail', className)}>
      <div className="scroll-rail-bar">
        <span className="scroll-rail-hint">{hint ?? 'Scroll horizontally'}</span>
        <div className="scroll-rail-actions">
          <button
            type="button"
            className="icon-button small scroll-rail-arrow"
            onClick={() => scroll(-1)}
            disabled={!edges.left}
            aria-label={`Scroll ${label} left`}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            className="icon-button small scroll-rail-arrow"
            onClick={() => scroll(1)}
            disabled={!edges.right}
            aria-label={`Scroll ${label} right`}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className={cx('scroll-rail-viewport', scrollerClassName)} ref={ref}>
        {children}
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
  className,
  labelledBy,
  closable = true,
  wide,
  instant,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  closable?: boolean;
  wide?: boolean;
  /** Skip the entrance animation for keyboard-launched, high-frequency surfaces. */
  instant?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closable) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, closable]);
  if (!open) return null;
  return createPortal(
    <div className={cx('modal-layer', wide && 'modal-wide', instant && 'modal-instant')} role="presentation">
      <button className="modal-backdrop" aria-label="Close dialog" onClick={onClose} tabIndex={-1} />
      <div
        className={cx('modal-panel', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {closable && (
          <button className="icon-button modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  children,
  className,
  labelledBy,
  side = 'right',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  side?: 'right' | 'left';
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="drawer-layer" role="presentation">
      <button className="drawer-backdrop" aria-label="Close panel" onClick={onClose} tabIndex={-1} />
      <aside
        className={cx('drawer-panel', side === 'left' && 'drawer-left', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <button className="icon-button drawer-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        {children}
      </aside>
    </div>,
    document.body,
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="toggle-row">
      <span className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-description">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={cx('toggle', checked && 'is-on')}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" />
      </button>
    </label>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'lime' | 'violet' | 'rose' | 'amber' | 'sky' | 'green';
  className?: string;
}) {
  return <span className={cx('badge', `badge-${tone}`, className)}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function SectionHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2 className="section-title">{title}</h2>
        {description && <p className="section-copy">{description}</p>}
      </div>
      {actions && <div className="section-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  copy,
  action,
}: {
  icon?: ReactNode;
  title: string;
  copy?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {copy && <p>{copy}</p>}
      {action}
    </div>
  );
}
