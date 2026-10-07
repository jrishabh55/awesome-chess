import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { downloadMaiaAssets, maiaAssetsReady } from './assets';
import { MAIA_BUILD_ID } from './build';

class MemoryCache {
  entries = new Map<string, Response>();
  async match(key: string) {
    return this.entries.get(key)?.clone();
  }
  async put(key: string, value: Response) {
    this.entries.set(key, value.clone());
  }
}
function setup(corrupt = false) {
  const caches = new Map<string, MemoryCache>();
  vi.stubGlobal('caches', {
    open: async (name: string) => {
      if (!caches.has(name)) caches.set(name, new MemoryCache());
      return caches.get(name);
    },
    delete: async (name: string) => caches.delete(name),
  });
  const bytes = new Uint8Array([1, 2, 3]);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const assets = ['model.onnx', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'].map(
    (name) => ({ url: `maia/${name}`, size: 3, sha256 }),
  );
  const manifest = { buildId: MAIA_BUILD_ID, assets };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          url.endsWith('.json')
            ? JSON.stringify(manifest)
            : corrupt
              ? new Uint8Array([4, 5, 6])
              : bytes,
        ),
    ),
  );
  return { caches, manifest };
}
afterEach(() => vi.unstubAllGlobals());
it('marks Maia ready only after every checksummed asset is committed', async () => {
  const { caches } = setup();
  expect(await maiaAssetsReady()).toBe(false);
  await downloadMaiaAssets(new AbortController().signal, () => {});
  expect(await maiaAssetsReady()).toBe(true);
  expect([...caches.keys()].some((name) => name.endsWith('-staging'))).toBe(false);
  caches.get(`maia-${MAIA_BUILD_ID}`)!.entries.delete(`/maia/model.onnx?build=${MAIA_BUILD_ID}`);
  expect(await maiaAssetsReady()).toBe(false);
});
it('rejects corrupt bytes and clears its incomplete staging cache', async () => {
  const { caches } = setup(true);
  await expect(downloadMaiaAssets(new AbortController().signal, () => {})).rejects.toThrow(
    /verification/i,
  );
  expect(await maiaAssetsReady()).toBe(false);
  expect([...caches.keys()].some((name) => name.endsWith('-staging'))).toBe(false);
});
it('rejects an incomplete manifest and an already canceled download', async () => {
  const { manifest } = setup();
  manifest.assets.pop();
  await expect(downloadMaiaAssets(new AbortController().signal, () => {})).rejects.toThrow(
    /manifest/i,
  );
  setup();
  const abort = new AbortController();
  abort.abort();
  await expect(downloadMaiaAssets(abort.signal, () => {})).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(await maiaAssetsReady()).toBe(false);
});
