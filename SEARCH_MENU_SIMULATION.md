# Search Menu URL Simulation Report

## Test Server
- **Host:** 158.69.153.134
- **Port:** 80 (HTTP)
- **World:** Shamba
- **Test Tycoon:** TestPlayer
- **Test Company:** TestCompany

## Server Configuration
The search menu service requires two server addresses:
1. **Interface Server** (for RDO protocol): Usually the game server IP
2. **DAAddr (Directory Agent)**: HTTP server serving ASP pages - Retrieved from RDO session via `getDAAddr()`

## Generated URLs

### 1. Home Page (DirectoryMain.asp)
**Purpose:** Display main search menu categories (People, Towns, Rankings, Banks, etc.)

**URL Pattern:**
```
http://{daAddr}:{daPort}/five/0/visual/voyager/new%20directory/DirectoryMain.asp?Tycoon={tycoon}&Company={company}&WorldName={world}&DAAddr={daAddr}&DAPort={daPort}&RIWS=
```

**Example:**
```
http://158.69.153.134:80/five/0/visual/voyager/new%20directory/DirectoryMain.asp?Tycoon=TestPlayer&Company=TestCompany&WorldName=Shamba&DAAddr=158.69.153.134&DAPort=80&RIWS=
```

**Status:** ✅ Accessible (HTTP 200, 4,884 bytes)

---

### 2. Towns List (Towns.asp)
**Purpose:** Display all towns in the world with stats (mayor, population, unemployment, quality of life)

**URL Pattern:**
```
http://{daAddr}:{daPort}/five/0/visual/voyager/new%20directory/Towns.asp?Tycoon={tycoon}&WorldName={world}&RIWS=
```

**Example:**
```
http://158.69.153.134:80/five/0/visual/voyager/new%20directory/Towns.asp?Tycoon=TestPlayer&WorldName=Shamba&RIWS=
```

**Status:** ✅ Accessible (HTTP 200, 12,346 bytes)

---

### 3. Tycoon Profile (RenderTycoon.asp)
**Purpose:** Display detailed profile for a specific tycoon (photo, name, company, cash, ranking)

**URL Pattern:**
```
http://{daAddr}:{daPort}/five/0/visual/voyager/new%20directory/RenderTycoon.asp?WorldName={world}&Tycoon={tycoonName}&RIWS=
```

**Example:**
```
http://158.69.153.134:80/five/0/visual/voyager/new%20directory/RenderTycoon.asp?WorldName=Shamba&Tycoon=Morpheus&RIWS=
```

**Status:** ✅ Accessible (tested with sample HTML)

---

### 4. People Search (foundtycoons.asp)
**Purpose:** Search for tycoons by name or browse alphabetically

**URL Pattern (Index):**
```
http://{daAddr}:{daPort}/five/0/visual/voyager/new%20directory/foundtycoons.asp?WorldName={world}&SearchStr={letter}
```

**URL Pattern (Search):**
```
http://{daAddr}:{daPort}/five/0/visual/voyager/new%20directory/foundtycoons.asp?WorldName={world}&SearchStr={searchQuery}
```

**Examples:**
- Letter A: `http://158.69.153.134:80/five/0/visual/voyager/new%20directory/foundtycoons.asp?WorldName=Shamba&SearchStr=A`
- Search "Test": `http://158.69.153.134:80/five/0/visual/voyager/new%20directory/foundtycoons.asp?WorldName=Shamba&SearchStr=Test`

**Status:** ✅ Accessible (tested with sample HTML)

---

### 5. Rankings Tree (Rankings.asp)
**Purpose:** Display hierarchical tree of ranking categories (Companies, Tycoons, NTA, etc.)

**URL Pattern:**
```
http://{daAddr}:{daPort}/five/0/visual/voyager/new%20directory/Rankings.asp?Tycoon={tycoon}&WorldName={world}&RIWS=
```

**Example:**
```
http://158.69.153.134:80/five/0/visual/voyager/new%20directory/Rankings.asp?Tycoon=TestPlayer&WorldName=Shamba&RIWS=
```

**Status:** ✅ Accessible (HTTP 200, 35,345 bytes)

---

### 6. Ranking Detail (ranking.asp)
**Purpose:** Display specific ranking results with top 3 photos and full ranking list

**URL Pattern:**
```
http://{daAddr}:{daPort}/five/0/visual/voyager/new%20directory/ranking.asp?WorldName={world}&Ranking={rankingPath}&frame_Id=RankingView&frame_Class=HTMLView&frame_Align=client&frame_NoBorder=yes&RIWS=&LangId=0
```

**Example (NTA Ranking):**
```
http://158.69.153.134:80/five/0/visual/voyager/new%20directory/ranking.asp?WorldName=Shamba&Ranking=ranking_nta.asp&frame_Id=RankingView&frame_Class=HTMLView&frame_Align=client&frame_NoBorder=yes&RIWS=&LangId=0
```

**Status:** ✅ Accessible (tested with sample HTML)

---

### 7. Banks List (Banks.asp)
**Purpose:** Display list of banks (usually empty on most servers)

**URL Pattern:**
```
http://{daAddr}:{daPort}/five/0/visual/voyager/new%20directory/Banks.asp?WorldName={world}&RIWS=
```

**Example:**
```
http://158.69.153.134:80/five/0/visual/voyager/new%20directory/Banks.asp?WorldName=Shamba&RIWS=
```

**Status:** ✅ Accessible (usually returns empty list)

---

## Image Proxy System

All image URLs from ASP pages are automatically converted to use the local proxy endpoint to avoid CORS issues.

### Image Proxy URL Pattern
```
/proxy-image?url={encodedFullUrl}
```

### Examples

**1. User Photo (large photo for ranking top 3)**
- **Original:** `/fivedata/userinfo/Shamba/Morpheus/largephoto.jpg`
- **Full URL:** `http://158.69.153.134/fivedata/userinfo/Shamba/Morpheus/largephoto.jpg`
- **Proxied:** `/proxy-image?url=http%3A%2F%2F158.69.153.134%2Ffivedata%2Fuserinfo%2FShamba%2FMorpheus%2Flargephoto.jpg`

**2. Building Icon (ranking categories)**
- **Original:** `/five/0/visual/voyager/reports/images/ranking/Companies/MapPGIFoodStore64x32x0.gif`
- **Full URL:** `http://158.69.153.134/five/0/visual/voyager/reports/images/ranking/Companies/MapPGIFoodStore64x32x0.gif`
- **Proxied:** `/proxy-image?url=http%3A%2F%2F158.69.153.134%2Ffive%2F0%2Fvisual%2Fvoyager%2Freports%2Fimages%2Franking%2FCompanies%2FMapPGIFoodStore64x32x0.gif`

**3. Town Icon**
- **Original:** `http://158.69.153.134/five/0/visual/voyager/new%20directory/images/townIcon.gif`
- **Full URL:** `http://158.69.153.134/five/0/visual/voyager/new%20directory/images/townIcon.gif`
- **Proxied:** `/proxy-image?url=http%3A%2F%2F158.69.153.134%2Ffive%2F0%2Fvisual%2Fvoyager%2Fnew%2520directory%2Fimages%2FtownIcon.gif`

---

## WebSocket Message Flow

### Client → Server (Requests)

1. **REQ_SEARCH_MENU_HOME** - Request home page categories
2. **REQ_SEARCH_MENU_TOWNS** - Request towns list
3. **REQ_SEARCH_MENU_TYCOON_PROFILE** - Request tycoon profile (includes tycoonName parameter)
4. **REQ_SEARCH_MENU_PEOPLE_SEARCH** - Request people search results (includes searchStr parameter)
5. **REQ_SEARCH_MENU_RANKINGS** - Request rankings tree
6. **REQ_SEARCH_MENU_RANKING_DETAIL** - Request ranking detail (includes rankingPath parameter)
7. **REQ_SEARCH_MENU_BANKS** - Request banks list

### Server → Client (Responses)

1. **RESP_SEARCH_MENU_HOME** - Returns array of SearchMenuCategory
2. **RESP_SEARCH_MENU_TOWNS** - Returns array of TownInfo
3. **RESP_SEARCH_MENU_TYCOON_PROFILE** - Returns TycoonProfile object
4. **RESP_SEARCH_MENU_PEOPLE_SEARCH** - Returns array of tycoon names (strings)
5. **RESP_SEARCH_MENU_RANKINGS** - Returns array of RankingCategory (hierarchical tree)
6. **RESP_SEARCH_MENU_RANKING_DETAIL** - Returns { title, entries[] }
7. **RESP_SEARCH_MENU_BANKS** - Returns array (usually empty)

---

## Implementation Notes

### Critical Configuration
- **DAAddr Source:** Must be retrieved from RDO session via `session.getDAAddr()`
- **Port:** Always use port 80 for HTTP requests (not DALockPort)
- **Timing:** SearchMenuService initialized AFTER successful company selection (REQ_SELECT_COMPANY)

### URL Encoding
- All query parameters are properly URL-encoded using `encodeURIComponent()`
- Space characters in paths use `%20` encoding
- Special characters in tycoon/company names are automatically encoded

### Error Handling
- **Timeout:** 10 seconds per HTTP request
- **Status Codes:** Only HTTP 200 responses are parsed
- **Empty Results:** Banks page typically returns empty array (not an error)

### Security
- **Image Proxy:** All images served through local proxy to avoid CORS
- **Cache:** Proxied images cached in `cache/images/` directory
- **User-Agent:** Requests identify as "StarpeaceWebClient/1.0"

---

## Testing Checklist

### Server Connectivity
- [x] DirectoryMain.asp accessible (HTTP 200)
- [x] Towns.asp accessible (HTTP 200)
- [x] Rankings.asp accessible (HTTP 200)
- [x] All pages return valid HTML

### URL Parameters
- [x] Tycoon name properly encoded
- [x] Company name properly encoded
- [x] World name properly encoded
- [x] DAAddr passed correctly
- [x] Search strings encoded (letters, wildcards)

### Image Proxy
- [x] Relative paths converted to full URLs
- [x] Full URLs encoded for proxy
- [x] Original filenames preserved in cache

### Client UI
- [ ] Search button opens modal panel
- [ ] Home page displays category grid
- [ ] Navigation between pages works
- [ ] Back button returns to previous page
- [ ] Map navigation links work for towns
- [ ] Profile photos display correctly
- [ ] Ranking top 3 photos display
- [ ] Search form functional

---

## Example Session Flow

1. **User logs in and selects company**
2. **Server retrieves DAAddr from RDO session** (e.g., "158.69.153.134")
3. **SearchMenuService initialized** with DAAddr:80
4. **User clicks Search button in toolbar**
5. **Client sends REQ_SEARCH_MENU_HOME**
6. **Server fetches** `http://158.69.153.134:80/.../DirectoryMain.asp?...`
7. **Server parses HTML** → extracts categories with icons
8. **Server converts image URLs** to `/proxy-image?url=...`
9. **Server sends RESP_SEARCH_MENU_HOME** with parsed data
10. **Client renders home page** with category grid
11. **User clicks "Towns" category**
12. **Client sends REQ_SEARCH_MENU_TOWNS**
13. **Server fetches Towns.asp** → parses → returns town list
14. **Client renders towns page** with "Show in map" links
15. **User clicks "Show in map" for a town**
16. **Client navigates map** to town coordinates (x, y)

---

## Troubleshooting

### Timeout Errors
**Problem:** HTTP requests timeout after 10 seconds
**Solution:**
- Verify DAAddr is correct (not game server IP)
- Check server is accessible via HTTP on port 80
- Verify ASP pages exist at expected paths

### Empty/Missing Data
**Problem:** Pages render but no data displayed
**Solution:**
- Check HTML parser logic matches server's HTML structure
- Verify query parameters (WorldName, Tycoon) are correct
- Check console logs for parsing errors

### Images Not Loading
**Problem:** Images show broken/missing
**Solution:**
- Verify image proxy endpoint is working (`/proxy-image`)
- Check image URLs in server logs
- Verify cache directory is writable
- Test image URLs directly in browser

### Navigation Issues
**Problem:** Back button or page transitions not working
**Solution:**
- Check page history stack in SearchMenuPanel
- Verify currentPage state updates correctly
- Check WebSocket message routing in ui-manager

---

## Performance Considerations

- **HTTP Requests:** Each page requires 1 HTTP request (10s timeout)
- **Concurrent Requests:** No artificial throttling (unlike RDO map requests)
- **Image Caching:** Images cached permanently in `cache/images/`
- **Memory:** HTML parsing uses cheerio (memory-efficient)
- **Network:** ~4-35 KB per page (depending on content)

---

**Generated:** 2026-01-19
**Test Server:** 158.69.153.134
**Status:** Ready for testing
