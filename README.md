# Starpeace Online — WebClient

A browser-based multiplayer tycoon game client for [Starpeace Online](http://www.starpeaceonline.com), rebuilt from the ground up in TypeScript with React and Canvas 2D isometric rendering.

> **Alpha 0.1.0** — Under active development

## Overview

Starpeace Online is a massively multiplayer economic simulation where players build companies, trade goods, run for office, and compete in a persistent online world. This project is a modern web client that replaces the original Delphi Win32 client, connecting to the existing game servers via the RDO (Remote Data Objects) protocol.

```
Browser Client ──WebSocket──▶ Node.js Gateway ──RDO Protocol──▶ Game Servers
```

The Node.js gateway translates WebSocket messages into raw TCP/RDO commands, handling authentication, session management, and asset serving. The browser client renders the isometric game world on Canvas 2D and provides the full game UI in React.

## Features

- **Isometric Canvas 2D engine** — 9-layer renderer (terrain, vegetation, concrete, roads, buildings, zones, placement preview, road preview, UI overlays) with chunk caching and texture atlases
- **React UI with Zustand state** — 45+ components across HUD, building inspector, empire management, mail, chat, politics, transport, search, and build menu
- **Four-stage cinematic login** — Authentication → Zone → World → Company selection with glassmorphism and animated backgrounds
- **MMORPG-style HUD** — Top bar, left/right rails, slide-in panels, command palette (Cmd+K), minimap
- **Mobile-responsive** — Bottom navigation, bottom sheets, touch handling
- **Building inspector** — Real-time facility data with tabbed property groups, supply/demand charts, pricing controls
- **Empire overview** — Company facilities, financial summaries, favorites
- **In-game mail** — Folder-based mail with compose, reply, and draft support
- **Chat system** — Channel-based chat with typing indicators
- **Mock server** — Capture-based test server that replays recorded RDO sessions for development without a live game server

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict mode) |
| Client UI | React 19, Zustand, CSS Modules, Lucide icons |
| Rendering | Canvas 2D isometric engine (custom) |
| Server | Node.js, WebSocket (ws), HTTP |
| Protocol | RDO over TCP (binary/text, type-prefixed values) |
| Build | Vite (client), tsc (server) |
| Testing | Jest, ts-jest (~1900 tests across 72 suites) |
| Accessibility | React Aria Components |

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9

### Install & Run

```bash
npm install
npm run dev        # Build all + start server on port 8080
```

Then open `http://localhost:8080` in your browser.

### Commands

```bash
npm run build          # Build server (tsc) + client (Vite)
npm run dev            # Build + start server
npm test               # Run all tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | WebSocket/HTTP server port |
| `RDO_DIR_HOST` | `www.starpeaceonline.com` | RDO directory server host |
| `LOG_LEVEL` | `info` | Logging verbosity |

## Architecture

```
src/
├── client/
│   ├── main.tsx                 # Vite entry — boots client, mounts React
│   ├── App.tsx                  # Root router (LoginScreen ↔ GameScreen)
│   ├── client.ts                # StarpeaceClient — game logic controller
│   ├── context.ts               # ClientContext (React ↔ client bridge)
│   ├── store/                   # 11 Zustand stores
│   ├── components/              # 45+ React components (CSS Modules)
│   │   ├── common/              # Badge, Toast, GlassCard, Skeleton, …
│   │   ├── hud/                 # TopBar, LeftRail, RightRail
│   │   ├── building/            # BuildingInspector, QuickStats, PropertyGroup
│   │   ├── empire/              # EmpireOverview, FacilityList, FinancialSummary
│   │   ├── mail/                # MailPanel
│   │   ├── chat/                # ChatStrip
│   │   ├── modals/              # BuildMenu, Settings, CompanyCreation
│   │   └── mobile/              # MobileShell, BottomNav, BottomSheet
│   └── renderer/                # Canvas 2D isometric engine (30 files)
├── server/
│   ├── server.ts                # HTTP + WebSocket server
│   ├── spo_session.ts           # RDO session manager (TCP ↔ WebSocket)
│   ├── rdo.ts                   # RDO protocol parser
│   └── services/                # Background services (update, textures, map data, chunks)
└── shared/
    ├── rdo-types.ts             # RDO type system (RdoValue, RdoCommand, RdoParser)
    ├── config.ts                # Environment-aware configuration
    └── types/                   # Shared TypeScript interfaces
```

## RDO Protocol

The game servers speak a custom RDO (Remote Data Objects) protocol over TCP. Values are type-prefixed:

| Prefix | Type | Example |
|--------|------|---------|
| `#` | Integer | `#42` |
| `%` | String | `%Hello` |
| `!` | Float | `!3.14` |
| `@` | Double | `@3.14159` |
| `$` | Short string | `$ID` |
| `^` | Variant | `^value` |
| `*` | Void | `*` |

Commands are built with a type-safe builder:

```typescript
import { RdoValue, RdoCommand } from '@/shared/rdo-types';

const cmd = RdoCommand.sel(objectId)
  .call('RDOSetPrice').push()
  .args(RdoValue.int(priceId), RdoValue.float(value))
  .build();
```

See [doc/rdo_typing_system.md](doc/rdo_typing_system.md) for the full protocol reference.

## API Endpoints

The Node.js server exposes REST endpoints for map data, textures, and asset serving:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/map-data/:mapName` | Map terrain, buildings, and roads |
| `GET /api/terrain-atlas/:type/:season` | Terrain atlas PNG sprite sheets |
| `GET /api/object-atlas/:category` | Road/concrete atlas sprite sheets |
| `GET /api/terrain-chunk/:map/:type/:season/:zoom/:i/:j` | Pre-rendered terrain chunk tiles |
| `GET /cache/:category/:filename` | Extracted game object textures |
| `GET /proxy-image?url=<url>` | Image proxy for remote assets |

## Documentation

Detailed technical docs live in the [doc/](doc/) directory:

- [RDO Protocol Architecture](doc/rdo-protocol-architecture.md)
- [RDO Typing System](doc/rdo_typing_system.md)
- [Building Details Protocol](doc/building_details_protocol.md)
- [Facility Inspector Reference](doc/facility-tabs-reference.md)
- [Road Rendering](doc/road_rendering.md)
- [Concrete Rendering](doc/concrete_rendering.md)
- [Mock Server Guide](doc/mock-server-guide.md)
- [E2E Testing](doc/E2E-TESTING.md)
- [CAB Asset Extraction](doc/CAB-EXTRACTION.md)

## License

ISC
