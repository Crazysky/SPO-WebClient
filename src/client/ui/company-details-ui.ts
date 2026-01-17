/**
 * CompanyDetailsUI - Modal de détails de bâtiment avec drag & drop et tabs
 * Refonte avec design glassmorphism moderne
 */

import { BuildingFocusInfo } from '../../shared/types';

export class CompanyDetailsUI {
  // DOM elements
  private modal: HTMLElement | null = null;
  private header: HTMLElement | null = null;
  private contentContainer: HTMLElement | null = null;
  private tabsContainer: HTMLElement | null = null;

  // State
  private currentBuilding: BuildingFocusInfo | null = null;
  private currentTab: 'overview' | 'details' | 'stats' = 'overview';
  private isDragging: boolean = false;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;

  // Position
  private posX: number = 0;
  private posY: number = 0;

  // Callbacks
  private onClose: (() => void) | null = null;

  constructor(private gamePanel: HTMLElement) {
    this.init();
  }

  /**
   * Définit le callback pour la fermeture du panel
   */
  public setOnClose(callback: () => void) {
    this.onClose = callback;
  }

  /**
   * Affiche les informations d'un bâtiment
   */
  public showBuilding(building: BuildingFocusInfo) {
    this.currentBuilding = building;

    // Initial position (centered)
    if (this.posX === 0 && this.posY === 0) {
      const rect = this.gamePanel.getBoundingClientRect();
      this.posX = (rect.width - 480) / 2;
      this.posY = 100;
    }

    this.updatePosition();
    this.renderContent();

    if (this.modal) {
      this.modal.style.display = 'flex';
      this.modal.style.animation = 'scaleIn 0.2s ease-out';
    }
  }

  /**
   * Cache le panel
   */
  public hide() {
    if (this.modal) {
      this.modal.style.animation = 'fadeOut 0.2s ease-out';
      setTimeout(() => {
        if (this.modal) {
          this.modal.style.display = 'none';
        }
      }, 200);
    }
  }

  /**
   * Initialise le modal
   */
  private init() {
    this.modal = document.createElement('div');
    this.modal.id = 'building-details-modal';
    this.modal.style.cssText = `
      position: absolute;
      width: 480px;
      max-height: 600px;
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-xl);
      display: none;
      flex-direction: column;
      font-family: var(--font-primary);
      box-shadow: var(--shadow-2xl);
      z-index: var(--z-modal);
    `;

    // Header avec drag handle
    this.header = this.createHeader();
    this.modal.appendChild(this.header);

    // Tabs
    this.tabsContainer = this.createTabs();
    this.modal.appendChild(this.tabsContainer);

    // Content container
    this.contentContainer = document.createElement('div');
    this.contentContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: var(--space-6);
      max-height: 450px;
    `;
    this.modal.appendChild(this.contentContainer);

    // Footer
    const footer = this.createFooter();
    this.modal.appendChild(footer);

    this.gamePanel.appendChild(this.modal);
  }

  /**
   * Crée le header avec drag handle
   */
  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = `
      padding: var(--space-4) var(--space-6);
      background: linear-gradient(135deg, var(--primary-blue-dark), var(--primary-blue));
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
      user-select: none;
    `;

    const titleContainer = document.createElement('div');
    titleContainer.style.cssText = 'flex: 1;';
    titleContainer.innerHTML = `
      <div style="display: flex; align-items: center; gap: var(--space-2); color: white;">
        <span style="font-size: 20px;">🏢</span>
        <div>
          <div style="font-weight: 600; font-size: var(--text-lg);" id="building-name">Building Name</div>
          <div style="font-size: var(--text-xs); opacity: 0.9;" id="building-owner">Owner: --</div>
        </div>
      </div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-icon';
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all var(--transition-base);
      font-size: 18px;
    `;
    closeBtn.onmouseenter = () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.3)';
    };
    closeBtn.onmouseleave = () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    };
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      if (this.onClose) this.onClose();
    };

    titleContainer.appendChild(closeBtn);
    header.appendChild(titleContainer);

    // Drag & drop handlers
    header.onmousedown = (e) => this.startDrag(e);

    return header;
  }

  /**
   * Crée les tabs
   */
  private createTabs(): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex;
      gap: var(--space-1);
      padding: var(--space-3) var(--space-6);
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid var(--glass-border);
    `;

    const tabs: Array<{ id: 'overview' | 'details' | 'stats', label: string, icon: string }> = [
      { id: 'overview', label: 'Overview', icon: '📊' },
      { id: 'details', label: 'Details', icon: '📋' },
      { id: 'stats', label: 'Statistics', icon: '📈' }
    ];

    tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.innerHTML = `${tab.icon} ${tab.label}`;
      btn.style.cssText = `
        padding: var(--space-2) var(--space-4);
        background: ${this.currentTab === tab.id ? 'var(--primary-blue)' : 'transparent'};
        color: ${this.currentTab === tab.id ? 'white' : 'var(--text-secondary)'};
        border: 1px solid ${this.currentTab === tab.id ? 'var(--primary-blue)' : 'transparent'};
        border-radius: var(--radius-md);
        font-size: var(--text-sm);
        font-weight: 600;
        cursor: pointer;
        transition: all var(--transition-base);
      `;

      btn.onmouseenter = () => {
        if (this.currentTab !== tab.id) {
          btn.style.background = 'rgba(51, 65, 85, 0.5)';
          btn.style.borderColor = 'var(--glass-border)';
        }
      };

      btn.onmouseleave = () => {
        if (this.currentTab !== tab.id) {
          btn.style.background = 'transparent';
          btn.style.borderColor = 'transparent';
        }
      };

      btn.onclick = () => {
        this.currentTab = tab.id;
        this.renderContent();
        this.updateTabs();
      };

      container.appendChild(btn);
    });

    return container;
  }

  /**
   * Crée le footer
   */
  private createFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: var(--space-3) var(--space-6);
      background: rgba(0, 0, 0, 0.3);
      border-top: 1px solid var(--glass-border);
      border-radius: 0 0 var(--radius-xl) var(--radius-xl);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: var(--text-xs);
      color: var(--text-muted);
    `;

    footer.innerHTML = `
      <div id="last-update">Last update: --:--:--</div>
      <div style="opacity: 0.5;">Drag to move</div>
    `;

    return footer;
  }

  /**
   * Rend le contenu en fonction du tab actif
   */
  private renderContent() {
    if (!this.contentContainer || !this.currentBuilding) return;

    // Update header info
    const nameEl = this.modal?.querySelector('#building-name');
    const ownerEl = this.modal?.querySelector('#building-owner');
    if (nameEl) nameEl.textContent = this.currentBuilding.buildingName;
    if (ownerEl) ownerEl.textContent = `Owner: ${this.currentBuilding.ownerName}`;

    // Update last update
    const lastUpdateEl = this.modal?.querySelector('#last-update');
    if (lastUpdateEl) {
      const now = new Date();
      lastUpdateEl.textContent = `Last update: ${now.toLocaleTimeString()}`;
    }

    // Render content based on active tab
    switch (this.currentTab) {
      case 'overview':
        this.renderOverview();
        break;
      case 'details':
        this.renderDetails();
        break;
      case 'stats':
        this.renderStats();
        break;
    }
  }

  /**
   * Rend l'onglet Overview
   */
  private renderOverview() {
    if (!this.contentContainer || !this.currentBuilding) return;

    const revenue = this.currentBuilding.revenue || 'N/A';
    const salesInfo = this.currentBuilding.salesInfo || 'No sales data';
    const owner = this.currentBuilding.ownerName || 'Unknown';
    const location = `(${this.currentBuilding.x}, ${this.currentBuilding.y})`;

    this.contentContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">

        <!-- Building Info -->
        <div class="card" style="background: var(--surface-elevated); padding: var(--space-4); border-radius: var(--radius-lg);">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
            <div>
              <div style="font-size: var(--text-xs); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-1);">
                Owner
              </div>
              <div style="font-size: var(--text-base); font-weight: 600; color: var(--text-primary);">
                ${this.escapeHtml(owner)}
              </div>
            </div>
            <div>
              <div style="font-size: var(--text-xs); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-1);">
                Location
              </div>
              <div style="font-size: var(--text-base); font-weight: 600; color: var(--info);">
                ${location}
              </div>
            </div>
          </div>
        </div>

        <!-- Revenue Card -->
        <div class="card" style="background: var(--surface-elevated); padding: var(--space-4); border-radius: var(--radius-lg);">
          <div style="font-size: var(--text-xs); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-2);">
            Revenue
          </div>
          <div style="font-size: var(--text-2xl); font-weight: 700; color: ${revenue.includes('-') ? 'var(--error)' : 'var(--success)'};">
            ${revenue}
          </div>
        </div>

        <!-- Sales Info -->
        <div class="card" style="background: var(--surface-elevated); padding: var(--space-4); border-radius: var(--radius-lg);">
          <div style="font-size: var(--text-xs); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-3);">
            Sales Information
          </div>
          <div style="color: var(--text-primary); line-height: 1.6; white-space: pre-wrap;">
            ${this.escapeHtml(salesInfo)}
          </div>
        </div>

        <!-- Quick Actions -->
        <div style="display: flex; gap: var(--space-3);">
          <button class="btn btn-ghost" style="flex: 1;" onclick="alert('Manage Building - Not implemented')">
            ⚙️ Manage
          </button>
          <button class="btn btn-ghost" style="flex: 1;" onclick="alert('View on Map - Not implemented')">
            🗺️ Locate
          </button>
        </div>

      </div>
    `;
  }

  /**
   * Rend l'onglet Details
   */
  private renderDetails() {
    if (!this.contentContainer || !this.currentBuilding) return;

    const details = this.currentBuilding.detailsText || 'No details available';

    this.contentContainer.innerHTML = `
      <div class="card" style="background: var(--surface-elevated); padding: var(--space-5); border-radius: var(--radius-lg);">
        <div style="font-size: var(--text-sm); color: var(--text-primary); line-height: 1.8; white-space: pre-wrap;">
          ${this.escapeHtml(details)}
        </div>
      </div>
    `;
  }

  /**
   * Rend l'onglet Stats
   */
  private renderStats() {
    if (!this.contentContainer || !this.currentBuilding) return;

    const hints = this.currentBuilding.hintsText || 'No hints available';

    this.contentContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">

        <!-- Status & Hints -->
        <div class="card" style="background: var(--surface-elevated); padding: var(--space-4); border-radius: var(--radius-lg);">
          <div style="font-size: var(--text-xs); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-3);">
            📌 Status & Hints
          </div>
          <div style="color: var(--warning); font-style: italic; line-height: 1.6; white-space: pre-wrap;">
            ${this.escapeHtml(hints)}
          </div>
        </div>

        <!-- Mock Stats (TODO: implement real stats) -->
        <div class="card" style="background: var(--surface-elevated); padding: var(--space-4); border-radius: var(--radius-lg);">
          <div style="font-size: var(--text-xs); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-3);">
            Performance Metrics
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
            <div>
              <div style="color: var(--text-muted); font-size: var(--text-xs); margin-bottom: var(--space-1);">Efficiency</div>
              <div style="font-size: var(--text-lg); font-weight: 600; color: var(--success);">85%</div>
            </div>
            <div>
              <div style="color: var(--text-muted); font-size: var(--text-xs); margin-bottom: var(--space-1);">Capacity</div>
              <div style="font-size: var(--text-lg); font-weight: 600; color: var(--info);">120/150</div>
            </div>
            <div>
              <div style="color: var(--text-muted); font-size: var(--text-xs); margin-bottom: var(--space-1);">Quality</div>
              <div style="font-size: var(--text-lg); font-weight: 600; color: var(--success);">Good</div>
            </div>
            <div>
              <div style="color: var(--text-muted); font-size: var(--text-xs); margin-bottom: var(--space-1);">Workers</div>
              <div style="font-size: var(--text-lg); font-weight: 600; color: var(--primary-blue);">45</div>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  /**
   * Met à jour l'apparence des tabs
   */
  private updateTabs() {
    if (!this.tabsContainer) return;

    const buttons = this.tabsContainer.querySelectorAll('.tab-btn');
    buttons.forEach((btn, index) => {
      const tabIds: Array<'overview' | 'details' | 'stats'> = ['overview', 'details', 'stats'];
      const isActive = tabIds[index] === this.currentTab;

      (btn as HTMLElement).style.background = isActive ? 'var(--primary-blue)' : 'transparent';
      (btn as HTMLElement).style.color = isActive ? 'white' : 'var(--text-secondary)';
      (btn as HTMLElement).style.borderColor = isActive ? 'var(--primary-blue)' : 'transparent';
    });
  }

  /**
   * Démarre le drag
   */
  private startDrag(e: MouseEvent) {
    if (!this.modal) return;

    this.isDragging = true;
    this.dragOffsetX = e.clientX - this.posX;
    this.dragOffsetY = e.clientY - this.posY;

    document.onmousemove = (e) => this.onDrag(e);
    document.onmouseup = () => this.stopDrag();

    if (this.modal) {
      this.modal.style.cursor = 'grabbing';
    }
  }

  /**
   * Pendant le drag
   */
  private onDrag(e: MouseEvent) {
    if (!this.isDragging) return;

    this.posX = e.clientX - this.dragOffsetX;
    this.posY = e.clientY - this.dragOffsetY;

    this.updatePosition();
  }

  /**
   * Arrête le drag
   */
  private stopDrag() {
    this.isDragging = false;
    document.onmousemove = null;
    document.onmouseup = null;

    if (this.header) {
      this.header.style.cursor = 'move';
    }
  }

  /**
   * Met à jour la position du modal
   */
  private updatePosition() {
    if (!this.modal) return;

    this.modal.style.left = `${this.posX}px`;
    this.modal.style.top = `${this.posY}px`;
  }

  /**
   * Échappe le HTML pour prévenir XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
