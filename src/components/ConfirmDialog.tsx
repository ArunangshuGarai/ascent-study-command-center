import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { Modal } from './ui';
import { cx } from '../lib/utils';

export function ConfirmDialog({
  open,
  title,
  copy,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  copy: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger' | 'warning';
  onConfirm: () => void;
  onClose: () => void;
}) {
  const Icon = tone === 'danger' ? ShieldAlert : tone === 'warning' ? AlertTriangle : Info;
  return (
    <Modal open={open} onClose={onClose} className={cx('confirm-modal', `confirm-${tone}`)}>
      <div className="confirm-icon">
        <Icon size={22} />
      </div>
      <div className="confirm-copy">
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
      <div className="confirm-actions">
        <button className="ghost-button" onClick={onClose}>{cancelLabel}</button>
        <button
          className={cx('small-button', tone === 'danger' && 'danger-button', tone === 'warning' && 'warning-button')}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
