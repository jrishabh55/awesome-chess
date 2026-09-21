import type { CatalogOpening } from '../openings/catalog';
import type { Color } from '../chess/types';
import { importPack, type OpeningPack } from './packs';
export function databasePack(opening: CatalogOpening, side: Color): OpeningPack {
  const pack = importPack(opening.pgn, side, `${opening.eco} · ${opening.name}`);
  pack.id = `database:${opening.eco}:${opening.name}:${side}`;
  pack.description =
    'A named opening line from the bundled database. Follow the move sequence, then practice your side.';
  pack.lines[0].name = opening.name;
  return pack;
}
