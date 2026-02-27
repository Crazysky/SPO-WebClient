/**
 * Empire Store — Owned facilities, aggregated financial metrics.
 * The player's "command center" data: all buildings they own, with status and revenue.
 */

import { create } from 'zustand';

export type FacilityStatus = 'operating' | 'alert' | 'upgrading' | 'closed';

export interface OwnedFacility {
  buildingId: string;
  name: string;
  visualClass: string;
  x: number;
  y: number;
  revenue: string;
  status: FacilityStatus;
  category: string;
  level: number;
}

interface EmpireState {
  // Data
  facilities: OwnedFacility[];
  totalRevenue: string;
  totalExpenses: string;
  netProfit: string;
  isLoading: boolean;

  // Actions
  setFacilities: (facilities: OwnedFacility[]) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useEmpireStore = create<EmpireState>((set) => ({
  facilities: [],
  totalRevenue: '0',
  totalExpenses: '0',
  netProfit: '0',
  isLoading: false,

  setFacilities: (facilities) => set({ facilities, isLoading: false }),

  setLoading: (loading) => set({ isLoading: loading }),

  reset: () =>
    set({
      facilities: [],
      totalRevenue: '0',
      totalExpenses: '0',
      netProfit: '0',
      isLoading: false,
    }),
}));
