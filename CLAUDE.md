# CLAUDE.md

## Project Overview
This is a **TypeScript web client** for Starpeace Online, a browser-based multiplayer tycoon/simulation game. The client communicates with legacy game servers using a custom RDO (Remote Data Objects) protocol via WebSocket gateway.

**Target users:** Players who want to build, manage companies, chat, and interact with a persistent game world through their browser.

## Stack & Structure

### Frontend (Client)
- **Language:** TypeScript (no framework - vanilla TS)
- **Build tool:** Vite
- **Rendering:** HTML5 Canvas (MapRenderer class)
- **Communication:** WebSocket client
- **Entry point:** `src/client/client.ts` (StarpeaceClient class)

### Backend (Gateway)
- **Runtime:** Node.js
- **WebSocket:** `ws` library
- **Protocol:** Custom RDO (Remote Data Objects) ASCII-based protocol
- **Entry point:** `src/server/server.ts`

### Project Structure
src/
├── client/ # Browser-side code
│ ├── client.ts # Main client controller
│ ├── renderer.ts # Canvas map rendering
│ └── ui/ # UI components
│   ├── building-details/ # Building details panel components
│   ├── chat-ui.ts # Chat modal
│   ├── login-ui.ts # Login screen
│   └── ... # Other UI components
├── server/ # Node.js gateway
│ ├── server.ts # WebSocket server & routing
│ ├── spo_session.ts # Game session manager (RDO protocol)
│ └── rdo.ts # RDO protocol parser/formatter
└── shared/ # Shared types & config
├── building-details/ # Building property definitions & templates
├── types.ts # All TypeScript interfaces
├── rdo-types.ts # RDO protocol type system (RdoValue, RdoParser, RdoCommand)
├── config.ts # Server configuration
└── logger.ts # Logging utility


### RDO Protocol Type System
The project uses a type-safe system for handling RDO protocol data:

- **RdoValue** - Fluent API for creating typed values with proper prefixes
  - `RdoValue.int(42)` → `"#42"` (OrdinalId)
  - `RdoValue.string("hello")` → `"%hello"` (OLEStringId)
  - `RdoValue.float(3.14)` → `"!3.14"` (SingleId)
- **RdoParser** - Extract and parse typed values from RDO strings
  - `RdoParser.getValue("#42")` → `'42'`
  - `RdoParser.asInt("#42")` → `42`
- **RdoCommand** - Builder pattern for constructing commands
  - `RdoCommand.sel(id).call('Method').push().args(...).build()`
- **Documentation:** [doc/rdo_typing_system.md](doc/rdo_typing_system.md)
- **Examples:** [doc/rdo_typing_examples.ts](doc/rdo_typing_examples.ts)

### Key Commands
- **Development:** `npm run dev` (starts Vite dev server + backend)
- **Build:** `npm run build` (compiles TS to dist/)
- **Test:** `npm test` (runs Jest test suite)
- **Test Watch:** `npm run test:watch` (runs tests in watch mode)
- **Test Coverage:** `npm run test:coverage` (generates coverage report)
- **Lint:** Not configured (manual code review only)

## Development Rules

### Code Style
- Use **TypeScript strict mode** (see tsconfig.json)
- **Naming:** camelCase for variables/methods, PascalCase for classes/interfaces
- **Comments:** Add JSDoc for public methods; inline comments for complex logic only
- **Error handling:** Always use try-catch for async operations; log errors with context
- **RDO Protocol:** Always use `RdoValue`, `RdoParser`, and `RdoCommand` from [src/shared/rdo-types.ts](src/shared/rdo-types.ts) for type-safe RDO operations (never use manual string concatenation with type prefixes)

### Changes Policy
- **Small, focused changes** - one feature/fix per implementation
- **No large refactors** without explicit approval
- **Preserve existing APIs** - breaking changes require validation
- **Write tests for new code** - Add unit tests for new functions, modules, and features
- **Run tests before committing** - Ensure all tests pass with `npm test`
- **Maintain test coverage** - Don't decrease overall test coverage (currently 93%)

### Debug & Cleanup
- **During development:** Use `console.log` with prefixes like `[Client]`, `[Session]`, `[Renderer]`
- **After bugs are fixed:** Remove all debug `console.log` statements that are not critical for production diagnostics
- Keep only essential logs (errors, warnings, important state changes)

### Git Nomenclature Policy
**Consistent naming ensures clear project history for all developers.**

#### Branch Naming
- **Feature branches:** `feature/<short-description>` (e.g., `feature/building-search`, `feature/rankings-ui`)
- **Bug fixes:** `fix/<issue-description>` (e.g., `fix/road-collision-detection`, `fix/login-timeout`)
- **Hotfixes:** `hotfix/<critical-issue>` (e.g., `hotfix/crash-on-startup`)
- **Refactoring:** `refactor/<area>` (e.g., `refactor/rdo-protocol`, `refactor/renderer`)
- **Documentation:** `docs/<topic>` (e.g., `docs/api-reference`, `docs/setup-guide`)
- **Experiments:** `experiment/<name>` (e.g., `experiment/webgl-renderer`)

#### Commit Message Format
```
<type>: <short summary> (max 72 chars)

<optional detailed description>
- Bullet points for multiple changes
- Reference issues if applicable (#123)

<optional footer>
Co-Authored-By: Name <email@example.com>
```

**Commit Types:**
- `feat:` New feature (e.g., `feat: add building search UI`)
- `fix:` Bug fix (e.g., `fix: road collision detection checking wrong tiles`)
- `refactor:` Code restructuring without behavior change (e.g., `refactor: extract RDO parser into separate module`)
- `perf:` Performance improvement (e.g., `perf: cache facility dimensions on server`)
- `docs:` Documentation only (e.g., `docs: update README with new features`)
- `style:` Code style/formatting (e.g., `style: fix indentation in renderer.ts`)
- `test:` Adding or updating tests (e.g., `test: add unit tests for RDO parser`)
- `chore:` Maintenance tasks (e.g., `chore: update dependencies`, `chore: add .gitignore`)
- `build:` Build system changes (e.g., `build: migrate from esbuild to vite`)

**Examples of Good Commit Messages:**
```
feat: add building details panel with editable properties

Implements template-based building details system with:
- Dynamic tab generation based on building type
- Slider controls for prices and salaries
- Real-time RDO protocol updates
- Sparkline graphs for revenue history

Closes #42

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

```
fix: prevent building placement on roads

Fixed collision detection that was checking 2 tiles instead of 1.
Roads now correctly occupy only their exact tile coordinates.
```

```
docs: update CLAUDE.md with building details implementation

Added comprehensive documentation for:
- Template system architecture
- RDO protocol format examples
- Client/server API endpoints
```

#### Tag Naming (Releases)
- **Semantic versioning:** `v<major>.<minor>.<patch>` (e.g., `v0.1.0`, `v1.0.0`)
- **Pre-release:** `v<version>-alpha.<number>` or `v<version>-beta.<number>` (e.g., `v0.1.0-alpha.1`)
- **Release candidates:** `v<version>-rc.<number>` (e.g., `v1.0.0-rc.1`)

#### Pull Request Naming
- Follow same format as commit messages
- Include issue reference if applicable
- Example: `feat: implement building search menu (#45)`

## Workflow for Feature Implementation

### 1. Questions Phase (if needed)
- Ask **max 3 clarifying questions** if requirements are ambiguous
- Focus on blockers: unclear specs, missing data, conflicting constraints

### 2. Plan Phase
Present a brief plan:
- Files to modify/create
- Key functions/methods to add/change
- Any new dependencies or breaking changes
- Test files to create/update (follow pattern: `module.ts` → `module.test.ts`)
- Testing approach and edge cases to cover

### 3. Implementation Phase
- Provide **diff-style patches** or full file content for small files
- Include file paths in code blocks
- Follow existing patterns in codebase

### 4. Verification Phase
Provide:
- **Test execution:** Run `npm test` to verify all tests pass
- **Manual testing commands:** (e.g., `npm run dev`, open specific URL)
- **UI interactions** to test (e.g., "Click Build menu, select category")
- **Expected behavior** vs. what was broken before
- **Test coverage:** Run `npm run test:coverage` for new modules
- **Known limitations** if any

### 5. Completion & Documentation Phase (MANDATORY)
**After each task completion, ALWAYS:**
1. **Verify completion** - Ask user: "Has this request been fulfilled 100%? Are there any issues or missing elements?"
2. **Update documentation** - If task is complete:
   - Update **CLAUDE.md** Project Backlog section with implementation details
   - Update **README.md** if user-facing features were added
   - Document any new APIs, configuration changes, or architectural decisions
3. **Git commit** - Create a descriptive commit following the Git nomenclature policy (see below)

**Documentation Standards:**
- CLAUDE.md: Technical implementation details, architecture decisions, backlog status updates
- README.md: User-facing features, setup instructions, usage examples
- Keep both files in sync - any feature in README should have corresponding details in CLAUDE.md

## Project Backlog

### CORE
#### RDO Protocol Type System
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Implement type-safe handling of RDO protocol values and commands
- **Implementation:**
  - **Module:** [src/shared/rdo-types.ts](src/shared/rdo-types.ts) - Core type system with RdoValue, RdoParser, RdoCommand classes
  - **Documentation:** [doc/rdo_typing_system.md](doc/rdo_typing_system.md) - Comprehensive guide with examples and migration patterns
  - **RDO Type Prefixes:**
    - `#` (OrdinalId) → Integer values
    - `$` (StringId) → Short string identifiers
    - `^` (VariantId) → Variant type
    - `!` (SingleId) → Float (single precision)
    - `@` (DoubleId) → Double (double precision)
    - `%` (OLEStringId) → Wide string (most common)
    - `*` (VoidId) → Void/no return value
  - **RdoValue API:** Fluent API for creating typed values
    - `RdoValue.int(42)` → `"#42"`
    - `RdoValue.string("hello")` → `"%hello"`
    - `RdoValue.float(3.14)` → `"!3.14"`
  - **RdoParser API:** Extract values from RDO formatted strings
    - `RdoParser.extract("#42")` → `{ prefix: '#', value: '42' }`
    - `RdoParser.getValue("#42")` → `'42'`
    - `RdoParser.asInt("#42")` → `42`
  - **RdoCommand API:** Builder pattern for constructing commands
    - `RdoCommand.sel(id).call('Method').push().args(...).build()`
    - Replaces manual string template construction
    - Type-safe argument handling
  - **Helper Functions:**
    - `rdoArgs()` - Convert mixed values to RdoValue array with auto-detection
  - **Integration:**
    - Updated [src/server/rdo.ts](src/server/rdo.ts) - formatTypedToken/stripTypedToken use RdoValue/RdoParser
    - Migrated [src/server/spo_session.ts](src/server/spo_session.ts) - All manual RDO commands now use RdoCommand builder
    - Commands migrated: SetLanguage, ClientAware, UnfocusObject, RDOLogonClient, RDOStartUpgrades, RDOStopUpgrade, RDODowngrade, MsgCompositionChanged, buildRdoCommandArgs (all building property setters)
- **Benefits:**
  - Type safety: TypeScript compiler catches type mismatches
  - Readability: Self-documenting code (`RdoValue.int(42)` vs `"#42"`)
  - Maintainability: Centralized type handling, single source of truth
  - Debugging: Better error messages, preserved type information

#### RDO Starpeace Online Protocol Refactor
- **Status:** Deferred (implement all features first)
- **Goal:** Optimize network protocol for better performance
- **Blocker:** All game features must be working before refactoring
- **Note:** Type system foundation completed (January 2026)

#### Download key client files from update.starpeaceonline.com
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Ensure web client is compliant with server content files
- **Implementation:**
  - Created `UpdateService` class ([src/server/update-service.ts](src/server/update-service.ts))
  - Downloads missing files from http://update.starpeaceonline.com/five/client/cache/
  - Respects subdirectory structure (BuildingClasses/)
  - Runs at server initialization
  - Currently downloading: BuildingClasses/CLASSES.BIN (155KB)

#### Building Dimensions System (Replaced CLASSES.BIN parser)
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Extract building dimensions and data for placement validation
- **Implementation:**
  - **Replaced** complex CLASSES.BIN parser with simpler CSV approach
  - Migrated from facility.csv to [BuildingClasses/facility_db.csv](BuildingClasses/facility_db.csv) (January 2026)
  - CSV format: `visualClass,Name,FacId_Name,XSize,YSize,Level,FID_Constant`
    - visualClass: Numeric ID as string (matches VisualClass from game server)
    - Name: Building display name
    - FacId_Name: Internal FacID constant name (e.g., FID_Office)
    - XSize, YSize: Building dimensions in tiles
    - Level: Building tier/level
    - FID_Constant: Numeric FID constant value
  - CSV parser in [src/server/facility-csv-parser.ts](src/server/facility-csv-parser.ts)
  - Cache manager in [src/server/facility-dimensions-cache.ts](src/server/facility-dimensions-cache.ts)
  - API endpoint: REQ_GET_FACILITY_DIMENSIONS / RESP_FACILITY_DIMENSIONS
  - Parses 291 unique building definitions (319 entries, 28 duplicates, 15 NOT_FOUND skipped)
  - Duplicate visualClass IDs exist for different building themes (Diss, Magna, Mariko, Moab, PGI) - last entry wins

#### Private and Sensitive Data Security
- **Goal:** Prevent credentials leaks in logs, memory dumps, client-side code
- **Tasks:** Sanitize logs, secure credential storage, validate inputs

#### Network Hazard Protection
- **Goal:** Prevent client from spamming old game servers (sensitive to heavy load)
- **Tasks:** Request throttling, rate limiting, debouncing, circuit breaker pattern

#### General Data Caching
- **Goal:** Cache shared data (e.g., building metadata, zone info) at server level instead of each client requesting separately
- **Tasks:** Implement caching layer in gateway, TTL strategy, cache invalidation

### CODE
#### Project Organization & Git Setup
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Clean up project structure and establish Git repository with proper configuration
- **Implementation:**
  - Created [.gitignore](.gitignore) - Excludes build artifacts (dist/, node_modules/, public/client.js), logs, IDE configs, temporary files
  - Created [.gitattributes](.gitattributes) - Forces LF line endings for source code, marks binary files appropriately
  - Created [README.md](README.md) - Professional documentation with features, tech stack, installation instructions, project structure
  - Updated [package.json](package.json) - Added proper metadata (description, keywords, repository URL, engines requirements)
  - Removed temporary files (nul, tmpclaude-3e1f-cwd)
  - **Git repository initialized:**
    - Initial commit (95e840c): 43 files, 17,294 lines
    - Repository URL: https://github.com/Crazysky/SPO-WebClient
    - Successfully pushed to GitHub
  - **Build verification:** Clean compilation (server: 5 JS files, client: 168KB bundle)
  - **Git nomenclature policy:** Added comprehensive guidelines for branches, commits, tags, and PRs

#### Code Cleanup & Production Readiness
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Remove debug logs and prepare codebase for production
- **Implementation:**
  - Removed 50+ debug console.log statements from client.ts (placement mode, double-click prevention, building focus)
  - Removed ALL [Renderer] prefix debug logs from renderer.ts (~17 statements)
  - Removed emoji characters (✅❌) and verbose debug from server.ts
  - Cleaned up substring debugging in spo_session.ts (lines 494, 499, 715-717)
  - Replaced alert() calls with proper notifications (ui.log and showNotification)
  - Removed unused showPlacementNotification() method
  - Cleaned up unused imports (WorldInfo, RdoVerb, RdoAction, ChatUser, WsRespBuildingPlaced)
  - Kept essential logs: errors, warnings, critical state changes
  - Build verification: Clean compilation with no errors

#### Unit Tests
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Add unit testing framework for critical functions
- **Implementation:**
  - **Framework:** Jest 30.2.0 with ts-jest for TypeScript support
  - **Configuration:** [jest.config.js](jest.config.js) - CommonJS module system, 60% coverage thresholds
  - **Test Files:** 4 test suites, 232 total tests, 215 passing (93%)
  - **Test Documentation:** [TESTING.md](TESTING.md) - Comprehensive testing guide
  - **Coverage:**
    - ✅ RDO Type System ([src/shared/rdo-types.test.ts](src/shared/rdo-types.test.ts)) - 85/85 tests (100%)
    - ✅ RDO Protocol Parser ([src/server/rdo.test.ts](src/server/rdo.test.ts)) - 59/59 tests (100%)
    - ✅ Property Formatting ([src/shared/building-details/property-definitions.test.ts](src/shared/building-details/property-definitions.test.ts)) - 70/70 tests (100%)
    - ⚠️ CSV Parser ([src/server/facility-csv-parser.test.ts](src/server/facility-csv-parser.test.ts)) - 1/18 tests (mock issues)
  - **Test Commands:**
    - `npm test` - Run all tests
    - `npm run test:watch` - Watch mode for development
    - `npm run test:coverage` - Generate coverage report
    - `npm run test:verbose` - Detailed test output
  - **Test Fixtures:** [src/__fixtures__/](src/__fixtures__/) - Sample CSV, RDO packets, building templates
- **Best Practices:**
  - Place tests next to source files: `module.ts` → `module.test.ts`
  - Test behavior, not implementation
  - Cover edge cases (empty strings, null, undefined, NaN, negative numbers)
  - Use descriptive test names: `should return formatted currency for large values`
  - Test roundtrips: format → parse → compare
  - Mock external dependencies (fs, network) using `jest.mock()`
- **Development Workflow:**
  - Write tests first (TDD approach preferred)
  - Run tests before committing: `npm test`
  - Maintain coverage: don't decrease overall test pass rate
  - Add new test data to `__fixtures__/` if needed

### FEATURES
#### Search Menu
- **Goal:** Allow users to search for buildings, companies, players
- **Tasks:** Implement search UI, backend search RDO calls, result rendering

#### Rankings
- **Goal:** Display player/company rankings (wealth, buildings, etc.)
- **Tasks:** Implement ranking menu UI, fetch ranking data from server, pagination

#### List of Buildings (Building Directory)
- **Goal:** Provide users with a directory to manage owned buildings
- **Features:**
  - Sort buildings (by name, type, profit, etc.)
  - Rename buildings
  - Create/delete/rename folders for organization
- **Tasks:** Implement directory UI, folder management logic, persist preferences

#### Change World from Main Screen
- **Goal:** Allow users to switch worlds without closing/restarting client
- **Tasks:** Add world selector to main screen, implement disconnect/reconnect logic, preserve session state

#### Map - Destroy Building
- **Goal:** Allow building owners to demolish their buildings
- **Tasks:** Add "Destroy" action to building context menu, confirm dialog, RDO demolish call, refresh map

#### Map - Set Zone (Public Office Feature)
- **Goal:** Allow users with public office roles to define building types per map tile (zoning)
- **Tasks:** Implement zone editing UI, tile selection, RDO set zone calls, visual zone overlay

#### Map - Build Road (Public Office Feature)
- **Goal:** Allow authorized users to build roads by defining segments (start/end points)
- **Features:**
  - Point-to-point road segment creation
  - Cost preview next to mouse cursor
  - Tile-by-tile cost calculation
- **Tasks:** Implement road drawing mode, segment creation logic, cost calculation, RDO build road calls

#### Building Menu Image Proxy
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Fix building category and facility icons not displaying due to CORS/Referer blocking
- **Implementation:**
  - **Server-side image proxy** ([src/server/server.ts](src/server/server.ts:72-179))
    - New HTTP endpoint: `/proxy-image?url=<encoded_url>`
    - Downloads images from game server and serves them locally
    - Persistent cache in `cache/images/` directory
    - Preserves original filenames for debugging (e.g., `MapPGIFoodStore64x32x0.gif`)
    - Supports GIF, PNG, JPEG formats
  - **URL conversion utility** ([src/server/spo_session.ts](src/server/spo_session.ts:51-69))
    - `convertToProxyUrl()` method converts remote URLs to local proxy URLs
    - Applied in `parseBuildingCategories()` (line 2247) for category icons
    - Applied in `parseBuildingFacilities()` (line 2388) for building icons
  - **Client-side URL handling** ([src/client/ui/build-menu-ui.ts](src/client/ui/build-menu-ui.ts:437-452))
    - Updated `normalizeImagePath()` to recognize proxy URLs (`/proxy-image`)
    - Proxy URLs bypass external domain prefix logic
    - Legacy fallback maintained for non-proxied paths
  - **Git configuration:** Added `cache/images/` to .gitignore (images regenerated on demand)
- **Benefits:**
  - Images display correctly without CORS errors
  - Reduced load on game server (cached locally)
  - Original filenames preserved for debugging
  - Transparent to client code (automatic URL conversion)

#### Building Placement Validation
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Prevent invalid building placement with client-side validation
- **Implementation:**
  - **Building dimensions:** Fetches xsize/ysize from facility.csv via API
  - **Visual preview:** Shows full building footprint (not just 1x1 point)
  - **Road collision detection:** Prevents placing buildings on roads (100% client-side) ✅
  - **Building collision detection:** Prevents placing buildings on other buildings (client-side) ✅
  - **Zone validation:** Checks zone compatibility for entire footprint (when zone overlay enabled)
  - **Water collision detection:** Server-side validation (returns error codes)
- **Client-side responsibilities:**
  - Road collision check (MUST be done client-side) - ✅ Fixed to check exact tile occupation
  - Building collision check (visual feedback) - ✅ Implemented
  - Zone compatibility check (visual feedback)
  - Display building footprint preview with dimensions
- **Server-side responsibilities:**
  - Water collision check
  - Final placement validation
- **Bug Fixes:**
  - Fixed road collision detection that was checking 2 slots instead of 1
  - Roads now correctly occupy only their exact tile coordinates
  - **Coordinate synchronization fix (January 2026):**
    - Fixed 1-tile offset issue where sent coordinates didn't match visual preview
    - Changed click handler ([src/client/renderer.ts](src/client/renderer.ts:618)) to use `placementPreview.x/y` instead of `Math.floor(mouseWorldX/Y)`
    - Updated `getPlacementCoordinates()` method to return preview coordinates directly
    - Ensures coordinates sent to server **always** match the visual preview shown to player
    - Coordinates represent bottom-left corner (closest to 0,0) of building footprint

#### Map Rendering Improvements
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Improve visual consistency for map elements and fix tile occupation conflicts
- **Implementation:**
  - **Roads visualization:** Roads now render as filled tiles (like buildings) instead of lines
    - Each tile of a road segment is filled with gray (#666)
    - Dark border (#444) around each road tile for clarity
    - Consistent with building visualization (1 cell = 1 filled square)
  - **Buildings visualization:** Rendered as filled colored squares with borders
    - Blue (#4a90e2) for buildings
    - Scales consistently with zoom level
    - Buildings positioned at their exact tile coordinates (not centered)
  - **Tile occupation system:** Ensures only one object per tile
    - Buildings have priority over roads
    - Tile occupation map tracks which cells are occupied by buildings
    - Roads skip rendering on tiles occupied by buildings
    - Prevents visual overlapping of objects

#### Building Details System
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Display comprehensive building information based on building type (VisualClass)
- **Architecture:**
  - **Template-based system:** Different building types show different properties
  - **Property groups:** Organized into tabs (Overview, Workforce, Supplies, Services, Finances, etc.)
  - **Editable properties:** Sliders for salaries, prices with immediate server update via RDO
- **Implementation:**
  - **Shared module:** [src/shared/building-details/](src/shared/building-details/)
    - `property-definitions.ts`: PropertyType enum (TEXT, NUMBER, CURRENCY, PERCENTAGE, RATIO, SLIDER, GRAPH, TABLE, etc.)
    - `template-groups.ts`: Pre-defined groups (OVERVIEW_GROUP, WORKFORCE_GROUP, SUPPLIES_GROUP, etc.)
    - `property-templates.ts`: Template registry mapping VisualClass IDs to property groups
  - **Server-side:**
    - `getBuildingDetails()` in spo_session.ts: Fetches all properties using templates, batched requests
    - `setBuildingProperty()`: Sets editable properties via RDO protocol using building's CurrBlock ID
    - Message handlers for REQ_BUILDING_DETAILS and REQ_BUILDING_SET_PROPERTY
    - RDO protocol format: `C sel <CurrBlock> call <RDOCommand> "*" "#0","#<value>";`
    - Example: `C sel 100575368 call RDOSetPrice "*" "#0","#220";`
  - **Client UI:** [src/client/ui/building-details/](src/client/ui/building-details/)
    - `building-details-panel.ts`: Draggable modal panel with dynamic tabs
    - `property-renderers.ts`: Render functions for each PropertyType, multi-event slider handlers
    - `property-table.ts`: Connection tables with nested tabs for supplies
    - `property-graph.ts`: Canvas-based sparkline for MoneyGraph
  - **CSS styles:** Added to design-system.css (~420 lines for panel, tabs, sliders, tables, graphs)
- **Features:**
  - Dynamic tab generation from templates
  - Property value formatting (currency, percentage, ratios)
  - Slider controls for editable values with immediate server update
  - Multi-event handling (mouseup, change, touchend) for cross-browser slider compatibility
  - Nested tabs for supply connections
  - Sparkline graphs for revenue history
  - Generic template fallback for unknown building types
- **API endpoints:** REQ_BUILDING_DETAILS / RESP_BUILDING_DETAILS, REQ_BUILDING_SET_PROPERTY / RESP_BUILDING_SET_PROPERTY
- **Bug Fixes & Improvements (January 2026):**
  - Fixed slider onChange callback initialization in BuildingDetailsPanel constructor
  - Fixed WebSocket message type mismatch (REQBUILDINGSETPROPERTY → REQ_BUILDING_SET_PROPERTY)
  - Fixed RDO protocol to use building's CurrBlock ID instead of worldId
  - Fixed UI logging methods (logBuilding/logError → log with source parameter)
  - Added multiple event listeners (mouseup, change, touchend) for reliable slider updates
  - **RDO Command Refactor (January 2026):**
    - Refactored `setBuildingProperty()` to support multi-argument RDO commands
    - Added `buildRdoCommandArgs()` to build command-specific argument strings
    - Added `mapRdoCommandToPropertyName()` for verification after updates
    - Implemented proper argument formatting for all RDO commands:
      - **RDOSetPrice:** 2 args (price index, new value) → `"#0","#220"`
      - **RDOSetSalaries:** 3 args (Salaries0, Salaries1, Salaries2 - all required) → `"#100","#120","#150"`
      - **RDOSetCompanyInputDemand:** 2 args (input index, demand ratio without %) → `"#0","#75"`
      - **RDOSetInputMaxPrice:** 2 args (MetaFluid ID, new max price) → `"#5","#500"`
      - **RDOSetInputMinK:** 2 args (MetaFluid ID, new minK value) → `"#5","#10"`
    - Client-side automatic mapping: property names (srvPrices0, Salaries2) → RDO commands with params
    - Added `additionalParams` field to WsReqBuildingSetProperty for context-specific data (MetaFluid, indices)
    - Client UI automatically extracts current salary values when updating one salary (RDOSetSalaries requires all 3)
    - **Bug Fix:** Fixed salary property mapping - uses `Salaries0/1/2` (not `srvSalaries`)
  - **Workforce Table Redesign (January 2026):**
    - Restructured Workforce tab to display as 4-column table (Label | Executives | Professionals | Workers)
    - Added new PropertyType: `WORKFORCE_TABLE` for specialized workforce rendering
    - Server-side: Modified `getBuildingDetails()` to handle WORKFORCE_TABLE type and populate workforce properties
    - Client-side: Created `renderWorkforceTable()` function in property-renderers.ts
    - Table rows: Jobs (Workers/WorkersMax ratio), Work Force Quality (%), Salaries (editable input)
    - Salary display: WorkForcePrice in currency (from server) + editable percentage input (0-250%)
    - Empty cells when WorkersMax = 0 for cleaner display
    - Modal width increased from 500px to 650px for better table readability
    - Replaced slider controls with number input fields for direct salary percentage entry
    - CSS fix: Removed `display: flex` from table cells to maintain proper column alignment
  - **Refresh System Redesign (January 2026):**
    - **Removed EVENT_BUILDING_REFRESH mechanism:** Deprecated automatic push-based refresh from server
    - **Added manual refresh button:** Circular refresh icon (↻) in panel header next to close button
    - **Automatic refresh on tab switch:** Data refreshes when switching between tabs (Overview, Workforce, etc.)
    - **Automatic refresh after updates:** Panel refreshes immediately after property changes (salaries, prices)
    - **On-demand architecture:** Refresh callback (`onRefresh`) provided by client, triggers re-fetch of building details
    - **Visual feedback:** Refresh button shows disabled state and rotation animation while loading
    - **CSS styling:** Added `.header-buttons` container, `.header-refresh-btn` with hover/disabled/active states
    - **Benefits:** User control, better performance (only refreshes when needed), cleaner code, no disruption to user input

#### Building Rename Feature
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Allow players to rename their buildings directly from the building details panel
- **Implementation:**
  - **UI Components:** [src/client/ui/building-details/building-details-panel.ts](src/client/ui/building-details/building-details-panel.ts)
    - Added pencil icon (✎) button next to building name in panel header
    - Inline edit mode: Click button → name becomes input field with ✓/✕ buttons
    - Keyboard support: Enter = confirm, Escape = cancel
    - State tracking: `isRenameMode` prevents multiple simultaneous edits
    - Smart UI update: Updates `currentDetails.buildingName` after successful rename
  - **WebSocket Protocol:** [src/shared/types.ts](src/shared/types.ts)
    - Message types: `REQ_RENAME_FACILITY` / `RESP_RENAME_FACILITY`
    - Request: `{ x, y, newName }` - Building coordinates and new name
    - Response: `{ success, newName, message }` - Rename result
  - **Server-side:** [src/server/spo_session.ts](src/server/spo_session.ts:1354-1401)
    - `renameFacility(x, y, newName)` method
    - Uses already-focused building ID when available (optimization)
    - Auto-connects to Construction Service (port 7001) if not already connected
    - RDO protocol: `C sel <CurrBlock> set Name="%<newName>";`
    - Proper string formatting: `%${newName}` for OLEString type
  - **Gateway Handler:** [src/server/server.ts](src/server/server.ts:735-761)
    - `REQ_RENAME_FACILITY` message handler
    - Calls `session.renameFacility()` and returns WebSocket response
    - Error handling with proper error codes
  - **Client Integration:** [src/client/client.ts](src/client/client.ts:812-836)
    - `renameFacility(x, y, newName)` method sends WebSocket request
    - UI log messages for user feedback
    - Error handling with descriptive messages
  - **CSS Styling:** [public/design-system.css](public/design-system.css:800-868)
    - `.rename-btn` - Subtle pencil icon with hover effects
    - `.rename-input` - Styled input field with blue focus border
    - `.rename-confirm-btn` / `.rename-cancel-btn` - Green/red action buttons
    - `.header-title-wrapper` - Flexbox layout for name + rename button
- **Features:**
  - One-click rename access from building details panel
  - Inline editing with confirm/cancel controls
  - Keyboard shortcuts (Enter/Escape)
  - Automatic focus/selection of current name
  - Prevents empty names and unchanged names
  - Uses existing focused building (no re-focus overhead)
  - Auto-connects to Construction Service if needed
- **RDO Protocol Format:** `C <RID> sel <CurrBlock> set Name="%<newName>";`
- **API Endpoints:** REQ_RENAME_FACILITY / RESP_RENAME_FACILITY
- **Benefits:**
  - Quick building renaming without separate menu
  - Professional inline-edit UX pattern
  - Proper RDO SET command formatting
  - Socket reuse optimization (no redundant focus calls)
  - Automatic service connection management

#### Building Upgrade UI Redesign
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Improve upgrade/downgrade UI with better controls and dynamic STOP button for pending upgrades
- **Implementation:**
  - **UI Components:** [src/client/ui/building-details/property-renderers.ts](src/client/ui/building-details/property-renderers.ts:673-788)
    - **Dynamic rendering based on upgrade state:**
      - Normal state (no pending): `Upgrade [-] [qty] [+] [OK]` controls + Downgrade button
      - Pending state (upgrading): `STOP` button replaces upgrade controls + Downgrade button
    - Level display shows `Level X(+N)/Y` when upgrades are pending
    - Added decrement button (-) for quantity adjustment before increment button
    - Changed "VALIDATE" button text to "OK" for clarity
  - **Button Handlers:** [src/client/ui/building-details/building-details-panel.ts](src/client/ui/building-details/building-details-panel.ts:729-796)
    - Wired up `.upgrade-stop-btn` click handler for STOP action
    - Auto-refresh 1 second after all upgrade actions (OK, STOP, Downgrade)
    - Consistent callback pattern across all actions
  - **CSS Styling:** [public/design-system.css](public/design-system.css:1099-1301)
    - `.upgrade-decrement-btn` - Neutral gray button matching increment button style
    - `.upgrade-stop-btn` - Full-width orange button (#ea580c, distinct from blue/red)
    - `.downgrade-btn` - Enhanced full-width red button with hover shadow
    - `.upgrade-row` - Added bottom margin for spacing when STOP button visible
  - **Server Integration:** Already supported via [src/server/spo_session.ts](src/server/spo_session.ts:1320-1347)
    - Maps `STOP_UPGRADE` action to internal `'STOP'` action
    - Sends RDO command: `C sel <CurrBlock> call RDOStopUpgrade "*" ;`
    - Returns success/error status with appropriate message
- **Features:**
  - Quantity adjustment with +/- buttons for precise control
  - Dynamic interface: STOP button only appears when upgrade is pending
  - Color-coded actions: Blue (OK), Orange (STOP), Red (Downgrade)
  - Auto-refresh after each action shows immediate feedback
  - Level display clearly indicates pending upgrades: `Level 2(+2)/5`
  - Consistent UX across all upgrade-related actions
- **RDO Commands:**
  - `RDOStartUpgrades` - Start upgrade (count parameter)
  - `RDOStopUpgrade` - Stop pending upgrade
  - `RDODowngrade` - Downgrade building by 1 level
- **Benefits:**
  - Clear visual feedback of upgrade status
  - One-click stop mechanism when needed
  - Improved quantity control with bidirectional adjustment
  - Auto-refresh eliminates need for manual refresh after actions
  - Cleaner UI: STOP button only shown when relevant

## Session Context for AI Agent

### What You Should Know
- **User decides features** - only implement what is explicitly requested
- **Refer to this file** for architecture, conventions, and backlog status
- **Ask before major changes** - refactors, dependency additions, API changes
- **Provide verification steps** after each implementation

### What You Should Do
1. Read task requirements carefully
2. Propose a plan (if non-trivial) including test strategy
3. **Write tests first** (TDD approach preferred) or alongside implementation
4. Implement changes following code style rules
5. **Run tests** - Execute `npm test` to verify all tests pass
6. Remove debug logs after testing
7. Provide clear verification steps (test + manual)
8. Always code, comment and respond in English
9. **MANDATORY:** After EVERY task completion:
   - Run `npm test` to ensure all tests pass
   - Ask user: "Has this request been fulfilled 100%?"
   - Update CLAUDE.md with implementation details
   - Update README.md if user-facing features were added
   - Create commit following Git nomenclature policy

### What You Should NOT Do
- Do not implement features from backlog unless asked
- Do not refactor large sections without approval
- Do not add new npm dependencies without discussion
- Do not leave debug `console.log` statements in final code (unless essential)
- Do not leave project root folder and sub folders.

---

**Last Updated:** January 2026  
**Project Version:** Alpha (active development)
