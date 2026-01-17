/**
 * ToastNotificationUI - Système de notifications toast global
 * Design moderne avec animations et queue de gestion
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number; // in ms, 0 = permanent until manual close
  icon?: string;
}

interface Toast {
  id: string;
  options: ToastOptions;
  element: HTMLElement;
  timeoutId?: number;
}

export class ToastNotificationUI {
  private container: HTMLElement | null = null;
  private toasts: Map<string, Toast> = new Map();
  private toastIdCounter: number = 0;

  constructor(private rootElement: HTMLElement = document.body) {
    this.init();
  }

  /**
   * Affiche une notification success
   */
  public success(message: string, duration: number = 4000) {
    return this.show({ message, type: 'success', duration });
  }

  /**
   * Affiche une notification error
   */
  public error(message: string, duration: number = 5000) {
    return this.show({ message, type: 'error', duration });
  }

  /**
   * Affiche une notification warning
   */
  public warning(message: string, duration: number = 4000) {
    return this.show({ message, type: 'warning', duration });
  }

  /**
   * Affiche une notification info
   */
  public info(message: string, duration: number = 3000) {
    return this.show({ message, type: 'info', duration });
  }

  /**
   * Affiche une notification avec options personnalisées
   */
  public show(options: ToastOptions): string {
    const toastId = `toast-${this.toastIdCounter++}`;

    const defaultOptions: ToastOptions = {
      message: '',
      type: 'info',
      duration: 3000,
      ...options
    };

    const toastElement = this.createToastElement(toastId, defaultOptions);
    this.container!.appendChild(toastElement);

    const toast: Toast = {
      id: toastId,
      options: defaultOptions,
      element: toastElement
    };

    this.toasts.set(toastId, toast);

    // Entry animation
    requestAnimationFrame(() => {
      toastElement.style.animation = 'slideInRight 0.3s ease-out';
      toastElement.style.opacity = '1';
      toastElement.style.transform = 'translateX(0)';
    });

    // Auto-dismiss if duration specified
    if (defaultOptions.duration && defaultOptions.duration > 0) {
      toast.timeoutId = window.setTimeout(() => {
        this.dismiss(toastId);
      }, defaultOptions.duration);
    }

    return toastId;
  }

  /**
   * Ferme une notification spécifique
   */
  public dismiss(toastId: string) {
    const toast = this.toasts.get(toastId);
    if (!toast) return;

    // Clear timeout si existe
    if (toast.timeoutId) {
      clearTimeout(toast.timeoutId);
    }

    // Animation de sortie
    toast.element.style.animation = 'slideOutRight 0.3s ease-out';

    setTimeout(() => {
      if (toast.element.parentElement) {
        toast.element.parentElement.removeChild(toast.element);
      }
      this.toasts.delete(toastId);
    }, 300);
  }

  /**
   * Ferme toutes les notifications
   */
  public dismissAll() {
    Array.from(this.toasts.keys()).forEach(id => this.dismiss(id));
  }

  /**
   * Initialise le conteneur de toasts
   */
  private init() {
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 80px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      z-index: var(--z-tooltip);
      pointer-events: none;
      max-width: 420px;
    `;

    this.rootElement.appendChild(this.container);

    // Inject CSS animations if not already done
    this.injectAnimations();
  }

  /**
   * Crée un élément toast
   */
  private createToastElement(id: string, options: ToastOptions): HTMLElement {
    const toast = document.createElement('div');
    toast.id = id;
    toast.className = 'toast';
    toast.style.cssText = `
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      border: 1px solid ${this.getBorderColor(options.type!)};
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      box-shadow: var(--shadow-xl);
      display: flex;
      align-items: start;
      gap: var(--space-3);
      min-width: 300px;
      max-width: 420px;
      pointer-events: auto;
      opacity: 0;
      transform: translateX(100%);
      transition: all var(--transition-base);
    `;

    // Icon
    const icon = document.createElement('div');
    icon.style.cssText = `
      font-size: 24px;
      line-height: 1;
      flex-shrink: 0;
    `;
    icon.textContent = options.icon || this.getDefaultIcon(options.type!);

    // Content
    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      font-weight: 600;
      font-size: var(--text-sm);
      color: ${this.getTextColor(options.type!)};
    `;
    title.textContent = this.getTypeLabel(options.type!);

    const message = document.createElement('div');
    message.style.cssText = `
      font-size: var(--text-sm);
      color: var(--text-secondary);
      line-height: 1.5;
    `;
    message.textContent = options.message;

    content.appendChild(title);
    content.appendChild(message);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-icon';
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-muted);
      width: 24px;
      height: 24px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      transition: all var(--transition-base);
      flex-shrink: 0;
      font-size: 16px;
    `;
    closeBtn.onmouseenter = () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
      closeBtn.style.color = 'var(--text-primary)';
    };
    closeBtn.onmouseleave = () => {
      closeBtn.style.background = 'transparent';
      closeBtn.style.color = 'var(--text-muted)';
    };
    closeBtn.onclick = () => this.dismiss(id);

    // Assemble
    toast.appendChild(icon);
    toast.appendChild(content);
    toast.appendChild(closeBtn);

    // Hover effect (pause auto-dismiss)
    toast.onmouseenter = () => {
      const toastData = this.toasts.get(id);
      if (toastData && toastData.timeoutId) {
        clearTimeout(toastData.timeoutId);
        toastData.timeoutId = undefined;
      }
    };

    toast.onmouseleave = () => {
      const toastData = this.toasts.get(id);
      if (toastData && options.duration && options.duration > 0) {
        toastData.timeoutId = window.setTimeout(() => {
          this.dismiss(id);
        }, 2000); // 2 additional seconds after hover
      }
    };

    return toast;
  }

  /**
   * Obtient la couleur de bordure selon le type
   */
  private getBorderColor(type: ToastType): string {
    const colors = {
      success: 'var(--success)',
      error: 'var(--error)',
      warning: 'var(--warning)',
      info: 'var(--info)'
    };
    return colors[type];
  }

  /**
   * Obtient la couleur de texte selon le type
   */
  private getTextColor(type: ToastType): string {
    return this.getBorderColor(type);
  }

  /**
   * Obtient l'icône par défaut selon le type
   */
  private getDefaultIcon(type: ToastType): string {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type];
  }

  /**
   * Obtient le label du type
   */
  private getTypeLabel(type: ToastType): string {
    const labels = {
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      info: 'Information'
    };
    return labels[type];
  }

  /**
   * Injecte les animations CSS
   */
  private injectAnimations() {
    if (document.querySelector('#toast-animations')) return;

    const style = document.createElement('style');
    style.id = 'toast-animations';
    style.textContent = `
      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes slideOutRight {
        from {
          opacity: 1;
          transform: translateX(0);
        }
        to {
          opacity: 0;
          transform: translateX(120%);
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Détruit le système de notifications
   */
  public destroy() {
    this.dismissAll();
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
      this.container = null;
    }
  }
}

// Export une instance globale singleton
let toastInstance: ToastNotificationUI | null = null;

export function getToastService(): ToastNotificationUI {
  if (!toastInstance) {
    toastInstance = new ToastNotificationUI();
  }
  return toastInstance;
}
