/**
 * FileHub Service Worker v28
 * Network-first for HTML (always fresh in PWA)
 * Cache-first for hashed assets only
 */

const CACHE_VERSION = 'filehub-v29';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_PAGE = '/index.html';

const PRECACHE_URLS = ['/', '/index.html', '/manifest.json'];

const NO_CACHE = [
  'supabase.co','api.anthropic.com','api.deepseek.com','api.groq.com',
  'openrouter.ai','railway.app','corsproxy.io','allorigins.win',
  'api.moonshot.cn','wttr.in','calendar.google.com',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(c => c.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) return;
  if (NO_CACHE.some(p => url.hostname.includes(p))) return;

  // Hashed bundles → cache first
  if (url.pathname.includes('/assets/') && /\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(c => c || fetch(req).then(r => {
        if (r.ok) { const cl = r.clone(); caches.open(STATIC_CACHE).then(ca => ca.put(req, cl)); }
        return r;
      })).catch(() => caches.match(OFFLINE_PAGE))
    );
    return;
  }

  // All other (HTML, nav) → network first
  event.respondWith(
    fetch(req).then(r => {
      if (r.ok) { const cl = r.clone(); caches.open(STATIC_CACHE).then(ca => ca.put(req, cl)); }
      return r;
    }).catch(() => caches.match(req).then(c => c || caches.match(OFFLINE_PAGE)))
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ─── PUSH NOTIFICATIONS ──────────────────────────────────────────────
// Recibe push del server (NucBox o Cloudflare Worker con VAPID) o
// local notifications via reg.showNotification().
self.addEventListener('push', event => {
  let payload = { title: 'FileHub', body: 'Nueva notificación', url: '/' };
  try {
    if (event.data) {
      const text = event.data.text();
      try { payload = { ...payload, ...JSON.parse(text) }; }
      catch { payload.body = text; }
    }
  } catch (err) {
    console.warn('[sw] push payload parse:', err);
  }

  const { title, body, url, tag, icon, badge, data, ...rest } = payload;
  event.waitUntil(
    self.registration.showNotification(title || 'FileHub', {
      body: body || '',
      icon: icon || 'https://img.icons8.com/ios-filled/512/4f46e5/lightning-bolt.png',
      badge: badge || 'https://img.icons8.com/ios-filled/512/4f46e5/lightning-bolt.png',
      tag: tag || 'filehub-notif',
      data: { url: url || '/', ...(data || {}) },
      ...rest,
    })
  );
});

// Al hacer click en la notification, abre la URL guardada en data.url
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Si ya hay una ventana abierta de la app, foco + navega
      for (const c of clients) {
        if (c.url.includes('filehub2026') && 'focus' in c) {
          c.focus();
          if ('navigate' in c) c.navigate(target);
          return;
        }
      }
      // Si no, abre nueva
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
