import { Sparkles, Play, Square, ChevronRight, ShieldCheck } from 'lucide-react';
import type { Study, Color } from '../chess/types';
import type { MoveAssessment, Label } from './policy';
import { labels, labelInfo } from './policy';
import { buildReport, type Phase } from './report';
import { MoveQualityIcon } from '../ui/MoveQualityIcon';
export function ReviewPanel({
  study,
  assessments,
  reviewing,
  completed,
  onReview,
  onStop,
  onSelect,
  onGuide,
  speed,
  onSpeed,
}: {
  study: Study;
  assessments: Record<string, MoveAssessment>;
  reviewing: boolean;
  completed: number;
  onReview: () => void;
  onStop: () => void;
  onSelect: (id: string) => void;
  onGuide: () => void;
  speed: 'quick' | 'deep';
  onSpeed: (speed: 'quick' | 'deep') => void;
}) {
  const r = buildReport(study, assessments),
    done = r.w.analyzed + r.b.analyzed,
    total = study.mainline.length;
  return (
    <div className="review-content">
      <div className="review-intro">
        <span className="eyebrow">EVERY MOVE HAS A LESSON</span>
        <h2>Understand your game.</h2>
        <p>Find your best moments. Learn from the rest.</p>
      </div>
      <div className="accuracy-cards">
        {(['w', 'b'] as Color[]).map((c) => (
          <div className="accuracy-card" key={c}>
            <div className="accuracy-player">
              <span className={`side-dot ${c === 'w' ? 'white' : 'black'}`} />
              {c === 'w' ? 'White' : 'Black'}
              <span className="muted">accuracy</span>
            </div>
            <strong>
              {r[c].accuracy === null ? '—' : r[c].accuracy!.toFixed(1)}
              <small>{r[c].accuracy !== null ? '%' : ''}</small>
            </strong>
            <span className="accuracy-name">
              {study.headers[c === 'w' ? 'White' : 'Black'] || 'Unknown player'}
            </span>
          </div>
        ))}
      </div>
      <label className="review-speed">
        <span>Review speed</span>
        <select
          aria-label="Review speed"
          value={speed}
          disabled={reviewing}
          onChange={(e) => onSpeed(e.target.value as 'quick' | 'deep')}
        >
          <option value="quick">Quick · time-limited</option>
          <option value="deep">Deep · selected depth</option>
        </select>
      </label>
      <p className="review-speed-note">
        {speed === 'quick'
          ? 'Fast feedback first. Special labels appear only when deeper checks confirm them.'
          : 'More calculation per move. Complex positions can take longer.'}
      </p>
      <div className="review-action">
        {reviewing ? (
          <>
            <div className="progress-track">
              <div style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
            </div>
            <button className="primary" onClick={onStop}>
              <Square size={15} /> Stop review{' '}
              <span>
                {completed}/{total}
              </span>
            </button>
          </>
        ) : (
          <button className="primary" onClick={onReview} disabled={!total}>
            <Sparkles size={18} />
            {done === total && total ? 'Review again' : 'Review game'}
            <ChevronRight size={18} />
          </button>
        )}
        <span className="local-note">
          <ShieldCheck size={13} />
          {reviewing
            ? `Reviewing ${completed} of ${total} moves`
            : done < total && done > 0
              ? `Provisional · ${done} of ${total} moves analyzed`
              : 'On your device. Always unlimited.'}
        </span>
      </div>
      {done > 0 && (
        <>
          <div className="classification-table">
            <div className="table-head">
              <span>White</span>
              <span>MOVE QUALITY</span>
              <span>Black</span>
            </div>
            {labels.map((l) => (
              <div className="quality-row" key={l}>
                <button
                  onClick={() => {
                    const id = study.mainline.find(
                      (id) => assessments[id]?.mover === 'w' && assessments[id]?.primary === l,
                    );
                    if (id) onSelect(id);
                  }}
                >
                  {r.w.counts[l]}
                </button>
                <span>
                  <b style={{ color: labelInfo[l].color }}>
                    <MoveQualityIcon label={l} />
                  </b>
                  {l}
                </span>
                <button
                  onClick={() => {
                    const id = study.mainline.find(
                      (id) => assessments[id]?.mover === 'b' && assessments[id]?.primary === l,
                    );
                    if (id) onSelect(id);
                  }}
                >
                  {r.b.counts[l]}
                </button>
              </div>
            ))}
          </div>
          <button className="secondary wide" onClick={onGuide}>
            <Play size={16} /> Start guided review
          </button>
          <div className="report-card">
            <div className="section-heading">
              <span>GAME REPORT</span>
              <span>White / Black</span>
            </div>
            {(['opening', 'middlegame', 'endgame'] as Phase[]).map((phase) => (
              <div className="phase-row" key={phase}>
                <span>{phase[0].toUpperCase() + phase.slice(1)}</span>
                {(['w', 'b'] as Color[]).map((c) => (
                  <span
                    key={c}
                    title={`${r[c].phases[phase].analyzed}/${r[c].phases[phase].total} analyzed · ${r[c].phases[phase].errors} errors`}
                  >
                    {!r[c].phases[phase].reached
                      ? 'Not reached'
                      : r[c].phases[phase].accuracy === null
                        ? 'Pending'
                        : r[c].phases[phase].accuracy!.toFixed(0) + '%'}
                  </span>
                ))}
              </div>
            ))}
            <div className="phase-row rating">
              <span>Game rating</span>
              {(['w', 'b'] as Color[]).map((c) => (
                <strong key={c}>{r[c].performance === null ? '—' : `≈${r[c].performance}`}</strong>
              ))}
            </div>
            <p className="fine-print">
              Uncalibrated performance estimate, not your player rating. At least 6 meaningful
              decisions are needed.
              {(r.w.decisions < 12 || r.b.decisions < 12) &&
                ' Limited sample: use this as feedback, not a strength measurement.'}
            </p>
            <details className="phase-details">
              <summary>Phase insights</summary>
              {(['opening', 'middlegame', 'endgame'] as Phase[]).map((phase) => (
                <div key={phase}>
                  <strong>{phase[0].toUpperCase() + phase.slice(1)}</strong>
                  {(['w', 'b'] as Color[]).map((c) => {
                    const p = r[c].phases[phase];
                    return (
                      <div key={c}>
                        <span>
                          {c === 'w' ? 'White' : 'Black'} ·{' '}
                          {p.reached
                            ? `${p.analyzed}/${p.total} moves analyzed · ${p.errors} errors`
                            : 'Not reached'}
                        </span>
                        {p.highlight && (
                          <button onClick={() => onSelect(p.highlight!)}>
                            Strongest analyzed move: {study.nodes[p.highlight].san} →
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </details>
          </div>
        </>
      )}
    </div>
  );
}
