import { assetUrl } from '../app/asset-url';
import type { Label } from '../review/policy';

const icons: Record<Label, string> = {
  Book: 'book',
  Best: 'best',
  Excellent: 'excellent',
  Good: 'good',
  Brilliant: 'brilliant',
  Great: 'great_find',
  Inaccuracy: 'inaccuracy',
  Mistake: 'mistake',
  Blunder: 'blunder',
  Miss: 'missed_win',
};

export function MoveQualityIcon({ label, size = 20 }: { label: Label; size?: number }) {
  return (
    <img
      className="move-quality-icon"
      src={assetUrl(`assets/quality/${icons[label]}.svg`)}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
