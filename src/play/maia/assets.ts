import { assetUrl } from '../../app/asset-url';
import type { EngineLoadState } from '../../engine/prepare-worker';
import { MAIA_BUILD_ID } from './build';

type Asset = { url: string; size: number; sha256: string };
type Manifest = { buildId: string; assets: Asset[] };
const cacheName = `maia-${MAIA_BUILD_ID}`;
const manifestUrl = assetUrl(`maia/manifest-${MAIA_BUILD_ID}.json`);
const required = [
  'maia/model.onnx',
  'maia/ort-wasm-simd-threaded.mjs',
  'maia/ort-wasm-simd-threaded.wasm',
];
const assetKey = (asset: Asset) => `${assetUrl(asset.url)}?build=${MAIA_BUILD_ID}`;
const check = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException('Maia loading canceled', 'AbortError');
};

async function manifest(signal?: AbortSignal): Promise<Manifest> {
  const response = await fetch(manifestUrl, { signal });
  if (!response.ok)
    throw Error('Maia assets are unavailable. Connect to download Maia, then retry.');
  const value = (await response.json()) as Manifest;
  if (
    value.buildId !== MAIA_BUILD_ID ||
    !Array.isArray(value.assets) ||
    value.assets.length !== required.length ||
    required.some(
      (url) =>
        !value.assets.some(
          (asset) =>
            asset.url === url &&
            Number.isSafeInteger(asset.size) &&
            asset.size > 0 &&
            /^[a-f0-9]{64}$/.test(asset.sha256),
        ),
    )
  )
    throw Error('Maia asset manifest is incomplete. Please retry.');
  return value;
}
export async function maiaAssetsReady(): Promise<boolean> {
  try {
    const m = await manifest();
    const cache = await caches.open(cacheName);
    if (!(await cache.match(assetUrl('offline-ready')))) return false;
    for (const asset of m.assets) if (!(await cache.match(assetKey(asset)))) return false;
    return true;
  } catch {
    return false;
  }
}

export async function downloadMaiaAssets(
  signal: AbortSignal,
  progress: (loaded: number, total: number) => void,
): Promise<void> {
  check(signal);
  const m = await manifest(signal);
  const stagingName = `${cacheName}-${crypto.randomUUID()}-staging`;
  const staging = await caches.open(stagingName);
  const total = m.assets.reduce((sum, asset) => sum + asset.size, 0);
  let loaded = 0,
    lastProgress = 0;
  progress(0, total);
  try {
    for (const asset of m.assets) {
      check(signal);
      const response = await fetch(assetKey(asset), { signal, cache: 'no-store' });
      if (!response.ok || !response.body)
        throw Error('Maia download failed. Connect to download Maia, then retry.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        check(signal);
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        loaded += value.length;
        chunks.push(value);
        if (size > asset.size) throw Error('Maia verification failed. Retry the download.');
        if (performance.now() - lastProgress > 80 || loaded === total) {
          progress(loaded, total);
          lastProgress = performance.now();
        }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      if (size !== asset.size || digest !== asset.sha256)
        throw Error('Maia verification failed. Retry the download.');
      check(signal);
      await staging.put(
        assetKey(asset),
        new Response(bytes, {
          headers: {
            'Content-Type': asset.url.endsWith('.wasm')
              ? 'application/wasm'
              : asset.url.endsWith('.mjs')
                ? 'text/javascript'
                : 'application/octet-stream',
          },
        }),
      );
    }
    check(signal);
    const committed = await caches.open(cacheName);
    for (const asset of m.assets) {
      check(signal);
      await committed.put(assetKey(asset), (await staging.match(assetKey(asset)))!);
    }
    await committed.put(
      manifestUrl,
      new Response(JSON.stringify(m), { headers: { 'Content-Type': 'application/json' } }),
    );
    check(signal);
    await committed.put(assetUrl('offline-ready'), new Response('verified'));
  } finally {
    await caches.delete(stagingName);
  }
}

export type MaiaInit = { type: 'init'; model: ArrayBuffer; mjsUrl: string; wasmUrl: string };
export type MaiaWorkerResources = { worker: Worker; init: MaiaInit };
export async function prepareMaiaWorker(
  signal: AbortSignal,
  progress: (state: EngineLoadState) => void,
): Promise<MaiaWorkerResources> {
  progress({ phase: 'checking', loaded: 0, total: 0 });
  if (!(await maiaAssetsReady()))
    await downloadMaiaAssets(signal, (loaded, total) =>
      progress({ phase: 'downloading', loaded, total }),
    );
  check(signal);
  progress({ phase: 'starting', loaded: 0, total: 0 });
  const cache = await caches.open(cacheName);
  const urls: string[] = [];
  try {
    const model = await cache.match(`${assetUrl(required[0])}?build=${MAIA_BUILD_ID}`);
    if (!model) throw Error('Maia download is incomplete. Please retry.');
    const buffer = await model.arrayBuffer();
    for (const path of required.slice(1)) {
      const response = await cache.match(`${assetUrl(path)}?build=${MAIA_BUILD_ID}`);
      if (!response) throw Error('Maia download is incomplete. Please retry.');
      urls.push(URL.createObjectURL(await response.blob()));
    }
    check(signal);
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const terminate = worker.terminate.bind(worker);
    worker.terminate = () => {
      terminate();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
    return { worker, init: { type: 'init', model: buffer, mjsUrl: urls[0], wasmUrl: urls[1] } };
  } catch (error) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  }
}
