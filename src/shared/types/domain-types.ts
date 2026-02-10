/**
 * Domain Types - Application Domain Entities
 * Contains business domain objects used throughout the application
 */

// =============================================================================
// WORLD & SESSION
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

export interface CompanyInfo {
  id: string;
  name: string;
  value?: number;
  ownerRole?: string; // Role de fonction publique (Maire, Ministre, Président) ou username du joueur
}

// =============================================================================
// MAP DATA STRUCTURES
// =============================================================================

export interface MapObject {
  id: string;
  typeId: number;
  x: number;
  y: number;
}

/**
 * Parsed building object from ObjectsInArea
 *
 * ObjectsInArea response format (5 lines per building):
 * Line 1: VisualClass - Building visual class ID (uint16)
 * Line 2: TycoonId - Owner player/company ID (uint16, 0 = no owner)
 * Line 3: OptionsByte - Encoded byte (see below)
 * Line 4: xPos - X coordinate (uint16)
 * Line 5: yPos - Y coordinate (uint16)
 *
 * OptionsByte encoding (spec Section 4.3):
 *   Bits 4-7: Level (encoded upgrade level: 1 + UpgradeLevel/10)
 *   Bits 1-3: Attack indicator (even values 0-14)
 *   Bit 0:    Alert flag (1 = facility losing money)
 *
 * Client-side decoding:
 *   level  = optionsByte >> 4          (unsigned shift right)
 *   alert  = (optionsByte & 0x0F) != 0 (any low nibble bit set)
 *   attack = optionsByte & 0x0E        (bits 1-3 of low nibble)
 */
export interface MapBuilding {
  visualClass: string; // Building visual class ID (from ObjectsInArea line 1)
  tycoonId: number;    // Owner player/company ID (from ObjectsInArea line 2)
  options: number;     // Raw encoded options byte (from ObjectsInArea line 3)
  x: number;           // X coordinate (from ObjectsInArea line 4)
  y: number;           // Y coordinate (from ObjectsInArea line 5)
  level: number;       // Decoded upgrade level indicator (options >> 4)
  alert: boolean;      // True if facility is losing money ((options & 0x0F) != 0)
  attack: number;      // Attack indicator (options & 0x0E, even values 0-14)
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

// =============================================================================
// CHAT STRUCTURES
// =============================================================================

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

// =============================================================================
// BUILDING FOCUS
// =============================================================================

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

// =============================================================================
// BUILDING CONSTRUCTION
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
// SURFACE / ZONE OVERLAYS
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
  textureFilename?: string;   // Complete building texture filename
  emptyTextureFilename?: string;  // Empty residential texture filename
  constructionTextureFilename?: string;  // Construction state texture filename
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

// =============================================================================
// BUILDING DETAILS
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

// =============================================================================
// SEARCH MENU / DIRECTORY
// =============================================================================

/**
 * Search menu navigation item
 */
export interface SearchMenuCategory {
  id: string;
  label: string;
  enabled: boolean;
  iconUrl?: string;
}

/**
 * Town information from Towns.asp
 */
export interface TownInfo {
  name: string;
  iconUrl: string;
  mayor: string | null;
  population: number;
  unemploymentPercent: number;
  qualityOfLife: number;
  x: number;
  y: number;
  path: string;
  classId: string;
}

/**
 * Tycoon profile from RenderTycoon.asp
 */
export interface TycoonProfile {
  name: string;
  photoUrl: string;
  fortune: number;
  thisYearProfit: number;
  ntaRanking: string;
  level: string;
  prestige: number;
  profileUrl: string;
  companiesUrl: string;
}

/**
 * Ranking category item (tree structure)
 */
export interface RankingCategory {
  id: string;
  label: string;
  url: string;
  level: number;
  children?: RankingCategory[];
}

/**
 * Ranking detail entry
 */
export interface RankingEntry {
  rank: number;
  name: string;
  value: number;
  photoUrl?: string;
}

// =============================================================================
// MAIL SYSTEM
// =============================================================================

/**
 * Standard mail folder names (matching original MailConsts.pas)
 */
export type MailFolder = 'Inbox' | 'Sent' | 'Draft';

/**
 * Mail message header (from msg.header ini-style key=value pairs)
 */
export interface MailMessageHeader {
  messageId: string;
  fromAddr: string;      // Sender's mail address (e.g., alice@starworld.net)
  toAddr: string;        // Recipient address(es), semicolon-separated
  from: string;          // Sender display name
  to: string;            // Recipient display name(s)
  subject: string;
  date: string;          // In-game date as float string
  dateFmt: string;       // Human-readable date string
  read: boolean;         // false=unread, true=read
  stamp: number;         // 0-99 random value for visual variety
  noReply: boolean;      // true=system message, no reply allowed
}

/**
 * Full mail message with body and attachments
 */
export interface MailMessageFull extends MailMessageHeader {
  body: string[];               // Message body lines
  attachments: MailAttachment[];
}

/**
 * Mail attachment (from attach*.ini files)
 */
export interface MailAttachment {
  class: string;                       // Attachment type (e.g., "MoneyTransfer")
  properties: Record<string, string>;  // Key=value pairs from [Properties] section
  executed: boolean;
}

// =============================================================================
// TYCOON PROFILE (EXTENDED)
// =============================================================================

/**
 * Extended tycoon profile data from TTycoon RDO properties
 */
export interface TycoonProfileFull {
  name: string;
  realName: string;
  ranking: number;
  budget: string;            // Large number as string (TMoney)
  prestige: number;
  facPrestige: number;
  researchPrestige: number;
  facCount: number;
  facMax: number;
  area: number;
  nobPoints: number;
  licenceLevel: number;
  failureLevel: number;
  levelName: string;
  levelTier: number;
}

// =============================================================================
// ROAD BUILDING
// =============================================================================

/**
 * Road drawing state for client-side tracking
 */
export interface RoadDrawingState {
  /** Whether road drawing mode is active */
  isDrawing: boolean;
  /** Start X coordinate (world coordinates) */
  startX: number;
  /** Start Y coordinate (world coordinates) */
  startY: number;
  /** Current end X coordinate (world coordinates) */
  endX: number;
  /** Current end Y coordinate (world coordinates) */
  endY: number;
  /** Whether mouse is currently pressed */
  isMouseDown: boolean;
  /** Timestamp when mouse was pressed */
  mouseDownTime: number;
}
