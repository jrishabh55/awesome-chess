import { useState } from 'react';
import type { MoveAssessment } from '../review/policy';
import { labelInfo } from '../review/policy';
import { MoveQualityIcon } from '../ui/MoveQualityIcon';
import type { ReviewInsight } from './review-insight';

export function MoveInsight({
  assessment,
  insight,
  san,
  onDetails,
  onBest,
  onWhy,
}: {
  assessment: MoveAssessment;
  insight: ReviewInsight;
  san: string;
  onDetails: () => void;
  onBest: () => void;
  onWhy: () => void;
}) {
  const [section, setSection] = useState<'Why' | 'Threats' | 'Plan' | 'Position'>('Why');
  const text =
    section === 'Why'
      ? insight.reason
      : section === 'Plan'
        ? insight.plan
        : section === 'Position'
          ? insight.position
          : insight.terminal
            ? insight.terminal
            : insight.threats.length
              ? insight.threats.map((t) => t.text).join(' ')
              : 'No specific tactical threat established by this analysis. This does not mean the position is threat-free.';
  return (
    <section className="move-insight" aria-label="Move explanation">
      <header>
        <strong style={{ color: labelInfo[assessment.primary].color }}>
          <MoveQualityIcon label={assessment.primary} size={17} /> {san} · {assessment.primary}
        </strong>
        <small>Depth {assessment.depth}</small>
      </header>
      <div className="insight-best">
        {insight.isBest ? `Best: ${insight.bestSan} · You found it` : `Best was ${insight.bestSan}`}
        <span title="Faded green: previous best move · Red: threats · Blue: next engine move">
          {' '}
          · Arrow key ⓘ
        </span>
      </div>
      <div role="tablist" aria-label="Move explanation topics" className="insight-tabs">
        {(['Why', 'Threats', 'Plan', 'Position'] as const).map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={section === name}
            id={`insight-${name}`}
            aria-controls="insight-content"
            onClick={() => setSection(name)}
          >
            {name}
            {name === 'Threats' && insight.threats.length ? ` (${insight.threats.length})` : ''}
          </button>
        ))}
      </div>
      <p id="insight-content" role="tabpanel" aria-labelledby={`insight-${section}`} title={text}>
        {text}
      </p>
      <div className="insight-actions">
        <button onClick={onWhy}>Show why</button>
        <button onClick={onBest}>Best line</button>
        <button onClick={onDetails}>Full explanation</button>
      </div>
    </section>
  );
}
