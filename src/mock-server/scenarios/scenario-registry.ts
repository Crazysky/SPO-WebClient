/**
 * Central registry for all mock server scenarios (1-16).
 * Provides lookup by name, full-set loading, and combined scenario merging.
 */

import type { WsCaptureScenario, WsCaptureExchange, ScheduledEvent } from '../types/mock-types';
import type { RdoScenario, RdoExchange } from '../types/rdo-exchange-types';
import type { HttpScenario, HttpExchange } from '../types/http-exchange-types';
import type { ScenarioVariables } from './scenario-variables';

import { createAuthScenario } from './auth-scenario';
import { createWorldListScenario } from './world-list-scenario';
import { createCompanyListScenario } from './company-list-scenario';
import { createSelectCompanyScenario } from './select-company-scenario';
import { createMapDataScenario } from './map-data-scenario';
import { createServerBusyScenario } from './server-busy-scenario';
import { createSwitchFocusScenario } from './switch-focus-scenario';
import { createRefreshObjectScenario } from './refresh-object-scenario';
import { createSetViewedAreaScenario } from './set-viewed-area-scenario';
import { createPickEventScenario } from './pick-event-scenario';
import { createOverlaysScenario } from './overlays-scenario';
import { createBuildMenuScenario } from './build-menu-scenario';
import { createBuildRoadsScenario } from './build-roads-scenario';
import { createMailScenario } from './mail-scenario';
import { createBuildingDetailsScenario } from './building-details-scenario';
import { createPoliticsScenario } from './politics-scenario';

/** All recognized scenario names */
export type ScenarioName =
  | 'auth'
  | 'world-list'
  | 'company-list'
  | 'select-company'
  | 'map-data'
  | 'server-busy'
  | 'switch-focus'
  | 'refresh-object'
  | 'set-viewed-area'
  | 'pick-event'
  | 'overlays'
  | 'build-menu'
  | 'build-roads'
  | 'mail'
  | 'building-details'
  | 'politics';

/** Ordered list of all scenario names */
export const SCENARIO_NAMES: ScenarioName[] = [
  'auth',
  'world-list',
  'company-list',
  'select-company',
  'map-data',
  'server-busy',
  'switch-focus',
  'refresh-object',
  'set-viewed-area',
  'pick-event',
  'overlays',
  'build-menu',
  'build-roads',
  'mail',
  'building-details',
  'politics',
];

/** Union result from any scenario factory */
export interface ScenarioBundle {
  ws?: WsCaptureScenario;
  rdo?: RdoScenario;
  http?: HttpScenario;
}

/** Map from scenario name to its factory function */
const SCENARIO_FACTORIES: Record<
  ScenarioName,
  (overrides?: Partial<ScenarioVariables>) => ScenarioBundle
> = {
  'auth': (o) => createAuthScenario(o),
  'world-list': (o) => createWorldListScenario(o),
  'company-list': (o) => createCompanyListScenario(o),
  'select-company': (o) => createSelectCompanyScenario(o),
  'map-data': (o) => createMapDataScenario(o),
  'server-busy': (o) => createServerBusyScenario(o),
  'switch-focus': (o) => createSwitchFocusScenario(o),
  'refresh-object': (o) => createRefreshObjectScenario(o),
  'set-viewed-area': (o) => createSetViewedAreaScenario(o),
  'pick-event': (o) => createPickEventScenario(o),
  'overlays': (o) => createOverlaysScenario(o),
  'build-menu': (o) => createBuildMenuScenario(o),
  'build-roads': (o) => createBuildRoadsScenario(o),
  'mail': (o) => createMailScenario(o),
  'building-details': (o) => createBuildingDetailsScenario(o),
  'politics': (o) => createPoliticsScenario(o),
};

/**
 * Load a single scenario by name, with optional variable overrides.
 */
export function loadScenario(
  name: ScenarioName,
  overrides?: Partial<ScenarioVariables>
): ScenarioBundle {
  const factory = SCENARIO_FACTORIES[name];
  return factory(overrides);
}

/** Combined result of loading all scenarios */
export interface AllScenariosBundle {
  ws: WsCaptureScenario;
  rdo: RdoScenario;
  http: HttpScenario;
}

/**
 * Load all scenarios and merge them into a single combined bundle.
 * WS exchanges, RDO exchanges, and HTTP exchanges are concatenated.
 * Scheduled events from all WS scenarios are merged.
 */
export function loadAll(
  overrides?: Partial<ScenarioVariables>
): AllScenariosBundle {
  const allWsExchanges: WsCaptureExchange[] = [];
  const allScheduledEvents: ScheduledEvent[] = [];
  const allRdoExchanges: RdoExchange[] = [];
  const allHttpExchanges: HttpExchange[] = [];
  const rdoVariables: Record<string, string> = {};
  const httpVariables: Record<string, string> = {};

  for (const name of SCENARIO_NAMES) {
    const bundle = loadScenario(name, overrides);

    if (bundle.ws) {
      allWsExchanges.push(...bundle.ws.exchanges);
      if (bundle.ws.scheduledEvents) {
        allScheduledEvents.push(...bundle.ws.scheduledEvents);
      }
    }

    if (bundle.rdo) {
      allRdoExchanges.push(...bundle.rdo.exchanges);
      Object.assign(rdoVariables, bundle.rdo.variables);
    }

    if (bundle.http) {
      allHttpExchanges.push(...bundle.http.exchanges);
      Object.assign(httpVariables, bundle.http.variables);
    }
  }

  const ws: WsCaptureScenario = {
    name: 'all-scenarios',
    description: 'Combined: all 16 mock server scenarios',
    capturedAt: '2026-02-18',
    serverInfo: { world: 'Shamba', zone: 'BETA', date: '2026-02-18' },
    exchanges: allWsExchanges,
    scheduledEvents: allScheduledEvents.length > 0 ? allScheduledEvents : undefined,
  };

  const rdo: RdoScenario = {
    name: 'all-scenarios',
    description: 'Combined: all RDO exchanges from 16 scenarios',
    exchanges: allRdoExchanges,
    variables: rdoVariables,
  };

  const http: HttpScenario = {
    name: 'all-scenarios',
    exchanges: allHttpExchanges,
    variables: httpVariables,
  };

  return { ws, rdo, http };
}
