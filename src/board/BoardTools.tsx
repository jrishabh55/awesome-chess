import { ArrowDownUp, ArrowUpRight, Eraser, MousePointer2, Settings2, Square } from 'lucide-react';
import type { DrawingColor } from '../chess/types';
export type DrawingMode = 'move' | 'arrow' | 'square';
export function BoardTools({
  mode,
  color,
  onMode,
  onColor,
  onClear,
  onFlip,
  onSettings,
}: {
  mode: DrawingMode;
  color: DrawingColor;
  onMode: (mode: DrawingMode) => void;
  onColor: (color: DrawingColor) => void;
  onClear: () => void;
  onFlip: () => void;
  onSettings?: () => void;
}) {
  return (
    <div className="board-controls">
      <div className="annotation-tools">
        <button
          title="Move pieces"
          aria-label="Move pieces"
          className={mode === 'move' ? 'active' : ''}
          onClick={() => onMode('move')}
        >
          <MousePointer2 size={18} />
        </button>
        <button
          title="Draw arrows"
          aria-label="Draw arrows"
          className={mode === 'arrow' ? 'active' : ''}
          onClick={() => onMode('arrow')}
        >
          <ArrowUpRight size={21} />
        </button>
        <button
          title="Highlight squares"
          aria-label="Highlight squares"
          className={mode === 'square' ? 'active' : ''}
          onClick={() => onMode('square')}
        >
          <Square size={17} />
        </button>
        <div className="tool-divider" />
        {(['red', 'orange', 'green', 'blue'] as DrawingColor[]).map((c) => (
          <button
            key={c}
            className={`color-dot ${c} ${color === c ? 'chosen' : ''}`}
            aria-label={`${c} annotations`}
            onClick={() => onColor(c)}
          />
        ))}
        <button title="Clear annotations" aria-label="Clear annotations" onClick={onClear}>
          <Eraser size={18} />
        </button>
      </div>
      <div className="board-utility">
        <button
          title="Flip board (X)"
          aria-label="Flip board"
          aria-keyshortcuts="X"
          onClick={onFlip}
        >
          <ArrowDownUp size={18} />
        </button>
        {onSettings && (
          <button title="Board settings" aria-label="Board settings" onClick={onSettings}>
            <Settings2 size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
