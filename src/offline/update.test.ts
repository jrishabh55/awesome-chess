import { afterEach, expect, it, vi } from 'vitest';
import { activateUpdate } from './download';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup(waiting: { postMessage: (message: string) => void } | null) {
  const serviceWorker = new EventTarget() as EventTarget & {
    controller: object;
    getRegistration: ReturnType<typeof vi.fn>;
  };
  serviceWorker.controller = {};
  const reg = {
    waiting,
    active: {},
    installing: null,
    update: vi.fn().mockResolvedValue(undefined),
  };
  serviceWorker.getRegistration = vi.fn().mockResolvedValue(reg);
  const reload = vi.fn();
  vi.stubGlobal('navigator', { serviceWorker });
  vi.stubGlobal('location', { reload });
  return { serviceWorker, reg, reload };
}

it('reloads when an update was already activated instead of silently doing nothing', async () => {
  const { reg, reload } = setup(null);
  await activateUpdate();
  expect(reg.update).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
});

it('subscribes before sending activation and waits for the new controller', async () => {
  const target = { postMessage: vi.fn() };
  const { serviceWorker, reload } = setup(target);
  target.postMessage.mockImplementation(() => {
    serviceWorker.controller = {};
    serviceWorker.dispatchEvent(new Event('controllerchange'));
  });
  await activateUpdate();
  expect(reload).toHaveBeenCalledOnce();
});

it('reports activation timeout so the button can offer retry', async () => {
  vi.useFakeTimers();
  setup({ postMessage: vi.fn() });
  const result = activateUpdate().then(
    () => null,
    (error) => error,
  );
  await vi.advanceTimersByTimeAsync(16000);
  expect(await result).toBeInstanceOf(Error);
});

it('reports a missing registration instead of leaving a dead update button', async () => {
  const { serviceWorker, reload } = setup(null);
  serviceWorker.getRegistration.mockResolvedValue(undefined);
  await expect(activateUpdate()).rejects.toThrow('No app update is ready');
  expect(reload).not.toHaveBeenCalled();
});

it('waits for an installing update before requesting activation', async () => {
  vi.useFakeTimers();
  const { reg, serviceWorker, reload } = setup(null);
  const worker = Object.assign(new EventTarget(), { state: 'installing' });
  const waiting = {
    postMessage: vi.fn(() => {
      serviceWorker.controller = {};
      serviceWorker.dispatchEvent(new Event('controllerchange'));
    }),
  };
  reg.update.mockImplementation(async () => {
    Object.assign(reg, { installing: worker });
    setTimeout(() => {
      reg.waiting = waiting;
      worker.state = 'installed';
      worker.dispatchEvent(new Event('statechange'));
    }, 10);
  });
  const update = activateUpdate();
  await vi.advanceTimersByTimeAsync(20);
  await update;
  expect(waiting.postMessage).toHaveBeenCalledWith('ACTIVATE');
  expect(reload).toHaveBeenCalledOnce();
});

it('reloads an update activated by another tab even when offline', async () => {
  const { reg, serviceWorker, reload } = setup(null);
  vi.resetModules();
  const { activateUpdate: activateFromOriginalPage } = await import('./download');
  serviceWorker.controller = {};
  reg.update.mockRejectedValue(Error('Offline'));
  await activateFromOriginalPage();
  expect(reg.update).not.toHaveBeenCalled();
  expect(reload).toHaveBeenCalledOnce();
});
