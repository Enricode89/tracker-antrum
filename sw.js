// Service worker: l'app si apre subito dalla copia sul telefono e si aggiorna in sottofondo.
// I dati arrivano sempre da Supabase (la pagina ne tiene l'ultima copia per l'avvio).
const CACHE = 'antrum-v26';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
// libreria del database: versione fissa, si scarica una volta sola e resta sul telefono
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))   // sempre la versione appena pubblicata
      .then(() => c.add(LIB).catch(() => {})))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.url === LIB) {                                 // libreria: dalla copia sul telefono
    e.respondWith(caches.open(CACHE).then(c => c.match(LIB).then(r => r || fetch(req).then(res => { if (res.ok) c.put(LIB, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;            // Supabase, Google: sempre rete
  if (url.pathname.includes('/checkin/')) {              // pagina check-in ospiti: sempre l'ultima versione
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  // app: copia sul telefono subito, intanto scarico quella nuova per la prossima apertura
  const key = new Request(url.origin + url.pathname);   // senza ?apri=…
  e.respondWith(caches.open(CACHE).then(async c => {
    const salvata = await c.match(key);
    const metti = res => { if (res.ok && !res.redirected) c.put(key, res.clone()); return res; };
    if (salvata) { e.waitUntil(fetch(url.origin + url.pathname, { cache: 'no-cache' }).then(metti).catch(() => {})); return salvata; }
    return fetch(req).then(metti).catch(() => c.match(new Request(new URL('./', self.registration.scope).href)));
  }));
});

// Notifiche push (promemoria pulizie): tocco → si apre WhatsApp col messaggio pronto, o l'app
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Antrum', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || 'antrum', data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.openWindow(url));
});
