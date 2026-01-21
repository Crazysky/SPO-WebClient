import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { StarpeaceSession } from './spo_session';
import { config } from '../shared/config';
import { createLogger } from '../shared/logger';
import * as ErrorCodes from '../shared/error-codes';
import { FacilityDimensionsCache } from './facility-dimensions-cache';
import { SearchMenuService } from './search-menu-service';
import { UpdateService } from './update-service';
import { MapDataService } from './map-data-service';
import { TextureExtractor } from './texture-extractor';
import { serviceRegistry, setupGracefulShutdown } from './service-registry';
import {
  WsMessageType,
  WsMessage,
  WsReqConnectDirectory,
  WsReqLoginWorld,
  WsReqRdoDirect,
  WsRespConnectSuccess,
  WsRespLoginSuccess,
  WsRespRdoResult,
  WsRespError,
  WsReqMapLoad,
  WsRespMapData,
  WsReqSelectCompany,
  WsReqSwitchCompany,
  WsReqManageConstruction,
  WsRespConstructionSuccess,
  WsReqChatGetUsers,
  WsReqChatGetChannels,
  WsReqChatGetChannelInfo,
  WsReqChatJoinChannel,
  WsReqChatSendMessage,
  WsReqChatTypingStatus,
  WsRespChatUserList,
  WsRespChatChannelList,
  WsRespChatChannelInfo,
  WsRespChatSuccess,
  WsReqBuildingFocus,
  WsReqBuildingUnfocus,
  WsRespBuildingFocus,
  WsEventBuildingRefresh,
  BuildingFocusInfo,
  WsReqGetBuildingCategories,
  WsReqGetBuildingFacilities,
  WsReqPlaceBuilding,
  WsReqGetSurface,
  WsRespBuildingCategories,
  WsRespBuildingFacilities,
  WsRespBuildingPlaced,
  WsRespSurfaceData,
  WsReqGetFacilityDimensions,
  WsRespFacilityDimensions,
  // Building Details
  WsReqBuildingDetails,
  WsRespBuildingDetails,
  WsReqBuildingSetProperty,
  WsRespBuildingSetProperty,
  // Building Upgrades
  WsReqBuildingUpgrade,
  WsRespBuildingUpgrade,
  // Building Rename
  WsReqRenameFacility,
  WsRespRenameFacility,
  // Building Deletion
  WsReqDeleteFacility,
  WsRespDeleteFacility,
  // Road Building
  WsReqBuildRoad,
  WsRespBuildRoad,
  WsReqGetRoadCost,
  WsRespGetRoadCost,
  // Search Menu
  WsReqSearchMenuHome,
  WsRespSearchMenuHome,
  WsReqSearchMenuTowns,
  WsRespSearchMenuTowns,
  WsReqSearchMenuTycoonProfile,
  WsRespSearchMenuTycoonProfile,
  WsReqSearchMenuPeople,
  WsRespSearchMenuPeople,
  WsReqSearchMenuPeopleSearch,
  WsRespSearchMenuPeopleSearch,
  WsReqSearchMenuRankings,
  WsRespSearchMenuRankings,
  WsReqSearchMenuRankingDetail,
  WsRespSearchMenuRankingDetail,
  WsReqSearchMenuBanks,
  WsRespSearchMenuBanks,
} from '../shared/types';

/**
 * Starpeace Gateway Server
 * ------------------------
 * 1. Serves static UI files (index.html, client.js).
 * 2. Manages WebSocket connections.
 * 3. Maps 1 WebSocket <-> 1 StarpeaceSession.
 */

const logger = createLogger('Gateway');
const PORT = config.server.port;
const PUBLIC_DIR = path.join(__dirname, '../../public');

// =============================================================================
// Service Registration
// =============================================================================
// Register all singleton services with the ServiceRegistry
// Dependencies are declared to ensure proper initialization order

// Update service (syncs files from update server) - no dependencies
serviceRegistry.register('update', new UpdateService());

// Facility dimensions cache - depends on update service (needs facility_db.csv)
serviceRegistry.register('facilities', new FacilityDimensionsCache(), {
  dependsOn: ['update']
});

// Texture extractor - depends on update service (needs CAB archives)
serviceRegistry.register('textures', new TextureExtractor(), {
  dependsOn: ['update']
});

// Map data service - depends on update service (needs map files)
serviceRegistry.register('mapData', new MapDataService(), {
  dependsOn: ['update']
});

// Convenience getters for type-safe access to services
const facilityDimensionsCache = () => serviceRegistry.get<FacilityDimensionsCache>('facilities');
const mapDataService = () => serviceRegistry.get<MapDataService>('mapData');
const textureExtractor = () => serviceRegistry.get<TextureExtractor>('textures');

// WebClient-specific cache directory (for future needs, separate from update server mirror)
const WEBCLIENT_CACHE_DIR = path.join(__dirname, '../../webclient-cache');
if (!fs.existsSync(WEBCLIENT_CACHE_DIR)) {
  fs.mkdirSync(WEBCLIENT_CACHE_DIR, { recursive: true });
}

/**
 * Generate a placeholder image (1x1 transparent PNG)
 */
function getPlaceholderImage(): Buffer {
  // 1x1 transparent PNG (base64 encoded)
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return Buffer.from(base64, 'base64');
}

/**
 * Proxy image from remote server to avoid CORS/Referer blocking
 * Checks update cache first, then falls back to downloading from game server
 */
async function proxyImage(imageUrl: string, res: http.ServerResponse): Promise<void> {
  // Handle local file:// URLs
  if (imageUrl.startsWith('file://')) {
    const localPath = imageUrl.substring('file://'.length);
    try {
      if (fs.existsSync(localPath)) {
        const content = fs.readFileSync(localPath);
        const ext = path.extname(localPath).toLowerCase();
        const contentType = ext === '.bmp' ? 'application/octet-stream' :
                          ext === '.gif' ? 'image/gif' :
                          ext === '.png' ? 'image/png' :
                          ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                          'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
        return;
      } else {
        throw new Error(`Local file not found: ${localPath}`);
      }
    } catch (error) {
      console.error(`[ImageProxy] Failed to serve local file ${localPath}:`, error);
      res.writeHead(404);
      res.end('File not found');
      return;
    }
  }

  // Extract filename from URL (keep original name for debugging)
  const urlParts = imageUrl.split('/');
  const filename = urlParts[urlParts.length - 1] || 'unknown.gif';

  try {

    // Try to find image in update cache (scans all subdirectories dynamically)
    const CACHE_ROOT = path.join(__dirname, '../../cache');

    // Dynamically discover all subdirectories in cache
    const imageDirs: string[] = [];
    if (fs.existsSync(CACHE_ROOT)) {
      const entries = fs.readdirSync(CACHE_ROOT, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          imageDirs.push(entry.name);
        }
      }
    }

    // Search in cache directories (case-insensitive)
    // Cache follows exact update server structure
    for (const dir of imageDirs) {
      const dirPath = path.join(CACHE_ROOT, dir);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        const matchingFile = files.find(f => f.toLowerCase() === filename.toLowerCase());
        if (matchingFile) {
          const cachedPath = path.join(dirPath, matchingFile);
          const content = fs.readFileSync(cachedPath);
          const ext = path.extname(matchingFile).toLowerCase();
          const contentType = ext === '.gif' ? 'image/gif' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/gif';

          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
          return;
        }
      }
    }

    // Check webclient-cache for game server fallback images
    const webclientCachePath = path.join(WEBCLIENT_CACHE_DIR, filename);
    if (fs.existsSync(webclientCachePath)) {
      const content = fs.readFileSync(webclientCachePath);
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === '.gif' ? 'image/gif' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/gif';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      console.log(`[ImageProxy] Served from webclient-cache: ${filename}`);
      return;
    }

    // Not in cache, try to download from update server (try all known directories)
    const UPDATE_SERVER_BASE = 'http://update.starpeaceonline.com/five/client/cache';

    let downloaded = false;
    for (const dir of imageDirs) {
      try {
        const updateUrl = `${UPDATE_SERVER_BASE}/${dir}/${filename}`;
        const response = await fetch(updateUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Cache in proper directory structure
          const targetDir = path.join(CACHE_ROOT, dir);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          const targetPath = path.join(targetDir, filename);
          fs.writeFileSync(targetPath, buffer);

          const ext = path.extname(filename).toLowerCase();
          const contentType = ext === '.gif' ? 'image/gif' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/gif';

          res.writeHead(200, { 'Content-Type': contentType });
          res.end(buffer);
          downloaded = true;
          console.log(`[ImageProxy] Downloaded from update server: ${dir}/${filename}`);
          break;
        }
      } catch (err) {
        // Continue to next directory
      }
    }

    if (downloaded) {
      return;
    }

    // Not on update server, try game server (fallback for custom/legacy content)
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Cache game server images in webclient-cache (separate from update server mirror)
    const webclientImagePath = path.join(WEBCLIENT_CACHE_DIR, filename);
    fs.writeFileSync(webclientImagePath, buffer);
    console.log(`[ImageProxy] Downloaded from game server (cached in webclient-cache): ${filename}`);

    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.gif' ? 'image/gif' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/gif';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(buffer);
  } catch (error) {
    console.error(`[ImageProxy] Failed to fetch ${imageUrl}:`, error);

    // Cache the placeholder to avoid repeated failed downloads
    const placeholder = getPlaceholderImage();
    const webclientImagePath = path.join(WEBCLIENT_CACHE_DIR, filename);
    fs.writeFileSync(webclientImagePath, placeholder);
    console.log(`[ImageProxy] Cached placeholder for missing image: ${filename}`);

    // Return placeholder image instead of 404
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(placeholder);
  }
}

// 1. HTTP Server for Static Files + Image Proxy
const server = http.createServer(async (req, res) => {
  const safePath = req.url === '/' ? '/index.html' : req.url || '/index.html';

  // Map data API endpoint: /api/map-data/:mapname
  if (safePath.startsWith('/api/map-data/')) {
    const mapName = safePath.substring('/api/map-data/'.length).split('?')[0];

    if (!mapName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing map name' }));
      return;
    }

    try {
      // Extract CAB file if needed (or verify files exist)
      await mapDataService().extractCabFile(mapName);

      // Get map metadata from INI file
      const metadata = await mapDataService().getMapMetadata(mapName);

      // Get BMP file path and create proxy URL
      const bmpPath = mapDataService().getBmpFilePath(mapName);
      const bmpUrl = `/proxy-image?url=${encodeURIComponent('file://' + bmpPath)}`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ metadata, bmpUrl }));
    } catch (error: any) {
      console.error(`[MapDataService] Error loading map ${mapName}:`, error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message || 'Failed to load map data' }));
    }
    return;
  }

  // Terrain info endpoint: /api/terrain-info/:terrainType
  // Returns available seasons and default season for a terrain type
  // Example: /api/terrain-info/Alien%20Swamp
  if (safePath.startsWith('/api/terrain-info/')) {
    const terrainType = decodeURIComponent(safePath.substring('/api/terrain-info/'.length).split('?')[0]);

    const terrainInfo = textureExtractor().getTerrainInfo(terrainType);

    if (!terrainInfo) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Terrain type not found: ${terrainType}` }));
      return;
    }

    console.log(`[TerrainInfo] ${terrainType}: availableSeasons=[${terrainInfo.availableSeasons.join(',')}], defaultSeason=${terrainInfo.defaultSeason}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(terrainInfo));
    return;
  }

  // Terrain texture endpoint: /api/terrain-texture/:terrainType/:season/:paletteIndex
  // Season: 0=Winter, 1=Spring, 2=Summer, 3=Autumn
  // Example: /api/terrain-texture/Earth/2/128 (Summer, palette index 128)
  if (safePath.startsWith('/api/terrain-texture/')) {
    const parts = safePath.substring('/api/terrain-texture/'.length).split('/');

    if (parts.length < 3) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid URL format. Expected: /api/terrain-texture/:terrainType/:season/:paletteIndex' }));
      return;
    }

    const terrainType = decodeURIComponent(parts[0]);
    const season = parseInt(parts[1], 10);
    const paletteIndex = parseInt(parts[2].split('?')[0], 10);

    if (isNaN(season) || season < 0 || season > 3 || isNaN(paletteIndex)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid season (0-3) or palette index' }));
      return;
    }

    const texturePath = textureExtractor().getTexturePath(terrainType, season, paletteIndex);

    if (!texturePath) {
      // Return a 204 No Content for missing textures (client will use fallback color)
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const content = fs.readFileSync(texturePath);
      const ext = path.extname(texturePath).toLowerCase();
      const contentType = ext === '.bmp' ? 'image/bmp' :
                        ext === '.gif' ? 'image/gif' :
                        ext === '.png' ? 'image/png' :
                        'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000' // Cache for 1 year (textures don't change)
      });
      res.end(content);
    } catch (error: any) {
      console.error(`[TextureExtractor] Failed to serve texture ${texturePath}:`, error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read texture file' }));
    }
    return;
  }

  // Image proxy endpoint: /proxy-image?url=<encoded_url>
  if (safePath.startsWith('/proxy-image?')) {
    const urlParams = new URLSearchParams(safePath.split('?')[1]);
    const imageUrl = urlParams.get('url');

    if (!imageUrl) {
      res.writeHead(400);
      res.end('Missing url parameter');
      return;
    }

    await proxyImage(imageUrl, res);
    return;
  }

  // Basic security check to prevent directory traversal
  if (safePath.includes('..')) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  // Map URL to local file
  let filePath = path.join(PUBLIC_DIR, safePath);

  // If requesting the JS bundle
  if (safePath === '/client.js') {
    filePath = path.join(PUBLIC_DIR, 'client.js');
  }

  const ext = path.extname(filePath);
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
      res.end(content, 'utf-8');
    }
  });
});

// 2. WebSocket Server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  console.log('[Gateway] New Client Connected');

  // Create a dedicated Starpeace Session for this connection
  const spSession = new StarpeaceSession();

  // Search Menu Service (will be initialized after login)
  let searchMenuService: SearchMenuService | null = null;
  let loginCredentials: { username: string; worldName: string; worldInfo: any; companyId: string } | null = null;

  // -- Forward Events: Gateway -> Browser --
  spSession.on('ws_event', (payload: any) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  });

  // -- Handle Requests: Browser -> Gateway --
  ws.on('message', async (data: string) => {
    try {
      const msg: WsMessage = JSON.parse(data.toString());

      // Capture login credentials for SearchMenuService
      if (msg.type === WsMessageType.REQ_LOGIN_WORLD) {
        const loginMsg = msg as WsReqLoginWorld;
        const worldInfo = spSession.getWorldInfo(loginMsg.worldName);
        loginCredentials = {
          username: loginMsg.username,
          worldName: loginMsg.worldName,
          worldInfo: worldInfo,
          companyId: '' // Will be set after company selection
        };
      }

      // Capture company selection
      if (msg.type === WsMessageType.REQ_SELECT_COMPANY) {
        const companyMsg = msg as WsReqSelectCompany;
        if (loginCredentials) {
          loginCredentials.companyId = companyMsg.companyId;
        }
      }

      await handleClientMessage(ws, spSession, searchMenuService, msg);

      // Initialize SearchMenuService after successful login response
      if (msg.type === WsMessageType.REQ_SELECT_COMPANY && !searchMenuService && loginCredentials && loginCredentials.worldInfo) {
        setTimeout(() => {
          if (loginCredentials && loginCredentials.worldInfo && spSession) {
            const daAddr = spSession.getDAAddr();
            const daPort = spSession.getDAPort();

            if (daAddr && daPort) {
              searchMenuService = new SearchMenuService(
                loginCredentials.worldInfo.ip,
                loginCredentials.worldInfo.port || 80,
                loginCredentials.worldName,
                loginCredentials.username,
                loginCredentials.companyId, // Using companyId as companyName for now
                daAddr, // Use real DAAddr from session
                daPort // Use real DALockPort from session
              );
              console.log(`[Gateway] SearchMenuService initialized with DAAddr: ${daAddr}:${daPort}`);
            } else {
              console.error('[Gateway] Failed to initialize SearchMenuService: DAAddr or DAPort not available');
            }
          }
        }, 500);
      }
    } catch (err) {
      console.error('[Gateway] Message Error:', err);
      const errorResp: WsRespError = {
        type: WsMessageType.RESP_ERROR,
        errorMessage: 'Invalid Message Format',
        code: ErrorCodes.ERROR_InvalidParameter
      };
      ws.send(JSON.stringify(errorResp));
    }
  });

  ws.on('close', () => {
    console.log('[Gateway] Client Disconnected');
    spSession.destroy();
  });
});

/**
 * Message Router
 */
async function handleClientMessage(ws: WebSocket, session: StarpeaceSession, searchMenuService: SearchMenuService | null, msg: WsMessage) {
  try {
    switch (msg.type) {
      case WsMessageType.REQ_CONNECT_DIRECTORY: {
        console.log('[Gateway] Connecting to Directory...');
        const req = msg as WsReqConnectDirectory;
        
        if (!req.username || !req.password) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Username and Password required for Directory connection',
            code: ErrorCodes.ERROR_InvalidLogonData
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        const worlds = await session.connectDirectory(req.username, req.password, req.zonePath);
        const response: WsRespConnectSuccess = {
          type: WsMessageType.RESP_CONNECT_SUCCESS,
          wsRequestId: msg.wsRequestId,
          worlds
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_LOGIN_WORLD: {
        const req = msg as WsReqLoginWorld;
        console.log(`[Gateway] Logging into world: ${req.worldName}`);

        // 1. Lookup world info from session's cached directory data
        const worldInfo = session.getWorldInfo(req.worldName);
        if (!worldInfo) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: `World '${req.worldName}' not found in session cache. Did you connect to Directory first?`,
            code: ErrorCodes.ERROR_UnknownCluster
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        // 2. Connect
        const result = await session.loginWorld(req.username, req.password, worldInfo);
        const response: WsRespLoginSuccess = {
          type: WsMessageType.RESP_LOGIN_SUCCESS,
          wsRequestId: msg.wsRequestId,
          tycoonId: result.tycoonId,
          contextId: result.contextId,
          companyCount: result.companies.length,
          companies: result.companies
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_SELECT_COMPANY: {
        const req = msg as WsReqSelectCompany;
        console.log(`[Gateway] Selecting company: ${req.companyId}`);
        await session.selectCompany(req.companyId);

        // Send success response
        const response: WsMessage = {
          type: WsMessageType.RESP_RDO_RESULT,
          wsRequestId: msg.wsRequestId
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_SWITCH_COMPANY: {
        const req = msg as WsReqSwitchCompany;
        console.log(`[Gateway] Switching company: ${req.company.name} (role: ${req.company.ownerRole})`);
        await session.switchCompany(req.company);

        // Send success response
        const response: WsMessage = {
          type: WsMessageType.RESP_RDO_RESULT,
          wsRequestId: msg.wsRequestId
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_MAP_LOAD: {
		  const mapReq = msg as WsReqMapLoad;
		  
		  // If coordinates are 0,0, use player's last known position
		  let targetX = mapReq.x;
		  let targetY = mapReq.y;
		  
		  if (targetX === 0 && targetY === 0) {
			const playerPos = session.getPlayerPosition();
			targetX = playerPos.x;
			targetY = playerPos.y;
			console.log(`[Gateway] Using player spawn position: (${targetX}, ${targetY})`);
		  }
		  
		  const mapData = await session.loadMapArea(
			targetX,
			targetY,
			mapReq.width,
			mapReq.height
		  );
		  
		  const response: WsRespMapData = {
			type: WsMessageType.RESP_MAP_DATA,
			wsRequestId: msg.wsRequestId,
			data: mapData
		  };
		  ws.send(JSON.stringify(response));
		  break;
		}

      case WsMessageType.REQ_RDO_DIRECT: {
        const req = msg as WsReqRdoDirect;
        // Execute arbitrary RDO command requested by UI
        // Security Note: In production, whitelist allowed commands.
        const result = await session.executeRdo('world', {
          verb: req.verb,
          targetId: req.targetId,
          action: req.action,
          member: req.member,
          args: req.args
        });

        const response: WsRespRdoResult = {
          type: WsMessageType.RESP_RDO_RESULT,
          wsRequestId: msg.wsRequestId,
          result
        };
        ws.send(JSON.stringify(response));
        break;
      }

      // NEW [HIGH-03]: Construction management
      case WsMessageType.REQ_MANAGE_CONSTRUCTION: {
        const req = msg as WsReqManageConstruction;
        console.log(`[WS] Construction request: ${req.action} at (${req.x}, ${req.y})`);

        const result = await session.manageConstruction(
          req.x,
          req.y,
          req.action,
          req.count || 1
        );

        if (result.status === 'OK') {
          const response: WsRespConstructionSuccess = {
            type: WsMessageType.RESP_CONSTRUCTION_SUCCESS,
            wsRequestId: msg.wsRequestId,
            action: req.action,
            x: req.x,
            y: req.y
          };
          ws.send(JSON.stringify(response));
        } else {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: result.error || 'Construction operation failed',
            code: ErrorCodes.ERROR_RequestDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }
	  
	        // Chat functionality
      case WsMessageType.REQ_CHAT_GET_USERS: {
        console.log('[Gateway] Getting chat user list');
        const users = await session.getChatUserList();
        const response: WsRespChatUserList = {
          type: WsMessageType.RESP_CHAT_USER_LIST,
          wsRequestId: msg.wsRequestId,
          users
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_CHAT_GET_CHANNELS: {
        console.log('[Gateway] Getting chat channel list');
        const channels = await session.getChatChannelList();
        const response: WsRespChatChannelList = {
          type: WsMessageType.RESP_CHAT_CHANNEL_LIST,
          wsRequestId: msg.wsRequestId,
          channels
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_CHAT_GET_CHANNEL_INFO: {
        const req = msg as WsReqChatGetChannelInfo;
        console.log(`[Gateway] Getting channel info: ${req.channelName}`);
        const info = await session.getChatChannelInfo(req.channelName);
        const response: WsRespChatChannelInfo = {
          type: WsMessageType.RESP_CHAT_CHANNEL_INFO,
          wsRequestId: msg.wsRequestId,
          info
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_CHAT_JOIN_CHANNEL: {
        const req = msg as WsReqChatJoinChannel;
        console.log(`[Gateway] Joining channel: ${req.channelName || 'Lobby'}`);
        await session.joinChatChannel(req.channelName);
        const response: WsRespChatSuccess = {
          type: WsMessageType.RESP_CHAT_SUCCESS,
          wsRequestId: msg.wsRequestId
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_CHAT_SEND_MESSAGE: {
        const req = msg as WsReqChatSendMessage;
        await session.sendChatMessage(req.message);
        const response: WsRespChatSuccess = {
          type: WsMessageType.RESP_CHAT_SUCCESS,
          wsRequestId: msg.wsRequestId
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_CHAT_TYPING_STATUS: {
        const req = msg as WsReqChatTypingStatus;
        await session.setChatTypingStatus(req.isTyping);
        // No response needed for typing status
        break;
      }
		case WsMessageType.REQ_BUILDING_FOCUS:
        const focusReq = msg as WsReqBuildingFocus;
        console.log(`[Gateway] Focusing building at (${focusReq.x}, ${focusReq.y})`);
        
        try {
          const buildingInfo = await session.focusBuilding(focusReq.x, focusReq.y);
          const focusResp: WsRespBuildingFocus = {
            type: WsMessageType.RESP_BUILDING_FOCUS,
            wsRequestId: msg.wsRequestId,
            building: buildingInfo
          };
          
          console.log(`[Gateway] Sending building focus response:`, {
            buildingId: buildingInfo.buildingId,
            name: buildingInfo.buildingName,
            wsRequestId: msg.wsRequestId
          });
          
          ws.send(JSON.stringify(focusResp));
        } catch (focusErr: any) {
          console.error(`[Gateway] Building focus error:`, focusErr.message);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: focusErr.message || 'Failed to focus building',
            code: ErrorCodes.ERROR_FacilityNotFound
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
		
		case WsMessageType.REQ_BUILDING_UNFOCUS:
        console.log(`[Gateway] Unfocusing building`);
        await session.unfocusBuilding();
        const unfocusResp: WsMessage = {
          type: WsMessageType.RESP_CHAT_SUCCESS, // Reuse generic success
          wsRequestId: msg.wsRequestId
        };
        ws.send(JSON.stringify(unfocusResp));
        break;

      // Building Construction Feature
      case WsMessageType.REQ_GET_BUILDING_CATEGORIES: {
        const req = msg as WsReqGetBuildingCategories;
        console.log(`[Gateway] Fetching building categories for company: ${req.companyName}`);

        try {
          const categories = await session.fetchBuildingCategories(req.companyName);
          const response: WsRespBuildingCategories = {
            type: WsMessageType.RESP_BUILDING_CATEGORIES,
            wsRequestId: msg.wsRequestId,
            categories
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to fetch building categories',
            code: ErrorCodes.ERROR_UnknownClass
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_GET_BUILDING_FACILITIES: {
        const req = msg as WsReqGetBuildingFacilities;
        console.log(`[Gateway] Fetching facilities for category: ${req.kindName}`);

        try {
          const facilities = await session.fetchBuildingFacilities(
            req.companyName,
            req.cluster,
            req.kind,
            req.kindName,
            req.folder,
            req.tycoonLevel
          );
          const response: WsRespBuildingFacilities = {
            type: WsMessageType.RESP_BUILDING_FACILITIES,
            wsRequestId: msg.wsRequestId,
            facilities
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to fetch building facilities',
            code: ErrorCodes.ERROR_UnknownClass
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_PLACE_BUILDING: {
        const req = msg as WsReqPlaceBuilding;
        console.log(`[Gateway] Placing building: ${req.facilityClass} at (${req.x}, ${req.y})`);

        try {
          const result = await session.placeBuilding(req.facilityClass, req.x, req.y);

          if (result.success) {
            const response: WsRespBuildingPlaced = {
              type: WsMessageType.RESP_BUILDING_PLACED,
              wsRequestId: msg.wsRequestId,
              x: req.x,
              y: req.y,
              buildingId: result.buildingId || ''
            };
            ws.send(JSON.stringify(response));
          } else {
            const errorResp: WsRespError = {
              type: WsMessageType.RESP_ERROR,
              wsRequestId: msg.wsRequestId,
              errorMessage: 'Failed to place building - check placement location and requirements',
              code: ErrorCodes.ERROR_AreaNotClear
            };
            ws.send(JSON.stringify(errorResp));
          }
        } catch (err: any) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to place building',
            code: ErrorCodes.ERROR_CannotInstantiate
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_GET_SURFACE: {
        const req = msg as WsReqGetSurface;
        console.log(`[Gateway] Getting surface data: ${req.surfaceType} for area (${req.x1},${req.y1}) to (${req.x2},${req.y2})`);

        try {
          const data = await session.getSurfaceData(
            req.surfaceType,
            req.x1,
            req.y1,
            req.x2,
            req.y2
          );
          const response: WsRespSurfaceData = {
            type: WsMessageType.RESP_SURFACE_DATA,
            wsRequestId: msg.wsRequestId,
            data
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to get surface data',
            code: ErrorCodes.ERROR_InvalidParameter
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_GET_FACILITY_DIMENSIONS: {
        const req = msg as WsReqGetFacilityDimensions;
        console.log(`[Gateway] Getting facility dimensions for: ${req.visualClass}`);

        try {
          const dimensions = facilityDimensionsCache().getFacility(req.visualClass);

          const response: WsRespFacilityDimensions = {
            type: WsMessageType.RESP_FACILITY_DIMENSIONS,
            wsRequestId: msg.wsRequestId,
            dimensions: dimensions || null
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to get facility dimensions',
            code: ErrorCodes.ERROR_InvalidParameter
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      // =========================================================================
      // BUILDING DETAILS FEATURE
      // =========================================================================

      case WsMessageType.REQ_BUILDING_DETAILS: {
        const req = msg as WsReqBuildingDetails;
        console.log(`[Gateway] Getting building details at (${req.x}, ${req.y}), visualClass: ${req.visualClass}`);

        try {
          const details = await session.getBuildingDetails(req.x, req.y, req.visualClass);

          const response: WsRespBuildingDetails = {
            type: WsMessageType.RESP_BUILDING_DETAILS,
            wsRequestId: msg.wsRequestId,
            details
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to get building details:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to get building details',
            code: ErrorCodes.ERROR_FacilityNotFound
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_BUILDING_SET_PROPERTY: {
        const req = msg as WsReqBuildingSetProperty;
        console.log(`[Gateway] Setting building property ${req.propertyName}=${req.value} at (${req.x}, ${req.y})`);

        try {
          const result = await session.setBuildingProperty(
            req.x,
            req.y,
            req.propertyName,
            req.value,
            req.additionalParams
          );

          const response: WsRespBuildingSetProperty = {
            type: WsMessageType.RESP_BUILDING_SET_PROPERTY,
            wsRequestId: msg.wsRequestId,
            success: result.success,
            propertyName: req.propertyName,
            newValue: result.newValue
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to set building property:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to set property',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_BUILDING_UPGRADE: {
        const req = msg as WsReqBuildingUpgrade;
        console.log(`[Gateway] Building upgrade action: ${req.action} at (${req.x}, ${req.y}), count: ${req.count || 'N/A'}`);

        try {
          const result = await session.upgradeBuildingAction(
            req.x,
            req.y,
            req.action,
            req.count
          );

          const response: WsRespBuildingUpgrade = {
            type: WsMessageType.RESP_BUILDING_UPGRADE,
            wsRequestId: msg.wsRequestId,
            success: result.success,
            action: req.action,
            message: result.message
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to perform upgrade action:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to perform upgrade action',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_RENAME_FACILITY: {
        const req = msg as WsReqRenameFacility;
        console.log(`[Gateway] Rename facility at (${req.x}, ${req.y}) to: "${req.newName}"`);

        try {
          const result = await session.renameFacility(req.x, req.y, req.newName);

          const response: WsRespRenameFacility = {
            type: WsMessageType.RESP_RENAME_FACILITY,
            wsRequestId: msg.wsRequestId,
            success: result.success,
            newName: req.newName,
            message: result.message
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to rename facility:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to rename facility',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_DELETE_FACILITY: {
        const req = msg as WsReqDeleteFacility;
        console.log(`[Gateway] Delete facility at (${req.x}, ${req.y})`);

        try {
          const result = await session.deleteFacility(req.x, req.y);

          const response: WsRespDeleteFacility = {
            type: WsMessageType.RESP_DELETE_FACILITY,
            wsRequestId: msg.wsRequestId,
            success: result.success,
            message: result.message
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to delete facility:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to delete facility',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      // ========================================================================
      // ROAD BUILDING HANDLERS
      // ========================================================================

      case WsMessageType.REQ_BUILD_ROAD: {
        const req = msg as WsReqBuildRoad;
        console.log(`[Gateway] Build road from (${req.x1}, ${req.y1}) to (${req.x2}, ${req.y2})`);

        try {
          const result = await session.buildRoad(req.x1, req.y1, req.x2, req.y2);

          const response: WsRespBuildRoad = {
            type: WsMessageType.RESP_BUILD_ROAD,
            wsRequestId: msg.wsRequestId,
            success: result.success,
            cost: result.cost,
            tileCount: result.tileCount,
            message: result.message,
            errorCode: result.errorCode
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to build road:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to build road',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_GET_ROAD_COST: {
        const req = msg as WsReqGetRoadCost;
        console.log(`[Gateway] Get road cost from (${req.x1}, ${req.y1}) to (${req.x2}, ${req.y2})`);

        try {
          const result = session.getRoadCostEstimate(req.x1, req.y1, req.x2, req.y2);

          const response: WsRespGetRoadCost = {
            type: WsMessageType.RESP_GET_ROAD_COST,
            wsRequestId: msg.wsRequestId,
            cost: result.cost,
            tileCount: result.tileCount,
            costPerTile: result.costPerTile
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to get road cost:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to get road cost',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      // ========================================================================
      // SEARCH MENU HANDLERS
      // ========================================================================

      case WsMessageType.REQ_SEARCH_MENU_HOME: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        try {
          const categories = await searchMenuService.getHomePage();
          const response: WsRespSearchMenuHome = {
            type: WsMessageType.RESP_SEARCH_MENU_HOME,
            wsRequestId: msg.wsRequestId,
            categories
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to fetch search menu home:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to fetch search menu',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_TOWNS: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        try {
          const towns = await searchMenuService.getTowns();
          const response: WsRespSearchMenuTowns = {
            type: WsMessageType.RESP_SEARCH_MENU_TOWNS,
            wsRequestId: msg.wsRequestId,
            towns
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to fetch towns:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to fetch towns',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_TYCOON_PROFILE: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        const req = msg as WsReqSearchMenuTycoonProfile;
        try {
          const profile = await searchMenuService.getTycoonProfile(req.tycoonName);
          const response: WsRespSearchMenuTycoonProfile = {
            type: WsMessageType.RESP_SEARCH_MENU_TYCOON_PROFILE,
            wsRequestId: msg.wsRequestId,
            profile
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to fetch tycoon profile:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to fetch tycoon profile',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_PEOPLE: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        try {
          const response: WsRespSearchMenuPeople = {
            type: WsMessageType.RESP_SEARCH_MENU_PEOPLE,
            wsRequestId: msg.wsRequestId
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to fetch people page:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to fetch people page',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_PEOPLE_SEARCH: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        const req = msg as WsReqSearchMenuPeopleSearch;
        try {
          const results = await searchMenuService.searchPeople(req.searchStr);
          const response: WsRespSearchMenuPeopleSearch = {
            type: WsMessageType.RESP_SEARCH_MENU_PEOPLE_SEARCH,
            wsRequestId: msg.wsRequestId,
            results
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to search people:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to search people',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_RANKINGS: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        try {
          const categories = await searchMenuService.getRankings();
          const response: WsRespSearchMenuRankings = {
            type: WsMessageType.RESP_SEARCH_MENU_RANKINGS,
            wsRequestId: msg.wsRequestId,
            categories
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to fetch rankings:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to fetch rankings',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_RANKING_DETAIL: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        const req = msg as WsReqSearchMenuRankingDetail;
        try {
          const result = await searchMenuService.getRankingDetail(req.rankingPath);
          const response: WsRespSearchMenuRankingDetail = {
            type: WsMessageType.RESP_SEARCH_MENU_RANKING_DETAIL,
            wsRequestId: msg.wsRequestId,
            title: result.title,
            entries: result.entries
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to fetch ranking detail:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to fetch ranking detail',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_BANKS: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        try {
          const banks = await searchMenuService.getBanks();
          const response: WsRespSearchMenuBanks = {
            type: WsMessageType.RESP_SEARCH_MENU_BANKS,
            wsRequestId: msg.wsRequestId,
            banks
          };
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          console.error('[Gateway] Failed to fetch banks:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: err.message || 'Failed to fetch banks',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      default:
        console.warn(`[Gateway] Unknown message type: ${msg.type}`);
    }

  } catch (err: any) {
    console.error('[Gateway] Request Failed:', err.message);
    const errorResp: WsRespError = {
      type: WsMessageType.RESP_ERROR,
      wsRequestId: msg.wsRequestId,
      errorMessage: err.message || 'Internal Server Error',
      code: ErrorCodes.ERROR_Unknown
    };
    ws.send(JSON.stringify(errorResp));
  }
}

// Start Server
async function startServer() {
  try {
    // Initialize all registered services (in dependency order)
    console.log('[Gateway] Initializing services...');
    await serviceRegistry.initialize();

    // Log service-specific statistics
    const updateStats = serviceRegistry.get<UpdateService>('update').getStats();
    console.log(`[Gateway] Update service: ${updateStats.downloaded} downloaded, ${updateStats.extracted} CAB extracted, ${updateStats.skipped} skipped, ${updateStats.failed} failed`);

    const facilityStats = facilityDimensionsCache().getStats();
    console.log(`[Gateway] Facility cache: ${facilityStats.total} facilities loaded`);

    const textureStats = textureExtractor().getStats() as Array<{ terrainType: string; seasonName: string; textureCount: number }>;
    console.log(`[Gateway] Texture extractor: ${textureStats.length} terrain/season combinations`);
    textureStats.forEach(s => console.log(`  - ${s.terrainType}/${s.seasonName}: ${s.textureCount} textures`));

    // Setup graceful shutdown handlers (SIGTERM, SIGINT)
    setupGracefulShutdown(serviceRegistry, server);

    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`[Gateway] Server running at http://localhost:${PORT}`);
      console.log(`[Gateway] Serving static files from ${PUBLIC_DIR}`);
    });
  } catch (error) {
    console.error('[Gateway] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
