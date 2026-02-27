/**
 * Empire Store — Owned facilities from the Favorites tree.
 * Populated via RDOFavoritesGetSubItems on the InterfaceServer.
 */

import { create } from 'zustand';
import type { FavoritesItem } from '@/shared/types';

interface EmpireState {
  // Data
  facilities: FavoritesItem[];
  isLoading: boolean;

  // Actions
  setFacilities: (facilities: FavoritesItem[]) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useEmpireStore = create<EmpireState>((set) => ({
  facilities: [],
  isLoading: false,

  setFacilities: (facilities) => set({ facilities, isLoading: false }),

  setLoading: (loading) => set({ isLoading: loading }),

  reset: () =>
    set({
      facilities: [],
      isLoading: false,
    }),
}));
