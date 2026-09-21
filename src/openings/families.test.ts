import { expect, it } from 'vitest';
import type { CatalogOpening } from './catalog';
import { familyName, openingFamilies } from './families';
const entry = (id: string, name: string, eco = 'B20'): CatalogOpening => ({
  id,
  name,
  eco,
  pgn: '1. e4 c5',
});
it('groups canonical family prefixes without flattening variation names', () => {
  const dragon = entry('dragon', 'Sicilian Defense: Dragon Variation, Classical Variation', 'B70');
  const london = entry('london', "Queen's Pawn Game: Accelerated London System", 'D00');
  const indian = entry('indian', 'Indian Defense: London System', 'A46');
  const base = entry('base', 'Sicilian Defense');
  expect(familyName(dragon)).toBe('Sicilian Defense');
  expect(familyName(base)).toBe('Sicilian Defense');
  const groups = openingFamilies([dragon, london, base, indian]);
  expect(groups.map((group) => group.name)).toEqual([
    'Indian Defense',
    "Queen's Pawn Game",
    'Sicilian Defense',
  ]);
  expect(groups[2].openings.map((opening) => opening.name)).toEqual([base.name, dragon.name]);
  expect(openingFamilies([indian, base, london, dragon])).toEqual(groups);
  expect(new Set(groups.map((group) => group.id)).size).toBe(groups.length);
});
it('deduplicates database IDs and keeps deterministic ECO/name ordering', () => {
  const a = entry('a', 'Sicilian Defense: Z Variation', 'B20');
  const b = entry('b', 'Sicilian Defense: A Variation', 'B21');
  expect(openingFamilies([b, a, a])[0].openings.map((opening) => opening.id)).toEqual(['a', 'b']);
  expect(openingFamilies([])).toEqual([]);
});
