/* =========================================================
   SKLADAPLAN — service worker

   Задача этого файла:
   1. Сделать приложение устанавливаемым (PWA).
   2. Дать браузеру «офлайн-оболочку» — если интернета нет,
      приложение всё равно откроется (данные подтянутся
      из Supabase, когда связь вернётся).

   ВАЖНО:
   - HTML и JS кэшируются в режиме network-first:
     всегда сначала идёт запрос к серверу. Если сервер
     ответил — новая версия попадает в кэш. Если не ответил —
     берём из кэша. Это значит: после деплоя новой версии
     пользователи получают её при первом же обновлении
     страницы, ничего не «зависает» на старой.
   - CSS, шрифты и иконки — cache-first: они меняются редко,
     отдаём из кэша мгновенно.
   - Запросы к Supabase (supabase.co) не кэшируются вообще:
     данные всегда свежие из БД.

   При деплое новой версии — обязательно поднять CACHE_VERSION
   ниже (b1 → b2 → …). Это сбросит старый кэш.
   ========================================================= */

const CACHE_VERSION = 'skladaplan-v1-2026-09-28';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

/* Файлы, которые нужны для «офлайн-оболочки».
   Их отсутствие не критично — просто приложение не откроется,
   если у пользователя нет интернета вообще. */
const PRECACHE_URLS = [
  '/',
  '/index.html'
];

/* При установке — забираем основную оболочку. */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(err => {
        /* Не блокируем установку, если что-то не скачалось. */
        console.warn('[SW] precache failed:', err);
      })
  );

  /* Сразу активируемся, не ждём закрытия старых вкладок. */
  self.skipWaiting();
});

/* При активации — чистим старые версии кэша. */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => !key.startsWith(CACHE_VERSION))
          .map(key => caches.delete(key))
      );
    }).then(() => {
      /* Берём контроль над всеми открытыми вкладками. */
      return self.clients.claim();
    })
  );
});

/* Перехват запросов. */
self.addEventListener('fetch', event => {
  const request = event.request;

  /* Только GET. POST/PUT/DELETE/PATCH идут напрямую. */
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  /* Запросы к Supabase — не трогаем вообще.
     Всегда напрямую, без кэша. */
  if (url.hostname.endsWith('supabase.co')) {
    return;
  }

  /* Запросы к CDN (jsdelivr и т.п.) — тоже напрямую. */
  if (
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('unpkg.com')
  ) {
    return;
  }

  /* Навигационные запросы (когда пользователь открывает
     страницу) — network-first, fallback на index.html. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, copy));
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            return cached || caches.match('/index.html');
          });
        })
    );
    return;
  }

  /* JS и HTML — network-first: сначала пробуем сеть,
     чтобы получить свежую версию после деплоя.
     Если сети нет — отдаём из кэша. */
  const isScriptOrHtml =
    request.destination === 'script' ||
    request.destination === 'document' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.html');

  if (isScriptOrHtml) {
    event.respondWith(
      fetch(request)
        .then(response => {
          /* Кэшируем только успешные ответы. */
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  /* CSS, шрифты, картинки, иконки — cache-first.
     Они меняются редко, отдаём из кэша мгновенно. */
  const isStaticAsset =
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) {
          /* Обновляем в фоне, чтобы при следующем заходе
             была свежая версия. */
          fetch(request).then(response => {
            if (response && response.status === 200 && response.type === 'basic') {
              caches.open(RUNTIME_CACHE).then(c => c.put(request, response.clone()));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(request).then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  /* Всё остальное — просто из сети. */
});

/* Когда SW обновился — прислать всем клиентам команду
   перезагрузиться (только если пользователь в этот момент
   не в форме — не мешаем вводу). */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
