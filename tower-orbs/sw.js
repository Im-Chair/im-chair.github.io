const C='tower-orbs-v8';
// v6：地城圖示 rg/*.webp。v5：地城敵人特性、商店、事件。v4：地城遺物系統。v3：加入 rogue.js（地城模式）。離線查快取用 ignoreSearch，帶 ?v= 版號的請求也對得到；
// 找不到時只有「開頁面」才退回 index.html——腳本請求退回 HTML 會變成語法錯誤。
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html','./manifest.json','./rogue.js'])).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('tower-orbs-')&&x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(m=>m||(e.request.mode==='navigate'?caches.match('./index.html'):undefined))));
});
