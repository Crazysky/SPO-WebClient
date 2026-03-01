/**
 * FacilityList — Scrollable list of owned facilities.
 * Clicking a row pans the map and opens the building inspector.
 */

import { useUiStore } from '../../store/ui-store';
import { useBuildingStore } from '../../store/building-store';
import { useClient } from '../../context';
import type { FavoritesItem } from '@/shared/types';
import styles from './FacilityList.module.css';

interface FacilityListProps {
  facilities: FavoritesItem[];
}

export function FacilityList({ facilities }: FacilityListProps) {
  const openRightPanel = useUiStore((s) => s.openRightPanel);
  const client = useClient();

  const handleClick = (facility: FavoritesItem) => {
    // Show loading skeletons immediately while data loads
    useBuildingStore.getState().setLoading(true);
    openRightPanel('building');
    client.onNavigateToBuilding(facility.x, facility.y);
  };

  if (facilities.length === 0) {
    return (
      <div className={styles.empty}>
        No facilities found
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {facilities.map((f) => (
        <button
          key={f.id}
          className={styles.row}
          onClick={() => handleClick(f)}
        >
          <div className={styles.rowLeft}>
            <span className={styles.name}>{f.name}</span>
            <span className={styles.category}>{f.x}, {f.y}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
