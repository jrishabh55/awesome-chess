import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { TeachingLine } from './packs';
import { explainOpeningMove, openingPlans } from './explanations';

function line(sans: string, fen?: string): TeachingLine {
  const board = new Chess(fen);
  const rootFen = board.fen();
  return {
    name: 'Practice line',
    rootFen,
    moves: sans
      .split(' ')
      .filter(Boolean)
      .map((san) => {
        const before = board.fen();
        const move = board.move(san);
        return {
          uci: move.from + move.to + (move.promotion || ''),
          san: move.san,
          before,
          after: board.fen(),
          note: '',
          marks: [],
        };
      }),
  };
}
const text = (explanation: { summary?: string; ideas: string[] }) =>
  [explanation.summary, ...explanation.ideas].join(' ');

describe('position-aware opening explanations', () => {
  it('explains London move order and actual pawn and knight support', () => {
    const london = line('d4 d5 Bf4 Nf6 e3 e6 Nd2');
    expect(text(explainOpeningMove('London System', london, 2))).toMatch(/before e3/);
    expect(text(explainOpeningMove('London System', london, 4))).toMatch(/supports.*d4/);
    expect(text(explainOpeningMove('London System', london, 6))).toMatch(/e4/);
    const laterBishop = line('d4 d5 e3 Nf6 Bd3 e6 Bf5');
    expect(text(explainOpeningMove('London System', laterBishop, 6))).not.toMatch(/before e3/);
  });

  it('explains Black’s Sicilian moves without claiming c5 attacks e4', () => {
    const sicilian = line('e4 c5 Nf3 d6');
    const c5 = explainOpeningMove('Sicilian Defense', sicilian, 1);
    expect(c5.title).toContain('Black');
    expect(text(c5)).toMatch(/d4/);
    expect(text(c5)).not.toMatch(/attacks.*e4/);
    expect(text(explainOpeningMove('Sicilian Defense', sicilian, 3))).toMatch(/controls.*e5/);
    expect(text(explainOpeningMove('Sicilian Defense', sicilian, 3))).toMatch(/c8 bishop/);
  });

  it('preserves substantive authored notes and replaces import boilerplate', () => {
    const opening = line('e4 e5 Nf3');
    opening.moves[2].note = 'Prepare castling while asking Black to defend the central pawn.';
    expect(explainOpeningMove('Custom opening', opening, 2).summary).toBe(opening.moves[2].note);
    opening.moves[2].note =
      'White moves the knight from g1 to f3. Follow the arrow and remember this position in the line.';
    const explained = text(explainOpeningMove('Custom opening', opening, 2));
    expect(explained).not.toContain('Follow the arrow');
    expect(explained).toMatch(/attacks Black’s pawn on e5/);
  });

  it('describes castling, captures, and checks from actual legal moves', () => {
    const castles = line('e4 e5 Nf3 Nc6 Bc4 Nf6 O-O');
    expect(text(explainOpeningMove('Italian Game', castles, 6))).toMatch(/rook.*f1/);
    const capture = line('d4 d5 c4 dxc4');
    expect(text(explainOpeningMove('Queen’s Gambit', capture, 3))).toMatch(/captures.*pawn.*c4/);
    const check = line('e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#');
    expect(text(explainOpeningMove('Custom opening', check, 6))).toMatch(/checkmate/i);
    const ordinaryCheck = line('e4 e5 Nf3 Nc6 Bb5 d6 Bxc6+');
    expect(text(explainOpeningMove('Custom opening', ordinaryCheck, 6))).toMatch(
      /must answer the check/,
    );
  });

  it('does not claim a bishop attacks f7 through a blocking pawn', () => {
    const blocked = line('Bc4', 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    expect(text(explainOpeningMove('Italian Game', blocked, 0))).not.toMatch(/attacks.*f7/);
  });

  it('grounds bishop-chain and central challenge themes in the actual position', () => {
    const caro = line('e4 c6 d4 d5 e5 Bf5');
    expect(text(explainOpeningMove('Caro-Kann Defense', caro, 5))).toMatch(/before …e6/);
    const gambit = line('d4 d5 c4 e6');
    expect(text(explainOpeningMove('Queen’s Gambit', gambit, 2))).toMatch(/challenges.*d5/);
    expect(text(explainOpeningMove('Queen’s Gambit', gambit, 3))).toMatch(/supports d5/);
    const fianchetto = line('d4 d5 g3 Nf6 Bg2 e6 e3');
    expect(text(explainOpeningMove('London System', fianchetto, 6))).not.toContain('f1 bishop');
  });

  it('describes en passant and promotion without inventing tactical gains', () => {
    const enPassant = line('e4 a6 e5 d5 exd6');
    expect(text(explainOpeningMove('Custom', enPassant, 4))).toContain('en passant');
    const promotion = line('a8=N', '7k/P7/8/8/8/8/8/7K w - - 0 1');
    expect(text(explainOpeningMove('Custom', promotion, 0))).toContain('Promoting to a knight');
    expect(text(explainOpeningMove('Custom', promotion, 0))).not.toMatch(/wins|winning|best/);
  });

  it('gives a concrete purpose for quiet flank pawn moves and prioritizes a check', () => {
    const quiet = line('h3 a6');
    expect(text(explainOpeningMove('Custom', quiet, 0))).toContain('controls g4');
    expect(text(explainOpeningMove('Custom', quiet, 1))).toContain('controls b5');
    const checked = line('e4 e5 Nf3 Nc6 Bb5 d6 Bxc6+');
    expect(openingPlans('Custom', checked, 'b').ideas[0]).toContain('First answer the check');
  });

  it('uses the final board and the requested side for middlegame plans', () => {
    const sicilian = line('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3');
    const black = openingPlans('Sicilian Defense', sicilian, 'b');
    expect(black.title).toContain('Black');
    expect(text(black)).toContain('semi-open c-file');
    expect(text(black)).not.toMatch(/prepare.*c5/);
    const white = openingPlans('Sicilian Defense', sicilian, 'w');
    expect(white.title).toContain('White');
    expect(text(white)).not.toContain('semi-open c-file');
    expect(white.ideas.length).toBeGreaterThanOrEqual(3);
    expect(white.ideas.length).toBeLessThanOrEqual(4);
    const exchanged = line('e4 e6 d4 d5 exd5 exd5');
    expect(text(openingPlans('French Defense', exchanged, 'b'))).not.toContain('locked');
    const advanced = line('e4 e6 d4 d5 e5');
    expect(text(openingPlans('French Defense', advanced, 'w'))).toContain('d4');
  });

  it('does not advise opening plans after checkmate', () => {
    const mate = line('f3 e5 g4 Qh4#');
    expect(text(openingPlans('Custom', mate, 'w'))).toContain('no middlegame continuation');
    expect(text(openingPlans('Custom', mate, 'b'))).not.toContain('Prepare castling');
  });
});
