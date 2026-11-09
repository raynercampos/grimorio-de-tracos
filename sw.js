// Service worker: guarda o app no aparelho para abrir offline e recebe imagens do menu "Compartilhar".
// Não envia nada para a internet.
var CACHE = 'grimorio-v11';
var SHARED = 'grimorio-shared';
var FILES = ['./', 'index.html', 'style.css', 'engine.js','scenes.js', 'export.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE && k !== SHARED; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  // imagem enviada pelo "Compartilhar" do Android
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async function () {
      try {
        var fd = await req.formData(), f = fd.get('image');
        if (f) {
          var c = await caches.open(SHARED);
          await c.put(new URL('shared-image', self.registration.scope).href, new Response(f, { headers: { 'Content-Type': f.type || 'image/jpeg' } }));
        }
      } catch (err) { }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    // cache primeiro; atualiza em segundo plano quando há internet
    var net = fetch(req).then(function (r) {
      if (r && r.ok) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return r;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
