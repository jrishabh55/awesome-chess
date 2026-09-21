import { MoveQualityIcon } from '../ui/MoveQualityIcon';
import { useEffect, useRef } from 'react';
import type { Study, GameNode } from '../chess/types';
import { labelInfo, type MoveAssessment } from './policy';
export function MoveList({
  study,
  assessments,
  onSelect,
  hidden = false,
}: {
  study: Study;
  assessments: Record<string, MoveAssessment>;
  onSelect: (id: string) => void;
  hidden?: boolean;
}) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [study.selectedId]);
  if (hidden)
    return (
      <div className="move-list hidden-answer">Moves are hidden while you find a better move.</div>
    );
  const moveButton = (id: string) => {
    const n = study.nodes[id],
      a = assessments[id];
    return (
      <button
        ref={id === study.selectedId ? active : undefined}
        key={id}
        className={`move-cell ${id === study.selectedId ? 'active' : ''}`}
        onClick={() => onSelect(id)}
        title={a ? `${a.primary} · depth ${a.depth}` : 'Select position'}
      >
        <span>{n.san}</span>
        {a && (
          <span
            className="move-symbol"
            style={{ color: labelInfo[a.primary].color }}
            aria-label={a.primary}
          >
            <MoveQualityIcon label={a.primary} size={16} />
          </span>
        )}
      </button>
    );
  };
  const renderLine = (first: string, level = 0): React.ReactNode => {
    const rows: React.ReactNode[] = [];
    let id: string | undefined = first;
    while (id) {
      const n: GameNode = study.nodes[id],
        parent: GameNode = study.nodes[n.parentId!],
        f = parent.fen.split(' ');
      const next: string | undefined = n.children[0];
      const white = f[1] === 'w';
      if (white && next && study.nodes[next].parentId === id) {
        rows.push(
          <div className="move-row" key={id}>
            <span className="move-number">{f[5]}.</span>
            {moveButton(id)}
            {moveButton(next)}
          </div>,
        );
        for (const alt of n.children.slice(1))
          rows.push(
            <div className="variation" key={alt}>
              <span className="variation-label">Variation</span>
              {renderLine(alt, level + 1)}
            </div>,
          );
        if (parent.children[0] === id)
          for (const alt of parent.children.slice(1))
            rows.push(
              <div className="variation" key={alt}>
                <span className="variation-label">Variation</span>
                {renderLine(alt, level + 1)}
              </div>,
            );
        id = study.nodes[next].children[0];
      } else {
        rows.push(
          <div className="move-row" key={id}>
            <span className="move-number">
              {f[5]}
              {white ? '.' : '…'}
            </span>
            {!white && <span />}
            {moveButton(id)}
          </div>,
        );
        if (parent.children[0] === id)
          for (const alt of parent.children.slice(1))
            rows.push(
              <div className="variation" key={alt}>
                <span className="variation-label">Variation</span>
                {renderLine(alt, level + 1)}
              </div>,
            );
        id = next;
      }
    }
    return rows;
  };
  return (
    <div className="move-list">
      <button
        className={`starting-position ${study.selectedId === study.rootId ? 'active' : ''}`}
        onClick={() => onSelect(study.rootId)}
      >
        Starting position
      </button>
      {study.nodes[study.rootId].children[0] ? (
        renderLine(study.nodes[study.rootId].children[0])
      ) : (
        <p className="muted padded">Play a move to start exploring.</p>
      )}
    </div>
  );
}
