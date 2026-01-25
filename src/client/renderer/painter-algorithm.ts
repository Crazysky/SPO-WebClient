/**
 * Painter's Algorithm for Isometric Rendering
 *
 * Rule: Textures lower on screen overlap textures higher on screen.
 *
 * In isometric coordinates:
 * - Higher (i+j) = higher on screen = further from viewer = draw FIRST
 * - Lower (i+j) = lower on screen = closer to viewer = draw LAST (on top)
 *
 * Sort: descending by (i+j)
 */

export interface PainterSortable {
  i: number;
  j: number;
}

/**
 * Sort comparator for painter's algorithm.
 * Higher (i+j) drawn first, lower (i+j) drawn last (on top).
 */
export function painterSort<T extends PainterSortable>(a: T, b: T): number {
  return (b.i + b.j) - (a.i + a.j);
}
