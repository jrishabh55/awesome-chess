import { Chess, DEFAULT_POSITION } from 'chess.js';
import { parsePgn } from '../chess/tree';
import type { Color, Mark } from '../chess/types';
import { MAX_PROGRESS_CHARS, SESSION_RESERVE_CHARS, OVERSIZED_COURSE_MESSAGE } from './limits';

export interface TeachingMove {
  uci: string;
  san: string;
  before: string;
  after: string;
  note: string;
  marks: Mark[];
}
export interface TeachingLine {
  name: string;
  rootFen: string;
  moves: TeachingMove[];
}
export interface OpeningPack {
  id: string;
  name: string;
  description: string;
  side: Color;
  lines: TeachingLine[];
}
const pieceNames: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
function fallbackNote(move: ReturnType<Chess['move']>) {
  const side = move.color === 'w' ? 'White' : 'Black';
  if (move.isKingsideCastle() || move.isQueensideCastle())
    return `${side} castles, bringing the king away from the center and connecting the rook to the game.`;
  if (move.promotion)
    return `${side} promotes the pawn to a ${pieceNames[move.promotion]}. Remember the promotion choice as part of this line.`;
  if (move.captured)
    return `${side} captures on ${move.to}. Notice which piece or pawn now controls that square.`;
  return `${side} moves the ${pieceNames[move.piece]} from ${move.from} to ${move.to}. Follow the arrow and remember this position in the line.`;
}
function line(name: string, sans: string, notes: string[]): TeachingLine {
  const chess = new Chess();
  const moves = sans.split(' ').map((san, index) => {
    const before = chess.fen();
    const move = chess.move(san);
    return {
      uci: move.from + move.to + (move.promotion || ''),
      san: move.san,
      before,
      after: chess.fen(),
      note: notes[index] || fallbackNote(move),
      marks: [],
    };
  });
  return { name, rootFen: DEFAULT_POSITION, moves };
}
const italianStart = [
  'Claim central space and open paths for the queen and light-squared bishop.',
  'Black matches your central space and opens the dark-squared bishop.',
  'Develop the knight toward the center while attacking the e5 pawn.',
  'Black develops a knight and defends the e5 pawn.',
  'Aim the bishop toward f7 and prepare to castle. This is the Italian setup.',
];
const queensStart = [
  'Claim central space with a pawn that the queen already supports.',
  'Black establishes a central pawn opposite yours.',
  'Challenge the d5 pawn with a wing pawn, aiming to gain more central influence.',
];
const caroStart = [
  'White occupies the center and opens lines for development.',
  'Prepare the d5 pawn break. The c6 pawn will support your challenge to the center.',
  'White builds a broad pawn center with d4 and e4.',
  'Challenge e4 immediately with the pawn supported by c6.',
];
export const builtInPacks: OpeningPack[] = [
  {
    id: 'italian-v1',
    name: 'Italian Game',
    description: 'Develop naturally, castle early, and learn three central plans.',
    side: 'w',
    lines: [
      line('Quiet development', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O', [
        ...italianStart,
        'Black develops actively and looks at f2.',
        'Support a later d4 advance and give the bishop a retreat on c2.',
        'Black develops with pressure on your e4 pawn.',
        'Support e4 and open the dark-squared bishop without forcing the center.',
        'Black supports e5 and frees the light-squared bishop.',
        'Castle before opening the center. Your rook joins the game.',
        'Black also secures the king. Continue with development before pawn breaks.',
      ]),
      line('Central expansion', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Nc3', [
        ...italianStart,
        'Black develops the bishop outside the pawn chain.',
        'Prepare d4 with a supporting pawn so you can recapture centrally.',
        'Black attacks e4, making the central decision immediate.',
        'Challenge the center now. This line chooses activity over the quiet d3 setup.',
        'Black exchanges in the center and opens lines.',
        'Recapture toward the center, keeping pawns on d4 and e4.',
        'Black checks while developing, so you must answer the check.',
        'Block the check with a developing move. Notice the pinned knight on c3.',
      ]),
      line('Two Knights response', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5 O-O d6 c3 O-O', [
        ...italianStart,
        'Black develops a knight first and immediately attacks e4.',
        'Defend e4 and free the dark-squared bishop before continuing development.',
        'Black brings the bishop into play toward f2.',
        'Put the king safely behind its pawns.',
        'Black reinforces the center and opens the light-squared bishop.',
        'Prepare a future d4 advance while keeping the center stable.',
        'Both kings are castled. The next phase is completing development.',
      ]),
    ],
  },
  {
    id: 'queens-gambit-v1',
    name: 'Queen’s Gambit',
    description: 'Meet three responses to 1.d4 with a clear central plan.',
    side: 'w',
    lines: [
      line('Declined: classical setup', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3', [
        ...queensStart,
        'Black reinforces d5 with e6, temporarily closing the light-squared bishop.',
        'Develop and add pressure to d5.',
        'Black develops and protects d5 again.',
        'Develop the bishop before playing e3, with pressure on the f6 knight.',
        'Black prepares to castle and removes the pin on the queen.',
        'Support d4 and release the light-squared bishop.',
        'Black secures the king.',
        'Develop the second knight and prepare to castle.',
      ]),
      line('Accepted: rebuild the center', 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O', [
        ...queensStart,
        'Black accepts the gambit and temporarily gives up the d5 foothold.',
        'Develop first and control e5 before recovering the pawn.',
        'Black develops toward the center.',
        'Open your bishop’s route to c4 and support the center.',
        'Black prepares to develop the bishop.',
        'Recover the pawn with development. Your bishop now points toward the kingside.',
        'Black challenges d4 from the flank.',
        'Castle while development is ahead of pawn grabbing.',
      ]),
      line('Slav: calm development', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 e3 b5 a4', [
        ...queensStart,
        'Black supports d5 with c6, leaving the light-squared bishop free.',
        'Develop and reinforce your central control.',
        'Black develops naturally.',
        'Add another piece to the center.',
        'Black takes on c4 and may try to hold the pawn.',
        'Prepare to recover c4 with the bishop.',
        'Black protects the extra c4 pawn with b5.',
        'Challenge the b5 support pawn instead of letting Black hold the queenside untouched.',
      ]),
    ],
  },
  {
    id: 'caro-kann-v1',
    name: 'Caro-Kann Defense',
    description: 'Play Black against the advance, exchange, and classical setups.',
    side: 'b',
    lines: [
      line('Advance: bishop outside the chain', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5', [
        ...caroStart,
        'White closes the center and gains space.',
        'Develop the light-squared bishop before e6 closes its diagonal.',
        'White develops and supports the central pawns.',
        'Support d5 and open the dark-squared bishop.',
        'White prepares to castle.',
        'Challenge the d4 pawn at the base of White’s central chain.',
      ]),
      line('Exchange: balanced development', 'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6', [
        ...caroStart,
        'White exchanges on d5 and opens the position.',
        'Recapture with the c-pawn, maintaining a pawn in the center.',
        'White develops toward your kingside.',
        'Develop the knight and add pressure to d4.',
        'White supports d4 with the c-pawn.',
        'Develop toward the center and prepare your remaining pieces for castling.',
      ]),
      line('Classical: develop with tempo', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6', [
        ...caroStart,
        'White develops while defending e4.',
        'Exchange the e4 pawn to clarify the center.',
        'White recaptures with the knight.',
        'Develop your bishop while attacking the knight on e4.',
        'White saves the knight and attacks your bishop.',
        'Retreat the bishop to g6, keeping it outside the future e6 pawn chain.',
      ]),
    ],
  },
];

export function importPack(text: string, side: Color, name: string): OpeningPack {
  if (text.length > 200_000) throw Error('Use a PGN smaller than 200 KB.');
  const studies = parsePgn(text);
  const lines: TeachingLine[] = [];
  for (const study of studies) {
    const visit = (id: string, moves: TeachingMove[]) => {
      if (moves.length > 120) throw Error('Keep each opening variation within 120 half-moves.');
      const node = study.nodes[id];
      if (!node.children.length && moves.length) {
        if (lines.length >= 40) throw Error('Import up to 40 variations at a time.');
        if (!moves.some((m) => new Chess(m.before).turn() === side))
          throw Error(`Every line needs a move for ${side === 'w' ? 'White' : 'Black'}.`);
        lines.push({
          name: `Variation ${lines.length + 1} · ${moves
            .slice(-3)
            .map((m) => m.san)
            .join(' ')}`,
          rootFen: study.rootFen,
          moves,
        });
      }
      for (const childId of node.children) {
        const child = study.nodes[childId];
        const chess = new Chess(node.fen);
        const move = chess.move(child.uci!);
        const note = child.comments
          .join(' ')
          .replace(/\[%[^\]]*\]/g, '')
          .trim();
        visit(childId, [
          ...moves,
          {
            uci: child.uci!,
            san: child.san!,
            before: node.fen,
            after: child.fen,
            note: note || fallbackNote(move),
            marks: child.marks,
          },
        ]);
      }
    };
    visit(study.rootId, []);
  }
  if (!lines.length) throw Error('The PGN needs at least one variation with moves.');
  const pack: OpeningPack = {
    id: `custom-${crypto.randomUUID()}`,
    name: name.trim().slice(0, 80) || 'My repertoire',
    description: 'Your PGN variations and comments, stored on this device.',
    side,
    lines,
  };
  if (JSON.stringify(pack).length > MAX_PROGRESS_CHARS - SESSION_RESERVE_CHARS)
    throw Error(OVERSIZED_COURSE_MESSAGE);
  return pack;
}
