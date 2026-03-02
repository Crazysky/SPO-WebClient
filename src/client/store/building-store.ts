/**
 * Building Store — Focused building state, details, and inspection data.
 */

import { create } from 'zustand';
import type {
  BuildingFocusInfo,
  BuildingDetailsResponse,
  ConnectionSearchResult,
  ResearchCategoryData,
  ResearchInventionDetails,
} from '@/shared/types';
import { registerInspectorTabs } from '@/shared/building-details';

interface ResearchState {
  /** Cached inventory per category tab (key = categoryIndex 0..4). */
  inventoryByCategory: Map<number, ResearchCategoryData>;
  /** Currently viewed category tab index (0..4). */
  activeCategoryIndex: number;
  /** Tab labels from research.0.dat (e.g. ["GENERAL","COMMERCE",...]). */
  categoryTabs: string[];
  /** Which categories have been fetched at least once. */
  loadedCategories: Set<number>;
  /** Selected invention (shared across tabs). */
  selectedInventionId: string | null;
  selectedDetails: ResearchInventionDetails | null;
  isLoadingInventory: boolean;
  isLoadingDetails: boolean;
}

interface BuildingState {
  // Focus
  focusedBuilding: BuildingFocusInfo | null;

  // Overlay mode — first click shows overlay, second click opens panel
  isOverlayMode: boolean;

  // Details panel
  details: BuildingDetailsResponse | null;
  currentTab: string;
  isLoading: boolean;

  // Ownership context (set by client.ts when showing panel)
  currentCompanyName: string;
  isOwner: boolean;

  // Connection picker state
  connectionPicker: {
    fluidName: string;
    fluidId: string;
    direction: 'input' | 'output';
    buildingX: number;
    buildingY: number;
    results: ConnectionSearchResult[];
    isSearching: boolean;
  } | null;

  // Research state
  research: ResearchState | null;

  // Actions
  setFocus: (info: BuildingFocusInfo) => void;
  setOverlayMode: (mode: boolean) => void;
  setDetails: (details: BuildingDetailsResponse) => void;
  setCurrentTab: (tab: string) => void;
  setLoading: (loading: boolean) => void;
  setCurrentCompanyName: (name: string) => void;
  clearFocus: () => void;
  clearOverlay: () => void;
  setConnectionPicker: (data: { fluidName: string; fluidId: string; direction: 'input' | 'output'; buildingX: number; buildingY: number }) => void;
  setConnectionResults: (results: ConnectionSearchResult[]) => void;
  setConnectionSearching: (searching: boolean) => void;
  clearConnectionPicker: () => void;

  // Research actions
  setResearchCategoryTabs: (tabs: string[]) => void;
  setResearchInventory: (data: ResearchCategoryData) => void;
  setResearchSelectedInvention: (inventionId: string | null) => void;
  setResearchDetails: (details: ResearchInventionDetails) => void;
  setResearchActiveCategoryIndex: (index: number) => void;
  setResearchLoading: (field: 'inventory' | 'details', loading: boolean) => void;
  clearResearch: () => void;
}

const INITIAL_RESEARCH: ResearchState = {
  inventoryByCategory: new Map(),
  activeCategoryIndex: 0,
  categoryTabs: [],
  loadedCategories: new Set(),
  selectedInventionId: null,
  selectedDetails: null,
  isLoadingInventory: false,
  isLoadingDetails: false,
};

export const useBuildingStore = create<BuildingState>((set) => ({
  focusedBuilding: null,
  isOverlayMode: false,
  details: null,
  currentTab: 'overview',
  isLoading: false,
  currentCompanyName: '',
  isOwner: false,

  setFocus: (info) => set({ focusedBuilding: info }),

  setOverlayMode: (mode) => set({ isOverlayMode: mode }),

  setDetails: (details) => {
    // Lazily populate the client-side template cache from the server-sent tab config.
    // The server sends handlerName for each tab; HANDLER_TO_GROUP maps those to property
    // group definitions (with TABLE, SLIDER, etc. types) that the renderer needs.
    if (details.tabs.length) {
      registerInspectorTabs(
        details.visualClass,
        details.tabs.map((t) => ({ tabName: t.name, tabHandler: t.handlerName })),
        details.templateName,
      );
    }
    set((state) => ({
      details,
      isLoading: false,
      isOwner: (details.ownerName || state.focusedBuilding?.ownerName || '') === state.currentCompanyName,
    }));
  },

  setCurrentTab: (tab) => set({ currentTab: tab }),

  setLoading: (loading) => set({ isLoading: loading }),

  setCurrentCompanyName: (name) =>
    set((state) => ({
      currentCompanyName: name,
      isOwner: state.details
        ? (state.details.ownerName || state.focusedBuilding?.ownerName || '') === name
        : false,
    })),

  clearFocus: () =>
    set({
      focusedBuilding: null,
      isOverlayMode: false,
      details: null,
      currentTab: 'overview',
      isLoading: false,
      isOwner: false,
      research: null,
    }),

  clearOverlay: () => set({ isOverlayMode: false }),

  // Connection picker
  connectionPicker: null,

  setConnectionPicker: (data) =>
    set({ connectionPicker: { ...data, results: [], isSearching: false } }),

  setConnectionResults: (results) =>
    set((state) => ({
      connectionPicker: state.connectionPicker
        ? { ...state.connectionPicker, results, isSearching: false }
        : null,
    })),

  setConnectionSearching: (searching) =>
    set((state) => ({
      connectionPicker: state.connectionPicker
        ? { ...state.connectionPicker, isSearching: searching }
        : null,
    })),

  clearConnectionPicker: () => set({ connectionPicker: null }),

  // Research
  research: null,

  setResearchCategoryTabs: (tabs) =>
    set((state) => ({
      research: {
        ...(state.research ?? INITIAL_RESEARCH),
        categoryTabs: tabs,
      },
    })),

  setResearchInventory: (data) =>
    set((state) => {
      const prev = state.research ?? INITIAL_RESEARCH;
      const nextMap = new Map(prev.inventoryByCategory);
      nextMap.set(data.categoryIndex, data);
      const nextLoaded = new Set(prev.loadedCategories);
      nextLoaded.add(data.categoryIndex);
      return {
        research: {
          ...prev,
          inventoryByCategory: nextMap,
          loadedCategories: nextLoaded,
          isLoadingInventory: false,
        },
      };
    }),

  setResearchSelectedInvention: (inventionId) =>
    set((state) => ({
      research: {
        ...(state.research ?? INITIAL_RESEARCH),
        selectedInventionId: inventionId,
        selectedDetails: null,
      },
    })),

  setResearchDetails: (details) =>
    set((state) => ({
      research: {
        ...(state.research ?? INITIAL_RESEARCH),
        selectedDetails: details,
        isLoadingDetails: false,
      },
    })),

  setResearchActiveCategoryIndex: (index) =>
    set((state) => ({
      research: {
        ...(state.research ?? INITIAL_RESEARCH),
        activeCategoryIndex: index,
        selectedInventionId: null,
        selectedDetails: null,
      },
    })),

  setResearchLoading: (field, loading) =>
    set((state) => ({
      research: {
        ...(state.research ?? INITIAL_RESEARCH),
        [field === 'inventory' ? 'isLoadingInventory' : 'isLoadingDetails']: loading,
      },
    })),

  clearResearch: () => set({ research: null }),
}));
