import type { Study } from '../chess/types';
import type { MoveAssessment } from './policy';
export function EvaluationGraph({
  study,
  assessments,
  onSelect,
}: {
  study: Study;
  assessments: Record<string, MoveAssessment>;
  onSelect: (id: string) => void;
}) {
  const count = study.mainline.length;
  const points = study.mainline.map((id, i) => {
    const a = assessments[id];
    if (!a) return null;
    const score = a.after;
    const value = score.kind === 'mate' ? (score.winner === 'w' ? 1000 : -1000) : score.value;
    return {
      id,
      x: count <= 1 ? 50 : (i / (count - 1)) * 100,
      y: 50 - 45 * Math.tanh(value / 400),
    };
  });
  const segments: string[] = [];
  let current: string[] = [];
  for (const p of points) {
    if (p) current.push(`${p.x},${p.y}`);
    else if (current.length) {
      segments.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) segments.push(current.join(' '));
  return (
    <div className="eval-chart">
      <svg
        viewBox="-2 -5 104 110"
        preserveAspectRatio="none"
        aria-label="Game evaluation timeline"
        role="img"
      >
        <line
          x1="0"
          y1="50"
          x2="100"
          y2="50"
          stroke="#6a6f62"
          strokeDasharray="1 2"
          strokeWidth=".4"
        />
        {segments.map((s, i) => (
          <polyline
            key={i}
            points={s}
            fill="none"
            stroke="#b5d888"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {points
          .filter((p) => p !== null)
          .map((p) => (
            <circle
              key={p.id}
              cx={p.x}
              cy={p.y}
              r={study.selectedId === p.id ? 2 : 1.2}
              fill={study.selectedId === p.id ? '#fff' : '#b5d888'}
              role="button"
              tabIndex={0}
              aria-label={`Review ${study.nodes[p.id].san}`}
              onClick={() => onSelect(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelect(p.id);
              }}
            />
          ))}
      </svg>
      {!points.some(Boolean) && <div className="chart-empty">Your game’s story, move by move</div>}
      <div className="chart-labels">
        <span>Move 1</span>
        <span>Move {Math.max(1, Math.ceil(count / 4))}</span>
        <span>Move {Math.max(1, Math.ceil(count / 2))}</span>
      </div>
    </div>
  );
}
