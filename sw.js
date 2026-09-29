const V='lumora-v5',SHELL=['/','/manifest.webmanifest','/icon-192.png'];
const OK=['fonts.googleapis.com','fonts.gstatic.com','www.gstatic.com'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(x=>{if(u.pathname==='/'){const c=x.clone();caches.open(V).then(k=>k.put('/',c))}return x}).catch(()=>caches.match(r).then(h=>h||caches.match('/'))));
    return;
  }
  if(u.origin===location.origin||OK.includes(u.host)){
    e.respondWith(caches.match(r).then(h=>{const n=fetch(r).then(x=>{if(x.ok){const c=x.clone();caches.open(V).then(k=>k.put(r,c))}return x}).catch(()=>h);return h||n}));
  }
});

// ── Push notifications ──────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Lumora', body: 'You have a new notification.' };
  try { data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Lumora', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'lumora-notification',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' }
    })
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.openWindow(url));
});
