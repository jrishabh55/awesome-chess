import { afterEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  env: { wasm: {} as Record<string, unknown> },
  run: vi.fn(),
  create: vi.fn(),
  tensors: [] as any[],
}));
vi.mock('onnxruntime-web/wasm', () => ({
  env: runtime.env,
  InferenceSession: { create: runtime.create },
  Tensor: class {
    dispose = vi.fn();
    constructor(
      public type: string,
      public data: Float32Array,
      public dims: number[],
    ) {
      runtime.tensors.push(this);
    }
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
  runtime.tensors.length = 0;
});
async function setup() {
  const scope = { onmessage: null as any, postMessage: vi.fn() };
  vi.stubGlobal('self', scope);
  runtime.create.mockResolvedValue({ run: runtime.run });
  await import('./worker');
  const model = new ArrayBuffer(1);
  await scope.onmessage({
    data: { type: 'init', model, mjsUrl: 'blob:mjs', wasmUrl: 'blob:wasm' },
  });
  expect(runtime.create).toHaveBeenCalledWith(model, { executionProviders: ['wasm'] });
  expect(runtime.env.wasm).toMatchObject({
    numThreads: 1,
    proxy: false,
    wasmPaths: { mjs: 'blob:mjs', wasm: 'blob:wasm' },
  });
  expect(scope.postMessage).toHaveBeenCalledWith({ type: 'ready' });
  return scope;
}
it('feeds the selected ratings and encoded board to ONNX, then releases input and output tensors', async () => {
  const scope = await setup();
  const output = { data: new Float32Array(4352), dispose: vi.fn() };
  runtime.run.mockResolvedValue({ logits_move: output });
  const tokens = new Float32Array(768);
  tokens[0] = 1;
  await scope.onmessage({
    data: { type: 'inference', id: 17, tokens: tokens.buffer, rating: 1600 },
  });
  const feeds = runtime.run.mock.calls[0][0];
  expect(feeds.tokens.dims).toEqual([1, 64, 12]);
  expect(feeds.tokens.data).toEqual(tokens);
  expect([...feeds.elo_self.data]).toEqual([1600]);
  expect([...feeds.elo_oppo.data]).toEqual([1600]);
  expect(scope.postMessage).toHaveBeenLastCalledWith(
    { type: 'result', id: 17, logits: expect.any(ArrayBuffer) },
    [expect.any(ArrayBuffer)],
  );
  for (const tensor of runtime.tensors) expect(tensor.dispose).toHaveBeenCalledOnce();
  expect(output.dispose).toHaveBeenCalledOnce();
});
it('releases input tensors and returns the matching request error when ONNX fails', async () => {
  const scope = await setup();
  runtime.run.mockRejectedValue(Error('Inference failed'));
  await scope.onmessage({
    data: { type: 'inference', id: 18, tokens: new Float32Array(768).buffer, rating: 1320 },
  });
  expect(scope.postMessage).toHaveBeenLastCalledWith({
    type: 'error',
    id: 18,
    message: 'Inference failed',
  });
  for (const tensor of runtime.tensors) expect(tensor.dispose).toHaveBeenCalledOnce();
});
