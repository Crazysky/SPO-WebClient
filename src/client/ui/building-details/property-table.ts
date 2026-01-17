/**
 * Property Table Component
 *
 * Renders tabular data like supply connections.
 */

import { BuildingConnectionData, BuildingSupplyData, BuildingPropertyValue } from '../../../shared/types';
import {
  formatCurrency,
  formatPercentage,
  formatNumber,
  PropertyDefinition,
  PropertyType,
  TableColumn,
} from '../../../shared/building-details';

/**
 * Render a connections table for a supply
 */
export function renderConnectionsTable(
  supply: BuildingSupplyData,
  onConnectionClick?: (x: number, y: number) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'property-table-container';

  // Header with supply info
  const header = document.createElement('div');
  header.className = 'supply-header';
  header.innerHTML = `
    <div class="supply-name">${escapeHtml(supply.name)}</div>
    <div class="supply-info">
      <span class="supply-fluid">${escapeHtml(supply.metaFluid)}</span>
      <span class="supply-value">${escapeHtml(supply.fluidValue)}</span>
      <span class="supply-count">${supply.connectionCount} connection${supply.connectionCount !== 1 ? 's' : ''}</span>
    </div>
  `;
  container.appendChild(header);

  if (supply.connections.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'table-empty';
    empty.textContent = 'No connections';
    container.appendChild(empty);
    return container;
  }

  // Table
  const table = document.createElement('table');
  table.className = 'property-table';

  // Table header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>Facility</th>
      <th>Company</th>
      <th>Price</th>
      <th>Quality</th>
      <th>Last</th>
      <th>Status</th>
    </tr>
  `;
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement('tbody');
  for (const conn of supply.connections) {
    const row = createConnectionRow(conn, onConnectionClick);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  container.appendChild(table);
  return container;
}

/**
 * Create a table row for a connection
 */
function createConnectionRow(
  conn: BuildingConnectionData,
  onConnectionClick?: (x: number, y: number) => void
): HTMLElement {
  const tr = document.createElement('tr');
  tr.className = conn.connected ? 'connection-active' : 'connection-inactive';

  // Facility name (clickable)
  const tdFacility = document.createElement('td');
  tdFacility.className = 'cell-facility';
  if (conn.x > 0 && conn.y > 0 && onConnectionClick) {
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = conn.facilityName || 'Unknown';
    link.onclick = (e) => {
      e.preventDefault();
      onConnectionClick(conn.x, conn.y);
    };
    tdFacility.appendChild(link);
  } else {
    tdFacility.textContent = conn.facilityName || 'Unknown';
  }
  tr.appendChild(tdFacility);

  // Company
  const tdCompany = document.createElement('td');
  tdCompany.className = 'cell-company';
  tdCompany.textContent = conn.companyName || '-';
  tr.appendChild(tdCompany);

  // Price
  const tdPrice = document.createElement('td');
  tdPrice.className = 'cell-price';
  const price = parseFloat(conn.price);
  tdPrice.textContent = isNaN(price) ? conn.price : formatCurrency(price);
  tr.appendChild(tdPrice);

  // Quality
  const tdQuality = document.createElement('td');
  tdQuality.className = 'cell-quality';
  tdQuality.textContent = conn.quality || '-';
  tr.appendChild(tdQuality);

  // Last value
  const tdLast = document.createElement('td');
  tdLast.className = 'cell-last';
  tdLast.textContent = conn.lastValue || '-';
  tr.appendChild(tdLast);

  // Status
  const tdStatus = document.createElement('td');
  tdStatus.className = 'cell-status';
  const statusSpan = document.createElement('span');
  statusSpan.className = conn.connected ? 'status-connected' : 'status-disconnected';
  statusSpan.textContent = conn.connected ? 'Active' : 'Off';
  tdStatus.appendChild(statusSpan);
  tr.appendChild(tdStatus);

  return tr;
}

/**
 * Render all supplies with nested tabs
 */
export function renderSuppliesWithTabs(
  supplies: BuildingSupplyData[],
  onConnectionClick?: (x: number, y: number) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'supplies-container';

  if (supplies.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'supplies-empty';
    empty.textContent = 'No supplies configured';
    container.appendChild(empty);
    return container;
  }

  if (supplies.length === 1) {
    // Single supply - no tabs needed
    container.appendChild(renderConnectionsTable(supplies[0], onConnectionClick));
    return container;
  }

  // Multiple supplies - use tabs
  const tabsNav = document.createElement('div');
  tabsNav.className = 'nested-tabs-nav';

  const tabsContent = document.createElement('div');
  tabsContent.className = 'nested-tabs-content';

  supplies.forEach((supply, index) => {
    // Tab button
    const tabBtn = document.createElement('button');
    tabBtn.className = 'nested-tab-btn' + (index === 0 ? ' active' : '');
    tabBtn.textContent = supply.name || `Supply ${index + 1}`;
    tabBtn.dataset.index = index.toString();

    // Tab content
    const tabPane = document.createElement('div');
    tabPane.className = 'nested-tab-pane' + (index === 0 ? ' active' : '');
    tabPane.dataset.index = index.toString();
    tabPane.appendChild(renderConnectionsTable(supply, onConnectionClick));

    // Click handler
    tabBtn.onclick = () => {
      // Deactivate all
      tabsNav.querySelectorAll('.nested-tab-btn').forEach(btn => btn.classList.remove('active'));
      tabsContent.querySelectorAll('.nested-tab-pane').forEach(pane => pane.classList.remove('active'));

      // Activate clicked
      tabBtn.classList.add('active');
      tabPane.classList.add('active');
    };

    tabsNav.appendChild(tabBtn);
    tabsContent.appendChild(tabPane);
  });

  container.appendChild(tabsNav);
  container.appendChild(tabsContent);

  return container;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
