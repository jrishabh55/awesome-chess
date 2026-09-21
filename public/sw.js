const scopedUrl = (path) => new URL(path, self.registration.scope).href;
const SHELL = `chess-room-${self.registration.scope}-__BUILD_ID__`;
self.addEventListener('install', (event) =>
  event.waitUntil(
    (async () => {
      const response = await fetch(scopedUrl('shell-assets.json'), { cache: 'no-store' });
      const assets = await response.json();
      const cache = await caches.open(SHELL);
      // Do not copy an older release from the browser's HTTP cache into this shell.
      await cache.addAll(assets.map((path) => new Request(scopedUrl(path), { cache: 'reload' })));
    })(),
  ),
);
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if (event.data === 'ACTIVATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin)
    return;
  event.respondWith(
    (async () => {
      const url = new URL(event.request.url);
      const shell = await caches.open(SHELL);
      const bundled = await shell.match(event.request, { ignoreVary: true });
      if (bundled) return bundled;
      if (url.href.startsWith(scopedUrl('engine/'))) {
        const build = url.searchParams.get('build');
        for (const name of await caches.keys())
          if (build && name.startsWith(`engine-${build}-`) && !name.endsWith('-staging')) {
            const cache = await caches.open(name);
            if (await cache.match(scopedUrl('offline-ready'))) {
              const match = await cache.match(event.request);
              if (match) return match;
            }
          }
        return fetch(event.request);
      }
      try {
        return await fetch(event.request);
      } catch (error) {
        if (event.request.mode === 'navigate') {
          const index = await shell.match(scopedUrl('index.html'));
          if (index) return index;
        }
        throw error;
      }
    })(),
  );
});
