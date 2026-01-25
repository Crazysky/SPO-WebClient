# CLAUDE.md - Starpeace Online WebClient

## Project Overview

**Name:** Starpeace Online WebClient
**Type:** Browser-based multiplayer tycoon game client
**Stack:** TypeScript + Node.js + WebSocket + Canvas Rendering
**Protocol:** RDO (Remote Data Objects) - legacy ASCII protocol
**Status:** Alpha (0.1.0)

## Essential Commands

```bash
npm run dev          # Build + start server
npm run build        # Build all (server + client)
npm test             # Run Jest tests (414 tests, 93% coverage)
npm run test:watch   # Tests in watch mode
npm run test:verbose # Verbose test output
```

## Architecture

```
Browser Client ──WebSocket──> Node.js Gateway ──RDO Protocol──> Game Servers
```

### Directory Structure

```
src/
├── client/           # Frontend (TypeScript + Canvas)
│   ├── client.ts     # Main controller
│   ├── renderer/     # Isometric rendering engine
│   └── ui/           # UI components
├── server/           # Gateway server
│   ├── server.ts     # HTTP/WebSocket server
│   ├── spo_session.ts # RDO session manager
│   ├── rdo.ts        # RDO protocol parser
│   └── services/     # Background services
└── shared/           # Shared code
    ├── rdo-types.ts  # RDO type system (CRITICAL)
    ├── types/        # Type definitions
    └── building-details/ # Property templates
```

## RDO Protocol Type System (CRITICAL)

**Always use type-safe classes. Never construct RDO strings manually.**

```typescript
import { RdoValue, RdoCommand } from '@/shared/rdo-types';

// CORRECT - Type-safe
const cmd = RdoCommand.sel(objectId)
  .call('RDOSetPrice')
  .push()
  .args(RdoValue.int(priceId), RdoValue.float(value))
  .build();

// FORBIDDEN - Manual string
const cmd = `SEL ${objectId}*CALL %RDOSetPrice^PUSH^#${priceId}*!${value}`;
```

**RDO Type Prefixes:**
| Prefix | Type | Example |
|--------|------|---------|
| `#` | Integer (OrdinalId) | `#42` |
| `%` | String (OLEStringId) | `%Hello` |
| `!` | Float (SingleId) | `!3.14` |
| `@` | Double (DoubleId) | `@3.14159` |
| `$` | Short string (StringId) | `$ID` |
| `^` | Variant (VariantId) | `^value` |
| `*` | Void (VoidId) | `*` |

## Testing

**Policy: All code changes require tests. Coverage must stay >= 93%.**

### Commands

```bash
npm test                              # Run all tests
npm run test:watch                    # Watch mode
npm run test:coverage                 # Generate coverage report
npm test -- --clearCache              # Clear Jest cache
npm test -- rdo-types                 # Run specific test file
npm test -- --testNamePattern="RdoValue"  # Run specific suite
```

### Test Structure

```
src/
├── shared/
│   ├── rdo-types.test.ts                    # 85 tests - RDO type system
│   └── building-details/
│       └── property-definitions.test.ts     # 70 tests - Property formatting
├── server/
│   ├── rdo.test.ts                          # 59 tests - RDO protocol parser
│   ├── facility-csv-parser.test.ts          # 18 tests - CSV parsing
│   └── __tests__/rdo/
│       └── building-operations.test.ts      # 30 tests - Building operations
├── client/renderer/
│   └── *.test.ts                            # 153 tests - Road rendering system
└── __fixtures__/                            # Test data (CSV, RDO packets)
```

### Writing Tests

**File convention:** `module.ts` -> `module.test.ts` (same directory)

```typescript
import { describe, it, expect } from '@jest/globals';
import { MockRdoSession } from '@/server/__mocks__/mock-rdo-session';

describe('Feature', () => {
  let mockSession: MockRdoSession;

  beforeEach(() => {
    mockSession = new MockRdoSession();
  });

  it('should format command correctly', async () => {
    const cmd = await mockSession.simulateCommand(arg);
    expect(cmd).toMatchRdoCallFormat('MethodName');
  });
});
```

### Custom Jest Matchers

- `toContainRdoCommand(method, args?)` - Check RDO command presence
- `toMatchRdoCallFormat(method)` - Validate CALL format
- `toMatchRdoSetFormat(property)` - Validate SET format
- `toHaveRdoTypePrefix(prefix)` - Check type prefix

### Best Practices

1. **Test behavior, not implementation**
2. **Test edge cases** - Empty strings, null, undefined, NaN, negatives
3. **Test roundtrips** - format -> parse -> compare
4. **Mock external deps** - Use `jest.mock()` for fs, network

## Code Style

- **TypeScript strict mode** enabled
- **Naming:** camelCase (variables/methods), PascalCase (classes/interfaces)
- **No `any` types** - project has 0 `any` types
- **Error handling:** try-catch for async, logs with context
- **Comments:** JSDoc for public API only

## Development Rules

1. **Read before modify** - Always read existing code first
2. **Small focused changes** - One feature/fix at a time
3. **Tests required** - All new code needs tests
4. **Run tests before commit** - `npm test` must pass
5. **No breaking changes** - Without explicit approval
6. **No over-engineering** - Keep solutions simple

## Key Session Concepts

- `worldContextId` - ID for world operations (map focus, queries)
- `interfaceServerId` - ID for building operations

## WebSocket Message Types

- Client -> Server: `WsReq*` types
- Server -> Client: `WsResp*` types
- Use `sendResponse()`, `sendError()` from handler-utils

## Files Never Modify Without Discussion

- `src/shared/rdo-types.ts` - Core RDO type system
- `src/server/rdo.ts` - RDO protocol parser
- `BuildingClasses/facility_db.csv` - Building database
- `src/__fixtures__/*` - Test fixtures

## Git Conventions

### Branch Naming

- `feature/description` - New features
- `fix/issue` - Bug fixes
- `refactor/area` - Refactoring
- `doc/topic` - Documentation

### Commit Format

```
type: short summary (max 72 chars)

Optional detailed description
- Bullet points
- Reference issues (#123)
```

**Types:** `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`

## Services (ServiceRegistry)

| Service | Purpose | Dependencies |
|---------|---------|--------------|
| `update` | Sync game assets | none |
| `facilities` | Building dimensions | update |
| `textures` | Extract CAB textures | update |
| `mapData` | Map data caching | update |

## Documentation

| Document | Purpose |
|----------|---------|
| [doc/BACKLOG.md](doc/BACKLOG.md) | Feature backlog & project status |
| [doc/rdo_typing_system.md](doc/rdo_typing_system.md) | RDO type system (RdoValue, RdoParser, RdoCommand) |
| [doc/building_details_protocol.md](doc/building_details_protocol.md) | Building details RDO protocol |
| [doc/road_rendering.md](doc/road_rendering.md) | Road rendering API & overview |
| [doc/road_rendering_reference.md](doc/road_rendering_reference.md) | Road rendering technical reference (reverse-engineered) |
| [doc/concrete_rendering.md](doc/concrete_rendering.md) | Concrete texture system & water platforms |

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check `npm install`, Node.js >= 18 |
| Tests fail | Run `npm run test:verbose` |
| RDO errors | Verify type prefixes (#, %, !, etc.) |
| WebSocket disconnect | Check game server status |

## Current Test Status

- **Test Suites:** 14 passed
- **Tests:** 497 total (479 passing, 18 skipped)
- **Coverage:** 93%
- **Threshold:** 60% minimum (tracking higher)
