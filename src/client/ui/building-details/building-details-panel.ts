/**
 * Building Details Panel
 *
 * Main panel component for displaying detailed building information.
 * Uses templates to determine which properties to show for each building type.
 */

import {
  BuildingDetailsResponse,
} from '../../../shared/types';
import {
  getTemplateForVisualClass,
  PropertyGroup,
} from '../../../shared/building-details';
import { renderPropertyGroup } from './property-renderers';
import { renderSuppliesWithTabs } from './property-table';
import { renderSparklineGraph } from './property-graph';

export interface BuildingDetailsPanelOptions {
  onClose?: () => void;
  onPropertyChange?: (propertyName: string, value: string) => Promise<void>;
  onNavigateToBuilding?: (x: number, y: number) => void;
}

export class BuildingDetailsPanel {
  private container: HTMLElement;
  private modal: HTMLElement | null = null;
  private header: HTMLElement | null = null;
  private tabsNav: HTMLElement | null = null;
  private contentContainer: HTMLElement | null = null;

  private currentDetails: BuildingDetailsResponse | null = null;
  private currentTab: string = 'overview';

  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private posX = 0;
  private posY = 0;

  private options: BuildingDetailsPanelOptions;

  constructor(container: HTMLElement, options: BuildingDetailsPanelOptions = {}) {
    this.container = container;
    this.options = options;
    this.init();
  }

  /**
   * Initialize the panel DOM
   */
  private init(): void {
    this.modal = document.createElement('div');
    this.modal.id = 'building-details-panel';
    this.modal.className = 'building-details-panel';
    this.modal.style.display = 'none';

    // Header
    this.header = this.createHeader();
    this.modal.appendChild(this.header);

    // Tabs navigation
    this.tabsNav = document.createElement('div');
    this.tabsNav.className = 'building-details-tabs';
    this.modal.appendChild(this.tabsNav);

    // Content container
    this.contentContainer = document.createElement('div');
    this.contentContainer.className = 'building-details-content';
    this.modal.appendChild(this.contentContainer);

    // Footer
    const footer = this.createFooter();
    this.modal.appendChild(footer);

    this.container.appendChild(this.modal);
  }

  /**
   * Create the panel header
   */
  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'building-details-header';

    const titleContainer = document.createElement('div');
    titleContainer.className = 'header-title-container';
    titleContainer.innerHTML = `
      <div class="header-icon">B</div>
      <div class="header-info">
        <div class="header-title" id="bd-building-name">Building</div>
        <div class="header-subtitle" id="bd-template-name">Loading...</div>
      </div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'header-close-btn';
    closeBtn.innerHTML = 'X';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.hide();
      if (this.options.onClose) {
        this.options.onClose();
      }
    };

    header.appendChild(titleContainer);
    header.appendChild(closeBtn);

    // Drag handlers
    header.onmousedown = (e) => this.startDrag(e);

    return header;
  }

  /**
   * Create the panel footer
   */
  private createFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.className = 'building-details-footer';
    footer.innerHTML = `
      <div class="footer-coords" id="bd-coords">(0, 0)</div>
      <div class="footer-visual-class" id="bd-visual-class">VC: --</div>
      <div class="footer-timestamp" id="bd-timestamp">--:--:--</div>
    `;
    return footer;
  }

  /**
   * Show the panel with building details
   */
  public show(details: BuildingDetailsResponse): void {
    this.currentDetails = details;

    // Set initial position if not set
    if (this.posX === 0 && this.posY === 0) {
      const rect = this.container.getBoundingClientRect();
      this.posX = (rect.width - 500) / 2;
      this.posY = 80;
    }

    this.updatePosition();
    this.renderContent();

    if (this.modal) {
      this.modal.style.display = 'flex';
      this.modal.style.animation = 'scaleIn 0.2s ease-out';
    }
  }

  /**
   * Hide the panel
   */
  public hide(): void {
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
   * Check if panel is visible
   */
  public isVisible(): boolean {
    return this.modal?.style.display !== 'none';
  }

  /**
   * Update the panel with new details
   */
  public update(details: BuildingDetailsResponse): void {
    this.currentDetails = details;
    this.renderContent();
  }

  /**
   * Render the full content
   */
  private renderContent(): void {
    if (!this.currentDetails) return;

    const details = this.currentDetails;
    const template = getTemplateForVisualClass(details.visualClass);

    // Update header
    const nameEl = document.getElementById('bd-building-name');
    const templateEl = document.getElementById('bd-template-name');
    const coordsEl = document.getElementById('bd-coords');
    const visualClassEl = document.getElementById('bd-visual-class');
    const timestampEl = document.getElementById('bd-timestamp');

    // Get building name - prefer direct field, fallback to properties, then template name
    const nameValue = details.buildingName || template.name;

    if (nameEl) nameEl.textContent = nameValue;
    if (templateEl) templateEl.textContent = template.name;
    if (coordsEl) coordsEl.textContent = `(${details.x}, ${details.y})`;
    if (visualClassEl) visualClassEl.textContent = `VC: ${details.visualClass}`;
    if (timestampEl) {
      const date = new Date(details.timestamp);
      timestampEl.textContent = date.toLocaleTimeString();
    }

    // Render tabs
    this.renderTabs(template.groups);

    // Render active tab content
    this.renderTabContent();
  }

  /**
   * Render tab navigation
   */
  private renderTabs(groups: PropertyGroup[]): void {
    if (!this.tabsNav) return;

    this.tabsNav.innerHTML = '';

    // Sort groups by order
    const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

    // Check if current tab exists in this template
    const tabExists = sortedGroups.some(g => g.id === this.currentTab);
    if (!tabExists && sortedGroups.length > 0) {
      this.currentTab = sortedGroups[0].id;
    }

    for (const group of sortedGroups) {
      // Check if this group has any data
      const hasData = this.currentDetails?.groups[group.id]?.length > 0 ||
        (group.special === 'supplies' && this.currentDetails?.supplies?.length) ||
        (group.id === 'finances' && this.currentDetails?.moneyGraph?.length);

      const btn = document.createElement('button');
      btn.className = 'tab-btn' + (this.currentTab === group.id ? ' active' : '');
      if (!hasData) btn.classList.add('tab-empty');
      btn.innerHTML = `<span class="tab-icon">${group.icon || ''}</span><span class="tab-label">${group.name}</span>`;

      btn.onclick = () => {
        this.currentTab = group.id;
        this.renderTabs(sortedGroups);
        this.renderTabContent();
      };

      this.tabsNav.appendChild(btn);
    }
  }

	private renderTabContent(): void {
	  if (!this.contentContainer || !this.currentDetails) return;

	  this.contentContainer.innerHTML = '';
	  const details = this.currentDetails;
	  const template = getTemplateForVisualClass(details.visualClass);
	  const group = template.groups.find(g => g.id === this.currentTab);

	  if (!group) {
		this.contentContainer.innerHTML = '<p>No data available</p>';
		return;
	  }

	  // Special handling for certain group types
	  if (group.special === 'supplies' && details.supplies?.length) {
		const suppliesEl = renderSuppliesWithTabs(
		  details.supplies,
		  this.options.onNavigateToBuilding
		);
		this.contentContainer.appendChild(suppliesEl);
		return;
	  }

	  if (group.id === 'finances' && details.moneyGraph?.length) {
		const graphEl = renderSparklineGraph(details.moneyGraph, {
		  width: 440,
		  height: 100,
		  showLabels: true,
		});
		this.contentContainer.appendChild(graphEl);

		const financeProps = details.groups['finances'];
		if (financeProps?.length) {
		  const propsEl = renderPropertyGroup(
			financeProps,
			group.properties,
			this.handlePropertyChange.bind(this) // ← FIX: Bind callback
		  );
		  this.contentContainer.appendChild(propsEl);
		}
		return;
	  }

	  // Standard property rendering
	  const groupData = details.groups[group.id];
	  if (!groupData || groupData.length === 0) {
		this.contentContainer.innerHTML = '<p>No data available for this section</p>';
		return;
	  }

	  const propsEl = renderPropertyGroup(
		groupData,
		group.properties,
		this.handlePropertyChange.bind(this) // ← FIX: Bind callback
	  );
	  this.contentContainer.appendChild(propsEl);
	}

	/**
	 * Handle property change from slider
	 */
	private handlePropertyChange(propertyName: string, value: number): void {
	  if (this.options.onPropertyChange) {
		this.options.onPropertyChange(propertyName, value.toString());
	  }
	}


  /**
   * Start dragging
   */
  private startDrag(e: MouseEvent): void {
    if (!this.modal) return;

    this.isDragging = true;
    this.dragOffsetX = e.clientX - this.posX;
    this.dragOffsetY = e.clientY - this.posY;

    document.onmousemove = (ev) => this.onDrag(ev);
    document.onmouseup = () => this.stopDrag();

    if (this.header) {
      this.header.style.cursor = 'grabbing';
    }
  }

  /**
   * During drag
   */
  private onDrag(e: MouseEvent): void {
    if (!this.isDragging) return;

    this.posX = e.clientX - this.dragOffsetX;
    this.posY = e.clientY - this.dragOffsetY;

    this.updatePosition();
  }

  /**
   * Stop dragging
   */
  private stopDrag(): void {
    this.isDragging = false;
    document.onmousemove = null;
    document.onmouseup = null;

    if (this.header) {
      this.header.style.cursor = 'move';
    }
  }

  /**
   * Update modal position
   */
  private updatePosition(): void {
    if (!this.modal) return;

    this.modal.style.left = `${this.posX}px`;
    this.modal.style.top = `${this.posY}px`;
  }
}
