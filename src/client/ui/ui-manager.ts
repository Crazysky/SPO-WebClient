/**
 * UIManager - Orchestration de tous les composants UI
 */

import { LoginUI } from './login-ui';
import { ChatUI } from './chat-ui';
import { MapNavigationUI } from './map-navigation-ui';
import { ToolbarUI } from './toolbar-ui';
import { TycoonStatsUI, TycoonStats } from './tycoon-stats-ui';
import { BuildMenuUI } from './build-menu-ui';
import { ZoneOverlayUI } from './zone-overlay-ui';
import { BuildingDetailsPanel } from './building-details';
import { SearchMenuPanel } from './search-menu';
import { BuildingDetailsResponse } from '../../shared/types';

export class UIManager {
  // UI Components
  public loginUI: LoginUI;
  public chatUI: ChatUI | null = null;
  public mapNavigationUI: MapNavigationUI | null = null;
  public toolbarUI: ToolbarUI | null = null;
  public tycoonStatsUI: TycoonStatsUI | null = null;
  public buildMenuUI: BuildMenuUI | null = null;
  public zoneOverlayUI: ZoneOverlayUI | null = null;
  public buildingDetailsPanel: BuildingDetailsPanel | null = null;
  public searchMenuPanel: SearchMenuPanel | null = null;

  // Console
  private uiConsole: HTMLElement;

  constructor() {
    this.uiConsole = document.getElementById('console-output')!;
    this.loginUI = new LoginUI();
  }

  /**
   * Initialise les composants de jeu (appelé après connexion réussie)
   */
  public initGameUI(gamePanel: HTMLElement, sendMessage?: (msg: any) => void) {
    // Map & Navigation
    this.mapNavigationUI = new MapNavigationUI(gamePanel);
    this.mapNavigationUI.init();

    // Chat (now a draggable modal)
    this.chatUI = new ChatUI();

    // Toolbar (now in header)
    this.toolbarUI = new ToolbarUI();
    this.toolbarUI.init();
    // Tycoon Stats (in header)
    this.tycoonStatsUI = new TycoonStatsUI();

    // Building Construction UI
    this.buildMenuUI = new BuildMenuUI();

    // Zone Overlay UI
    this.zoneOverlayUI = new ZoneOverlayUI();

    // Building Details Panel (new detailed panel)
    this.buildingDetailsPanel = new BuildingDetailsPanel(gamePanel, {
      onPropertyChange: undefined, // Will be set when showing the panel
      onClose: undefined,
      onNavigateToBuilding: undefined,
    });

    // Search Menu Panel
    if (sendMessage) {
      this.searchMenuPanel = new SearchMenuPanel(sendMessage);
    }
  }

  /**
   * Show the search menu
   */
  public showSearchMenu() {
    if (this.searchMenuPanel) {
      this.searchMenuPanel.show();
    }
  }

  /**
   * Affiche un message dans la console
   */
  public log(source: string, message: string) {
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] [${source}] ${message}`;
    this.uiConsole.appendChild(line);
    this.uiConsole.scrollTop = this.uiConsole.scrollHeight;
  }

  /**
   * Affiche un message de chat
   */
  public renderChatMessage(from: string, message: string, isSystem: boolean = false) {
    if (this.chatUI) {
      this.chatUI.renderMessage(from, message, isSystem);
    }
  }

  /**
   * Met à jour les données de la carte
   */
  public updateMapData(mapData: any) {
    if (this.mapNavigationUI) {
      const renderer = this.mapNavigationUI.getRenderer();
      if (renderer) {
        renderer.updateMapData(mapData);
      }
    }
  }


  public initTycoonStats(username: string) {
    if (this.tycoonStatsUI) {
      this.tycoonStatsUI.init(username);
  }
}

/**
 * Update tycoon financial stats
 */
  public updateTycoonStats(stats: TycoonStats) {
    if (this.tycoonStatsUI) {
      this.tycoonStatsUI.updateStats(stats);
    }
  }

  /**
   * Show the building details panel with full property data
   */
  public showBuildingDetailsPanel(
    details: BuildingDetailsResponse,
    onPropertyChange?: (propertyName: string, value: string, additionalParams?: Record<string, string>) => Promise<void>,
    onNavigateToBuilding?: (x: number, y: number) => void,
    onUpgradeAction?: (action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE', count?: number) => Promise<void>,
    onRefresh?: () => Promise<void>,
    onRename?: (newName: string) => Promise<void>,
    onDelete?: () => Promise<void>
  ) {
    if (this.buildingDetailsPanel) {
      // Update options with callbacks
      const options = (this.buildingDetailsPanel as any).options;
      options.onPropertyChange = onPropertyChange;
      options.onNavigateToBuilding = onNavigateToBuilding;
      options.onUpgradeAction = onUpgradeAction;
      options.onRefresh = onRefresh;
      options.onRename = onRename;
      options.onDelete = onDelete;
      this.buildingDetailsPanel.show(details);
    }
  }

  /**
   * Update the building details panel with new data
   */
  public updateBuildingDetailsPanel(details: BuildingDetailsResponse) {
    if (this.buildingDetailsPanel) {
      this.buildingDetailsPanel.update(details);
    }
  }

  /**
   * Hide the building details panel
   */
  public hideBuildingDetailsPanel() {
    if (this.buildingDetailsPanel) {
      this.buildingDetailsPanel.hide();
    }
  }

  /**
   * Check if building details panel is visible
   */
  public isBuildingDetailsPanelVisible(): boolean {
    return this.buildingDetailsPanel?.isVisible() ?? false;
  }

  // ===========================================================================
  // SEARCH MENU METHODS
  // ===========================================================================

  /**
   * Handle search menu responses and render appropriate page
   */
  public handleSearchMenuResponse(msg: any) {
    if (!this.searchMenuPanel) {
      console.error('[UIManager] searchMenuPanel is null!');
      return;
    }

    switch (msg.type) {
      case 'RESP_SEARCH_MENU_HOME':
        this.searchMenuPanel.renderHomePage(msg);
        break;
      case 'RESP_SEARCH_MENU_TOWNS':
        this.searchMenuPanel.renderTownsPage(msg);
        break;
      case 'RESP_SEARCH_MENU_TYCOON_PROFILE':
        this.searchMenuPanel.renderTycoonProfile(msg);
        break;
      case 'RESP_SEARCH_MENU_PEOPLE':
        // Just acknowledges the page is ready
        break;
      case 'RESP_SEARCH_MENU_PEOPLE_SEARCH':
        this.searchMenuPanel.renderPeopleSearchResults(msg);
        break;
      case 'RESP_SEARCH_MENU_RANKINGS':
        this.searchMenuPanel.renderRankingsPage(msg);
        break;
      case 'RESP_SEARCH_MENU_RANKING_DETAIL':
        this.searchMenuPanel.renderRankingDetail(msg);
        break;
      case 'RESP_SEARCH_MENU_BANKS':
        this.searchMenuPanel.renderBanksPage(msg);
        break;
    }
  }
}
