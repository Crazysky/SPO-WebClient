/**
 * Building Details Property Templates
 *
 * Maps VisualClass IDs to building templates (categories) that define which properties to fetch.
 * Each template represents a building category (Retail, Industry, Public Service, etc.)
 */

import { start } from 'repl';
import { BuildingTemplate, PropertyGroup } from './property-definitions';
import {
  OVERVIEW_GROUP,  
  WORKFORCE_GROUP,
  SUPPLIES_GROUP,
  SERVICES_GROUP,
  UPGRADE_GROUP,
  FINANCES_GROUP,
  ADVERTISEMENT_GROUP,
  TOWN_GROUP,
  COVERAGE_GROUP,
  TRADE_GROUP,
  GENERIC_GROUP,
  LOCAL_SERVICES_GROUP,
} from './template-groups';

// =============================================================================
// BUILDING CATEGORY TEMPLATES
// Each template defines a category of buildings with their associated property groups
// =============================================================================

/**
 * Public Service buildings (government, utilities, etc.)
 */
export const PUBLIC_SERVICE: BuildingTemplate = {
  visualClassIds: [
    // Add Public Service visualClass IDs here
  ],
  name: 'Public Service',
  groups: [
    OVERVIEW_GROUP,    
    WORKFORCE_GROUP,
    UPGRADE_GROUP,
  ],
};

/**
 * Retail buildings (shops, stores, commerce)
 */
export const RETAIL: BuildingTemplate = {
  visualClassIds: [
    '4702',  // Drug Store
    // Add other retail visualClass IDs here
  ],
  name: 'Retail',
  groups: [
    OVERVIEW_GROUP,
    SUPPLIES_GROUP,
    SERVICES_GROUP,
    WORKFORCE_GROUP,
    UPGRADE_GROUP,
  ],
};

/**
 * Industry buildings (factories, farms, processing plants)
 */
export const INDUSTRY: BuildingTemplate = {
  visualClassIds: [
    // Add Industry visualClass IDs here
  ],
  name: 'Industry',
  groups: [
    OVERVIEW_GROUP,
    SUPPLIES_GROUP,
    WORKFORCE_GROUP,
    TRADE_GROUP,
    UPGRADE_GROUP,
    FINANCES_GROUP,
  ],
};

/**
 * Trade buildings (warehouses, trade centers)
 */
export const TRADE: BuildingTemplate = {
  visualClassIds: [
    // Add Trade visualClass IDs here
  ],
  name: 'Trade',
  groups: [
    OVERVIEW_GROUP,
    TRADE_GROUP,
    SUPPLIES_GROUP,
    UPGRADE_GROUP,
    FINANCES_GROUP,
  ],
};

/**
 * Residential buildings (apartments, houses)
 */
export const RESIDENTIAL: BuildingTemplate = {
  visualClassIds: [
    // Add Residential visualClass IDs here
  ],
  name: 'Residential',
  groups: [
    OVERVIEW_GROUP,
    LOCAL_SERVICES_GROUP,
    COVERAGE_GROUP,
    TOWN_GROUP,
    UPGRADE_GROUP,
    FINANCES_GROUP,
  ],
};

/**
 * Office buildings (headquarters, business centers)
 */
export const OFFICE: BuildingTemplate = {
  visualClassIds: [
    // Add Office visualClass IDs here
  ],
  name: 'Office',
  groups: [
    OVERVIEW_GROUP,
    WORKFORCE_GROUP,
    UPGRADE_GROUP,
    FINANCES_GROUP,
  ],
};

// =============================================================================
// GENERIC FALLBACK TEMPLATE
// =============================================================================

/**
 * Generic template for unknown building types
 */
export const GENERIC_TEMPLATE: BuildingTemplate = {
  visualClassIds: ['*'], // Matches any
  name: 'Building',
  groups: [
    GENERIC_GROUP,
    WORKFORCE_GROUP,
    UPGRADE_GROUP,    
  ],
};

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

/**
 * All registered templates (categories)
 * Order matters: first match wins, GENERIC_TEMPLATE should be last
 */
export const BUILDING_TEMPLATES: BuildingTemplate[] = [
  PUBLIC_SERVICE,
  RETAIL,
  INDUSTRY,
  TRADE,
  RESIDENTIAL,
  OFFICE,
  GENERIC_TEMPLATE, // Always last as fallback
];

/**
 * Template lookup cache by visualClassId
 */
const templateCache: Map<string, BuildingTemplate> = new Map();

/**
 * Register a visualClassId to a template
 */
export function registerTemplateMapping(visualClassId: string, template: BuildingTemplate): void {
  if (!template.visualClassIds.includes(visualClassId)) {
    template.visualClassIds.push(visualClassId);
  }
  templateCache.set(visualClassId, template);
}

/**
 * Get template for a visualClassId
 * Returns GENERIC_TEMPLATE if no specific template is found
 */
export function getTemplateForVisualClass(visualClassId: string): BuildingTemplate {
  // Check cache first
  if (templateCache.has(visualClassId)) {
    return templateCache.get(visualClassId)!;
  }

  // Search registered templates
  for (const template of BUILDING_TEMPLATES) {
    if (template.visualClassIds.includes(visualClassId)) {
      templateCache.set(visualClassId, template);
      return template;
    }
  }

  // Return generic template for unknown types
  return GENERIC_TEMPLATE;
}

/**
 * Get template by name
 */
export function getTemplateByName(name: string): BuildingTemplate | undefined {
  return BUILDING_TEMPLATES.find(t => t.name === name);
}

/**
 * Result of collecting property names, separating count properties from regular/indexed ones
 */
export interface CollectedPropertyNames {
  /** Regular (non-indexed) property names to fetch */
  regularProperties: string[];
  /** Count property names that need to be fetched first */
  countProperties: string[];
  /** Map of countProperty -> list of indexed property definitions that depend on it */
  indexedByCount: Map<string, IndexedPropertyInfo[]>;
}

/**
 * Info about an indexed property for dynamic fetching
 */
export interface IndexedPropertyInfo {
  rdoName: string;
  maxProperty?: string;
  columns?: { rdoSuffix: string }[];
  indexSuffix?: string;
}


/**
 * Collect all RDO property names needed for a template
 * Returns regular properties and count properties separately
 */
export function collectTemplatePropertyNames(template: BuildingTemplate): string[] {
  // For backward compatibility, return all names including indexed with max 10
  const collected = collectTemplatePropertyNamesStructured(template);
  const names: Set<string> = new Set(collected.regularProperties);

  // Add count properties
  for (const countProp of collected.countProperties) {
    names.add(countProp);
  }

  // Add indexed properties with indices 0-9 as fallback
  for (const [, indexedProps] of collected.indexedByCount) {
    for (const prop of indexedProps) {
      for (let i = 0; i < 10; i++) {
        names.add(`${prop.rdoName}${i}`);
        if (prop.maxProperty) {
          names.add(`${prop.maxProperty}${i}`);
        }
        if (prop.columns) {
          for (const col of prop.columns) {
            names.add(`${col.rdoSuffix}${i}`);
          }
        }
      }
    }
  }

  return Array.from(names);
}

/**
 * Collect property names with structured output for two-phase fetching
 */
export function collectTemplatePropertyNamesStructured(template: BuildingTemplate): CollectedPropertyNames {
  const regularProperties: Set<string> = new Set();
  const countProperties: Set<string> = new Set();
  const indexedByCount: Map<string, IndexedPropertyInfo[]> = new Map();

  for (const group of template.groups) {
    collectGroupPropertyNamesStructured(group, regularProperties, countProperties, indexedByCount);
  }

  return {
    regularProperties: Array.from(regularProperties),
    countProperties: Array.from(countProperties),
    indexedByCount,
  };
}

/**
 * Helper to collect property names from a group with structured output
 */
function collectGroupPropertyNamesStructured(
  group: PropertyGroup,
  regularProperties: Set<string>,
  countProperties: Set<string>,
  indexedByCount: Map<string, IndexedPropertyInfo[]>
): void {
  for (const prop of group.properties) {
    const suffix = prop.indexSuffix || '';

    // Handle WORKFORCE_TABLE type specially
    if (prop.type === 'WORKFORCE_TABLE') {
      // Add all workforce properties for 3 worker classes (0, 1, 2)
      for (let i = 0; i < 3; i++) {
        regularProperties.add(`Workers${i}`);
        regularProperties.add(`WorkersMax${i}`);
        regularProperties.add(`WorkersK${i}`);
        regularProperties.add(`Salaries${i}`);
        regularProperties.add(`WorkForcePrice${i}`);
      }
      continue;
    }

    if (prop.indexed && prop.countProperty) {
      // Indexed property with count - add to structured map
      countProperties.add(prop.countProperty);
      if (!indexedByCount.has(prop.countProperty)) {
        indexedByCount.set(prop.countProperty, []);
      }

      indexedByCount.get(prop.countProperty)!.push({
        rdoName: prop.rdoName,
        maxProperty: prop.maxProperty,
        columns: prop.columns,
        indexSuffix: suffix,
      });
    } else if (prop.indexed && prop.indexMax !== undefined) {
      // Indexed property with fixed max - add all indices as regular
      for (let i = 0; i <= prop.indexMax; i++) {
        regularProperties.add(`${prop.rdoName}${i}${suffix}`);
        if (prop.maxProperty) {
          regularProperties.add(`${prop.maxProperty}${i}${suffix}`);
        }
      }
    } else {
      // Regular property
      regularProperties.add(prop.rdoName);
      if (prop.maxProperty) {
        regularProperties.add(prop.maxProperty);
      }
    }

    // For table columns without count property, add indices 0-9
    if (prop.columns && !prop.countProperty) {
      for (let i = 0; i < 10; i++) {
        for (const col of prop.columns) {
          regularProperties.add(`${col.rdoSuffix}${i}${suffix}`);
        }
      }
    }
  }

  // Recurse into subgroups
  if (group.subGroups) {
    for (const subGroup of group.subGroups) {
      collectGroupPropertyNamesStructured(subGroup, regularProperties, countProperties, indexedByCount);
    }
  }
}


/**
 * Initialize the template cache from visualClassIds arrays.
 * Call this once at startup to build the lookup cache.
 */
export function initializeTemplateCache(): void {
  for (const template of BUILDING_TEMPLATES) {
    for (const visualClassId of template.visualClassIds) {
      if (visualClassId !== '*') {
        templateCache.set(visualClassId, template);
      }
    }
  }
}

/**
 * Add a visualClassId to a template dynamically
 * @param visualClassId The visualClass ID to add
 * @param templateName The name of the template to add it to
 */
export function addVisualClassToTemplate(visualClassId: string, templateName: string): boolean {
  const template = getTemplateByName(templateName);
  if (!template) {
    return false;
  }
  if (!template.visualClassIds.includes(visualClassId)) {
    template.visualClassIds.push(visualClassId);
  }
  templateCache.set(visualClassId, template);
  return true;
}
