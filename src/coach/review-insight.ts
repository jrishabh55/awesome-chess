import { Chess, type Move, type PieceSymbol } from 'chess.js';
import { chessAt, positionAt } from '../chess/tree';
import type { Color, Mark, Square, Study } from '../chess/types';
import { detectEvidence, material } from '../review/classify';
import { isError, type MoveAssessment } from '../review/policy';
import { scoreText } from '../engine/uci';

const names: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const side = (color: Color) => (color === 'w' ? 'White' : 'Black');
export interface ReviewThreat {
  text: string;
  marks: Mark[];
}
export interface ReviewInsight {
  reason: string;
  bestSan: string;
  isBest: boolean;
  comparison: string;
  position: string;
  plan: string;
  threats: ReviewThreat[];
  remnant: Mark[];
  bestLine: string[];
  playedLine: string[];
  terminal?: string;
}

// Keep a legal prefix only. All displayed continuations and their claims use
// these replayed positions, including imported/cached engine results.
function replay(board: Chess, line: string[]) {
  const moves: Move[] = [];
  const valid: string[] = [];
  for (const uci of line.slice(0, 16)) {
    try {
      moves.push(board.move(uci));
      valid.push(uci);
    } catch {
      break;
    }
    if (board.isGameOver()) break;
  }
  return { board, moves, line: valid };
}

function terminalText(board: Chess): string | undefined {
  if (board.isCheckmate()) return `Checkmate. ${side(board.turn() === 'w' ? 'b' : 'w')} wins.`;
  if (board.isStalemate()) return 'Draw by stalemate.';
  if (board.isInsufficientMaterial()) return 'Draw by insufficient material.';
  if (board.isThreefoldRepetition()) return 'Draw by threefold repetition.';
  if (board.isDrawByFiftyMoves()) return 'Draw by the fifty-move rule.';
}

function moveFact(move: Move) {
  const board = new Chess(move.after);
  if (board.isCheckmate()) return `${move.san} delivers checkmate.`;
  if (move.promotion) return `${move.san} promotes the pawn to a ${names[move.promotion]}.`;
  if (move.isKingsideCastle() || move.isQueensideCastle())
    return `${move.san} moves the king to ${move.to} and brings the rook toward the center.`;
  if (move.captured)
    return `${move.san} captures a ${names[move.captured]}${move.isEnPassant() ? ' en passant' : ` on ${move.to}`}.`;
  if (board.isCheck()) return `${move.san} gives check, so the opponent must answer it.`;
  const center = (['d4', 'e4', 'd5', 'e5'] as Square[]).filter((s) =>
    board.attackers(s, move.color).includes(move.to),
  );
  if (center.length)
    return `From ${move.to}, the ${names[move.piece]} attacks ${center.join(' and ')} in the center.`;
  if (
    ['n', 'b'].includes(move.piece) &&
    move.from[1] === (move.color === 'w' ? '1' : '8') &&
    move.to[1] !== move.from[1]
  )
    return `${move.san} develops the ${names[move.piece]} off its back rank.`;
  return `${move.san} places the ${names[move.piece]} on ${move.to}.`;
}

function pins(board: Chess): ReviewThreat[] {
  const pieces = board
    .board()
    .flat()
    .filter((p) => p !== null);
  const threats: ReviewThreat[] = [];
  for (const attacker of pieces.filter((p) => ['b', 'r', 'q'].includes(p.type))) {
    const king = pieces.find((p) => p.type === 'k' && p.color !== attacker.color);
    if (!king) continue;
    const x = attacker.square.charCodeAt(0),
      y = Number(attacker.square[1]);
    const dx = king.square.charCodeAt(0) - x,
      dy = Number(king.square[1]) - y;
    if (!(
      (Math.abs(dx) === Math.abs(dy) && attacker.type !== 'r') ||
      ((dx === 0 || dy === 0) && attacker.type !== 'b')
    ))
      continue;
    const blockers: Square[] = [];
    for (let step = 1; step < Math.max(Math.abs(dx), Math.abs(dy)); step++) {
      const square =
        `${String.fromCharCode(x + step * Math.sign(dx))}${y + step * Math.sign(dy)}` as Square;
      if (board.get(square)) blockers.push(square);
    }
    if (blockers.length !== 1) continue;
    const target = board.get(blockers[0])!;
    if (target.color === attacker.color) continue;
    threats.push({
      text: `${side(attacker.color)}’s ${names[attacker.type]} on ${attacker.square} pins the ${names[target.type]} on ${blockers[0]} to the king on ${king.square}. The pinned piece cannot leave this line while exposing its king.`,
      marks: [
        { kind: 'arrow', from: attacker.square, to: king.square, color: 'red' },
        { kind: 'square', square: blockers[0], color: 'red' },
      ],
    });
  }
  return threats;
}

export function reviewInsight(study: Study, a: MoveAssessment): ReviewInsight | undefined {
  const node = study.nodes[study.selectedId];
  if (node?.id !== a.nodeId || !node.parentId || !node.uci) return;
  const before = chessAt(study, node.parentId);
  const after = chessAt(study, node.id);
  const best = replay(chessAt(study, node.parentId), a.bestLine);
  const played = replay(chessAt(study, node.parentId), a.playedLine);
  if (!best.moves[0] || best.line[0] !== a.bestUci || played.line[0] !== node.uci) return;
  const isBest = node.uci === a.bestUci;
  const bestSan = best.moves[0].san;
  const actual = played.moves[0];
  const currentPins = after.isGameOver() ? [] : pins(after);
  const previousPins = new Set(pins(before).map((p) => p.text));
  const newPin = currentPins.find((p) => !previousPins.has(p.text));
  const fact = newPin && !isError(a.primary) ? newPin.text : moveFact(actual);
  const comparison = `Best ${bestSan}: ${scoreText(a.before)} · Played ${actual.san}: ${scoreText(a.after)}. Scores favor White when positive, Black when negative.`;
  const reply = played.moves[1];
  const gain = material(played.board, a.mover) - material(before, a.mover);
  const bestGain = material(best.board, a.mover) - material(before, a.mover);
  let reason: string;
  if (isError(a.primary)) {
    if (reply && new Chess(reply.after).isCheckmate())
      reason = `${actual.san} allows ${side(reply.color)} to play ${reply.san}, delivering checkmate.`;
    else if (played.board.isCheckmate() && played.board.turn() === a.mover)
      reason = `${actual.san} allows a mating continuation ending with ${played.moves.at(-1)!.san}. Replay the line to see how the king is trapped.`;
    else if (
      best.board.isCheckmate() &&
      best.board.turn() !== a.mover &&
      !played.board.isCheckmate()
    )
      reason = `${bestSan} has a mating continuation ending with ${best.moves.at(-1)!.san}; the analyzed line after ${actual.san} does not retain that mate.`;
    else if (gain < 0)
      reason = `After ${actual.san}${reply ? ` ${reply.san}` : ''}, ${side(a.mover)}’s material balance falls by ${-gain} point${gain === -1 ? '' : 's'} in the analyzed line. This is the engine continuation, not a claim that every reply loses material.`;
    else if (bestGain > gain && bestGain > 0)
      reason = `The line starting with ${bestSan} improves ${side(a.mover)}’s material balance by ${bestGain} points, compared with ${gain} after ${actual.san}. These are outcomes of the displayed continuations.`;
    else if (reply && (reply.captured || new Chess(reply.after).isCheck()))
      reason = `${actual.san} permits ${side(reply.color)}’s reply ${reply.san}. ${moveFact(reply)} Stockfish evaluates this continuation less favorably than ${bestSan}.`;
    else
      reason = `Stockfish evaluates ${actual.san} less favorably than ${bestSan} (${scoreText(a.after)} versus ${scoreText(a.before)}, from White’s perspective). A specific tactical cause has not been established; compare the continuations.`;
  } else if (a.forced) {
    reason = `${actual.san} is the only legal move in this position. ${fact}`;
  } else if (a.primary === 'Great') {
    reason = `${actual.san} preserves the position’s value; the verified search found a significantly worse result for the strongest alternative. ${fact}`;
  } else if (a.primary === 'Brilliant') {
    reason = `${actual.san} offers material while maintaining a sound engine evaluation after the checked acceptance captures. ${fact}`;
  } else if (isBest) {
    reason = `You found the best move at this search depth. ${fact}`;
    if (played.board.isCheckmate() && !new Chess(actual.after).isCheckmate())
      reason += ` The engine line ends in checkmate with ${played.moves.at(-1)!.san}.`;
    else if (gain > 0)
      reason += ` In the engine line, your material balance improves by ${gain} points.`;
  } else {
    reason = `${a.base === 'Excellent' ? 'This move is very close to the engine’s top choice.' : 'This move keeps most of the position’s value.'} ${fact}`;
  }

  let plan = 'The available line is too short to establish a follow-up plan.';
  if (best.board.isDraw()) {
    plan = `The best line ends in a draw. ${terminalText(best.board)}`;
  } else if (best.moves.length >= 3) {
    plan = `${isBest ? `After ${bestSan}` : `With ${bestSan} instead`}: If ${side(best.moves[1].color)} replies ${best.moves[1].san}, continue with ${best.moves[2].san}. ${moveFact(best.moves[2])} This is one engine line; other replies can change the plan.`;
  } else if (best.board.isCheckmate()) {
    plan = `The best line ends in checkmate with ${best.moves.at(-1)!.san}.`;
  } else if (best.moves[1]) {
    plan = `After ${bestSan}, Stockfish’s reply is ${best.moves[1].san}. The available line does not establish a longer plan.`;
  }

  const balance = material(after, 'w');
  const terminal = terminalText(after);
  const position = `${terminal || `${side(after.turn())} to move.`} ${balance === 0 ? 'Material is equal.' : `${side(balance > 0 ? 'w' : 'b')} is ahead by ${Math.abs(balance)} material points (pawn 1, minor piece 3, rook 5, queen 9).`}${!terminal && after.isCheck() ? ' The king is in check.' : ''}`;
  const threats = currentPins;
  if (!after.isGameOver()) {
    const evidence = detectEvidence(positionAt(study, node.parentId), {
      rank: 1,
      depth: a.depth,
      score: a.after,
      bound: 'exact',
      pv: played.line,
    });
    for (const fork of evidence.filter((e) => e.kind === 'fork')) {
      threats.push({
        text: `The ${names[actual.promotion || actual.piece]} on ${actual.to} attacks ${fork.facts.targets}. This double attack alone does not establish a forced win.`,
        marks: fork.frames[0].marks.map((m) => ({ ...m, color: 'red' })),
      });
    }
    if (after.isCheck()) {
      const king = after
        .board()
        .flat()
        .find((p) => p?.type === 'k' && p.color === after.turn())!;
      threats.unshift({
        text: `${side(after.turn())} is in check and must answer the attack on ${king.square}.`,
        marks: after
          .attackers(king.square, a.mover)
          .map((from) => ({ kind: 'arrow', from, to: king.square, color: 'red' })),
      });
    } else if (reply && (reply.captured || new Chess(reply.after).isCheck())) {
      threats.push({
        text: `Watch ${side(reply.color)}’s engine reply ${reply.san}: ${moveFact(reply)}${reply.captured ? ' A capture alone does not establish a net material gain.' : ''}`,
        marks: [{ kind: 'arrow', from: reply.from, to: reply.to, color: 'red' }],
      });
    }
  }
  return {
    reason,
    bestSan,
    isBest,
    comparison,
    position,
    plan,
    threats,
    bestLine: best.line,
    playedLine: played.line,
    terminal,
    remnant: [{ kind: 'arrow', from: best.moves[0].from, to: best.moves[0].to, color: 'green' }],
  };
}
