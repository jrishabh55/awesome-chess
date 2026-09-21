import { assetUrl } from '../app/asset-url';
import { downloadAssetSet, isAssetSetReady } from '../offline/download';
import { ENGINE_BUILD_ID } from './build';
import type { EngineFlavor } from './types';
export interface EngineLoadState {
  phase: 'checking' | 'downloading' | 'starting' | 'ready' | 'error';
  loaded: number;
  total: number;
  error?: string;
}
export async function prepareWorker(
  flavor: EngineFlavor,
  signal: AbortSignal,
  progress: (state: EngineLoadState) => void,
): Promise<Worker> {
  const urls: string[] = [];
  const check = () => {
    if (signal.aborted) throw new DOMException('Engine loading canceled', 'AbortError');
  };
  try {
    progress({ phase: 'checking', loaded: 0, total: 0 });
    if (!(await isAssetSetReady(flavor)))
      await downloadAssetSet(flavor, signal, (loaded, total) =>
        progress({ phase: 'downloading', loaded, total }),
      );
    check();
    progress({ phase: 'starting', loaded: 0, total: 0 });
    const cache = await caches.open(`engine-${ENGINE_BUILD_ID}-${flavor}`);
    const name = `engine/stockfish-19-${flavor === 'full' ? 'single' : 'lite-single'}`;
    for (const ext of ['js', 'wasm']) {
      const response = await cache.match(`${assetUrl(`${name}.${ext}`)}?build=${ENGINE_BUILD_ID}`);
      if (!response) throw Error('Engine download is incomplete. Please retry.');
      urls.push(URL.createObjectURL(await response.blob()));
    }
    check();
    const worker = new Worker(`${urls[0]}#${encodeURIComponent(urls[1])}`);
    const terminate = worker.terminate.bind(worker);
    worker.terminate = () => {
      terminate();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
    return worker;
  } catch (error) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    if (!signal.aborted)
      progress({
        phase: 'error',
        loaded: 0,
        total: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    throw error;
  }
}
