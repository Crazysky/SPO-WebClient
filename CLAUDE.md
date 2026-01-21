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

#### Automatic synchronization with update.starpeaceonline.com
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Automatically mirror complete server structure without hardcoded file/directory lists
- **Implementation:**
  - **UpdateService class** ([src/server/update-service.ts](src/server/update-service.ts))
    - **Fully automatic** - No hardcoded directory or file lists
    - **Bidirectional sync** - Downloads missing files AND removes orphaned files
    - **Dynamic discovery** - Recursively parses HTML directory listings from update server
    - Runs at every server startup
  - **Architecture:**
    - **`discoverRemoteStructure()`** - Recursively discovers all files/directories on server
    - **`buildLocalInventory()`** - Scans local cache to identify existing files
    - **`syncAll()`** - Compares remote vs local, downloads missing, removes orphaned, extracts CAB files
    - **Excluded files:** `BuildingClasses/facility_db.csv` (local customization), `.cab-metadata.json` (extraction tracking)
  - **Synchronization process (4 steps):**
    1. **Discover remote structure** - Parses HTML listings recursively (max depth: 10)
    2. **Scan local cache** - Builds inventory of existing files/directories
    3. **Download missing files and extract CABs** - Downloads files present on server but not locally, auto-extracts CAB archives
    4. **Remove orphaned files** - Deletes files/directories not present on server (except excluded and CAB-extracted files)
  - **Image proxy** ([src/server/server.ts](src/server/server.ts))
    - **Dynamic directory scanning** - No hardcoded image directory list
    - Automatically discovers all subdirectories in `cache/` at runtime
    - Falls back to downloading from update server if not found
    - Game server fallback images cached in `webclient-cache/` (separate from update mirror)
    - **Cache lookup order:**
      1. Check `cache/` subdirectories (update server mirror)
      2. Check `webclient-cache/` (game server fallback images)
      3. Download from update server → save to `cache/`
      4. Download from game server → save to `webclient-cache/`
      5. Return 1x1 transparent PNG placeholder on failure
  - **Directory Structure:**
    - **`cache/`** - Perfect mirror of update.starpeaceonline.com/five/client/cache/
    - **`webclient-cache/`** - WebClient-specific needs (game server fallback images, local data)
    - **Separation:** Update server content vs. local client needs kept distinct
  - **Statistics tracked:**
    - Downloaded: New files from server
    - Extracted: CAB archives processed
    - Deleted: Orphaned local files removed
    - Skipped: Files already present locally
    - Failed: Download/deletion/extraction errors
  - **Safety features:**
    - Max recursion depth: 10 levels
    - Excluded files list prevents deletion of local customizations
    - Empty directory cleanup (only removes directories not on server)
    - Case-insensitive filename matching for cross-platform compatibility
  - **Bug Fixes (January 2026):**
    - **webclient-cache read-after-write issue:** Fixed cache directory that was write-only (images cached but never served from cache)
      - Added cache lookup between update server check and download fallback
      - Enables reuse of successfully cached game server images
      - Cache hit logged: `[ImageProxy] Served from webclient-cache: filename.jpg`
    - **Repeated 404 download attempts:** Fixed missing images causing repeated failed downloads
      - Now caches placeholder PNG with original filename when image not found (404)
      - First request: Attempts download → fails → caches placeholder
      - Subsequent requests: Serves cached placeholder (no network call, no error logs)
      - Eliminates console spam for same missing images
      - Logged: `[ImageProxy] Cached placeholder for missing image: filename.jpg`
    - **False 404 errors (January 2026):** Fixed HTML parser incorrectly capturing parent directory links as subdirectories
      - Parser was extracting "[To Parent Directory]" links, causing false 404 warnings like `Cannot access BuildingClasses/cache: HTTP 404`
      - Updated `parseDirectoryListing()` to filter out parent directory links by checking link text
      - Result: Clean synchronization logs with exactly 64 real directories discovered (down from 129+ false paths)
  - **CAB File Auto-Extraction (January 2026):**
    - **Automatic extraction:** CAB archives (`.cab`) automatically extracted when downloaded or on first run
    - **Smart tracking system:** `.cab-metadata.json` tracks extracted files and CAB modification times
      - Metadata format: `{ "path/to/file.cab": { "extractedFiles": [...], "cabModifiedTime": 123456789 } }`
      - Protected from orphan deletion: Extracted files never deleted as orphaned because they're tracked in metadata
    - **Update detection:** If CAB file updated on server (different mtime):
      1. Deletes all previously extracted files
      2. Re-extracts the new CAB
      3. Updates metadata with new file list
    - **Cross-platform support:**
      - Windows: Uses `C:\Windows\System32\expand.exe` (full path to avoid Unix tool conflicts)
      - Linux/Mac: Uses `cabextract` command
      - Executes via `cmd.exe` shell on Windows for proper path handling
    - **Extraction logic:**
      - Takes snapshot of directory before extraction
      - Only tracks new files (not pre-existing)
      - Handles first-run (all files) vs re-extraction (new files only)
      - Example: 76 CAB archives extracted on first run containing thousands of files
    - **Metadata exclusion:** `.cab-metadata.json` excluded from synchronization (local-only file)
    - **Files extracted:** Building classes, car/plane data, images, textures, map data, sounds, translations
  - **Benefits:**
    - **Zero maintenance** - Adapts automatically to server changes
    - **No code updates needed** - Server structure changes don't require code modifications
    - **Bidirectional sync** - Adds new files AND removes obsolete ones
    - **Perfect mirror** - Local cache always matches remote server exactly
    - **Automatic cleanup** - Removes files that no longer exist on server
    - **Clean separation** - Update server mirror vs. local cache kept distinct
    - **Efficient caching** - Both update server and game server images cached and reused
    - **Clean logs** - No false 404 errors, clear synchronization output
    - **Fully automatic CAB handling** - No manual extraction needed, smart update detection
    - **Protected extracted files** - Tracking system prevents accidental deletion of CAB contents

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
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Allow users to search for buildings, companies, players, and view rankings
- **Implementation:**
  - **Server-side modules:**
    - `SearchMenuService` ([src/server/search-menu-service.ts](src/server/search-menu-service.ts)) - HTTP service fetching legacy ASP pages
    - `search-menu-parser.ts` ([src/server/search-menu-parser.ts](src/server/search-menu-parser.ts)) - HTML parsing with cheerio for 6 page types
    - Uses **DAAddr** (Directory Agent) retrieved from RDO session for HTTP requests (port 80)
    - Image proxy integration: all images automatically converted to `/proxy-image` URLs
  - **Client-side UI:**
    - `SearchMenuPanel` ([src/client/ui/search-menu/search-menu-panel.ts](src/client/ui/search-menu/search-menu-panel.ts)) - Draggable modal panel
    - Navigation system with back button and page history stack
    - 7 page renderers: Home, Towns, Tycoon Profile, People, Rankings, Ranking Detail, Banks
  - **WebSocket Protocol:** 8 message pairs (REQ/RESP) for all search menu operations
  - **CSS Styling:** [public/search-menu-styles.css](public/search-menu-styles.css) - Glassmorphism design matching existing UI
- **Features:**
  - **Home Page:** Category grid (People, Towns, You, Rankings, Banks, Capitol-disabled)
  - **Towns:** List with mayor, population, unemployment, quality of life, "Show in map" links
  - **Tycoon Profile:** Photo, name, company, cash, ranking display
  - **People Search:** Alphabetical index (A-Z) + search form
  - **Rankings:** Collapsible hierarchical tree navigation with expand/collapse icons
    - Top-level categories (NTA, etc.) start expanded by default
    - Level-based indentation (20px/40px/60px) for visual hierarchy
    - Click category name → Navigate to detail, click row → Toggle expand/collapse
    - Smooth animations for expand icons (90° rotation)
    - Compact spacing (2px gaps) for better fit in panel
  - **Ranking Detail:** Top 3 podium with large photos + full ranking list
  - **Banks:** Placeholder (usually empty on servers)
- **Architecture Decisions:**
  - **Two-server model:** Game server (RDO protocol) + Directory Agent (HTTP/ASP pages)
  - **Event-based messaging:** Uses `sendMessage()` without Promise to allow responses to route through `handleSearchMenuResponse()`
  - **Category ID mapping:** ASP filenames → IDs (Tycoons.asp → "Tycoons", not "People")
- **Bug Fixes:**
  - Fixed timeout issue: `fetchPage()` now uses `daAddr` instead of `interfaceServerHost`
  - Fixed message routing: Created separate `sendMessage()` method without `wsRequestId` to bypass Promise system
  - Fixed category click handlers: Updated switch/case to match actual ASP filenames (Tycoons, RenderTycoon)
  - **Parser Fixes (January 2026):**
    - **"YOU" profile button:** Fixed to use actual tycoon name from session instead of literal string "YOU" ([src/server/search-menu-service.ts:154-156](src/server/search-menu-service.ts#L154-L156))
    - **Rankings page empty:** Fixed case-sensitive HTML attribute selectors - changed from `tr[onmouseOver]` to `tr[dirhref]` for reliable parsing ([src/server/search-menu-parser.ts:209](src/server/search-menu-parser.ts#L209))
    - **People search "no results":** Fixed selector to use `tr[dirhref]` instead of case-sensitive event handler attributes ([src/server/search-menu-parser.ts:189](src/server/search-menu-parser.ts#L189))
    - **Rankings tree structure:** Fixed nested table detection logic - correctly traverses gradient rows to find child tables ([src/server/search-menu-parser.ts:233-237](src/server/search-menu-parser.ts#L233-L237))
    - **Ranking detail 500 error:** Fixed URL parameter extraction - extracts `Ranking` value from full dirHref URL and preserves backslashes in path ([src/server/search-menu-service.ts:194-210](src/server/search-menu-service.ts#L194-L210))
    - **Missing profile pictures:** Added 1x1 transparent PNG placeholder for 404 images instead of error response ([src/server/server.ts:108-113](src/server/server.ts#L108-L113), [src/server/server.ts:149-153](src/server/server.ts#L149-L153))
    - **Incorrect image URLs (404 errors):** Fixed image path construction to use proper directory structure
      - Images were using `/images/` instead of `/five/0/visual/voyager/new%20directory/images/`
      - Added `baseUrl` parameter to `parseHomePage()` ([src/server/search-menu-parser.ts](src/server/search-menu-parser.ts))
      - Updated all parse functions to construct full paths: `http://<host>/five/0/visual/voyager/new%20directory/<relative-path>`
      - Fixed missing `/` separator between baseUrl and relative path (caused `new%20directoryimages/` instead of `new%20directory/images/`)
      - Affected functions: `getHomePage()`, `getTowns()`, `getTycoonProfile()`, `getRankingDetail()`
      - Images now download successfully and cache properly
    - **Root cause:** HTML uses `onMouseOver` (capital M, capital O) but cheerio selectors were case-sensitive; switched to attribute-based selectors (`dirHref`) for reliability
  - **UI/UX Improvements (January 2026):**
    - **Rankings page optimization:** Implemented collapsible tree structure to fit extensive ranking categories within panel ([public/search-menu-styles.css](public/search-menu-styles.css), [src/client/ui/search-menu/search-menu-panel.ts](src/client/ui/search-menu/search-menu-panel.ts#L469-L526))
    - Reduced vertical spacing from large gaps to 2px for compact display
    - Added expand/collapse icons (▶) with smooth rotation animation
    - Level-specific styling: bold backgrounds for level-0, lighter text/smaller fonts for level-2/3
    - Smart click behavior: category name navigates, row click toggles expansion
- **API Endpoints:** REQ/RESP pairs for HOME, TOWNS, TYCOON_PROFILE, PEOPLE, PEOPLE_SEARCH, RANKINGS, RANKING_DETAIL, BANKS
- **Documentation:**
  - [SEARCH_MENU_SIMULATION.md](SEARCH_MENU_SIMULATION.md) - Complete URL patterns and testing guide
  - [SEARCH_MENU_FIX.md](SEARCH_MENU_FIX.md) - DAAddr configuration fix details
- **Benefits:**
  - No RDO protocol needed (uses existing HTTP server)
  - Image caching via proxy reduces server load
  - Draggable, resizable modal interface
  - Consistent glassmorphism design
  - Map integration for town navigation

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
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Allow building owners to demolish their buildings
- **Implementation:**
  - **UI Components:** [src/client/ui/building-details/building-details-panel.ts](src/client/ui/building-details/building-details-panel.ts)
    - Added trash icon button (🗑️) in panel header (left of refresh button)
    - Confirmation popup modal with building name display
    - Confirm (red) and Cancel (gray) buttons
    - Click outside backdrop to dismiss
    - State management prevents multiple simultaneous deletions
  - **WebSocket Protocol:** [src/shared/types.ts](src/shared/types.ts)
    - Message types: `REQ_DELETE_FACILITY` / `RESP_DELETE_FACILITY`
    - Request: `{ x, y }` - Building coordinates
    - Response: `{ success, message }` - Deletion result
  - **Server-side:** [src/server/spo_session.ts](src/server/spo_session.ts:1404-1447)
    - `deleteFacility(x, y)` method
    - RDO protocol: `C sel <World ID> call RDODelFacility "^" "#<x>","#<y>";`
    - **Critical:** Uses `worldId` (from `idof World`), NOT building's CurrBlock ID
    - Auto-connects to Construction Service (port 7001) if needed
    - Clears focused building cache after successful deletion
  - **Gateway Handler:** [src/server/server.ts](src/server/server.ts:766-791)
    - `REQ_DELETE_FACILITY` message handler
    - Calls `session.deleteFacility()` and returns WebSocket response
    - Error handling with proper error codes
  - **Client Integration:** [src/client/client.ts](src/client/client.ts:842-867)
    - `deleteFacility(x, y)` method sends WebSocket request
    - Automatically refreshes map after successful deletion
    - UI log messages for user feedback
  - **UI Manager:** [src/client/ui/ui-manager.ts](src/client/ui/ui-manager.ts:115-133)
    - Updated `showBuildingDetailsPanel()` to accept `onDelete` callback
  - **CSS Styling:** [public/design-system.css](public/design-system.css:491-1396)
    - `.header-delete-btn` - Red-themed trash button with transparency
    - `.delete-confirmation-backdrop` - Full-screen dark overlay
    - `.delete-confirmation-dialog` - Centered modal with glassmorphism
    - `.delete-confirm-btn` / `.delete-cancel-btn` - Red confirm, gray cancel
    - Animations: fadeIn for backdrop, scaleIn for dialog
- **Features:**
  - Trash icon button (🗑️) in building details panel header
  - Two-step safety: Click delete → Confirm/Cancel dialog
  - Shows building name in confirmation message
  - Red-themed UI for destructive action
  - Automatic panel close and map refresh after deletion
  - Click outside backdrop to cancel
- **RDO Protocol Format:** `C sel <World ID> call RDODelFacility "^" "#<x>","#<y>";`
- **API Endpoints:** REQ_DELETE_FACILITY / RESP_DELETE_FACILITY
- **Important Notes:**
  - `sel` parameter MUST use `worldId` obtained from `idof World` request
  - Does NOT use building's `CurrBlock` ID (unlike rename/property updates)
  - Coordinates are the only parameters needed after World ID is established
- **Benefits:**
  - Safe deletion with confirmation popup
  - Professional UX with red-themed destructive action styling
  - Proper RDO CALL command formatting
  - Automatic cleanup of focused building state
  - Map refreshes immediately to show deletion

#### Map - Set Zone (Public Office Feature)
- **Goal:** Allow users with public office roles to define building types per map tile (zoning)
- **Tasks:** Implement zone editing UI, tile selection, RDO set zone calls, visual zone overlay

#### Map - Build Road (Public Office Feature)
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Allow authorized users to build roads by defining segments (start/end points)
- **Implementation:**
  - **Shared Types:** [src/shared/types.ts](src/shared/types.ts)
    - Message types: `REQ_BUILD_ROAD`, `RESP_BUILD_ROAD`, `REQ_GET_ROAD_COST`, `RESP_GET_ROAD_COST`
    - Interfaces: `WsReqBuildRoad`, `WsRespBuildRoad`, `WsReqGetRoadCost`, `WsRespGetRoadCost`
    - `RoadDrawingState` interface for tracking drawing mode state
  - **Server-side:** [src/server/spo_session.ts](src/server/spo_session.ts:1585-1747)
    - `generateRoadSegments(x1, y1, x2, y2)` - Generates segment array for path
      - Horizontal/Vertical: Single segment
      - Diagonal: Multiple 1-tile segments in staircase pattern
      - Algorithm: Alternates H/V moves, prioritizes axis with most remaining distance
    - `buildRoad(x1, y1, x2, y2)` method - Creates road path via RDO
      - Sends segments sequentially to game server
      - Supports partial builds (continues if some segments fail)
      - Returns total cost and tile count
    - `getRoadCostEstimate(x1, y1, x2, y2)` method - Calculates cost preview
    - RDO protocol: `C sel <WorldContextId> call CreateCircuitSeg "^" "#<circuitId>","#<ownerId>","#<x1>","#<y1>","#<x2>","#<y2>","#<cost>";`
    - **CRITICAL:** Uses `worldContextId` (from Logon response), NOT `interfaceServerId` (static per world)
    - Uses `fTycoonProxyId` (from InitClient packet) for road ownership, not `tycoonId`
    - Cost calculation: `ROAD_COST_PER_TILE * tileCount` (2,000,000 per tile)
  - **Gateway Handler:** [src/server/server.ts](src/server/server.ts:810-860)
    - `REQ_BUILD_ROAD` message handler - Calls `session.buildRoad()` and returns result
    - `REQ_GET_ROAD_COST` message handler - Returns cost estimate
    - Error handling with RDO error code mapping
  - **Client Renderer:** [src/client/renderer.ts](src/client/renderer.ts:74-90, 632-1015)
    - Road drawing mode state: `roadDrawingMode`, `roadDrawingState`
    - `setRoadDrawingMode(enabled)` - Toggles drawing mode
    - `setOnRoadSegmentComplete(callback)` - Callback when segment drawn
    - `setOnRoadDrawingCancel(callback)` - Callback on ESC/right-click
    - Mouse event handling: mousedown starts, mousemove updates preview (no snapping), mouseup completes
    - `generateStaircasePath(x1, y1, x2, y2)` - Generates staircase path tiles (mirrors server logic)
    - `checkStaircaseCollision(pathTiles)` - Validates no buildings in staircase path
    - `drawRoadDrawingPreview()` - Visual preview with staircase pattern and cost display
  - **Client Controller:** [src/client/client.ts](src/client/client.ts:890-970)
    - `toggleRoadBuildingMode()` - Toggles mode on/off (cancels building placement if active)
    - `cancelRoadBuildingMode()` - Exits mode and resets UI
    - `buildRoadSegment(x1, y1, x2, y2)` - Sends WebSocket request, refreshes map on success
    - ESC key handler for cancellation
    - Toolbar button callback wiring
  - **Toolbar UI:** [src/client/ui/toolbar-ui.ts](src/client/ui/toolbar-ui.ts:103-108, 337-354)
    - Road button (🛤️ icon) with "Build Roads" tooltip
    - `setOnBuildRoad(callback)` - Sets callback for button click
    - `setRoadBuildingActive(active)` - Sets button active state (orange styling)
  - **CSS Styling:** [public/design-system.css](public/design-system.css:1395-1430)
    - Road button active state: Orange background (#ea580c), orange border
    - Road preview tooltip styling
    - Road notification styling
- **Features:**
  - **Point-to-point drawing:** Click and drag to define path start/end
  - **Diagonal roads:** Supports horizontal, vertical, AND diagonal paths (staircase pattern)
  - **Real-time preview:** Shows exact staircase path that will be built
  - **Cost preview:** Shows tile count and cost near cursor during drawing (Manhattan distance: dx + dy)
  - **Collision detection:** Client-side building collision check for entire staircase path
  - **Visual feedback:** Orange button highlight when mode active, green/red preview based on validity
  - **ESC/Right-click cancellation:** Easy exit from drawing mode
  - **Map refresh:** Automatic map refresh after successful road placement
  - **Partial builds:** If some segments fail, successfully built segments remain
- **Diagonal Road Algorithm (Staircase Pattern):**
  - **Reverse-engineered** from official client RDO captures
  - Diagonal paths built as series of 1-tile H/V segments alternating direction
  - Example: (462,492) → (465,490) becomes 5 segments: H-V-H-V-H
    1. (462,492) → (463,492) horizontal
    2. (463,492) → (463,491) vertical
    3. (463,491) → (464,491) horizontal
    4. (464,491) → (464,490) vertical
    5. (464,490) → (465,490) horizontal
  - Algorithm prioritizes axis with most remaining distance
  - 100% compatible with official client behavior
- **RDO Protocol:**
  - Command: `CreateCircuitSeg`
  - Parameters: circuitId (1 for roads), ownerId (fTycoonProxyId), x1, y1, x2, y2, cost
  - Uses `worldContextId` (from Logon response, dynamic per session)
  - Each segment is a separate RDO call sent sequentially
- **Validation Rules:**
  - Supports horizontal, vertical, and diagonal paths (via staircase)
  - Building collision check along entire staircase path
  - Cost calculated as Manhattan distance (dx + dy) * $2,000,000 per tile
- **API Endpoints:** REQ_BUILD_ROAD / RESP_BUILD_ROAD, REQ_GET_ROAD_COST / RESP_GET_ROAD_COST
- **Implementation Notes (January 2026):**
  - **No H/V snapping:** Mouse endpoint follows cursor freely for natural diagonal drawing
  - **Client-server parity:** Client preview uses same staircase algorithm as server
  - **Sequential sending:** Segments sent one-by-one with server response validation
  - **Error resilience:** Partial success if only some segments fail
- **Bug Fixes (January 2026):**
  - Fixed to use `worldContextId` instead of `interfaceServerId` for CreateCircuitSeg command
  - `worldContextId` is dynamic (changes with each login), `interfaceServerId` is static per world
  - Enables proper road building after company switching

#### Public Office Role System
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Support public office roles (Mayor, Minister, President) with role-based authentication and company switching
- **Architecture:**
  - **Role-based companies:** Players can have special companies representing public office positions
  - **Company ownership role:** Identified by `companyOwnerRole` attribute in company list (HTML response)
  - **Switch company mechanism:** Re-authenticates with role as username, maintains session state
  - **Multi-session support:** Manages multiple socket connections per player (world, directory, construction)
- **Implementation:**
  - **Session Management:** [src/server/spo_session.ts](src/server/spo_session.ts)
    - **InitClient packet parsing (Lines 100-104, 1997-2021):** Extracts 4 values from server push command:
      - `virtualDate` (Double @) - Server's virtual date
      - `accountMoney` (OLEString %) - Account balance
      - `failureLevel` (Integer #) - Company status (0 = nominal, else problematic)
      - `fTycoonProxyId` (Integer #) - Tycoon proxy ID (different from tycoonId, used for roads/ownership)
    - **Company list parsing (Lines 937-964):** Two-step regex approach for order-independent HTML attributes
      - Finds all `<td>` elements with `companyId` attribute
      - Extracts `companyName` and `companyOwnerRole` separately from each element
      - Handles attributes in any order (HTML can vary)
    - **Switch company mechanism (Lines 574-631):**
      - Closes existing world sockets (except directory_auth/directory_query)
      - **CRITICAL:** Calls `socket.removeAllListeners()` before `socket.destroy()` to prevent race conditions
      - Resets session state (worldContextId, tycoonId, interfaceServerId, etc.)
      - Re-authenticates with `ownerRole` as username
      - Selects target company after successful authentication
      - 200ms delay ensures socket is fully ready before company selection
  - **Client UI:** [src/client/ui/login-ui.ts](src/client/ui/login-ui.ts:229-304)
    - Groups companies by `ownerRole` in company selection screen
    - Visual role icons: 🏛️ (Mayor), ⚖️ (Minister), 🎖️ (President), 🏢 (Player companies)
    - Separate sections with headers for each role category
  - **Client Controller:** [src/client/client.ts](src/client/client.ts:441-499)
    - Detects role-based companies during company selection
    - Compares `company.ownerRole` with stored username
    - Triggers `REQ_SWITCH_COMPANY` if roles differ, otherwise normal `REQ_SELECT_COMPANY`
    - Debug logging for role detection process
  - **WebSocket Protocol:** [src/shared/types.ts](src/shared/types.ts)
    - `CompanyInfo` interface extended with `ownerRole` field
    - Message types: `REQ_SWITCH_COMPANY` / `RESP_RDO_RESULT`
    - `WsReqSwitchCompany` interface with full company object
  - **Gateway Handler:** [src/server/server.ts](src/server/server.ts:389-401)
    - `REQ_SWITCH_COMPANY` message handler
    - Calls `session.switchCompany()` and returns success response
- **Features:**
  - **Role detection:** Automatically identifies public office companies
  - **Company grouping:** Visual organization by role in login UI
  - **Seamless switching:** Re-authenticates and switches roles without manual intervention
  - **Socket cleanup:** Proper event listener removal prevents race conditions
  - **Session isolation:** Each role has independent worldContextId, fTycoonProxyId
- **RDO Protocol:**
  - **InitClient format:** `C sel <id> call InitClient "*" "@<date>","%<money>","#<failureLevel>","#<fTycoonProxyId>";`
  - **Logon format:** `C sel <interfaceServerId> call Logon "^" "%<ownerRole>","%<password>";`
  - **Response:** `A<RID> res="#<worldContextId>";` (dynamic session ID)
- **Critical Technical Details:**
  - **interfaceServerId:** Static per world (e.g., 6892548 for Shamba), never changes
  - **worldContextId:** Dynamic session ID from Logon response (e.g., 125086508), changes with each login
  - **fTycoonProxyId:** Player's tycoon proxy ID, changes when switching between player/role accounts
  - **Socket event cleanup:** MUST call `removeAllListeners()` before `destroy()` to prevent old socket's close event from deleting new socket
- **Bug Fixes (January 2026):**
  - **Regex parsing:** Fixed to handle HTML attributes in any order using two-step approach
  - **Socket race condition:** Added `removeAllListeners()` to prevent close event from deleting new socket
  - **worldContextId usage:** Fixed CreateCircuitSeg to use worldContextId instead of interfaceServerId
- **Benefits:**
  - Players can assume public office roles and build roads/infrastructure for their city
  - UI clearly distinguishes between player companies and public office positions
  - Proper session management prevents socket conflicts
  - Automatic re-authentication simplifies UX

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

#### Isometric Terrain Rendering System
- **Status:** ✅ COMPLETED (January 2026)
- **Goal:** Replace rectangular grid renderer with isometric view displaying real terrain textures from BMP map files
- **Architecture:**
  - **9-phase implementation plan** documented in [TERRAIN_RENDERING_STATUS.md](TERRAIN_RENDERING_STATUS.md)
  - **Phases completed:** 1 (Infrastructure), 2 (Terrain Loading), 3 (Basic Rendering), 4 (Texture System), 5 (Layered Rendering)
  - **Remaining phases:** 6 (Rotation - optional), 7 (Polish), 8 (Testing), 9 (Deployment)
- **Implementation:**
  - **Server-side modules:**
    - [src/server/map-data-service.ts](src/server/map-data-service.ts) - Extracts and serves map metadata from INI files, BMP files
    - [src/server/texture-extractor.ts](src/server/texture-extractor.ts) - Extracts terrain textures from CAB archives using 7-Zip
    - HTTP endpoint: `/api/map-data/:mapname` - Returns map metadata and BMP URL
    - HTTP endpoint: `/api/terrain-texture/:terrainType/:zoom/:paletteIndex` - Serves extracted textures
  - **Client-side modules:**
    - [src/client/renderer/terrain-loader.ts](src/client/renderer/terrain-loader.ts) - Loads and parses 8-bit BMP map files
    - [src/client/renderer/coordinate-mapper.ts](src/client/renderer/coordinate-mapper.ts) - Isometric coordinate transformations (Lander.pas algorithm)
    - [src/client/renderer/texture-cache.ts](src/client/renderer/texture-cache.ts) - LRU cache for terrain textures (200 max)
    - [src/client/renderer/chunk-cache.ts](src/client/renderer/chunk-cache.ts) - Pre-renders terrain into 32×32 tile chunks (10-20× faster)
    - [src/client/renderer/isometric-terrain-renderer.ts](src/client/renderer/isometric-terrain-renderer.ts) - Core terrain rendering with textures
    - [src/client/renderer/isometric-map-renderer.ts](src/client/renderer/isometric-map-renderer.ts) - Complete map renderer with layered rendering
  - **Shared types:** [src/shared/map-config.ts](src/shared/map-config.ts) - Map metadata, terrain data, zoom configs, rotation enum
  - **Integration:** [src/client/ui/map-navigation-ui.ts](src/client/ui/map-navigation-ui.ts) - Main client now uses IsometricMapRenderer
- **Features:**
  - ✅ **4 zoom levels:** 4×8, 8×16, 16×32, 32×64 pixels per tile
  - ✅ **Real terrain textures:** Loaded from BMP files, displayed via texture cache
  - ✅ **Isometric transformations:** Map ↔ Screen coordinate conversions (Lander.pas algorithm)
  - ✅ **Layered rendering:** Terrain → Roads → Buildings → Zone overlays → Placement preview → Road preview
  - ✅ **Texture extraction:** Automatic CAB archive extraction with 7-Zip
  - ✅ **LRU texture cache:** Client-side cache with automatic eviction
  - ✅ **100% API compatibility:** Drop-in replacement for old MapRenderer
  - ⚠️ **Rotation disabled:** 4-orientation support deferred (requires analysis of official client)
- **Technical Details:**
  - **Map files:** 2000×2000 pixel 8-bit BMP files (Windows 3.x format)
  - **Texture mapping:** Palette index (0-255) → Texture BMP file (land.<index>.<type>.bmp)
  - **Terrain types:** Earth (Antiqua, Zyrane), Alien Swamp (Shamba)
  - **CAB structure:** 4 archives per terrain type (grass, midgrass, dryground, water) at 4 zoom levels
  - **Coordinate system:** i = row (y), j = column (x)
  - **Camera:** Pan (drag), Zoom (mousewheel 0-3)
- **Map Data Sources:**
  - **Location:** `cache/Maps/<mapname>/`
  - **Files:** `<mapname>.bmp` (terrain), `<mapname>.ini` (metadata)
  - **Available maps:** Antiqua (2000×2000), Shamba (1000×1000), Zyrane (1000×1000), +25 others (require manual CAB extraction)
- **Texture Data Sources:**
  - **Location:** `cache/landimages/<terrainType>/<zoomLevel>/`
  - **CAB archives:** `dryground.cab`, `grass.cab`, `midgrass.cab`, `water.cab`
  - **Extracted to:** `webclient-cache/textures/<terrainType>/<zoomLevel>/`
  - **Total textures:** 160 per zoom level × 4 zoom levels × 2 terrain types = 1,280 textures
- **Performance:**
  - Build size: client.js 277.0kb (includes chunk cache system)
  - Texture cache: Hit rate >90% after warm-up
  - Frame rate: 60 FPS achieved with chunk rendering
  - **Chunk Pre-Rendering (January 2026):**
    - **Module:** [src/client/renderer/chunk-cache.ts](src/client/renderer/chunk-cache.ts) - Pre-renders terrain into cached chunks
    - **Architecture:** Map divided into 32×32 tile chunks (1024 tiles/chunk)
    - **Performance gain:** 10-20× faster terrain rendering
    - **Before:** 2000+ draw calls/frame, 10-20ms render time
    - **After:** 6-12 draw calls/frame, <5ms render time
    - **Features:**
      - Chunks rendered to OffscreenCanvas once, reused indefinitely (terrain is static)
      - LRU eviction: Max 64 chunks per zoom level
      - Async rendering: Chunks built without blocking main thread
      - Preloading: Neighboring chunks loaded in advance (radius 2)
      - Fallback: Tile-by-tile rendering while chunks load
      - Toggle: Press `C` to enable/disable chunk rendering
    - **Debug panel shows:** Chunk cache size, hit rate, render time
    - **Graceful degradation:** Falls back to tile rendering in environments without OffscreenCanvas (Node.js tests)
- **Testing:**
  - **Unit tests:** 28 IsometricTerrainRenderer + 25 TextureCache = 53 tests passing
  - **Test page:** [public/terrain-test.html](public/terrain-test.html) - Standalone test page
  - **Integration:** Build successful, tests preserved
- **API Endpoints:**
  - `GET /api/map-data/:mapname` → Map metadata + BMP URL
  - `GET /api/terrain-texture/:terrainType/:zoom/:paletteIndex` → Texture BMP
- **Documentation:**
  - [TERRAIN_RENDERING_STATUS.md](TERRAIN_RENDERING_STATUS.md) - Complete implementation status (1,000+ lines)
  - Phase-by-phase progress tracking
  - Technical references (Lander.pas, IsometricMap.pas)
- **Benefits:**
  - **Authentic rendering:** Uses original game terrain textures
  - **Visual consistency:** Isometric view matches official client
  - **Scalable architecture:** Supports future features (rotation, animations)
  - **Maintainable:** Well-documented, test coverage, modular design
  - **Backward compatible:** Seamless integration without breaking existing features

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
