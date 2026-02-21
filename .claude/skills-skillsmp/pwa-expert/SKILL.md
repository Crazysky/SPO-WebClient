---
name: pwa-expert
description: Progressive Web App development with Service Workers, offline support, and app-like behavior. Use for caching strategies, install prompts, push notifications, background sync. Activate on "PWA", "Service Worker", "offline", "install prompt", "beforeinstallprompt", "manifest.json", "workbox", "cache-first". NOT for native app development (use React Native), general web performance (use performance docs), or server-side rendering.
---

# Progressive Web App Expert

Build installable, offline-capable web apps with Service Workers, smart caching, and native-like experiences.

## When to Use This Skill

- Making a web app installable on mobile/desktop
- Implementing offline functionality
- Setting up Service Worker caching strategies
- Handling install prompts (`beforeinstallprompt`)
- Background sync for offline-first apps
- Managing PWA update flows
- Creating web app manifests

## When NOT to Use This Skill

- **Native app development** -> Use React Native, Flutter, or native SDKs
- **General web performance** -> Use Lighthouse/performance auditing tools
- **Server-side rendering issues** -> Use framework-specific docs
- **Push notifications only** -> Consider dedicated push notification services

## Core Concepts

### What Makes a PWA Installable

1. **HTTPS** (or localhost for dev)
2. **Web App Manifest** with required fields
3. **Service Worker** with fetch handler
4. **Icons** (192x192 and 512x512 minimum)

### The PWA Stack

```
+-------------------------------------------+
|           Your App                        |
+-------------------------------------------+
|         Service Worker (sw.js)            |
|  +-------------+  +-----------------+    |
|  |   Cache     |  |  Network Fetch  |    |
|  |   Storage   |  |    Handling     |    |
|  +-------------+  +-----------------+    |
+-------------------------------------------+
|          manifest.json                    |
|  (App identity, icons, display mode)      |
+-------------------------------------------+
```

## Caching Strategies

| Strategy | Best For | Tradeoff |
|----------|----------|----------|
| Cache-First | Static assets, fonts, images | Stale until cache updated |
| Network-First | API data, user content | Slower, needs connectivity |
| Stale-While-Revalidate | Balance freshness/speed | Background updates |
| Network-Only | Auth, real-time data | No offline support |
| Cache-Only | Versioned assets | Never updates |

## Display Modes

| Mode | Description |
|------|-------------|
| `fullscreen` | No browser UI, full screen |
| `standalone` | App-like, no URL bar (recommended) |
| `minimal-ui` | Some browser controls |
| `browser` | Normal browser tab |

## Background Sync

Queue actions while offline, execute when connectivity returns:

```javascript
// In Service Worker
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncPendingData());
  }
});

// In App - trigger sync
const registration = await navigator.serviceWorker.ready;
await registration.sync.register('sync-data');
```

## Update Flow

Notify users when a new version is available:

```typescript
registration.addEventListener('updatefound', () => {
  const newWorker = registration.installing;
  newWorker?.addEventListener('statechange', () => {
    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
      // New version available - show update prompt
    }
  });
});
```

## Quick Reference

| Task | Solution |
|------|----------|
| Check if installed | `window.matchMedia('(display-mode: standalone)').matches` |
| Force SW update | `registration.update()` |
| Clear all caches | `caches.keys().then(keys => keys.forEach(k => caches.delete(k)))` |
| Check online | `navigator.onLine` |
| Get SW registration | `navigator.serviceWorker.ready` |
| Skip waiting | `self.skipWaiting()` in SW |
| Take control | `self.clients.claim()` in SW |

## Testing PWA

### Debug Checklist

- [ ] Manifest loads (Application -> Manifest)
- [ ] SW registered (Application -> Service Workers)
- [ ] Cache populated (Application -> Cache Storage)
- [ ] Install prompt fires (Console for beforeinstallprompt)
- [ ] Offline page works (Network -> Offline)
- [ ] Update flow works (trigger update, verify prompt)
