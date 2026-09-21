import { useRef, useState } from 'react';
import { BookOpen, Bot, ChartNoAxesCombined } from 'lucide-react';
import ReviewWorkspace from './App';
import { OpeningTeacher } from '../training/OpeningTeacher';
import { PlayStockfish } from '../play/PlayStockfish';
import type { Study } from '../chess/types';
import { assetUrl } from './asset-url';
import './workspace.css';
export type WorkspaceMode = 'review' | 'teacher' | 'play';
export default function WorkspaceApp() {
  const [mode, setMode] = useState<WorkspaceMode>('review');
  const [incomingStudy, setIncomingStudy] = useState<Study>();
  const reviewNavigation = useRef<((next: WorkspaceMode) => Promise<void>) | null>(null);
  const change = (next: WorkspaceMode) => {
    if (next === mode) return;
    if (mode === 'review') void reviewNavigation.current?.(next);
    else setMode(next);
  };
  return (
    <div className="workspace-app" data-workspace={mode}>
      <aside className="mode-sidebar">
        <a
          className="mode-brand"
          href="#"
          aria-label="Chess Room home"
          onClick={(event) => {
            event.preventDefault();
            change('review');
          }}
        >
          <img src={assetUrl('assets/icon.svg')} alt="" />
        </a>
        <nav aria-label="Workspace">
          {(
            [
              { id: 'review', label: 'Review', name: 'Game review', icon: ChartNoAxesCombined },
              { id: 'teacher', label: 'Openings', name: 'Opening teacher', icon: BookOpen },
              { id: 'play', label: 'Play', name: 'Play Stockfish', icon: Bot },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={mode === item.id ? 'selected' : ''}
              aria-label={item.name}
              aria-current={mode === item.id ? 'page' : undefined}
              title={item.name}
              onClick={() => change(item.id)}
            >
              <item.icon size={23} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <span className="mode-local">LOCAL</span>
      </aside>
      <div className="workspace-content compact-review">
        {mode === 'teacher' ? (
          <OpeningTeacher onBack={() => setMode('review')} />
        ) : mode === 'play' ? (
          <PlayStockfish
            onBack={() => setMode('review')}
            onReview={(study) => {
              setIncomingStudy(study);
              setMode('review');
            }}
          />
        ) : (
          <ReviewWorkspace
            initialStudy={incomingStudy}
            navigationRef={reviewNavigation}
            onWorkspaceChange={(next) => {
              setIncomingStudy(undefined);
              setMode(next);
            }}
          />
        )}
      </div>
    </div>
  );
}
