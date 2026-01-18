import {
  WsMessageType,
  WsMessage,
  WsReqConnectDirectory,
  WsReqLoginWorld,
  WsRespConnectSuccess,
  WsRespLoginSuccess,
  WsRespError,
  WsEventChatMsg,
  WsRespMapData,
  WsReqMapLoad,
  WsReqSelectCompany,
  CompanyInfo,
  WsReqChatGetUsers,
  WsReqChatGetChannels,
  WsReqChatJoinChannel,
  WsReqChatSendMessage,
  WsReqChatTypingStatus,
  WsRespChatUserList,
  WsRespChatChannelList,
  WsEventChatUserTyping,
  WsEventChatChannelChange,
  WsEventChatUserListChange,
  WsReqBuildingFocus,
  WsReqBuildingUnfocus,
  WsRespBuildingFocus,
  WsEventBuildingRefresh,
  BuildingFocusInfo,
  WsEventTycoonUpdate,
  WsReqGetBuildingCategories,
  WsReqGetBuildingFacilities,
  WsReqPlaceBuilding,
  WsReqGetSurface,
  WsRespBuildingCategories,
  WsRespBuildingFacilities,
  WsRespSurfaceData,
  BuildingCategory,
  BuildingInfo,
  SurfaceType,
  WsReqGetFacilityDimensions,
  WsRespFacilityDimensions,
  FacilityDimensions,
  // Building Details
  WsReqBuildingDetails,
  WsRespBuildingDetails,
  WsReqBuildingSetProperty,
  WsRespBuildingSetProperty,
  BuildingDetailsResponse,
  // Building Upgrades
  WsReqBuildingUpgrade,
  WsRespBuildingUpgrade,
} from '../shared/types';
import { getErrorMessage } from '../shared/error-codes';
import { UIManager } from './ui/ui-manager';

export class StarpeaceClient {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private pendingRequests = new Map<string, { resolve: (msg: WsMessage) => void, reject: (err: any) => void }>();

  // UI Manager
  private ui: UIManager;

  // UI Elements (kept for status only)
  private uiGamePanel: HTMLElement;
  private uiStatus: HTMLElement;

  // Session state
  private storedUsername = '';
  private storedPassword = '';
  private availableCompanies: CompanyInfo[] = [];
  private currentCompanyName: string = '';

  // Building focus state
  private currentFocusedBuilding: BuildingFocusInfo | null = null;
  private currentFocusedVisualClass: string | null = null;

  // Building construction state
  private buildingCategories: BuildingCategory[] = [];
  private currentBuildingToPlace: BuildingInfo | null = null;

  // Double-click prevention flags
  private isFocusingBuilding: boolean = false;
  private isSendingChatMessage: boolean = false;
  private isJoiningChannel: boolean = false;
  private isSelectingCompany: boolean = false;

  constructor() {
    this.uiGamePanel = document.getElementById('game-panel')!;
    this.uiStatus = document.getElementById('status-indicator')!;

    this.ui = new UIManager();
    this.setupUICallbacks();
    this.init();
  }

  /**
   * Configure les callbacks des composants UI
   */
  private setupUICallbacks() {
    // LoginUI callbacks
    this.ui.loginUI.setOnDirectoryConnect((username, password, zonePath) => {
      this.performDirectoryLogin(username, password, zonePath);
    });

    this.ui.loginUI.setOnWorldSelect((worldName) => {
      this.login(worldName);
    });

    this.ui.loginUI.setOnCompanySelect((companyId) => {
      this.selectCompanyAndStart(companyId);
    });
  }

  /**
   * Configure les callbacks des composants Game UI
   */
  private setupGameUICallbacks() {
    // ChatUI callbacks
    if (this.ui.chatUI) {
      this.ui.chatUI.setOnSendMessage((message) => {
        this.sendChatMessage(message);
      });

      this.ui.chatUI.setOnJoinChannel((channel) => {
        this.joinChannel(channel);
      });

      this.ui.chatUI.setOnGetUsers(() => {
        this.requestUserList();
      });

      this.ui.chatUI.setOnGetChannels(() => {
        this.requestChannelList();
      });

      this.ui.chatUI.setOnTypingStatus((isTyping) => {
        this.sendTypingStatus(isTyping);
      });
    }

    // MapNavigationUI callbacks
    if (this.ui.mapNavigationUI) {
      this.ui.mapNavigationUI.setOnLoadZone((x, y, w, h) => {
        this.ui.log('Map', `Requesting zone (${x}, ${y}) ${w}x${h}`);
        this.loadMapArea(x, y);
      });

      this.ui.mapNavigationUI.setOnBuildingClick((x, y, visualClass) => {
        this.handleMapClick(x, y, visualClass);
      });

      this.ui.mapNavigationUI.setOnFetchFacilityDimensions(async (visualClass) => {
        return await this.getFacilityDimensions(visualClass);
      });
    }

    // ToolbarUI callbacks (unimplemented features)
    if (this.ui.toolbarUI) {
      this.ui.toolbarUI.setOnBuildMenu(() => {
        this.openBuildMenu();
      });

      this.ui.toolbarUI.setOnSearch(() => {
        this.ui.log('Info', 'Search feature not yet implemented');
      });

      this.ui.toolbarUI.setOnCompanyMenu(() => {
        this.ui.log('Info', 'Company menu not yet implemented');
      });

      this.ui.toolbarUI.setOnMail(() => {
        this.ui.log('Info', 'Mail feature not yet implemented');
      });
    }

    // BuildMenuUI callbacks
    if (this.ui.buildMenuUI) {
      this.ui.buildMenuUI.setOnCategorySelected((category) => {
        this.loadBuildingFacilities(category);
      });

      this.ui.buildMenuUI.setOnBuildingSelected((building) => {
        this.startBuildingPlacement(building);
      });

      this.ui.buildMenuUI.setOnClose(() => {
        this.cancelBuildingPlacement();
      });
    }

    // ZoneOverlayUI callbacks
    if (this.ui.zoneOverlayUI) {
      this.ui.zoneOverlayUI.setOnToggle((enabled, type) => {
        this.toggleZoneOverlay(enabled, type);
      });
    }
  }

  private init() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    this.ui.log('System', `Connecting to Gateway at ${url}...`);

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.uiStatus.textContent = "● Online";
      this.uiStatus.style.color = "#0f0";
      this.ui.log('System', 'Gateway Connected.');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.uiStatus.textContent = "● Offline";
      this.uiStatus.style.color = "#f00";
      this.ui.log('System', 'Gateway Disconnected.');
    };
  }

  private sendRequest(msg: Partial<WsMessage>): Promise<WsMessage> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.isConnected) return reject(new Error('WebSocket not connected'));

      const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      msg.wsRequestId = requestId;
      this.pendingRequests.set(requestId, { resolve, reject });
      this.ws.send(JSON.stringify(msg));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request Timeout'));
        }
      }, 15000);
    });
  }

  private handleMessage(msg: WsMessage) {
    // 1. Pending Requests
    if (msg.wsRequestId && this.pendingRequests.has(msg.wsRequestId)) {
      const { resolve, reject } = this.pendingRequests.get(msg.wsRequestId)!;
      this.pendingRequests.delete(msg.wsRequestId);
      if (msg.type === WsMessageType.RESP_ERROR) {
        const errorResp = msg as WsRespError;
        const localizedMessage = getErrorMessage(errorResp.code);
        reject(new Error(localizedMessage));
      } else {
        resolve(msg);
      }
      return;
    }

    // 2. Events & Pushes
    switch (msg.type) {
      case WsMessageType.EVENT_CHAT_MSG:
        const chat = msg as WsEventChatMsg;
        const isSystem = chat.from === 'SYSTEM';
        this.ui.renderChatMessage(chat.from, chat.message, isSystem);
        this.ui.log('Chat', `[${chat.channel}] ${chat.from}: ${chat.message}`);
        break;

      case WsMessageType.EVENT_CHAT_USER_TYPING:
        const typing = msg as WsEventChatUserTyping;
        if (this.ui.chatUI) {
          this.ui.chatUI.updateUserTypingStatus(typing.username, typing.isTyping);
        }
        break;

      case WsMessageType.EVENT_CHAT_CHANNEL_CHANGE:
        const channelChange = msg as WsEventChatChannelChange;
        if (this.ui.chatUI) {
          this.ui.chatUI.setCurrentChannel(channelChange.channelName);
        }
        this.requestUserList();
        break;

      case WsMessageType.EVENT_CHAT_USER_LIST_CHANGE:
        const userChange = msg as WsEventChatUserListChange;
        // User list will be refreshed on next request
        break;

      case WsMessageType.EVENT_MAP_DATA:
      case WsMessageType.RESP_MAP_DATA:
        const mapMsg = msg as WsRespMapData;
        this.ui.log('Map', `Received area (${mapMsg.data.x}, ${mapMsg.data.y}): ${mapMsg.data.buildings.length} buildings, ${mapMsg.data.segments.length} segments`);
        this.ui.updateMapData(mapMsg.data);
        break;

      case WsMessageType.EVENT_BUILDING_REFRESH:
        const refreshEvent = msg as WsEventBuildingRefresh;

        if (this.currentFocusedBuilding &&
            this.currentFocusedBuilding.buildingId === refreshEvent.building.buildingId) {
          this.currentFocusedBuilding = refreshEvent.building;
          // Re-request details with stored visualClass
          const refreshX = refreshEvent.building.x;
          const refreshY = refreshEvent.building.y;
          const refreshVisualClass = this.currentFocusedVisualClass || '0';
          this.requestBuildingDetails(refreshX, refreshY, refreshVisualClass).then(details => {
            if (details) {
              this.ui.updateBuildingDetailsPanel(details);
            }
          });
        }
        break;

        case WsMessageType.EVENT_TYCOON_UPDATE:
          const tycoonUpdate = msg as WsEventTycoonUpdate;
          this.currentTycoonData = {
            cash: tycoonUpdate.cash,
            incomePerHour: tycoonUpdate.incomePerHour,
            ranking: tycoonUpdate.ranking,
            buildingCount: tycoonUpdate.buildingCount,
            maxBuildings: tycoonUpdate.maxBuildings
          };
          this.ui.log('Tycoon', `Cash: ${tycoonUpdate.cash} | Income/h: ${tycoonUpdate.incomePerHour} | Rank: ${tycoonUpdate.ranking} | Buildings: ${tycoonUpdate.buildingCount}/${tycoonUpdate.maxBuildings}`);
          
          // --- UPDATE: Update the UI ---
          this.ui.updateTycoonStats({
            username: this.storedUsername,
            ...this.currentTycoonData
          });
        break;

      case WsMessageType.EVENT_RDO_PUSH:
        const pushData = (msg as any).rawPacket || msg;
        this.ui.log('Push', `Received: ${JSON.stringify(pushData).substring(0, 100)}...`);
        break;
    }
  }

  // --- Actions ---

  private async performDirectoryLogin(username: string, password: string, zonePath?: string) {
    this.storedUsername = username;
    this.storedPassword = password;
    const zoneDisplay = zonePath?.split('/').pop() || 'BETA';
    this.ui.log('Directory', `Authenticating for ${zoneDisplay}...`);

    try {
      const req: WsReqConnectDirectory = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        username,
        password,
        zonePath
      };

      const resp = (await this.sendRequest(req)) as WsRespConnectSuccess;
      this.ui.log('Directory', `Authentication Success. Found ${resp.worlds.length} world(s) in ${zoneDisplay}.`);
      this.ui.loginUI.renderWorldList(resp.worlds);
      this.ui.loginUI.hideConnectButton();
    } catch (err: any) {
      this.ui.log('Error', `Directory Auth Failed: ${err.message}`);
      alert('Login Failed: ' + err.message);
    }
  }

  private async login(worldName: string) {
    if (!this.storedUsername || !this.storedPassword) {
      alert('Session lost, please reconnect');
      return;
    }

    this.ui.log('Login', `Joining world ${worldName}...`);
    this.ui.loginUI.showWorldListLoading(`Connecting to ${worldName}...`);

    try {
      const req: WsReqLoginWorld = {
        type: WsMessageType.REQ_LOGIN_WORLD,
        username: this.storedUsername,
        password: this.storedPassword,
        worldName
      };
      const resp = (await this.sendRequest(req)) as WsRespLoginSuccess;
      this.ui.log('Login', `Success! Tycoon: ${resp.tycoonId}`);

      if (resp.companies && resp.companies.length > 0) {
        this.availableCompanies = resp.companies;
        this.ui.log('Login', `Found ${resp.companies.length} compan${resp.companies.length > 1 ? 'ies' : 'y'}`);
        this.ui.loginUI.showCompanyListLoading('Loading companies...');

        // Small delay for loading state visibility
        setTimeout(() => {
          this.ui.loginUI.renderCompanySelection(resp.companies || []);
        }, 300);
      } else {
        this.ui.log('Error', 'No companies found - cannot proceed');
        this.showNotification('No companies available for this account', 'error');
      }

    } catch (err: any) {
      this.ui.log('Error', `Login failed: ${err.message}`);
      this.ui.loginUI.showWorldListLoading('Connection failed. Please try again.');
      this.showNotification(`World login failed: ${err.message}`, 'error');
    }
  }

  private async selectCompanyAndStart(companyId: string) {
    // Double-click prevention
    if (this.isSelectingCompany) {
      return;
    }

    this.isSelectingCompany = true;
    this.ui.log('Company', `Selecting company ID: ${companyId}...`);
    this.ui.loginUI.showCompanyListLoading('Loading world...');

    try {
      const req: WsReqSelectCompany = {
        type: WsMessageType.REQ_SELECT_COMPANY,
        companyId
      };

      await this.sendRequest(req);

      // Store company name for building construction
      const company = this.availableCompanies.find(c => c.id === companyId);
      if (company) {
        this.currentCompanyName = company.name;
      }

      this.ui.log('Company', 'Company selected successfully');

      // Switch to game view
      this.switchToGameView();

      // Load initial map area
      this.loadMapArea();
    } catch (err: any) {
      this.ui.log('Error', `Company selection failed: ${err.message}`);
      this.ui.loginUI.showCompanyListLoading('Failed to load world. Please try again.');
      this.showNotification(`Company selection failed: ${err.message}`, 'error');
    } finally {
      this.isSelectingCompany = false;
    }
  }

  private loadMapArea(x?: number, y?: number) {
    const coords = x !== undefined && y !== undefined ? ` at (${x}, ${y})` : ' at player position';
    this.ui.log('Map', `Loading area${coords}...`);

    // FIX: Use provided coordinates or 0,0 (server will use player position)
    const req: WsReqMapLoad = {
      type: WsMessageType.REQ_MAP_LOAD,
      x: x !== undefined ? x : 0,
      y: y !== undefined ? y : 0,
      width: 64,
      height: 64
    };

    // NOTE: Uses send() without awaiting response because response arrives via EVENT_MAP_DATA
    this.ws?.send(JSON.stringify(req));
  }

  private switchToGameView() {
    this.ui.loginUI.hide();
    this.uiGamePanel.style.display = 'flex';
    this.uiGamePanel.style.flexDirection = 'column';

    // Initialize Game UI
    this.ui.initGameUI(this.uiGamePanel);
    this.setupGameUICallbacks();
    this.ui.initTycoonStats(this.storedUsername);
    
    this.ui.log('Renderer', 'Game view initialized');
  }

  // --- Chat Functions ---

  private async sendChatMessage(message: string) {
    // Double-click prevention
    if (this.isSendingChatMessage) {
      console.log('[Client] Chat message already sending, ignoring');
      return;
    }

    this.isSendingChatMessage = true;

    try {
      const req: WsReqChatSendMessage = {
        type: WsMessageType.REQ_CHAT_SEND_MESSAGE,
        message
      };
      await this.sendRequest(req);
    } catch (err: any) {
      this.ui.log('Error', `Failed to send message: ${err.message}`);
    } finally {
      this.isSendingChatMessage = false;
    }
  }

  private sendTypingStatus(isTyping: boolean) {
    const req: WsReqChatTypingStatus = {
      type: WsMessageType.REQ_CHAT_TYPING_STATUS,
      isTyping
    };
    this.ws?.send(JSON.stringify(req));
  }

  private async requestUserList() {
    try {
      const req: WsReqChatGetUsers = {
        type: WsMessageType.REQ_CHAT_GET_USERS
      };
      const resp = (await this.sendRequest(req)) as WsRespChatUserList;

      if (this.ui.chatUI) {
        this.ui.chatUI.updateUserList(resp.users);
      }
    } catch (err: any) {
      this.ui.log('Error', `Failed to get user list: ${err.message}`);
    }
  }

  private async requestChannelList() {
    try {
      const req: WsReqChatGetChannels = {
        type: WsMessageType.REQ_CHAT_GET_CHANNELS
      };
      const resp = (await this.sendRequest(req)) as WsRespChatChannelList;

      if (this.ui.chatUI) {
        this.ui.chatUI.updateChannelList(resp.channels);
      }
    } catch (err: any) {
      this.ui.log('Error', `Failed to get channel list: ${err.message}`);
    }
  }

  private async joinChannel(channelName: string) {
    // Double-click prevention
    if (this.isJoiningChannel) {
      return;
    }

    this.isJoiningChannel = true;

    try {
      this.ui.log('Chat', `Joining channel: ${channelName || 'Lobby'}`);
      const req: WsReqChatJoinChannel = {
        type: WsMessageType.REQ_CHAT_JOIN_CHANNEL,
        channelName
      };
      await this.sendRequest(req);

      if (this.ui.chatUI) {
        this.ui.chatUI.clearMessages();
        this.ui.chatUI.hideChannelList();
      }
    } catch (err: any) {
      this.ui.log('Error', `Failed to join channel: ${err.message}`);
    } finally {
      this.isJoiningChannel = false;
    }
  }

  // --- Building Focus Functions ---

  /**
   * Handle map clicks - delegates to placement or focus based on mode
   */
  private handleMapClick(x: number, y: number, visualClass?: string) {
    if (this.currentBuildingToPlace) {
      this.placeBuilding(x, y);
    } else {
      this.focusBuilding(x, y, visualClass);
    }
  }

  private async focusBuilding(x: number, y: number, visualClass?: string) {
    // Double-click prevention
    if (this.isFocusingBuilding) {
      return;
    }

    this.isFocusingBuilding = true;
    this.ui.log('Building', `Requesting focus at (${x}, ${y})`);

    try {
      // Auto-unfocus previous building
      if (this.currentFocusedBuilding) {
        await this.unfocusBuilding();
      }

      const req: WsReqBuildingFocus = {
        type: WsMessageType.REQ_BUILDING_FOCUS,
        x,
        y
      };

      const response = await this.sendRequest(req) as WsRespBuildingFocus;

      this.currentFocusedBuilding = response.building;
      this.currentFocusedVisualClass = visualClass || null;

      // Request detailed building info using visualClass from ObjectsInArea
      const details = await this.requestBuildingDetails(x, y, visualClass || '0');
      if (details) {
        // Show BuildingDetailsPanel with full details
        this.ui.showBuildingDetailsPanel(
          details,
          async (propertyName, value, additionalParams) => {
            await this.setBuildingProperty(x, y, propertyName, value, additionalParams);
          },
          undefined, // onNavigateToBuilding
          async (action, count) => {
            await this.upgradeBuildingAction(x, y, action, count);
          }
        );
      } else {
        // Fallback: create minimal details from BuildingFocusInfo
        const fallbackDetails: BuildingDetailsResponse = {
          buildingId: response.building.buildingId || '',
          x,
          y,
          visualClass: visualClass || '0',
          templateName: 'Building',
          securityId: '',
          groups: {
            generic: [
              { name: 'Name', value: response.building.buildingName },
              { name: 'Owner', value: response.building.ownerName },
              { name: 'Revenue', value: response.building.revenue },
            ]
          },
          timestamp: Date.now()
        };
        // Also provide callback for fallback case
        this.ui.showBuildingDetailsPanel(
          fallbackDetails,
          async (propertyName, value, additionalParams) => {
            await this.setBuildingProperty(x, y, propertyName, value, additionalParams);
          },
          undefined, // onNavigateToBuilding
          async (action, count) => {
            await this.upgradeBuildingAction(x, y, action, count);
          }
        );
      }

      this.ui.log('Building', `Focused: ${response.building.buildingName}`);

    } catch (err: any) {
      this.ui.log('Error', `Failed to focus building: ${err.message}`);
    } finally {
      this.isFocusingBuilding = false;
    }
  }

  private async unfocusBuilding() {
    if (!this.currentFocusedBuilding) return;

    this.ui.log('Building', 'Unfocusing building');

    try {
      const req: WsReqBuildingUnfocus = {
        type: WsMessageType.REQ_BUILDING_UNFOCUS
      };
      this.ws?.send(JSON.stringify(req));

      this.ui.hideBuildingDetailsPanel();
      this.currentFocusedBuilding = null;
      this.currentFocusedVisualClass = null;
    } catch (err: any) {
      this.ui.log('Error', `Failed to unfocus building: ${err.message}`);
    }
  }

  private currentTycoonData: {
    cash: string;
    incomePerHour: string;
    ranking: number;
    buildingCount: number;
    maxBuildings: number;
  } | null = null;

  // =========================================================================
  // BUILDING DETAILS METHODS
  // =========================================================================

  /**
   * Request detailed building information
   */
  public async requestBuildingDetails(
    x: number,
    y: number,
    visualClass: string
  ): Promise<BuildingDetailsResponse | null> {
    this.ui.log('Building', `Requesting details at (${x}, ${y})`);

    try {
      const req: WsReqBuildingDetails = {
        type: WsMessageType.REQ_BUILDING_DETAILS,
        x,
        y,
        visualClass
      };

      const response = await this.sendRequest(req) as WsRespBuildingDetails;
      this.ui.log('Building', `Got details: ${response.details.templateName}`);
      return response.details;
    } catch (err: any) {
      this.ui.log('Error', `Failed to get building details: ${err.message}`);
      return null;
    }
  }

  /**
   * Set a building property value for editable properties
   * propertyName is now the RDO command name (e.g., 'RDOSetPrice', 'RDOSetSalaries')
   */
  public async setBuildingProperty(
    x: number,
    y: number,
    propertyName: string,
    value: string,
    additionalParams?: Record<string, string>
  ): Promise<boolean> {
    this.ui.log('Building', `Setting ${propertyName}=${value} at (${x}, ${y})`);

    try {
      const req: WsReqBuildingSetProperty = {
        type: WsMessageType.REQ_BUILDING_SET_PROPERTY,
        x,
        y,
        propertyName, // This is now the RDO command name
        value,
        additionalParams
      };

      const response = await this.sendRequest(req) as WsRespBuildingSetProperty;

      if (response.success) {
        this.ui.log('Building', `Property ${propertyName} updated to ${response.newValue}`);
        return true;
      } else {
        this.ui.log('Error', `Failed to set ${propertyName}`);
        return false;
      }
    } catch (err: any) {
      this.ui.log('Error', `Failed to set property: ${err.message}`);
      return false;
    }
  }

  /**
   * Upgrade or downgrade a building
   */
  public async upgradeBuildingAction(
    x: number,
    y: number,
    action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE',
    count?: number
  ): Promise<boolean> {
    const actionName = action === 'DOWNGRADE' ? 'Downgrading' :
                       action === 'START_UPGRADE' ? `Starting ${count} upgrade(s)` :
                       'Stopping upgrade';
    this.ui.log('Building', `${actionName} at (${x}, ${y})`);

    try {
      const req: WsReqBuildingUpgrade = {
        type: WsMessageType.REQ_BUILDING_UPGRADE,
        x,
        y,
        action,
        count
      };

      const response = await this.sendRequest(req) as WsRespBuildingUpgrade;

      if (response.success) {
        this.ui.log('Building', response.message || 'Upgrade action completed');
        return true;
      } else {
        this.ui.log('Error', response.message || 'Failed to perform upgrade action');
        return false;
      }
    } catch (err: any) {
      this.ui.log('Error', `Failed to perform upgrade action: ${err.message}`);
      return false;
    }
  }

  // =========================================================================
  // BUILDING CONSTRUCTION METHODS
  // =========================================================================

  /**
   * Open the build menu and fetch building categories
   */
  private async openBuildMenu() {
    if (!this.currentCompanyName) {
      this.ui.log('Error', 'No company selected');
      return;
    }

    this.ui.log('Build', 'Opening build menu...');

    try {
      const req: WsReqGetBuildingCategories = {
        type: WsMessageType.REQ_GET_BUILDING_CATEGORIES,
        companyName: this.currentCompanyName
      };

      const response = await this.sendRequest(req) as WsRespBuildingCategories;
      this.buildingCategories = response.categories;

      if (this.ui.buildMenuUI) {
        this.ui.buildMenuUI.show(response.categories);
      }

      this.ui.log('Build', `Loaded ${response.categories.length} building categories`);
    } catch (err: any) {
      this.ui.log('Error', `Failed to load building categories: ${err.message}`);
    }
  }

  /**
   * Load facilities for a specific category
   */
  private async loadBuildingFacilities(category: BuildingCategory) {
    this.ui.log('Build', `Loading facilities for ${category.kindName}...`);

    try {
      const req: WsReqGetBuildingFacilities = {
        type: WsMessageType.REQ_GET_BUILDING_FACILITIES,
        companyName: this.currentCompanyName,
        cluster: category.cluster,
        kind: category.kind,
        kindName: category.kindName,
        folder: category.folder,
        tycoonLevel: category.tycoonLevel
      };

      const response = await this.sendRequest(req) as WsRespBuildingFacilities;

      if (this.ui.buildMenuUI) {
        this.ui.buildMenuUI.showFacilities(category, response.facilities);
      }

      this.ui.log('Build', `Loaded ${response.facilities.length} facilities`);
    } catch (err: any) {
      this.ui.log('Error', `Failed to load facilities: ${err.message}`);
    }
  }

  /**
   * Get facility dimensions from server
   */
  private async getFacilityDimensions(visualClass: string): Promise<FacilityDimensions | null> {
    try {
      const req: WsReqGetFacilityDimensions = {
        type: WsMessageType.REQ_GET_FACILITY_DIMENSIONS,
        visualClass
      };

      const response = await this.sendRequest(req) as WsRespFacilityDimensions;
      return response.dimensions;
    } catch (err: any) {
      console.error('[Client] Failed to get facility dimensions:', err);
      return null;
    }
  }

  /**
   * Start building placement mode
   */
  private async startBuildingPlacement(building: BuildingInfo) {
    this.currentBuildingToPlace = building;
    this.ui.log('Build', `Placing ${building.name}. Click on map to build.`);

    // Fetch facility dimensions using facilityClass (building name like "DissBar")
    let xsize = 1;
    let ysize = 1;
    try {
      const dimensions = await this.getFacilityDimensions(building.facilityClass);
      if (dimensions) {
        xsize = dimensions.xsize;
        ysize = dimensions.ysize;
      }
    } catch (err) {
      console.error('Failed to fetch facility dimensions:', err);
    }

    // Show placement help notification
    this.showNotification(`${building.name} placement mode - Click map to place, ESC to cancel`, 'info');

    // Enable placement mode in renderer
    const renderer = this.ui.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setPlacementMode(
        true,
        building.name,
        building.cost,
        building.area,
        building.zoneRequirement,
        xsize,
        ysize
      );
    }

    // Set cancel placement callback for right-click
    const cancelRenderer = this.ui.mapNavigationUI?.getRenderer();
    if (cancelRenderer) {
      cancelRenderer.setCancelPlacementCallback(() => {
        this.cancelBuildingPlacement();
      });
    }

    // Setup ESC key to cancel placement
    this.setupPlacementKeyboardHandler();
  }


  /**
   * Setup keyboard handler for placement mode
   */
  private setupPlacementKeyboardHandler() {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.currentBuildingToPlace) {
        this.cancelBuildingPlacement();
        document.removeEventListener('keydown', handler);
      }
    };
    document.addEventListener('keydown', handler);
  }

  /**
   * Place a building at coordinates
   */
  private async placeBuilding(x: number, y: number) {
    if (!this.currentBuildingToPlace) return;

    const building = this.currentBuildingToPlace;
    this.ui.log('Build', `Placing ${building.name} at (${x}, ${y})...`);

    try {
      const req: WsReqPlaceBuilding = {
        type: WsMessageType.REQ_PLACE_BUILDING,
        facilityClass: building.facilityClass,
        x,
        y
      };

      await this.sendRequest(req);

      // Show success message
      this.ui.log('Build', `✓ Successfully placed ${building.name}!`);
      this.showNotification(`${building.name} built successfully!`, 'success');

      // Reload the map area to show the new building
      this.loadMapArea(x, y);

      // Exit placement mode
      this.cancelBuildingPlacement();
    } catch (err: any) {
      // Show detailed error message
      const errorMsg = err.message || 'Unknown error';
      this.ui.log('Error', `✗ Failed to place ${building.name}: ${errorMsg}`);
      this.showNotification(`Failed to place building: ${errorMsg}`, 'error');

      // Don't exit placement mode on error - let user try again or cancel manually
    }
  }

  /**
   * Cancel building placement mode
   */
  private cancelBuildingPlacement() {
    this.currentBuildingToPlace = null;

    // Remove placement notification
    const notification = document.getElementById('placement-notification');
    if (notification) {
      notification.remove();
    }

    // Disable placement mode in renderer
    const renderer = this.ui.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setPlacementMode(false);
    }

    // No need to restore callback - handleMapClick already checks currentBuildingToPlace state
  }

  /**
   * Show a temporary notification to the user
   */
  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: ${type === 'success' ? '#4ade80' : type === 'error' ? '#ff6b6b' : '#4dabf7'};
      color: white;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      animation: slideDown 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideUp 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Toggle zone overlay
   */
  private async toggleZoneOverlay(enabled: boolean, type: SurfaceType) {
    this.ui.log('Zones', enabled ? `Enabling ${type} overlay` : 'Disabling overlay');

    const renderer = this.ui.mapNavigationUI?.getRenderer();
    if (!renderer) return;

    if (!enabled) {
      renderer.setZoneOverlay(false);
      return;
    }

    try {
      // Get current camera position to request zone data
      const cameraX = Math.floor(renderer['cameraX']);
      const cameraY = Math.floor(renderer['cameraY']);

      // Request 65x65 area centered on camera
      const x1 = cameraX - 32;
      const y1 = cameraY - 32;
      const x2 = cameraX + 32;
      const y2 = cameraY + 32;

      const req: WsReqGetSurface = {
        type: WsMessageType.REQ_GET_SURFACE,
        surfaceType: type,
        x1,
        y1,
        x2,
        y2
      };

      const response = await this.sendRequest(req) as WsRespSurfaceData;
      renderer.setZoneOverlay(true, response.data, x1, y1);

      this.ui.log('Zones', `Loaded ${type} overlay data`);
    } catch (err: any) {
      this.ui.log('Error', `Failed to load zone overlay: ${err.message}`);
      // Disable overlay on error
      renderer.setZoneOverlay(false);
      if (this.ui.zoneOverlayUI) {
        this.ui.zoneOverlayUI.setEnabled(false);
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new StarpeaceClient();
});
