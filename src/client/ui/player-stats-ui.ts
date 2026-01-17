/**
 * PlayerStatsUI - Affiche les statistiques du joueur en overlay
 */

export interface PlayerStats {
  rank: number;
  username: string;
  buildingCount: number;
  maxBuildings: number;
  cash: number;
  revenue: number; // Revenue per hour ($/h)
}

export class PlayerStatsUI {
  private container: HTMLElement | null = null;
  private stats: PlayerStats = {
    rank: 0,
    username: 'Player',
    buildingCount: 0,
    maxBuildings: 50,
    cash: 0,
    revenue: 0
  };

  constructor(private gamePanel: HTMLElement) {
    this.init();
  }

  /**
   * Initialise le composant de statistiques joueur
   */
  private init() {
    this.container = document.createElement('div');
    this.container.id = 'player-stats';
    this.container.style.cssText = `
      position: absolute;
      top: 16px;
      right: 16px;
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      min-width: 240px;
      z-index: var(--z-dropdown);
      box-shadow: var(--shadow-lg);
      font-family: var(--font-primary);
    `;

    this.render();
    this.gamePanel.appendChild(this.container);
  }

  /**
   * Rend le contenu du composant
   */
  private render() {
    if (!this.container) return;

    const buildingProgress = (this.stats.buildingCount / this.stats.maxBuildings) * 100;
    const revenueColor = this.stats.revenue >= 0 ? 'var(--success)' : 'var(--error)';
    const revenueSign = this.stats.revenue >= 0 ? '+' : '';

    this.container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">

        <!-- Header: Rank & Username -->
        <div style="display: flex; align-items: center; gap: var(--space-3); padding-bottom: var(--space-3); border-bottom: 1px solid var(--glass-border);">
          <div style="
            background: linear-gradient(135deg, var(--primary-blue), var(--primary-blue-dark));
            width: 40px;
            height: 40px;
            border-radius: var(--radius-md);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: var(--text-lg);
            color: var(--text-primary);
          ">
            #${this.stats.rank}
          </div>
          <div style="flex: 1;">
            <div style="font-size: var(--text-xs); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em;">Player</div>
            <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">@${this.stats.username}</div>
          </div>
        </div>

        <!-- Buildings -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
            <span style="font-size: var(--text-sm); color: var(--text-secondary); display: flex; align-items: center; gap: var(--space-2);">
              <span style="font-size: 18px;">🏗️</span>
              Buildings
            </span>
            <span style="font-weight: 600; color: var(--text-primary); font-size: var(--text-sm);">
              ${this.stats.buildingCount} / ${this.stats.maxBuildings}
            </span>
          </div>
          <div style="
            width: 100%;
            height: 6px;
            background: var(--bg-tertiary);
            border-radius: var(--radius-full);
            overflow: hidden;
          ">
            <div style="
              width: ${buildingProgress}%;
              height: 100%;
              background: linear-gradient(90deg, var(--primary-blue), var(--primary-blue-light));
              transition: width 0.3s ease-out;
              border-radius: var(--radius-full);
            "></div>
          </div>
        </div>

        <!-- Cash -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: var(--text-sm); color: var(--text-secondary); display: flex; align-items: center; gap: var(--space-2);">
            <span style="font-size: 18px;">💰</span>
            Cash
          </span>
          <span style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">
            $${this.formatNumber(this.stats.cash)}
          </span>
        </div>

        <!-- Revenue -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: var(--text-sm); color: var(--text-secondary); display: flex; align-items: center; gap: var(--space-2);">
            <span style="font-size: 18px;">📈</span>
            Revenue
          </span>
          <span style="font-weight: 600; color: ${revenueColor}; font-size: var(--text-base);">
            ${revenueSign}$${this.formatNumber(Math.abs(this.stats.revenue))}/h
          </span>
        </div>

      </div>
    `;
  }

  /**
   * Formate un nombre avec des séparateurs de milliers
   */
  private formatNumber(num: number): string {
    if (num >= 1_000_000) {
      return (num / 1_000_000).toFixed(1) + 'M';
    } else if (num >= 1_000) {
      return (num / 1_000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  }

  /**
   * Met à jour les statistiques du joueur
   */
  public updateStats(stats: Partial<PlayerStats>) {
    this.stats = { ...this.stats, ...stats };
    this.render();
  }

  /**
   * Anime le changement d'une valeur numérique (count-up effect)
   */
  public animateValue(key: keyof PlayerStats, targetValue: number, duration: number = 1000) {
    const startValue = this.stats[key] as number;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(startValue + (targetValue - startValue) * easeOut);

      this.updateStats({ [key]: currentValue } as Partial<PlayerStats>);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Affiche/masque le composant
   */
  public setVisible(visible: boolean) {
    if (this.container) {
      this.container.style.display = visible ? 'block' : 'none';
    }
  }

  /**
   * Détruit le composant
   */
  public destroy() {
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
      this.container = null;
    }
  }
}
