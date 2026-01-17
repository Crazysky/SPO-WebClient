/**
 * BuildMenuUI - Building construction menu interface
 * Shows categories and facilities for building placement
 */

import { BuildingCategory, BuildingInfo } from '../../shared/types';

export class BuildMenuUI {
  // DOM elements
  private container: HTMLElement | null = null;
  private categoriesContainer: HTMLElement | null = null;
  private facilitiesContainer: HTMLElement | null = null;
  private backButton: HTMLElement | null = null;
  private currentView: 'categories' | 'facilities' = 'categories';
  private selectedCategory: BuildingCategory | null = null;

  // Callbacks
  private onCategorySelected: ((category: BuildingCategory) => void) | null = null;
  private onBuildingSelected: ((building: BuildingInfo) => void) | null = null;
  private onClose: (() => void) | null = null;

  // Track if menu was closed due to building selection
  private closedForPlacement: boolean = false;

  constructor() {
    this.init();
  }

  /**
   * Initialize the UI
   */
  private init() {
    this.container = document.createElement('div');
    this.container.id = 'build-menu';
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 600px;
      max-height: 70vh;
      background: rgba(20, 20, 30, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-lg);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
      display: none;
      flex-direction: column;
      z-index: 1000;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: var(--space-4);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Build Menu';
    title.style.cssText = `
      margin: 0;
      font-size: var(--text-lg);
      color: var(--text-primary);
    `;

    // Back button
    this.backButton = document.createElement('button');
    this.backButton.textContent = '← Back';
    this.backButton.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: var(--text-primary);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: var(--text-sm);
      display: none;
    `;
    this.backButton.onmouseover = () => {
      this.backButton!.style.background = 'rgba(255, 255, 255, 0.15)';
    };
    this.backButton.onmouseout = () => {
      this.backButton!.style.background = 'rgba(255, 255, 255, 0.1)';
    };
    this.backButton.onclick = () => this.showCategories();

    // Close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.cssText = `
      background: none;
      border: none;
      color: var(--text-primary);
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      line-height: 24px;
    `;
    closeButton.onclick = () => this.hide();

    header.appendChild(this.backButton);
    header.appendChild(title);
    header.appendChild(closeButton);

    // Content area
    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: var(--space-4);
    `;

    // Categories container
    this.categoriesContainer = document.createElement('div');
    this.categoriesContainer.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: var(--space-3);
    `;

    // Facilities container
    this.facilitiesContainer = document.createElement('div');
    this.facilitiesContainer.style.cssText = `
      display: none;
      flex-direction: column;
      gap: var(--space-3);
    `;

    content.appendChild(this.categoriesContainer);
    content.appendChild(this.facilitiesContainer);

    this.container.appendChild(header);
    this.container.appendChild(content);

    document.body.appendChild(this.container);
  }

  /**
   * Set callback for category selection
   */
  public setOnCategorySelected(callback: (category: BuildingCategory) => void) {
    this.onCategorySelected = callback;
  }

  /**
   * Set callback for building selection
   */
  public setOnBuildingSelected(callback: (building: BuildingInfo) => void) {
    this.onBuildingSelected = callback;
  }

  /**
   * Set callback for menu close
   */
  public setOnClose(callback: () => void) {
    this.onClose = callback;
  }

  /**
   * Show the build menu with categories
   */
  public show(categories: BuildingCategory[]) {
    if (!this.container || !this.categoriesContainer) return;

    this.currentView = 'categories';
    this.container.style.display = 'flex';
    this.renderCategories(categories);
    this.showCategories();
  }

  /**
   * Hide the build menu
   */
  public hide() {
    if (!this.container) return;
    this.container.style.display = 'none';
    if (this.onClose && !this.closedForPlacement) {
      this.onClose();
    }
    // Reset flag
    this.closedForPlacement = false;
  }

  /**
   * Show categories view
   */
  private showCategories() {
    this.currentView = 'categories';
    if (this.categoriesContainer) {
      this.categoriesContainer.style.display = 'grid';
    }
    if (this.facilitiesContainer) {
      this.facilitiesContainer.style.display = 'none';
    }
    if (this.backButton) {
      this.backButton.style.display = 'none';
    }
  }

  /**
   * Show facilities view
   */
  public showFacilities(category: BuildingCategory, facilities: BuildingInfo[]) {
    this.selectedCategory = category;
    this.currentView = 'facilities';

    if (this.categoriesContainer) {
      this.categoriesContainer.style.display = 'none';
    }
    if (this.facilitiesContainer) {
      this.facilitiesContainer.style.display = 'flex';
    }
    if (this.backButton) {
      this.backButton.style.display = 'block';
    }

    this.renderFacilities(facilities);
  }

  /**
   * Render category cards
   */
  private renderCategories(categories: BuildingCategory[]) {
    if (!this.categoriesContainer) return;

    this.categoriesContainer.innerHTML = '';

    categories.forEach(category => {
      const card = document.createElement('div');
      card.style.cssText = `
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        cursor: pointer;
        text-align: center;
        transition: all 0.2s;
      `;
      card.onmouseover = () => {
        card.style.background = 'rgba(255, 255, 255, 0.1)';
        card.style.borderColor = 'rgba(255, 255, 255, 0.3)';
      };
      card.onmouseout = () => {
        card.style.background = 'rgba(255, 255, 255, 0.05)';
        card.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      };
      card.onclick = () => {
        if (this.onCategorySelected) {
          this.onCategorySelected(category);
        }
      };

      // Category icon
      if (category.iconPath) {
        const icon = document.createElement('img');
        icon.src = this.normalizeImagePath(category.iconPath);
        icon.style.cssText = `
          width: 64px;
          height: 64px;
          object-fit: contain;
          margin-bottom: var(--space-2);
        `;
        card.appendChild(icon);
      }

      // Category name
      const name = document.createElement('div');
      name.textContent = category.kindName;
      name.style.cssText = `
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-weight: 500;
      `;
      card.appendChild(name);

      this.categoriesContainer!.appendChild(card);
    });
  }

  /**
   * Render facility list
   */
  private renderFacilities(facilities: BuildingInfo[]) {
    if (!this.facilitiesContainer) return;

    this.facilitiesContainer.innerHTML = '';

    facilities.forEach(facility => {
      const card = document.createElement('div');
      card.style.cssText = `
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md);
        padding: var(--space-3);
        display: flex;
        gap: var(--space-3);
        ${!facility.available ? 'opacity: 0.5; cursor: not-allowed;' : 'cursor: pointer;'}
        transition: all 0.2s;
      `;

      if (facility.available) {
        card.onmouseover = () => {
          card.style.background = 'rgba(255, 255, 255, 0.1)';
          card.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        };
        card.onmouseout = () => {
          card.style.background = 'rgba(255, 255, 255, 0.05)';
          card.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        };
        card.onclick = () => {
          if (this.onBuildingSelected) {
            this.closedForPlacement = true; // Mark that we're closing for placement
            this.onBuildingSelected(facility);
            this.hide();
          }
        };
      }

      // Building icon
      const iconContainer = document.createElement('div');
      iconContainer.style.cssText = `
        flex-shrink: 0;
      `;

      if (facility.iconPath) {
        const icon = document.createElement('img');
        icon.src = this.normalizeImagePath(facility.iconPath);
        icon.style.cssText = `
          width: 80px;
          height: 60px;
          object-fit: contain;
        `;
        iconContainer.appendChild(icon);
      }

      // Building info
      const info = document.createElement('div');
      info.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      `;

      const name = document.createElement('div');
      name.textContent = facility.name;
      name.style.cssText = `
        color: var(--text-primary);
        font-size: var(--text-base);
        font-weight: 600;
      `;

      const details = document.createElement('div');
      details.style.cssText = `
        display: flex;
        gap: var(--space-3);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      `;

      const cost = document.createElement('span');
      cost.textContent = `$${this.formatCost(facility.cost)}`;
      cost.style.color = 'var(--success)';

      const area = document.createElement('span');
      area.textContent = `${facility.area} m²`;

      details.appendChild(cost);
      details.appendChild(area);

      if (facility.description) {
        const desc = document.createElement('div');
        desc.textContent = facility.description;
        desc.style.cssText = `
          font-size: var(--text-xs);
          color: var(--text-secondary);
          line-height: 1.4;
        `;
        info.appendChild(name);
        info.appendChild(details);
        info.appendChild(desc);
      } else {
        info.appendChild(name);
        info.appendChild(details);
      }

      // Build button
      const buildButton = document.createElement('button');
      buildButton.textContent = facility.available ? 'Build' : 'Locked';
      buildButton.disabled = !facility.available;
      buildButton.style.cssText = `
        background: ${facility.available ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)'};
        border: none;
        color: var(--text-primary);
        padding: var(--space-2) var(--space-4);
        border-radius: var(--radius-md);
        cursor: ${facility.available ? 'pointer' : 'not-allowed'};
        font-size: var(--text-sm);
        font-weight: 600;
        align-self: center;
      `;

      if (facility.available) {
        buildButton.onmouseover = () => {
          buildButton.style.background = 'var(--primary-hover)';
        };
        buildButton.onmouseout = () => {
          buildButton.style.background = 'var(--primary)';
        };
        buildButton.onclick = (e) => {
          e.stopPropagation(); // Prevent card click from firing
          if (this.onBuildingSelected) {
            this.closedForPlacement = true; // Mark that we're closing for placement
            this.onBuildingSelected(facility);
            this.hide();
          }
        };
      }

      card.appendChild(iconContainer);
      card.appendChild(info);
      card.appendChild(buildButton);

      this.facilitiesContainer!.appendChild(card);
    });
  }
  /**
   * Normalize image path to absolute URL
   */
  private normalizeImagePath(path: string): string {
    const BASE_IMAGE_URL = 'http://www.starpeaceonline.com/five/0/visual/voyager/Build/';
    
    // If path is already absolute (starts with http:// or https://), return as-is
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    
    // If path starts with '/', remove it to avoid double slashes
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    
    return BASE_IMAGE_URL + cleanPath;
  }
  /**
   * Format cost with K/M suffix
   */
  private formatCost(cost: number): string {
    if (cost >= 1000000) {
      return `${(cost / 1000000).toFixed(1)}M`;
    } else if (cost >= 1000) {
      return `${(cost / 1000).toFixed(0)}K`;
    }
    return cost.toString();
  }
}
