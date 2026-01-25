/**
 * Painter's Algorithm Utilities for Isometric Rendering
 *
 * In isometric view, tiles closer to the viewer (lower on screen) must be drawn
 * AFTER tiles further from the viewer (higher on screen) to achieve correct overlap.
 *
 * Screen coordinate relationship:
 * - Lower (i+j) values = closer to viewer = lower on screen = drawn LAST (on top)
 * - Higher (i+j) values = further from viewer = higher on screen = drawn FIRST (underneath)
 *
 * Usage:
 *   tiles.sort(painterSort)  // Sort for back-to-front rendering
 */

/**
 * Interface for objects that can be sorted with painter's algorithm
 */
export interface PainterSortable {
  i: number;
  j: number;
}

/**
 * Compare function for painter's algorithm sorting.
 * Sorts tiles for back-to-front rendering order.
 *
 * - Higher (i+j) drawn first (back/top of screen)
 * - Lower (i+j) drawn last (front/bottom of screen, overlaps previous)
 *
 * @example
 * const tiles = [{i: 0, j: 0}, {i: 1, j: 1}, {i: 0, j: 1}];
 * tiles.sort(painterSort);
 * // Result: [{i: 1, j: 1}, {i: 0, j: 1}, {i: 0, j: 0}]
 * // Tiles drawn in this order: (1,1) first, then (0,1), then (0,0) on top
 */
export function painterSort<T extends PainterSortable>(a: T, b: T): number {
  return (b.i + b.j) - (a.i + a.j);
}

/**
 * Calculate the painter's algorithm depth value for a tile.
 * Lower values = closer to viewer = should be drawn later.
 *
 * @param i - Row coordinate
 * @param j - Column coordinate
 * @returns Depth value (i + j)
 */
export function painterDepth(i: number, j: number): number {
  return i + j;
}

/**
 * Sort an array of tiles in-place for painter's algorithm rendering.
 * Convenience wrapper around Array.sort with painterSort.
 *
 * @param tiles - Array of tiles with i, j coordinates
 * @returns The same array, sorted in place
 */
export function sortForPainter<T extends PainterSortable>(tiles: T[]): T[] {
  return tiles.sort(painterSort);
}
