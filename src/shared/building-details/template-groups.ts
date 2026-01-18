/**
 * Building Details Template Groups
 *
 * Pre-defined property groups (tabs) that can be composed into building templates.
 * These are reusable building blocks for different building types.
 */

import { PropertyGroup, PropertyType, PropertyDefinition, TableColumn } from './property-definitions';

// =============================================================================
// CONNECTION TABLE COLUMNS
// =============================================================================

export const CONNECTION_COLUMNS: TableColumn[] = [
  { rdoSuffix: 'cnxFacilityName', label: 'Facility', type: PropertyType.TEXT, width: '30%' },
  { rdoSuffix: 'cnxCreatedBy', label: 'Owner', type: PropertyType.TEXT, width: '20%' },
  { rdoSuffix: 'cnxCompanyName', label: 'Company', type: PropertyType.TEXT, width: '30%' },
  { rdoSuffix: 'cnxNfPrice', label: 'Price', type: PropertyType.CURRENCY, width: '15%' },
  { rdoSuffix: 'OverPriceCnxInfo', label: 'Overpaid', type: PropertyType.CURRENCY, width: '15%' },
  { rdoSuffix: 'cnxQuality', label: 'Quality', type: PropertyType.PERCENTAGE, width: '10%' },
  { rdoSuffix: 'LastValueCnxInfo', label: 'Last', type: PropertyType.TEXT, width: '15%' },
  { rdoSuffix: 'tCostCnxInfo', label: 'T. Cost', type: PropertyType.BOOLEAN, width: '10%' },
  // Coordinates of the supplier - act as a shortcut for map.
  { rdoSuffix: 'cnxYPos', label: 'Coord. Y', type: PropertyType.NUMBER, width: '10%' },
  { rdoSuffix: 'cnxXPos', label: 'Coord. X', type: PropertyType.NUMBER, width: '10%' },
];

// =============================================================================
// OVERVIEW GROUP (Common to all buildings)
// =============================================================================

export const OVERVIEW_GROUP: PropertyGroup = {
  id: 'overview',
  name: 'Overview',
  icon: 'i',
  order: 0,
  properties: [
    { rdoName: 'Name', displayName: 'Building Name', type: PropertyType.TEXT },
    { rdoName: 'Creator', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'Years', displayName: 'Age', type: PropertyType.NUMBER, unit: 'years' },
    { rdoName: 'Cost', displayName: 'Value', type: PropertyType.CURRENCY },
    { rdoName: 'ROI', displayName: 'Return on Investment', type: PropertyType.PERCENTAGE, colorCode: 'auto' },
    { rdoName: 'Trouble', displayName: 'Status', type: PropertyType.NUMBER, hideEmpty: true },
  ],
};

// =============================================================================
// WORKFORCE GROUP (For buildings with employees)
// =============================================================================
// Workforce table - displays all worker classes in a 4-column table
// Columns: Label | Executives | Professionals | Workers
// Rows: Jobs (ratio), Work Force Quality (%), Salaries (editable %)

export const WORKFORCE_GROUP: PropertyGroup = {
  id: 'workforce',
  name: 'Workforce',
  icon: 'W',
  order: 10,
  special: 'workforce',
  properties: [
    {
      rdoName: 'WorkforceTable',
      displayName: 'Workforce Overview',
      type: PropertyType.WORKFORCE_TABLE,
    },
  ],
};

// =============================================================================
// SUPPLIES GROUP (For buildings with inputs)
// =============================================================================

export const SUPPLIES_GROUP: PropertyGroup = {
  id: 'supplies',
  name: 'Supplies',
  icon: 'S',
  order: 20,
  special: 'supplies',
  properties: [
    { rdoName: 'MetaFluid', displayName: 'Product', type: PropertyType.TEXT },
    { rdoName: 'FluidValue', displayName: 'Last Value', type: PropertyType.TEXT },
    { rdoName: 'LastCostPerc', displayName: 'Cost %', type: PropertyType.PERCENTAGE },
    { rdoName: 'minK', displayName: 'Min Quality', type: PropertyType.NUMBER, hideEmpty: true },
    { rdoName: 'MaxPrice', displayName: 'Max Price', type: PropertyType.SLIDER, editable: true, min: 0, max: 1000 },
    { rdoName: 'QPSorted', displayName: 'Sort by Q/P', type: PropertyType.TEXT, hideEmpty: true },
    { rdoName: 'cnxCount', displayName: 'Connections', type: PropertyType.NUMBER },
  ],
};

// =============================================================================
// SERVICES GROUP (For retail/commerce buildings)
// =============================================================================

export const SERVICES_GROUP: PropertyGroup = {
  id: 'services',
  name: 'Services',
  icon: '$',
  order: 30,
  special: 'services',
  properties: [
    {
      rdoName: 'srvNames',
      displayName: 'Product',
      type: PropertyType.TEXT,
      indexed: true,
	  indexSuffix: '.0',
      countProperty: 'ServiceCount',
    },
    {
      rdoName: 'srvPrices',
      displayName: 'Price',
      type: PropertyType.SLIDER,
      editable: true,
      indexed: true,
      min: 0,
      max: 500,
      step: 10,
      unit: '%',
      countProperty: 'ServiceCount',
    },
    {
      rdoName: 'srvSupplies',
      displayName: 'Offer',
      type: PropertyType.NUMBER,
      indexed: true,
      countProperty: 'ServiceCount',
    },
    {
      rdoName: 'srvDemands',
      displayName: 'Demand',
      type: PropertyType.NUMBER,
      indexed: true,
      countProperty: 'ServiceCount',
    },
    {
      rdoName: 'srvMarketPrices',
      displayName: 'Market Price',
      type: PropertyType.CURRENCY,
      indexed: true,
      countProperty: 'ServiceCount',
    },
    {
      rdoName: 'srvAvgPrices',
      displayName: 'Avg Price',
      type: PropertyType.CURRENCY,
      indexed: true,
      countProperty: 'ServiceCount',
    },
  ],
};

// =============================================================================
// UPGRADE GROUP (For buildings with upgrade capability)
// =============================================================================

export const UPGRADE_GROUP: PropertyGroup = {
  id: 'upgrade',
  name: 'Upgrade',
  icon: 'U',
  order: 40,
  properties: [
    { rdoName: 'UpgradeActions', displayName: 'Actions', type: PropertyType.UPGRADE_ACTIONS },
  ],
};

// =============================================================================
// FINANCES GROUP (Money graph)
// =============================================================================

export const FINANCES_GROUP: PropertyGroup = {
  id: 'finances',
  name: 'Finances',
  icon: 'F',
  order: 50,
  properties: [
    { rdoName: 'MoneyGraphInfo', displayName: 'Revenue History', type: PropertyType.GRAPH },
    { rdoName: 'MoneyGraph', displayName: 'Has Graph', type: PropertyType.BOOLEAN, hideEmpty: true },
  ],
};

// =============================================================================
// ADVERTISEMENT/INPUTS GROUP
// =============================================================================

export const ADVERTISEMENT_GROUP: PropertyGroup = {
  id: 'advertisement',
  name: 'Advertising',
  icon: 'A',
  order: 25,
  properties: [
    { rdoName: 'cInput', displayName: 'Services', type: PropertyType.TEXT, indexed: true,indexSuffix: '.0', countProperty: 'cInputCount' },
    { rdoName: 'cInputSup', displayName: 'Receiving', type: PropertyType.NUMBER, indexed: true },
    { rdoName: 'cInputDem', displayName: 'Requesting', type: PropertyType.NUMBER, indexed: true },
    { rdoName: 'cInputRatio', displayName: 'Ratio', type: PropertyType.PERCENTAGE, indexed: true },
    { rdoName: 'cInputMax', displayName: 'Max', type: PropertyType.NUMBER, indexed: true },
    { rdoName: 'cEditable', displayName: 'Editable', type: PropertyType.BOOLEAN, indexed: true },
    { rdoName: 'cUnits', displayName: 'Units', type: PropertyType.TEXT, indexed: true },
  ],
};

// =============================================================================
// TOWN/LOCATION GROUP
// =============================================================================

export const TOWN_GROUP: PropertyGroup = {
  id: 'town',
  name: 'Location',
  icon: 'L',
  order: 60,
  special: 'town',
  properties: [
    { rdoName: 'Town', displayName: 'Town', type: PropertyType.TEXT },
    { rdoName: 'TownName', displayName: 'Town Name', type: PropertyType.TEXT, hideEmpty: true },
    { rdoName: 'ActualRuler', displayName: 'Mayor', type: PropertyType.TEXT },
    { rdoName: 'TownQOL', displayName: 'Quality of Life', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'QOL', displayName: 'QoL', type: PropertyType.PERCENTAGE, hideEmpty: true },
  ],
};

// =============================================================================
// COVERAGE GROUP (Public services coverage)
// =============================================================================

export const COVERAGE_GROUP: PropertyGroup = {
  id: 'coverage',
  name: 'Coverage',
  icon: 'C',
  order: 70,
  properties: [
    { rdoName: 'covValue0', displayName: 'Colleges', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue1', displayName: 'Garbage Disposal', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue2', displayName: 'Fire Coverage', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue3', displayName: 'Health Coverage', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue4', displayName: 'Jails', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue5', displayName: 'Museums', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue6', displayName: 'Police Coverage', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue7', displayName: 'School Coverage', type: PropertyType.PERCENTAGE, hideEmpty: true },
    { rdoName: 'covValue8', displayName: 'Recreation', type: PropertyType.PERCENTAGE, hideEmpty: true },
  ],
};

// =============================================================================
// TRADE GROUP (For trade centers, warehouses)
// =============================================================================

export const TRADE_GROUP: PropertyGroup = {
  id: 'trade',
  name: 'Trade',
  icon: 'T',
  order: 35,
  properties: [
    { rdoName: 'TradeRole', displayName: 'Trade Role', type: PropertyType.NUMBER },
    { rdoName: 'TradeLevel', displayName: 'Trade Level', type: PropertyType.NUMBER },
    { rdoName: 'GateMap', displayName: 'Gate Map', type: PropertyType.NUMBER, hideEmpty: true },
  ],
};

// =============================================================================
// GENERIC FALLBACK GROUP
// =============================================================================

export const GENERIC_GROUP: PropertyGroup = {
  id: 'generic',
  name: 'Details',
  icon: 'D',
  order: 0,
  properties: [
    { rdoName: 'Name', displayName: 'Name', type: PropertyType.TEXT },
    { rdoName: 'Creator', displayName: 'Owner', type: PropertyType.TEXT },
    { rdoName: 'SecurityId', displayName: 'Security ID', type: PropertyType.TEXT },
    { rdoName: 'ObjectId', displayName: 'Object ID', type: PropertyType.TEXT, hideEmpty: true },
    { rdoName: 'CurrBlock', displayName: 'Block ID', type: PropertyType.TEXT, hideEmpty: true },
    { rdoName: 'Cost', displayName: 'Value', type: PropertyType.CURRENCY },
    { rdoName: 'ROI', displayName: 'ROI', type: PropertyType.PERCENTAGE, colorCode: 'auto' },
    { rdoName: 'Years', displayName: 'Age', type: PropertyType.NUMBER, unit: 'years' },
    { rdoName: 'Trouble', displayName: 'Trouble', type: PropertyType.NUMBER, hideEmpty: true },
  ],
};

// =============================================================================
// LOCAL SERVICES TABLE (QOS data for residential/town)
// =============================================================================

export const LOCAL_SERVICES_GROUP: PropertyGroup = {
  id: 'localServices',
  name: 'Services',
  icon: 'Q',
  order: 45,
  properties: [
    { rdoName: 'srvCount', displayName: 'Service Count', type: PropertyType.NUMBER },
    { rdoName: 'GQOS', displayName: 'Quality of Service', type: PropertyType.PERCENTAGE },
    {
      rdoName: 'svrName',
      displayName: 'Service',
      type: PropertyType.TABLE,
      indexed: true,
	  indexSuffix: '.0',
      countProperty: 'srvCount',
      columns: [
        { rdoSuffix: 'svrName', label: 'Service', type: PropertyType.TEXT, width: '25%' },
        { rdoSuffix: 'svrDemand', label: 'Demand', type: PropertyType.NUMBER, width: '12%' },
        { rdoSuffix: 'svrOffer', label: 'Offer', type: PropertyType.NUMBER, width: '12%' },
        { rdoSuffix: 'svrCapacity', label: 'Capacity', type: PropertyType.NUMBER, width: '12%' },
        { rdoSuffix: 'svrRatio', label: 'Ratio', type: PropertyType.PERCENTAGE, width: '12%' },
        { rdoSuffix: 'svrMarketPrice', label: 'Market', type: PropertyType.CURRENCY, width: '12%' },
        { rdoSuffix: 'svrQuality', label: 'Quality', type: PropertyType.PERCENTAGE, width: '12%' },
      ],
    },
  ],
};

// =============================================================================
// HELPER: Collect all property names from a group
// =============================================================================

export function collectPropertyNames(group: PropertyGroup): string[] {
  const names: string[] = [];

  for (const prop of group.properties) {
    if (prop.indexed && prop.indexMax !== undefined) {
      // Add indexed properties
      for (let i = 0; i <= prop.indexMax; i++) {
        names.push(`${prop.rdoName}${i}`);
        if (prop.maxProperty) {
          names.push(`${prop.maxProperty}${i}`);
        }
      }
    } else if (prop.indexed && prop.countProperty) {
      // Count property needs to be fetched first
      names.push(prop.countProperty);
      // We'll fetch indexed props in a second pass
    } else {
      names.push(prop.rdoName);
      if (prop.maxProperty) {
        names.push(prop.maxProperty);
      }
    }
  }

  // Recurse into subgroups
  if (group.subGroups) {
    for (const subGroup of group.subGroups) {
      names.push(...collectPropertyNames(subGroup));
    }
  }

  return [...new Set(names)]; // Remove duplicates
}
