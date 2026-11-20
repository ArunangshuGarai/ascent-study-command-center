import { useEffect, useState } from 'react';
import { Save, Sparkles, Target, Trophy } from 'lucide-react';
import type { Task } from '../types';
import { formatDate } from '../lib/utils';
import { Modal } from './ui';

function feedback(score: number) {
  if (score >= 85) return { label: 'Elite range', copy: 'Protect the process. Do not change what is already working.' };
  if (score >= 70) return { label: 'Strong range', copy: 'Convert the remaining misses. One autopsy can move this fast.' };
  if (score >= 55) return { label: 'Within reach', copy: 'Identify the highest-weight gap and repair it before the next mock.' };
  if (score >= 40) return { label: 'Repair zone', copy: 'The foundations are visible but not yet automatic. Slow down and rebuild.' };
  return { label: 'Rebuild zone', copy: 'This is diagnostic data, not a verdict. Go back to the highest-yield concepts.' };
}

export function ScoreDialog({
  task,
  onClose,
  onSave,
}: {
  task?: Task;
  onClose: () => void;
  onSave: (taskId: string, score: number) => void;
}) {
  const [score, setScore] = useState(task?.score ?? 55);

  useEffect(() => {
    setScore(task?.score ?? 55);
  }, [task?.id, task?.score]);

  if (!task) return null;
  const note = feedback(score);

  return (
    <Modal open onClose={onClose} className="score-modal" labelledBy="score-title">
      <div className="modal-heading">
        <div className="modal-heading-icon amber"><Trophy size={20} /></div>
        <div>
          <div className="eyebrow">MOCK LAB · SCORE ENTRY</div>
          <h2 id="score-title">{task.title}</h2>
          <p>{formatDate(task.date, 'long')} · enter the honest number.</p>
        </div>
      </div>

      <div className="score-hero">
        <div className="score-number">
          <input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(event) => setScore(Math.max(0, Math.min(100, Number(event.target.value))))}
            aria-label="Mock score out of 100"
          />
          <span>/ 100</span>
        </div>
        <div className="score-band">
          <span><Target size={12} /> {note.label}</span>
          <p>{note.copy}</p>
        </div>
      </div>

      <input
        className="score-range"
        type="range"
        min={0}
        max={100}
        value={score}
        onChange={(event) => setScore(Number(event.target.value))}
        aria-label="Adjust mock score"
      />
      <div className="score-scale"><span>0</span><span>40</span><span>55</span><span>70</span><span>85</span><span>100</span></div>

      <div className="score-note">
        <Sparkles size={13} /> A logged score changes the trajectory chart, not the plan. The autopsy is
        where the real adaptation happens.
      </div>

      <div className="modal-actions">
        <button className="ghost-button" onClick={onClose}>Cancel</button>
        <button
          className="primary-button"
          onClick={() => {
            onSave(task.id, score);
            onClose();
          }}
        >
          <Save size={14} /> Log score
        </button>
      </div>
    </Modal>
  );
}
