import { Chess } from 'chess.js';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { assetUrl } from '../app/asset-url';
import { squareToPoint } from '../board/coordinates';
import type { Color, Square } from '../chess/types';
import { explainOpeningMove } from './explanations';
import type { TeachingLine } from './packs';
import './move-thought.css';

export function MoveThought({
  courseName,
  line,
  ply,
  orientation,
}: {
  courseName: string;
  line: TeachingLine;
  ply: number;
  orientation: Color;
}) {
  const index = Math.max(0, ply - 1);
  const move = line.moves[index];
  if (!move) return null;
  const square = (ply ? move.uci.slice(2, 4) : move.uci.slice(0, 2)) as Square;
  const piece = new Chess(ply ? move.after : move.before).get(square);
  if (!piece) return null;
  const explanation = explainOpeningMove(courseName, line, index);
  return (
    <ThoughtBubble
      square={square}
      orientation={orientation}
      title={`${ply ? '' : 'Next · '}${explanation.title}`}
      text={ply ? explanation.thought : explanation.thought.replace(/\bI /, 'I’ll ')}
      icon={`${piece.color}${piece.type.toUpperCase()}`}
    />
  );
}

function ThoughtBubble({
  square,
  orientation,
  title,
  text,
  icon,
}: {
  square: Square;
  orientation: Color;
  title: string;
  text: string;
  icon: string;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number; tail: number }>();
  const point = squareToPoint(square, orientation);
  const above = point.y >= 4;
  useLayoutEffect(() => {
    const container = layer.current!,
      cloud = bubble.current!;
    const place = () => {
      const { width, height } = container.getBoundingClientRect();
      const box = cloud.getBoundingClientRect();
      const x = (point.x * width) / 8,
        y = (point.y * height) / 8;
      const clamp = (value: number, max: number) => Math.max(4, Math.min(value, max - 4));
      const left = clamp(x - box.width / 2, width - box.width);
      const gap = Math.min(35, height / 8);
      const top = clamp(above ? y - gap - box.height : y + gap, height - box.height);
      const tail = Math.max(12, Math.min(x - left, box.width - 18));
      setPlacement((current) =>
        current?.left === left && current.top === top && current.tail === tail
          ? current
          : { left, top, tail },
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(container);
    observer.observe(cloud);
    return () => observer.disconnect();
  }, [point.x, point.y, above, title, text]);
  return (
    <div className="move-thought-layer" ref={layer}>
      <span
        className="move-thought-anchor"
        aria-hidden="true"
        style={{ left: `${point.x * 12.5}%`, top: `${point.y * 12.5}%` }}
      />
      <div
        ref={bubble}
        role="status"
        aria-label="Move thought"
        data-square={square}
        className={`move-thought ${above ? 'above' : 'below'}`}
        style={
          {
            left: placement?.left ?? 0,
            top: placement?.top ?? 0,
            '--thought-tail': `${placement?.tail ?? 0}px`,
            visibility: placement ? 'visible' : 'hidden',
          } as CSSProperties
        }
      >
        <span className="move-thought-title">
          <img src={assetUrl(`assets/pieces/${icon}.svg`)} alt="" />
          {title}
        </span>
        <span>{text}</span>
      </div>
    </div>
  );
}
