/**
 * Service worker เบา ๆ — แคชเฉพาะไฟล์หน้าเว็บ (app shell)
 * ข้อมูลคิว/เกม (/api/*) ไม่แคชเด็ดขาด เพราะต้องสด ๆ เสมอ
 */
const CACHE = "genki-shell-v3"
const SHELL = ["/", "/index.html", "/logo.webp", "/favicon.png", "/manifest.webmanifest"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined)).then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return // ต้องสดเสมอ

  // network-first: ได้ของใหม่เสมอเมื่อมีเน็ต, ตกไปใช้แคชเมื่อเน็ตหลุด
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined)
        return res
      })
      .catch(() =>
        caches.match(event.request).then((hit) => hit ?? caches.match("/index.html").then((idx) => idx ?? Response.error())),
      ),
  )
})
