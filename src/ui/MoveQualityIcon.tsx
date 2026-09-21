import {
  Star,
  Check,
  CheckCheck,
  Diamond,
  CornerUpRight,
  X,
  Sparkles,
  createLucideIcon,
} from 'lucide-react';
import type { Label } from '../review/policy';
const FilledBook = createLucideIcon('FilledBook', [
  [
    'path',
    {
      d: 'M3 3h4c2 0 3 1 4 2v16c-1-1-2-2-4-2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm10 2c1-1 2-2 4-2h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4c-2 0-3 1-4 2Z',
      fill: 'currentColor',
      stroke: 'none',
      key: 'pages',
    },
  ],
]);
const FilledAlert = createLucideIcon('FilledAlert', [
  [
    'path',
    {
      d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z M11 9h2v5h-2Z M11 16h2v2h-2Z',
      fill: 'currentColor',
      fillRule: 'evenodd',
      stroke: 'none',
      key: 'warning',
    },
  ],
]);
const QuestionMark = createLucideIcon('QuestionMark', [
  ['path', { d: 'M8 8a4 4 0 0 1 8 0c0 3-4 3-4 6', key: 'hook' }],
  ['path', { d: 'M12 19h.01', key: 'dot' }],
]);
const icons = {
  Book: FilledBook,
  Best: Star,
  Excellent: CheckCheck,
  Good: Check,
  Brilliant: Diamond,
  Great: Sparkles,
  Inaccuracy: QuestionMark,
  Mistake: FilledAlert,
  Blunder: X,
  Miss: CornerUpRight,
};
export function MoveQualityIcon({ label, size = 17 }: { label: Label; size?: number }) {
  const Icon = icons[label];
  const filled = ['Book', 'Best', 'Brilliant', 'Great', 'Mistake'].includes(label);
  return (
    <Icon
      size={size}
      strokeWidth={filled ? 1.5 : 2.75}
      fill={filled ? 'currentColor' : 'none'}
      aria-hidden="true"
    />
  );
}
