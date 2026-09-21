import { useState } from 'react';
import ReviewWorkspace from './App';
import { OpeningTeacher } from '../training/OpeningTeacher';
import { PlayStockfish } from '../play/PlayStockfish';
import type { Study } from '../chess/types';

export default function WorkspaceApp() {
  const [mode, setMode] = useState<'review' | 'teacher' | 'play'>('review');
  const [incomingStudy, setIncomingStudy] = useState<Study>();
  if (mode === 'teacher')
    return (
      <div className="mode-workspace">
        <OpeningTeacher onBack={() => setMode('review')} />
      </div>
    );
  if (mode === 'play')
    return (
      <div className="mode-workspace">
        <PlayStockfish
          onBack={() => setMode('review')}
          onReview={(study) => {
            setIncomingStudy(study);
            setMode('review');
          }}
        />
      </div>
    );
  return (
    <ReviewWorkspace
      initialStudy={incomingStudy}
      onWorkspaceChange={(next) => {
        setIncomingStudy(undefined);
        setMode(next);
      }}
    />
  );
}
