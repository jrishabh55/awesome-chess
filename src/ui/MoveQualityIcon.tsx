import {
  BookOpen,
  Star,
  Check,
  CheckCheck,
  Diamond,
  CornerUpRight,
  CircleHelp,
  TriangleAlert,
  CircleX,
  Sparkles,
} from 'lucide-react';
import type { Label } from '../review/policy';
const icons = {
  Book: BookOpen,
  Best: Star,
  Excellent: CheckCheck,
  Good: Check,
  Brilliant: Diamond,
  Great: Sparkles,
  Inaccuracy: CircleHelp,
  Mistake: TriangleAlert,
  Blunder: CircleX,
  Miss: CornerUpRight,
};
export function MoveQualityIcon({ label, size = 17 }: { label: Label; size?: number }) {
  const Icon = icons[label];
  return (
    <Icon
      size={size}
      strokeWidth={2.5}
      fill={label === 'Best' ? 'currentColor' : 'none'}
      aria-hidden="true"
    />
  );
}
