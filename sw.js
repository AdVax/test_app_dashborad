// ══════════════════════════════════════════
//  SERVICE WORKER — لوحة إدارة المتجر
//  استراتيجية: Network First مع fallback للكاش
//  GitHub API: لا يُكاش أبداً
// ══════════════════════════════════════════

const CACHE = 'dashboard-v1';

// الملفات التي تُكاش (shell التطبيق فقط)
const SHELL = [
  './',
  './index.html',
  'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;900&display=swap'
];

// ══ INSTALL — تحميل الـ shell ══
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      // نحاول تخزين كل ملف بشكل منفصل — إذا فشل واحد لا يوقف الباقي
      return Promise.allSettled(SHELL.map(url => c.add(url).catch(() => {})));
    }).then(() => self.skipWaiting())
  );
});

// ══ ACTIVATE — حذف الكاشات القديمة ══
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ══ FETCH — استراتيجية ذكية ══
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // ❌ GitHub API و jsDelivr و raw.githubusercontent: لا تلمسها أبداً
  if (
    url.includes('api.github.com') ||
    url.includes('raw.githubusercontent.com') ||
    url.includes('api.whatsapp.com')
  ) {
    return; // يمر مباشرة بدون تدخل
  }

  // ✅ Google Fonts: كاش أول
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // ✅ jsDelivr (SortableJS): كاش أول
  if (url.includes('cdn.jsdelivr.net')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // ✅ index.html وملفات التطبيق: Network First مع timeout
  //    إذا انقطع الإنترنت → يعرض النسخة المخزنة
  if (e.request.mode === 'navigate' || url.includes('index.html')) {
    e.respondWith(
      Promise.race([
        fetch(e.request).then(res => {
          // إذا نجح الجلب → نحدث الكاش ونرجع الجديد
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        }),
        // timeout 5 ثوانٍ → ننتقل للكاش
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]).catch(() => caches.match('./index.html'))
    );
    return;
  }
});
