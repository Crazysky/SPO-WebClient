# Starpeace Online - Web Client

A modern TypeScript web client for Starpeace Online, a browser-based multiplayer tycoon/simulation game.

## Overview

This project provides a web-based client that communicates with legacy Starpeace Online game servers using a custom RDO (Remote Data Objects) protocol via WebSocket gateway.

## Features

- **Real-time Multiplayer:** Connect to persistent game worlds with other players
- **Building Management:** Place, manage, and customize buildings with detailed property controls
- **Map Rendering:** HTML5 Canvas-based map visualization with roads, buildings, and zones
- **Chat System:** In-game chat with other players
- **Building Details:** Comprehensive building information panels with editable properties
- **Placement Validation:** Client-side collision detection for roads, buildings, and zones

## Tech Stack

### Frontend
- TypeScript (vanilla, no framework)
- HTML5 Canvas for rendering
- WebSocket client for real-time communication
- Vite for development

### Backend (Gateway)
- Node.js
- WebSocket server (`ws` library)
- Custom RDO protocol parser

## Getting Started

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm 9+

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Build and start development server
npm run dev
```

The client will be available at `http://localhost:3000` (or the port specified in your configuration).

### Build for Production

```bash
# Build both client and server
npm run build

# Start production server
npm start
```

## Project Structure

```
src/
├── client/              # Browser-side code
│   ├── client.ts        # Main client controller
│   ├── renderer.ts      # Canvas map rendering
│   └── ui/              # UI components
│       ├── building-details/  # Building details panel
│       ├── chat-ui.ts   # Chat interface
│       └── login-ui.ts  # Login screen
├── server/              # Node.js gateway
│   ├── server.ts        # WebSocket server
│   ├── spo_session.ts   # Game session manager
│   └── rdo.ts           # RDO protocol parser
└── shared/              # Shared types & config
    ├── building-details/  # Building property templates
    ├── types.ts         # TypeScript interfaces
    ├── config.ts        # Configuration
    └── logger.ts        # Logging utility

BuildingClasses/         # Game data files (downloaded on first run)
public/                  # Static web assets
dist/                    # Compiled output (generated)
```

## Configuration

Server configuration is located in [src/shared/config.ts](src/shared/config.ts). Key settings:

- `WS_PORT`: WebSocket server port (default: 3000)
- `GAME_SERVER_IP`: Legacy game server address
- `GAME_SERVER_PORT`: Legacy game server port

## Development Guidelines

See [CLAUDE.md](CLAUDE.md) for detailed development guidelines, architecture decisions, and project backlog.

### Code Style
- TypeScript strict mode enabled
- camelCase for variables/methods
- PascalCase for classes/interfaces
- JSDoc comments for public APIs

### Contributing
1. Keep changes focused and small
2. Follow existing code patterns
3. Remove debug logs before committing
4. Test thoroughly before submitting

## License

ISC

## Links

- [Starpeace Online](http://www.starpeaceonline.com)
- [Update Server](http://update.starpeaceonline.com)

---

**Status:** Alpha (Active Development)
**Last Updated:** January 2026
