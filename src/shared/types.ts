/**
 * src/shared_types.ts
 *
 * THE GOLDEN CONTRACT
 * -------------------
 * This file defines the shared data structures, constants, and interfaces
 * used by both the Starpeace Web Gateway and the Browser Client.
 *
 * It strictly adheres to the "Starpeace Online Application Protocol" (RDO).
 */

// =============================================================================
// 1. RDO PROTOCOL CONSTANTS & PRIMITIVES
// =============================================================================

/**
 * Standard ports defined in the protocol documentation.
 */
export const RDO_PORTS = {
  DIRECTORY: 1111,
  MAP_SERVICE: 6000,
  CONSTRUCTION_SERVICE: 7001,
};

export interface CompanyInfo {
  id: string;
  name: string;
  value?: number;
}

export interface BuildingFocusInfo {
  buildingId: string;
  buildingName: string;
  ownerName: string;
  salesInfo: string;
  revenue: string;
  detailsText: string; // Ticker section 1 (sales/usage details)
  hintsText: string;   // Ticker section 2 (status/hints)
  x: number;
  y: number;
}

export const RDO_CONSTANTS = {
  PACKET_DELIMITER: ';',
  CMD_PREFIX_CLIENT: 'C',
  CMD_PREFIX_ANSWER: 'A',
  TOKEN_SEPARATOR: ',',
  METHOD_SEPARATOR: '"^"',
  PUSH_SEPARATOR: '"*"',
};

export enum RdoVerb {
  IDOF = 'idof',
  SEL = 'sel',
}

export enum RdoAction {
  GET = 'get',
  SET = 'set',
  CALL = 'call'
}

export interface RdoPacket {
  raw: string;
  type: 'REQUEST' | 'RESPONSE' | 'PUSH';
  rid?: number;
  verb?: RdoVerb;
  targetId?: string;
  action?: RdoAction;
  member?: string;
  args?: string[];
  separator?: string;
  payload?: string;
}

export interface WorldZone {
  id: string;
  name: string;
  path: string;
}

export const WORLD_ZONES: WorldZone[] = [
  { id: 'beta', name: 'BETA', path: 'Root/Areas/Asia/Worlds' },
  { id: 'free', name: 'Free Space', path: 'Root/Areas/America/Worlds' },
  { id: 'restricted', name: 'Restricted Space', path: 'Root/Areas/Europe/Worlds' }
];

export const DIRECTORY_QUERY = {
  QUERY_BLOCK: `General/Population
General/Investors
General/Online
General/Date
Interface/IP
Interface/Port
Interface/URL
Interface/Running`
};

// =============================================================================
// 2. GATEWAY <-> BROWSER PROTOCOL (WebSocket)
// =============================================================================

export enum WsMessageType {
  // Client -> Gateway (Requests)
  REQ_CONNECT_DIRECTORY = 'REQ_CONNECT_DIRECTORY',
  REQ_LOGIN_WORLD = 'REQ_LOGIN_WORLD',
  REQ_RDO_DIRECT = 'REQ_RDO_DIRECT',
  REQ_MAP_LOAD = 'REQ_MAP_LOAD',
  REQ_SELECT_COMPANY = 'REQ_SELECT_COMPANY',
  REQ_MANAGE_CONSTRUCTION = 'REQ_MANAGE_CONSTRUCTION',

  // Gateway -> Client (Responses)
  RESP_CONNECT_SUCCESS = 'RESP_CONNECT_SUCCESS',
  RESP_LOGIN_SUCCESS = 'RESP_LOGIN_SUCCESS',
  RESP_RDO_RESULT = 'RESP_RDO_RESULT',
  RESP_ERROR = 'RESP_ERROR',
  RESP_MAP_DATA = 'RESP_MAP_DATA',
  RESP_CONSTRUCTION_SUCCESS = 'RESP_CONSTRUCTION_SUCCESS',

  // Gateway -> Client (Async Events / Pushes)
  EVENT_CHAT_MSG = 'EVENT_CHAT_MSG',
  EVENT_MAP_DATA = 'EVENT_MAP_DATA',
  EVENT_TYCOON_UPDATE = 'EVENT_TYCOON_UPDATE', // NEW [MED-01]
  EVENT_RDO_PUSH = 'EVENT_RDO_PUSH',
  
  // Chat functionality
  REQ_CHAT_GET_USERS = 'REQ_CHAT_GET_USERS',
  REQ_CHAT_GET_CHANNELS = 'REQ_CHAT_GET_CHANNELS',
  REQ_CHAT_GET_CHANNEL_INFO = 'REQ_CHAT_GET_CHANNEL_INFO',
  REQ_CHAT_JOIN_CHANNEL = 'REQ_CHAT_JOIN_CHANNEL',
  REQ_CHAT_SEND_MESSAGE = 'REQ_CHAT_SEND_MESSAGE',
  REQ_CHAT_TYPING_STATUS = 'REQ_CHAT_TYPING_STATUS',
  
  RESP_CHAT_USER_LIST = 'RESP_CHAT_USER_LIST',
  RESP_CHAT_CHANNEL_LIST = 'RESP_CHAT_CHANNEL_LIST',
  RESP_CHAT_CHANNEL_INFO = 'RESP_CHAT_CHANNEL_INFO',
  RESP_CHAT_SUCCESS = 'RESP_CHAT_SUCCESS',
  
  EVENT_CHAT_USER_TYPING = 'EVENT_CHAT_USER_TYPING',
  EVENT_CHAT_CHANNEL_CHANGE = 'EVENT_CHAT_CHANNEL_CHANGE',
  EVENT_CHAT_USER_LIST_CHANGE = 'EVENT_CHAT_USER_LIST_CHANGE',
  
  REQ_BUILDING_FOCUS = 'REQ_BUILDING_FOCUS',
  REQ_BUILDING_UNFOCUS = 'REQ_BUILDING_UNFOCUS',
  RESP_BUILDING_FOCUS = 'RESP_BUILDING_FOCUS',
  EVENT_BUILDING_REFRESH = 'EVENT_BUILDING_REFRESH',

  // Building Construction
  REQ_GET_BUILDING_CATEGORIES = 'REQ_GET_BUILDING_CATEGORIES',
  REQ_GET_BUILDING_FACILITIES = 'REQ_GET_BUILDING_FACILITIES',
  REQ_PLACE_BUILDING = 'REQ_PLACE_BUILDING',
  REQ_GET_SURFACE = 'REQ_GET_SURFACE',
  REQ_GET_FACILITY_DIMENSIONS = 'REQ_GET_FACILITY_DIMENSIONS',

  RESP_BUILDING_CATEGORIES = 'RESP_BUILDING_CATEGORIES',
  RESP_BUILDING_FACILITIES = 'RESP_BUILDING_FACILITIES',
  RESP_BUILDING_PLACED = 'RESP_BUILDING_PLACED',
  RESP_SURFACE_DATA = 'RESP_SURFACE_DATA',
  RESP_FACILITY_DIMENSIONS = 'RESP_FACILITY_DIMENSIONS',

  // Building Details (NEW)
  REQ_BUILDING_DETAILS = 'REQ_BUILDING_DETAILS',
  RESP_BUILDING_DETAILS = 'RESP_BUILDING_DETAILS',
  REQ_BUILDING_SET_PROPERTY = 'REQ_BUILDING_SET_PROPERTY',
  RESP_BUILDING_SET_PROPERTY = 'RESP_BUILDING_SET_PROPERTY',

}

export interface WsMessage {
  type: WsMessageType;
  wsRequestId?: string;
}

// --- Request Payloads ---

export interface WsReqConnectDirectory extends WsMessage {
  type: WsMessageType.REQ_CONNECT_DIRECTORY;
  username: string;
  password: string;
  zonePath?: string;  // Optional zone path (defaults to BETA if not specified)
}

export interface WsReqLoginWorld extends WsMessage {
  type: WsMessageType.REQ_LOGIN_WORLD;
  username: string;
  password: string;
  worldName: string;
}

export interface WsReqRdoDirect extends WsMessage {
  type: WsMessageType.REQ_RDO_DIRECT;
  verb: RdoVerb;
  targetId: string;
  action?: RdoAction;
  member?: string;
  args?: string[];
}

export interface WsReqMapLoad extends WsMessage {
  type: WsMessageType.REQ_MAP_LOAD;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WsReqManageConstruction extends WsMessage {
  type: WsMessageType.REQ_MANAGE_CONSTRUCTION;
  x: number;
  y: number;
  action: 'START' | 'STOP' | 'DOWN';
  count?: number;
}

// --- Response Payloads ---

export interface WsRespError extends WsMessage {
  type: WsMessageType.RESP_ERROR;
  errorMessage: string;
  code: number;
}

export interface WsRespConnectSuccess extends WsMessage {
  type: WsMessageType.RESP_CONNECT_SUCCESS;
  worlds: WorldInfo[];
}

export interface WsRespLoginSuccess extends WsMessage {
  type: WsMessageType.RESP_LOGIN_SUCCESS;
  tycoonId: string;
  contextId: string;
  companyCount: number;
  companies?: CompanyInfo[];
}

export interface WsRespRdoResult extends WsMessage {
  type: WsMessageType.RESP_RDO_RESULT;
  result: string | string[];
}

export interface WsRespConstructionSuccess extends WsMessage {
  type: WsMessageType.RESP_CONSTRUCTION_SUCCESS;
  action: string;
  x: number;
  y: number;
}

// --- Event Payloads ---

export interface WsEventChatMsg extends WsMessage {
  type: WsMessageType.EVENT_CHAT_MSG;
  channel: string;
  from: string;
  message: string;
}

/**
 * NEW [MED-01]: Structured Tycoon Update Event
 * Parsed from RefreshTycoon push command
 */
export interface WsEventTycoonUpdate extends WsMessage {
  type: WsMessageType.EVENT_TYCOON_UPDATE;
  cash: string;           // Total cash (can be very large number)
  incomePerHour: string;  // Hourly income
  ranking: number;        // Player ranking
  buildingCount: number;  // Current number of buildings
  maxBuildings: number;   // Maximum allowed buildings
}

export interface WsEventRdoPush extends WsMessage {
  type: WsMessageType.EVENT_RDO_PUSH;
  rawPacket: string;
}

export interface WsReqSelectCompany extends WsMessage {
  type: WsMessageType.REQ_SELECT_COMPANY;
  companyId: string;
}

export interface WsRespMapData extends WsMessage {
  type: WsMessageType.RESP_MAP_DATA;
  data: MapData;
}

// =============================================================================
// 3. APPLICATION DOMAIN ENTITIES
// =============================================================================

export interface WorldInfo {
  name: string;
  url: string;
  ip: string;
  port: number;
  season?: string;
  mapSizeX?: number;
  mapSizeY?: number;
  players?: number;      // Online players count
  population?: number;   // Total population
  investors?: number;    // Investors count
  online?: number;       // Online count (same as players typically)
  date?: string;         // Server date
  running3?: boolean;    // Server online status (Interface/Running3)
}

export enum SessionPhase {
  DISCONNECTED = 'DISCONNECTED',
  DIRECTORY_CONNECTED = 'DIRECTORY_CONNECTED',
  WORLD_CONNECTING = 'WORLD_CONNECTING',
  WORLD_CONNECTED = 'WORLD_CONNECTED',
}

export interface MapObject {
  id: string;
  typeId: number;
  x: number;
  y: number;
}

// =============================================================================
// 4. TYPE GUARDS (Helpers)
// =============================================================================

export function isWsRequest(msg: WsMessage): boolean {
  return msg.type.startsWith('REQ_');
}

/**
 * Parsed building object from ObjectsInArea
 *
 * ObjectsInArea response format (5 lines per building):
 * Line 1: VisualClass - Building visual class ID (matches facilities.csv)
 * Line 2: TycoonId - Owner player ID (0 if no owner)
 * Line 3: Options - Encoded byte (bits 4-7: upgrade level, bit 0: profit state)
 * Line 4: xPos - X coordinate
 * Line 5: yPos - Y coordinate
 */
export interface MapBuilding {
  visualClass: string; // Building visual class ID (from ObjectsInArea line 1)
  tycoonId: number;    // Owner player ID (from ObjectsInArea line 2)
  options: number;     // Encoded options byte (from ObjectsInArea line 3)
  x: number;           // X coordinate (from ObjectsInArea line 4)
  y: number;           // Y coordinate (from ObjectsInArea line 5)
}

/**
 * Parsed road segment from SegmentsInArea
 */
export interface MapSegment {
  x1: number;          // Start X coordinate
  y1: number;          // Start Y coordinate
  x2: number;          // End X coordinate
  y2: number;          // End Y coordinate
  unknown1: number;    // Unknown value 1
  unknown2: number;    // Unknown value 2
  unknown3: number;    // Unknown value 3
  unknown4: number;    // Unknown value 4
  unknown5: number;    // Unknown value 5
  unknown6: number;    // Unknown value 6
}

/**
 * Map data with parsed structures
 */
export interface MapData {
  x: number;
  y: number;
  w: number;
  h: number;
  buildings: MapBuilding[];  // Changed from 'objects: string[]'
  segments: MapSegment[];    // Changed from 'segments: string[]'
}

// Chat data structures
export interface ChatUser {
  name: string;
  id: string;
  status: number; // 0 = normal, 1 = typing
}

export interface ChatChannel {
  name: string;
  userCount?: number;
  info?: string;
}

// Chat Request Payloads
export interface WsReqChatGetUsers extends WsMessage {
  type: WsMessageType.REQ_CHAT_GET_USERS;
}

export interface WsReqChatGetChannels extends WsMessage {
  type: WsMessageType.REQ_CHAT_GET_CHANNELS;
}

export interface WsReqChatGetChannelInfo extends WsMessage {
  type: WsMessageType.REQ_CHAT_GET_CHANNEL_INFO;
  channelName: string;
}

export interface WsReqChatJoinChannel extends WsMessage {
  type: WsMessageType.REQ_CHAT_JOIN_CHANNEL;
  channelName: string; // Use "" or "%" for lobby
}

export interface WsReqChatSendMessage extends WsMessage {
  type: WsMessageType.REQ_CHAT_SEND_MESSAGE;
  message: string;
}

export interface WsReqChatTypingStatus extends WsMessage {
  type: WsMessageType.REQ_CHAT_TYPING_STATUS;
  isTyping: boolean;
}

// Chat Response Payloads
export interface WsRespChatUserList extends WsMessage {
  type: WsMessageType.RESP_CHAT_USER_LIST;
  users: ChatUser[];
}

export interface WsRespChatChannelList extends WsMessage {
  type: WsMessageType.RESP_CHAT_CHANNEL_LIST;
  channels: string[];
}

export interface WsRespChatChannelInfo extends WsMessage {
  type: WsMessageType.RESP_CHAT_CHANNEL_INFO;
  info: string;
}

export interface WsRespChatSuccess extends WsMessage {
  type: WsMessageType.RESP_CHAT_SUCCESS;
}

// Chat Event Payloads
export interface WsEventChatUserTyping extends WsMessage {
  type: WsMessageType.EVENT_CHAT_USER_TYPING;
  username: string;
  isTyping: boolean;
}

export interface WsEventChatChannelChange extends WsMessage {
  type: WsMessageType.EVENT_CHAT_CHANNEL_CHANGE;
  channelName: string;
}

export interface WsEventChatUserListChange extends WsMessage {
  type: WsMessageType.EVENT_CHAT_USER_LIST_CHANGE;
  user: ChatUser;
  action: 'JOIN' | 'LEAVE';
}

// --- Building Focus Request/Response Payloads ---

export interface WsReqBuildingFocus extends WsMessage {
  type: WsMessageType.REQ_BUILDING_FOCUS;
  x: number;
  y: number;
}

export interface WsReqBuildingUnfocus extends WsMessage {
  type: WsMessageType.REQ_BUILDING_UNFOCUS;
}

export interface WsRespBuildingFocus extends WsMessage {
  type: WsMessageType.RESP_BUILDING_FOCUS;
  building: BuildingFocusInfo;
}

export interface WsEventBuildingRefresh extends WsMessage {
  type: WsMessageType.EVENT_BUILDING_REFRESH;
  building: BuildingFocusInfo;
}

// =============================================================================
// 5. BUILDING CONSTRUCTION FEATURE
// =============================================================================

export interface BuildingCategory {
  kindName: string;           // Display name (e.g., "Commerce")
  kind: string;               // Kind identifier (e.g., "PGIServiceFacilities")
  cluster: string;            // Cluster identifier (e.g., "PGI")
  folder: string;             // Folder identifier
  tycoonLevel: number;        // Required tycoon level
  iconPath: string;           // Category icon path
}

export interface BuildingInfo {
  name: string;               // Building display name
  facilityClass: string;      // Class identifier (e.g., "PGIFoodStore")
  visualClassId: string;      // Visual class ID for rendering
  cost: number;               // Construction cost in dollars
  area: number;               // Building size in square meters
  description: string;        // Building description
  zoneRequirement: string;    // Zone type requirement
  iconPath: string;           // Building icon path
  available: boolean;         // Whether player can build this
}

// =============================================================================
// 6. GETSURFACE PROTOCOL (Zone Overlays)
// =============================================================================

export interface SurfaceData {
  width: number;              // Grid width (typically 65)
  height: number;             // Grid height (typically 65)
  rows: number[][];           // 2D array of zone values
}

export interface FacilityDimensions {
  visualClass: string;        // Visual class identifier (matches ObjectsInArea response)
  name: string;               // Building name
  facid: string;              // Internal FacID
  xsize: number;              // Building width in tiles
  ysize: number;              // Building height in tiles
  level: number;              // Building level/tier
}

export interface ZoneOverlayState {
  enabled: boolean;
  surfaceType: SurfaceType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  data: SurfaceData | null;
}

export enum SurfaceType {
  ZONES = 'ZONES',
  TOWNS = 'TOWNS',
  BEAUTY = 'Beauty',
  CRIME = 'Crime',
  POLLUTION = 'Pollution',
  HI_PEOPLE = 'hiPeople',
  MID_PEOPLE = 'midPeople',
  LO_PEOPLE = 'loPeople',
  QOL = 'QOL',
  BAP = 'BAP',
  FRESH_FOOD = 'FreshFood',
}

// Building Construction WebSocket Messages

export interface WsReqGetBuildingCategories extends WsMessage {
  type: WsMessageType.REQ_GET_BUILDING_CATEGORIES;
  companyName: string;
}

export interface WsReqGetBuildingFacilities extends WsMessage {
  type: WsMessageType.REQ_GET_BUILDING_FACILITIES;
  companyName: string;
  cluster: string;
  kind: string;
  kindName: string;
  folder: string;
  tycoonLevel: number;
}

export interface WsReqPlaceBuilding extends WsMessage {
  type: WsMessageType.REQ_PLACE_BUILDING;
  facilityClass: string;
  x: number;
  y: number;
}

export interface WsReqGetSurface extends WsMessage {
  type: WsMessageType.REQ_GET_SURFACE;
  surfaceType: SurfaceType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WsRespBuildingCategories extends WsMessage {
  type: WsMessageType.RESP_BUILDING_CATEGORIES;
  categories: BuildingCategory[];
}

export interface WsRespBuildingFacilities extends WsMessage {
  type: WsMessageType.RESP_BUILDING_FACILITIES;
  facilities: BuildingInfo[];
}

export interface WsRespBuildingPlaced extends WsMessage {
  type: WsMessageType.RESP_BUILDING_PLACED;
  x: number;
  y: number;
  buildingId: string;
}

export interface WsRespSurfaceData extends WsMessage {
  type: WsMessageType.RESP_SURFACE_DATA;
  data: SurfaceData;
}

export interface WsReqGetFacilityDimensions extends WsMessage {
  type: WsMessageType.REQ_GET_FACILITY_DIMENSIONS;
  visualClass: string;
}

export interface WsRespFacilityDimensions extends WsMessage {
  type: WsMessageType.RESP_FACILITY_DIMENSIONS;
  dimensions: FacilityDimensions | null;
}

// =============================================================================
// 7. BUILDING DETAILS FEATURE
// =============================================================================

/**
 * Property value from building details
 */
export interface BuildingPropertyValue {
  /** Property name */
  name: string;
  /** Raw value from server */
  value: string;
  /** Index for indexed properties (e.g., Workers0, Workers1) */
  index?: number;
}

/**
 * Supply/input connection data
 */
export interface BuildingConnectionData {
  /** Connected facility name */
  facilityName: string;
  /** Company name */
  companyName: string;
  /** Creator */
  createdBy: string;
  /** Price */
  price: string;
  /** Overprice percentage */
  overprice: string;
  /** Last transaction value */
  lastValue: string;
  /** Cost */
  cost: string;
  /** Quality */
  quality: string;
  /** Connected status */
  connected: boolean;
  /** X coordinate */
  x: number;
  /** Y coordinate */
  y: number;
}

/**
 * Supply/input data with connections
 */
export interface BuildingSupplyData {
  /** Supply path */
  path: string;
  /** Supply name (e.g., "Pharmaceutics") */
  name: string;
  /** Meta fluid type */
  metaFluid: string;
  /** Current value */
  fluidValue: string;
  /** Connection count */
  connectionCount: number;
  /** Connections */
  connections: BuildingConnectionData[];
}

/**
 * Complete building details response
 */
export interface BuildingDetailsResponse {
  /** Building ID */
  buildingId: string;
  /** X coordinate */
  x: number;
  /** Y coordinate */
  y: number;
  /** Visual class ID */
  visualClass: string;
  /** Template name used */
  templateName: string;
  /** Building name (from focus) */
  buildingName: string;
  /** Owner name (from focus) */
  ownerName: string;
  /** Security/owner ID */
  securityId: string;
  /** All property values grouped by tab */
  groups: { [groupId: string]: BuildingPropertyValue[] };
  /** Supply data (if applicable) */
  supplies?: BuildingSupplyData[];
  /** Money graph data points */
  moneyGraph?: number[];
  /** Timestamp */
  timestamp: number;
}

/**
 * Request building details
 */
export interface WsReqBuildingDetails extends WsMessage {
  type: WsMessageType.REQ_BUILDING_DETAILS;
  x: number;
  y: number;
  visualClass: string;
}

/**
 * Response with building details
 */
export interface WsRespBuildingDetails extends WsMessage {
  type: WsMessageType.RESP_BUILDING_DETAILS;
  details: BuildingDetailsResponse;
}

/**
 * Request to set a building property
 */
export interface WsReqBuildingSetProperty extends WsMessage {
  type: WsMessageType.REQ_BUILDING_SET_PROPERTY;
  x: number;
  y: number;
  propertyName: string;
  value: string;
  /** Additional parameters required by some RDO commands (e.g., index, metaFluid, salary0, salary1, salary2) */
  additionalParams?: Record<string, string>;
}

/**
 * Response after setting a property
 */
export interface WsRespBuildingSetProperty extends WsMessage {
  type: WsMessageType.RESP_BUILDING_SET_PROPERTY;
  success: boolean;
  propertyName: string;
  newValue: string;
}
