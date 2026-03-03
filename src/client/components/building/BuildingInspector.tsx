/**
 * BuildingInspector — Figma-like property sheet for building details.
 *
 * Slides in via RightPanel when a building is focused.
 * Structure:
 * - Header: building name, owner, visual class
 * - QuickStats: revenue, profit, workers, efficiency
 * - TabNavigation: driven by server-sent tab config
 * - Tab content: property rows, supply/product accordions
 * - ActionBar: upgrade/downgrade/delete (sticky bottom)
 */

import { useEffect, useRef } from 'react';
import { useBuildingStore } from '../../store/building-store';
import { useClient } from '../../context';
import { Skeleton } from '../common';
import { QuickStats } from './QuickStats';
import { InspectorTabs } from './InspectorTabs';
import { PropertyGroup } from './PropertyGroup';
import { ActionBar } from './ActionBar';
import styles from './BuildingInspector.module.css';

/** Auto-refresh interval for open building panel (ms). */
const AUTO_REFRESH_INTERVAL = 30_000;

export function BuildingInspector() {
  const focusedBuilding = useBuildingStore((s) => s.focusedBuilding);
  const details = useBuildingStore((s) => s.details);
  const isLoading = useBuildingStore((s) => s.isLoading);
  const currentTab = useBuildingStore((s) => s.currentTab);
  const setCurrentTab = useBuildingStore((s) => s.setCurrentTab);
  const client = useClient();

  // Auto-refresh building details while panel is open (prevents stale QuickStats)
  const refreshTimer = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    if (!details) return;
    const x = details.x;
    const y = details.y;
    refreshTimer.current = setInterval(() => {
      client.onRefreshBuilding(x, y);
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(refreshTimer.current);
  }, [details?.x, details?.y, client]);

  // Loading state
  if (isLoading || (!details && focusedBuilding)) {
    return (
      <div className={styles.inspector}>
        <div className={styles.loadingState}>
          <Skeleton width="60%" height="20px" />
          <Skeleton width="40%" height="14px" />
          <Skeleton width="100%" height="60px" />
          <Skeleton width="100%" height="200px" />
        </div>
      </div>
    );
  }

  // No building selected
  if (!details || !focusedBuilding) {
    return (
      <div className={styles.inspector}>
        <div className={styles.empty}>
          Click a building on the map to inspect it
        </div>
      </div>
    );
  }

  // Find active tab's properties
  const activeGroupId = details.tabs.find((t) => t.id === currentTab)?.id ?? details.tabs[0]?.id ?? '';
  const properties = details.groups[activeGroupId] ?? [];

  return (
    <div className={styles.inspector}>
      {/* Header */}
      <div className={`${styles.header} ${styles.stagger0}`}>
        <h3 className={styles.buildingName}>{details.buildingName}</h3>
        <div className={styles.headerMeta}>
          <span className={styles.ownerName}>{details.ownerName}</span>
          {(details.x !== undefined && details.y !== undefined) && (
            <span className={styles.visualClass}>{details.x}, {details.y}</span>
          )}
        </div>
      </div>

      {/* Quick stats from focus info */}
      <div className={styles.stagger1}>
        <QuickStats focus={focusedBuilding} />
      </div>

      {/* Tab navigation */}
      {details.tabs.length > 0 && (
        <div className={styles.stagger2}>
          <InspectorTabs
            tabs={details.tabs}
            activeTab={currentTab || activeGroupId}
            onTabChange={setCurrentTab}
          />
        </div>
      )}

      {/* Tab content — scrollable */}
      <div className={`${styles.content} ${styles.stagger3}`}>
        <PropertyGroup
          properties={properties}
          buildingX={details.x}
          buildingY={details.y}
        />
      </div>

      {/* Sticky action bar */}
      <ActionBar
        buildingX={details.x}
        buildingY={details.y}
        securityId={details.securityId}
      />
    </div>
  );
}
