/**
 * ResearchPanel — Research/Inventions panel for HQ buildings.
 *
 * Shows three sections (Available, Researching, Developed) with a list
 * of inventions per section. Selecting an invention loads its details
 * (properties + description) from the server.
 */

import { useEffect, useCallback } from 'react';
import type { ResearchInventionItem } from '@/shared/types';
import { useBuildingStore, type ResearchSection } from '../../store/building-store';
import { useClient } from '../../context';
import { Skeleton } from '../common/Skeleton';
import styles from './ResearchPanel.module.css';

interface ResearchPanelProps {
  buildingX: number;
  buildingY: number;
}

export function ResearchPanel({ buildingX, buildingY }: ResearchPanelProps) {
  const client = useClient();
  const research = useBuildingStore((s) => s.research);
  const isOwner = useBuildingStore((s) => s.isOwner);

  // Load inventory on mount
  useEffect(() => {
    client.onResearchLoadInventory(buildingX, buildingY, 0);
  }, [client, buildingX, buildingY]);

  const activeSection: ResearchSection = research?.activeSection ?? 'available';
  const inventory = research?.inventory;
  const selectedId = research?.selectedInventionId ?? null;
  const details = research?.selectedDetails ?? null;
  const isLoadingInventory = research?.isLoadingInventory ?? false;
  const isLoadingDetails = research?.isLoadingDetails ?? false;

  const handleSectionChange = useCallback(
    (section: ResearchSection) => {
      useBuildingStore.getState().setResearchActiveSection(section);
    },
    [],
  );

  const handleSelectInvention = useCallback(
    (item: ResearchInventionItem) => {
      if (item.enabled === false) return;
      client.onResearchGetDetails(buildingX, buildingY, item.inventionId);
    },
    [client, buildingX, buildingY],
  );

  const handleAction = useCallback(
    (action: string) => {
      client.onBuildingAction(action);
    },
    [client],
  );

  const items = getItemsForSection(inventory, activeSection);
  const availableCount = inventory?.available.length ?? 0;
  const developingCount = inventory?.developing.length ?? 0;
  const completedCount = inventory?.completed.length ?? 0;

  return (
    <div className={styles.panel}>
      {/* Section tabs */}
      <SectionTabs
        active={activeSection}
        counts={[availableCount, developingCount, completedCount]}
        onChange={handleSectionChange}
      />

      {/* Invention list */}
      {isLoadingInventory ? (
        <div className={styles.loadingList}>
          <Skeleton height="1.5em" />
          <Skeleton height="1.5em" />
          <Skeleton height="1.5em" width="80%" />
        </div>
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>No inventions in this category</div>
      ) : (
        <InventionList
          items={items}
          selectedId={selectedId}
          section={activeSection}
          onSelect={handleSelectInvention}
        />
      )}

      {/* Detail panel */}
      {selectedId && (
        <DetailPanel
          inventionId={selectedId}
          details={details}
          isLoading={isLoadingDetails}
        />
      )}

      {/* Action bar */}
      {selectedId && isOwner && (
        <ActionBar
          section={activeSection}
          selectedEnabled={isSelectedEnabled(items, selectedId)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}

// =============================================================================
// SECTION TABS
// =============================================================================

const SECTIONS: { key: ResearchSection; label: string }[] = [
  { key: 'available', label: 'Available' },
  { key: 'developing', label: 'Researching' },
  { key: 'completed', label: 'Developed' },
];

function SectionTabs({
  active,
  counts,
  onChange,
}: {
  active: ResearchSection;
  counts: [number, number, number];
  onChange: (section: ResearchSection) => void;
}) {
  return (
    <div className={styles.sectionTabs}>
      {SECTIONS.map((s, i) => (
        <button
          key={s.key}
          className={`${styles.sectionTab} ${active === s.key ? styles.sectionTabActive : ''}`}
          onClick={() => onChange(s.key)}
        >
          {s.label}
          <span className={styles.sectionCount}>({counts[i]})</span>
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// INVENTION LIST
// =============================================================================

function InventionList({
  items,
  selectedId,
  section,
  onSelect,
}: {
  items: ResearchInventionItem[];
  selectedId: string | null;
  section: ResearchSection;
  onSelect: (item: ResearchInventionItem) => void;
}) {
  // Group by parent if available
  const groups = groupByParent(items);

  return (
    <div className={styles.inventionList}>
      {groups.map(([parent, groupItems]) => (
        <div key={parent}>
          {parent !== '' && (
            <div className={styles.categoryHeader}>{parent}</div>
          )}
          {groupItems.map((item) => {
            const isSelected = item.inventionId === selectedId;
            const isDisabled = section === 'available' && item.enabled === false;
            return (
              <button
                key={item.inventionId}
                className={[
                  styles.inventionItem,
                  isSelected ? styles.inventionItemSelected : '',
                  isDisabled ? styles.inventionItemDisabled : '',
                ].join(' ')}
                onClick={() => onSelect(item)}
                disabled={isDisabled}
              >
                <span className={styles.inventionName}>
                  {item.name || item.inventionId}
                </span>
                {section === 'completed' && item.cost && (
                  <span className={styles.inventionCost}>{item.cost}</span>
                )}
                {isDisabled && (
                  <span className={styles.inventionDisabledTag}>locked</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// DETAIL PANEL
// =============================================================================

function DetailPanel({
  inventionId,
  details,
  isLoading,
}: {
  inventionId: string;
  details: { inventionId: string; properties: string; description: string } | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className={styles.detailPanel}>
        <Skeleton height="1em" width="50%" />
        <Skeleton height="4em" />
        <Skeleton height="2em" width="80%" />
      </div>
    );
  }

  if (!details || details.inventionId !== inventionId) {
    return <div className={styles.selectHint}>Loading details...</div>;
  }

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>{inventionId}</div>
      {details.properties && (
        <div className={styles.detailProperties}>{details.properties}</div>
      )}
      {details.description && (
        <div className={styles.detailDescription}>{details.description}</div>
      )}
    </div>
  );
}

// =============================================================================
// ACTION BAR
// =============================================================================

function ActionBar({
  section,
  selectedEnabled,
  onAction,
}: {
  section: ResearchSection;
  selectedEnabled: boolean;
  onAction: (action: string) => void;
}) {
  if (section === 'available' && selectedEnabled) {
    return (
      <div className={styles.actionBar}>
        <button className={styles.actionBtn} onClick={() => onAction('queueResearch')}>
          Research
        </button>
      </div>
    );
  }

  if (section === 'developing') {
    return (
      <div className={styles.actionBar}>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
          onClick={() => onAction('cancelResearch')}
        >
          Cancel
        </button>
      </div>
    );
  }

  return null;
}

// =============================================================================
// HELPERS
// =============================================================================

function getItemsForSection(
  inventory: { available: ResearchInventionItem[]; developing: ResearchInventionItem[]; completed: ResearchInventionItem[] } | null,
  section: ResearchSection,
): ResearchInventionItem[] {
  if (!inventory) return [];
  switch (section) {
    case 'available': return inventory.available;
    case 'developing': return inventory.developing;
    case 'completed': return inventory.completed;
    default: return [];
  }
}

function groupByParent(items: ResearchInventionItem[]): [string, ResearchInventionItem[]][] {
  const map = new Map<string, ResearchInventionItem[]>();
  for (const item of items) {
    const key = item.parent ?? '';
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }
  return Array.from(map.entries());
}

function isSelectedEnabled(items: ResearchInventionItem[], selectedId: string): boolean {
  const item = items.find((i) => i.inventionId === selectedId);
  return item ? item.enabled !== false : false;
}
