# UI/UX Full Refactoring Specification

**Project:** Starpeace Online WebClient
**Scope:** Visual identity, interface architecture, map navigation, mobile experience (PWA/Responsive)
**Status:** Planning phase
**Requirements:** 26

---

## Context for AI Planning Agent

You are refactoring the entire user interface of a browser-based multiplayer tycoon game. The game renders an isometric city map on a Canvas 2D element. Players build and manage companies, construct buildings, trade, and compete for rankings. It is an MMO — social interaction (chat) is central.

The refactoring covers three layers:
1. **Visual identity** — design system, icons, animations, polish
2. **Interface architecture** — layout, navigation, panels, HUD, map controls
3. **Infrastructure** — PWA, responsive, persistence, error handling, reconnection

### What exists today

| Component | Current state | Files |
|-----------|--------------|-------|
| **Login flow** | Left sidebar panel (420px), zone tabs, world cards, company cards grouped by role. Functional but unpolished. | `login-ui.ts`, `index.html` |
| **Header** | Fixed bar: logo + version left, toolbar center, stats right. Toolbar has 8 emoji-icon buttons (Build, Road, Search, Company, Mail, Settings, Refresh, Logout). | `toolbar-ui.ts`, `tycoon-stats-ui.ts` |
| **Tycoon stats** | Glassmorphic pill in header right. Shows: rank+username, buildings x/max, cash, income/hr, prestige, area. No company name or game date. | `tycoon-stats-ui.ts` |
| **Chat** | Draggable floating panel (380x420px), bottom-left. Collapsible. Channels, user list, typing indicator. Hidden behind interactions. | `chat-ui.ts` (879 lines) |
| **Map** | Full Canvas 2D isometric renderer with 9 render layers. Touch support exists (pan, pinch, rotate). Cursor changes: grab/grabbing/pointer/crosshair. Compass drawn at bottom-right with N/E/S/W labels. Q/E for rotation, scroll for zoom, right-drag for pan. No WASD, no arrow keys, no zoom buttons, no minimap. | `isometric-map-renderer.ts`, `isometric-terrain-renderer.ts`, `touch-handler-2d.ts` |
| **Building details** | Draggable glassmorphic panel with tabs. 256+ properties rendered via templates. Has graphs, tables, connections, rename, upgrade/downgrade actions. | `building-details/` (5 files) |
| **Build menu** | Modal (600x70vh), centered. 2-column category grid, then facility list. | `build-menu-ui.ts` |
| **Search menu** | Draggable panel (600x80vh). Pages: Home, Towns, Tycoon Profile, People, Rankings, Banks. | `search-menu/search-menu-panel.ts` |
| **Mail** | Draggable panel. Folder list, message view, compose. | `mail-panel.ts` |
| **Profile** | Draggable panel, 2-column. 6 tabs: Curriculum, Bank, P&L, Suppliers, Companies, Strategy. | `profile-panel.ts` |
| **Zone overlay** | Single toggle button. | `zone-overlay-ui.ts` |
| **Protocol log** | Collapsible console at page bottom. Always present, starts collapsed. | `index.html` inline |
| **Building hover** | Blue semi-transparent footprint fill (globalAlpha=0.3, #5fadff). Minimal visual impact. | `isometric-map-renderer.ts:2558-2564` |
| **Error handling** | `console.error`, `console.warn` scattered. No user-facing notification system. One `alert()` for session loss. | Various |
| **Confirmations** | Only mail delete (browser `confirm()`) and building delete (custom modal). Missing for: logout, road delete, policy changes, downgrades. | Various |
| **Panel animations** | Building details has `scaleIn` animation. All other panels use instant `display: flex/none`. No open/close transitions. | Various |
| **Disconnect** | Status dot turns red. No auto-reconnect, no retry, no modal. User discovers offline state by trying an action. | `client.ts:280-285` |
| **Map loading** | Canvas blank for 2-5s during initial terrain load. No spinner, no progress. Chunks and textures load silently. | `map-navigation-ui.ts` |
| **Persistence** | Zero `localStorage` usage. All UI state lost on refresh. | — |
| **PWA** | None. No manifest, no service worker. Viewport meta tag exists. | — |
| **Responsive** | None. No media queries. Fixed widths. | — |
| **Building list** | Not implemented. No way to see owned buildings or navigate to them. | — |
| **Settings** | Button exists with `onSettings` callback, but no panel implemented. | `toolbar-ui.ts` |
| **Keyboard shortcuts** | Only Q/E (rotate), D (debug), Escape (cancel placement). No WASD, no shortcut help, no discoverable bindings. | `isometric-map-renderer.ts:552-592` |

### Technical stack

- **Rendering:** Vanilla TypeScript, DOM manipulation (`document.createElement`), inline `style.cssText`
- **Styling:** CSS variables in `design-system.css` (glassmorphism base) + `search-menu-styles.css` + heavy inline styles
- **Orchestration:** `UIManager` class — central hub that creates and routes between all UI components
- **State:** Instance variables per component (no state management library)
- **Communication:** WebSocket callbacks (`sendMessage(WsMessage)`)
- **Font:** Inter (Google Fonts)
- **Canvas:** Single `<canvas>` element managed by `IsometricMapRenderer`

### Architecture constraint

The `UIManager` class (`ui-manager.ts`) is the single point of coordination for all UI. All components are instantiated there. Any new component must integrate through this hub.

---

## Requirements (26 items)

### Category A — Layout & Structure

#### REQ-01: Login & Onboarding Flow

**Current:** Side panel with sequential sections (credentials, zone tabs, world list, company list). Quick-and-dirty.

**Target:** A polished, cohesive onboarding experience. The login → zone selection → world selection → company selection must feel like a designed product, not a debug screen. Consider:
- Full-screen or centered modal approach instead of a cramped sidebar
- Step-by-step wizard UX with clear progress indication
- World cards should convey atmosphere (map preview, player count, economy state)
- Company selection must clearly show role grouping (Player vs Mayor/Minister/President)
- Loading states and error feedback integrated (no pop-ups)

**Files to modify:** `login-ui.ts`, `index.html`

---

#### REQ-02: Map-Centric Gameplay Layout

**Current:** Header (logo + toolbar + stats) takes permanent vertical space. Game panel fills the rest.

**Target:** Once the player enters the map, the **entire screen is the map**. The UI is an overlay — transparent, minimal, contextual. Everything serves navigation and strategic decision-making. The header should not eat into map real estate. Consider:
- Floating HUD elements over the canvas instead of a fixed header bar
- Auto-hiding or minimal chrome
- The map should breathe — maximum viewport for the isometric world

**Files to modify:** `index.html`, `ui-manager.ts`, `toolbar-ui.ts`

---

#### REQ-03: Persistent Chat (Always Visible)

**Current:** Draggable floating panel, bottom-left. Collapsible. User can miss messages entirely if collapsed or moved off-screen.

**Target:** Chat is **always visible** without user action. This is an MMO — if a player posts a message, everyone should see it immediately without clicking or opening anything. The chat must blend into the game UI as a native element. Consider:
- Fixed bottom bar, fixed side rail, or transparent overlay at bottom edge
- Semi-transparent so the map shows through
- Compact by default (last N messages visible), expandable for history
- Channel tabs and user list accessible but not eating space by default
- New message indicator if chat area is scrolled up

**Files to modify:** `chat-ui.ts`, `ui-manager.ts`, `index.html`

---

#### REQ-04: Quick-Access Gameplay Actions

**Current:** 8 toolbar buttons in a glassmorphic pill in the header. Emoji icons. All equally weighted.

**Target:** Three key actions must be reachable in **one tap/click**: Build Menu, Search Menu, Profile Menu. These are the player's primary tools. Other actions (Road, Mail, Settings, Logout) are secondary. Consider:
- Floating action buttons on the map edge
- Radial menu on right-click
- Bottom navigation bar (mobile-friendly)
- Clear visual hierarchy: primary actions prominent, secondary actions accessible but quieter

**Files to modify:** `toolbar-ui.ts`, `ui-manager.ts`

---

#### REQ-15: Persistent Tycoon/Company Info Bar

**Current:** Glassmorphic pill in header. Shows rank+username, buildings, cash, income/hr. Missing: company name, game date.

**Target:** Critical company data must be **always visible** in a fixed, permanent location. This is the player's dashboard — never hides, never scrolls away. Must include:
- **Company name** (which company we're connected to)
- **Money available** (cash balance)
- **Game date** (in-game time)
- **Facilities built / max** (building count vs limit)
- **Live revenues** (income per hour or per cycle)
- **Rank** (leaderboard position)
- **Nickname** (player name)

Consider: a slim bar at the top of the screen, or a floating HUD strip at the top edge of the map. Must be compact but always readable.

**Files to modify:** `tycoon-stats-ui.ts`, `ui-manager.ts`

---

#### REQ-13: Protocol Log — Debug Toggle

**Current:** Always present at page bottom, starts collapsed. Click header to expand.

**Target:** Hidden by default behind a **DEBUG ON/OFF toggle** visible on screen. Default state: **ON** during alpha (so developers can quickly check protocol traffic). The toggle itself should be small, unobtrusive, positioned in a corner. When OFF, the protocol console is completely removed from the DOM flow. When ON, it appears as today (collapsible panel at bottom).

**Files to modify:** `index.html`, `ui-manager.ts` (toggle state management)

---

### Category B — Panels & Data Display

#### REQ-05: Building Details — Clean Data Display

**Current:** Draggable glassmorphic panel with dynamic tabs. 256+ properties rendered via templates. Functional but dense.

**Target:** When a player clicks a building, the data must display **cleanly and intuitively**. Tab switching must be smooth and instant. Data layout must be scannable — the player is making economic decisions. Consider:
- Slide-in panel from the right edge (instead of floating drag box)
- Clear data hierarchy: name/type at top, key financials prominent, detailed data in tabs below
- Tabs must have clear labels and smooth transitions
- Connection data (supply/demand) must be visually linked, not just a table
- The panel should feel native to the map, not a separate application

**Files to modify:** `building-details/` (5 files), `ui-manager.ts`

---

#### REQ-10: Building List (New Feature)

**Current:** Not implemented.

**Target:** A panel/sidebar listing **all buildings the player owns**. Clicking a building in the list **centers the map view on it**. This is essential for players managing dozens of buildings across the map. Consider:
- Accessible from the toolbar or a persistent sidebar tab
- Sortable by: type, name, profit, location
- Filterable by: category, status (operating/closed/upgrading)
- Each entry shows: building name, type icon, key financial metric
- Click → map flies to building location and highlights it
- Badge showing total building count

**New file needed:** `building-list-ui.ts`
**Files to modify:** `ui-manager.ts`, `isometric-map-renderer.ts` (for center-on-building), `client.ts` (for data source)

---

#### REQ-07: Political Role / Company Switching

**Current:** Company selection only at login. No runtime switching.

**Target:** Players with political roles (Mayor/Minister/President) frequently switch between their personal company and their political-role company. This must be **fast and effortless**. Consider:
- Company switcher dropdown/pill always visible near the tycoon stats bar
- Session-cached company list (populated at login, not re-fetched every time)
- Manual refresh button to update the list on demand
- Visual distinction between personal company and political role companies
- Switching should be instant — preload session data where possible

**Files to modify:** `tycoon-stats-ui.ts` or new `company-switcher-ui.ts`, `ui-manager.ts`, `client.ts` (session management)

---

### Category C — Map Navigation & Controls

#### REQ-17: Minimap (World Overview)

**Current:** Not implemented. No way to see the full world or current viewport position at a glance.

**Target:** A small corner widget showing the **full world map with a viewport rectangle**. Standard in every tycoon/strategy game. Consider:
- Fixed position: bottom-right or top-right corner of the map
- Shows terrain overview (simplified colors: land=green, water=blue, buildings=dots)
- White/yellow rectangle indicating current viewport bounds
- Click on minimap → navigate to that world position instantly
- Resizable or collapsible for screen space management
- Updates viewport rectangle in real-time as user pans/zooms
- Performance: render at low resolution, update only on pan/zoom (not every frame)

**New file needed:** `minimap-ui.ts` or integrated into `map-navigation-ui.ts`
**Files to modify:** `ui-manager.ts`, `isometric-map-renderer.ts` (expose viewport bounds and world-to-screen mapping)

---

#### REQ-18: Zoom +/- Buttons

**Current:** Zoom only via scroll wheel (desktop) or pinch gesture (mobile). No visible UI controls. Mobile users without multi-touch and trackpad users are stuck.

**Target:** Visible zoom in/out buttons floating on the map. Consider:
- Small `+` / `−` button pair near the compass (bottom-right area)
- Shows current zoom level (e.g., "2x" or dots indicator for 4 levels)
- Click/tap to step through zoom levels (0-3)
- Smooth zoom transition on click (not instant jump)
- Matches the visual style of other floating map controls (refresh, compass)
- Mobile: large enough touch targets (44x44px minimum)

**Files to modify:** `map-navigation-ui.ts` or new `map-controls-ui.ts`, `isometric-map-renderer.ts` (expose zoom API)

---

#### REQ-19: WASD / Arrow Key Map Panning

**Current:** Only Q/E (rotate) and D (debug toggle). Map panning requires right-click-drag (desktop) or touch-drag (mobile). No keyboard panning at all.

**Target:** Full keyboard panning support:
- **WASD** or **Arrow keys** to pan the map in 4 directions
- Continuous smooth scrolling while key held (not single-step per press)
- Speed matches comfortable navigation (adjustable or zoom-level-dependent)
- Does not conflict with chat input focus (disable when typing in chat or any text field)
- Works alongside existing Q/E rotation

**Files to modify:** `isometric-map-renderer.ts` (keyboard handler, lines ~552-592), `isometric-terrain-renderer.ts` (pan API)

---

#### REQ-20: Clickable Compass for Rotation

**Current:** Compass renders N/E/S/W at bottom-right with color-coded labels and directional arrows. Visually polished but **not interactive**. Rotation only via Q/E keys or 2-finger mobile gesture.

**Target:** Make the compass clickable:
- Click on a cardinal direction (N/E/S/W) → snap rotation to that orientation
- Visual hover feedback on compass labels (highlight on mouseover)
- Click animation (brief scale pulse or flash)
- Compass already renders correctly — this adds interactivity to existing visuals
- Must not interfere with map pan/click interactions (compass area = exclusive hit zone)

**Files to modify:** `isometric-map-renderer.ts` (lines ~3398-3471 compass rendering, add hit detection in mouse handler)

---

#### REQ-08: Map Overlays (Zones, Traffic, etc.)

**Current:** Single zone overlay toggle button (`zone-overlay-ui.ts`).

**Target:** Dedicated overlay toggle buttons for multiple strategic data layers. These are **critical decision-making tools** for players planning building placement and supply chains. Consider:
- Floating button group on the map edge (left side or top)
- Toggle buttons for each overlay type: Zones, Traffic, Pollution, Crime, Beauty, Land Values, etc.
- Active overlay highlighted, multiple can be active simultaneously
- Semi-transparent overlay legend when active
- Keyboard shortcuts for quick toggling

**Files to modify:** `zone-overlay-ui.ts` (or replace with `overlay-controls-ui.ts`), `isometric-map-renderer.ts`, `ui-manager.ts`

---

#### REQ-14: Map-Linked Refresh

**Current:** Refresh button in the toolbar menu alongside Build, Road, Search, etc.

**Target:** Refresh action must be **tied directly to the map context**, not buried in a toolbar. The player refreshes the map, not the app. Consider:
- A small refresh icon floating near the map (top-right corner, near zoom controls)
- Or integrated with the map navigation controls
- Animated feedback on click (spin icon, subtle map flash)
- This is a map operation, so it belongs near the map

**Files to modify:** `toolbar-ui.ts` (remove from toolbar), new map overlay button or `map-navigation-ui.ts`

---

#### REQ-09: Context-Sensitive Cursors

**Current:** Partially implemented. `grab` (default), `grabbing` (dragging), `pointer` (hovering building), `crosshair` (road placement mode). No link/connection cursor.

**Target:** Full cursor feedback system:
- `grab` — default state, can pan the map
- `grabbing` — actively panning
- `pointer` — hovering a clickable building (inspect mode)
- `crosshair` — placement mode (building or road)
- `alias` or custom cursor — connection/link mode (future: linking buildings to supply chains)

The cursor is communication. The player should always know what action they'll perform by looking at the cursor.

**Files to modify:** `isometric-map-renderer.ts` (lines ~3570-3720)

---

#### REQ-16: Building Hover Effect — Premium Feel

**Current:** When hovering a building on the map, the footprint tiles are filled with semi-transparent blue (`globalAlpha=0.3, #5fadff`). Minimal, flat.

**Target:** A **much cooler visual effect** that makes the interaction feel premium. But it must be **performance-conscious** — no frame drops, no GPU spikes. The isometric renderer runs on a frame budget. Consider:
- Outline glow (2-3px stroke with blur, cheaper than fill)
- Brightness boost on the building texture itself (`ctx.globalCompositeOperation = 'lighter'`)
- Animated pulse on the footprint outline (subtle, low-cost)
- Color tint on the building texture (multiply blend)
- Shadow expansion under the building on hover
- Key constraint: this runs every frame for hovered building. Must cost < 1ms. Profile before and after.

**Files to modify:** `isometric-map-renderer.ts` (lines ~2558-2575, the `isHovered` block + `drawBuildingFootprint`)

---

### Category D — Infrastructure & Resilience

#### REQ-06: Error Handling — Inline Notifications

**Current:** `console.error`/`console.warn` only. No user-facing error display. One `alert()` for session loss. Basic `showNotification()` exists in `client.ts` but is minimal.

**Target:** All errors displayed **inline in the UI** as contextual, non-disruptive notifications. Never modal pop-ups. The project has an error index that categorizes errors — use it to adapt notification severity and message. Consider:
- Toast notifications (bottom-right or top-right corner)
- Different severity levels: info (blue), warning (amber), error (red), success (green)
- Auto-dismiss with configurable duration
- Stack for multiple notifications
- Clickable for details where relevant
- Error index maps to specific user-friendly messages

**New file needed:** `notification-ui.ts`
**Files to modify:** `ui-manager.ts`, `client.ts` (error paths)

---

#### REQ-21: Disconnect/Reconnect Handling

**Current:** When WebSocket drops, status dot turns red and `'Gateway Disconnected.'` logged. No auto-reconnect. No user-facing feedback beyond a small status dot. `alert('Session lost, please reconnect')` used for session loss — a raw browser alert.

**Target:** Robust connection management with clear visual feedback:
- **Auto-reconnect** with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- **Visual overlay**: semi-transparent "Reconnecting..." banner over the map during reconnect attempts
- **Connection state indicator**: clear status in the HUD (not just a dot) — Connected / Reconnecting / Offline
- **Toast notification** when connection is restored ("Reconnected successfully")
- **Request queuing**: if user performs action while disconnected, queue it and replay on reconnect (or warn)
- **Retry button**: after max retries exhausted, show "Connection lost — Retry" button
- Replace `alert()` calls with the notification system (REQ-06)

**Files to modify:** `client.ts` (WebSocket lifecycle, lines ~270-320), `ui-manager.ts`, new reconnect overlay logic

---

#### REQ-22: Panel Open/Close Animations

**Current:** Building details panel has `scaleIn` keyframe animation. All other panels (Mail, Profile, Search, Build Menu) use instant `display: flex` / `display: none` — no transition, no feedback.

**Target:** Every panel must have enter/exit animations:
- **Enter:** Slide-in from edge, or fade+scale (200-300ms, ease-out)
- **Exit:** Reverse of enter (150-200ms, ease-in)
- **Tab switching** within panels: crossfade content (100-150ms)
- Animations must use CSS transitions/keyframes (GPU-accelerated `transform` + `opacity` only — no layout-triggering properties)
- Respect `prefers-reduced-motion`: disable animations for users who opt out
- Building details already has `scaleIn` — extend this pattern to all panels

**Files to modify:** `mail-panel.ts`, `profile-panel.ts`, `search-menu/search-menu-panel.ts`, `build-menu-ui.ts`, `chat-ui.ts`, `design-system.css` (shared keyframes)

---

#### REQ-23: Confirmation for Destructive Actions

**Current:** Only mail delete (`confirm()`) and building delete (custom modal) have confirmations. Missing for: logout, road segment deletion, facility downgrade/upgrade, diplomatic policy changes, auto-connection deletion.

**Target:** Every destructive or hard-to-reverse action must have a confirmation step:
- **Logout**: "You will be disconnected. Continue?"
- **Road deletion**: "Delete this road segment?"
- **Facility downgrade**: "Downgrade will reduce capacity. Cost: $X. Continue?"
- **Policy change**: "Change diplomatic stance to Enemy? This affects trade."
- **Auto-connection deletion**: "Remove this supplier connection?"
- Use a **consistent confirmation component** (not browser `confirm()`) — inline modal or bottom-sheet style
- Confirmations should be fast (one click to confirm, Escape to cancel)
- For low-risk confirmations, consider a brief "Undo" toast instead of blocking confirmation

**New file needed:** `confirm-dialog-ui.ts` (reusable component)
**Files to modify:** `client.ts`, `profile-panel.ts`, `building-details/building-details-panel.ts`

---

#### REQ-24: Map Loading Indicator

**Current:** When entering the game, canvas is blank for 2-5 seconds while terrain chunks and textures load. No spinner, no progress, no feedback. Building textures appear silently when ready — buildings render as nothing until their texture arrives.

**Target:** Clear visual feedback during map initialization:
- **Initial load**: Centered spinner or progress bar over the canvas with "Loading world..." message
- **Chunk loading**: Subtle shimmer/skeleton on tiles being fetched (or a loading indicator at viewport edge)
- **Texture loading**: Buildings render with a placeholder silhouette (not invisible) until texture arrives
- **Error recovery**: If chunk/texture fails to load, show retry indicator on affected area
- Progress indicator should feel integrated into the game aesthetic, not a generic spinner

**Files to modify:** `map-navigation-ui.ts`, `isometric-map-renderer.ts`, `game-object-texture-cache.ts` (placeholder texture)

---

#### REQ-25: localStorage Persistence for Preferences

**Current:** Zero `localStorage` or `sessionStorage` usage in the entire client. Every UI state is lost on page refresh: chat panel position/collapsed state, zoom level, rotation, last opened tab, overlay preferences, debug toggle state.

**Target:** Persist user preferences across sessions using `localStorage`:
- **Map state**: Last zoom level, rotation, map center position
- **UI state**: Chat collapsed/expanded, debug toggle on/off, last active overlay(s)
- **Panel positions**: If panels remain draggable, remember last position
- **Preferences**: Any settings from the settings panel (REQ-04 settings button)
- **Session hint**: Last selected world/zone (pre-fill on next login)
- Use a `PreferencesManager` utility class with typed get/set methods
- Graceful fallback if localStorage is unavailable (private browsing)
- Version the storage schema to handle migrations

**New file needed:** `preferences-manager.ts` (shared utility)
**Files to modify:** All UI components that have restorable state

---

#### REQ-26: Keyboard Shortcuts Help Panel

**Current:** Only Q/E (rotate), D (debug toggle), Escape (cancel placement), 1-5 (debug layers). No documentation visible to the user. No way to discover available shortcuts.

**Target:** A discoverable keyboard shortcuts reference:
- **Trigger**: Press `?` key (when not in a text field) or click a help button in settings
- **Display**: Lightweight overlay showing all available shortcuts grouped by category
  - **Map**: WASD/arrows (pan), Q/E (rotate), scroll (zoom), +/- (zoom)
  - **Actions**: B (build), S (search), P (profile), M (mail), Escape (cancel/close)
  - **Overlays**: number keys for overlay toggles
  - **Debug**: D (toggle), 1-5 (layers)
- **Dismiss**: Press `?` again, Escape, or click outside
- Semi-transparent overlay, doesn't hide the map entirely
- Updates automatically if new shortcuts are added (data-driven, not hardcoded HTML)

**New file needed:** `shortcuts-help-ui.ts`
**Files to modify:** `ui-manager.ts`, `isometric-map-renderer.ts` (register `?` key handler)

---

### Category E — Visual & Polish

#### REQ-12: Visual Identity & Design System

**Current:** Glassmorphism base with CSS variables. Inter font. Dark theme only. Emoji icons. Inline styles dominate.

**Target:** Cohesive, polished visual language across all screens. Consider:
- Replace emoji icons with a proper icon set (Lucide, Phosphor, or custom SVG)
- Consistent spacing, sizing, and color application
- Migrate inline `style.cssText` to CSS classes where patterns repeat
- Dark theme refinement with accent colors per context (build=green, search=blue, finance=gold, etc.)
- Subtle animations: panel open/close, tab transitions, data updates
- Typography hierarchy: clear distinction between headings, labels, values, captions
- `prefers-reduced-motion` media query: disable non-essential animations for users who opt out

**Files to modify:** `design-system.css`, all UI components (icon + style migration)

---

#### REQ-11: Mobile / PWA / Responsive

**Current:** No PWA manifest, no service worker, no media queries, no responsive layout. Touch handler exists for canvas.

**Target:** Full responsive design + PWA infrastructure.
- **PWA:** `manifest.json`, service worker for offline shell caching, app-install banner
- **Responsive breakpoints:** Desktop (>1200px), Tablet (768-1200px), Mobile (<768px)
- **Mobile layout:** Bottom navigation bar for primary actions, collapsible panels, full-width modals
- **Touch:** The canvas touch handler already exists — extend to UI panels (swipe to dismiss, etc.)
- **Orientation:** Support both portrait and landscape on mobile

**New files needed:** `manifest.json`, `service-worker.ts`, responsive CSS additions
**Files to modify:** `index.html`, `design-system.css`, all UI components (responsive behavior)

---

## Planning Guidance

### Dependency graph

```
TIER 0 — FOUNDATIONS (no dependencies, unlock everything else)
├── REQ-12 (Design System)        ──> All visual components depend on this
├── REQ-06 (Notifications)        ──> Error paths across all components
├── REQ-25 (localStorage)         ──> All state persistence depends on this
└── REQ-22 (Panel Animations)     ──> All panel components benefit from shared keyframes

TIER 1 — LAYOUT DECISIONS (defines where everything goes)
├── REQ-02 (Map-Centric Layout)   ──> Defines game-time page structure
│   ├── REQ-15 (Tycoon Info Bar)  ──> Position decided by layout
│   ├── REQ-13 (Debug Toggle)     ──> Position decided by layout
│   └── REQ-03 (Chat)             ──> Position decided by layout
└── REQ-11 (PWA/Responsive)       ──> Breakpoints affect all layout choices

TIER 2 — MAP CONTROLS (depend on layout, form a cohesive control cluster)
├── REQ-17 (Minimap)              ──> Needs layout + map viewport API
├── REQ-18 (Zoom Buttons)         ──> Needs layout + map zoom API
├── REQ-19 (WASD Panning)         ──> Independent, but fits with map controls
├── REQ-20 (Clickable Compass)    ──> Independent, extends existing compass
├── REQ-08 (Overlays)             ──> Needs layout for button group position
├── REQ-14 (Map Refresh)          ──> Needs layout for button position
└── REQ-24 (Map Loading)          ──> Needs map renderer hooks

TIER 3 — PANELS & FEATURES (depend on layout + design system)
├── REQ-04 (Quick Actions)        ──> Needs layout decision
├── REQ-05 (Building Details)     ──> Needs layout + animation system
├── REQ-10 (Building List)        ──> Needs layout + map center-on API
├── REQ-07 (Company Switching)    ──> Depends on REQ-15 (info bar)
├── REQ-01 (Login Flow)           ──> Independent, can parallel with tier 2-3
├── REQ-23 (Confirmations)        ──> Depends on REQ-06 (notifications) or standalone
└── REQ-21 (Disconnect/Reconnect) ──> Depends on REQ-06 (notifications)

TIER 4 — POLISH (independent, can be done in any order)
├── REQ-09 (Cursors)              ──> Independent
├── REQ-16 (Hover Effect)         ──> Independent, canvas-only
└── REQ-26 (Shortcuts Help)       ──> Depends on REQ-19 (defines new shortcuts)
```

### Suggested phasing

**Phase 0 — Foundation (unlock everything)**
REQ-12 (design system), REQ-06 (notifications), REQ-25 (localStorage), REQ-22 (panel animations)

**Phase 1 — Layout revolution (define the page)**
REQ-02 (map-centric layout), REQ-15 (tycoon info bar), REQ-13 (debug toggle), REQ-11 (PWA skeleton + responsive breakpoints)

**Phase 2 — Map controls (the player's hands)**
REQ-17 (minimap), REQ-18 (zoom buttons), REQ-19 (WASD panning), REQ-20 (clickable compass), REQ-14 (map refresh), REQ-24 (map loading indicator)

**Phase 3 — Core gameplay panels**
REQ-03 (chat always visible), REQ-04 (quick actions), REQ-05 (building details), REQ-08 (overlay controls)

**Phase 4 — Features & flows**
REQ-01 (login flow), REQ-07 (company switching), REQ-10 (building list), REQ-21 (disconnect/reconnect), REQ-23 (confirmations)

**Phase 5 — Polish & completeness**
REQ-09 (cursors), REQ-16 (hover effect), REQ-26 (shortcuts help), REQ-11 (responsive completion)

### Constraints

- **No framework migration.** This stays vanilla TypeScript + DOM. No React/Vue/Svelte.
- **Canvas rendering is untouched.** The isometric engine (terrain, buildings, roads, concrete) is stable. UI changes are DOM overlays only, except for REQ-16 (hover effect), REQ-09 (cursors), REQ-17 (minimap), REQ-19 (WASD), and REQ-20 (compass click) which touch canvas event/render code.
- **WebSocket protocol is frozen.** UI changes must work with the existing `WsMessage` types. New messages may be added for building list data (REQ-10) and company switching (REQ-07).
- **Testing required.** All new components need unit tests. Coverage must stay >= 93%.
- **Performance budget.** The renderer targets 60fps. Any DOM overlay must not trigger layout thrashing during render frames. Building hover effect (REQ-16) must cost < 1ms per frame. Minimap (REQ-17) must not re-render every frame.

### File inventory

```
src/client/ui/
├── ui-manager.ts              (329 lines) — Orchestrator, touched by ALL requirements
├── login-ui.ts                (414 lines) — REQ-01
├── chat-ui.ts                 (879 lines) — REQ-03, REQ-22
├── toolbar-ui.ts              (433 lines) — REQ-04, REQ-14
├── tycoon-stats-ui.ts         (309 lines) — REQ-15, REQ-07
├── build-menu-ui.ts           (~400 lines) — REQ-04, REQ-22, REQ-23
├── zone-overlay-ui.ts         (99 lines) — REQ-08
├── map-navigation-ui.ts       (162 lines) — REQ-14, REQ-18, REQ-24
├── mail-panel.ts              (~600 lines) — REQ-22, REQ-23
├── profile-panel.ts           (~1100 lines) — REQ-04, REQ-22, REQ-23
├── search-menu/
│   ├── search-menu-panel.ts   (~800 lines) — REQ-04, REQ-22
│   └── index.ts
├── building-details/
│   ├── building-details-panel.ts (~950 lines) — REQ-05, REQ-22, REQ-23
│   ├── property-renderers.ts  — REQ-05
│   ├── property-table.ts      — REQ-05
│   ├── property-graph.ts      — REQ-05
│   └── index.ts

New files:
├── notification-ui.ts         — REQ-06
├── building-list-ui.ts        — REQ-10
├── company-switcher-ui.ts     — REQ-07
├── overlay-controls-ui.ts     — REQ-08 (replaces zone-overlay-ui.ts)
├── minimap-ui.ts              — REQ-17
├── map-controls-ui.ts         — REQ-18 (zoom buttons + refresh button cluster)
├── confirm-dialog-ui.ts       — REQ-23
├── shortcuts-help-ui.ts       — REQ-26
├── preferences-manager.ts     — REQ-25 (shared utility, not UI)

src/client/renderer/
├── isometric-map-renderer.ts  — REQ-09, REQ-16, REQ-17, REQ-19, REQ-20, REQ-24
├── isometric-terrain-renderer.ts — REQ-19 (pan API)
├── game-object-texture-cache.ts  — REQ-24 (placeholder textures)

src/client/
├── client.ts                  — REQ-06, REQ-07, REQ-10, REQ-21, REQ-23, REQ-25

public/
├── index.html                 — REQ-01, REQ-02, REQ-13, REQ-24
├── design-system.css          — REQ-12, REQ-22
├── search-menu-styles.css     — REQ-12 (consolidate into design-system.css)
├── manifest.json              — REQ-11 (new)
├── service-worker.js          — REQ-11 (new)
```

### Key data types involved

```typescript
// Company switching (REQ-07)
interface CompanyInfo {
  name: string;
  ownerRole: string; // 'Président' | 'Ministre' | 'Maire' | 'Player'
  // ... existing fields
}

// Tycoon stats (REQ-15) — needs extension
interface TycoonStats {
  username: string;
  cash: string;
  incomePerHour: string;
  ranking: number;
  buildingCount: number;
  maxBuildings: number;
  // MISSING — need to add:
  companyName: string;
  gameDate: string;
}

// Building list (REQ-10) — new
interface OwnedBuilding {
  id: string;
  name: string;
  visualClass: string;
  category: string;
  x: number;
  y: number;
  status: 'operating' | 'closed' | 'upgrading';
  profit: number;
}

// Preferences persistence (REQ-25) — new
interface UserPreferences {
  mapZoom: number;
  mapRotation: number;
  mapCenterX: number;
  mapCenterY: number;
  chatCollapsed: boolean;
  debugEnabled: boolean;
  activeOverlays: string[];
  lastZone: string;
  lastWorld: string;
}

// Notification system (REQ-06) — new
interface Notification {
  id: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  message: string;
  detail?: string;
  duration: number; // ms, 0 = persistent
  dismissible: boolean;
}
```

---

## Scope exclusions (separate projects)

These were identified during audit but are too large to bundle into this refactoring:

| Item | Reason for exclusion |
|------|---------------------|
| **Full i18n/localization** | Currently mixed EN/FR hardcoded strings. Requires string extraction across all files, locale file format, language switcher UI. Separate project. |
| **Audio system** | Zero audio infrastructure. Sound effects, music, mute toggle. Requires asset pipeline, audio manager, UX design for sounds. Separate project. |
| **Tutorial/onboarding** | Guided first-run experience for new players. Requires game design decisions, step-by-step scripting engine, contextual tooltips. Separate project. |
| **Full WCAG AA accessibility** | ARIA roles, focus trapping, screen reader support, tab order management across all modals. Foundational rework. Separate project. |
| **Theme switching (light mode)** | Dark theme is appropriate for this game. Light mode is low priority. |
| **Undo system** | Undo stack for destructive actions (building delete, property changes). Requires server-side support for reversal. Separate project. |
| **Edge scrolling** | Pan by moving mouse to screen edges. Low priority, conflicts with UI elements at edges. |
| **Drag-select multiple buildings** | Rectangle selection for batch operations. Requires new interaction mode. Separate project. |
| **Map bookmarks/favorites** | Save/recall map positions. Nice-to-have, can add after REQ-25 persistence layer is in place. |

---

## Success Criteria

1. A player logging in for the first time feels guided and the experience is polished
2. Once in the map, the UI is invisible until needed — the map dominates
3. Chat messages are impossible to miss
4. Build, Search, and Profile are one tap away on any device
5. Building inspection feels like a native panel, not a dialog box
6. Errors inform the player without interrupting gameplay
7. Company switching for political roles is instant
8. Overlay data helps strategic planning without being always-on clutter
9. The cursor always tells the player what will happen on click
10. Building list gives ownership overview and map navigation
11. The game works on mobile with touch controls
12. The visual design feels cohesive and premium
13. Debug tools are available but don't pollute the gameplay experience
14. Map refresh is contextual and satisfying
15. Company/tycoon data is always in peripheral vision
16. Hovering a building feels polished, not placeholder
17. The minimap gives instant spatial awareness of the full world
18. Zoom is accessible without scroll wheel or pinch gesture
19. The map is navigable entirely from keyboard
20. The compass is interactive, not just decorative
21. Network disruptions are handled gracefully with clear feedback
22. Panel transitions feel smooth and intentional
23. Destructive actions always have a safety net
24. Map loading never shows a blank void
25. User preferences survive page refresh
26. Available keyboard shortcuts are discoverable
