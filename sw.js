/* offline cache: app shell + dictionary are cached; the page is refreshed from the network when online */
const V='vocab-v1';
const CORE=['./','index.html','store.js','dict.json','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.hostname==='api.github.com'||u.hostname.endsWith('githubusercontent.com'))return;
  const font=u.hostname==='fonts.googleapis.com'||u.hostname==='fonts.gstatic.com';
  if(u.origin!==location.origin&&!font)return;
  if(font){e.respondWith(caches.open(V).then(async c=>{const hit=await c.match(r);if(hit)return hit;try{const res=await fetch(r);if(res.ok||res.type==='opaque')c.put(r,res.clone());return res}catch(x){return hit||Response.error()}}));return}
  /* network first for the app itself so updates arrive, cache when offline */
  e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r,{ignoreSearch:true}).then(h=>h||caches.match('index.html'))));
});
