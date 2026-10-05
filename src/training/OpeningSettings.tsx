import { useState } from 'react';
import {
  updateOpeningPreferences,
  useOpeningPreferences,
  type OpeningPreferences,
} from './preferences';
import './opening-settings.css';

export function OpeningSettings() {
  const preferences = useOpeningPreferences();
  const [error, setError] = useState('');
  const change = (patch: Partial<OpeningPreferences>) => {
    try {
      updateOpeningPreferences(patch);
      setError('');
    } catch {
      setError(
        'These settings could not be saved on this device. Your previous settings are unchanged.',
      );
    }
  };
  return (
    <section className="opening-settings" aria-label="Opening lesson preferences">
      <h3>Opening lessons</h3>
      <p>Saved on this device for every opening course and short lesson.</p>
      {(
        [
          [
            'autoLessonReplies',
            'Automatic opponent replies in lessons',
            'Turn off to play both colors at your own pace.',
          ],
          [
            'autoDrillReplies',
            'Automatic opponent replies in drills',
            'Turn off to recall and play both colors.',
          ],
          ['animatePieces', 'Animate pieces', 'Show pieces travelling between squares.'],
          [
            'showThoughts',
            'Show thought bubbles',
            'Show explanations above the board. The × closes the thought until your next move.',
          ],
          ['glassEffect', 'Glass effect', 'Give the explanation bar a frosted glass finish.'],
          [
            'highlightSquares',
            'Highlight explained squares',
            'Blue: control · Red: attack · Green: movement. Pieces keep their colors.',
          ],
        ] as const
      ).map(([key, label, description]) => (
        <label className="opening-setting-row" key={key}>
          <span>
            <strong>{label}</strong>
            <small>{description}</small>
          </span>
          <input
            type="checkbox"
            aria-label={label}
            checked={preferences[key]}
            onChange={(event) => change({ [key]: event.target.checked })}
          />
        </label>
      ))}
      <label className="opening-setting-row opening-setting-range">
        <span>
          <strong>Bubble opacity</strong>
          <small>Higher values make the bubble easier to read.</small>
        </span>
        <span className="opening-range-control">
          <input
            type="range"
            aria-label="Bubble opacity"
            min="40"
            max="100"
            step="5"
            value={preferences.bubbleOpacity}
            onChange={(event) => change({ bubbleOpacity: Number(event.target.value) })}
          />
          <output>{preferences.bubbleOpacity}%</output>
        </span>
      </label>
      <label className="opening-setting-row opening-setting-range">
        <span>
          <strong>Automatic reply delay</strong>
          <small>Pause after your move before the opponent replies.</small>
        </span>
        <span className="opening-range-control">
          <input
            type="range"
            aria-label="Automatic reply delay"
            min="500"
            max="3000"
            step="250"
            value={preferences.replyDelayMs}
            onChange={(event) => change({ replyDelayMs: Number(event.target.value) })}
          />
          <output>{preferences.replyDelayMs / 1000}s</output>
        </span>
      </label>
      {error && (
        <p className="ot-feedback" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
