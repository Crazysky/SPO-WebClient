/**
 * Building Data Types
 * Complete building metadata including visual class mapping and texture filenames
 *
 * Based on BUILDING_VISUALCLASS_REFERENCE.md analysis
 *
 * Key concepts:
 * - Runtime VisualClass = BaseVisualClass + Stage0.VisualStages + CurrentBlock.VisualClassId
 * - ObjectsInArea returns the RUNTIME VisualClass
 * - For completed buildings: Complete VisualClass = Base + Stage0.VS
 * - Construction state uses the Base VisualClass
 */

/**
 * Complete building data entry
 * Used for both server-side cache and client-side lookups
 */
export interface BuildingData {
  /** Complete (runtime) VisualClass - what ObjectsInArea returns for finished buildings */
  visualClass: string;

  /** Building name (e.g., "PGIFoodStore") */
  name: string;

  /** Building width in tiles */
  xsize: number;

  /** Building height in tiles */
  ysize: number;

  /** Complete building texture filename (e.g., "MapPGIFoodStore64x32x0.gif") */
  textureFilename: string;

  /** Base VisualClass (used for construction state) */
  baseVisualClass: string;

  /** VisualStages for Stage 0 (1 for most, 2 for residential/office, etc.) */
  visualStages: number;

  /** Construction texture filename (e.g., "Construction64.gif") */
  constructionTextureFilename: string;

  /** Empty building texture filename (for residential buildings only) */
  emptyTextureFilename?: string;

  /** Empty VisualClass (for residential buildings: Base + 1 when visualStages = 2) */
  emptyVisualClass?: string;

  /** Building category for grouping (e.g., "residential", "commerce", "industry") */
  category?: string;

  /** Cluster identifier (e.g., "PGI", "Mariko", "Moab", "Dissidents", "Magna", "UW") */
  cluster?: string;
}

/**
 * Complete building database
 * Maps runtime VisualClass to building data
 */
export interface BuildingDatabase {
  /** Version of the data format */
  version: string;

  /** Last update timestamp */
  lastUpdated: string;

  /** Map of visualClass -> BuildingData */
  buildings: Record<string, BuildingData>;

  /** Reverse lookup: baseVisualClass -> complete visualClass */
  baseToComplete: Record<string, string>;

  /** Reverse lookup: emptyVisualClass -> complete visualClass (for residential) */
  emptyToComplete: Record<string, string>;
}

/**
 * Construction texture size mapping based on building size
 */
export function getConstructionTexture(xsize: number, ysize: number): string {
  const maxSize = Math.max(xsize, ysize);

  if (maxSize <= 1) return 'Construction32.gif';
  if (maxSize <= 2) return 'Construction64.gif';
  if (maxSize <= 3) return 'Construction128.gif';
  if (maxSize <= 4) return 'Construction192.gif';
  if (maxSize <= 5) return 'Construction256.gif';
  return 'Construction320.gif';
}

/**
 * Get the complete VisualClass from base and visual stages
 */
export function getCompleteVisualClass(baseVisualClass: number, visualStages: number): number {
  return baseVisualClass + visualStages;
}

/**
 * Get the empty VisualClass for residential buildings
 * Only applicable when visualStages = 2
 */
export function getEmptyVisualClass(baseVisualClass: number, visualStages: number): number | undefined {
  if (visualStages === 2) {
    return baseVisualClass + 1;
  }
  return undefined;
}
