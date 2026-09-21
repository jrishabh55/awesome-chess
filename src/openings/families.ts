import type { CatalogOpening } from './catalog';

export interface OpeningFamily {
  id: string;
  name: string;
  openings: CatalogOpening[];
}

/** The bundled database separates canonical families from variation names with ':'. */
export function familyName(opening: CatalogOpening): string {
  return opening.name.split(':', 1)[0].trim();
}
const compare = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'variant' });

export function openingFamilies(entries: CatalogOpening[]): OpeningFamily[] {
  const families = new Map<string, OpeningFamily>();
  const seen = new Set<string>();
  // Sort first so even duplicate IDs are handled deterministically.
  const sorted = [...entries].sort(
    (a, b) =>
      compare(a.eco, b.eco) ||
      compare(a.name, b.name) ||
      compare(a.pgn, b.pgn) ||
      compare(a.id, b.id),
  );
  for (const opening of sorted) {
    if (seen.has(opening.id)) continue;
    seen.add(opening.id);
    const name = familyName(opening);
    let family = families.get(name);
    if (!family) {
      family = { id: `family:${name}`, name, openings: [] };
      families.set(name, family);
    }
    family.openings.push(opening);
  }
  return [...families.values()].sort((a, b) => compare(a.name, b.name));
}
