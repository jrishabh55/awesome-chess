import * as ort from 'onnxruntime-web/wasm';
import type { MaiaInit } from './assets';

const scope = self as unknown as {
  onmessage:
    | ((
        event: MessageEvent<
          MaiaInit | { type: 'inference'; id: number; tokens: ArrayBuffer; rating: number }
        >,
      ) => void)
    | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
let session: ort.InferenceSession | null = null;
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = { mjs: data.mjsUrl, wasm: data.wasmUrl };
      session = await ort.InferenceSession.create(data.model, { executionProviders: ['wasm'] });
      scope.postMessage({ type: 'ready' });
    } else {
      if (!session) throw Error('Maia is not ready.');
      const feeds = {
        tokens: new ort.Tensor('float32', new Float32Array(data.tokens), [1, 64, 12]),
        elo_self: new ort.Tensor('float32', new Float32Array([data.rating]), [1]),
        elo_oppo: new ort.Tensor('float32', new Float32Array([data.rating]), [1]),
      };
      let result: ort.InferenceSession.ReturnType | undefined;
      try {
        result = await session.run(feeds);
        const logits = new Float32Array(result.logits_move.data as Float32Array);
        scope.postMessage({ type: 'result', id: data.id, logits: logits.buffer }, [logits.buffer]);
      } finally {
        for (const tensor of Object.values(feeds)) tensor.dispose();
        if (result) for (const tensor of Object.values(result)) tensor.dispose();
      }
    }
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id: data.type === 'inference' ? data.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
