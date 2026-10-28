/* CTIA application shell only; personal records stay in localStorage / IndexedDB. */
const CACHE_NAME='ctia-practice-shell-20261028-mobile-v1';
const ASSETS=['./','./index.html','./styles.css','./app.js','./core.js','./questions.json','./mastery.js','./reading-notes.js','./notes-store.js','./notes-data.js','./notes-input.js','./reading-translation.js','./translation-service.js','./reading-speech.js','./portable/runtime.js','./portable/backup.js','./pwa.js','./manifest.webmanifest','./icons/app-192.png','./icons/app-512.png','./icons/apple-touch-icon.png'];
const root=new URL('./',self.location.href),assetURLs=ASSETS.map(path=>new URL(path,root).href),assetSet=new Set(assetURLs);
self.addEventListener('install',event=>event.waitUntil((async()=>{
 try{const cache=await caches.open(CACHE_NAME);await cache.addAll(assetURLs.map(url=>new Request(url,{cache:'reload'})));}catch(error){await caches.delete(CACHE_NAME);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const names=await caches.keys();await Promise.all(names.filter(name=>name.startsWith('ctia-practice-shell-')&&name!==CACHE_NAME).map(name=>caches.delete(name)));await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))return;
 url.search='';url.hash='';const canonical=url.href;
 if(event.request.mode!=='navigate'&&!assetSet.has(canonical))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE_NAME),cached=await cache.match(event.request.mode==='navigate'?new URL('index.html',root).href:canonical);if(cached)return cached;return fetch(event.request);})());
});
self.addEventListener('message',event=>{
 if(event.data?.type==='ACTIVATE_UPDATE'){self.skipWaiting();return;}
 if(event.data?.type==='CHECK_CACHE')event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);let found=await Promise.all(assetURLs.map(url=>cache.match(url)));if(!found.every(Boolean)&&event.data.repair){try{await cache.addAll(assetURLs.map(url=>new Request(url,{cache:'reload'})));found=await Promise.all(assetURLs.map(url=>cache.match(url)));}catch{}}event.ports[0]?.postMessage({complete:found.every(Boolean),version:CACHE_NAME,count:found.filter(Boolean).length,total:assetURLs.length});})());
});
