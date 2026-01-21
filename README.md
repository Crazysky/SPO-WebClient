# Starpeace Online - Web Client

A modern TypeScript web client for Starpeace Online, a browser-based multiplayer tycoon/simulation game.

## Overview

This project provides a web-based client that communicates with legacy Starpeace Online game servers using a custom RDO (Remote Data Objects) protocol via WebSocket gateway.

## SPO Web Client Features
- **Building Management:** Place, manage, and customize buildings with detailed property controls
- **Isometric Map Rendering:** HTML5 Canvas-based isometric visualization with real terrain textures from BMP map files
  - 4 zoom levels (4×8, 8×16, 16×32, 32×64 pixels per tile)
  - Authentic terrain textures loaded from original game files
  - Layered rendering: terrain, roads, buildings, zone overlays, placement previews
  - Smooth pan and zoom controls
- **Road Building:** Draw horizontal, vertical, and diagonal road segments with visual preview and cost estimation
- **Public Office Roles:** Support for Mayor, Minister, and President roles with automatic company switching
- **Chat System:** In-game chat with other players, change channels
- **Building Details:** Comprehensive building information with property editing and upgrade controls
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

### Git Workflow

**Branch Naming:**
- `feature/<description>` - New features
- `fix/<description>` - Bug fixes
- `docs/<description>` - Documentation updates

**Commit Messages:**
Follow conventional commits format:
```
<type>: <short summary>

<detailed description if needed>
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `style`, `test`, `chore`, `build`

**Example:**
```bash
git commit -m "feat: add building search functionality"
```

See [CLAUDE.md](CLAUDE.md) for complete Git nomenclature policy.

### Contributing

1. **Branch from main:** Create feature/fix branches from latest main
2. **Keep changes focused:** One feature/fix per branch
3. **Follow code patterns:** Match existing codebase style
4. **Remove debug logs:** Clean up console.log statements before committing
5. **Test thoroughly:** Verify all functionality works as expected
6. **Update documentation:** Keep CLAUDE.md and README.md in sync
7. **Descriptive commits:** Use conventional commit format
8. **Pull requests:** Include clear description and reference issues if applicable

## License

ISC

## Links

- [Starpeace Online](http://www.starpeaceonline.com)
- [Update Server](http://update.starpeaceonline.com)

---

**Status:** Alpha (Active Development)
**Last Updated:** January 2026
