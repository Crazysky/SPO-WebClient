/**
 * FacilityList — Scrollable list of owned facilities.
 * Clicking a row pans the map and opens the building inspector.
 */

import { memo, useCallback } from 'react';
import { useUiStore } from '../../store/ui-store';
import { useBuildingStore } from '../../store/building-store';
import { useClient } from '../../context';
import type { FavoritesItem } from '@/shared/types';
import styles from './FacilityList.module.css';

interface FacilityRowProps {
  facility: FavoritesItem;
  onClick: (facility: FavoritesItem) => void;
}

const FacilityRow = memo(function FacilityRow({ facility, onClick }: FacilityRowProps) {
  return (
    <button
      className={styles.row}
      onClick={() => onClick(facility)}
    >
      <div className={styles.rowLeft}>
        <span className={styles.name}>{facility.name}</span>
        <span className={styles.category}>{facility.x}, {facility.y}</span>
      </div>
    </button>
  );
});

interface FacilityListProps {
  facilities: FavoritesItem[];
}

export function FacilityList({ facilities }: FacilityListProps) {
  const openRightPanel = useUiStore((s) => s.openRightPanel);
  const client = useClient();

  const handleClick = useCallback((facility: FavoritesItem) => {
    useBuildingStore.getState().setLoading(true);
    openRightPanel('building');
    client.onNavigateToBuilding(facility.x, facility.y);
  }, [openRightPanel, client]);

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
        <FacilityRow key={f.id} facility={f} onClick={handleClick} />
      ))}
    </div>
  );
}
