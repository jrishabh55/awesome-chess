import { assetUrl } from '../app/asset-url';
import { loadOpenings } from './lookup';
export interface CatalogOpening {
  id: string;
  eco: string;
  name: string;
  pgn: string;
}
export function parseOpeningCatalog(text: string): CatalogOpening[] {
  const rows = text.trim().split(/\r?\n/);
  if (rows.shift() !== 'eco\tname\tpgn') throw Error('Opening database format is unavailable.');
  if (!rows.length) throw Error('Opening database contains no lines.');
  return rows.map((row) => {
    const [eco, name, pgn] = row.split('\t');
    if (!/^[A-E]\d{2}$/.test(eco) || !name?.trim() || !pgn?.trim())
      throw Error('Opening database contains an incomplete line.');
    return { id: `${eco}:${name}:${pgn}`, eco, name, pgn };
  });
}
let catalogRequest: Promise<CatalogOpening[]> | null = null;
export function loadOpeningCatalog(): Promise<CatalogOpening[]> {
  if (!catalogRequest)
    catalogRequest = (async () => {
      await loadOpenings();
      const files = await Promise.all(
        ['a', 'b', 'c', 'd', 'e'].map(async (file) => {
          const response = await fetch(assetUrl(`data/${file}.tsv`));
          if (!response.ok)
            throw Error(
              'Opening database unavailable. Try again when the app has finished downloading.',
            );
          return parseOpeningCatalog(await response.text());
        }),
      );
      return [...new Map(files.flat().map((entry) => [entry.id, entry])).values()];
    })().catch((error) => {
      catalogRequest = null;
      throw error;
    });
  return catalogRequest;
}
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’ʼ]/g, '')
    .toLowerCase();
export function searchOpeningCatalog(
  entries: CatalogOpening[],
  query: string,
  requestedPage = 0,
  pageSize = 7,
) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matches = entries.filter((entry) =>
    words.every((word) => normalize(`${entry.eco} ${entry.name}`).includes(word)),
  );
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.max(0, Math.min(pages - 1, requestedPage));
  return {
    items: matches.slice(page * pageSize, (page + 1) * pageSize),
    total: matches.length,
    page,
    pages,
  };
}
