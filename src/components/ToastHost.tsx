import {
  AlertTriangle,
  ArrowRight,
  Check,
  Info,
  Sparkles,
  Trophy,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import type { ToastMessage } from '../types';
import { cx } from '../lib/utils';

const KIND_ICONS = {
  ripple: Waves,
  xp: Zap,
  info: Info,
  achievement: Trophy,
  error: AlertTriangle,
};

export function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-host" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = KIND_ICONS[toast.kind];
        return (
          <div key={toast.id} className={cx('toast', `toast-${toast.kind}`)} role="status">
            <span className="toast-icon">
              <Icon size={16} />
              <span className="toast-spark"><Sparkles size={9} /></span>
            </span>
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.message && <p>{toast.message}</p>}
              {toast.actionLabel && toast.onAction && (
                <button
                  className="toast-action"
                  onClick={() => {
                    toast.onAction?.();
                    onDismiss(toast.id);
                  }}
                >
                  {toast.actionLabel} <ArrowRight size={11} />
                </button>
              )}
            </div>
            <button className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
              <X size={13} />
            </button>
            <span className="toast-progress" aria-hidden><i /></span>
            {toast.kind === 'achievement' && <span className="toast-confetti" aria-hidden><Check size={10} /></span>}
          </div>
        );
      })}
    </div>
  );
}
