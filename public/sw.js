// Service worker LaBonneAlerte — stratégie PRUDENTE (jamais de contenu périmé).
//
//  - Navigations HTML + /api/*  : network-first (le réseau gagne toujours ;
//    fallback cache pour le HTML uniquement, puis page hors-ligne).
//  - Assets statiques (css/js/fonts/icons) : stale-while-revalidate (rapide,
//    mais rafraîchi en arrière-plan).
//
// Versionnage : bump CACHE_VERSION pour invalider tous les caches au déploiement.

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `lba-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `lba-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Ressources précachées à l'installation (coquille minimale hors-ligne).
const PRECACHE = [OFFLINE_URL, '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// Nettoyage des anciens caches (versions précédentes).
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Un asset statique cacheable en stale-while-revalidate ?
function isStaticAsset(url) {
  return /\.(?:css|js|woff2?|png|svg|ico|webmanifest)$/i.test(url.pathname);
}

// Stale-while-revalidate : sert le cache tout de suite, met à jour en fond.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || network || fetch(request);
}

// Network-first : le réseau gagne ; en cas d'échec, cache (HTML) puis hors-ligne.
async function networkFirst(request, { htmlFallback }) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(request);
    // On ne met en cache que le HTML des navigations réussies (jamais /api).
    if (htmlFallback && res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    if (htmlFallback) {
      const cached = await cache.match(request);
      if (cached) return cached;
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // On ne gère que notre propre origine.
  if (url.origin !== self.location.origin) return;

  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (url.pathname.startsWith('/api/')) {
    // API : toujours le réseau, pas de fallback cache (pas de données périmées).
    event.respondWith(networkFirst(request, { htmlFallback: false }));
    return;
  }

  if (isNavigation) {
    event.respondWith(networkFirst(request, { htmlFallback: true }));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// ---- Notifications push ----

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'La Bonne Alerte';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png', // monochrome (Android : petite icône barre d'état)
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic sur une notification : focus un onglet du site existant, sinon ouvre l'URL.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url && new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return undefined;
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    })
  );
});
