---
name: pwa-development
description: Progressive Web Apps - service workers, caching strategies, offline, Workbox
---

# PWA Development Skill

*Load with: base.md*

**Purpose:** Build Progressive Web Apps that work offline, install like native apps, and deliver fast, reliable experiences across all devices.

---

## Core PWA Requirements

```
┌─────────────────────────────────────────────────────────────────┐
│  THE THREE PILLARS OF PWA                                       │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  1. HTTPS                                                       │
│     Required for service workers and security.                  │
│     localhost allowed for development.                          │
│                                                                 │
│  2. SERVICE WORKER                                              │
│     JavaScript that runs in background.                         │
│     Enables offline, caching, push notifications.               │
│                                                                 │
│  3. WEB APP MANIFEST                                            │
│     JSON file describing app metadata.                          │
│     Enables installation and app-like experience.               │
├─────────────────────────────────────────────────────────────────┤
│  INSTALLABILITY CRITERIA (Chrome)                               │
│  ─────────────────────────────────────────────────────────────  │
│  • HTTPS (or localhost)                                         │
│  • Service worker with fetch handler                            │
│  • Web app manifest with: name, icons (192px + 512px),          │
│    start_url, display: standalone/fullscreen/minimal-ui         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Web App Manifest

### Required Fields

```json
{
  "name": "My Progressive Web App",
  "short_name": "MyPWA",
  "description": "A description of what the app does",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

### Manifest Checklist

- [ ] `name` and `short_name` defined
- [ ] `start_url` set (use query param for analytics)
- [ ] `display` set to `standalone` or `fullscreen`
- [ ] Icons: 192x192 and 512x512 minimum
- [ ] Maskable icon included for Android adaptive icons
- [ ] `theme_color` matches app design
- [ ] `background_color` for splash screen

---

## Service Worker Patterns

### Basic Service Worker

```javascript
// sw.js
const CACHE_NAME = 'app-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/scripts/app.js',
  '/offline.html'
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: Serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request))
      .catch(() => caches.match('/offline.html'))
  );
});
```

### Registration

```javascript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('SW registered:', registration.scope);
    } catch (error) {
      console.error('SW registration failed:', error);
    }
  });
}
```

---

## Caching Strategies

| Strategy | Use Case | Description |
|----------|----------|-------------|
| **Cache First** | Static assets (CSS, JS, images) | Check cache, fall back to network |
| **Network First** | API responses, dynamic content | Try network, fall back to cache |
| **Stale While Revalidate** | Semi-static content (avatars, articles) | Serve cache immediately, update in background |
| **Network Only** | Non-cacheable requests (analytics) | Always use network |
| **Cache Only** | Offline-only assets | Only serve from cache |

---

## Offline Experience

### Offline Detection

```javascript
function updateOnlineStatus() {
  const status = navigator.onLine ? 'online' : 'offline';
  document.body.dataset.connectionStatus = status;

  if (!navigator.onLine) {
    showNotification('You are offline. Some features may be unavailable.');
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();
```

### Background Sync (Queue Offline Actions)

```javascript
// sw.js with Workbox
import { BackgroundSyncPlugin } from 'workbox-background-sync';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

const bgSyncPlugin = new BackgroundSyncPlugin('formQueue', {
  maxRetentionTime: 24 * 60 // Retry for 24 hours
});

registerRoute(
  ({ url }) => url.pathname === '/api/submit',
  new NetworkOnly({
    plugins: [bgSyncPlugin]
  }),
  'POST'
);
```

---

## App-Like Features

### Install Prompt

```javascript
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallButton();
});

async function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`User ${outcome === 'accepted' ? 'accepted' : 'dismissed'} install`);
  deferredPrompt = null;
  hideInstallButton();
}
```

### Detecting Standalone Mode

```javascript
function isInstalledPWA() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true; // iOS
}
```

### Push Notifications

```javascript
async function requestNotificationPermission() {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    await subscribeToPush();
  }
  return permission;
}

async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription)
  });
}
```

---

## Quick Reference

### Caching Strategy Cheat Sheet

```
Static Assets (CSS, JS, images)     -> Cache First
API Responses                        -> Network First
User-generated content              -> Stale While Revalidate
Analytics, non-cacheable            -> Network Only
Offline-only assets                 -> Cache Only
```

### Service Worker Lifecycle

```
1. Register -> 2. Install -> 3. Activate -> 4. Fetch
     |              |            |           |
  Load app    Cache assets  Clean old   Serve requests
                            caches      from cache/network
```

## PWA Development Checklist

### Before Launch

- [ ] HTTPS configured (production)
- [ ] Manifest complete with all required fields
- [ ] Icons in all required sizes (192, 512, maskable)
- [ ] Service worker registered and working
- [ ] Offline page created and cached
- [ ] Cache strategies defined for all resource types
- [ ] Install prompt handling implemented
- [ ] Lighthouse PWA audit passes

### After Launch

- [ ] Monitor cache sizes
- [ ] Test SW updates don't break app
- [ ] Track PWA installs via analytics
- [ ] Test on multiple devices/browsers
- [ ] Monitor Core Web Vitals
