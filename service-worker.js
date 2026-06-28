/* ═══════════════════════════════════════════════════════════════
   MLSN Franchising Solution Corporation — Service Worker
   service-worker.js  |  PWA Offline + Sync + Push
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── 1. CACHE CONFIGURATION ────────────────────────────────── */
const APP_VERSION    = 'v1.0.0';
const CACHE_SHELL    = `mlsn-shell-${APP_VERSION}`;
const CACHE_ASSETS   = `mlsn-assets-${APP_VERSION}`;
const CACHE_API      = `mlsn-api-${APP_VERSION}`;
const CACHE_MAPS     = `mlsn-maps-${APP_VERSION}`;

const ALL_CACHES = [CACHE_SHELL, CACHE_ASSETS, CACHE_API, CACHE_MAPS];

/* Files to pre-cache on install (app shell) */
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './offline.html',
];

/* Asset files to pre-cache */
const ASSET_FILES = [
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

/* ── 2. ROUTE MATCHERS ─────────────────────────────────────── */
const ROUTES = {
  /* Supabase API — all REST + realtime + auth calls */
  isSupabase: (url) =>
    url.hostname.includes('.supabase.co') ||
    url.hostname.includes('supabase.io'),

  /* Google Maps tiles and API */
  isMaps: (url) =>
    url.hostname.includes('maps.googleapis.com') ||
    url.hostname.includes('maps.gstatic.com') ||
    url.hostname.includes('mapsplatform.googleapis.com'),

  /* Google Fonts */
  isFonts: (url) =>
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com'),

  /* CDN resources (Supabase JS SDK, etc.) */
  isCDN: (url) =>
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('cdnjs.cloudflare.com'),

  /* App shell — our own origin HTML/CSS/JS */
  isShell: (url, origin) =>
    url.origin === origin &&
    (url.pathname.endsWith('.html') ||
     url.pathname.endsWith('.css')  ||
     url.pathname.endsWith('.js')   ||
     url.pathname === '/'           ||
     url.pathname.endsWith('/')),

  /* Static assets — icons, images */
  isAsset: (url, origin) =>
    url.origin === origin &&
    (url.pathname.startsWith('/icons/') ||
     url.pathname.startsWith('/screenshots/') ||
     url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff|woff2|ttf)$/)),
};

/* ── 3. BACKGROUND SYNC QUEUE ──────────────────────────────── */
const SYNC_TAG       = 'mlsn-bg-sync';
const SYNC_STORE_KEY = 'mlsn-sync-queue';

/* ════════════════════════════════════════════════════════════
   4. INSTALL — Pre-cache app shell
════════════════════════════════════════════════════════════ */
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing ${APP_VERSION}`);

  event.waitUntil(
    (async () => {
      try {
        /* Cache shell files */
        const shellCache = await caches.open(CACHE_SHELL);
        await shellCache.addAll(
          SHELL_FILES.filter(f => f !== './offline.html') // offline.html may not exist yet
        );

        /* Try to cache offline fallback */
        try {
          await shellCache.add('./offline.html');
        } catch {
          /* offline.html not present — create inline fallback later */
        }

        /* Cache assets (non-blocking — icons may not exist during dev) */
        const assetCache = await caches.open(CACHE_ASSETS);
        await Promise.allSettled(
          ASSET_FILES.map(f => assetCache.add(f).catch(() => {}))
        );

        console.log('[SW] Shell pre-cached successfully');
      } catch (err) {
        console.warn('[SW] Pre-cache failed (non-fatal):', err.message);
      }

      /* Take control immediately without waiting for old SW to die */
      self.skipWaiting();
    })()
  );
});

/* ════════════════════════════════════════════════════════════
   5. ACTIVATE — Clean old caches, claim clients
════════════════════════════════════════════════════════════ */
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating ${APP_VERSION}`);

  event.waitUntil(
    (async () => {
      /* Delete caches from previous versions */
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name.startsWith('mlsn-') && !ALL_CACHES.includes(name))
          .map(name => {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      );

      /* Take control of all open pages immediately */
      await self.clients.claim();
      console.log('[SW] Active and controlling all clients');

      /* Notify all clients that SW has updated */
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client => {
        client.postMessage({ type: 'SW_UPDATED', version: APP_VERSION });
      });
    })()
  );
});

/* ════════════════════════════════════════════════════════════
   6. FETCH — Route interception
════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const origin = self.location.origin;

  /* Skip non-GET requests that aren't being queued for sync */
  if (request.method !== 'GET') {
    /* Queue mutation requests when offline */
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) &&
        ROUTES.isSupabase(url)) {
      event.respondWith(networkWithSyncFallback(request));
    }
    return;
  }

  /* Chrome DevTools / extension requests — skip */
  if (url.protocol === 'chrome-extension:' || url.protocol === 'chrome:') return;

  /* ── Route to appropriate strategy ── */

  /* 1. Supabase API — Network First, short cache */
  if (ROUTES.isSupabase(url)) {
    event.respondWith(networkFirstWithCache(request, CACHE_API, 60));
    return;
  }

  /* 2. Google Maps — Network First, longer cache for tiles */
  if (ROUTES.isMaps(url)) {
    event.respondWith(networkFirstWithCache(request, CACHE_MAPS, 3600));
    return;
  }

  /* 3. Google Fonts — Stale While Revalidate */
  if (ROUTES.isFonts(url)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_ASSETS));
    return;
  }

  /* 4. CDN resources — Cache First (versioned, rarely change) */
  if (ROUTES.isCDN(url)) {
    event.respondWith(cacheFirst(request, CACHE_ASSETS));
    return;
  }

  /* 5. App shell (HTML/CSS/JS on our origin) — Cache First + network update */
  if (ROUTES.isShell(url, origin)) {
    event.respondWith(cacheFirstWithNetworkUpdate(request, CACHE_SHELL));
    return;
  }

  /* 6. Static assets on our origin — Cache First */
  if (ROUTES.isAsset(url, origin)) {
    event.respondWith(cacheFirst(request, CACHE_ASSETS));
    return;
  }

  /* 7. Everything else — Network with offline fallback */
  event.respondWith(networkWithOfflineFallback(request));
});

/* ════════════════════════════════════════════════════════════
   7. CACHING STRATEGIES
════════════════════════════════════════════════════════════ */

/**
 * Cache First — serve from cache; only hit network if not cached.
 * Best for: versioned assets, icons, CDN libraries.
 */
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback(request);
  }
}

/**
 * Cache First with background network update.
 * Serves cached immediately; silently refreshes cache for next time.
 * Best for: app shell files (HTML/CSS/JS).
 */
async function cacheFirstWithNetworkUpdate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  /* Kick off a background fetch regardless */
  const networkFetch = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  /* Return cache immediately if available; otherwise wait for network */
  return cached || networkFetch || offlineFallback(request);
}

/**
 * Network First with cache fallback.
 * Best for: API calls, live delivery data.
 * @param {number} maxAgeSeconds — skip cache entries older than this
 */
async function networkFirstWithCache(request, cacheName, maxAgeSeconds = 300) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetchWithTimeout(request, 8000);
    if (response.ok) {
      /* Tag cache entry with timestamp */
      const cloned = response.clone();
      const headers = new Headers(cloned.headers);
      headers.set('sw-cache-date', Date.now().toString());
      const taggedResponse = new Response(await cloned.blob(), {
        status:  cloned.status,
        headers,
      });
      cache.put(request, taggedResponse);
    }
    return response;
  } catch {
    /* Network failed — try cache */
    const cached = await cache.match(request);
    if (cached) {
      const cacheDate = parseInt(cached.headers.get('sw-cache-date') || '0');
      const age = (Date.now() - cacheDate) / 1000;
      if (age < maxAgeSeconds || maxAgeSeconds === 0) {
        return cached;
      }
    }
    return offlineFallback(request);
  }
}

/**
 * Stale While Revalidate — return cache immediately, update in background.
 * Best for: Google Fonts (fast load, stays fresh over time).
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  /* Revalidate in background */
  const networkFetch = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || await networkFetch || offlineFallback(request);
}

/**
 * Network with offline fallback.
 * Last resort for unknown request types.
 */
async function networkWithOfflineFallback(request) {
  try {
    return await fetchWithTimeout(request, 10000);
  } catch {
    return offlineFallback(request);
  }
}

/**
 * Network with background sync fallback for mutations.
 * When offline, queues the request to retry on reconnect.
 */
async function networkWithSyncFallback(request) {
  try {
    return await fetch(request.clone());
  } catch {
    /* Offline — queue for background sync */
    await queueRequest(request);
    return new Response(
      JSON.stringify({ queued: true, message: 'Request queued for sync when online.' }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/* ── Offline Fallback Response ──────────────────────────── */
async function offlineFallback(request) {
  /* For navigation requests, serve the offline page */
  if (request.destination === 'document' || request.mode === 'navigate') {
    const cache    = await caches.open(CACHE_SHELL);
    const offline  = await cache.match('./offline.html');
    if (offline) return offline;

    /* If no offline.html, serve the main index.html */
    const index = await cache.match('./index.html') || await cache.match('./');
    if (index) return index;
  }

  /* For API requests, return structured error */
  if (request.headers.get('accept')?.includes('application/json')) {
    return new Response(
      JSON.stringify({ error: 'offline', message: 'You are currently offline.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /* Generic offline response */
  return new Response('Offline — please check your connection.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/* ── Fetch with Timeout ─────────────────────────────────── */
function fetchWithTimeout(request, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(request, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/* ════════════════════════════════════════════════════════════
   8. BACKGROUND SYNC — Offline mutation queue
════════════════════════════════════════════════════════════ */

/**
 * Serialize and store a failed request in IndexedDB for retry.
 */
async function queueRequest(request) {
  try {
    const body = await request.clone().text().catch(() => '');
    const entry = {
      url:     request.url,
      method:  request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      timestamp: Date.now(),
    };

    const db = await openSyncDB();
    const tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').add(entry);
    await txComplete(tx);
    db.close();

    /* Register background sync if supported */
    if (self.registration.sync) {
      await self.registration.sync.register(SYNC_TAG);
    }

    console.log('[SW] Request queued for sync:', request.url);
  } catch (err) {
    console.warn('[SW] Failed to queue request:', err.message);
  }
}

/**
 * Process the sync queue — called on 'sync' event or connectivity restore.
 */
async function processQueue() {
  let db;
  try {
    db = await openSyncDB();
    const tx      = db.transaction('queue', 'readonly');
    const store   = tx.objectStore('queue');
    const entries = await getAllFromStore(store);
    await txComplete(tx);

    console.log(`[SW] Processing sync queue: ${entries.length} item(s)`);

    for (const entry of entries) {
      try {
        const response = await fetch(entry.url, {
          method:  entry.method,
          headers: entry.headers,
          body:    entry.body || undefined,
        });

        if (response.ok || response.status < 500) {
          /* Remove from queue on success (or non-server error) */
          const delTx = db.transaction('queue', 'readwrite');
          delTx.objectStore('queue').delete(entry.id);
          await txComplete(delTx);
          console.log('[SW] Synced queued request:', entry.url);
        }
      } catch (err) {
        console.warn('[SW] Sync retry failed:', entry.url, err.message);
        /* Leave in queue for next sync attempt */
      }
    }
  } catch (err) {
    console.warn('[SW] Queue processing error:', err.message);
  } finally {
    if (db) db.close();
  }
}

/* ── Background Sync Event ──────────────────────────────── */
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    console.log('[SW] Background sync triggered');
    event.waitUntil(processQueue());
  }
});

/* ── IndexedDB helpers ──────────────────────────────────── */
function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('mlsn-sync-db', 1);
    req.onupgradeneeded = (e) => {
      const db    = e.target.result;
      if (!db.objectStoreNames.contains('queue')) {
        const store = db.createObjectStore('queue', {
          keyPath:       'id',
          autoIncrement: true,
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function txComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/* ════════════════════════════════════════════════════════════
   9. PUSH NOTIFICATIONS
════════════════════════════════════════════════════════════ */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'MLSN Corp', body: event.data.text() };
  }

  const title = payload.title || 'MLSN Corp';
  const options = {
    body:            payload.body    || 'You have a new notification.',
    icon:            payload.icon    || './icons/icon-192.png',
    badge:           payload.badge   || './icons/icon-96.png',
    tag:             payload.tag     || 'mlsn-notification',
    renotify:        payload.renotify ?? false,
    requireInteraction: payload.requireInteraction ?? false,
    silent:          payload.silent  ?? false,
    data: {
      url:    payload.url    || './',
      type:   payload.type   || 'general',
      ref_id: payload.ref_id || null,
    },
    actions: buildNotificationActions(payload.type),
    vibrate: [100, 50, 100],
    timestamp: Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/* Build context-aware action buttons on notifications */
function buildNotificationActions(type) {
  switch (type) {
    case 'delivery':
      return [
        { action: 'track',   title: '📦 Track Delivery' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
    case 'chat':
      return [
        { action: 'reply',   title: '💬 Open Chat' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
    case 'announcement':
      return [
        { action: 'view',    title: '📢 View' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
    default:
      return [
        { action: 'open',    title: 'Open App' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
  }
}

/* ── Notification Click ─────────────────────────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { action }  = event;
  const { url, type, ref_id } = event.notification.data || {};

  /* Map action + type to a target URL */
  let targetUrl = url || './';
  if (action !== 'dismiss') {
    if (type === 'delivery' && ref_id) targetUrl = `./index.html#deliveries`;
    if (type === 'chat')               targetUrl = `./index.html#chat`;
    if (type === 'announcement')       targetUrl = `./index.html#announcements`;
  }

  event.waitUntil(
    (async () => {
      /* Focus existing window if already open */
      const clients = await self.clients.matchAll({
        type:            'window',
        includeUncontrolled: true,
      });

      for (const client of clients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin) {
          await client.focus();
          client.postMessage({ type: 'NAVIGATE', url: targetUrl, notifType: type, ref_id });
          return;
        }
      }

      /* No existing window — open a new one */
      await self.clients.openWindow(targetUrl);
    })()
  );
});

/* ── Notification Close ─────────────────────────────────── */
self.addEventListener('notificationclose', (event) => {
  /* Analytics hook — could POST to a logging endpoint */
  const { type } = event.notification.data || {};
  console.log(`[SW] Notification dismissed: ${type}`);
});

/* ════════════════════════════════════════════════════════════
   10. MESSAGE HANDLING (from app.js via postMessage)
════════════════════════════════════════════════════════════ */
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    /* App requests SW to skip waiting and activate update */
    case 'SKIP_WAITING':
      console.log('[SW] Received SKIP_WAITING — updating now');
      self.skipWaiting();
      break;

    /* App requests cache invalidation for a specific resource */
    case 'INVALIDATE_CACHE':
      if (payload?.url) {
        invalidateCacheEntry(payload.url);
      }
      break;

    /* App requests cache wipe (e.g. after logout) */
    case 'CLEAR_API_CACHE':
      caches.delete(CACHE_API).then(() => {
        console.log('[SW] API cache cleared on logout');
      });
      break;

    /* App signals user is back online — trigger queue flush */
    case 'ONLINE':
      console.log('[SW] App reports online — flushing sync queue');
      processQueue();
      break;

    /* Request SW version info */
    case 'GET_VERSION':
      event.source?.postMessage({ type: 'VERSION', version: APP_VERSION });
      break;

    default:
      break;
  }
});

/* ── Invalidate a single cache entry ───────────────────── */
async function invalidateCacheEntry(url) {
  for (const cacheName of ALL_CACHES) {
    const cache = await caches.open(cacheName);
    const deleted = await cache.delete(url);
    if (deleted) {
      console.log(`[SW] Invalidated cache entry: ${url} from ${cacheName}`);
      return;
    }
  }
}

/* ════════════════════════════════════════════════════════════
   11. PERIODIC BACKGROUND SYNC (Chrome / Android)
════════════════════════════════════════════════════════════ */
self.addEventListener('periodicsync', (event) => {
  switch (event.tag) {
    case 'mlsn-cache-refresh':
      event.waitUntil(refreshShellCache());
      break;
    case 'mlsn-sync-queue':
      event.waitUntil(processQueue());
      break;
    default:
      break;
  }
});

/**
 * Re-fetch the app shell files in the background to keep them fresh.
 * Triggered by periodic background sync (if granted by browser).
 */
async function refreshShellCache() {
  const cache = await caches.open(CACHE_SHELL);
  console.log('[SW] Periodic: refreshing shell cache');
  await Promise.allSettled(
    SHELL_FILES.map(file =>
      fetch(file, { cache: 'no-cache' })
        .then(response => { if (response.ok) cache.put(file, response); })
        .catch(() => {})
    )
  );
}

/* ════════════════════════════════════════════════════════════
   12. CONNECTIVITY DETECTION
════════════════════════════════════════════════════════════ */
/* Listen for the app to report connectivity changes */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CONNECTIVITY_CHANGE') {
    const { online } = event.data;
    if (online) {
      console.log('[SW] Connectivity restored — processing queue');
      processQueue();
    }
  }
});

/* ════════════════════════════════════════════════════════════
   13. ERROR HANDLING
════════════════════════════════════════════════════════════ */
self.addEventListener('error', (event) => {
  console.error('[SW] Uncaught error:', event.message, event.filename, event.lineno);
});

self.addEventListener('unhandledrejection', (event) => {
  console.warn('[SW] Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

/* ════════════════════════════════════════════════════════════
   14. CACHE MAINTENANCE — Limit cache size
════════════════════════════════════════════════════════════ */

/**
 * Trim a cache to a maximum number of entries (LRU-style eviction).
 */
async function trimCache(cacheName, maxEntries) {
  const cache   = await caches.open(cacheName);
  const keys    = await cache.keys();
  if (keys.length > maxEntries) {
    const toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map(key => cache.delete(key)));
    console.log(`[SW] Trimmed ${toDelete.length} entries from ${cacheName}`);
  }
}

/* Run cache maintenance after activation */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      /* Enforce size limits on large caches */
      await trimCache(CACHE_MAPS, 100);   // Map tiles
      await trimCache(CACHE_API,  50);    // API responses
      await trimCache(CACHE_ASSETS, 80);  // Fonts + CDN
    })()
  );
});

/* ════════════════════════════════════════════════════════════
   15. DEV HELPERS
════════════════════════════════════════════════════════════ */

/* Log SW version on start for debugging */
console.log(`[SW] MLSN Corp Service Worker ${APP_VERSION} loaded`);
