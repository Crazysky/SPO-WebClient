/**
 * Connection Picker Dialog
 *
 * Modal dialog for finding and selecting suppliers (input) or clients (output)
 * to connect to a facility. Follows the Voyager SupplyFinder/ClientFinder pattern.
 */

import type { ConnectionSearchResult } from '../../../shared/types';

export interface ConnectionPickerOptions {
  fluidName: string;
  fluidId: string;
  direction: 'input' | 'output';
  buildingX: number;
  buildingY: number;
  onSearch: (fluidId: string, direction: 'input' | 'output', filters: ConnectionSearchFilters) => void;
  onConnect: (fluidId: string, direction: 'input' | 'output', selectedCoords: Array<{ x: number; y: number }>) => void;
  onClose: () => void;
}

export interface ConnectionSearchFilters {
  company?: string;
  town?: string;
  maxResults?: number;
  roles?: number;
}

/** Facility role bitmask values (from Voyager TFacilityRoleSet) */
const ROLE_PRODUCER = 1;
const ROLE_DISTRIBUTER = 2;
const ROLE_BUYER = 4;
const ROLE_EXPORTER = 8;
const ROLE_IMPORTER = 16;

export class ConnectionPickerDialog {
  private backdrop: HTMLElement;
  private dialog: HTMLElement;
  private resultsList: HTMLElement;
  private options: ConnectionPickerOptions;
  private results: ConnectionSearchResult[] = [];
  private selectedIndices: Set<number> = new Set();

  constructor(container: HTMLElement, options: ConnectionPickerOptions) {
    this.options = options;

    // Backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'connection-picker-backdrop';
    this.backdrop.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.5); z-index: 1100;
      display: flex; align-items: center; justify-content: center;
    `;
    this.backdrop.onclick = (e) => {
      if (e.target === this.backdrop) this.close();
    };

    // Dialog
    this.dialog = document.createElement('div');
    this.dialog.className = 'connection-picker-dialog';
    this.dialog.style.cssText = `
      width: 520px; max-height: 70vh;
      background: linear-gradient(135deg, rgba(20, 40, 50, 0.97), rgba(30, 50, 60, 0.97));
      border: 1px solid rgba(74, 122, 106, 0.4);
      border-radius: 8px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
      display: flex; flex-direction: column; overflow: hidden;
      font-family: Tahoma, Verdana, Arial, sans-serif;
    `;

    const dirLabel = options.direction === 'input' ? 'Find Suppliers' : 'Find Clients';

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 10px 16px; background: linear-gradient(135deg, #1a3a4f, #2d5b6a);
      border-bottom: 1px solid rgba(74, 122, 106, 0.4);
      display: flex; justify-content: space-between; align-items: center;
    `;
    header.innerHTML = `
      <span style="color: #ffffcc; font-weight: 600; font-size: 13px;">${dirLabel} for: ${this.escapeHtml(options.fluidName)}</span>
      <button class="cpd-close" style="background: rgba(255,255,255,0.1); border: none; color: #ffffcc; font-size: 16px; cursor: pointer; padding: 2px 6px; border-radius: 3px;">&times;</button>
    `;
    header.querySelector('.cpd-close')!.addEventListener('click', () => this.close());

    // Filters
    const filters = document.createElement('div');
    filters.style.cssText = 'padding: 10px 16px; border-bottom: 1px solid rgba(74, 122, 106, 0.3);';
    filters.innerHTML = `
      <div style="display: flex; gap: 8px; margin-bottom: 8px;">
        <label style="color: #88aa99; font-size: 11px; flex: 1;">
          Company<br>
          <input type="text" class="cpd-company" style="width: 100%; padding: 4px; background: rgba(0,0,0,0.3); border: 1px solid rgba(74,122,106,0.3); color: #ddd; border-radius: 3px; font-size: 11px;">
        </label>
        <label style="color: #88aa99; font-size: 11px; flex: 1;">
          Town<br>
          <input type="text" class="cpd-town" style="width: 100%; padding: 4px; background: rgba(0,0,0,0.3); border: 1px solid rgba(74,122,106,0.3); color: #ddd; border-radius: 3px; font-size: 11px;">
        </label>
        <label style="color: #88aa99; font-size: 11px; width: 50px;">
          Max<br>
          <input type="number" class="cpd-max" value="20" min="1" max="100" style="width: 100%; padding: 4px; background: rgba(0,0,0,0.3); border: 1px solid rgba(74,122,106,0.3); color: #ddd; border-radius: 3px; font-size: 11px;">
        </label>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <label style="color: #88aa99; font-size: 11px; display: flex; align-items: center; gap: 3px;">
          <input type="checkbox" class="cpd-role" data-role="${ROLE_PRODUCER}" checked> Factories
        </label>
        <label style="color: #88aa99; font-size: 11px; display: flex; align-items: center; gap: 3px;">
          <input type="checkbox" class="cpd-role" data-role="${ROLE_DISTRIBUTER}" checked> Warehouses
        </label>
        <label style="color: #88aa99; font-size: 11px; display: flex; align-items: center; gap: 3px;">
          <input type="checkbox" class="cpd-role" data-role="${ROLE_IMPORTER}" checked> Trade Centers
        </label>
        ${options.direction === 'output' ? `
        <label style="color: #88aa99; font-size: 11px; display: flex; align-items: center; gap: 3px;">
          <input type="checkbox" class="cpd-role" data-role="${ROLE_BUYER}" checked> Stores
        </label>` : `
        <label style="color: #88aa99; font-size: 11px; display: flex; align-items: center; gap: 3px;">
          <input type="checkbox" class="cpd-role" data-role="${ROLE_EXPORTER}" checked> Exporters
        </label>`}
        <button class="cpd-search" style="margin-left: auto; padding: 4px 16px; background: rgba(52, 89, 80, 0.8); color: #ffffcc; border: 1px solid #4a7a6a; border-radius: 3px; cursor: pointer; font-size: 11px;">Search</button>
      </div>
    `;

    filters.querySelector('.cpd-search')!.addEventListener('click', () => this.performSearch());

    // Results area
    this.resultsList = document.createElement('div');
    this.resultsList.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px 16px; min-height: 150px; max-height: 300px;';
    this.resultsList.innerHTML = '<div style="color: #88aa99; font-size: 12px; text-align: center; padding: 40px;">Click Search to find available connections</div>';

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = 'padding: 8px 16px; border-top: 1px solid rgba(74, 122, 106, 0.3); display: flex; gap: 8px; justify-content: flex-end;';
    footer.innerHTML = `
      <button class="cpd-select-all" style="padding: 4px 12px; background: rgba(40, 60, 70, 0.8); color: #88aa99; border: 1px solid rgba(74,122,106,0.3); border-radius: 3px; cursor: pointer; font-size: 11px;">Select All</button>
      <button class="cpd-clear" style="padding: 4px 12px; background: rgba(40, 60, 70, 0.8); color: #88aa99; border: 1px solid rgba(74,122,106,0.3); border-radius: 3px; cursor: pointer; font-size: 11px;">Clear</button>
      <button class="cpd-connect" style="padding: 4px 16px; background: rgba(52, 89, 80, 0.8); color: #ffffcc; border: 1px solid #4a7a6a; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: 600;">Connect Selected</button>
    `;
    footer.querySelector('.cpd-select-all')!.addEventListener('click', () => this.selectAll());
    footer.querySelector('.cpd-clear')!.addEventListener('click', () => this.clearSelection());
    footer.querySelector('.cpd-connect')!.addEventListener('click', () => this.connectSelected());

    this.dialog.appendChild(header);
    this.dialog.appendChild(filters);
    this.dialog.appendChild(this.resultsList);
    this.dialog.appendChild(footer);
    this.backdrop.appendChild(this.dialog);
    container.appendChild(this.backdrop);
  }

  public updateResults(results: ConnectionSearchResult[]): void {
    this.results = results;
    this.selectedIndices.clear();
    this.renderResults();
  }

  public close(): void {
    this.backdrop.remove();
    this.options.onClose();
  }

  private performSearch(): void {
    const companyInput = this.dialog.querySelector('.cpd-company') as HTMLInputElement;
    const townInput = this.dialog.querySelector('.cpd-town') as HTMLInputElement;
    const maxInput = this.dialog.querySelector('.cpd-max') as HTMLInputElement;
    const roleCheckboxes = this.dialog.querySelectorAll('.cpd-role') as NodeListOf<HTMLInputElement>;

    let rolesMask = 0;
    roleCheckboxes.forEach(cb => {
      if (cb.checked) rolesMask |= parseInt(cb.dataset.role || '0');
    });

    this.resultsList.innerHTML = '<div style="color: #88aa99; font-size: 12px; text-align: center; padding: 40px;">Searching...</div>';

    this.options.onSearch(this.options.fluidId, this.options.direction, {
      company: companyInput.value || undefined,
      town: townInput.value || undefined,
      maxResults: parseInt(maxInput.value) || 20,
      roles: rolesMask || 255,
    });
  }

  private renderResults(): void {
    this.resultsList.innerHTML = '';

    if (this.results.length === 0) {
      this.resultsList.innerHTML = '<div style="color: #88aa99; font-size: 12px; text-align: center; padding: 40px;">No facilities found</div>';
      return;
    }

    for (let i = 0; i < this.results.length; i++) {
      const r = this.results[i];
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; align-items: center; gap: 8px; padding: 6px 4px;
        border-bottom: 1px solid rgba(74, 122, 106, 0.15); cursor: pointer;
      `;
      row.dataset.index = String(i);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.selectedIndices.has(i);
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.selectedIndices.add(i);
        } else {
          this.selectedIndices.delete(i);
        }
      };

      const info = document.createElement('div');
      info.style.cssText = 'flex: 1;';
      info.innerHTML = `
        <div style="color: #ddd; font-size: 12px;">${this.escapeHtml(r.facilityName)}</div>
        <div style="color: #88aa99; font-size: 10px;">${this.escapeHtml(r.companyName)}${r.price ? ` - $${r.price}` : ''}</div>
      `;

      row.appendChild(checkbox);
      row.appendChild(info);
      row.onclick = (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.onchange?.(new Event('change'));
        }
      };

      this.resultsList.appendChild(row);
    }
  }

  private selectAll(): void {
    for (let i = 0; i < this.results.length; i++) {
      this.selectedIndices.add(i);
    }
    this.renderResults();
  }

  private clearSelection(): void {
    this.selectedIndices.clear();
    this.renderResults();
  }

  private connectSelected(): void {
    const selected = Array.from(this.selectedIndices).map(i => this.results[i]).filter(Boolean);
    if (selected.length === 0) return;

    const coords = selected.map(r => ({ x: r.x, y: r.y }));
    this.options.onConnect(this.options.fluidId, this.options.direction, coords);
    this.close();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
