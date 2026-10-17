import { MoveQualityIcon } from '../ui/MoveQualityIcon';
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
import type { Study } from '../chess/types';
import { positionAt } from '../chess/tree';
import { sanLine } from '../review/classify';
export function CoachCard({
  assessment,
  study,
  san,
  onRetry,
  onShow,
  onPlayed,
  onNext,
  onPrevious,
}: {
  assessment: MoveAssessment;
  study: Study;
  san: string;
  onRetry: () => void;
  onShow: (e?: Evidence) => void;
  onPlayed: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const explanation = explainMove(assessment, study);
  const insight = explanation.review;
  const root = positionAt(study, study.nodes[assessment.nodeId].parentId!);
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
          <MoveQualityIcon label={assessment.primary} />
        </span>{' '}
        {san} · {assessment.primary}
      </h3>
      <p>{insight?.reason || explanation.text}</p>
      {insight && (
        <div className="coach-evidence">
          <h4>
            Best move · {insight.bestSan}
            {insight.isBest ? ' · You found it' : ''}
          </h4>
          <p>{insight.comparison}</p>
          <small>
            Completed depth {assessment.depth}. Deeper analysis may change the assessment.
          </small>
          <h4>Threats on this board</h4>
          {insight.terminal ? (
            <p>{insight.terminal}</p>
          ) : insight.threats.length ? (
            insight.threats.map((threat, i) => <p key={i}>{threat.text}</p>)
          ) : (
            <p>No specific tactical threat established. This does not rule out other threats.</p>
          )}
          <h4>Position</h4>
          <p>{insight.position}</p>
          <h4>Plan from the best move</h4>
          <p>{insight.plan}</p>
          <h4>Compare continuations</h4>
          <p>Best: {sanLine(root, insight.bestLine, 16)}</p>
          <p>Played: {sanLine(root, insight.playedLine, 16)}</p>
          <p className="fine-print">
            Faded green: best move from the preceding position. Red: threats on this board. Blue:
            next engine move. Future tactics appear only when their position is shown.
          </p>
        </div>
      )}
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
        {insight && (
          <button className="text-button" onClick={onPlayed}>
            Show played line
          </button>
        )}
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
