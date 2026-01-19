# Search Menu Timeout Fix

## Problem Identified

The `SearchMenuService` was experiencing timeout errors when trying to fetch ASP pages, even though the URLs were correct and accessible via curl.

### Root Cause

The `fetchPage()` method was using the **wrong server address**:
- ❌ **Was using:** `this.interfaceServerHost` (game server for RDO protocol)
- ✅ **Should use:** `this.daAddr` (Directory Agent for HTTP/ASP pages)

## Files Modified

### 1. [src/server/search-menu-service.ts](src/server/search-menu-service.ts)

#### Changes Made:

**A. fetchPage() method (lines 54-67)**
- **Before:** `hostname: this.interfaceServerHost, port: this.interfaceServerPort`
- **After:** `hostname: this.daAddr, port: this.daPort`
- Added debug log to show exact URL being fetched

**B. convertImageToProxy() method (lines 95-114)**
- **Before:** `const fullUrl = `http://${this.interfaceServerHost}${...}`
- **After:** `const fullUrl = `http://${this.daAddr}${...}`
- Images are also served from Directory Agent, not game server

**C. getTowns() method (line 139)**
- **Before:** `const baseUrl = `http://${this.interfaceServerHost}`;`
- **After:** `const baseUrl = `http://${this.daAddr}`;`

**D. getTycoonProfile() method (line 156)**
- **Before:** `const baseUrl = `http://${this.interfaceServerHost}`;`
- **After:** `const baseUrl = `http://${this.daAddr}`;`

**E. getRankingDetail() method (line 193)**
- **Before:** `const baseUrl = `http://${this.interfaceServerHost}`;`
- **After:** `const baseUrl = `http://${this.daAddr}`;`

**F. Constructor debug logs (lines 49-53)**
- Added console logs to display DAAddr, World, and Tycoon during initialization
- Helps verify correct values are being passed

## Why This Fixes the Problem

### Two Different Servers

The Starpeace architecture uses **two separate servers**:

1. **Interface Server (RDO Protocol)**
   - Used for game logic, building operations, chat, etc.
   - Protocol: Custom RDO (Remote Data Objects) over TCP sockets
   - Port: Various (usually 7000-7005)
   - Example: `loginCredentials.worldInfo.ip`

2. **Directory Agent (HTTP Server)**
   - Serves legacy ASP pages for search menu, rankings, profiles
   - Protocol: HTTP
   - Port: 80 (standard HTTP)
   - Retrieved from RDO session via `getDAAddr()`
   - Example: `158.69.153.134` (for test server)

### The Bug

`SearchMenuService` was trying to connect to the **Interface Server** (RDO game server) using **HTTP protocol**, which caused:
- Connection timeout (server doesn't respond to HTTP requests on RDO ports)
- Port mismatch (RDO ports 7000+ vs HTTP port 80)
- Wrong service (game server vs web server)

### The Fix

Now `SearchMenuService` correctly:
1. Retrieves `DAAddr` from RDO session (`session.getDAAddr()`)
2. Uses `DAAddr:80` for all HTTP requests
3. Connects to the correct server (Directory Agent web server)
4. Uses HTTP protocol on port 80 (standard)

## How DAAddr is Retrieved

### Session Flow (src/server/spo_session.ts)

1. **Login Phase:** Client connects to Interface Server
2. **World Properties:** Session fetches world properties including `DAAddr`
   ```typescript
   // Line 1468: Property list includes DAAddr
   const props = ["WorldName", "DSArea", "WorldURL", "DAAddr", "DALockPort", ...]
   ```
3. **Storage:** `DAAddr` value is stored in session
   ```typescript
   // Lines 1498-1500: Store DAAddr
   if (prop === "DAAddr") {
     this.daAddr = value;
   }
   ```
4. **Getter Method:** Public getter exposes DAAddr
   ```typescript
   // Lines 152-154: Public getter
   public getDAAddr(): string | null {
     return this.daAddr;
   }
   ```

### Service Initialization (src/server/server.ts)

```typescript
// Lines 259-271: Initialize SearchMenuService after company selection
const daAddr = spSession.getDAAddr();
const daPort = spSession.getDAPort(); // Always returns 80

if (daAddr && daPort) {
  searchMenuService = new SearchMenuService(
    loginCredentials.worldInfo.ip,     // Interface server (RDO) - NOT used for HTTP
    loginCredentials.worldInfo.port,   // RDO port - NOT used for HTTP
    loginCredentials.worldName,
    loginCredentials.username,
    loginCredentials.companyId,
    daAddr,                            // Directory Agent (HTTP) - USED for HTTP
    daPort                             // Port 80 - USED for HTTP
  );
}
```

## Testing

### Debug Logs Added

When `SearchMenuService` is initialized, you'll see:
```
[SearchMenuService] Initialized with:
  DAAddr: 158.69.153.134:80 (HTTP server for ASP pages)
  World: Shamba
  Tycoon: YourUsername
```

When fetching a page, you'll see:
```
[SearchMenuService] Fetching: http://158.69.153.134:80/five/0/visual/voyager/new%20directory/DirectoryMain.asp?Tycoon=...
```

### Expected Behavior

1. **No more timeout errors** - Server responds immediately
2. **HTTP 200 responses** - All pages load successfully
3. **Correct URLs** - All requests go to DAAddr:80
4. **Images load** - All image URLs use DAAddr for proxy

### URL Examples

All these URLs will now work correctly:

**Home Page:**
```
http://158.69.153.134:80/five/0/visual/voyager/new%20directory/DirectoryMain.asp?...
```

**Towns:**
```
http://158.69.153.134:80/five/0/visual/voyager/new%20directory/Towns.asp?...
```

**Rankings:**
```
http://158.69.153.134:80/five/0/visual/voyager/new%20directory/Rankings.asp?...
```

## Verification Steps

1. Start the server: `npm run dev`
2. Log in to the game
3. Select a company (this triggers SearchMenuService initialization)
4. Check console for initialization logs
5. Click Search button in toolbar
6. Verify home page loads without timeout
7. Check console for fetch URL log
8. Navigate through different pages (Towns, Rankings, Profile)
9. Verify all pages load correctly

## Related Files

- [src/server/spo_session.ts](src/server/spo_session.ts) - DAAddr storage and getter
- [src/server/server.ts](src/server/server.ts) - SearchMenuService initialization
- [src/server/search-menu-service.ts](src/server/search-menu-service.ts) - Fixed HTTP requests
- [src/server/search-menu-parser.ts](src/server/search-menu-parser.ts) - HTML parsing (unchanged)
- [src/client/ui/search-menu/search-menu-panel.ts](src/client/ui/search-menu/search-menu-panel.ts) - UI rendering (unchanged)

---

**Fixed:** 2026-01-19
**Status:** Ready for testing
**Compile:** ✅ No errors (215.1kb client bundle)
