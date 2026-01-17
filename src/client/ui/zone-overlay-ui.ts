/**
 * ZoneOverlayUI - Controls for toggling zone overlays
 * Simple button in toolbar to toggle zone visualization
 */

import { SurfaceType } from '../../shared/types';

export class ZoneOverlayUI {
  private button: HTMLButtonElement | null = null;
  private isEnabled: boolean = false;
  private onToggle: ((enabled: boolean, type: SurfaceType) => void) | null = null;

  constructor() {
    this.init();
  }

  /**
   * Initialize the UI
   */
  private init() {
    this.button = document.createElement('button');
    this.button.id = 'zone-overlay-button';
    this.button.textContent = 'Zones';
    this.button.title = 'Toggle zone overlay';
    this.button.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: var(--text-primary);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: var(--text-sm);
      transition: all 0.2s;
    `;

    this.button.onmouseover = () => {
      if (this.button) {
        this.button.style.background = 'rgba(255, 255, 255, 0.15)';
      }
    };

    this.button.onmouseout = () => {
      if (this.button) {
        this.button.style.background = this.isEnabled
          ? 'rgba(66, 153, 225, 0.3)'
          : 'rgba(255, 255, 255, 0.1)';
      }
    };

    this.button.onclick = () => {
      this.toggle();
    };

    // Add to toolbar
    const toolbar = document.getElementById('toolbar');
    if (toolbar) {
      toolbar.appendChild(this.button);
    }
  }

  /**
   * Set callback for toggle
   */
  public setOnToggle(callback: (enabled: boolean, type: SurfaceType) => void) {
    this.onToggle = callback;
  }

  /**
   * Toggle zone overlay
   */
  private toggle() {
    this.isEnabled = !this.isEnabled;

    if (this.button) {
      this.button.style.background = this.isEnabled
        ? 'rgba(66, 153, 225, 0.3)'
        : 'rgba(255, 255, 255, 0.1)';
      this.button.style.borderColor = this.isEnabled
        ? 'rgba(66, 153, 225, 0.5)'
        : 'rgba(255, 255, 255, 0.2)';
    }

    if (this.onToggle) {
      this.onToggle(this.isEnabled, SurfaceType.ZONES);
    }
  }

  /**
   * Enable/disable the button
   */
  public setEnabled(enabled: boolean) {
    if (this.button) {
      this.button.disabled = !enabled;
      this.button.style.opacity = enabled ? '1' : '0.5';
      this.button.style.cursor = enabled ? 'pointer' : 'not-allowed';
    }
  }
}
