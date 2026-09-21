import {
  BookOpen,
  Star,
  Check,
  CheckCheck,
  Diamond,
  CornerUpRight,
  TriangleAlert,
  X,
  Sparkles,
  createLucideIcon,
} from 'lucide-react';
import type { Label } from '../review/policy';
const QuestionMark = createLucideIcon('QuestionMark', [
  ['path', { d: 'M8 8a4 4 0 0 1 8 0c0 3-4 3-4 6', key: 'hook' }],
  ['path', { d: 'M12 19h.01', key: 'dot' }],
]);
const icons = {
  Book: BookOpen,
  Best: Star,
  Excellent: CheckCheck,
  Good: Check,
  Brilliant: Diamond,
  Great: Sparkles,
  Inaccuracy: QuestionMark,
  Mistake: TriangleAlert,
  Blunder: X,
  Miss: CornerUpRight,
};
export function MoveQualityIcon({ label, size = 17 }: { label: Label; size?: number }) {
  const Icon = icons[label];
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
