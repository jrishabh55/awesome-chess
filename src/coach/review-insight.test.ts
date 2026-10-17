import { describe, expect, it } from 'vitest';
import { createStudy, parsePgn, playMove } from '../chess/tree';
import type { Study } from '../chess/types';
import { classify } from '../review/classify';
import type { EngineLine } from '../engine/types';
import { explainMove } from './explain';

const line = (pv: string[], value = 0): EngineLine => ({
  rank: 1,
  depth: 18,
  score: { kind: 'cp', value },
  pv,
  bound: 'exact',
});
function assessment(s: Study, best: EngineLine, played = best) {
  const node = s.nodes[s.selectedId];
  return classify({
    nodeId: node.id,
    mover: node.fen.split(' ')[1] === 'w' ? 'b' : 'w',
    playedUci: node.uci!,
    book: false,
    legalCount: 10,
    best,
    played,
    evidence: [],
  });
}
const move = (fen: string, uci: string) => {
  const s = createStudy(fen);
  return playMove(s, s.rootId, uci);
};

describe('evidence-backed move review', () => {
  it('explains the mating reply to an error and retains the preceding best move', () => {
    const s = parsePgn('1. f3 e5 2. g4 *')[0];
    s.selectedId = s.mainline[2];
    const a = assessment(s, line(['g2g3', 'd7d5'], -90), {
      ...line(['g2g4', 'd8h4']),
      score: { kind: 'mate', winner: 'b', moves: 1 },
    });
    const review = explainMove(a, s).review;
    expect(review?.reason).toMatch(/Qh4#.*checkmate/);
    expect(review?.bestSan).toBe('g3');
    expect(review?.remnant).toEqual([{ kind: 'arrow', from: 'g2', to: 'g3', color: 'green' }]);
    expect(review?.playedLine).toEqual(['g2g4', 'd8h4']);
    expect(review?.position).toMatch(/Black to move/);
  });

  it('shows a real pin in red, without claiming the pinned piece is won', () => {
    const s = move('4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', 'f1b5');
    const review = explainMove(assessment(s, line(['f1b5'])), s).review;
    expect(review?.threats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringMatching(/bishop on b5.*knight on c6.*king on e8/),
          marks: expect.arrayContaining([{ kind: 'arrow', from: 'b5', to: 'e8', color: 'red' }]),
        }),
      ]),
    );
    expect(review?.threats.map((t) => t.text).join(' ')).not.toMatch(/wins|cannot move/);
    expect(review?.isBest).toBe(true);
    expect(review?.reason).toMatch(/pins.*c6/);
  });

  it('does not show a pin through two blockers', () => {
    const s = move('4k3/3p4/2n5/8/8/8/8/4KB2 w - - 0 1', 'f1b5');
    expect(explainMove(assessment(s, line(['f1b5'])), s).review?.threats).toEqual([]);
  });

  it('detects an existing Black pin even when another piece just moved', () => {
    const s = move('4k3/8/8/8/1b6/2N5/P7/4K3 w - - 0 1', 'a2a3');
    const threats = explainMove(assessment(s, line(['a2a3'])), s).review?.threats;
    expect(threats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringMatching(/Black.*b4.*c3.*e1/) }),
      ]),
    );
  });

  it('explains an equivalent move without calling it wrong and labels a conditional plan', () => {
    const s = move('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'd2d4');
    const a = assessment(s, line(['e2e4', 'e7e5', 'g1f3'], 30), line(['d2d4', 'd7d5'], 25));
    const review = explainMove(a, s).review;
    expect(review?.reason).toMatch(/close|comparable/);
    expect(review?.reason).not.toMatch(/wrong|mistake|loses/);
    expect(review?.plan).toMatch(/If.*e5.*Nf3/);
    expect(review?.position).toMatch(/material.*equal/i);
  });

  it('discards an illegal continuation instead of inventing a plan from its suffix', () => {
    const s = parsePgn('1. e4 *')[0];
    s.selectedId = s.mainline[0];
    const review = explainMove(assessment(s, line(['e2e4', 'e7e4', 'd1h5'])), s).review;
    expect(review?.bestLine).toEqual(['e2e4']);
    expect(review?.plan).not.toMatch(/Qh5/);
  });

  it('does not reuse an assessment on another selected position', () => {
    const s = parsePgn('1. e4 e5 *')[0];
    s.selectedId = s.mainline[0];
    const a = assessment(s, line(['e2e4']));
    s.selectedId = s.mainline[1];
    expect(explainMove(a, s).review).toBeUndefined();
  });

  it('keeps the promotion piece in the best move notation', () => {
    const s = move('8/P6k/8/8/8/8/8/4K3 w - - 0 1', 'a7a8n');
    const review = explainMove(assessment(s, line(['a7a8q']), line(['a7a8n'])), s).review;
    expect(review?.bestSan).toBe('a8=Q');
  });

  it('explains a Black error using the White reply, without reversing the score', () => {
    const s = move('6k1/p4ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1', 'a7a6');
    const a = assessment(s, line(['g8f8'], 400), {
      ...line(['a7a6', 'e1e8']),
      score: { kind: 'mate', winner: 'w', moves: 1 },
    });
    const review = explainMove(a, s).review;
    expect(review?.reason).toMatch(/White.*Re8#.*checkmate/);
    expect(review?.comparison).toContain('+M1');
  });

  it('does not draw a pin from an alternative line on the played position', () => {
    const s = move('4k3/8/2n5/8/8/8/P7/4KB2 w - - 0 1', 'a2a3');
    const a = assessment(s, line(['f1b5'], 200), line(['a2a3'], 0));
    const review = explainMove(a, s).review;
    expect(review?.threats).toEqual([]);
    expect(review?.remnant).toEqual([{ kind: 'arrow', from: 'f1', to: 'b5', color: 'green' }]);
  });

  it('does not label an equal exchange a material win', () => {
    const s = move('4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1', 'e4d5');
    const a = assessment(s, line(['e4d5', 'c6d5'], 0));
    const review = explainMove(a, s).review;
    expect(review?.reason).toContain('captures a pawn');
    expect(review?.reason).not.toMatch(/material balance improves|wins/);
  });

  it('stops a plan at a repetition draw using the full game history', () => {
    const s = parsePgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *')[0];
    s.selectedId = s.mainline[7];
    const review = explainMove(assessment(s, line(['f6g8', 'g1f3', 'g8f6'])), s).review;
    expect(review?.bestLine).toEqual(['f6g8']);
    expect(review?.position).toMatch(/threefold repetition/);
    expect(review?.plan).toMatch(/draw/);
  });
});
