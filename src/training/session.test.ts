import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { builtInPacks, importPack } from './packs';
import {
  createSession,
  playTrainingMove,
  playTrainingReply,
  nextStage,
  guideStep,
  currentLine,
  position,
  restoreProgress,
  serializeProgress,
} from './session';

describe('opening course', () => {
  it('teaches each line before practice, includes the newest line, then tests all lines', () => {
    const session = createSession(builtInPacks[0], () => 0);
    const stages = session.stages;
    expect(stages[0]).toEqual({ kind: 'guide', line: 0 });
    expect(stages[1]).toEqual({ kind: 'drill', line: 0 });
    for (let line = 1; line < 3; line++) {
      const index = stages.findIndex((s) => s.kind === 'guide' && s.line === line);
      const drills = stages.slice(index + 1, index + 3);
      expect(drills.every((s) => s.kind === 'drill' && s.line <= line)).toBe(true);
      expect(drills.map((s) => s.line)).toContain(line);
      expect(new Set(drills.map((s) => s.line)).size).toBe(2);
    }
    expect(stages.slice(-3).every((s) => s.kind === 'final')).toBe(true);
    expect(
      stages
        .slice(-3)
        .map((s) => s.line)
        .sort(),
    ).toEqual([0, 1, 2]);
  });
  it('does not advance unfinished guides or drills', () => {
    const pack = builtInPacks[0];
    const start = createSession(pack);
    expect(nextStage(pack, start)).toEqual(start);
    let session = { ...start, ply: pack.lines[0].moves.length };
    session = nextStage(pack, session);
    expect(nextStage(pack, session)).toEqual(session);
  });
  it('keeps wrong moves off the board and plays learner and opponent moves separately', () => {
    const pack = builtInPacks[0];
    let session = createSession(pack);
    session = nextStage(pack, { ...session, ply: pack.lines[0].moves.length });
    const wrong = playTrainingMove(pack, session, 'd2d4');
    expect(wrong.correct).toBe(false);
    expect(wrong.session.ply).toBe(0);
    expect(wrong.session.mistakes).toBe(1);
    const right = playTrainingMove(pack, wrong.session, 'e2e4');
    expect(right.correct).toBe(true);
    expect(right.session.ply).toBe(1);
    expect(new Chess(position(pack, right.session)).turn()).toBe('b');
    expect(playTrainingMove(pack, right.session, 'e7e5').session).toBe(right.session);
    const reply = playTrainingReply(pack, right.session);
    expect(reply.ply).toBe(2);
    expect(reply.mistakes).toBe(1);
    expect(playTrainingReply(pack, reply)).toBe(reply);
  });
  it('starts Black drills at the root so the automatic White move can animate', () => {
    const pack = builtInPacks.find((p) => p.side === 'b')!;
    const start = createSession(pack);
    const drill = nextStage(pack, { ...start, ply: pack.lines[0].moves.length });
    expect(drill.ply).toBe(0);
    expect(new Chess(position(pack, drill)).turn()).toBe('w');
    expect(restoreProgress(serializeProgress(pack, drill))?.session).toEqual(drill);
    expect(playTrainingReply(pack, drill).ply).toBe(1);
  });
  it('accepts and validates both colors when manual recall is enabled', () => {
    const pack = builtInPacks[0];
    const start = createSession(pack);
    const drill = nextStage(pack, { ...start, ply: pack.lines[0].moves.length });
    const first = playTrainingMove(pack, drill, 'e2e4', true).session;
    const wrong = playTrainingMove(pack, first, 'e7e6', true);
    expect(wrong.correct).toBe(false);
    expect(wrong.session).toMatchObject({ ply: 1, mistakes: 1 });
    const reply = playTrainingMove(pack, wrong.session, 'e7e5', true);
    expect(reply.correct).toBe(true);
    expect(reply.session).toMatchObject({ ply: 2, mistakes: 1 });
  });
  it('runs a whole course to completion and permits guide backtracking', () => {
    const pack = builtInPacks[0];
    let session = createSession(pack);
    session = guideStep(pack, session, 1);
    expect(session.ply).toBe(1);
    session = guideStep(pack, session, -1);
    expect(session.ply).toBe(0);
    let guard = 0;
    while (session.stage < session.stages.length && guard++ < 200) {
      const line = currentLine(pack, session);
      if (session.stages[session.stage].kind === 'guide')
        session = { ...session, ply: line.moves.length };
      else
        while (session.ply < line.moves.length)
          session =
            line.moves[session.ply].before.split(' ')[1] === pack.side
              ? playTrainingMove(pack, session, line.moves[session.ply].uci).session
              : playTrainingReply(pack, session);
      session = nextStage(pack, session);
    }
    expect(session.stage).toBe(session.stages.length);
    expect(session.mistakes).toBe(0);
  });
  it('validates every built-in line and provides explanatory notes', () => {
    for (const pack of builtInPacks)
      for (const line of pack.lines) {
        const chess = new Chess(line.rootFen);
        for (const move of line.moves) {
          expect(chess.fen()).toBe(move.before);
          chess.move(move.uci);
          expect(chess.fen()).toBe(move.after);
          expect(move.note.length).toBeGreaterThan(10);
        }
      }
  });
  it('imports PGN branches, comments, and setup positions', () => {
    const pack = importPack(
      '1. e4 {Claim the center.} e5 (1... c5 2. Nf3) 2. Nf3 *',
      'w',
      'My lines',
    );
    expect(pack.lines).toHaveLength(2);
    expect(pack.lines[0].moves[0].note).toBe('Claim the center.');
    expect(pack.lines.map((l) => l.moves[1].san)).toEqual(['e5', 'c5']);
    expect(
      importPack('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n1. a8=N *', 'w', 'Promotion')
        .lines[0].moves[0].uci,
    ).toBe('a7a8n');
  });
  it('rejects empty repertoires and lines with no moves for the training side', () => {
    expect(() => importPack('1. e4 *', 'b', 'Empty')).toThrow(/Black/);
    expect(() => importPack('garbage', 'w', 'Invalid')).toThrow();
  });
  it('restores only valid persisted progress without rerandomizing the schedule', () => {
    const pack = builtInPacks[0];
    const session = createSession(pack, () => 0.2);
    const data = JSON.stringify({ version: 1, pack, session });
    expect(restoreProgress(data)?.session).toEqual(session);
    expect(restoreProgress('oops')).toBeNull();
    expect(
      restoreProgress(JSON.stringify({ version: 1, pack, session: { ...session, ply: 999 } })),
    ).toBeNull();
    expect(
      restoreProgress(
        JSON.stringify({
          version: 1,
          pack,
          session: { ...session, stages: [{ kind: 'drill', line: 999 }] },
        }),
      ),
    ).toBeNull();
  });
});

it('imports only the longest version of repeated move sequences while keeping divergent lines', () => {
  const pack = importPack(
    '1. e4 e5 *\n\n1. e4 e5 2. Nf3 *\n\n1. e4 e5 2. Nf3 Nc6 *\n\n1. e4 e5 2. Nf3 Nc6 *\n\n1. e4 c5 *',
    'w',
    'Compact lines',
  );
  expect(pack.lines.map((line) => line.moves.map((move) => move.san))).toEqual([
    ['e4', 'e5', 'Nf3', 'Nc6'],
    ['e4', 'c5'],
  ]);
});

it('applies the import limit to distinct complete lines rather than duplicate source games', () => {
  const pack = importPack(Array(41).fill('1. e4 e5 *').join('\n\n'), 'w', 'Repeated source');
  expect(pack.lines).toHaveLength(1);
});

function branchedCommentPgn(commentLength: number): string {
  const root = new Chess();
  root.move('e4');
  const branches = root.moves().map((reply) => {
    const branch = new Chess(root.fen());
    branch.move(reply);
    const choices = branch.moves().slice(0, 2);
    return `${reply} 2. ${choices[0]} (2. ${choices[1]})`;
  });
  const [main, ...alternatives] = branches;
  const split = main.indexOf(' 2.');
  return `1. e4 {${'a'.repeat(commentLength)}} ${main.slice(0, split)} ${alternatives.map((branch) => `(1... ${branch})`).join(' ')}${main.slice(split)} *`;
}

it('resumes a legal 40-line course with shared comments larger than the old saved-data limit', () => {
  const pgn = branchedCommentPgn(55_000);
  expect(pgn.length).toBeLessThan(200_000);
  const pack = importPack(pgn, 'w', 'Long explanations');
  expect(pack.lines).toHaveLength(40);
  const session = createSession(pack, () => 0.3);
  const raw = serializeProgress(pack, session);
  expect(raw.length).toBeGreaterThan(2_000_000);
  const restored = restoreProgress(raw);
  expect(restored?.session).toEqual(session);
  expect(restored?.pack.lines.map((line) => line.moves[0].note)).toEqual(
    Array(40).fill('a'.repeat(55_000)),
  );
});

it('rejects imports whose expanded shared comments cannot fit the supported saved-course size', () => {
  const pgn = branchedCommentPgn(150_000);
  expect(pgn.length).toBeLessThan(200_000);
  expect(() => importPack(pgn, 'w', 'Too large')).toThrow(/too large.*save|shorten.*comments/i);
});
