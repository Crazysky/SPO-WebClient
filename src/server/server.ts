import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { StarpeaceSession } from './spo_session';
import { config } from '../shared/config';
import { createLogger } from '../shared/logger';
import * as ErrorCodes from '../shared/error-codes';
import { FacilityDimensionsCache } from './facility-dimensions-cache';
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

// Initialize Facility Dimensions Cache
const facilityDimensionsCache = new FacilityDimensionsCache();

// 1. HTTP Server for Static Files
const server = http.createServer((req, res) => {
  const safePath = req.url === '/' ? '/index.html' : req.url || '/index.html';

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
      await handleClientMessage(ws, spSession, msg);
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
async function handleClientMessage(ws: WebSocket, session: StarpeaceSession, msg: WsMessage) {
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

        const worlds = await session.connectDirectory(req.username, req.password);
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
          const dimensions = facilityDimensionsCache.getFacility(req.visualClass);

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
    // Initialize facility dimensions cache (parse facility.csv)
    console.log('[Gateway] Initializing facility dimensions cache...');
    await facilityDimensionsCache.initialize();
    console.log('[Gateway] Facility dimensions cache initialized successfully');

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
