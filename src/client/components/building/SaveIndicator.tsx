/**
 * SaveIndicator — inline visual feedback for optimistic SET commands.
 *
 * Renders next to slider/input values to show:
 *  - Pending: pulsing gold dot while server processes the change
 *  - Confirmed: brief green checkmark that auto-fades
 *  - Failed: red "!" with error text that auto-clears
 */

import { useEffect, useRef } from 'react';
import { useBuildingStore } from '@/client/store/building-store';
import styles from './SaveIndicator.module.css';

interface SaveIndicatorProps {
  /** Unique key matching the pendingKey used in setBuildingProperty. */
  propertyKey: string;
}

export function SaveIndicator({ propertyKey }: SaveIndicatorProps) {
  const pending = useBuildingStore((s) => s.pendingUpdates.get(propertyKey));
  const confirmed = useBuildingStore((s) => s.confirmedUpdates.get(propertyKey));
  const failed = useBuildingStore((s) => s.failedUpdates.get(propertyKey));
  const clearConfirmed = useBuildingStore((s) => s.clearConfirmed);
  const clearFailed = useBuildingStore((s) => s.clearFailed);

  // Auto-clear confirmed after animation completes (1.5s)
  const confirmedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (confirmed) {
      confirmedTimer.current = setTimeout(() => clearConfirmed(propertyKey), 1500);
      return () => clearTimeout(confirmedTimer.current);
    }
  }, [confirmed, propertyKey, clearConfirmed]);

  // Auto-clear failed after 4s
  const failedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (failed) {
      failedTimer.current = setTimeout(() => clearFailed(propertyKey), 4000);
      return () => clearTimeout(failedTimer.current);
    }
  }, [failed, propertyKey, clearFailed]);

  if (pending) {
    return (
      <span className={`${styles.indicator} ${styles.pending}`}>
        <span className={styles.pendingDot} />
      </span>
    );
  }

  if (confirmed) {
    return (
      <span className={`${styles.indicator} ${styles.confirmed}`}>
        <span className={styles.checkmark}>&#10003;</span>
      </span>
    );
  }

  if (failed) {
    return (
      <span className={`${styles.indicator} ${styles.failed}`} title={failed.error}>
        <span className={styles.failedIcon}>!</span>
        <span className={styles.failedText}>Failed</span>
      </span>
    );
  }

  return null;
}
