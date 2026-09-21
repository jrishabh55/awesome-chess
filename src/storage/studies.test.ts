import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { parsePgn, playMove } from '../chess/tree';
import { saveStudy, loadStudy, exportBackup, parseBackup } from './studies';
it('restores selected variation and ignores stale saves', async () => {
  const [s] = parsePgn('1. e4 e5 *');
  const a = playMove(s, s.rootId, 'd2d4');
  await saveStudy(a);
  await saveStudy(s);
  expect((await loadStudy(s.id))?.selectedId).toBe(a.selectedId);
});
it('backup preserves variations and rejects corrupt paths', () => {
  const [s] = parsePgn('1. e4 (1. d4) *');
  expect(parseBackup(exportBackup([s]))[0]).toEqual(s);
  const bad = structuredClone(s);
  bad.nodes[bad.mainline[0]].uci = 'e2e8';
  expect(() => parseBackup(JSON.stringify({ version: 1, studies: [bad] }))).toThrow();
});
it('rejects incomplete backup metadata before replacing a study', () => {
  const [s] = parsePgn('1. e4 *');
  const bad: any = structuredClone(s);
  delete bad.headers;
  delete bad.selectedChildren;
  expect(() => parseBackup(JSON.stringify({ version: 1, studies: [bad] }))).toThrow();
});
it('restores every backup study and preserves conflicting local versions', async () => {
  const { restoreStudies, listStudies } = await import('./studies');
  const [a] = parsePgn('[White "Saved"]\n1. e4 *');
  a.revision = 10;
  await saveStudy(a);
  const older = structuredClone(a);
  older.revision = 0;
  const [b] = parsePgn('[White "Second"]\n1. d4 *');
  const restored = await restoreStudies([older, b]);
  expect(restored).toHaveLength(2);
  expect(restored[0].id).not.toBe(a.id);
  expect((await loadStudy(a.id))?.revision).toBe(10);
  expect((await listStudies()).some((s) => s.id === restored[1].id)).toBe(true);
});
