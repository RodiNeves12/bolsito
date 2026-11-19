/**
 * Service Worker — Estratégia Cache-First para funcionamento 100% offline.
 * Todos os caminhos são relativos para funcionar localmente e no GitHub Pages.
 */

const CACHE_NAME = 'bolsito-cache-v12';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './assets/icon-bolsito.png',
  './css/styles.css',
  './assets/fonts/inter-latin.woff2',
  './assets/fonts/inter-latin-ext.woff2',
  './assets/fonts/lora-latin.woff2',
  './assets/fonts/lora-latin-ext.woff2',
  './js/app.js',
  './js/state.js',
  './js/holidays.js',
  './js/calculator.js',
  './js/cdiEngine.js',
  './js/financeEngine.js',
  './js/financeUI.js',
  './js/ui.js'
];

// Instalação: pré-carrega todos os arquivos estáticos da aplicação no cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Ativação: remove caches de versões anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
  self.clients.claim();
});

// Interceptação de requisições: cache-first com fallback para rede e index.html em navegação
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignora requisições que não sejam GET ou de outros esquemas (ex.: chrome-extension)
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback offline para navegação SPA/local
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', {
            status: 503,
            statusText: 'Offline'
          });
        });
    })
  );
});
