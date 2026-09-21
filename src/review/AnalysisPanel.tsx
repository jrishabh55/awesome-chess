import { MoveQualityIcon } from '../ui/MoveQualityIcon';
import { ArrowUpRight, ChevronRight, Activity } from 'lucide-react';
import type { PositionInput, Study } from '../chess/types';
import type { AnalysisResult } from '../engine/types';
import { scoreText } from '../engine/uci';
import { sanLine } from './classify';
import { labelInfo, type MoveAssessment } from './policy';
export function AnalysisPanel({
  result,
  position,
  assessment,
  study,
  onInsert,
  hidden,
}: {
  result: AnalysisResult | null;
  position: PositionInput;
  assessment?: MoveAssessment;
  study: Study;
  onInsert: (line: string[]) => void;
  hidden: boolean;
}) {
  if (hidden)
    return (
      <div className="hint-hidden">
        <Activity size={24} />
        <p>Find the move on the board.</p>
        <span>Engine suggestions are hidden during your attempt.</span>
      </div>
    );
  return (
    <div className="analysis-content">
      <div className="section-heading">
        <span>ENGINE LINES</span>
        <span>{result?.lines[0] ? `Depth ${result.lines[0].depth}` : 'Waiting for engine'}</span>
      </div>
      <div className="engine-lines">
        {result?.lines.length ? (
          result.lines.slice(0, 3).map((line, i) => (
            <button
              className="engine-line"
              key={i}
              onClick={() => onInsert(line.pv)}
              title="Explore this continuation"
            >
              <span
                className={`line-score ${line.score.kind === 'cp' && line.score.value < 0 ? 'black-score' : ''}`}
              >
                {scoreText(line.score)}
              </span>
              <span className="line-moves">{sanLine(position, line.pv, 7) || 'Game over'}</span>
              <ArrowUpRight size={15} />
            </button>
          ))
        ) : (
          <div className="analysis-loading">
            <span className="pulse-dot" /> Finding the strongest continuations…
          </div>
        )}
      </div>
      {assessment && (
        <div className="move-feedback">
          <div className="feedback-title">
            <span
              className="classification-icon"
              style={{ color: labelInfo[assessment.primary].color }}
            >
              <MoveQualityIcon label={assessment.primary} size={22} />
            </span>
            <div>
              <strong>
                {study.nodes[assessment.nodeId]?.san} is{' '}
                {assessment.primary === 'Excellent'
                  ? 'an excellent'
                  : assessment.primary === 'Inaccuracy'
                    ? 'an inaccuracy'
                    : `a ${assessment.primary.toLowerCase()}`}{' '}
                move
              </strong>
              <small>Move feedback · depth {assessment.depth}</small>
            </div>
          </div>
          <p>
            {assessment.base === 'Best'
              ? 'You found the strongest continuation in this position.'
              : `Best continuation: ${sanLine({ rootFen: study.nodes[study.nodes[assessment.nodeId].parentId!].fen, moves: [] }, assessment.bestLine, 5)}`}
          </p>
        </div>
      )}
      <div className="analysis-tip">
        <ChevronRight size={15} />
        <span>Play any move to explore a sideline. Your original game stays saved.</span>
      </div>
    </div>
  );
}
