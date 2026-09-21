import { useEffect, useRef, useState } from 'react';
import { DEFAULT_POSITION } from 'chess.js';
import { ArrowRight, BookOpen, Check, Layers3, Trophy, X } from 'lucide-react';
import { ModeBoard } from '../app/ModeBoard';
import { BoardTools, type DrawingMode } from '../board/BoardTools';
import type { Color, DrawingColor, Mark } from '../chess/types';
import { OpeningLibrary } from './OpeningLibrary';
import type { OpeningCourse } from './courses';
import type { OpeningPack } from './packs';
import './training.css';
import './course.css';

export function CourseWelcome({
  onChooseCourse,
  onChoosePack,
  error,
}: {
  onChooseCourse: (course: OpeningCourse) => void;
  onChoosePack: (pack: OpeningPack) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [orientation, setOrientation] = useState<Color>('w');
  const [mode, setMode] = useState<DrawingMode>('move');
  const [color, setColor] = useState<DrawingColor>('red');
  const [marks, setMarks] = useState<Mark[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const flip = () => setOrientation((value) => (value === 'w' ? 'b' : 'w'));
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        !open &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat &&
        event.key.toLowerCase() === 'x'
      ) {
        event.preventDefault();
        flip();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [open]);
  return (
    <section className="opening-teacher" aria-label="Opening Teacher">
      <header className="ot-header">
        <BookOpen size={21} className="ot-accent" />
        <div className="ot-heading">
          <h1>Opening Teacher</h1>
          <span>Learn the opening. Understand the plans.</span>
        </div>
      </header>
      <div className="ot-workspace">
        <ModeBoard
          board={{
            fen: DEFAULT_POSITION,
            orientation,
            marks,
            disabled: true,
            onMove: () => {},
            onToggleMark: (mark) =>
              setMarks((current) =>
                current.some((item) => JSON.stringify(item) === JSON.stringify(mark))
                  ? current.filter((item) => JSON.stringify(item) !== JSON.stringify(mark))
                  : [...current, mark],
              ),
            drawingMode: mode,
            drawingColor: color,
          }}
          tools={
            <BoardTools
              mode={mode}
              color={color}
              onMode={setMode}
              onColor={setColor}
              onClear={() => setMarks([])}
              onFlip={flip}
            />
          }
          caption="Choose a course to begin · X Flip"
        />
        <aside className="ot-panel ct-welcome" aria-label="Opening lesson">
          <div className="ot-panel-controls">
            <button className="ot-button" onClick={() => setOpen(true)}>
              Openings
            </button>
            <span className="ot-detail">Local courses</span>
          </div>
          <div className="ot-eyebrow">A complete learning path</div>
          <h2>Make the opening yours.</h2>
          <p className="ot-description">
            Choose London, Sicilian, or another opening. Learn its variations in sections that share
            the same starting moves.
          </p>
          <div className="ct-welcome-steps">
            <p>
              <BookOpen size={17} />
              <span>Understand every move and both sides’ ideas.</span>
            </p>
            <p>
              <Layers3 size={17} />
              <span>Learn one variation, then drill all you know.</span>
            </p>
            <p>
              <Trophy size={17} />
              <span>Earn 10 points clean, or retry to improve.</span>
            </p>
          </div>
          {error && (
            <p className="ot-feedback" role="alert">
              {error}
            </p>
          )}
          <div className="ot-actions">
            <button className="ot-primary" onClick={() => setOpen(true)}>
              Choose a course
              <ArrowRight size={16} />
            </button>
            <p className="ot-status">
              <Check size={12} />
              Progress and points stay on this device
            </p>
          </div>
        </aside>
      </div>
      <dialog
        ref={dialog}
        className="ot-dialog"
        onCancel={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className="ot-dialog-header">
          <h2>Choose your opening</h2>
          <button
            className="ot-icon"
            aria-label="Close opening dialog"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="ot-dialog-content ol-dialog-content">
          {open && <OpeningLibrary onChoose={onChoosePack} onChooseCourse={onChooseCourse} />}
        </div>
      </dialog>
    </section>
  );
}
