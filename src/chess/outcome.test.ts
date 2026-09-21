import { expect, it } from 'vitest';
import { createStudy, parsePgn, playMove, selectNode } from './tree';
import { outcomeAt } from './outcome';

it('detects checkmate from the displayed position without trusting the PGN result', () => {
  const study = parsePgn('1. f3 e5 2. g4 Qh4# *')[0];
  expect(outcomeAt(selectNode(study, study.mainline.at(-1)!))).toEqual({
    kind: 'win',
    winner: 'b',
    reason: 'checkmate',
  });
  expect(outcomeAt(selectNode(study, study.mainline.at(-2)!))).toBeUndefined();
});

it('shows a declared result only at the original game end, never in an unfinished sideline', () => {
  const study = parsePgn('[Result "1-0"]\n[Termination "Black resigned"]\n\n1. e4 e5 1-0')[0];
  const end = selectNode(study, study.mainline.at(-1)!);
  expect(outcomeAt(end)).toEqual({ kind: 'win', winner: 'w', reason: 'resignation' });
  expect(outcomeAt(study)).toBeUndefined();
  expect(outcomeAt(playMove(end, end.selectedId, 'g1f3'))).toBeUndefined();
});

it('recognizes a mating move in a sideline', () => {
  let study = parsePgn('1. f3 e5 2. g4 Nc6 *')[0];
  study = playMove(study, study.mainline[2], 'd8h4');
  expect(outcomeAt(study)).toEqual({ kind: 'win', winner: 'b', reason: 'checkmate' });
});

it('does not treat claimable repetition or the 50-move threshold as a finished game', () => {
  const repetition = '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8';
  const continuing = parsePgn(`${repetition} 5. e4 *`)[0];
  expect(outcomeAt(selectNode(continuing, continuing.mainline[7]))).toBeUndefined();
  const won = parsePgn(`[Result "1-0"]\n\n${repetition} 1-0`)[0];
  expect(outcomeAt(selectNode(won, won.mainline.at(-1)!))).toEqual({
    kind: 'win',
    winner: 'w',
    reason: 'result',
  });
  expect(outcomeAt(createStudy('7k/8/8/8/8/8/7K/R7 w - - 100 51'))).toBeUndefined();
});

it('distinguishes time losses and draws, without guessing a resignation reason', () => {
  const game = (headers: string, result: string) => {
    const study = parsePgn(`${headers}\n\n1. e4 e5 ${result}`)[0];
    return selectNode(study, study.mainline.at(-1)!);
  };
  expect(outcomeAt(game('[Result "0-1"]\n[Termination "Time forfeit"]', '0-1'))).toEqual({
    kind: 'win',
    winner: 'b',
    reason: 'timeout',
  });
  expect(outcomeAt(game('[Result "1-0"]', '1-0'))).toEqual({
    kind: 'win',
    winner: 'w',
    reason: 'result',
  });
  expect(outcomeAt(game('[Result "1/2-1/2"]', '1/2-1/2'))).toEqual({ kind: 'draw' });
  expect(outcomeAt(createStudy('7k/8/5KQ1/8/8/8/8/8 b - - 0 1'))).toEqual({ kind: 'draw' });
});
