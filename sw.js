const CACHE = "bling-v22";
const FILES = ["/rebuild-a8k3", "./diamond.png", "./logo.png", "./hallway.jpg", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./crystal.jpg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (e.request.url.indexOf("/audio/") !== -1 || e.request.url.indexOf("cloudfront.net") !== -1 || e.request.headers.has("range")) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      if (res.ok && (e.request.url.startsWith(self.location.origin) || /fonts\.(googleapis|gstatic)\.com/.test(e.request.url))) {
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("/rebuild-a8k3")))
  );
});
