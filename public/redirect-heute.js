// TEMPORARY (2026-11-10, Peter's press release): send visitors of "/" straight to
// "/vorarlberg" so editors skip the "Wo suchst du?" pop-up. Expires by itself at
// midnight Vienna time (2026-11-11 00:00 = 2026-11-10T23:00:00Z); afterwards this file
// does nothing and can be deleted together with its <script> tags in index.html and
// scripts/prerender.mjs. External file because the CSP blocks inline scripts.
(function () {
  if (location.pathname !== '/') return;
  if (Date.now() >= Date.parse('2026-11-10T23:00:00Z')) return;
  location.replace('/vorarlberg' + location.search + location.hash);
})();
