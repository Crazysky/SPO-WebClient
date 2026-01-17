/**
 * TycoonStatsUI - Display tycoon financial and ranking information
 */

export interface TycoonStats {
  username: string;
  cash: string;
  incomePerHour: string;
  ranking: number;
  buildingCount: number;
  maxBuildings: number;
}

export class TycoonStatsUI {
  private container: HTMLElement | null = null;
  private statsPanel: HTMLElement | null = null;

  constructor() {
    // Try to find existing container
    this.container = document.getElementById('tycoon-stats-container');
    
    if (!this.container) {
      console.warn('[TycoonStatsUI] Container not found, creating dynamically');
      
      // Find header element
      const header = document.querySelector('header');
      
      if (header) {
        // Create container dynamically
        this.container = document.createElement('div');
        this.container.id = 'tycoon-stats-container';
        this.container.style.cssText = `
          display: flex;
          align-items: center;
          margin-left: auto;
        `;
        
        // Find toolbar container to position stats next to it
        const toolbarContainer = document.getElementById('toolbar-container');
        
        if (toolbarContainer) {
          // Insert after toolbar
          toolbarContainer.insertAdjacentElement('afterend', this.container);
        } else {
          // Fallback: append to header
          header.appendChild(this.container);
        }
        
        console.log('[TycoonStatsUI] Container created and inserted into header');
      } else {
        console.error('[TycoonStatsUI] No header element found in DOM');
      }
    }
  }

  /**
   * Initialize stats panel
   */
  public init(username: string) {
    console.log('[TycoonStatsUI] init() called with username:', username);
    
    if (!this.container) {
      console.error('[TycoonStatsUI] Cannot init - container is null');
      return;
    }

    this.statsPanel = document.createElement('div');
    this.statsPanel.id = 'tycoon-stats';
    this.statsPanel.style.cssText = `
      display: flex;
      align-items: center;
      gap: var(--space-4);
      background: rgba(51, 65, 85, 0.3);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-2xl);
      padding: var(--space-2) var(--space-4);
      font-family: var(--font-primary);
    `;

    // Ranking & Username
    const rankingEl = this.createStatElement('🏆', `#0 ${username}`, 'Ranking & Username');
    rankingEl.dataset.type = 'ranking';

    // Buildings
    const buildingsEl = this.createStatElement('🏢', '0/0', 'Buildings');
    buildingsEl.dataset.type = 'buildings';

    // Cash
    const cashEl = this.createStatElement('💰', '$0', 'Cash');
    cashEl.dataset.type = 'cash';

    // Income per hour
    const incomeEl = this.createStatElement('📈', '$0/h', 'Income per Hour');
    incomeEl.dataset.type = 'income';

    this.statsPanel.appendChild(rankingEl);
    this.statsPanel.appendChild(buildingsEl);
    this.statsPanel.appendChild(cashEl);
    this.statsPanel.appendChild(incomeEl);

    this.container.appendChild(this.statsPanel);
  }

  /**
   * Create a stat element
   */
  private createStatElement(icon: string, value: string, tooltip: string): HTMLElement {
    const statEl = document.createElement('div');
    statEl.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: 600;
      transition: color var(--transition-base);
    `;

    // Icon
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    iconSpan.style.fontSize = '18px';
    iconSpan.style.lineHeight = '1';
    statEl.appendChild(iconSpan);

    // Value
    const valueSpan = document.createElement('span');
    valueSpan.className = 'stat-value';
    valueSpan.textContent = value;
    valueSpan.style.cssText = `
      color: var(--text-primary);
      font-weight: 700;
      letter-spacing: 0.02em;
    `;
    statEl.appendChild(valueSpan);

    // Tooltip
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'stat-tooltip';
    tooltipEl.textContent = tooltip;
    tooltipEl.style.cssText = `
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      font-size: var(--text-xs);
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity var(--transition-base);
      box-shadow: var(--shadow-lg);
      border: 1px solid var(--glass-border);
      z-index: 10;
    `;
    statEl.appendChild(tooltipEl);

    // Hover effect
    statEl.onmouseenter = () => {
      statEl.style.color = 'var(--primary-blue-light)';
      tooltipEl.style.opacity = '1';
    };
    statEl.onmouseleave = () => {
      statEl.style.color = 'var(--text-secondary)';
      tooltipEl.style.opacity = '0';
    };

    return statEl;
  }

  /**
   * Update tycoon stats
   */
  public updateStats(stats: TycoonStats) {
    console.log('[TycoonStatsUI] updateStats() called:', stats);
    
    if (!this.statsPanel) {
      console.error('[TycoonStatsUI] Cannot update - statsPanel not initialized yet');
      return;
    }

    // Update ranking
    const rankingEl = this.statsPanel.querySelector('[data-type="ranking"] .stat-value');
    if (rankingEl) {
      rankingEl.textContent = `#${stats.ranking} ${stats.username}`;
    }

    // Update buildings
    const buildingsEl = this.statsPanel.querySelector('[data-type="buildings"] .stat-value');
    if (buildingsEl) {
      buildingsEl.textContent = `${stats.buildingCount}/${stats.maxBuildings}`;
    }

    // Update cash
    const cashEl = this.statsPanel.querySelector('[data-type="cash"] .stat-value');
    if (cashEl) {
      cashEl.textContent = this.formatCurrency(stats.cash);
    }

    // Update income
    const incomeEl = this.statsPanel.querySelector('[data-type="income"] .stat-value');
    if (incomeEl) {
      incomeEl.textContent = `${this.formatCurrency(stats.incomePerHour)}/h`;
    }
  }

  /**
   * Format currency string (handles both string and number formats)
   */
  private formatCurrency(value: string): string {
    // Remove any existing $ and spaces
    const cleaned = value.replace(/[$\s]/g, '');
    
    // Try to parse as number
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
      return `$${cleaned}`;
    }

    // Format with K, M, B suffix
    if (num >= 1_000_000_000) {
      return `$${(num / 1_000_000_000).toFixed(2)}B`;
    } else if (num >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(2)}M`;
    } else if (num >= 1_000) {
      return `$${(num / 1_000).toFixed(2)}K`;
    } else {
      return `$${num.toFixed(2)}`;
    }
  }

  /**
   * Hide stats panel
   */
  public hide() {
    if (this.statsPanel) {
      this.statsPanel.style.display = 'none';
    }
  }

  /**
   * Show stats panel
   */
  public show() {
    if (this.statsPanel) {
      this.statsPanel.style.display = 'flex';
    }
  }

  /**
   * Destroy stats panel
   */
  public destroy() {
    if (this.statsPanel && this.statsPanel.parentElement) {
      this.statsPanel.parentElement.removeChild(this.statsPanel);
      this.statsPanel = null;
    }
  }
}
