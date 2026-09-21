import { Chess } from 'chess.js';
import type { OpeningPack, TeachingLine } from './packs';
import { MAX_PROGRESS_CHARS, OVERSIZED_COURSE_MESSAGE } from './limits';
export interface Stage {
  kind: 'guide' | 'drill' | 'final';
  line: number;
}
export interface TrainingSession {
  stages: Stage[];
  stage: number;
  ply: number;
  mistakes: number;
  hints: number;
  reveals: number;
}
export interface Progress {
  version: 1;
  pack: OpeningPack;
  session: TrainingSession;
}
export const PROGRESS_KEY = 'chess-room.opening-teacher.v1';
function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createSession(pack: OpeningPack, random = Math.random): TrainingSession {
  const stages: Stage[] = [];
  pack.lines.forEach((_, line) => {
    stages.push({ kind: 'guide', line });
    const practice = line === 0 ? [0] : shuffle([line, Math.floor(random() * line)], random);
    practice.forEach((index) => stages.push({ kind: 'drill', line: index }));
  });
  shuffle(
    pack.lines.map((_, i) => i),
    random,
  ).forEach((line) => stages.push({ kind: 'final', line }));
  return { stages, stage: 0, ply: 0, mistakes: 0, hints: 0, reveals: 0 };
}
export function currentLine(pack: OpeningPack, session: TrainingSession): TeachingLine {
  return pack.lines[session.stages[Math.min(session.stage, session.stages.length - 1)].line];
}
export function position(pack: OpeningPack, session: TrainingSession): string {
  const line = currentLine(pack, session);
  return session.ply === 0 ? line.rootFen : line.moves[session.ply - 1].after;
}
function skipOpponent(pack: OpeningPack, session: TrainingSession): TrainingSession {
  const line = currentLine(pack, session);
  let ply = session.ply;
  while (ply < line.moves.length && new Chess(line.moves[ply].before).turn() !== pack.side) ply++;
  return { ...session, ply };
}
export function guideStep(
  pack: OpeningPack,
  session: TrainingSession,
  delta: number,
): TrainingSession {
  if (session.stages[session.stage]?.kind !== 'guide') return session;
  return {
    ...session,
    ply: Math.max(0, Math.min(currentLine(pack, session).moves.length, session.ply + delta)),
  };
}
export function nextStage(pack: OpeningPack, session: TrainingSession): TrainingSession {
  if (
    session.stage >= session.stages.length ||
    session.ply < currentLine(pack, session).moves.length
  )
    return session;
  const next = { ...session, stage: session.stage + 1, ply: 0 };
  if (next.stage === next.stages.length)
    return { ...next, ply: currentLine(pack, session).moves.length };
  return next.stages[next.stage].kind === 'guide' ? next : skipOpponent(pack, next);
}
export function playTrainingMove(
  pack: OpeningPack,
  session: TrainingSession,
  uci: string,
): { correct: boolean; session: TrainingSession } {
  const stage = session.stages[session.stage];
  const expected = currentLine(pack, session).moves[session.ply];
  if (!stage || stage.kind === 'guide' || !expected) return { correct: false, session };
  if (expected.uci !== uci)
    return { correct: false, session: { ...session, mistakes: session.mistakes + 1 } };
  return { correct: true, session: skipOpponent(pack, { ...session, ply: session.ply + 1 }) };
}
export function serializeProgress(pack: OpeningPack, session: TrainingSession): string {
  const raw = JSON.stringify({ version: 1, pack, session });
  if (raw.length > MAX_PROGRESS_CHARS) throw Error(OVERSIZED_COURSE_MESSAGE);
  return raw;
}
export function restoreProgress(raw: string | null): Progress | null {
  if (!raw || raw.length > MAX_PROGRESS_CHARS) return null;
  try {
    const data = JSON.parse(raw) as Progress;
    if (data.version !== 1 || !data.pack || !data.session) return null;
    const { pack, session } = data;
    if (
      !['w', 'b'].includes(pack.side) ||
      typeof pack.name !== 'string' ||
      typeof pack.description !== 'string' ||
      typeof pack.id !== 'string' ||
      !Array.isArray(pack.lines) ||
      !pack.lines.length ||
      pack.lines.length > 40
    )
      return null;
    for (const line of pack.lines) {
      if (
        typeof line.name !== 'string' ||
        !Array.isArray(line.moves) ||
        !line.moves.length ||
        line.moves.length > 120
      )
        return null;
      const chess = new Chess(line.rootFen);
      let trainable = false;
      for (const move of line.moves) {
        if (
          chess.fen() !== move.before ||
          typeof move.note !== 'string' ||
          !Array.isArray(move.marks)
        )
          return null;
        if (chess.turn() === pack.side) trainable = true;
        const legal = chess.move(move.uci);
        if (chess.fen() !== move.after || legal.san !== move.san) return null;
        for (const mark of move.marks) {
          if (!['green', 'red', 'blue', 'yellow', 'orange'].includes(mark.color)) return null;
          const square = (value: unknown) =>
            typeof value === 'string' && /^[a-h][1-8]$/.test(value);
          if (
            mark.kind === 'arrow'
              ? !square(mark.from) || !square(mark.to)
              : mark.kind !== 'square' || !square(mark.square)
          )
            return null;
        }
      }
      if (!trainable) return null;
    }
    const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
    if (
      ![session.stage, session.ply, session.mistakes, session.hints, session.reveals].every(
        integer,
      ) ||
      !Array.isArray(session.stages) ||
      session.stages.length !== pack.lines.length * 4 - 1 ||
      session.stage > session.stages.length
    )
      return null;
    let cursor = 0;
    for (let line = 0; line < pack.lines.length; line++) {
      const guide = session.stages[cursor++];
      if (guide?.kind !== 'guide' || guide.line !== line) return null;
      const drills = session.stages.slice(cursor, cursor + (line === 0 ? 1 : 2));
      if (
        drills.some((s) => s.kind !== 'drill' || !integer(s.line) || s.line > line) ||
        !drills.some((s) => s.line === line) ||
        new Set(drills.map((s) => s.line)).size !== drills.length
      )
        return null;
      cursor += drills.length;
    }
    const finals = session.stages.slice(cursor);
    if (
      finals.length !== pack.lines.length ||
      finals.some((s) => s.kind !== 'final' || !integer(s.line) || s.line >= pack.lines.length) ||
      new Set(finals.map((s) => s.line)).size !== finals.length
    )
      return null;
    const line = currentLine(pack, session);
    if (session.ply > line.moves.length) return null;
    if (
      session.stage < session.stages.length &&
      session.stages[session.stage].kind !== 'guide' &&
      session.ply < line.moves.length &&
      new Chess(line.moves[session.ply].before).turn() !== pack.side
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
