import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
export function BoardNavigation({
  onStart,
  onPrevious,
  onNext,
  onEnd,
  canPrevious = true,
  canNext = true,
  children,
}: {
  onStart: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onEnd: () => void;
  canPrevious?: boolean;
  canNext?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="transport" aria-label="Board navigation">
      <button aria-label="Go to start" onClick={onStart} disabled={!canPrevious}>
        <ChevronsLeft size={23} />
      </button>
      <button aria-label="Previous move" onClick={onPrevious} disabled={!canPrevious}>
        <ChevronLeft size={25} />
      </button>
      {children}
      <button aria-label="Next move" onClick={onNext} disabled={!canNext}>
        <ChevronRight size={25} />
      </button>
      <button aria-label="Go to end" onClick={onEnd} disabled={!canNext}>
        <ChevronsRight size={23} />
      </button>
    </div>
  );
}
