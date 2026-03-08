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

import { useEffect, useMemo, useRef } from 'react';
import { useBuildingStore } from '../../store/building-store';
import { usePoliticsStore } from '../../store/politics-store';
import { useGameStore } from '../../store/game-store';
import { useClient } from '../../context';
import { isCivicBuilding } from '@/shared/building-details/civic-buildings';
import type { BuildingDetailsTab, BuildingPropertyValue } from '@/shared/types';
import { Skeleton } from '../common';
import { QuickStats } from './QuickStats';
import { InspectorTabs } from './InspectorTabs';
import { PropertyGroup } from './PropertyGroup';
import { ActionBar } from './ActionBar';
import { TownsTab } from '../politics/TownsTab';
import { MinistriesTab } from '../politics/MinistriesTab';
import { JobsTab } from '../politics/JobsTab';
import { ResidentialsTab } from '../politics/ResidentialsTab';
import { VotesTab } from '../politics/VotesTab';
import { RatingsTab } from '../politics/RatingsTab';
import { buildValueMap, getNum } from '../politics/capitol-utils';
import styles from './BuildingInspector.module.css';

/** Auto-refresh interval for open building panel (ms). */
const AUTO_REFRESH_INTERVAL = 30_000;

/** Group IDs that have rich civic tab components (replaces generic PropertyGroup). */
const CIVIC_TAB_OVERRIDES = new Set([
  'capitolTowns',
  'ministeries',
  'townJobs',
  'townRes',
  'votes',
]);

/** Synthetic Ratings tab injected for civic buildings. */
const RATINGS_TAB: BuildingDetailsTab = {
  id: 'ratings',
  name: 'Ratings',
  icon: '★',
  order: 90,
  handlerName: 'ratings',
};

interface BuildingInspectorProps {
  /** Hide the built-in header (used when wrapped in a modal that already shows the name). */
  hideHeader?: boolean;
}

export function BuildingInspector({ hideHeader }: BuildingInspectorProps = {}) {
  const focusedBuilding = useBuildingStore((s) => s.focusedBuilding);
  const details = useBuildingStore((s) => s.details);
  const isLoading = useBuildingStore((s) => s.isLoading);
  const currentTab = useBuildingStore((s) => s.currentTab);
  const setCurrentTab = useBuildingStore((s) => s.setCurrentTab);
  const client = useClient();

  const isCivic = details ? isCivicBuilding(details.visualClass) : false;
  const username = useGameStore((s) => s.username);
  const holdsOffice = useGameStore((s) => s.isPublicOfficeRole);

  // For civic buildings, append the synthetic Ratings tab
  const tabs = useMemo(() => {
    if (!details) return [];
    if (!isCivic) return details.tabs;
    return [...details.tabs, RATINGS_TAB];
  }, [details, isCivic]);

  // Derive campaign state (needed for Ratings tab)
  // Primary: PoliticsData.campaigns (works for both Capitol and Town Hall)
  const politicsCampaigns = usePoliticsStore((s) => s.data?.campaigns);
  const isCandidateFromPolitics = (politicsCampaigns ?? []).some(
    (c) => c.candidateName.toLowerCase() === (username ?? '').toLowerCase()
  );
  // Fallback: votes group (only populated for Capitol)
  const votesGroup = details?.groups['votes'] ?? [];
  const valueMap = buildValueMap(votesGroup);
  const candidateCount = getNum(valueMap, 'CampaignCount');
  const isCandidateFromVotes = Array.from({ length: candidateCount }, (_, i) =>
    valueMap.get(`Candidate${i}`) ?? ''
  ).some((name) => name.toLowerCase() === (username ?? '').toLowerCase());
  const isCandidate = isCandidateFromPolitics || isCandidateFromVotes;
  // Auto-refresh building details while panel is open (prevents stale QuickStats)
  const refreshTimer = useRef<ReturnType<typeof setInterval>>(undefined);
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
  const activeGroupId = tabs.find((t) => t.id === currentTab)?.id ?? tabs[0]?.id ?? '';
  const properties = details.groups[activeGroupId] ?? [];

  return (
    <div className={styles.inspector}>
      {/* Header (hidden when inside modal — modal provides its own title) */}
      {!hideHeader && (
        <div className={`${styles.header} ${styles.stagger0}`}>
          <h3 className={styles.buildingName}>{details.buildingName}</h3>
          <div className={styles.headerMeta}>
            <span className={styles.ownerName}>{details.ownerName}</span>
            {(details.x !== undefined && details.y !== undefined) && (
              <span className={styles.visualClass}>{details.x}, {details.y}</span>
            )}
          </div>
        </div>
      )}

      {/* Quick stats from focus info */}
      <div className={styles.stagger1}>
        <QuickStats focus={focusedBuilding} />
      </div>

      {/* Tab navigation */}
      {tabs.length > 0 && (
        <div className={styles.stagger2}>
          <InspectorTabs
            tabs={tabs}
            activeTab={currentTab || activeGroupId}
            onTabChange={setCurrentTab}
          />
        </div>
      )}

      {/* Tab content — scrollable */}
      <div className={`${styles.content} ${styles.stagger3}`}>
        <CivicOrGenericTab
          isCivic={isCivic}
          activeGroupId={activeGroupId}
          properties={properties}
          buildingX={details.x}
          buildingY={details.y}
          isCandidate={isCandidate}
          holdsOffice={holdsOffice}
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

/** Renders a rich civic tab component or falls back to generic PropertyGroup. */
function CivicOrGenericTab({
  isCivic,
  activeGroupId,
  properties,
  buildingX,
  buildingY,
  isCandidate,
  holdsOffice,
}: {
  isCivic: boolean;
  activeGroupId: string;
  properties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
  isCandidate: boolean;
  holdsOffice: boolean;
}) {
  if (!isCivic || !CIVIC_TAB_OVERRIDES.has(activeGroupId)) {
    // Synthetic Ratings tab for civic buildings
    if (isCivic && activeGroupId === 'ratings') {
      return <RatingsTab buildingX={buildingX} buildingY={buildingY} isCandidate={isCandidate} holdsOffice={holdsOffice} />;
    }
    return <PropertyGroup properties={properties} buildingX={buildingX} buildingY={buildingY} />;
  }

  switch (activeGroupId) {
    case 'capitolTowns':
      return <TownsTab properties={properties} buildingX={buildingX} buildingY={buildingY} />;
    case 'ministeries':
      return <MinistriesTab properties={properties} buildingX={buildingX} buildingY={buildingY} />;
    case 'townJobs':
      return <JobsTab properties={properties} buildingX={buildingX} buildingY={buildingY} />;
    case 'townRes':
      return <ResidentialsTab properties={properties} />;
    case 'votes':
      return <VotesTab properties={properties} buildingX={buildingX} buildingY={buildingY} />;
    default:
      return <PropertyGroup properties={properties} buildingX={buildingX} buildingY={buildingY} />;
  }
}
