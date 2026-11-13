/* Service Worker: офлайн-режим для шпаргалки терапевта (PWA) */
const CACHE_VERSION = 'therapist-cheatsheet-v1.2.2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/guidelines.json',
  './data/cases.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png',
  './icons/favicon-32.png',
  './CHEATSHEET.md',
  './docs/01_orvi.md',
  './docs/02_arterial_hypertension.md',
  './docs/03_dorsopathy.md',
  './docs/04_gastritis.md',
  './docs/05_diarrhea.md',
  './docs/06_diabetes.md',
  './docs/07_copd_asthma.md',
  './docs/08_uti.md',
  './docs/09_gout.md'
];

// Установка: кэшируем ядро приложения. Отдельные сбои не ломают установку.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.all(CORE_ASSETS.map(async (url) => {
      try {
        const response = await fetch(new Request(url, { cache: 'reload' }));
        if (response && (response.ok || response.type === 'opaque')) {
          await cache.put(url, response);
        }
      } catch (err) {
        // Пропускаем недоступный ресурс, чтобы не блокировать установку.
      }
    }));
    await self.skipWaiting();
  })());
});

// Активация: удаляем устаревшие кэши.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (err) {}
    }
    await self.clients.claim();
  })());
});

// Стратегии: навигация — network-first, данные — stale-while-revalidate, остальное — cache-first.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.endsWith('.json') || url.pathname.endsWith('.js') || url.pathname.endsWith('.md')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put('./index.html', response.clone());
      return response;
    }
    // Ответ 4xx/5xx (в т.ч. от прокси) — отдаем офлайн-версию, если она есть.
    const cached = await cache.match(request) || await cache.match('./index.html') || await cache.match('./');
    if (cached) return cached;
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match('./index.html') || await cache.match('./');
    if (fallback) return fallback;
    return new Response('Офлайн: страница недоступна', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await network) || new Response('', { status: 504 });
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return new Response('', { status: 504 });
  }
}

// Позволяем странице попросить активацию новой версии SW.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
