/**
 * Building Details Property Definitions
 *
 * Defines the types and interfaces for the building details system.
 * Properties are fetched from the game server via RDO protocol.
 */

/**
 * Property value types for rendering
 */
export enum PropertyType {
  /** Simple text display */
  TEXT = 'TEXT',
  /** Formatted number with optional unit */
  NUMBER = 'NUMBER',
  /** Dollar formatting ($1,234.56) */
  CURRENCY = 'CURRENCY',
  /** 0-100% with color coding */
  PERCENTAGE = 'PERCENTAGE',
  /** x/y format (e.g., workers 4/5) */
  RATIO = 'RATIO',
  /** Numeric value that can be SET (salaries, prices) */
  SLIDER = 'SLIDER',
  /** Time-series sparkline */
  GRAPH = 'GRAPH',
  /** Multi-column data table */
  TABLE = 'TABLE',
  /** Link to another building (x, y coordinates) */
  CONNECTION = 'CONNECTION',
  /** Boolean yes/no display */
  BOOLEAN = 'BOOLEAN',
  /** Workforce table (3 columns: Executives, Professionals, Workers) */
  WORKFORCE_TABLE = 'WORKFORCE_TABLE',
  /** Upgrade action controls (downgrade, start upgrade, stop upgrade buttons) */
  UPGRADE_ACTIONS = 'UPGRADE_ACTIONS',
}

/**
 * Color coding for property values
 */
export type ColorCode = 'positive' | 'negative' | 'neutral' | 'auto';

/**
 * Definition of a single property to fetch and display
 */
export interface PropertyDefinition {
  /** RDO property name as sent to server */
  rdoName: string;
  /** Display label in UI */
  displayName: string;
  /** How to render the value */
  type: PropertyType;
  /** Unit suffix (e.g., "kg/day", "%", "years") */
  unit?: string;
  /** Can user change this value via slider? */
  editable?: boolean;
  /** Color coding rule */
  colorCode?: ColorCode;
  /** Is this an indexed property (e.g., Workers0, Workers1, Workers2)? */
  indexed?: boolean;
  /** For indexed: how many indices (0, 1, 2 = 3 indices) */
  indexMax?: number;
  /** RDO property that provides the count for dynamic indexing */
  countProperty?: string;
  /** For indexed: suffix to append (e.g., ".0" for cInput0.0, covName0.0) */
  indexSuffix?: string;
  /** For SLIDER: minimum value */
  min?: number;
  /** For SLIDER: maximum value */
  max?: number;
  /** For SLIDER: step increment */
  step?: number;
  /** For RATIO: the "max" property name (e.g., WorkersMax0 for Workers0) */
  maxProperty?: string;
  /** For TABLE: column definitions */
  columns?: TableColumn[];
  /** Tooltip/help text */
  tooltip?: string;
  /** Whether to hide if value is empty */
  hideEmpty?: boolean;
}

/**
 * Table column definition for TABLE type properties
 */
export interface TableColumn {
  /** RDO property name suffix (e.g., "cnxFacilityName" becomes "cnxFacilityName0") */
  rdoSuffix: string;
  /** Column header label */
  label: string;
  /** Column type for formatting */
  type: PropertyType;
  /** Column width (CSS value) */
  width?: string;
}

/**
 * Property group for organizing properties into tabs
 */
export interface PropertyGroup {
  /** Unique identifier */
  id: string;
  /** Tab display name */
  name: string;
  /** Tab icon (emoji or icon class) */
  icon: string;
  /** Sort order (lower = first) */
  order: number;
  /** Properties in this group */
  properties: PropertyDefinition[];
  /** Nested sub-groups (tabs within tabs) */
  subGroups?: PropertyGroup[];
  /** Whether this group requires special handling (e.g., supplies need SetPath) */
  special?: 'supplies' | 'services' | 'workforce' | 'connections' | 'town';
}

/**
 * Template defining which properties to fetch for a building type.
 * The template itself represents a building category (e.g., Retail, Industry, Public Service).
 */
export interface BuildingTemplate {
  /** VisualClass IDs this template applies to */
  visualClassIds: string[];
  /** Template/category display name */
  name: string;
  /** Property groups (tabs) */
  groups: PropertyGroup[];
}

/**
 * Format a currency value
 */
export function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0';

  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum >= 1e9) {
    return `${sign}$${(absNum / 1e9).toFixed(2)}B`;
  } else if (absNum >= 1e6) {
    return `${sign}$${(absNum / 1e6).toFixed(2)}M`;
  } else if (absNum >= 1e3) {
    return `${sign}$${(absNum / 1e3).toFixed(2)}K`;
  }

  return `${sign}$${absNum.toFixed(2)}`;
}

/**
 * Format a percentage value
 */
export function formatPercentage(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0%';
  return `${num.toFixed(0)}%`;
}

/**
 * Format a number with optional unit
 */
export function formatNumber(value: number | string, unit?: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';

  let formatted: string;
  if (Math.abs(num) >= 1e6) {
    formatted = `${(num / 1e6).toFixed(2)}M`;
  } else if (Math.abs(num) >= 1e3) {
    formatted = `${(num / 1e3).toFixed(2)}K`;
  } else if (Number.isInteger(num)) {
    formatted = num.toString();
  } else {
    formatted = num.toFixed(2);
  }

  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Parse a tab-separated response into property values
 */
export function parsePropertyResponse(
  response: string,
  propertyNames: string[]
): Map<string, string> {
  const values = response.split('\t');
  const result = new Map<string, string>();

  for (let i = 0; i < propertyNames.length; i++) {
    if (i < values.length) {
      result.set(propertyNames[i], values[i].trim());
    }
  }

  return result;
}
