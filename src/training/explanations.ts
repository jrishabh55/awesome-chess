import { Chess, SQUARES, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { Color } from '../chess/types';
import type { TeachingLine } from './packs';

export interface MoveExplanation {
  title: string;
  summary: string;
  ideas: string[];
}
export interface OpeningPlans {
  title: string;
  ideas: string[];
}

const names: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const colorName = (color: Color) => (color === 'w' ? 'White' : 'Black');
const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');
const center: Square[] = ['d4', 'e4', 'd5', 'e5'];
function has(board: Chess, square: Square, color: Color, type: PieceSymbol = 'p') {
  const piece = board.get(square);
  return piece?.color === color && piece.type === type;
}
function attacks(board: Chess, from: Square, to: Square, color: Color) {
  return board.attackers(to, color).includes(from);
}
function family(name: string, line: TeachingLine) {
  const label = `${name} ${line.name}`.toLowerCase().replace(/[’'-]/g, '');
  if (label.includes('london')) return 'london';
  if (label.includes('sicilian')) return 'sicilian';
  if (/caro\s*kann/.test(label)) return 'caro';
  if (label.includes('french')) return 'french';
  if (/italian|giuoco|two knights/.test(label)) return 'italian';
  if (/queens gambit|slav defense|slav defence/.test(label)) return 'queens';
  return 'general';
}

// Theme references: Chess.com's educational opening guides, interpreted only
// when the corresponding pieces and pawn relationships exist on this board:
// https://www.chess.com/openings/London-System
// https://www.chess.com/openings/Sicilian-Defense
// https://www.chess.com/openings/Caro-Kann-Defense
// https://www.chess.com/openings/French-Defense
// https://www.chess.com/openings/Italian-Game
// https://www.chess.com/openings/Queens-Gambit
// These are explanations of ideas, not engine evaluations or forced continuations.
function moveTheme(kind: string, before: Chess, after: Chess, move: Move): string | undefined {
  const { from, to, color, piece } = move;
  if (kind === 'london' && color === 'w') {
    if (piece === 'b' && from === 'c1' && to === 'f4' && has(before, 'e2', 'w'))
      return 'Develop the dark-squared bishop before e3, keeping it outside the future pawn chain.';
    if (from === 'e2' && to === 'e3' && has(after, 'd4', 'w'))
      return `The e3 pawn supports d4, giving the London center a firmer base${has(after, 'f1', 'w', 'b') ? ' while opening the f1 bishop’s diagonal' : ''}.`;
    if (piece === 'n' && from === 'b1' && to === 'd2')
      return 'The queen’s knight develops to d2 and controls e4, adding a piece that can support a later central advance.';
  }
  if (kind === 'sicilian' && color === 'b' && piece === 'p') {
    if (to === 'c5')
      return 'The c5 pawn contests d4 from the flank, challenging White’s central expansion without copying e4.';
    if (to === 'd6')
      return 'The d6 pawn controls e5 and c5, giving Black a flexible central base before deciding how to develop.';
  }
  if (kind === 'caro' && color === 'b') {
    if (piece === 'p' && to === 'c6' && has(after, 'd7', 'b'))
      return 'The c6 pawn controls d5, preparing a supported central challenge with the d-pawn.';
    if (piece === 'b' && from === 'c8' && has(before, 'e7', 'b'))
      return 'Develop the light-squared bishop before …e6 would close its original diagonal.';
  }
  if (kind === 'french' && color === 'b' && from === 'e7' && to === 'e6')
    return has(after, 'd5', 'b')
      ? 'The e6 pawn supports d5 and establishes Black’s central pawn chain.'
      : has(after, 'd7', 'b')
        ? 'The e6 pawn controls d5, preparing a supported d-pawn advance into the center.'
        : 'The e6 pawn controls d5 and f5, changing Black’s influence in the center.';
  if (kind === 'italian' && piece === 'b' && color === 'w' && to === 'c4')
    return attacks(after, to, 'f7', color)
      ? `Place the bishop actively toward f7${from === 'f1' ? ' while clearing f1 for possible kingside castling' : ''}.`
      : 'Develop the bishop to an active diagonal; the current blockers determine how far its influence reaches.';
  if ((kind === 'queens' || kind === 'french' || kind === 'caro') && piece === 'p') {
    if (to === 'c4' && color === 'w' && has(after, 'd5', 'b'))
      return 'The pawn on c4 challenges Black’s d5 pawn, asking how Black will maintain the center.';
    if (to === 'c5' && color === 'b' && has(after, 'd4', 'w'))
      return 'The pawn on c5 attacks d4, challenging the base of White’s center instead of letting it expand freely.';
    if (color === 'b' && (to === 'e6' || to === 'c6') && has(after, 'd5', 'b'))
      return `The ${to} pawn supports d5, helping Black maintain the central foothold.`;
  }
}

function authoredNote(note: string) {
  const clean = note.trim();
  if (
    clean.length < 12 ||
    /Follow the arrow and remember|Notice which piece or pawn now controls|Remember the promotion choice|castles, bringing the king away from the center and connecting the rook/.test(
      clean,
    )
  )
    return undefined;
  return clean;
}

/** ply is the zero-based index of the move being explained, for either color. */
export function explainOpeningMove(
  courseName: string,
  line: TeachingLine,
  ply: number,
): MoveExplanation {
  const entry = line.moves[ply];
  if (!entry)
    return {
      title: 'Variation complete',
      summary: 'Review the final position and the plans for both sides.',
      ideas: [],
    };
  const before = new Chess(entry.before);
  const after = new Chess(entry.before);
  const move = after.move(entry.uci);
  const side = colorName(move.color);
  const enemy = colorName(opposite(move.color));
  const facts: string[] = [];
  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    const rook = `${move.isKingsideCastle() ? 'f' : 'd'}${move.color === 'w' ? '1' : '8'}`;
    facts.push(
      `Castling puts the king on ${move.to} and brings the rook to ${rook}, nearer the central files.`,
    );
  }
  if (after.isCheckmate())
    facts.push('This move delivers checkmate: the king is in check and there is no legal reply.');
  else if (after.isCheck())
    facts.push(`${enemy} must answer the check before carrying on with development.`);
  if (move.captured)
    facts.push(
      `${side} captures ${enemy}’s ${names[move.captured]} ${move.isEnPassant() ? 'en passant, landing' : ''} on ${move.to}.`.replace(
        /\s+/g,
        ' ',
      ),
    );
  if (move.promotion)
    facts.push(
      `Promoting to a ${names[move.promotion]} changes the material and the piece’s movement from ${move.to}.`,
    );
  const newTargets = SQUARES.filter((square) => {
    const target = after.get(square);
    return (
      target &&
      target.color !== move.color &&
      target.type !== 'k' &&
      attacks(after, move.to, square, move.color) &&
      !attacks(before, move.from, square, move.color)
    );
  }).sort((a, b) => 'qrbnp'.indexOf(after.get(a)!.type) - 'qrbnp'.indexOf(after.get(b)!.type));
  if (newTargets.length) {
    const target = newTargets[0];
    facts.push(
      `From ${move.to}, the ${names[move.promotion || move.piece]} now attacks ${enemy}’s ${names[after.get(target)!.type]} on ${target}; check its defenders before considering an exchange.`,
    );
  }
  const supported = center.filter(
    (square) =>
      has(after, square, move.color) &&
      attacks(after, move.to, square, move.color) &&
      !attacks(before, move.from, square, move.color),
  );
  if (supported.length)
    facts.push(
      `The ${names[move.piece]} adds support to the central pawn${supported.length > 1 ? 's' : ''} on ${supported.join(' and ')}.`,
    );
  const newCenter = center.filter(
    (square) =>
      attacks(after, move.to, square, move.color) &&
      !attacks(before, move.from, square, move.color),
  );
  if (newCenter.length)
    facts.push(
      `From ${move.to}, the ${names[move.promotion || move.piece]} gains control of ${newCenter.join(' and ')} in the center.`,
    );
  if (move.piece === 'p' && !newCenter.length) {
    const controlled = SQUARES.filter((square) => attacks(after, move.to, square, move.color));
    if (controlled.length)
      facts.push(
        `The pawn now controls ${controlled.join(' and ')}; ${enemy} must account for this pawn when placing pieces on those squares.`,
      );
  }
  if (move.piece === 'r') {
    const file = move.to[0];
    const ownPawn = after
      .findPiece({ type: 'p', color: move.color })
      .some((square) => square[0] === file);
    const enemyPawn = after
      .findPiece({ type: 'p', color: opposite(move.color) })
      .some((square) => square[0] === file);
    if (!ownPawn)
      facts.push(
        `The rook occupies the ${enemyPawn ? 'semi-open' : 'open'} ${file}-file, where no friendly pawn blocks its longer-term activity.`,
      );
  }
  if (
    before.isAttacked(move.from, opposite(move.color)) &&
    !after.isAttacked(move.to, opposite(move.color))
  )
    facts.push(
      `The ${names[move.promotion || move.piece]} leaves an attacked square for ${move.to}, which ${enemy} does not currently attack.`,
    );
  if (move.piece === 'p') {
    for (const bishop of after.findPiece({ type: 'b', color: move.color })) {
      const opened = [move.from, ...SQUARES].find(
        (square) =>
          !after.get(square) &&
          attacks(after, bishop, square, move.color) &&
          (!attacks(before, bishop, square, move.color) ||
            before.get(square)?.color === move.color),
      );
      if (opened) {
        facts.push(
          `The pawn move opens the ${bishop} bishop’s diagonal through ${opened}, giving it more room to develop or operate.`,
        );
        break;
      }
    }
  }
  const homeRank = move.color === 'w' ? '1' : '8';
  if (
    (move.piece === 'n' || move.piece === 'b') &&
    move.from[1] === homeRank &&
    move.to[1] !== homeRank
  )
    facts.push(
      `Developing the ${names[move.piece]} from the back rank brings another piece into play.`,
    );
  if (before.isCheck() && !after.isCheckmate())
    facts.push(`${side} answers the check with a legal move, allowing the game to continue.`);
  if (!facts.length) {
    facts.push(
      move.piece === 'p'
        ? 'This pawn move changes the structure permanently; compare the squares it now controls with the squares it leaves behind.'
        : `Repositioning the ${names[move.piece]} changes its role. Before continuing, compare its new activity with the pieces and pawns it still needs to defend.`,
    );
  }
  const theme = moveTheme(family(courseName, line), before, after, move);
  const summary = authoredNote(entry.note) || theme || facts[0];
  return {
    title: `${side}: ${move.san}`,
    summary,
    ideas: [...new Set([...(theme && theme !== summary ? [theme] : []), ...facts])]
      .filter((idea) => idea !== summary)
      .slice(0, 3),
  };
}

/** Plans describe conditional ideas, never a forced or engine-ranked next move. */
export function openingPlans(courseName: string, line: TeachingLine, side: Color): OpeningPlans {
  const board = new Chess(line.rootFen);
  for (const move of line.moves) board.move(move.uci);
  const kind = family(courseName, line);
  const ideas: string[] = [];
  const own = (square: Square, piece: PieceSymbol = 'p') => has(board, square, side, piece);
  const add = (condition: boolean, idea: string) => {
    if (condition) ideas.push(idea);
  };
  if (board.isGameOver())
    return {
      title: `${colorName(side)}’s final position`,
      ideas: [
        board.isCheckmate()
          ? 'The line ends in checkmate; there is no middlegame continuation.'
          : 'The line ends in a drawn position; there is no middlegame continuation.',
        'Review the earlier central exchanges and development choices that led here.',
        'Replay the line from the other side to understand the opponent’s decisions.',
      ],
    };
  if (board.isCheck() && board.turn() === side)
    ideas.push(
      'First answer the check with a legal reply; longer-term plans must wait until the king is out of check.',
    );
  if (kind === 'london') {
    if (side === 'w') {
      add(
        own('e3'),
        'Prepare an e4 pawn break only after enough pieces support it and the king is ready for an open center.',
      );
      add(
        own('d4'),
        'Keep the d4 pawn supported when Black challenges it; decide whether an exchange or maintaining the center helps your pieces.',
      );
      add(
        own('f4', 'b') || own('g3', 'b'),
        'Keep the active dark-squared bishop useful; compare an exchange with a retreat if Black attacks it.',
      );
    } else {
      add(
        (own('c7') || own('c6')) && has(board, 'd4', 'w'),
        'Consider preparing …c5 to challenge d4, checking development and the consequences of central exchanges first.',
      );
      add(
        own('c5') && has(board, 'd4', 'w'),
        'Use the pressure from c5 against d4 to decide whether to exchange centrally or keep the tension.',
      );
      add(
        own('d5'),
        'Keep d5 adequately supported while developing; White may prepare e4 to challenge it.',
      );
    }
  } else if (kind === 'sicilian') {
    if (side === 'b') {
      const noCPawn = !board
        .findPiece({ type: 'p', color: side })
        .some((square) => square[0] === 'c');
      const whiteCPawn = board
        .findPiece({ type: 'p', color: 'w' })
        .some((square) => square[0] === 'c');
      add(
        noCPawn && whiteCPawn && board.findPiece({ type: 'r', color: side }).length > 0,
        'Look for useful rook activity on the semi-open c-file once development makes it possible.',
      );
      add(
        own('d6') || own('d7'),
        'Prepare a possible …d5 break by comparing attackers and defenders in the center; do not open it before the pieces are ready.',
      );
      add(
        own('c5'),
        'Keep the c5 pawn’s pressure on d4 in mind when choosing how to develop and when to exchange.',
      );
    } else {
      add(
        own('e4'),
        'Support the e4 pawn and use the space it provides to develop pieces before launching a flank attack.',
      );
      add(
        own('d4', 'n'),
        'Keep the centralized d4 knight active, but watch for pawn advances that could drive it away.',
      );
      ideas.push(
        'Choose king placement according to Black’s development; an attack needs supporting pieces and a secure center.',
      );
    }
  } else if (kind === 'french' || kind === 'caro') {
    if (side === 'w') {
      add(
        own('e5') && own('d4'),
        'The e5 pawn gives space, but d4 is a key base: prepare to meet pressure against d4 before expanding on a wing.',
      );
      add(
        own('e4'),
        'Maintain enough support for e4 and watch for Black’s d-pawn challenge before spending tempi on a flank.',
      );
    } else {
      add(
        (own('c7') || own('c6')) && has(board, 'd4', 'w'),
        'Consider preparing …c5 against d4; assess which pawn exchanges improve your bishops and central activity.',
      );
      add(
        own('c5') && has(board, 'd4', 'w'),
        'Use the c5 pawn’s pressure against d4, coordinating pieces before choosing a central exchange.',
      );
      add(
        kind === 'french' && own('e6') && own('d5') && own('c8', 'b'),
        'Find a useful role for the c8 bishop, whose diagonal is restricted by e6; central pawn exchanges can change its prospects.',
      );
      add(
        kind === 'caro' &&
          board
            .findPiece({ type: 'b', color: 'b' })
            .some(
              (square) => square !== 'c8' && (square.charCodeAt(0) + Number(square[1])) % 2 === 1,
            ),
        'Keep the light-squared bishop active while completing development; choose its retreats or exchanges according to White’s pawn structure.',
      );
    }
  } else if (kind === 'italian') {
    add(
      side === 'w' && (own('d3') || own('d2')),
      'Prepare d4 only when the center is sufficiently supported; until then, improve the pieces behind the pawns.',
    );
    add(
      side === 'b' && (own('d6') || own('d7')),
      'Look for a well-supported …d5 break once development and king safety permit opening the center.',
    );
    add(
      own(side === 'w' ? 'c4' : 'c5', 'b'),
      'Keep the active bishop’s diagonal useful and consider a retreat when a pawn advance gains time against it.',
    );
  } else if (kind === 'queens') {
    if (side === 'w') {
      add(
        own('d4'),
        'Maintain support for d4 while developing; Black’s central breaks may change which file or diagonal is useful.',
      );
      add(
        own('e3'),
        'Consider preparing e4 when the pieces can support a broader center and the king is ready for exchanges.',
      );
      add(
        own('c4') && has(board, 'd5', 'b'),
        'Choose whether to maintain the c4–d5 tension or exchange according to the resulting pawn structure.',
      );
    } else {
      add(
        own('d5'),
        'Keep d5 supported and decide when a central exchange helps free your pieces.',
      );
      add(
        (own('c7') || own('c6')) && has(board, 'd4', 'w'),
        'Prepare a possible …c5 challenge to d4 rather than allowing White a free hand in the center.',
      );
      add(
        own('c4'),
        'Do not spend development time defending the extra c4 pawn automatically; compare keeping it with returning it for active pieces.',
      );
    }
  }
  const home = side === 'w' ? '1' : '8';
  const undeveloped = ([`b${home}`, `g${home}`, `c${home}`, `f${home}`] as Square[]).filter(
    (square) => own(square, square[0] === 'b' || square[0] === 'g' ? 'n' : 'b'),
  );
  add(
    undeveloped.length > 0,
    `Bring the remaining back-rank minor pieces on ${undeveloped.join(', ')} into play on useful squares before committing to an attack.`,
  );
  const rights = board.fen().split(' ')[2];
  add(
    own(`e${home}` as Square, 'k') && (side === 'w' ? /[KQ]/ : /[kq]/).test(rights),
    'Prepare castling when legal, checking the opponent’s threats before opening the center.',
  );
  if (ideas.length < 4)
    ideas.push(
      'Before a pawn break or exchange, compare the resulting open files and bishop diagonals for both sides.',
    );
  if (ideas.length < 3)
    ideas.push(
      'Improve the least active piece while keeping the king and any attacked pawns adequately defended.',
    );
  if (ideas.length < 3)
    ideas.push(
      'Check the opponent’s checks, captures, and threats before carrying out your next plan.',
    );
  return { title: `${colorName(side)}’s middlegame plans`, ideas: [...new Set(ideas)].slice(0, 4) };
}
