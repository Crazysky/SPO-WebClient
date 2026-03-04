/**
 * OverlayMenu — Flyout sub-list for selecting map overlays.
 *
 * Appears beside the Overlays button in the LeftRail.
 * Grouped by category: Special, Environment, Population, Market.
 * Only one overlay active at a time; clicking the active overlay disables it.
 */

import { OVERLAY_LIST, type SurfaceType } from '@/shared/types';
import { useGameStore } from '../../store/game-store';
import { useClient } from '../../context';
import styles from './OverlayMenu.module.css';

interface OverlayMenuProps {
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  special: 'Special',
  environment: 'Environment',
  population: 'Population',
  market: 'Market',
};

export function OverlayMenu({ onClose }: OverlayMenuProps) {
  const activeOverlay = useGameStore((s) => s.activeOverlay);
  const isCityZonesEnabled = useGameStore((s) => s.isCityZonesEnabled);
  const client = useClient();

  const handleSelect = (type: SurfaceType) => {
    client.onSetOverlay(type);
    onClose();
  };

  const handleToggleCityZones = () => {
    client.onToggleCityZones();
    onClose();
  };

  // Group overlays by category, rendering category headers
  let lastCategory = '';

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.menu} role="menu" aria-label="Map Overlays">
        {OVERLAY_LIST.map((overlay) => {
          const showHeader = overlay.category !== lastCategory;
          lastCategory = overlay.category;

          // "Building Zones" uses the city zones toggle (special behavior)
          const isZones = overlay.type === 'ZONES';
          const isActive = isZones ? isCityZonesEnabled : activeOverlay === overlay.type;

          return (
            <div key={overlay.type}>
              {showHeader && (
                <div className={styles.categoryLabel}>{CATEGORY_LABELS[overlay.category]}</div>
              )}
              <button
                className={`${styles.item} ${isActive ? styles.active : ''}`}
                role="menuitem"
                onClick={() => isZones ? handleToggleCityZones() : handleSelect(overlay.type)}
              >
                {overlay.label}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
