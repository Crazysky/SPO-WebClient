/**
 * StatusOverlay — Floating building status preview.
 *
 * Shown above a building after the first map click (overlay mode).
 * A second click on the same building opens the full inspector panel.
 * Uses requestAnimationFrame to track the building's screen position
 * during scroll/zoom via the worldToScreen bridge utility.
 */

import { useState, useEffect, useRef } from 'react';
import { useBuildingStore } from '../../store/building-store';
import { worldToScreen } from '../../bridge/client-bridge';
import styles from './StatusOverlay.module.css';

/** Vertical offset above the building's screen position (pixels). */
export const OVERLAY_OFFSET_Y = 60;

export function revenueClass(revenue: string): string {
  if (!revenue) return styles.revenueNeutral;
  if (revenue.includes('-')) return styles.revenueNegative;
  if (revenue.includes('$') && !revenue.includes('$0')) return styles.revenuePositive;
  return styles.revenueNeutral;
}

export function StatusOverlay() {
  const building = useBuildingStore((s) => s.focusedBuilding);
  const isOverlay = useBuildingStore((s) => s.isOverlayMode);
  const [screenPos, setScreenPos] = useState<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number>(0);

  // Track building position on screen via rAF
  useEffect(() => {
    if (!building || !isOverlay) {
      setScreenPos(null);
      return;
    }

    const update = () => {
      const pos = worldToScreen(building.x, building.y);
      if (pos) {
        setScreenPos(pos);
      }
      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [building, isOverlay]);

  if (!building || !isOverlay || !screenPos) return null;

  const detailLines = building.detailsText
    ? building.detailsText.split('\n').filter(Boolean)
    : [];

  return (
    <div
      className={styles.overlay}
      style={{
        left: screenPos.x,
        top: screenPos.y - OVERLAY_OFFSET_Y,
      }}
      data-testid="status-overlay"
    >
      <div className={styles.header}>
        <span className={styles.name}>{building.buildingName}</span>
        {building.revenue && (
          <span className={`${styles.revenue} ${revenueClass(building.revenue)}`}>
            {building.revenue}
          </span>
        )}
      </div>

      {building.salesInfo && (
        <div className={styles.salesInfo}>{building.salesInfo}</div>
      )}

      {detailLines.length > 0 && (
        <div className={styles.details}>
          {detailLines.map((line, i) => (
            <div key={i} className={styles.detailLine}>{line}</div>
          ))}
        </div>
      )}

      {building.hintsText && (
        <div className={styles.hints}>{building.hintsText}</div>
      )}
    </div>
  );
}
