/**
 * MapLoadingScreen — Full-viewport overlay shown while map resources load
 * after a company is selected. Fades out once the terrain + facility data
 * are ready, then unmounts.
 */

import { useState, useEffect } from 'react';
import { useGameStore } from '../../store/game-store';
import { LoginBackground } from '../login/LoginBackground';
import { ProgressBar } from '../common/ProgressBar';
import styles from './MapLoadingScreen.module.css';

export function MapLoadingScreen() {
  const { active, progress, message } = useGameStore((s) => s.mapLoading);
  const [exiting, setExiting] = useState(false);
  const [unmounted, setUnmounted] = useState(false);

  useEffect(() => {
    if (!active && !exiting && progress > 0) {
      setExiting(true);
      const t = setTimeout(() => setUnmounted(true), 400);
      return () => clearTimeout(t);
    }
  }, [active, exiting, progress]);

  // Not yet active and never been active — nothing to show
  if (unmounted || (!active && progress === 0 && !exiting)) return null;

  return (
    <div className={`${styles.root} ${exiting ? styles.exiting : ''}`}>
      <LoginBackground />
      <div className={styles.content}>
        <h2 className={styles.logo}>Starpeace Online</h2>
        <div className={styles.progressWrap}>
          <ProgressBar value={progress} variant="primary" height={6} showLabel />
        </div>
        {message && <p className={styles.message}>{message}</p>}
      </div>
    </div>
  );
}
