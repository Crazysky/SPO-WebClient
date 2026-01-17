/**
 * LoginUI - Gère l'interface de connexion et sélection de monde/compagnie
 * Refonte avec nouveau design glassmorphism
 */

import { WorldInfo, CompanyInfo } from '../../shared/types';

export class LoginUI {
  private uiLoginPanel: HTMLElement;
  private uiWorldList: HTMLElement;
  private uiCompanySection: HTMLElement;
  private uiCompanyList: HTMLElement;
  private uiStatus: HTMLElement;

  // Callbacks
  private onDirectoryConnect: ((username: string, password: string) => void) | null = null;
  private onWorldSelect: ((worldName: string) => void) | null = null;
  private onCompanySelect: ((companyId: string) => void) | null = null;

  constructor() {
    this.uiLoginPanel = document.getElementById('login-panel')!;
    this.uiWorldList = document.getElementById('world-list')!;
    this.uiCompanySection = document.getElementById('company-section')!;
    this.uiCompanyList = document.getElementById('company-list')!;
    this.uiStatus = document.getElementById('status-indicator')!;

    this.renderLoginForm();
  }

  /**
   * Définit le callback pour la connexion au Directory
   */
  public setOnDirectoryConnect(callback: (username: string, password: string) => void) {
    this.onDirectoryConnect = callback;
  }

  /**
   * Définit le callback pour la sélection de monde
   */
  public setOnWorldSelect(callback: (worldName: string) => void) {
    this.onWorldSelect = callback;
  }

  /**
   * Définit le callback pour la sélection de compagnie
   */
  public setOnCompanySelect(callback: (companyId: string) => void) {
    this.onCompanySelect = callback;
  }

  /**
   * Affiche le formulaire de login
   */
  private renderLoginForm() {
    // Le bouton est maintenant dans le HTML (btn-connect)
    const btn = document.getElementById('btn-connect');
    if (btn) {
      btn.onclick = () => this.performDirectoryLogin();
    }

    // Support Enter key pour submit
    const inputs = [
      document.getElementById('inp-username'),
      document.getElementById('inp-password')
    ];
    inputs.forEach(input => {
      if (input) {
        input.addEventListener('keypress', (e: Event) => {
          if ((e as KeyboardEvent).key === 'Enter') {
            this.performDirectoryLogin();
          }
        });
      }
    });
  }

  /**
   * Déclenche la connexion au Directory
   */
  private performDirectoryLogin() {
    const username = (document.getElementById('inp-username') as HTMLInputElement).value;
    const password = (document.getElementById('inp-password') as HTMLInputElement).value;

    if (!username || !password) {
      this.showNotification('Please enter username and password', 'error');
      return;
    }

    // Show loading state in world list
    this.showWorldListLoading('Connecting to directory...');

    if (this.onDirectoryConnect) {
      this.onDirectoryConnect(username, password);
    }
  }

  /**
   * Affiche la liste des mondes disponibles
   */
  public renderWorldList(worlds: WorldInfo[]) {
    this.uiWorldList.innerHTML = '';

    // Hide authentication block after successful connection
    const authSection = document.querySelector('.login-section:has(.credentials-card)') as HTMLElement;
    if (authSection) {
      authSection.style.display = 'none';
    }

    if (worlds.length === 0) {
      this.uiWorldList.innerHTML = '<div style="padding: var(--space-6); text-align: center; color: var(--text-muted); font-style: italic;">No worlds available</div>';
      return;
    }

    worlds.forEach(w => {
      const card = document.createElement('div');
      card.className = 'world-card';
      card.innerHTML = `
        <div class="world-header">
          <div class="world-name">${w.name}</div>
          ${this.getWorldStatusBadge(w)}
        </div>
        <div class="world-stats">
          <span>📅 ${w.date || 'N/A'}</span>
          <span>👥 ${w.investors || 0} investors</span>
          <span>🟢 ${w.online || w.players || 0} online</span>
          <span>🌍 ${w.population || 0} population</span>
        </div>
      `;
      card.onclick = () => {
        if (this.onWorldSelect) {
          this.onWorldSelect(w.name);
        }
      };
      this.uiWorldList.appendChild(card);
    });
  }

  /**
   * Génère un badge de statut pour le monde
   */
  private getWorldStatusBadge(world: WorldInfo): string {
    const players = world.players || 0;
    let badgeClass = 'badge-success';
    let status = 'Online';

    if (players > 100) {
      badgeClass = 'badge-error';
      status = 'Full';
    } else if (players > 50) {
      badgeClass = 'badge-warning';
      status = 'Busy';
    }

    return `<span class="badge ${badgeClass}">${status}</span>`;
  }


  /**
   * Affiche la sélection de compagnie
   */
  public renderCompanySelection(companies: CompanyInfo[]) {
    // Hide world list section
    const worldSection = this.uiWorldList.parentElement;
    if (worldSection) {
      worldSection.style.display = 'none';
    }

    // Show and populate company section
    this.uiCompanySection.classList.remove('hidden');
    this.uiCompanyList.innerHTML = '';

    if (companies.length === 0) {
      this.uiCompanyList.innerHTML = '<div style="padding: var(--space-4); text-align: center; color: var(--text-muted); font-style: italic;">No companies available</div>';
      return;
    }

    companies.forEach(company => {
      const card = document.createElement('div');
      card.className = 'company-card';
      card.innerHTML = `
        <div class="company-name">🏢 ${company.name}</div>
      `;
      card.onclick = () => {
        if (this.onCompanySelect) {
          this.onCompanySelect(company.id);
        }
      };
      this.uiCompanyList.appendChild(card);
    });
  }


  /**
   * Affiche une notification (toast simple)
   */
  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
    // TODO: integrate with global notification system
    const colors = {
      success: 'var(--success)',
      error: 'var(--error)',
      info: 'var(--info)'
    };

    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 80px;
      right: 16px;
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      border: 1px solid ${colors[type]};
      border-radius: var(--radius-md);
      padding: var(--space-4);
      color: ${colors[type]};
      font-size: var(--text-sm);
      z-index: var(--z-tooltip);
      animation: slideInRight 0.3s ease-out;
      box-shadow: var(--shadow-xl);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Cache le bouton de connexion au Directory (deprecated)
   */
  public hideConnectButton() {
    // No longer needed with the new design
  }

  /**
   * Cache le panel de login
   */
  public hide() {
    this.uiLoginPanel.style.display = 'none';
  }

  /**
   * Met à jour le statut de connexion
   */
  public setStatus(text: string, color: string) {
    const statusText = this.uiStatus.querySelector('span:last-child');
    const statusDot = this.uiStatus.querySelector('.status-dot') as HTMLElement;

    if (statusText) {
      statusText.textContent = text;
    }

    if (statusDot) {
      // Map colors to CSS variables
      const colorMap: Record<string, string> = {
        '#0f0': 'var(--success)',
        'green': 'var(--success)',
        '#f00': 'var(--error)',
        'red': 'var(--error)',
        '#ff0': 'var(--warning)',
        'yellow': 'var(--warning)'
      };
      statusDot.style.background = colorMap[color] || color;
    }
  }

  /**
   * Shows loading state in world list
   */
  public showWorldListLoading(message: string) {
    this.uiWorldList.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; padding: var(--space-6); color: var(--text-muted); font-style: italic;">
        <span class="spinner"></span>
        ${message}
      </div>
    `;
  }

  /**
   * Shows loading state in company list
   */
  public showCompanyListLoading(message: string) {
    this.uiCompanyList.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; padding: var(--space-4); color: var(--text-muted); font-style: italic;">
        <span class="spinner"></span>
        ${message}
      </div>
    `;
  }
}
