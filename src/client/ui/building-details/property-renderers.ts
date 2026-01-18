/**
 * Property Renderers
 *
 * Functions to render different property types into HTML elements.
 */

import {
  PropertyType,
  PropertyDefinition,
  formatCurrency,
  formatPercentage,
  formatNumber,
} from '../../../shared/building-details';
import { BuildingPropertyValue } from '../../../shared/types';

/**
 * Get color class based on value
 */
function getColorClass(value: number, colorCode?: string): string {
  if (colorCode === 'positive') return 'text-success';
  if (colorCode === 'negative') return 'text-error';
  if (colorCode === 'neutral') return 'text-muted';
  if (colorCode === 'auto') {
    if (value > 0) return 'text-success';
    if (value < 0) return 'text-error';
    return 'text-muted';
  }
  return '';
}

/**
 * Render a text property
 */
export function renderTextProperty(value: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'property-value property-text';
  span.textContent = value || '-';
  return span;
}

/**
 * Render a number property
 */
export function renderNumberProperty(
  value: string,
  definition: PropertyDefinition
): HTMLElement {
  const span = document.createElement('span');
  span.className = 'property-value property-number';

  const num = parseFloat(value);
  if (isNaN(num)) {
    span.textContent = value || '0';
  } else {
    span.textContent = formatNumber(num, definition.unit);
    const colorClass = getColorClass(num, definition.colorCode);
    if (colorClass) span.classList.add(colorClass);
  }

  return span;
}

/**
 * Render a currency property
 */
export function renderCurrencyProperty(
  value: string,
  definition: PropertyDefinition
): HTMLElement {
  const span = document.createElement('span');
  span.className = 'property-value property-currency';

  const num = parseFloat(value);
  span.textContent = formatCurrency(num);

  const colorClass = getColorClass(num, definition.colorCode);
  if (colorClass) span.classList.add(colorClass);

  return span;
}

/**
 * Render a percentage property
 */
export function renderPercentageProperty(
  value: string,
  definition: PropertyDefinition
): HTMLElement {
  const span = document.createElement('span');
  span.className = 'property-value property-percentage';

  const num = parseFloat(value);
  span.textContent = formatPercentage(num);

  const colorClass = getColorClass(num, definition.colorCode);
  if (colorClass) span.classList.add(colorClass);

  return span;
}

/**
 * Render a ratio property (current/max)
 */
export function renderRatioProperty(
  value: string,
  maxValue: string | undefined
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'property-value property-ratio';

  const current = parseFloat(value) || 0;
  const max = maxValue ? parseFloat(maxValue) || 0 : 0;
  const percentage = max > 0 ? (current / max) * 100 : 0;

  // Progress bar
  const bar = document.createElement('div');
  bar.className = 'ratio-bar';
  bar.innerHTML = `
    <div class="ratio-fill" style="width: ${Math.min(100, percentage)}%"></div>
  `;

  // Text
  const text = document.createElement('span');
  text.className = 'ratio-text';
  text.textContent = max > 0 ? `${current}/${max}` : `${current}`;

  container.appendChild(bar);
  container.appendChild(text);

  return container;
}

/**
 * Render a boolean property
 */
export function renderBooleanProperty(value: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'property-value property-boolean';

  const isTrue = value === '1' || value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
  span.textContent = isTrue ? 'Yes' : 'No';
  span.classList.add(isTrue ? 'text-success' : 'text-muted');

  return span;
}

/**
 * Render a property row (label + value)
 */
export function renderPropertyRow(
  definition: PropertyDefinition,
  propertyValue: BuildingPropertyValue,
  maxValue?: string,
  onSliderChange?: (value: number) => void
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'property-row';

  // Label
  const label = document.createElement('div');
  label.className = 'property-label';
  label.textContent = definition.displayName;
  if (definition.tooltip) {
    label.title = definition.tooltip;
  }
  row.appendChild(label);

  // Value
  let valueElement: HTMLElement;

  switch (definition.type) {
    case PropertyType.TEXT:
      valueElement = renderTextProperty(propertyValue.value);
      break;

    case PropertyType.NUMBER:
      valueElement = renderNumberProperty(propertyValue.value, definition);
      break;

    case PropertyType.CURRENCY:
      valueElement = renderCurrencyProperty(propertyValue.value, definition);
      break;

    case PropertyType.PERCENTAGE:
      valueElement = renderPercentageProperty(propertyValue.value, definition);
      break;

    case PropertyType.RATIO:
      valueElement = renderRatioProperty(propertyValue.value, maxValue);
      break;

    case PropertyType.BOOLEAN:
      valueElement = renderBooleanProperty(propertyValue.value);
      break;

    case PropertyType.SLIDER:
      valueElement = renderSliderProperty(
        propertyValue.value,
        definition,
        onSliderChange
      );
      break;

    default:
      valueElement = renderTextProperty(propertyValue.value);
  }

  row.appendChild(valueElement);
  return row;
}

/**
 * Render a slider property (for editable values)
 */
export function renderSliderProperty(
  value: string,
  definition: PropertyDefinition,
  onChange?: (value: number) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'property-slider-container';

  const num = parseFloat(value) || 0;
  const min = definition.min ?? 0;
  const max = definition.max ?? 300;
  const step = definition.step ?? 5;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'property-slider';
  slider.min = min.toString();
  slider.max = max.toString();
  slider.step = step.toString();
  slider.value = num.toString();

  const valueDisplay = document.createElement('span');
  valueDisplay.className = 'slider-value';
  valueDisplay.textContent = definition.unit ? `${num}${definition.unit}` : num.toString();

  // Update display while dragging
  slider.oninput = () => {
    const newVal = parseFloat(slider.value);
    valueDisplay.textContent = definition.unit ? `${newVal}${definition.unit}` : newVal.toString();
  };

  // Handle value change - use multiple events for cross-browser compatibility
  const handleChange = () => {
    const newVal = parseFloat(slider.value);
    if (onChange) {
      onChange(newVal);
    }
  };

  // Multiple events to ensure it fires across different browsers and input methods
  slider.onchange = handleChange;
  slider.addEventListener('change', handleChange);
  slider.addEventListener('mouseup', handleChange);
  slider.addEventListener('touchend', handleChange);

  container.appendChild(slider);
  container.appendChild(valueDisplay);
  return container;
}


/**
 * Render workforce table (3 worker classes × multiple properties)
 * Format: Label | Executives | Professionals | Workers
 * Rows: Jobs, Work Force Quality, Salaries (editable)
 */
export function renderWorkforceTable(
  properties: BuildingPropertyValue[],
  onPropertyChange?: (propertyName: string, value: number) => void
): HTMLElement {
  const table = document.createElement('table');
  table.className = 'workforce-table';

  // Create value map for easy lookup
  const valueMap = new Map<string, string>();
  for (const prop of properties) {
    valueMap.set(prop.name, prop.value);
  }

  // Helper to get value or default
  const getValue = (name: string): string => valueMap.get(name) || '0';
  const getNumValue = (name: string): number => parseFloat(getValue(name)) || 0;

  // Table header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th class="workforce-label-col"></th>
      <th class="workforce-class-col">Executives</th>
      <th class="workforce-class-col">Professionals</th>
      <th class="workforce-class-col">Workers</th>
    </tr>
  `;
  table.appendChild(thead);

  // Table body
  const tbody = document.createElement('tbody');

  // Row 1: Jobs (Workers/WorkersMax ratio)
  const jobsRow = document.createElement('tr');
  jobsRow.innerHTML = `<td class="workforce-label">Jobs</td>`;
  for (let i = 0; i < 3; i++) {
    const workers = getNumValue(`Workers${i}`);
    const workersMax = getNumValue(`WorkersMax${i}`);
    const td = document.createElement('td');
    td.className = 'workforce-value';

    // If WorkersMax is 0, leave cell empty
    if (workersMax === 0) {
      td.textContent = '';
    } else {
      td.textContent = `${workers}/${workersMax}`;
    }
    jobsRow.appendChild(td);
  }
  tbody.appendChild(jobsRow);

  // Row 2: Work Force Quality (WorkersK percentage)
  const qualityRow = document.createElement('tr');
  qualityRow.innerHTML = `<td class="workforce-label">Work Force Quality</td>`;
  for (let i = 0; i < 3; i++) {
    const workersMax = getNumValue(`WorkersMax${i}`);
    const quality = getNumValue(`WorkersK${i}`);
    const td = document.createElement('td');
    td.className = 'workforce-value';

    // If WorkersMax is 0, leave cell empty
    if (workersMax === 0) {
      td.textContent = '';
    } else {
      td.textContent = formatPercentage(quality);
    }
    qualityRow.appendChild(td);
  }
  tbody.appendChild(qualityRow);

  // Row 3: Salaries (WorkForcePrice with editable Salaries% input)
  const salariesRow = document.createElement('tr');
  salariesRow.innerHTML = `<td class="workforce-label">Salaries</td>`;

  for (let i = 0; i < 3; i++) {
    const workersMax = getNumValue(`WorkersMax${i}`);
    const workforcePrice = getNumValue(`WorkForcePrice${i}`);
    const salaryPercent = getNumValue(`Salaries${i}`);

    const td = document.createElement('td');
    td.className = 'workforce-value workforce-salary-cell';

    // Only populate cell if WorkersMax > 0
    if (workersMax > 0) {
      // Display: $value from server
      const priceSpan = document.createElement('span');
      priceSpan.className = 'workforce-salary-price';
      priceSpan.textContent = formatCurrency(workforcePrice);
      td.appendChild(priceSpan);

      // Editable input for salary percentage
      const inputContainer = document.createElement('div');
      inputContainer.className = 'workforce-salary-input';

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'salary-input';
      input.min = '0';
      input.max = '250';
      input.step = '1';
      input.value = salaryPercent.toString();
      input.setAttribute('value', salaryPercent.toString());

      const percentLabel = document.createElement('span');
      percentLabel.className = 'percent-label';
      percentLabel.textContent = '%';

      // Handle value change
      const handleChange = () => {
        let newVal = parseFloat(input.value);

        // Validate range
        if (isNaN(newVal)) newVal = 0;
        if (newVal < 0) newVal = 0;
        if (newVal > 250) newVal = 250;

        // Update input if corrected
        if (newVal !== parseFloat(input.value)) {
          input.value = newVal.toString();
        }

        if (onPropertyChange) {
          onPropertyChange(`Salaries${i}`, newVal);
        }
      };

      input.addEventListener('change', handleChange);
      input.addEventListener('blur', handleChange);

      inputContainer.appendChild(input);
      inputContainer.appendChild(percentLabel);
      td.appendChild(inputContainer);
    }

    // Always append the cell (empty or populated)
    salariesRow.appendChild(td);
  }
  tbody.appendChild(salariesRow);

  table.appendChild(tbody);
  return table;
}

/**
 * Render a group of properties
 * Indexed properties with the same countProperty are grouped into nested tabs
 */
export function renderPropertyGroup(
  properties: BuildingPropertyValue[],
  definitions: PropertyDefinition[],
  onPropertyChange?: (propertyName: string, value: number) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'property-group';

  // Create a map for quick lookup
  const valueMap = new Map<string, string>();
  for (const prop of properties) {
    valueMap.set(prop.name, prop.value);
  }

  // Track rendered properties to avoid duplicates
  const renderedProperties = new Set<string>();

  for (const def of definitions) {
    // Handle WORKFORCE_TABLE type specially
    if (def.type === PropertyType.WORKFORCE_TABLE) {
      const workforceTable = renderWorkforceTable(properties, onPropertyChange);
      container.appendChild(workforceTable);

      // Mark all workforce properties as rendered
      for (let i = 0; i < 3; i++) {
        renderedProperties.add(`Workers${i}`);
        renderedProperties.add(`WorkersMax${i}`);
        renderedProperties.add(`WorkersK${i}`);
        renderedProperties.add(`Salaries${i}`);
        renderedProperties.add(`WorkForcePrice${i}`);
      }
      continue;
    }

    // Handle UPGRADE_ACTIONS type specially
    if (def.type === PropertyType.UPGRADE_ACTIONS) {
      // Note: We'll pass the callback through the container's dataset
      // The building-details-panel will set up the actual handler
      const actionsElement = renderUpgradeActions(properties);
      container.appendChild(actionsElement);

      // Mark upgrade properties as rendered
      renderedProperties.add('UpgradeLevel');
      renderedProperties.add('MaxUpgrade');
      renderedProperties.add('NextUpgCost');
      renderedProperties.add('Upgrading');
      renderedProperties.add('Pending');
      renderedProperties.add('UpgradeActions');
      continue;
    }

    const suffix = def.indexSuffix || '';

    if (def.indexed && def.countProperty) {
      // Find all values for this indexed property with the same base name
      const indexedValues: BuildingPropertyValue[] = [];
      
      for (const prop of properties) {
        // Match base name with suffix (escape dots in regex)
        const escapedSuffix = suffix.replace(/\./g, '\\.');
        const regex = new RegExp(`^${def.rdoName}(\\d+)${escapedSuffix}$`);
        const match = prop.name.match(regex);
        
        if (match) {
          indexedValues.push(prop);
          renderedProperties.add(prop.name);
        }
      }

      // Only render if we have values
      if (indexedValues.length > 0) {
        // For indexed properties with single value, render as simple property rows
        if (indexedValues.length === 1) {
          for (const indexedValue of indexedValues) {
            const itemDef: PropertyDefinition = {
              ...def,
              displayName: `${def.displayName}`,
              indexed: false,
            };
            
            // Get max value if it's a ratio type
            let maxValue: string | undefined;
            if (def.type === PropertyType.RATIO && def.maxProperty) {
              const maxPropName = `${def.maxProperty}${indexedValue.index ?? 0}${suffix}`;
              maxValue = valueMap.get(maxPropName);
              if (maxValue) {
                renderedProperties.add(maxPropName);
              }
            }
            
            const row = renderPropertyRow(
              itemDef,
              indexedValue,
              maxValue,
              onPropertyChange ? (val) => onPropertyChange(indexedValue.name, val) : undefined
            );
            
            container.appendChild(row);
          }
        } else {
          // Multiple values: render as grouped section with sub-items
          const groupContainer = document.createElement('div');
          groupContainer.className = 'indexed-property-group';
          
          const groupLabel = document.createElement('div');
          groupLabel.className = 'property-group-label';
          groupLabel.textContent = def.displayName;
          groupContainer.appendChild(groupLabel);
          
          const itemsContainer = document.createElement('div');
          itemsContainer.className = 'indexed-items-list';
          
          for (const indexedValue of indexedValues) {
            const itemDef: PropertyDefinition = {
              ...def,
              displayName: `${def.displayName} ${indexedValue.index ?? ''}`,
              indexed: false,
            };
            
            // Get max value if it's a ratio type
            let maxValue: string | undefined;
            if (def.type === PropertyType.RATIO && def.maxProperty) {
              const maxPropName = `${def.maxProperty}${indexedValue.index ?? 0}${suffix}`;
              maxValue = valueMap.get(maxPropName);
              if (maxValue) {
                renderedProperties.add(maxPropName);
              }
            }
            
            const row = renderPropertyRow(
              itemDef,
              indexedValue,
              maxValue,
              onPropertyChange ? (val) => onPropertyChange(indexedValue.name, val) : undefined
            );
            
            itemsContainer.appendChild(row);
          }
          
          groupContainer.appendChild(itemsContainer);
          container.appendChild(groupContainer);
        }
      }
    } else if (def.indexed && !def.countProperty) {
      // Fixed index range
      const indexedValues: BuildingPropertyValue[] = [];
      
      for (let i = 0; i <= (def.indexMax || 9); i++) {
        const propName = `${def.rdoName}${i}${suffix}`;
        const value = valueMap.get(propName);
        
        if (value) {
          indexedValues.push({ name: propName, value, index: i });
          renderedProperties.add(propName);
        }
      }

      if (indexedValues.length > 0) {
        // Render each as property row
        for (const indexedValue of indexedValues) {
          const itemDef: PropertyDefinition = {
            ...def,
            displayName: `${def.displayName} ${indexedValue.index ?? ''}`,
            indexed: false,
          };
          
          // Get max value if it's a ratio type
          let maxValue: string | undefined;
          if (def.type === PropertyType.RATIO && def.maxProperty) {
            const maxPropName = `${def.maxProperty}${indexedValue.index ?? 0}${suffix}`;
            maxValue = valueMap.get(maxPropName);
            if (maxValue) {
              renderedProperties.add(maxPropName);
            }
          }
          
          const row = renderPropertyRow(
            itemDef,
            indexedValue,
            maxValue,
            onPropertyChange ? (val) => onPropertyChange(indexedValue.name, val) : undefined
          );
          
          container.appendChild(row);
        }
      }
    } else {
      // Regular property (non-indexed)
      const value = valueMap.get(def.rdoName);

      if (value !== undefined) {
        // Skip rendering property rows with hideEmpty flag (but keep them available in properties array)
        // Exception: upgrade properties are needed by UPGRADE_ACTIONS component
        const isUpgradeProperty = ['UpgradeLevel', 'MaxUpgrade', 'NextUpgCost', 'Upgrading', 'Pending'].includes(def.rdoName);

        if (def.hideEmpty && !isUpgradeProperty && (!value || value.trim() === '' || value === '0')) {
          continue;
        }

        // Don't render property rows for upgrade properties (they're used by UPGRADE_ACTIONS)
        if (isUpgradeProperty) {
          renderedProperties.add(def.rdoName);
          continue;
        }

        renderedProperties.add(def.rdoName);
        
        const propValue: BuildingPropertyValue = {
          name: def.rdoName,
          value: value,
        };
        
        // Get max value if it's a ratio type
        let maxValue: string | undefined;
        if (def.type === PropertyType.RATIO && def.maxProperty) {
          maxValue = valueMap.get(def.maxProperty);
          if (maxValue) {
            renderedProperties.add(def.maxProperty);
          }
        }
        
        const row = renderPropertyRow(
          def,
          propValue,
          maxValue,
          onPropertyChange ? (val) => onPropertyChange(def.rdoName, val) : undefined
        );
        
        container.appendChild(row);
      }
    }
  }

  // Render any unmatched properties (fallback for debugging)
  for (const prop of properties) {
    if (!renderedProperties.has(prop.name)) {
      // Skip internal/metadata properties
      if (prop.name.startsWith('_') || prop.name === 'ObjectId' || prop.name === 'SecurityId') {
        continue;
      }
      
      const fallbackDef: PropertyDefinition = {
        rdoName: prop.name,
        displayName: prop.name,
        type: PropertyType.TEXT,
      };
      
      const row = renderPropertyRow(fallbackDef, prop);
      container.appendChild(row);
    }
  }

  return container;
}

/**
 * Render upgrade action controls
 * Simple design: Level display, Upgrade [qty][+][validate], Downgrade [-]
 */
export function renderUpgradeActions(
  properties: BuildingPropertyValue[],
  onAction?: (action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE', count?: number) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'upgrade-actions-container';

  // Get current upgrade state
  const valueMap = new Map<string, string>();
  for (const prop of properties) {
    valueMap.set(prop.name, prop.value);
  }

  const isUpgrading = valueMap.get('Upgrading') === '1' || valueMap.get('Upgrading')?.toLowerCase() === 'yes';
  const currentLevel = parseInt(valueMap.get('UpgradeLevel') || '0');
  const maxLevel = parseInt(valueMap.get('MaxUpgrade') || '0');
  const pending = parseInt(valueMap.get('Pending') || '0');

  // Level display: "Level X/Y" or "Level X(+N)/Y" if upgrading
  const levelText = document.createElement('div');
  levelText.className = 'upgrade-level-text';
  if (isUpgrading && pending > 0) {
    levelText.innerHTML = `Level ${currentLevel}<span class="upgrade-pending">(+${pending})</span>/${maxLevel}`;
  } else {
    levelText.textContent = `Level ${currentLevel}/${maxLevel}`;
  }
  container.appendChild(levelText);

  // Upgrade row: Upgrade [qty] [+] [VALIDATE]
  const upgradeRow = document.createElement('div');
  upgradeRow.className = 'upgrade-row';

  const upgradeLabel = document.createElement('span');
  upgradeLabel.className = 'upgrade-label';
  upgradeLabel.textContent = 'Upgrade';

  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.className = 'upgrade-qty-input';
  qtyInput.min = '1';
  qtyInput.max = Math.max(1, maxLevel - currentLevel).toString();
  qtyInput.value = '1';
  qtyInput.disabled = currentLevel >= maxLevel;

  const incrementBtn = document.createElement('button');
  incrementBtn.className = 'upgrade-increment-btn';
  incrementBtn.textContent = '+';
  incrementBtn.disabled = currentLevel >= maxLevel;
  incrementBtn.onclick = () => {
    const current = parseInt(qtyInput.value) || 1;
    const max = parseInt(qtyInput.max);
    if (current < max) {
      qtyInput.value = (current + 1).toString();
    }
  };

  const validateBtn = document.createElement('button');
  validateBtn.className = 'upgrade-validate-btn';
  validateBtn.textContent = 'VALIDATE';
  validateBtn.disabled = currentLevel >= maxLevel;
  validateBtn.onclick = () => {
    const count = parseInt(qtyInput.value) || 1;
    if (onAction && count > 0 && currentLevel < maxLevel) {
      onAction('START_UPGRADE', count);
    }
  };

  upgradeRow.appendChild(upgradeLabel);
  upgradeRow.appendChild(qtyInput);
  upgradeRow.appendChild(incrementBtn);
  upgradeRow.appendChild(validateBtn);
  container.appendChild(upgradeRow);

  // Downgrade row: Downgrade [-]
  const downgradeRow = document.createElement('div');
  downgradeRow.className = 'downgrade-row';

  const downgradeLabel = document.createElement('span');
  downgradeLabel.className = 'downgrade-label';
  downgradeLabel.textContent = 'Downgrade';

  const downgradeBtn = document.createElement('button');
  downgradeBtn.className = 'downgrade-btn';
  downgradeBtn.textContent = '-';
  downgradeBtn.disabled = currentLevel <= 0;
  downgradeBtn.onclick = () => {
    if (onAction && currentLevel > 0) {
      onAction('DOWNGRADE');
    }
  };

  downgradeRow.appendChild(downgradeLabel);
  downgradeRow.appendChild(downgradeBtn);
  container.appendChild(downgradeRow);

  return container;
}


/**
 * Render indexed properties as nested tabs
 * Each index becomes a tab, containing all properties for that index
 */
function renderIndexedPropertyTabs(
  indices: number[],
  definitions: PropertyDefinition[],
  valueMap: Map<string, BuildingPropertyValue>,
  onPropertyChange?: (propertyName: string, value: number) => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'indexed-tabs-container';

  // Create tabs navigation
  const tabsNav = document.createElement('div');
  tabsNav.className = 'nested-tabs-nav';

  // Create tabs content container
  const tabsContent = document.createElement('div');
  tabsContent.className = 'nested-tabs-content';

  indices.forEach((rdoIndex, displayIndex) => {
    // Try to get a name for this tab from the first TEXT property
    const nameProperty = definitions.find(d => d.type === PropertyType.TEXT);
    let tabLabel = `#${displayIndex}`;
    if (nameProperty) {
      const namePv = valueMap.get(`${nameProperty.rdoName}${rdoIndex}`);
      if (namePv?.value) {
        tabLabel = namePv.value;
      }
    }

    // Tab button
    const tabBtn = document.createElement('button');
    tabBtn.className = 'nested-tab-btn' + (displayIndex === 0 ? ' active' : '');
    tabBtn.textContent = tabLabel;
    tabBtn.dataset.index = displayIndex.toString();

    // Tab content pane
    const tabPane = document.createElement('div');
    tabPane.className = 'nested-tab-pane' + (displayIndex === 0 ? ' active' : '');
    tabPane.dataset.index = displayIndex.toString();

    // Render all properties for this index
    for (const def of definitions) {
      const propName = `${def.rdoName}${rdoIndex}`;
      const pv = valueMap.get(propName);
      if (pv) {
        const maxName = def.maxProperty ? `${def.maxProperty}${rdoIndex}` : undefined;
        const maxVal = maxName ? valueMap.get(maxName)?.value : undefined;

        const row = renderPropertyRow(
          def,
          pv,
          maxVal,
          def.editable && onPropertyChange
            ? (val) => onPropertyChange(propName, val)
            : undefined
        );
        tabPane.appendChild(row);
      }
    }

    // Click handler for tab
    tabBtn.onclick = () => {
      // Deactivate all tabs
      tabsNav.querySelectorAll('.nested-tab-btn').forEach(btn => btn.classList.remove('active'));
      tabsContent.querySelectorAll('.nested-tab-pane').forEach(pane => pane.classList.remove('active'));

      // Activate clicked tab
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
