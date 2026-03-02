/**
 * Utilities for the CompInputsPanel (company inputs accordion).
 * CompInputs are supplies — same data model (BuildingSupplyData).
 * The input list comes from GetInputNames; details are lazy-loaded per-input.
 */

export type { CompInputData } from '@/shared/types';

export type ServiceStatus = 'healthy' | 'warning' | 'critical';

/** Connection count health: does this input have active connections? */
export function getConnectionStatus(connectionCount: number): ServiceStatus {
  if (connectionCount >= 1) return 'healthy';
  return 'critical';
}
