const V='olvra-qr-v1',SHELL=['/','/manifest.webmanifest','/icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(V).then(k=>k.put('/',c));return x}).catch(()=>caches.match('/')));return}
  if(u.origin===location.origin||u.host.endsWith('gstatic.com')||u.host.endsWith('googleapis.com')){
    e.respondWith(caches.match(r).then(h=>{const n=fetch(r).then(x=>{if(x.ok){const c=x.clone();caches.open(V).then(k=>k.put(r,c))}return x}).catch(()=>h);return h||n}));
  }
});
