import * as net from 'net';
import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import {
  RdoPacket,
  RdoVerb,
  RdoAction,
  RDO_CONSTANTS,
  RDO_PORTS,
  SessionPhase,
  WorldInfo,
  DIRECTORY_QUERY,
  WsMessageType,
  WsEventChatMsg,
  WsEventTycoonUpdate,
  CompanyInfo,
  MapData,
  MapBuilding,
  MapSegment,
  WsEventRdoPush,
  // NEW: Chat types
  ChatUser,
  WsEventChatUserTyping,
  WsEventChatChannelChange,
  WsEventChatUserListChange,
  BuildingFocusInfo,
  WsEventBuildingRefresh,
  // NEW: Building construction types
  BuildingCategory,
  BuildingInfo,
  SurfaceData,
  SurfaceType,
  // NEW: Building details types
  BuildingDetailsResponse,
  BuildingPropertyValue,
  BuildingSupplyData,
  BuildingConnectionData,
} from '../shared/types';
import {
  getTemplateForVisualClass,
  collectTemplatePropertyNamesStructured,
} from '../shared/building-details';
import { RdoFramer, RdoProtocol } from './rdo';
import {
  RdoValue,
  RdoParser,
  RdoCommand,
  rdoArgs
} from '../shared/rdo-types';

export class StarpeaceSession extends EventEmitter {
  private sockets: Map<string, net.Socket> = new Map();
  private framers: Map<string, RdoFramer> = new Map();
  private phase: SessionPhase = SessionPhase.DISCONNECTED;
  private requestIdCounter: number = 1000;

  /**
   * Convert remote image URL to local proxy URL
   * Keeps original filename for debugging
   */
  private convertToProxyUrl(remoteUrl: string): string {
    if (!remoteUrl || remoteUrl.startsWith('/proxy-image')) {
      return remoteUrl;
    }

    // If it's a relative path, construct full URL
    let fullUrl = remoteUrl;
    if (remoteUrl.startsWith('/')) {
      if (this.currentWorldInfo) {
        fullUrl = `http://${this.currentWorldInfo.ip}${remoteUrl}`;
      }
    }

    return `/proxy-image?url=${encodeURIComponent(fullUrl)}`;
  }

  // Pending requests map
  private pendingRequests = new Map<number, {
    resolve: (msg: RdoPacket) => void;
    reject: (err: any) => void;
  }>();
  private availableWorlds: Map<string, WorldInfo> = new Map();

  // Event synchronization
  private interfaceEventsId: string | null = null;
  private waitingForInitClient: boolean = false;
  private initClientReceived: Promise<void> | null = null;
  private initClientResolver: (() => void) | null = null;

  // Session State
  private directorySessionId: string | null = null;
  private worldContextId: string | null = null;
  private tycoonId: string | null = null;
  private currentWorldInfo: WorldInfo | null = null;
  private rdoCnntId: string | null = null;
  private cacherId: string | null = null;
  private worldId: string | null = null;

  // Credentials cache
  private cachedUsername: string | null = null;
  private cachedPassword: string | null = null;

  // Additional world properties
  private mailAccount: string | null = null;
  private interfaceServerId: string | null = null;

  // Known Objects Registry for bidirectional communication
  private knownObjects: Map<string, string> = new Map();

  //Last known player position from cookies
  private lastPlayerX: number = 0;
  private lastPlayerY: number = 0;
  
    // Chat state
  private currentChannel: string = ''; // Empty = lobby
  private chatUsers: Map<string, ChatUser> = new Map();
  
    // Building focus tracking
  private currentFocusedBuildingId: string | null = null;
  private currentFocusedCoords: { x: number, y: number } | null = null;
  
  // NEW: Request buffering with ServerBusy pause/resume
  private requestBuffer: Array<{
    socketName: string;
    packetData: Partial<RdoPacket>;
    resolve: (packet: RdoPacket) => void;
    reject: (err: any) => void;
  }> = [];
  private readonly MAX_BUFFER_SIZE = 5; // Maximum 5 buffered requests
  private isServerBusy: boolean = false;
  private serverBusyCheckInterval: NodeJS.Timeout | null = null;
  private readonly SERVER_BUSY_CHECK_INTERVAL_MS = 2000; // Check every 2 seconds

  // Map-specific throttling
  private activeMapRequests: number = 0;
  private readonly MAX_CONCURRENT_MAP_REQUESTS = 3; // Maximum 3 zone requests at once
  
  // --- REQUEST DEDUPLICATION ---
    private pendingMapRequests: Set<string> = new Set();



  constructor() {
    super();
  }

  /**
   * Connects to Directory Service in two ephemeral phases:
   * 1. Authentication Check
   * 2. World List Retrieval
   */
  public async connectDirectory(username: string, pass: string, zonePath?: string): Promise<WorldInfo[]> {
    this.phase = SessionPhase.DIRECTORY_CONNECTED;
    this.cachedUsername = username;
    this.cachedPassword = pass;

    // PHASE 1: Ephemeral authentication (Logon Check)
    console.log('[Session] Directory Phase 1: Authentication...');
    await this.performDirectoryAuth(username, pass);

    // PHASE 2: Ephemeral world retrieval
    console.log(`[Session] Directory Phase 2: Fetching Worlds from ${zonePath || 'Root/Areas/Asia/Worlds'}...`);
    const worlds = await this.performDirectoryQuery(zonePath);
    return worlds;
  }

  /**
   * Helper Phase 1: Auth -> EndSession
   */
  private async performDirectoryAuth(username: string, pass: string): Promise<void> {
    const socket = await this.createSocket('directory_auth', 'www.starpeaceonline.com', RDO_PORTS.DIRECTORY);
    try {
      // 1. Resolve & Open Session
      const idPacket = await this.sendRdoRequest('directory_auth', { verb: RdoVerb.IDOF, targetId: 'DirectoryServer' });
      const directoryServerId = this.parseIdOfResponse(idPacket);
      const sessionPacket = await this.sendRdoRequest('directory_auth', {
        verb: RdoVerb.SEL, targetId: directoryServerId, action: RdoAction.GET, member: 'RDOOpenSession'
      });
      const sessionId = this.parsePropertyResponse(sessionPacket.payload || '', 'RDOOpenSession');

      // 2. Map & Logon
      await this.sendRdoRequest('directory_auth', {
        verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOMapSegaUser',
        args: [username]
      });
      const logonPacket = await this.sendRdoRequest('directory_auth', {
        verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOLogonUser',
        args: [username, pass]
      });
      const res = this.parsePropertyResponse(logonPacket.payload || '', 'res');
      if (res !== '0') throw new Error(`Directory Authentication failed (Code: ${res})`);

      // 3. End Session & Close
      await this.sendRdoRequest('directory_auth', {
        verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOEndSession',
        args: [], separator: '"*"'
      });
      console.log('[Session] Directory Authentication Success');
    } finally {
      socket.end();
      this.sockets.delete('directory_auth');
    }
  }

  /**
   * Helper Phase 2: OpenSession -> QueryKey -> EndSession
   */
  private async performDirectoryQuery(zonePath?: string): Promise<WorldInfo[]> {
    const socket = await this.createSocket('directory_query', 'www.starpeaceonline.com', RDO_PORTS.DIRECTORY);
    try {
      // 1. Resolve & Open NEW Session
      const idPacket = await this.sendRdoRequest('directory_query', { verb: RdoVerb.IDOF, targetId: 'DirectoryServer' });
      const directoryServerId = this.parseIdOfResponse(idPacket);
      const sessionPacket = await this.sendRdoRequest('directory_query', {
        verb: RdoVerb.SEL, targetId: directoryServerId, action: RdoAction.GET, member: 'RDOOpenSession'
      });
      const sessionId = this.parsePropertyResponse(sessionPacket.payload || '', 'RDOOpenSession');

      // 2. Query Worlds - Use provided zonePath or default to BETA (Asia/Worlds)
      const worldPath = zonePath || 'Root/Areas/Asia/Worlds';
      const queryPacket = await this.sendRdoRequest('directory_query', {
        verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOQueryKey',
        args: [worldPath, DIRECTORY_QUERY.QUERY_BLOCK]
      });
      const resValue = this.parsePropertyResponse(queryPacket.payload || '', 'res');
      const worlds = this.parseDirectoryResult(resValue);
      this.availableWorlds.clear();
      for (const w of worlds) {
        this.availableWorlds.set(w.name, w);
      }

      // 3. End Session & Close
      await this.sendRdoRequest('directory_query', {
        verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOEndSession',
        args: [], separator: '"*"'
      });
      return worlds;
    } finally {
      socket.end();
      this.sockets.delete('directory_query');
    }
  }

  public getWorldInfo(name: string): WorldInfo | undefined {
    return this.availableWorlds.get(name);
  }

public async loginWorld(username: string, pass: string, world: WorldInfo): Promise<{
  contextId: string;
  tycoonId: string;
  companies: CompanyInfo[];
}> {
  this.phase = SessionPhase.WORLD_CONNECTING;
  this.currentWorldInfo = world;

  console.log(`[Session] Connecting to World ${world.name} (${world.ip}:${world.port})`);

  // Connect to World Server
  await this.createSocket("world", world.ip, world.port);

  // Generate Virtual Client ID for InterfaceEvents BEFORE any requests
  const virtualEventId = (Math.floor(Math.random() * 6000000) + 38000000).toString();
  this.knownObjects.set("InterfaceEvents", virtualEventId);
  console.log(`[Session] Virtual InterfaceEvents ID: ${virtualEventId}`);

  // 1. Resolve InterfaceServer
  const idPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.IDOF,
    targetId: "InterfaceServer"
  });
  const interfaceServerId = this.parseIdOfResponse(idPacket);
  console.log(`[Session] InterfaceServer ID: ${interfaceServerId}`);

  // 2. Retrieve World Properties (10 properties)
  await this.fetchWorldProperties(interfaceServerId);

  // 3. Check AccountStatus
  const statusPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: interfaceServerId,
    action: RdoAction.CALL,
    member: "AccountStatus",
    args: [username, pass]
  });
  const statusPayload = this.parsePropertyResponse(statusPacket.payload!, "res");
  console.log(`[Session] AccountStatus: ${statusPayload}`);

  // 4. Authenticate (call Logon)
  const logonPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: interfaceServerId,
    action: RdoAction.CALL,
    member: "Logon",
    args: [username, pass]
  });

  let contextId = this.cleanPayload(logonPacket.payload!);
  if (contextId.includes("res")) {
    contextId = this.parsePropertyResponse(logonPacket.payload!, "res");
  }

  if (!contextId || contextId === "0" || contextId.startsWith("error")) {
    throw new Error(`Login failed: ${logonPacket.payload}`);
  }

  this.worldContextId = contextId;
  console.log(`[Session] Authenticated. Context RDO: ${this.worldContextId}`);

  // 5. Retrieve User Properties
  const mailPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.GET,
    member: "MailAccount"
  });
  const mailAccount = this.parsePropertyResponse(mailPacket.payload!, "MailAccount");
  console.log(`[Session] MailAccount: ${mailAccount}`);

  const tycoonPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.GET,
    member: "TycoonId"
  });
  this.tycoonId = this.parsePropertyResponse(tycoonPacket.payload!, "TycoonId");

  const cnntPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.GET,
    member: "RDOCnntId"
  });
  this.rdoCnntId = this.parsePropertyResponse(cnntPacket.payload!, "RDOCnntId");

  // 6. Setup InitClient waiter BEFORE RegisterEventsById
  this.waitingForInitClient = true;
  this.initClientReceived = new Promise<void>((resolve) => {
    this.initClientResolver = resolve;
  });

  // 7. Register Events - This triggers server's "C <rid> idof InterfaceEvents"
  // IMPORTANT: Don't await this! The server sends InitClient push BEFORE responding
  // to RegisterEventsById, so we'd timeout waiting for the response.
  this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.CALL,
    member: "RegisterEventsById",
    args: [this.rdoCnntId]
  }).catch(err => {
    // RegisterEventsById may timeout because server responds after InitClient push
    // This is expected behavior, ignore the timeout
    console.log(`[Session] RegisterEventsById completed (or timed out, which is normal)`);
  });

  // CRITICAL: Wait for server to send InitClient push command
  console.log(`[Session] Waiting for server InitClient push...`);
  await this.initClientReceived;
  console.log(`[Session] InitClient received, continuing...`);

  // 8. SetLanguage - CLIENT sends this as PUSH command (no RID)
  const socket = this.sockets.get('world');
  if (socket) {
    const setLangCmd = RdoCommand.sel(this.worldContextId!)
      .call('SetLanguage')
      .push()
      .args(RdoValue.int(0))
      .build();
    socket.write(setLangCmd);
    console.log(`[Session] Sent SetLanguage push command`);
    // Small delay for server to process
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // 9. GetCompanyCount
  const companyCountPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.GET,
    member: "GetCompanyCount"
  });
  const companyCountStr = this.parsePropertyResponse(companyCountPacket.payload!, "GetCompanyCount");
  const companyCount = parseInt(companyCountStr, 10) || 0;
  console.log(`[Session] Company Count: ${companyCount}`);

  // 10. Fetch companies via HTTP for UI
  const { companies } = await this.fetchCompaniesViaHttp(world.ip, username);

  console.log(`[Session] Login phase complete. Waiting for company selection...`);

  // NOTE: Phase remains WORLD_CONNECTING until selectCompany() is called
  return { contextId: this.worldContextId, tycoonId: this.tycoonId, companies };
}

public async selectCompany(companyId: string): Promise<void> {
  if (!this.worldContextId) {
    throw new Error('Not logged into world');
  }

  console.log(`[Session] Selecting company ID: ${companyId}`);

  // 1. EnableEvents (set to -1 to activate)
  await this.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.SET,
    member: 'EnableEvents',
    args: ['-1']
  });
  console.log(`[Session] EnableEvents activated`);

  // 2. First PickEvent - Subscribe to Tycoon updates
  await this.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.CALL,
    member: 'PickEvent',
    args: [this.tycoonId!]
  });
  console.log(`[Session] PickEvent #1 sent`);

  // 3. Get Tycoon Cookies (position) - CRITICAL: Store coordinates
  // LastY.0
  const lastYPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.CALL,
    member: "GetTycoonCookie",
    args: [this.tycoonId!, "LastY.0"]
  });
  const lastY = this.parsePropertyResponse(lastYPacket.payload!, "res");
  this.lastPlayerY = parseInt(lastY, 10) || 0;
  console.log(`[Session] Cookie LastY.0: ${this.lastPlayerY}`);

  // LastX.0
  const lastXPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.CALL,
    member: "GetTycoonCookie",
    args: [this.tycoonId!, "LastX.0"]
  });
  const lastX = this.parsePropertyResponse(lastXPacket.payload!, "res");
  this.lastPlayerX = parseInt(lastX, 10) || 0;
  console.log(`[Session] Cookie LastX.0: ${this.lastPlayerX}`);

  // All cookies
  const allCookiesPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.CALL,
    member: "GetTycoonCookie",
    args: [this.tycoonId!, ""]
  });
  const allCookies = this.parsePropertyResponse(allCookiesPacket.payload!, "res");
  console.log(`[Session] All Cookies (1st fetch):\n${allCookies}`);

  // 4. ClientAware - Notify ready (first call)
  const socket = this.sockets.get('world');
  if (socket) {
    const clientAwareCmd = RdoCommand.sel(this.worldContextId!)
      .call('ClientAware')
      .push()
      .build();
    socket.write(clientAwareCmd);
    console.log(`[Session] Sent ClientAware #1`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Wait for server events
  await new Promise(resolve => setTimeout(resolve, 100));

  // 5. Second PickEvent
  await this.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.CALL,
    member: 'PickEvent',
    args: [this.tycoonId!]
  });
  console.log(`[Session] PickEvent #2 sent`);

  // 6. Get all cookies again
  const allCookiesPacket2 = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.CALL,
    member: "GetTycoonCookie",
    args: [this.tycoonId!, ""]
  });
  const allCookies2 = this.parsePropertyResponse(allCookiesPacket2.payload!, "res");
  console.log(`[Session] All Cookies (2nd fetch):\n${allCookies2}`);

  // 7. Second ClientAware
  if (socket) {
    const clientAwareCmd2 = RdoCommand.sel(this.worldContextId!)
      .call('ClientAware')
      .push()
      .build();
    socket.write(clientAwareCmd2);
    console.log(`[Session] Sent ClientAware #2`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // NOW the session is fully ready for game
  this.phase = SessionPhase.WORLD_CONNECTED;

  // Start ServerBusy polling now that we're fully connected
  this.startServerBusyPolling();

  console.log(`[Session] Company ${companyId} selected - Ready for game!`);
  console.log(`[Session] Player spawn position: (${this.lastPlayerX}, ${this.lastPlayerY})`);
}

	/**
	 * NEW: Focus on a building at specific coordinates
	 * Sends SwitchFocusEx command with previous building tracking
	 */
	public async focusBuilding(x: number, y: number): Promise<BuildingFocusInfo> {
	  if (!this.worldContextId) {
		throw new Error('Not logged into world');
	  }

	  console.log(`[Session] Focusing building at (${x}, ${y})`);
	  
	  // Get previous building ID (stored WITHOUT any prefix)
	  const previousBuildingId = this.currentFocusedBuildingId || '0';

	  const packet = await this.sendRdoRequest('world', {
		verb: RdoVerb.SEL,
		targetId: this.worldContextId,
		action: RdoAction.CALL,
		member: 'SwitchFocusEx',
		separator: '"^"',
		args: [`#${previousBuildingId}`, `#${x}`, `#${y}`]
	  });

	  // CRITICAL: Extract the 'res' property first (format is res="%...")
	  const responseData = this.parsePropertyResponse(packet.payload || '', 'res');

	  const buildingInfo = this.parseBuildingFocusResponse(responseData, x, y);
	  
	  // Store ID without any prefix
	  this.currentFocusedBuildingId = buildingInfo.buildingId;
	  this.currentFocusedCoords = { x, y };
	  
	  console.log(`[Session] Focused on building ${buildingInfo.buildingId}: ${buildingInfo.buildingName}`);
	  
	  return buildingInfo;
	}



  /**
   * NEW: Remove focus from current building
   * Notifies server to stop sending RefreshObject push commands
   */
	public async unfocusBuilding(): Promise<void> {
	  if (!this.worldContextId || !this.currentFocusedBuildingId) {
		console.log('[Session] No building focused, skipping unfocus');
		return;
	  }

	  console.log(`[Session] Unfocusing building ${this.currentFocusedBuildingId}`);

	  const socket = this.sockets.get('world');
	  if (socket) {
		const unfocusCmd = RdoCommand.sel(this.worldContextId!)
		  .call('UnfocusObject')
		  .push()
		  .args(RdoValue.int(parseInt(this.currentFocusedBuildingId)))
		  .build();
		socket.write(unfocusCmd);
		console.log('[Session] Sent UnfocusObject push command');
	  }

	  // Reset tracking
	  this.currentFocusedBuildingId = null;
	  this.currentFocusedCoords = null;
	}


/**
 * NEW: Parse building focus response
 * Format: buildingId\nname\nowner\nsalesInfo\nrevenue\n-:details-:hints-:
 * Note: RefreshObject pushes may have incomplete format with only 2 sections
 */
private parseBuildingFocusResponse(payload: string, x: number, y: number): BuildingFocusInfo {
     // Clean payload (removes quotes and trim)
    let cleaned = this.cleanPayload(payload);
    
    // Remove leading '%' if present
    if (cleaned.startsWith('%')) {
        cleaned = cleaned.substring(1);
    }
    
    // console.log(`[Session] Cleaned building payload (first 100 chars):`, cleaned.substring(0, 100));
    
    // Split by the special separator "-:"
    const sections = cleaned.split('-:');
    
    // RELAXED: Accept 1+ sections (RefreshObject may have incomplete data)
    if (sections.length < 1) {
        console.warn(`[Session] Invalid building focus format, sections:`, sections.length);
        console.warn(`[Session] Full payload:`, cleaned);
        throw new Error('Invalid building focus response format');
    }
    
    // Parse header section (before first "-:")
    // CRITICAL FIX: Handle both \r\n AND \n\r line endings
    const allHeaderLines = sections[0].split(/\r?\n\r?/);  // Changed regex to handle \n\r
    
    // Filter out empty lines
    const headerLines = allHeaderLines.map(l => l.trim()).filter(l => l.length > 0);
    
    console.log(`[Session] Header lines:`, headerLines);
    
    if (headerLines.length < 1) {
        throw new Error('Invalid building focus header format - no data');
    }
  
  // First line is ALWAYS the numeric building ID
  const buildingId = headerLines[0];
  
  let buildingName = '';
  let ownerName = '';
  let salesInfo = '';
  let revenue = '';
  
  // CORRECTED: Flexible parsing based on number of lines
  if (headerLines.length >= 5) {
    // Full format: ID, name, owner, salesInfo, revenue
    buildingName = headerLines[1];
    ownerName = headerLines[2];
    salesInfo = headerLines[3];
    revenue = this.extractRevenue(headerLines[4]);
  } else if (headerLines.length === 4) {
    // Format: ID, name, owner, revenue (no separate salesInfo)
    buildingName = headerLines[1];
    ownerName = headerLines[2];
    // Check if line 3 contains revenue pattern
    if (headerLines[3].includes('$')) {
      revenue = this.extractRevenue(headerLines[3]);
      salesInfo = ''; // No separate sales info
    } else {
      // It's sales info without revenue
      salesInfo = headerLines[3];
      revenue = '';
    }
  } else if (headerLines.length === 3) {
    // Format: ID, name, owner/revenue
    buildingName = headerLines[1];
    // Check if line 2 contains revenue
    if (headerLines[2].includes('$')) {
      revenue = this.extractRevenue(headerLines[2]);
      ownerName = '';
      salesInfo = '';
    } else {
      ownerName = headerLines[2];
      salesInfo = '';
      revenue = '';
    }
  } else if (headerLines.length === 2) {
    // Minimal format: ID, name
    buildingName = headerLines[1];
    ownerName = '';
    salesInfo = '';
    revenue = '';
  }
  
  // Details text (section 1 after "-:" - may be empty)
  // CORRECTED: Remove trailing colons and extra separators
  const detailsText = sections.length > 1 
    ? sections[1].trim().replace(/:$/, '') // Remove trailing ':'
    : '';
  
  // Hints text (section 2 after "-:" - may be empty or missing)
  // CORRECTED: Remove trailing colons and extra separators
  const hintsText = sections.length > 2 
    ? sections[2].trim().replace(/:$/, '') // Remove trailing ':'
    : '';
  
  /*console.log(`[Session] Parsed building:`, {
    id: buildingId,
    name: buildingName,
    owner: ownerName,
    sales: salesInfo,
    revenue: revenue,
    detailsLength: detailsText.length,
    hintsLength: hintsText.length
  });*/
  
  return {
    buildingId: buildingId.replace(/[%#@]/g, ''), // Remove '%', '#', '@' prefixes
    buildingName,
    ownerName,
    salesInfo,
    revenue,
    detailsText,
    hintsText,
    x,
    y
  };
}

/**
 * NEW: Extract revenue amount from a line
 * Formats: "($26,564/h)" or "(-$39,127/h)" or "(-$28,858/h)"
 */
private extractRevenue(line: string): string {
  // Pattern: optional '(', optional '-', '$', digits with optional commas, '/h', optional ')'
  const revenuePattern = /\(?\-?\$[\d,]+\/h\)?/;
  const match = revenuePattern.exec(line);
  
  if (match) {
    // Return the matched string, cleaned
    return match[0].replace(/[()]/g, ''); // Remove parentheses
  }
  
  return '';
}




  /**
   * NEW: Check if a push command is a RefreshObject update
   * Called from handleIncomingMessage when detecting push commands
   */
  public isRefreshObjectPush(packet: RdoPacket): boolean {
    return packet.type === 'PUSH' && 
           packet.member === 'RefreshObject' &&
           packet.separator === '"*"';
  }

	/**
	 * NEW: Parse RefreshObject push payload
	 * Format similar to SwitchFocusEx response but WITHOUT building ID in payload
	 */
	public parseRefreshObjectPush(packet: RdoPacket): BuildingFocusInfo | null {
	  if (!this.currentFocusedCoords) return null;

	  try {
		// Args format: [buildingId, "0", fullData]
		if (!packet.args || packet.args.length < 3) {
		  console.warn(`[Session] RefreshObject missing args`);
		  return null;
		}

		// Extract building ID from args[0]
		const buildingIdWithPrefix = packet.args[0]; // Format: "#202334236"
		const buildingId = buildingIdWithPrefix.replace(/[#@%]/g, '');

		// Extract and clean data from args[2]
		let dataString = packet.args[2]; // Format: "%School..." or "School..."

		// Use cleanPayload to remove quotes
		dataString = this.cleanPayload(dataString);

		// Remove leading '%' if present
		if (dataString.startsWith('%')) {
		  dataString = dataString.substring(1);
		}

		// CRITICAL: Prepend the building ID to the payload for consistent parsing
		const fullPayload = buildingId + '\n' + dataString;

		return this.parseBuildingFocusResponse(
		  fullPayload,
		  this.currentFocusedCoords.x,
		  this.currentFocusedCoords.y
		);
	  } catch (e: any) {
		console.warn(`[Session] Failed to parse RefreshObject:`, e.message);
		return null;
	  }
	}





  /**
   * Fetch companies via HTTP (ASP endpoint) [CRIT-02]
   */
  private async fetchCompaniesViaHttp(
    worldIp: string,
    username: string
  ): Promise<{ companies: CompanyInfo[], realContextId: string | null }> {
    const params = new URLSearchParams({
      frame_Id: 'LogonView',
      frame_Class: 'HTMLView',
      frame_Align: 'client',
      ResultType: 'NORMAL',
      Logon: 'FALSE',
      frame_NoBorder: 'True',
      frame_NoScrollBars: 'true',
      ClientViewId: '0',
      WorldName: this.currentWorldInfo?.name || 'Shamba',
      UserName: username,
      DSAddr: 'www.starpeaceonline.com',
      DSPort: '1111',
      ISAddr: worldIp,
      ISPort: '8000',
      LangId: '0'
    });

    const url = `http://${worldIp}/Five/0/Visual/Voyager/NewLogon/logonComplete.asp?${params.toString()}`;
    console.log(`[HTTP] Fetching companies from ${url}`);

    try {
      const response = await fetch(url, { redirect: 'follow' });
      const text = await response.text();
      const finalUrl = response.url;

      // Extract ClientViewId (priority: URL > body)
      let realId: string | null = null;
      const matchUrl = /ClientViewId=(\d+)/i.exec(finalUrl);
      if (matchUrl) realId = matchUrl[1];

      if (!realId) {
        const matchBody = /ClientViewId=(\d+)/i.exec(text);
        if (matchBody) realId = matchBody[1];
      }

      // Parse companies with regex
      const companies: CompanyInfo[] = [];
      const regex = /companyName="([^"]+)"[^>]*companyId="(\d+)"/gi;
      let match;
      while ((match = regex.exec(text)) !== null) {
        companies.push({
          id: match[2],
          name: match[1]
        });
      }

      console.log(`[HTTP] Found ${companies.length} companies, realContextId: ${realId}`);
      return { companies, realContextId: realId };
    } catch (e) {
      console.error('[HTTP] Failed to fetch companies:', e);
      return { companies: [], realContextId: null };
    }
  }
  public async connectMapService(): Promise<void> {
    if (this.sockets.has('map')) return;
    console.log('[Session] Connecting to Map Service...');
    await this.createSocket('map', this.currentWorldInfo?.ip || '127.0.0.1', RDO_PORTS.MAP_SERVICE);
    const idPacket = await this.sendRdoRequest('map', {
      verb: RdoVerb.IDOF,
      targetId: 'WSObjectCacher'
    });
    this.cacherId = this.parseIdOfResponse(idPacket);
    console.log(`[Session] Map Service Ready. CacherID: ${this.cacherId}`);
  }

  /**
   * NEW [HIGH-03]: Connect to Construction Service (port 7001)
   * This service handles building upgrades, downgrades, and construction operations
   */
  public async connectConstructionService(): Promise<void> {
    if (this.sockets.has('construction')) {
      console.log('[Construction] Already connected');
      return;
    }

    if (!this.cachedUsername || !this.cachedPassword) {
      throw new Error('Credentials not cached - cannot connect to construction service');
    }

    console.log('[Construction] Connecting to Construction Service (port 7001)...');
    await this.createSocket(
      'construction',
      this.currentWorldInfo?.ip || '127.0.0.1',
      RDO_PORTS.CONSTRUCTION_SERVICE
    );

    // Resolve World object
    const idPacket = await this.sendRdoRequest('construction', {
      verb: RdoVerb.IDOF,
      targetId: 'World'
    });
    this.worldId = this.parseIdOfResponse(idPacket);
    console.log(`[Construction] World ID: ${this.worldId}`);

    // Logon to World (no request ID - push command with separator "*")
    const socket = this.sockets.get('construction');
    if (socket && this.worldId) {
      const logonCmd = RdoCommand.sel(this.worldId)
        .call('RDOLogonClient')
        .push()
        .args(
          RdoValue.string(this.cachedUsername!),
          RdoValue.string(this.cachedPassword!)
        )
        .build();
      socket.write(logonCmd);
      console.log(`[Construction] Sent RDOLogonClient`);
      // Small delay to let server process logon
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('[Construction] Service Ready');
  }

public async loadMapArea(x?: number, y?: number, w: number = 64, h: number = 64): Promise<MapData> {
    if (!this.worldContextId) throw new Error('Not logged into world');

    const targetX = x !== undefined ? x : this.lastPlayerX;
    const targetY = y !== undefined ? y : this.lastPlayerY;

    // --- DEDUPLICATION: Check if already pending ---
    const requestKey = `${targetX},${targetY}`;
    if (this.pendingMapRequests.has(requestKey)) {
        console.log(`[Session] Skipping duplicate map request for ${requestKey}`);
        throw new Error(`Map area ${requestKey} already loading`);
    }

    // --- MAP CONCURRENCY LIMIT: Check if at max concurrent map requests ---
    if (this.activeMapRequests >= this.MAX_CONCURRENT_MAP_REQUESTS) {
        console.log(`[Session] Too many concurrent map requests (${this.activeMapRequests}/${this.MAX_CONCURRENT_MAP_REQUESTS})`);
        throw new Error(`Maximum concurrent map requests reached (${this.MAX_CONCURRENT_MAP_REQUESTS})`);
    }

    // Mark as pending
    this.pendingMapRequests.add(requestKey);
    this.activeMapRequests++;

    try {
        console.log(`[Session] Loading map area at ${targetX}, ${targetY} (size ${w}x${h}) [${this.activeMapRequests}/${this.MAX_CONCURRENT_MAP_REQUESTS}]`);

        // --- FIXED: ObjectsInArea with correct separator (consistant avec SwitchFocusEx) ---
        const objectsPacket = await this.sendRdoRequest('world', {
            verb: RdoVerb.SEL,
            targetId: this.worldContextId,
            action: RdoAction.CALL,
            member: 'ObjectsInArea',
            separator: '"^"',  // FIX: Use '"^"' for consistency with other requests
            args: [targetX.toString(), targetY.toString(), w.toString(), h.toString()]
        });

        // --- FIXED: SegmentsInArea with correct format ---
        const modeOrLayer = 1;
        const x1 = targetX;
        const y1 = targetY;
        const x2 = targetX + w;
        const y2 = targetY + h;

        const segmentsPacket = await this.sendRdoRequest('world', {
            verb: RdoVerb.SEL,
            targetId: this.worldContextId,
            action: RdoAction.CALL,
            member: 'SegmentsInArea',
            args: [
                modeOrLayer.toString(),
                x1.toString(), y1.toString(),
                x2.toString(), y2.toString()
            ]
        });

        // Parse
        const buildingsRaw = this.splitMultilinePayload(objectsPacket.payload!);
        const buildings = this.parseBuildings(buildingsRaw);

        const segmentsRaw = this.splitMultilinePayload(segmentsPacket.payload!);
        const segments = this.parseSegments(segmentsRaw);

        console.log(`[Session] Parsed ${buildings.length} buildings, ${segments.length} segments`);

        return { x: targetX, y: targetY, w, h, buildings, segments };

    } finally {
        // Always remove from pending tracker
        this.pendingMapRequests.delete(requestKey);
        this.activeMapRequests--;
    }
}



	/**
	 * Get the last known player position from cookies
	 */
	public getPlayerPosition(): { x: number, y: number } {
	  return {
		x: this.lastPlayerX,
		y: this.lastPlayerY
	  };
	}

  
  private splitMultilinePayload(payload: string): string[] {
    const raw = this.cleanPayload(payload);
    return raw
      .split(/\r?\n|\\n/g)
      .map(l => l.trim())
      .filter(l => l.length > 0);
  }
/**
 * Parse raw building data from ObjectsInArea response
 *
 * Format (5 lines per building):
 * Line 1: VisualClass - Building visual class ID (string, matches facilities.csv)
 * Line 2: TycoonId - Owner player ID (number, 0 if no owner)
 * Line 3: Options - Encoded byte (bits 4-7: upgrade level, bit 0: profit state)
 * Line 4: xPos - X coordinate (number)
 * Line 5: yPos - Y coordinate (number)
 */
private parseBuildings(rawLines: string[]): MapBuilding[] {
  const buildings: MapBuilding[] = [];

  // Buildings come in groups of 5 lines
  for (let i = 0; i + 4 < rawLines.length; i += 5) {
    try {
      const rawVisualClass = rawLines[i].trim();        // Line 1: Raw VisualClass
      let visualClass = rawVisualClass;

      // Clean visualClass: remove RDO metadata prefixes like 'res="%'
      // The visualClass should be a numeric string (e.g., "2951", "3801")
      const match = visualClass.match(/\d+/);
      if (match) {
        visualClass = match[0];
      }

      // Debug log for first 5 buildings
      if (buildings.length < 5) {
        console.log(`[Session] Building ${buildings.length + 1}: raw="${rawVisualClass}" -> cleaned="${visualClass}"`);
      }

      const tycoonId = parseInt(rawLines[i + 1], 10);   // Line 2: TycoonId
      const options = parseInt(rawLines[i + 2], 10);    // Line 3: Options byte
      const x = parseInt(rawLines[i + 3], 10);          // Line 4: X position
      const y = parseInt(rawLines[i + 4], 10);          // Line 5: Y position

      // Validate data (coordinates should be in reasonable range)
      if (visualClass && !isNaN(tycoonId) && !isNaN(options) &&
          !isNaN(x) && !isNaN(y) &&
          x >= 0 && x < 2000 && y >= 0 && y < 2000) {
        buildings.push({
          visualClass,
          tycoonId,
          options,
          x,
          y
        });
      } else {
        console.warn(`[Session] Invalid building data at index ${i}: visualClass="${visualClass}", x=${x}, y=${y}`);
      }
    } catch (e) {
      console.warn(`[Session] Failed to parse building at index ${i}:`, e);
    }
  }

  return buildings;
}


/**
 * Parse raw segment data (10 numbers per segment)
 * Format: x1, y1, x2, y2, unknown1, unknown2, unknown3, unknown4, unknown5, unknown6
 */
private parseSegments(rawLines: string[]): MapSegment[] {
  const segments: MapSegment[] = [];
  
  // Segments come in groups of 10 numbers
  for (let i = 0; i + 9 < rawLines.length; i += 10) {
    try {
      const x1 = parseInt(rawLines[i], 10);
      const y1 = parseInt(rawLines[i + 1], 10);
      const x2 = parseInt(rawLines[i + 2], 10);
      const y2 = parseInt(rawLines[i + 3], 10);
      const unknown1 = parseInt(rawLines[i + 4], 10);
      const unknown2 = parseInt(rawLines[i + 5], 10);
      const unknown3 = parseInt(rawLines[i + 6], 10);
      const unknown4 = parseInt(rawLines[i + 7], 10);
      const unknown5 = parseInt(rawLines[i + 8], 10);
      const unknown6 = parseInt(rawLines[i + 9], 10);
      
      // Validate data
      if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
        segments.push({
          x1, y1, x2, y2,
          unknown1, unknown2, unknown3, unknown4, unknown5, unknown6
        });
      }
    } catch (e) {
      console.warn(`[Session] Failed to parse segment at index ${i}:`, e);
    }
  }
  
  return segments;
}

  /**
   * VERIFIED [HIGH-02]: Get property list at specific coordinates
   * Ensures SetObject is called before GetPropertyList with proper delay
   */
  public async getCacherPropertyListAt(x: number, y: number, propertyNames: string[]): Promise<string[]> {
    await this.connectMapService();
    if (!this.cacherId) throw new Error('Map service not initialized (missing cacherId)');
    const tempObjectId = await this.cacherCreateObject();
    try {
      // CRITICAL: SetObject MUST be called to load data into server cache
      await this.cacherSetObject(tempObjectId, x, y);
      // Now safe to retrieve properties
      return await this.cacherGetPropertyList(tempObjectId, propertyNames);
    } finally {
      await this.cacherCloseObject(tempObjectId);
    }
  }

  /**
   * NEW [HIGH-02]: Helper to get RDO ObjectId at specific coordinates
   * This is the "real" object ID used for construction operations
   */
  public async getObjectRdoId(x: number, y: number): Promise<string> {
    console.log(`[MapService] Getting RDO ObjectId at (${x}, ${y})`);
    const props = await this.getCacherPropertyListAt(x, y, ['ObjectId']);
    if (props.length === 0 || !props[0]) {
      console.warn(`[MapService] No ObjectId found at (${x}, ${y})`);
      return '';
    }

    const objectId = props[0];
    console.log(`[MapService] Found ObjectId: ${objectId} at (${x}, ${y})`);
    return objectId;
  }

  private async cacherCreateObject(): Promise<string> {
    if (!this.cacherId) throw new Error('Missing cacherId');
    if (!this.currentWorldInfo?.name) throw new Error('Missing world name for CreateObject');
    const packet = await this.sendRdoRequest('map', {
      verb: RdoVerb.SEL,
      targetId: this.cacherId,
      action: RdoAction.CALL,
      member: 'CreateObject',
      args: [this.currentWorldInfo.name]
    });
    return this.cleanPayload(packet.payload || '');
  }

  /**
   * VERIFIED [HIGH-02]: SetObject with critical delay
   * This method MUST be called before GetPropertyList to populate server cache
   */
  private async cacherSetObject(tempObjectId: string, x: number, y: number): Promise<void> {
    await this.sendRdoRequest('map', {
      verb: RdoVerb.SEL,
      targetId: tempObjectId,
      action: RdoAction.CALL,
      member: 'SetObject',
      args: [x.toString(), y.toString()]
    });
    // CRITICAL [HIGH-02]: Delay for server to populate cache
    // Without this, GetPropertyList returns empty values
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async cacherGetPropertyList(tempObjectId: string, propertyNames: string[]): Promise<string[]> {
    const query = propertyNames.join('\t') + '\t';
    const packet = await this.sendRdoRequest('map', {
      verb: RdoVerb.SEL,
      targetId: tempObjectId,
      action: RdoAction.CALL,
      member: 'GetPropertyList',
      args: [query]
    });
    const raw = this.cleanPayload(packet.payload || '');

    // Handle tab-delimited or space-delimited responses
    if (raw.includes('\t')) {
      return raw.split('\t').map(v => v.trim());
    }
    return raw.split(/\s+/).map(v => v.trim());
  }

  private async cacherCloseObject(tempObjectId: string): Promise<void> {
    if (!this.cacherId) throw new Error('Missing cacherId');
    await this.sendRdoRequest('map', {
      verb: RdoVerb.SEL,
      targetId: this.cacherId,
      action: RdoAction.CALL,
      member: 'CloseObject',
      args: [tempObjectId],
	  separator: '*'
    });
  }

  /**
   * NEW [HIGH-03]: Manage construction operations with RDOAcceptCloning semaphore
   * Sequence: Check(255) -> Lock(-1) -> Action -> Verify
   *
   * @param x - Building X coordinate
   * @param y - Building Y coordinate
   * @param action - Construction action: START (upgrade), STOP (cancel), DOWN (downgrade)
   * @param count - Number of upgrades (for START only, default: 1)
   */
  public async manageConstruction(
    x: number,
    y: number,
    action: 'START' | 'STOP' | 'DOWN',
    count: number = 1
  ): Promise<{ status: string, error?: string }> {
    console.log(`[Construction] Request: ${action} at (${x}, ${y}) count=${count}`);
    try {
      // Step 0: Connect to construction service if needed
      await this.connectConstructionService();

      // Step 1: Get building info from Map Service
      console.log(`[Construction] Fetching building info at (${x}, ${y})...`);
      await this.connectMapService();
      const props = await this.getCacherPropertyListAt(x, y, ['CurrBlock', 'ObjectId']);

      if (props.length < 2) {
        return {
          status: 'ERROR',
          error: `No building found at (${x}, ${y})`
        };
      }

      const currBlock = props[0]; // CurrBlock (zone ID)
      const targetId = props[1]; // ObjectId (RDO ID for the building)
      console.log(`[Construction] Building found: Block=${currBlock}, ObjectId=${targetId}`);

      // Step 2: Check RDOAcceptCloning (must be available: 1=existing building, 255=empty zone)
      const initialCloning = await this.sendRdoRequest('construction', {
        verb: RdoVerb.SEL,
        targetId: currBlock,
        action: RdoAction.GET,
        member: 'RDOAcceptCloning'
      });
      const cloningValue = this.parsePropertyResponse(initialCloning.payload || '', 'RDOAcceptCloning');
      const cloningInt = parseInt(cloningValue, 10);
      console.log(`[Construction] RDOAcceptCloning initial value: ${cloningInt}`);

      // Valid values: 1 (existing building), 255 (empty zone)
      // Invalid: -1 (locked/busy)
      if (cloningInt !== 1 && cloningInt !== 255) {
        return {
          status: 'ERROR',
          error: `Block not available (RDOAcceptCloning=${cloningInt}). Zone may be locked or busy.`
        };
      }

      // Step 3: Lock the block (set RDOAcceptCloning = -1)
      console.log(`[Construction] Locking block ${currBlock}...`);
      await this.sendRdoRequest('construction', {
        verb: RdoVerb.SEL,
        targetId: currBlock,
        action: RdoAction.SET,
        member: 'RDOAcceptCloning',
        args: ['-1']
      });

      // Step 4: Execute construction action (no request ID - push command)
      const socket = this.sockets.get('construction');
      if (!socket) {
        return { status: 'ERROR', error: 'Construction socket unavailable' };
      }

      let actionCmd = '';
      switch (action) {
        case 'START':
          actionCmd = RdoCommand.sel(targetId)
            .call('RDOStartUpgrades')
            .push()
            .args(RdoValue.int(count))
            .build();
          console.log(`[Construction] Starting ${count} upgrade(s)...`);
          break;
        case 'STOP':
          actionCmd = RdoCommand.sel(targetId)
            .call('RDOStopUpgrade')
            .push()
            .build();
          console.log(`[Construction] Stopping upgrade...`);
          break;
        case 'DOWN':
          actionCmd = RdoCommand.sel(targetId)
            .call('RDODowngrade')
            .push()
            .build();
          console.log(`[Construction] Downgrading building...`);
          break;
        default:
          return { status: 'ERROR', error: `Unknown action: ${action}` };
      }

      socket.write(actionCmd);
      console.log(`[Construction] Command sent: ${actionCmd.substring(0, 50)}...`);

      // Step 5: Wait for server to process
      await new Promise(resolve => setTimeout(resolve, 200));

      // Step 6: Verify unlock (RDOAcceptCloning should return to 255)
      const finalCloning = await this.sendRdoRequest('construction', {
        verb: RdoVerb.SEL,
        targetId: currBlock,
        action: RdoAction.GET,
        member: 'RDOAcceptCloning'
      });
      const finalValue = this.parsePropertyResponse(finalCloning.payload || '', 'RDOAcceptCloning');
      console.log(`[Construction] RDOAcceptCloning final value: ${finalValue}`);

      return {
        status: 'OK'
      };
    } catch (e: any) {
      console.error(`[Construction] Error:`, e);
      return {
        status: 'ERROR',
        error: e.message || String(e)
      };
    }
  }

  /**
   * Wrapper for building upgrade actions (WebSocket API)
   * Maps WebSocket action names to internal action names
   */
  public async upgradeBuildingAction(
    x: number,
    y: number,
    action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE',
    count?: number
  ): Promise<{ success: boolean, message?: string }> {
    // Map WebSocket action names to internal action names
    let internalAction: 'START' | 'STOP' | 'DOWN';
    switch (action) {
      case 'START_UPGRADE':
        internalAction = 'START';
        break;
      case 'STOP_UPGRADE':
        internalAction = 'STOP';
        break;
      case 'DOWNGRADE':
        internalAction = 'DOWN';
        break;
      default:
        return { success: false, message: `Unknown action: ${action}` };
    }

    const result = await this.manageConstruction(x, y, internalAction, count || 1);

    if (result.status === 'OK') {
      const actionMsg = action === 'DOWNGRADE' ? 'Building downgraded' :
                        action === 'START_UPGRADE' ? `Upgrade started (${count} level${count !== 1 ? 's' : ''})` :
                        'Upgrade stopped';
      return { success: true, message: actionMsg };
    } else {
      return { success: false, message: result.error || 'Operation failed' };
    }
  }

  /**
   * Rename a facility (building)
   * Uses RDO protocol: C sel <CurrBlock> set Name="%<newName>";
   */
  public async renameFacility(x: number, y: number, newName: string): Promise<{ success: boolean, message?: string }> {
    try {
      // Use currently focused building ID if coordinates match
      let buildingId = this.currentFocusedBuildingId;

      // If not focused or different coordinates, focus first
      if (!buildingId ||
          !this.currentFocusedCoords ||
          this.currentFocusedCoords.x !== x ||
          this.currentFocusedCoords.y !== y) {
        console.log(`[Session] Building not focused, focusing at (${x}, ${y})`);
        const focusInfo = await this.focusBuilding(x, y);
        if (!focusInfo.buildingId) {
          return { success: false, message: 'Could not find building at specified coordinates' };
        }
        buildingId = focusInfo.buildingId;
      } else {
        console.log(`[Session] Using already focused building ID: ${buildingId}`);
      }

      console.log(`[Session] Renaming building ${buildingId} to "${newName}"`);

      // Ensure construction service is connected (handles building operations on port 7001)
      if (!this.sockets.has('construction')) {
        console.log('[Session] Construction service not connected, connecting now...');
        await this.connectConstructionService();
      }

      // Send RDO SET command to Construction server (port 7001)
      // Format: C sel <CurrBlock> set Name="%<newName>";
      await this.sendRdoRequest('construction', {
        verb: RdoVerb.SEL,
        targetId: buildingId,
        action: RdoAction.SET,
        member: 'Name',
        args: [`%${newName}`]  // Pass as string with % prefix for OLEString
      });

      console.log(`[Session] Building renamed successfully`);
      return { success: true, message: 'Building renamed successfully' };
    } catch (e: any) {
      console.error(`[Session] Failed to rename building:`, e);
      return { success: false, message: e.message || 'Failed to rename building' };
    }
  }

  /**
   * Delete a facility (building)
   * RDO command: C sel <World ID> call RDODelFacility "^" "#<x>","#<y>";
   * Note: sel uses worldId (from idof World), NOT building's CurrBlock ID
   */
  public async deleteFacility(x: number, y: number): Promise<{ success: boolean, message?: string }> {
    try {
      console.log(`[Session] Deleting building at (${x}, ${y})`);

      // Ensure construction service is connected (handles building operations on port 7001)
      if (!this.sockets.has('construction')) {
        console.log('[Session] Construction service not connected, connecting now...');
        await this.connectConstructionService();
      }

      // Verify worldId is available (obtained from "idof World" during connection)
      if (!this.worldId) {
        return { success: false, message: 'Construction service not properly initialized - worldId is null' };
      }

      // Send RDO CALL command to Construction server (port 7001)
      // Format: C sel <World ID> call RDODelFacility "^" "#<x>","#<y>";
      // Note: sel must use worldId (from idof World), NOT buildingId (CurrBlock)
      const result = await this.sendRdoRequest('construction', {
        verb: RdoVerb.SEL,
        targetId: this.worldId,  // Use World ID, not building CurrBlock ID
        action: RdoAction.CALL,
        member: 'RDODelFacility',
        separator: '"^"',  // Variant return type
        args: [`#${x}`, `#${y}`]  // Coordinates as integers
      });

      console.log(`[Session] Building deleted successfully, result: ${result}`);

      // Clear focused building since it no longer exists
      this.currentFocusedBuildingId = null;
      this.currentFocusedCoords = null;

      return { success: true, message: 'Building deleted successfully' };
    } catch (e: any) {
      console.error(`[Session] Failed to delete building:`, e);
      return { success: false, message: e.message || 'Failed to delete building' };
    }
  }

  public async executeRdo(serviceName: string, packetData: Partial<RdoPacket>): Promise<string> {
    if (!this.sockets.has(serviceName)) {
      throw new Error(`Service ${serviceName} not connected`);
    }

    const res = await this.sendRdoRequest(serviceName, packetData);
    return res.payload || '';
  }

  // =========================================================================
  // INTERNAL HELPERS
  // =========================================================================

  /**
   * Fetch world properties from InterfaceServer
   */
  private async fetchWorldProperties(interfaceServerId: string): Promise<void> {
    const props = [
      "WorldName", "DSArea", "WorldURL", "DAAddr", "DALockPort",
      "MailAddr", "MailPort", "WorldXSize", "WorldYSize", "WorldSeason"
    ];

    for (const prop of props) {
      const packet = await this.sendRdoRequest("world", {
        verb: RdoVerb.SEL,
        targetId: interfaceServerId,
        action: RdoAction.GET,
        member: prop
      });
      const value = this.parsePropertyResponse(packet.payload!, prop);
      console.log(`[Session] ${prop}: ${value}`);
    }
  }

  /**
   * Retrieve Tycoon cookies (last position, etc.)
   */
  
private createSocket(name: string, host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const framer = new RdoFramer();
    this.sockets.set(name, socket);
    this.framers.set(name, framer);

    socket.connect(port, host, () => {
      console.log(`[Session] Connected to ${name} (${host}:${port})`);
      resolve(socket);
    });

    socket.on('data', (chunk) => {
      const messages = framer.ingest(chunk);
      // FIXED: Call processSingleCommand instead of handleIncomingMessage
      messages.forEach(msg => this.processSingleCommand(name, msg));
    });

    socket.on('error', (err) => {
      console.error(`[Session] Socket error on ${name}:`, err);
    });

    socket.on('close', () => {
      console.log(`[Session] Socket closed: ${name}`);
      this.sockets.delete(name);
      this.framers.delete(name);
    });
  });
}

/**
   * NEW: Start ServerBusy polling (every 2 seconds)
   * When server is busy, pause all requests except ServerBusy checks
   */
  private startServerBusyPolling(): void {
    if (this.serverBusyCheckInterval) return; // Already running

    console.log('[ServerBusy] Starting 2-second polling...');

    this.serverBusyCheckInterval = setInterval(async () => {
      if (!this.worldContextId || this.phase === SessionPhase.WORLD_CONNECTING) {
        return; // Skip during login
      }

      try {
        const rid = this.requestIdCounter++;
        const packet: RdoPacket = {
          raw: '',
          verb: RdoVerb.SEL,
          targetId: this.worldContextId,
          action: RdoAction.GET,
          member: 'ServerBusy',
          rid,
          type: 'REQUEST'
        };

        const socket = this.sockets.get('world');
        if (!socket) return;

        const rawString = RdoProtocol.format(packet);
        socket.write(rawString + RDO_CONSTANTS.PACKET_DELIMITER);

        const response = await new Promise<RdoPacket>((resolve, reject) => {
          this.pendingRequests.set(rid, { resolve, reject });

          setTimeout(() => {
            if (this.pendingRequests.has(rid)) {
              this.pendingRequests.delete(rid);
              reject(new Error('ServerBusy check timeout'));
            }
          }, 1000);
        });

        const busyValue = this.parsePropertyResponse(response.payload!, 'ServerBusy');
        const wasBusy = this.isServerBusy;
        this.isServerBusy = busyValue == '1';

        if (wasBusy && !this.isServerBusy) {
          console.log('[ServerBusy] Server now available - resuming requests');
          this.processBufferedRequests();
        } else if (!wasBusy && this.isServerBusy) {
          console.log('[ServerBusy] Server now busy - pausing new requests');
        }
      } catch (e) {
        console.warn('[ServerBusy] Poll failed:', (e as Error).message);
      }
    }, this.SERVER_BUSY_CHECK_INTERVAL_MS);
  }

  /**
   * NEW: Stop ServerBusy polling
   */
  private stopServerBusyPolling(): void {
    if (this.serverBusyCheckInterval) {
      clearInterval(this.serverBusyCheckInterval);
      this.serverBusyCheckInterval = null;
    }
  }

  /**
   * NEW: Process buffered requests when server becomes available
   */
  private async processBufferedRequests(): Promise<void> {
    while (this.requestBuffer.length > 0 && !this.isServerBusy) {
      const request = this.requestBuffer.shift();
      if (!request) break;

      // Execute the buffered request
      this.executeRdoRequest(request.socketName, request.packetData)
        .then(request.resolve)
        .catch(request.reject);

      // Small delay between requests to avoid flooding
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

	public getQueueStatus(): { buffered: number; maxBuffer: number; serverBusy: boolean; pendingMaps: number; activeMapRequests: number } {
		return {
			buffered: this.requestBuffer.length,
			maxBuffer: this.MAX_BUFFER_SIZE,
			serverBusy: this.isServerBusy,
			pendingMaps: this.pendingMapRequests.size,
			activeMapRequests: this.activeMapRequests
		};
	}

/**
 * NEW: Send RDO request with buffering when server is busy
 */
private sendRdoRequest(socketName: string, packetData: Partial<RdoPacket>): Promise<RdoPacket> {
  return new Promise((resolve, reject) => {
    // If server is busy, buffer the request
    if (this.isServerBusy) {
      if (this.requestBuffer.length >= this.MAX_BUFFER_SIZE) {
        // Buffer is full, drop the request
        console.warn('[Buffer] Buffer full, dropping request:', packetData.member);
        reject(new Error('Request buffer full - server busy'));
        return;
      }

      // Add to buffer
      this.requestBuffer.push({ socketName, packetData, resolve, reject });
      console.log(`[Buffer] Request buffered (${this.requestBuffer.length}/${this.MAX_BUFFER_SIZE}):`, packetData.member);
      return;
    }

    // Server not busy, execute immediately
    this.executeRdoRequest(socketName, packetData)
      .then(resolve)
      .catch(reject);
  });
}

private async executeRdoRequest(socketName: string, packetData: Partial<RdoPacket>): Promise<RdoPacket> {
  return new Promise(async (resolve, reject) => {
    const socket = this.sockets.get(socketName);
    if (!socket) {
      return reject(new Error(`Socket ${socketName} not active`));
    }

    const rid = this.requestIdCounter++;
    const packet = { ...packetData, rid, type: 'REQUEST' } as RdoPacket;

    // Set up response handler with timeout
    const timeout = setTimeout(() => {
      if (this.pendingRequests.has(rid)) {
        this.pendingRequests.delete(rid);
        reject(new Error(`Request timeout: ${packetData.member || 'unknown'}`));
      }
    }, 10000); // 10 second timeout

    // Store both callbacks in an object
    this.pendingRequests.set(rid, {
      resolve: (response: RdoPacket) => {
        clearTimeout(timeout);
        resolve(response);
      },
      reject: (err: any) => {
        clearTimeout(timeout);
        reject(err);
      }
    });

    // Send the request
    const rawString = RdoProtocol.format(packet);
    socket.write(rawString + RDO_CONSTANTS.PACKET_DELIMITER);
  });
}

private handleIncomingMessage(socketName: string, raw: string) {
  // CRITICAL FIX: Handle multiple commands in single message
  // Split by ';' but keep the delimiter for proper parsing
  const commands = raw.split(';').filter(cmd => cmd.trim().length > 0);
  
  // If multiple commands detected, process each separately
  if (commands.length > 1) {
    console.log(`[Session] Multiple commands detected in message: ${commands.length}`);
    commands.forEach(cmdRaw => {
      const fullCmd = cmdRaw.trim() + ';';
      this.processSingleCommand(socketName, fullCmd);
    });
    return;
  }
  
  // Single command - process normally
  this.processSingleCommand(socketName, raw);
}

	private processSingleCommand(socketName: string, raw: string) {
	  const packet = RdoProtocol.parse(raw);

	  // NEW: Check if this is a RefreshObject push
	  if (this.isRefreshObjectPush(packet)) {
		const buildingInfo = this.parseRefreshObjectPush(packet);
		if (buildingInfo) {
		  console.log(`[Session] RefreshObject for building ${buildingInfo.buildingId}`);
		  this.emit('ws_event', {
			type: WsMessageType.EVENT_BUILDING_REFRESH,
			building: buildingInfo
		  } as WsEventBuildingRefresh);
		}
		return; // Don't process as regular response
	  }

	  // Handle server requests (IDOF, etc.)
	  if (packet.type === 'REQUEST' && packet.rid) {
		this.handleServerRequest(socketName, packet);
		return;
	  }

	  // Handle responses
	  if (packet.type === 'RESPONSE') {
		if (packet.rid && this.pendingRequests.has(packet.rid)) {
		  // CORRECTED: Get the callbacks object and call resolve
		  const callbacks = this.pendingRequests.get(packet.rid)!;
		  this.pendingRequests.delete(packet.rid);
		  callbacks.resolve(packet);
		} else {
		  console.warn(`[Session] Unmatched response RID ${packet.rid}: ${raw}`);
		}
	  } else {
		// Push command
		this.handlePush(socketName, packet);
	  }
	}


  private handleServerRequest(socketName: string, packet: RdoPacket) {
    console.log(`[Session] Server Request: ${packet.raw}`);
    if (packet.verb === RdoVerb.IDOF && packet.targetId) {
      const objectId = this.knownObjects.get(packet.targetId);
      if (objectId) {
        const response = `A${packet.rid} objid="${objectId}";`;
        const socket = this.sockets.get(socketName);
        if (socket) {
          socket.write(response);
          console.log(`[Session] Auto-replied to server: ${response}`);
        }
      } else {
        console.warn(`[Session] Server requested unknown object: ${packet.targetId}`);
      }
    }
  }

private handlePush(socketName: string, packet: RdoPacket) {
  // CRITICAL: Detect InitClient push during login
  if (this.waitingForInitClient) {
    const hasInitClient = packet.member === "InitClient" ||
      (packet.raw && packet.raw.includes("InitClient"));
    if (hasInitClient) {
      console.log(`[Session] Server sent InitClient push (detected in ${packet.member ? 'member' : 'raw'})`);
      this.waitingForInitClient = false;
      if (this.initClientResolver) {
        this.initClientResolver();
        this.initClientResolver = null;
      }
      return;
    }
  }

  // Server-initiated SetLanguage (just log it, no action needed)
  if (packet.member === "SetLanguage") {
    console.log(`[Session] Server sent SetLanguage push (ignored)`);
    return;
  }

  // NewMail notification
  if (packet.member === "NewMail") {
    console.log(`[Session] Server sent NewMail notification: ${packet.raw}`);
    return;
  }

	// 1. ChatMsg parsing 
    if (packet.member === 'ChatMsg') {
      console.log(`[Chat] Raw ChatMsg packet:`, packet);
      console.log(`[Chat] Args:`, packet.args);
      console.log(`[Chat] Args length:`, packet.args?.length);
      
      if (packet.args && packet.args.length >= 2) {
        // Parse from field (format: "name/id/status" or just "name")
        let from = packet.args[0].replace(/^[%#@$]/, '');
        const message = packet.args[1].replace(/^[%#@$]/, '');
        
        // Extract just the name if format is "name/id/status"
        if (from.includes('/')) {
          from = from.split('/')[0];
        }
        
        console.log(`[Chat] Parsed - from: "${from}", message: "${message}"`);
        
        const event: WsEventChatMsg = {
          type: WsMessageType.EVENT_CHAT_MSG,
          channel: this.currentChannel || 'Lobby',
          from: from,
          message: message
        };
        
        console.log(`[Chat] Emitting event:`, event);
        this.emit('ws_event', event);
        return;
      } else {
        console.warn(`[Chat] ChatMsg packet has insufficient args:`, packet);
      }
    }

  // 2. NotifyMsgCompositionState - User typing status
  if (packet.member === 'NotifyMsgCompositionState' && packet.args && packet.args.length >= 2) {
    const username = packet.args[0].replace(/^[%#@$]/, '');
    const statusStr = packet.args[1].replace(/^[%#@$]/, '');
    const isTyping = statusStr === '1';

    console.log(`[Chat] ${username} is ${isTyping ? 'typing' : 'idle'}`);

    const event: WsEventChatUserTyping = {
      type: WsMessageType.EVENT_CHAT_USER_TYPING,
      username,
      isTyping
    };

    this.emit('ws_event', event);
    return;
  }

  // 3. NotifyChannelChange - Channel switched
  if (packet.member === 'NotifyChannelChange' && packet.args && packet.args.length >= 1) {
    const channelName = packet.args[0].replace(/^[%#@$]/, '');
    this.currentChannel = channelName;

    console.log(`[Chat] Channel changed to: ${channelName || 'Lobby'}`);

    const event: WsEventChatChannelChange = {
      type: WsMessageType.EVENT_CHAT_CHANNEL_CHANGE,
      channelName: channelName || 'Lobby'
    };

    this.emit('ws_event', event);
    return;
  }

  // 4. NotifyUserListChange - User joined/left
  if (packet.member === 'NotifyUserListChange' && packet.args && packet.args.length >= 2) {
    const userInfo = packet.args[0].replace(/^[%#@$]/, '');
    const actionCode = packet.args[1].replace(/^[%#@$]/, '');
    const userParts = userInfo.split('/');

    if (userParts.length >= 3) {
      const user: ChatUser = {
        name: userParts[0],
        id: userParts[1],
        status: parseInt(userParts[2], 10) || 0
      };

      const action = actionCode === '0' ? 'JOIN' : 'LEAVE';
      console.log(`[Chat] User ${user.name} ${action === 'JOIN' ? 'joined' : 'left'}`);

      const event: WsEventChatUserListChange = {
        type: WsMessageType.EVENT_CHAT_USER_LIST_CHANGE,
        user,
        action
      };

      this.emit('ws_event', event);
    }
    return;
  }

  // 5. RefreshTycoon parsing
  if (packet.member === 'RefreshTycoon' && packet.args && packet.args.length >= 5) {
    try {
      // Clean type prefixes (%, #, @, $) from args
      const cleanArgs = packet.args.map(arg => arg.replace(/^[%#@$]/, ''));

      const tycoonUpdate: WsEventTycoonUpdate = {
        type: WsMessageType.EVENT_TYCOON_UPDATE,
        cash: cleanArgs[0],
        incomePerHour: cleanArgs[1],
        ranking: parseInt(cleanArgs[2], 10) || 0,
        buildingCount: parseInt(cleanArgs[3], 10) || 0,
        maxBuildings: parseInt(cleanArgs[4], 10) || 0
      };

      console.log(`[Push] Tycoon Update: Cash=${tycoonUpdate.cash}, Income/h=${tycoonUpdate.incomePerHour}, Rank=${tycoonUpdate.ranking}, Buildings=${tycoonUpdate.buildingCount}/${tycoonUpdate.maxBuildings}`);
      this.emit('ws_event', tycoonUpdate);
      return;
    } catch (e) {
      console.error('[Push] Error parsing RefreshTycoon:', e);
      // Fallback to generic push
    }
  }

  // 6. Generic push fallback (for unhandled events)
  const event: WsEventRdoPush = {
    type: WsMessageType.EVENT_RDO_PUSH,
    rawPacket: packet.raw
  };

  this.emit('ws_event', event);
}


  // =========================================================================
  // PARSING UTILS
  // =========================================================================

  private parseDirectoryResult(payload: string): WorldInfo[] {
    let raw = payload.trim();
    raw = raw.replace(/^[%#$@]/, '');
    const lines = raw.split(/\n/);
    const data: Map<string, string> = new Map();

    for (const line of lines) {
      if (!line.includes('=')) continue;
      const parts = line.split('=');
      const key = parts[0].trim().toLowerCase();
      const value = parts.slice(1).join('=').trim();
      data.set(key, value);
    }

    const countStr = data.get('count');
    if (!countStr) {
      console.warn('[Session] Directory Parse Error: "count" key not found in response.');
      console.warn('[Session] First 5 keys:', Array.from(data.keys()).slice(0, 5));
      return [];
    }

    const count = parseInt(countStr, 10);
    const worlds: WorldInfo[] = [];

    for (let i = 0; i < count; i++) {
      const name = data.get(`key${i}`) || 'Unknown';
      const url = data.get(`interface/url${i}`) || '';
      const ip = data.get(`interface/ip${i}`) || '127.0.0.1';
      const port = parseInt(data.get(`interface/port${i}`) || '0', 10);
      const date = data.get(`general/date${i}`);
      const population = parseInt(data.get(`general/population${i}`) || '0', 10);
      const investors = parseInt(data.get(`general/investors${i}`) || '0', 10);
      const online = parseInt(data.get(`general/online${i}`) || '0', 10);
      const runningStr = data.get(`interface/running${i}`) || '';
      const running3 = runningStr.toLowerCase() === 'true';

      if (port === 0) continue;

      worlds.push({
        name, url, ip, port,
        season: date,
        date: date,
        population: population,
        investors: investors,
        online: online,
        players: online,  // online and players are the same
        mapSizeX: 0,
        mapSizeY: 0,
        running3: running3
      });
    }

    return worlds;
  }

  private parseIdOfResponse(packet: RdoPacket): string {
    const payload = packet.payload || '';
    const match = payload.match(/objid\s*=\s*"?([^"\s]+)"?/i);
    if (match && match[1]) {
      return match[1];
    }

    const parts = payload.split(/\s+/);
    if (parts[0] === 'objid' && parts.length > 1) {
      return parts[1];
    }

    return parts[0];
  }

  private parsePropertyResponse(payload: string, propName: string): string {
    const regex = new RegExp(`${propName}\\s*=\\s*"([^"]*)"`, 'i');
    const match = payload.match(regex);
    if (match && match[1]) {
      return match[1].replace(/^[$#%@]/, '');
    }

    if (payload.startsWith(propName)) {
      const cleaned = payload.substring(propName.length).trim();
      return cleaned.replace(/^[$#%@]/, '');
    }

    return payload;
  }

  private cleanPayload(payload: string): string {
    let cleaned = payload.trim();

    // Handle res="..." format (e.g., res="#6805584" -> 6805584)
    const resMatch = cleaned.match(/^res="([^"]*)"$/);
    if (resMatch) {
      cleaned = resMatch[1];
    }

    // Remove outer quotes
    cleaned = cleaned.replace(/^"|"$/g, '');

    // Remove type prefix (#, %, @, $) if present
    if (cleaned.length > 0 && ['#', '%', '@', '$'].includes(cleaned[0])) {
      cleaned = cleaned.substring(1);
    }

    return cleaned.trim();
  }
  
    /**
   * Get list of users in current chat channel
   */
  public async getChatUserList(): Promise<ChatUser[]> {
    if (!this.worldContextId) throw new Error('Not logged into world');
    
    console.log('[Chat] Getting user list...');
    
    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.GET,
      member: 'GetUserList'
    });
    
    const rawUsers = this.parsePropertyResponse(packet.payload || '', 'GetUserList');
    return this.parseChatUserList(rawUsers);
  }

  /**
   * Get list of available chat channels
   */
  public async getChatChannelList(): Promise<string[]> {
    if (!this.worldContextId) throw new Error('Not logged into world');
    
    console.log('[Chat] Getting channel list...');
    
    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'GetChannelList',
      args: ['%ROOT'],
      separator: '^'
    });
    
    const rawChannels = this.parsePropertyResponse(packet.payload || '', 'res');
    return this.parseChatChannelList(rawChannels);
  }

  /**
   * Get information about a specific channel
   */
  public async getChatChannelInfo(channelName: string): Promise<string> {
    if (!this.worldContextId) throw new Error('Not logged into world');
    
    console.log(`[Chat] Getting info for channel: ${channelName}`);
    
    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'GetChannelInfo',
      args: [channelName],
      separator: '^'
    });
    
    return this.parsePropertyResponse(packet.payload || '', 'res');
  }

  /**
   * Join a chat channel
   * @param channelName - Channel name, or "" for lobby
   */
  public async joinChatChannel(channelName: string): Promise<void> {
    if (!this.worldContextId) throw new Error('Not logged into world');
    
    const displayName = channelName || 'Lobby';
    console.log(`[Chat] Joining channel: ${displayName}`);
    
    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'JoinChannel',
      args: [channelName, ''],
      separator: '^'
    });
    
    const result = this.parsePropertyResponse(packet.payload || '', 'res');
    if (result !== '0') {
      throw new Error(`Failed to join channel: ${result}`);
    }
    
    this.currentChannel = channelName;
    console.log(`[Chat] Successfully joined: ${displayName}`);
  }

  /**
   * Send a chat message to current channel
   */
  public async sendChatMessage(message: string): Promise<void> {
    if (!this.worldContextId) throw new Error('Not logged into world');
    if (!message.trim()) return;
    
    console.log(`[Chat] Sending message: ${message}`);
    
    await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'SayThis',
      args: ['', message],
      separator: '*'
    });
  }
  
  /**
   * Notify server of typing status
   */
  public async setChatTypingStatus(isTyping: boolean): Promise<void> {
    if (!this.worldContextId) throw new Error('Not logged into world');

    const status = isTyping ? 1 : 0;

    // Send as push command (no await needed)
    const socket = this.sockets.get('world');
    if (socket) {
      const cmd = RdoCommand.sel(this.worldContextId!)
        .call('MsgCompositionChanged')
        .push()
        .args(RdoValue.int(status))
        .build();
      socket.write(cmd);
    }
  }

  /**
   * Get current channel name
   */
  public getCurrentChannel(): string {
    return this.currentChannel || 'Lobby';
  }

  // =========================================================================
  // SESSION LIFECYCLE
  // =========================================================================

  /**
   * Cleanup all resources and close all connections
   * Should be called when the WebSocket client disconnects
   */
  public destroy(): void {
    console.log('[Session] Destroying session and cleaning up resources...');

    // Stop ServerBusy polling
    this.stopServerBusyPolling();

    // Close all TCP sockets
    for (const [name, socket] of this.sockets.entries()) {
      console.log(`[Session] Closing socket: ${name}`);
      try {
        socket.destroy();
      } catch (err) {
        console.error(`[Session] Error closing socket ${name}:`, err);
      }
    }

    // Clear all maps and buffers
    this.sockets.clear();
    this.framers.clear();
    this.pendingRequests.clear();
    this.availableWorlds.clear();
    this.knownObjects.clear();
    this.chatUsers.clear();
    this.requestBuffer = [];
    this.pendingMapRequests.clear();

    // Reset state
    this.phase = SessionPhase.DISCONNECTED;
    this.directorySessionId = null;
    this.worldContextId = null;
    this.tycoonId = null;
    this.currentWorldInfo = null;
    this.rdoCnntId = null;
    this.cacherId = null;
    this.worldId = null;
    this.interfaceEventsId = null;
    this.currentFocusedBuildingId = null;
    this.currentFocusedCoords = null;
    this.isServerBusy = false;
    this.activeMapRequests = 0;

    console.log('[Session] Session destroyed successfully');
  }

  // =========================================================================
  // CHAT PARSING HELPERS
  // =========================================================================

  /**
   * Parse user list format: "name/id/status\n..."
   */
  private parseChatUserList(rawData: string): ChatUser[] {
    const users: ChatUser[] = [];
    const lines = rawData.split(/\r?\n/).filter(l => l.trim().length > 0);
    
    for (const line of lines) {
      const parts = line.split('/');
      if (parts.length >= 3) {
        users.push({
          name: parts[0].trim(),
          id: parts[1].trim(),
          status: parseInt(parts[2], 10) || 0
        });
      }
    }
    
    console.log(`[Chat] Parsed ${users.length} users`);
    return users;
  }

  /**
   * Parse channel list format: "channelName\n..."
   */
  private parseChatChannelList(rawData: string): string[] {
    const channels = rawData
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    console.log(`[Chat] Parsed ${channels.length} channels`);
    return channels;
  }

  // =========================================================================
  // GETSURFACE PROTOCOL (Zone Overlays)
  // =========================================================================

  /**
   * Request surface data (zones, pollution, etc.) for a map area
   * Uses RLE (Run-Length Encoding) compression for efficient transmission
   */
  public async getSurfaceData(
    surfaceType: SurfaceType,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): Promise<SurfaceData> {
    if (!this.worldContextId) {
      throw new Error('Not logged into world - cannot get surface data');
    }

    console.log(`[Surface] Requesting ${surfaceType} data for area (${x1},${y1}) to (${x2},${y2})`);

    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'GetSurface',
      separator: '"^"',
      args: [`%${surfaceType}`, `#${x1}`, `#${y1}`, `#${x2}`, `#${y2}`]
    });

    return this.parseRLEResponse(packet.payload || '');
  }

  /**
   * Parse RLE-encoded surface response
   * Format: res="%width:height:row1_data,:row2_data,:..."
   */
  private parseRLEResponse(response: string): SurfaceData {
    // Extract data after 'res="' or just use the response directly
    let data = response;
    const dataMatch = response.match(/res="([^"]+)"/);
    if (dataMatch) {
      data = dataMatch[1];
    }

    // Remove leading '%' if present
    if (data.startsWith('%')) {
      data = data.substring(1);
    }

    const parts = data.split(':');

    if (parts.length < 3) {
      console.warn('[Surface] Invalid RLE response format');
      return { width: 0, height: 0, rows: [] };
    }

    // Parse dimensions
    const width = parseInt(parts[0], 10);
    const height = parseInt(parts[1], 10);

    // Parse rows (skip first two parts which are dimensions)
    const rows: number[][] = [];
    for (let i = 2; i < parts.length; i++) {
      const rowData = parts[i].replace(/^,/, ''); // Remove leading comma
      if (rowData) {
        rows.push(this.decodeRLERow(rowData));
      }
    }

    console.log(`[Surface] Parsed surface data: ${width}x${height}, ${rows.length} rows`);
    return { width, height, rows };
  }

  /**
   * Decode a single RLE-encoded row
   * Format: "value1=count1,value2=count2,..."
   */
  private decodeRLERow(encodedRow: string): number[] {
    const cells: number[] = [];
    const segments = encodedRow.split(',');

    for (const segment of segments) {
      if (!segment) continue;

      const parts = segment.split('=');
      if (parts.length === 2) {
        const value = parseInt(parts[0], 10);
        const count = parseInt(parts[1], 10);

        for (let i = 0; i < count; i++) {
          cells.push(value);
        }
      }
    }

    return cells;
  }

  // =========================================================================
  // BUILDING CONSTRUCTION FEATURE
  // =========================================================================

  /**
   * Fetch building categories via HTTP (KindList.asp)
   */
  public async fetchBuildingCategories(companyName: string): Promise<BuildingCategory[]> {
    if (!this.currentWorldInfo || !this.cachedUsername) {
      throw new Error('Not logged into world - cannot fetch building categories');
    }

    const params = new URLSearchParams({
      Company: companyName,
      WorldName: this.currentWorldInfo.name,
      Cluster: '',
      Tycoon: this.cachedUsername
    });

    const url = `http://${this.currentWorldInfo.ip}/five/0/visual/voyager/Build/KindList.asp?${params.toString().replace(/\+/g, '%20')}`;
    console.log(`[BuildConstruction] Fetching categories from ${url}`);

    try {
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();

      return this.parseBuildingCategories(html);
    } catch (e) {
      console.error('[BuildConstruction] Failed to fetch categories:', e);
      return [];
    }
  }

  /**
   * Parse HTML response from KindList.asp to extract building categories
   */
  private parseBuildingCategories(html: string): BuildingCategory[] {
    const categories: BuildingCategory[] = [];

    // Match <td> elements with ref attribute containing FacilityList.asp
    // Handle both quoted and unquoted ref attributes
    // If quoted, capture everything until closing quote; if unquoted, capture until space/bracket
    const tdRegex = /<td[^>]*\sref=(["']?)([^"']*FacilityList\.asp[^"']*)\1[^>]*>([\s\S]*?)<\/td>/gi;
    let match;

    while ((match = tdRegex.exec(html)) !== null) {
      const ref = match[2];  // Second capture group contains the ref URL
      const content = match[3];  // Third capture group contains the content

      console.log(`[BuildConstruction] Found category ref: ${ref.substring(0, 100)}`);

      // Parse query parameters from ref
      const urlParams = new URLSearchParams(ref.split('?')[1] || '');

      // Extract category name from content
      // Try multiple patterns:
      // 1. <div class=link> or <div class="link">
      // 2. title attribute on img tag
      let kindName = '';

      // Pattern 1: <div> with class=link (quoted or unquoted)
      const divMatch = /<div[^>]*class\s*=\s*["']?link["']?[^>]*>\s*([^<]+)\s*<\/div>/i.exec(content);
      if (divMatch) {
        kindName = divMatch[1].trim();
      }

      // Pattern 2: title attribute (fallback)
      if (!kindName) {
        const titleMatch = /title\s*=\s*["']([^"']+)["']/i.exec(content);
        if (titleMatch) {
          kindName = titleMatch[1].trim();
        }
      }

      // Extract icon path (handle both quoted and unquoted src)
      const iconMatch = /src\s*=\s*["']?([^"'\s>]+)["']?/i.exec(content);
      const iconPath = iconMatch?.[1] || '';

      if (kindName && urlParams.get('Kind')) {
        const category = {
          kindName: kindName,
          kind: urlParams.get('Kind') || '',
          cluster: urlParams.get('Cluster') || '',
          folder: urlParams.get('Folder') || '',
          tycoonLevel: parseInt(urlParams.get('TycoonLevel') || '0', 10),
          iconPath: this.convertToProxyUrl(iconPath)
        };

        console.log(`[BuildConstruction] Parsed category: ${category.kindName} (${category.kind})`);
        categories.push(category);
      } else {
        console.warn(`[BuildConstruction] Skipped category - kindName: "${kindName}", Kind: "${urlParams.get('Kind')}"`);
      }
    }

    console.log(`[BuildConstruction] Parsed ${categories.length} categories total`);
    return categories;
  }

  /**
   * Fetch facilities (buildings) for a specific category via HTTP (FacilityList.asp)
   */
  public async fetchBuildingFacilities(
    companyName: string,
    cluster: string,
    kind: string,
    kindName: string,
    folder: string,
    tycoonLevel: number
  ): Promise<BuildingInfo[]> {
    if (!this.currentWorldInfo) {
      throw new Error('Not logged into world - cannot fetch facilities');
    }

    const params = new URLSearchParams({
      Company: companyName,
      WorldName: this.currentWorldInfo.name,
      Cluster: cluster,
      Kind: kind,
      KindName: kindName,
      Folder: folder,
      TycoonLevel: tycoonLevel.toString()
    });

    const url = `http://${this.currentWorldInfo.ip}/five/0/visual/voyager/Build/FacilityList.asp?${params.toString()}`;
    console.log(`[BuildConstruction] Fetching facilities from ${url}`);

    try {
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();

      return this.parseBuildingFacilities(html);
    } catch (e) {
      console.error('[BuildConstruction] Failed to fetch facilities:', e);
      return [];
    }
  }

  /**
   * Parse HTML response from FacilityList.asp to extract building information
   */
  private parseBuildingFacilities(html: string): BuildingInfo[] {
    const facilities: BuildingInfo[] = [];

    // Match each building's detail cell (Cell_N) - handle both quoted and unquoted id
    const cellRegex = /<tr[^>]*\sid\s*=\s*["']?Cell_(\d+)["']?[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;

    while ((match = cellRegex.exec(html)) !== null) {
      const cellIndex = match[1];
      const cellContent = match[2];

      // Find corresponding LinkText div for building name and availability
      // Handle both quoted and unquoted attributes
      const linkTextRegex = new RegExp(
        `<div[^>]*id\\s*=\\s*["']?LinkText_${cellIndex}["']?[^>]*class\\s*=\\s*["']?listItem["']?[^>]*available\\s*=\\s*["']?(\\d+)["']?[^>]*>([^<]+)<`,
        'i'
      );
      const linkMatch = linkTextRegex.exec(html);

      if (!linkMatch) {
        console.warn(`[BuildConstruction] No LinkText found for Cell_${cellIndex}`);
        continue;
      }

      const available = linkMatch[1] === '1';
      const name = linkMatch[2].trim();

      // Extract building icon - handle both quoted and unquoted src
      const iconMatch = /src\s*=\s*["']?([^"'\s>]+)["']?/i.exec(cellContent);
      const iconPath = iconMatch?.[1] || '';

      // Extract FacilityClass from icon filename
      // Real server format: /five/icons/MapPGIFoodStore64x32x0.gif -> PGIFoodStore
      // Icon filename pattern: Map{FacilityClass}{width}x{height}x{variant}.gif
      let facilityClass = '';
      let visualClassId = '';

      if (iconPath) {
        const iconFilenameMatch = /Map([A-Z][a-zA-Z0-9]+?)(?:\d+x\d+x\d+)?\.gif/i.exec(iconPath);
        if (iconFilenameMatch) {
          facilityClass = iconFilenameMatch[1]; // e.g., "PGIFoodStore"
          console.log(`[BuildConstruction] Extracted facilityClass "${facilityClass}" from icon: ${iconPath}`);
        }
      }

      // Try to extract VisualClassId from various sources
      // 1. Try to find it in a URL parameter
      const visualIdMatch = /VisualClassId[=:](\d+)/i.exec(cellContent);
      if (visualIdMatch) {
        visualClassId = visualIdMatch[1];
      } else {
        // 2. Fallback: use facilityClass as visualClassId
        visualClassId = facilityClass;
      }

      // Extract cost (e.g., "$140K") - handle both quoted and unquoted class
      const costMatch = /<div[^>]*class\s*=\s*["']?comment["']?[^>]*>\s*\$?([\d,]+\.?\d*)\s*([KM]?)/i.exec(cellContent);
      let cost = 0;
      if (costMatch) {
        const value = parseFloat(costMatch[1].replace(/,/g, ''));
        const multiplier = costMatch[2] === 'K' ? 1000 : costMatch[2] === 'M' ? 1000000 : 1;
        cost = value * multiplier;
      }

      // Extract area (e.g., "400 m.")
      const areaMatch = /([\d,]+)\s*m\./i.exec(cellContent);
      const area = areaMatch ? parseInt(areaMatch[1].replace(/,/g, ''), 10) : 0;

      // Extract description - handle both quoted and unquoted class
      const descMatch = /<div[^>]*class\s*=\s*["']?description["']?[^>]*>([^<]+)</i.exec(cellContent);
      const description = descMatch?.[1]?.trim() || '';

      // Extract zone requirement from zone image title
      const zoneMatch = /<img[^>]*src\s*=\s*["']?[^"']*zone[^"']*["']?[^>]*title\s*=\s*["']([^"']+)["']/i.exec(cellContent);
      const zoneRequirement = zoneMatch?.[1] || '';

      if (facilityClass && name) {
        const facility = {
          name,
          facilityClass,
          visualClassId,
          cost,
          area,
          description,
          zoneRequirement,
          iconPath: this.convertToProxyUrl(iconPath),
          available
        };

        console.log(`[BuildConstruction] Parsed facility: ${facility.name} (${facility.facilityClass}) - $${facility.cost}, ${facility.area}m², available: ${facility.available}`);
        facilities.push(facility);
      } else {
        console.warn(`[BuildConstruction] Skipped facility - name: "${name}", facilityClass: "${facilityClass}"`);
      }
    }

    console.log(`[BuildConstruction] Parsed ${facilities.length} facilities total`);
    return facilities;
  }

  /**
   * Place a new building via RDO NewFacility command
   */
  public async placeBuilding(
    facilityClass: string,
    x: number,
    y: number
  ): Promise<{ success: boolean; buildingId: string | null }> {
    if (!this.worldContextId) {
      throw new Error('Not logged into world - cannot place building');
    }

    console.log(`[BuildConstruction] Placing ${facilityClass} at (${x}, ${y})`);

    try {
      const packet = await this.sendRdoRequest('world', {
        verb: RdoVerb.SEL,
        targetId: this.worldContextId,
        action: RdoAction.CALL,
        member: 'NewFacility',
        separator: '"^"',
        args: [`%${facilityClass}`, '#28', `#${x}`, `#${y}`]
      });

      // Parse response for result code
      const resultMatch = /res="#(\d+)"/.exec(packet.payload || '');
      const resultCode = resultMatch ? parseInt(resultMatch[1], 10) : -1;

      if (resultCode === 0) {
        // Extract new building ID if available
        const buildingIdMatch = /sel (\d+)/.exec(packet.payload || '');
        const buildingId = buildingIdMatch?.[1] || null;

        console.log(`[BuildConstruction] Building placed successfully. ID: ${buildingId}`);
        return { success: true, buildingId };
      } else {
        console.warn(`[BuildConstruction] Building placement failed. Result code: ${resultCode}`);
        return { success: false, buildingId: null };
      }
    } catch (e) {
      console.error('[BuildConstruction] Failed to place building:', e);
      return { success: false, buildingId: null };
    }
  }

  // =============================================================================
  // BUILDING DETAILS FEATURE
  // =============================================================================

  /**
   * Get detailed building properties based on template
   * Fetches all properties defined in the building's template
   */
  public async getBuildingDetails(
    x: number,
    y: number,
    visualClass: string
  ): Promise<BuildingDetailsResponse> {
    console.log(`[BuildingDetails] Fetching details for building at (${x}, ${y}), visualClass: ${visualClass}`);

    // Get template for this building type
    const template = getTemplateForVisualClass(visualClass);
    console.log(`[BuildingDetails] Using template: ${template.name}`);

    // First, get basic building info via focusBuilding (this always works)
    let buildingName = '';
    let ownerName = '';
    let buildingId = '';
    try {
      const focusInfo = await this.focusBuilding(x, y);
      buildingName = focusInfo.buildingName;
      ownerName = focusInfo.ownerName;
      buildingId = focusInfo.buildingId;
      console.log(`[BuildingDetails] Focus info: name="${buildingName}", owner="${ownerName}"`);
    } catch (e) {
      console.warn(`[BuildingDetails] Could not focus building:`, e);
    }

    // Connect to map service
    await this.connectMapService();
    if (!this.cacherId) {
      throw new Error('Map service not initialized');
    }

    // Create temporary object for property queries
    const tempObjectId = await this.cacherCreateObject();

    try {
      // Set object to the building coordinates
      await this.cacherSetObject(tempObjectId, x, y);

      // Collect property names with structured output for two-phase fetching
      const collected = collectTemplatePropertyNamesStructured(template);
      const allValues = new Map<string, string>();
      const BATCH_SIZE = 50;

      // Phase 1: Fetch regular properties and count properties
      const phase1Props = [...collected.regularProperties, ...collected.countProperties];

      for (let i = 0; i < phase1Props.length; i += BATCH_SIZE) {
        const batch = phase1Props.slice(i, i + BATCH_SIZE);
        const values = await this.cacherGetPropertyList(tempObjectId, batch);

        for (let j = 0; j < batch.length; j++) {
          const value = j < values.length ? values[j] : '';
          if (value && value.trim() && value !== 'error') {
            allValues.set(batch[j], value);
          }
        }
      }

      // Phase 2: Fetch indexed properties based on count values
		const indexedProps: string[] = [];
		const countValues = new Map<string, number>();

		for (const countProp of collected.countProperties) {
		  const countStr = allValues.get(countProp);
		  const count = countStr ? parseInt(countStr, 10) : 0;
		  countValues.set(countProp, count);
		  console.log(`[BuildingDetails] Count: ${countProp} = "${countStr}" (parsed: ${count})`);

		  // Build indexed property names based on actual count
		  const indexedDefs = collected.indexedByCount.get(countProp) || [];
		  for (const def of indexedDefs) {
			const suffix = def.indexSuffix || '';
			
			for (let idx = 0; idx < count; idx++) {
			  indexedProps.push(`${def.rdoName}${idx}${suffix}`);
			  if (def.maxProperty) {
				indexedProps.push(`${def.maxProperty}${idx}${suffix}`);
			  }
			}

			if (def.columns) {
			  for (const col of def.columns) {
				for (let idx = 0; idx < count; idx++) {
				  indexedProps.push(`${col.rdoSuffix}${idx}${suffix}`);
				}
			  }
			}
		  }
		}

      // Fetch indexed properties
      if (indexedProps.length > 0) {
        //console.log(`[BuildingDetails] Fetching indexed properties: ${indexedProps.join(', ')}`);
        for (let i = 0; i < indexedProps.length; i += BATCH_SIZE) {
          const batch = indexedProps.slice(i, i + BATCH_SIZE);
          const values = await this.cacherGetPropertyList(tempObjectId, batch);

          for (let j = 0; j < batch.length; j++) {
            const value = j < values.length ? values[j] : '';
            //console.log(`[BuildingDetails] ${batch[j]} = "${value}"`);
            if (value && value.trim() && value !== 'error') {
              allValues.set(batch[j], value);
            }
          }
        }
      }

      // Build response grouped by tabs
      // Build response grouped by tabs
		const groups: { [groupId: string]: BuildingPropertyValue[] } = {};

		for (const group of template.groups) {
		  const groupValues: BuildingPropertyValue[] = [];

		  for (const prop of group.properties) {
			const suffix = prop.indexSuffix || '';

			// Handle WORKFORCE_TABLE type specially
			if (prop.type === 'WORKFORCE_TABLE') {
			  // Add all workforce properties for 3 worker classes (0, 1, 2)
			  for (let i = 0; i < 3; i++) {
				const workerProps = [
				  `Workers${i}`,
				  `WorkersMax${i}`,
				  `WorkersK${i}`,
				  `Salaries${i}`,
				  `WorkForcePrice${i}`,
				];

				for (const propName of workerProps) {
				  const value = allValues.get(propName);
				  if (value) {
					groupValues.push({
					  name: propName,
					  value: value,
					  index: i,
					});
				  }
				}
			  }
			  continue;
			}

			if (prop.indexed && prop.countProperty) {
			  // Handle indexed properties using the count value
			  const count = countValues.get(prop.countProperty) || 0;
			  
			  for (let idx = 0; idx < count; idx++) {
				const propName = `${prop.rdoName}${idx}${suffix}`;
				const value = allValues.get(propName);
				
				if (value) {
				  groupValues.push({
					name: propName,
					value: value,
					index: idx,
				  });
				}
				
				// Also get max property if defined
				if (prop.maxProperty) {
				  const maxPropName = `${prop.maxProperty}${idx}${suffix}`;
				  const maxValue = allValues.get(maxPropName);
				  if (maxValue) {
					groupValues.push({
					  name: maxPropName,
					  value: maxValue,
					  index: idx,
					});
				  }
				}
			  }
			} else if (prop.indexed) {
			  // Indexed without count property - use fixed range (0-9)
			  for (let idx = 0; idx < 10; idx++) {
				const propName = `${prop.rdoName}${idx}${suffix}`;
				const value = allValues.get(propName);
				
				if (value) {
				  groupValues.push({
					name: propName,
					value: value,
					index: idx,
				  });
				  
				  if (prop.maxProperty) {
					const maxPropName = `${prop.maxProperty}${idx}${suffix}`;
					const maxValue = allValues.get(maxPropName);
					if (maxValue) {
					  groupValues.push({
						name: maxPropName,
						value: maxValue,
						index: idx,
					  });
					}
				  }
				}
			  }
			} else {
            // Regular property
            const value = allValues.get(prop.rdoName);
            if (value) {
              groupValues.push({
                name: prop.rdoName,
                value: value,
              });

              // Also get max property if defined
              if (prop.maxProperty) {
                const maxValue = allValues.get(prop.maxProperty);
                if (maxValue) {
                  groupValues.push({
                    name: prop.maxProperty,
                    value: maxValue,
                  });
                }
              }
            }
          }
        }

        if (groupValues.length > 0) {
          groups[group.id] = groupValues;
        }
      }

      // Parse money graph if available
      let moneyGraph: number[] | undefined;
      const moneyGraphInfo = allValues.get('MoneyGraphInfo');
      if (moneyGraphInfo) {
        moneyGraph = this.parseMoneyGraph(moneyGraphInfo);
      }

      // Fetch supply data if this template has supplies group
      let supplies: BuildingSupplyData[] | undefined;
      const suppliesGroup = template.groups.find(g => g.special === 'supplies');
      if (suppliesGroup) {
        supplies = await this.fetchBuildingSupplies(tempObjectId, x, y);
      }

      const response: BuildingDetailsResponse = {
        buildingId: buildingId || allValues.get('ObjectId') || allValues.get('CurrBlock') || '',
        x,
        y,
        visualClass,
        templateName: template.name,
        buildingName,
        ownerName,
        securityId: allValues.get('SecurityId') || '',
        groups,
        supplies,
        moneyGraph,
        timestamp: Date.now(),
      };

      return response;

    } finally {
      // Clean up temporary object
      await this.cacherCloseObject(tempObjectId);
    }
  }

  /**
   * Parse MoneyGraphInfo into array of numbers
   * Format: "count,val1,val2,val3,..."
   */
  private parseMoneyGraph(graphInfo: string): number[] {
    const parts = graphInfo.split(',');
    if (parts.length < 2) return [];

    const values: number[] = [];
    // Skip first value (count), parse rest as numbers
    for (let i = 1; i < parts.length; i++) {
      const num = parseFloat(parts[i]);
      if (!isNaN(num)) {
        values.push(num);
      }
    }

    return values;
  }

  /**
   * Fetch supply/input data with connections for a building
   * Uses GetInputNames and SetPath to navigate supply structure
   */
  private async fetchBuildingSupplies(
    tempObjectId: string,
    _x: number,
    _y: number
  ): Promise<BuildingSupplyData[]> {
    const supplies: BuildingSupplyData[] = [];

    try {
      // Get input names
      const inputNamesPacket = await this.sendRdoRequest('map', {
        verb: RdoVerb.SEL,
        targetId: tempObjectId,
        action: RdoAction.CALL,
        member: 'GetInputNames',
        args: ['0', '0'], // index=0, language=0 (English)
      });

      const inputNamesRaw = this.cleanPayload(inputNamesPacket.payload || '');
      if (!inputNamesRaw || inputNamesRaw === '0' || inputNamesRaw === '-1') {
        return supplies;
      }

      // Parse input names (format: "path:..name\r" separated entries)
      const entries = inputNamesRaw.split('\r').filter(e => e.trim());

      for (const entry of entries) {
        const colonIdx = entry.indexOf(':');
        if (colonIdx === -1) continue;

        const path = entry.substring(0, colonIdx);
        // Skip 2 chars after colon, then read name until null
        let name = entry.substring(colonIdx + 3);
        const nullIdx = name.indexOf('\0');
        if (nullIdx !== -1) {
          name = name.substring(0, nullIdx);
        }

        // Create new temp object for this supply path
        const supplyTempId = await this.cacherCreateObject();

        try {
          // Navigate to supply path
          const setPathPacket = await this.sendRdoRequest('map', {
            verb: RdoVerb.SEL,
            targetId: supplyTempId,
            action: RdoAction.CALL,
            member: 'SetPath',
            args: [path],
          });

          const setPathResult = this.cleanPayload(setPathPacket.payload || '');
          if (setPathResult === '-1' || setPathResult === '0') {
            // Successfully navigated, now get properties
            const supplyProps = await this.cacherGetPropertyList(supplyTempId, [
              'MetaFluid', 'FluidValue', 'LastCostPerc', 'minK', 'MaxPrice',
              'QPSorted', 'SortMode', 'cnxCount', 'ObjectId'
            ]);

            const connectionCount = parseInt(supplyProps[7] || '0', 10);
            const connections: BuildingConnectionData[] = [];

            // Fetch connection details
            for (let i = 0; i < connectionCount && i < 20; i++) {
              const cnxProps = await this.fetchSubObjectProperties(supplyTempId, i, [
                `cnxFacilityName${i}`,
                `cnxCreatedBy${i}`,
                `cnxCompanyName${i}`,
                `cnxNfPrice${i}`,
                `OverPriceCnxInfo${i}`,
                `LastValueCnxInfo${i}`,
                `tCostCnxInfo${i}`,
                `cnxQuality${i}`,
                `ConnectedCnxInfo${i}`,
                `cnxXPos${i}`,
                `cnxYPos${i}`,
              ]);

              if (cnxProps.length >= 11) {
                connections.push({
                  facilityName: cnxProps[0] || '',
                  createdBy: cnxProps[1] || '',
                  companyName: cnxProps[2] || '',
                  price: cnxProps[3] || '0',
                  overprice: cnxProps[4] || '0',
                  lastValue: cnxProps[5] || '',
                  cost: cnxProps[6] || '$0',
                  quality: cnxProps[7] || '0%',
                  connected: cnxProps[8] === '1',
                  x: parseInt(cnxProps[9] || '0', 10),
                  y: parseInt(cnxProps[10] || '0', 10),
                });
              }
            }

            supplies.push({
              path,
              name,
              metaFluid: supplyProps[0] || '',
              fluidValue: supplyProps[1] || '',
              connectionCount,
              connections,
            });
          }
        } finally {
          await this.cacherCloseObject(supplyTempId);
        }
      }
    } catch (e) {
      console.warn('[BuildingDetails] Error fetching supplies:', e);
    }

    return supplies;
  }

  /**WorldName: this.currentWorldInfo.name,
   * Fetch sub-object properties (for indexed connections)
   */
  private async fetchSubObjectProperties(
    tempObjectId: string,
    subIndex: number,
    propertyNames: string[]
  ): Promise<string[]> {
    try {
      const query = propertyNames.join('\t') + '\t';
      const packet = await this.sendRdoRequest('map', {
        verb: RdoVerb.SEL,
        targetId: tempObjectId,
        action: RdoAction.CALL,
        member: 'GetSubObjectProps',
        args: [subIndex.toString(), query],
      });

      const raw = this.cleanPayload(packet.payload || '');
      if (raw.includes('\t')) {
        return raw.split('\t').map(v => v.trim());
      }
      return raw.split(/\s+/).map(v => v.trim()).filter(v => v.length > 0);
    } catch (e) {
      console.warn(`[BuildingDetails] Error fetching sub-object ${subIndex}:`, e);
      return [];
    }
  }

  /**
   * Set a building property value
   * Used for editable properties like salaries, prices, input demands, etc.
   *
   * RDO Command Formats:
   * - RDOSetPrice: 2 args -> index of srvPrices (e.g., #0), new value
   * - RDOSetSalaries: 3 args -> Salaries0 value, Salaries1 value, Salaries2 value
   * - RDOSetCompanyInputDemand: 2 args -> index of cInput, new ratio (cInputDem * 100 / cInputMax) without %
   * - RDOSetInputMaxPrice: 2 args -> MetaFluid value, new MaxPrice value
   * - RDOSetInputMinK: 2 args -> MetaFluid value, new minK value
   *
   * Note: CurrBlock is the building's block ID, NOT the worldId
   */
  public async setBuildingProperty(
    x: number,
    y: number,
    propertyName: string,
    value: string,
    additionalParams?: Record<string, string>
  ): Promise<{ success: boolean; newValue: string }> {
    console.log(`[BuildingDetails] Setting ${propertyName}=${value} at (${x}, ${y})`);

    try {
      // Connect to construction service (establishes worldId and RDOLogonClient)
      await this.connectConstructionService();
      if (!this.worldId) {
        throw new Error('Construction service not initialized - worldId is null');
      }

      // Get the building's CurrBlock ID via map service
      await this.connectMapService();
      const tempObjectId = await this.cacherCreateObject();
      let currBlock: string;

      try {
        await this.cacherSetObject(tempObjectId, x, y);
        const values = await this.cacherGetPropertyList(tempObjectId, ['CurrBlock']);
        currBlock = values[0];

        if (!currBlock) {
          throw new Error(`No CurrBlock found for building at (${x}, ${y})`);
        }

        console.log(`[BuildingDetails] Found CurrBlock: ${currBlock} for building at (${x}, ${y})`);
      } finally {
        await this.cacherCloseObject(tempObjectId);
      }

      // Get the construction socket
      const socket = this.sockets.get('construction');
      if (!socket) {
        throw new Error('Construction socket unavailable');
      }

      // Build the RDO command arguments based on the command type
      const rdoArgs = this.buildRdoCommandArgs(propertyName, value, additionalParams);

      // Send SetProperty command via construction service
      // The sel on CurrBlock is persistent (no closure needed)
      const setCmd = `C sel ${currBlock} call ${propertyName} "*" ${rdoArgs};`;
      socket.write(setCmd);
      console.log(`[BuildingDetails] Sent: ${setCmd}`);

      // Wait for server to process the command
      await new Promise(resolve => setTimeout(resolve, 200));

      // Read back the new value via map service to confirm the change
      const verifyObjectId = await this.cacherCreateObject();
      try {
        await this.cacherSetObject(verifyObjectId, x, y);

        // Extract property name from RDO command for verification
        const propertyToRead = this.mapRdoCommandToPropertyName(propertyName, additionalParams);
        const readValues = await this.cacherGetPropertyList(verifyObjectId, [propertyToRead]);
        const newValue = readValues[0] || value;

        console.log(`[BuildingDetails] Property ${propertyName} updated successfully to ${newValue}`);
        return { success: true, newValue };
      } finally {
        await this.cacherCloseObject(verifyObjectId);
      }

    } catch (e) {
      console.error(`[BuildingDetails] Failed to set property:`, e);
      return { success: false, newValue: '' };
    }
  }

  /**
   * Build RDO command arguments based on command type
   * Uses RdoValue for type-safe argument formatting
   *
   * Examples:
   * - RDOSetPrice(index=0, value=220) -> "#0","#220"
   * - RDOSetSalaries(sal0=100, sal1=120, sal2=150) -> "#100","#120","#150"
   * - RDOSetCompanyInputDemand(index=0, ratio=75) -> "#0","#75"
   * - RDOSetInputMaxPrice(metaFluid=5, maxPrice=500) -> "#5","#500"
   * - RDOSetInputMinK(metaFluid=5, minK=10) -> "#5","#10"
   */
  private buildRdoCommandArgs(
    rdoCommand: string,
    value: string,
    additionalParams?: Record<string, string>
  ): string {
    const params = additionalParams || {};
    const args: RdoValue[] = [];

    switch (rdoCommand) {
      case 'RDOSetPrice': {
        // Args: index of srvPrices (e.g., #0), new value
        const index = parseInt(params.index || '0', 10);
        const price = parseInt(value, 10);
        args.push(RdoValue.int(index), RdoValue.int(price));
        break;
      }

      case 'RDOSetSalaries': {
        // Args: Salaries0, Salaries1, Salaries2 (all 3 values required)
        const sal0 = parseInt(params.salary0 || value, 10);
        const sal1 = parseInt(params.salary1 || value, 10);
        const sal2 = parseInt(params.salary2 || value, 10);
        args.push(RdoValue.int(sal0), RdoValue.int(sal1), RdoValue.int(sal2));
        break;
      }

      case 'RDOSetCompanyInputDemand': {
        // Args: index of cInput, new ratio (cInputDem * 100 / cInputMax) without %
        const index = parseInt(params.index || '0', 10);
        const ratio = parseInt(value, 10);
        args.push(RdoValue.int(index), RdoValue.int(ratio));
        break;
      }

      case 'RDOSetInputMaxPrice': {
        // Args: MetaFluid value, new MaxPrice value
        const metaFluid = params.metaFluid;
        if (!metaFluid) {
          throw new Error('RDOSetInputMaxPrice requires metaFluid parameter');
        }
        args.push(RdoValue.int(parseInt(metaFluid, 10)), RdoValue.int(parseInt(value, 10)));
        break;
      }

      case 'RDOSetInputMinK': {
        // Args: MetaFluid value, new minK value
        const metaFluid = params.metaFluid;
        if (!metaFluid) {
          throw new Error('RDOSetInputMinK requires metaFluid parameter');
        }
        args.push(RdoValue.int(parseInt(metaFluid, 10)), RdoValue.int(parseInt(value, 10)));
        break;
      }

      default:
        // Fallback: single value parameter
        args.push(RdoValue.int(parseInt(value, 10)));
        break;
    }

    // Format all arguments and join with commas
    return args.map(arg => arg.format()).join(',');
  }

  /**
   * Map RDO command name to property name for reading back values
   *
   * Examples:
   * - RDOSetPrice(index=0) -> "srvPrices0"
   * - RDOSetSalaries(salary0=100, salary1=120, salary2=150) -> "Salaries0" (returns first salary for verification)
   * - RDOSetInputMaxPrice(metaFluid=5) -> "MaxPrice" (needs sub-object access)
   */
  private mapRdoCommandToPropertyName(
    rdoCommand: string,
    additionalParams?: Record<string, string>
  ): string {
    const params = additionalParams || {};

    switch (rdoCommand) {
      case 'RDOSetPrice': {
        const index = params.index || '0';
        return `srvPrices${index}`;
      }

      case 'RDOSetSalaries':
        // Return first salary for verification (all 3 are updated together)
        return 'Salaries0';

      case 'RDOSetCompanyInputDemand': {
        const index = params.index || '0';
        return `cInputDem${index}`;
      }

      case 'RDOSetInputMaxPrice':
        return 'MaxPrice';

      case 'RDOSetInputMinK':
        return 'minK';

      default:
        // Fallback: try to infer from command name
        return rdoCommand.replace('RDOSet', 'srv');
    }
  }


}
