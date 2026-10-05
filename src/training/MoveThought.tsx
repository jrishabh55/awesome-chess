import { Chess } from 'chess.js';
import { BookOpen, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { assetUrl } from '../app/asset-url';
import type { Square } from '../chess/types';
import { explainOpeningMove } from './explanations';
import type { TeachingLine } from './packs';
import { useOpeningPreferences } from './preferences';
import './move-thought.css';

export function MoveThought({
  courseName,
  line,
  ply,
}: {
  courseName: string;
  line: TeachingLine;
  ply: number;
}) {
  const preferences = useOpeningPreferences();
  const [dismissed, setDismissed] = useState<string>();
  const thoughtKey = `${line.rootFen}:${line.name}:${ply}`;
  useEffect(() => setDismissed(undefined), [thoughtKey]);
  const index = Math.max(0, ply - 1);
  const move = line.moves[index];
  if (!move || !preferences.showThoughts || dismissed === thoughtKey) return null;
  const from = move.uci.slice(0, 2),
    to = move.uci.slice(2, 4);
  const square = (ply ? to : from) as Square;
  const piece = new Chess(ply ? move.after : move.before).get(square);
  if (!piece) return null;
  const explanation = explainOpeningMove(courseName, line, index);
  const text = ply ? explanation.thought : explanation.thought.replace(/\bI /, 'I’ll ');
  return (
    <div
      role="status"
      aria-label="Move thought"
      data-square={square}
      className={`move-thought${preferences.glassEffect ? '' : ' plain'}`}
      style={{ '--thought-opacity': preferences.bubbleOpacity / 100 } as CSSProperties}
    >
      <span className="move-thought-piece">
        <img src={assetUrl(`assets/pieces/${piece.color}${piece.type.toUpperCase()}.svg`)} alt="" />
      </span>
      <strong
        className="move-thought-move"
        aria-label={`${from} ${move.san.includes('x') ? 'captures on' : 'to'} ${to}`}
      >
        {from}
        <span aria-hidden="true">{move.san.includes('x') ? '×' : '→'}</span>
        {to}
      </strong>
      <span className="move-thought-copy">{text}</span>
      <span className="move-thought-stage">
        <BookOpen size={15} />
        {ply ? 'Lesson move' : 'Up next'}
      </span>
      <button
        className="move-thought-close"
        aria-label="Close move thought"
        title="Close this thought"
        onClick={() => setDismissed(thoughtKey)}
      >
        <X size={16} />
      </button>
    </div>
  );
}
