import { MoveQualityIcon } from '../ui/MoveQualityIcon';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Study } from '../chess/types';
import { labelInfo, type MoveAssessment } from './policy';
import { moveRows } from './move-rows';
const figurines: Record<string, string[]> = {
  K: ['♚', '♔'],
  Q: ['♛', '♕'],
  R: ['♜', '♖'],
  B: ['♝', '♗'],
  N: ['♞', '♘'],
};
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
  const list = useRef<HTMLDivElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  const pagination = useRef<HTMLDivElement>(null);
  const [rowsPerPage, setRowsPerPage] = useState(1);
  const [page, setPage] = useState(0);
  const rows = useMemo(() => moveRows(study), [study.nodes, study.rootId]);
  const selectedRow = rows.findIndex(
    (row) => row.white === study.selectedId || row.black === study.selectedId,
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount - 1);
  useLayoutEffect(() => {
    const container = list.current;
    if (!container) return;
    const measure = () => {
      const style = getComputedStyle(container);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const gap = parseFloat(style.rowGap) || 0;
      const chrome =
        (start.current?.getBoundingClientRect().height || 28) +
        (pagination.current?.getBoundingClientRect().height || 32) +
        gap * 2;
      setRowsPerPage(Math.max(1, Math.floor((container.clientHeight - padding - chrome) / 32)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [hidden]);
  useLayoutEffect(() => {
    setPage(Math.floor(Math.max(0, selectedRow) / rowsPerPage));
  }, [study.id, study.selectedId, selectedRow, rowsPerPage, hidden]);
  if (hidden)
    return (
      <div className="move-list hidden-answer">Moves are hidden while you find a better move.</div>
    );
  const moveButton = (id: string) => {
    const n = study.nodes[id],
      a = assessments[id];
    return (
      <button
        key={id}
        className={`move-cell ${id === study.selectedId ? 'active' : ''}`}
        onClick={() => onSelect(id)}
        aria-label={n.san || undefined}
        title={a ? `${a.primary} · depth ${a.depth}` : 'Select position'}
      >
        <span className="move-notation">
          {n.san && /^[KQRBN]/.test(n.san) ? (
            <>
              <span className="move-piece" aria-hidden="true">
                {figurines[n.san[0]][study.nodes[n.parentId!].fen.split(' ')[1] === 'w' ? 0 : 1]}
              </span>
              {n.san.slice(1)}
            </>
          ) : (
            n.san
          )}
        </span>
        {a && (
          <span
            className="move-symbol"
            style={{ color: labelInfo[a.primary].color }}
            aria-label={a.primary}
          >
            <MoveQualityIcon label={a.primary} size={18} />
          </span>
        )}
      </button>
    );
  };
  return (
    <div className="move-list" ref={list}>
      <button
        ref={start}
        className={`starting-position ${study.selectedId === study.rootId ? 'active' : ''}`}
        onClick={() => onSelect(study.rootId)}
      >
        Starting position
      </button>
      <div className="move-page-rows">
        {rows.length ? (
          rows.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage).map((row) => (
            <div
              className={`move-row${row.depth ? ' variation-row' : ''}`}
              key={row.id}
              style={{ paddingLeft: Math.min(row.depth, 3) * 5 }}
              title={row.depth ? `Variation, level ${row.depth}` : undefined}
            >
              <span className="move-number">
                {row.depth > 0 && (
                  <span className="variation-label" aria-label="Variation">
                    ↳
                  </span>
                )}
                {row.number}
                {row.white ? '.' : '…'}
              </span>
              {row.white ? moveButton(row.white) : <span />}
              {row.black ? moveButton(row.black) : <span />}
            </div>
          ))
        ) : (
          <p className="muted padded">Play a move to start exploring.</p>
        )}
      </div>
      <div className="move-pagination" ref={pagination}>
        <button
          aria-label="Previous moves page"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          ‹
        </button>
        <span aria-live="polite">
          Page {currentPage + 1} of {pageCount}
        </span>
        <button
          aria-label="Next moves page"
          disabled={currentPage === pageCount - 1}
          onClick={() => setPage(currentPage + 1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}
