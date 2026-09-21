import {
  GraduationCap,
  RotateCcw,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import type { MoveAssessment, Evidence } from '../review/policy';
import { isError, labelInfo } from '../review/policy';
import { explainMove } from './explain';
export function CoachCard({
  assessment,
  san,
  onRetry,
  onShow,
  onNext,
  onPrevious,
}: {
  assessment: MoveAssessment;
  san: string;
  onRetry: () => void;
  onShow: (e?: Evidence) => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const explanation = explainMove(assessment);
  return (
    <div className="coach-card">
      <div className="coach-top">
        <div className="coach-avatar">
          <GraduationCap size={23} />
        </div>
        <div>
          <strong>Your review companion</strong>
          <small>One move. A little more understanding.</small>
        </div>
        <div className="coach-navigation">
          <button aria-label="Previous key moment" onClick={onPrevious}>
            <ChevronLeft size={16} />
          </button>
          <button aria-label="Next key moment" onClick={onNext}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <h3>
        <span style={{ color: labelInfo[assessment.primary].color }}>
          {labelInfo[assessment.primary].symbol}
        </span>{' '}
        {san} · {assessment.primary}
      </h3>
      <p>{explanation.text}</p>
      <div className="coach-actions">
        {isError(assessment.primary) && (
          <button className="secondary" onClick={onRetry}>
            <RotateCcw size={15} />
            Retry move
          </button>
        )}
        <button className="text-button" onClick={() => onShow()}>
          <Eye size={15} />
          Show best line
        </button>
        {explanation.actions.map((a, i) => (
          <button className="text-button" key={i} onClick={() => onShow(a.evidence)}>
            {a.label}
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}
