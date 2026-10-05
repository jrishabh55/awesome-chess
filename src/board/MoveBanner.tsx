import { BookOpen, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { assetUrl } from '../app/asset-url';
import type { Color, Square } from '../chess/types';
import { useOpeningPreferences } from '../training/preferences';
import '../training/move-thought.css';

export function MoveBanner({
  positionKey,
  square,
  piece,
  from,
  to,
  capture,
  text,
  label,
  labelIcon,
  labelColor,
  action,
}: {
  positionKey: string;
  square: Square;
  piece: { color: Color; type: string };
  from: string;
  to: string;
  capture: boolean;
  text: string;
  label: string;
  labelIcon?: ReactNode;
  labelColor?: string;
  action?: { label: string; onClick: () => void };
}) {
  const preferences = useOpeningPreferences();
  const [dismissed, setDismissed] = useState<string>();
  useEffect(() => setDismissed(undefined), [positionKey]);
  if (!preferences.showThoughts || dismissed === positionKey) return null;
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
        aria-label={`${from} ${capture ? 'captures on' : 'to'} ${to}`}
      >
        {from}
        <span aria-hidden="true">{capture ? '×' : '→'}</span>
        {to}
      </strong>
      <span className="move-thought-copy">
        {text}
        {action && (
          <button className="move-banner-action" onClick={action.onClick}>
            {action.label}
            <span aria-hidden="true"> →</span>
          </button>
        )}
      </span>
      <span
        className="move-thought-stage"
        style={labelColor ? { background: labelColor } : undefined}
      >
        <span className="move-thought-stage-icon" aria-hidden="true">
          {labelIcon ?? <BookOpen size={15} />}
        </span>
        {label}
      </span>
      <button
        className="move-thought-close"
        aria-label="Close move thought"
        title="Close this thought"
        onClick={() => setDismissed(positionKey)}
      >
        <X size={16} />
      </button>
    </div>
  );
}
