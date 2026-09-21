import { assetUrl } from '../app/asset-url';
import { ENGINE_BUILD_ID } from '../engine/build';
import type { EngineFlavor } from '../engine/types';
const documentController =
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker.controller
    : undefined;
interface Asset {
  url: string;
  size: number;
  sha256: string;
  flavor: EngineFlavor;
}
interface Manifest {
  version: string;
  buildId: string;
  assets: Asset[];
}
async function manifest(): Promise<Manifest> {
  const r = await fetch(assetUrl(`engine/manifest-${ENGINE_BUILD_ID}.json`));
  if (!r.ok) throw Error('Engine manifest is unavailable.');
  return r.json();
}
export async function engineSize(flavor: EngineFlavor) {
  const m = await manifest();
  return m.assets.filter((a) => a.flavor === flavor).reduce((n, a) => n + a.size, 0);
}
export async function isAssetSetReady(flavor: EngineFlavor) {
  try {
    const m = await manifest();
    const cache = await caches.open(`engine-${m.buildId}-${flavor}`);
    for (const a of m.assets.filter((a) => a.flavor === flavor))
      if (!(await cache.match(`${assetUrl(a.url)}?build=${m.buildId}`))) return false;
    return Boolean(await cache.match(assetUrl('offline-ready')));
  } catch {
    return false;
  }
}
export async function downloadAssetSet(
  flavor: EngineFlavor,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
) {
  const m = await manifest(),
    assets = m.assets.filter((a) => a.flavor === flavor),
    total = assets.reduce((n, a) => n + a.size, 0);
  const name = `engine-${m.buildId}-${flavor}`,
    staging = `${name}-${crypto.randomUUID()}-staging`;
  await caches.delete(staging);
  const cache = await caches.open(staging);
  let loaded = 0;
  let lastProgress = 0;
  onProgress(0, total);
  try {
    for (const asset of assets) {
      const r = await fetch(`${assetUrl(asset.url)}?build=${m.buildId}`, {
        signal,
        cache: 'no-store',
      });
      if (!r.ok || !r.body) throw Error('Engine download failed. Please retry.');
      const reader = r.body.getReader(),
        chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (performance.now() - lastProgress > 80 || loaded === total) {
          onProgress(loaded, total);
          lastProgress = performance.now();
        }
      }
      const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (digest !== asset.sha256 || bytes.length !== asset.size)
        throw Error('Engine verification failed. Please retry the download.');
      await cache.put(
        `${assetUrl(asset.url)}?build=${m.buildId}`,
        new Response(bytes, {
          headers: {
            'Content-Type': asset.url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
          },
        }),
      );
    }
    const committed = await caches.open(name);
    for (const a of assets)
      await committed.put(
        `${assetUrl(a.url)}?build=${m.buildId}`,
        (await cache.match(`${assetUrl(a.url)}?build=${m.buildId}`))!,
      );
    await committed.put(
      assetUrl(`engine/manifest-${ENGINE_BUILD_ID}.json`),
      new Response(JSON.stringify(m), { headers: { 'Content-Type': 'application/json' } }),
    );
    await committed.put(assetUrl('offline-ready'), new Response('verified'));
    await navigator.storage?.persist?.();
  } finally {
    await caches.delete(staging);
  }
}
export function registerOffline(onUpdate: () => void) {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  void navigator.serviceWorker
    .register(assetUrl('sw.js'), { scope: import.meta.env.BASE_URL, updateViaCache: 'none' })
    .then((reg) => {
      if (reg.waiting) onUpdate();
      reg.addEventListener('updatefound', () => {
        reg.installing?.addEventListener('statechange', () => {
          if (reg.waiting && navigator.serviceWorker.controller) onUpdate();
        });
      });
    })
    .catch(() => {});
}
function deadline<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(message)), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
function installed(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => finish(Error('The update is still downloading. Please try again.')),
      30000,
    );
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', changed);
      if (error) reject(error);
      else resolve();
    };
    const changed = () => {
      if (['installed', 'activating', 'activated'].includes(worker.state)) finish();
      else if (worker.state === 'redundant')
        finish(Error('The update could not finish downloading. Please retry.'));
    };
    worker.addEventListener('statechange', changed);
    changed();
  });
}
export async function activateUpdate() {
  const container = navigator.serviceWorker;
  const reg = await container.getRegistration(assetUrl(''));
  if (!reg)
    throw Error('No app update is ready. Reload the page and try again. Your game is saved.');
  if (
    !reg.waiting &&
    container.controller &&
    documentController !== undefined &&
    container.controller !== documentController
  ) {
    // Another tab activated the new cached shell; no network check is needed.
    location.reload();
    return;
  }
  if (!reg.waiting) {
    await deadline(
      reg.update(),
      30000,
      'Could not check for an update. Check your connection and retry.',
    );
    if (reg.installing) await installed(reg.installing);
  }
  const waiting = reg.waiting;
  if (!waiting) {
    // Another tab may already have activated it while this banner was visible.
    if (reg.active) {
      location.reload();
      return;
    }
    throw Error('No app update is ready yet. Please retry.');
  }
  await new Promise<void>((resolve, reject) => {
    const previous = container.controller;
    const timer = setTimeout(
      () => finish(Error('The update did not activate. Your game is saved; please retry.')),
      15000,
    );
    const finish = (error?: Error) => {
      clearTimeout(timer);
      container.removeEventListener('controllerchange', changed);
      if (error) reject(error);
      else {
        location.reload();
        resolve();
      }
    };
    const changed = () => {
      if (container.controller && container.controller !== previous) finish();
    };
    container.addEventListener('controllerchange', changed);
    try {
      waiting.postMessage('ACTIVATE');
    } catch (error) {
      finish(error instanceof Error ? error : Error(String(error)));
    }
  });
}
