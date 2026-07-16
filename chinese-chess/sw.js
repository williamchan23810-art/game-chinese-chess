// Self-Destruct Service Worker
// This script will unregister itself and clear the browser cache to ensure
// the latest app.js, index.html, and style.css are loaded from the server.

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  caches.keys().then((keys) => {
    return Promise.all(keys.map(key => caches.delete(key)));
  }).then(() => {
    return self.registration.unregister();
  }).then(() => {
    return self.clients.matchAll();
  }).then((clients) => {
    clients.forEach(client => {
      if (client.url) {
        client.navigate(client.url);
      }
    });
  });
});
