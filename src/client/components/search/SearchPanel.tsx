/**
 * SearchPanel — World directory search with breadcrumb navigation.
 *
 * Home page: category cards (Towns, Tycoons, People, Rankings, Banks).
 * Drill-down pages render actual data from the search store.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  ChevronRight, Building2, Users, UserSearch, Trophy, Landmark, Search,
} from 'lucide-react';
import { useSearchStore, type SearchPage } from '../../store/search-store';
import { useClient } from '../../context';
import { GlassCard, Skeleton } from '../common';
import type {
  TownInfo, RankingCategory, RankingEntry,
} from '@/shared/types';
import styles from './SearchPanel.module.css';

const CATEGORIES: { id: SearchPage; label: string; icon: React.ReactNode }[] = [
  { id: 'towns', label: 'Towns', icon: <Building2 size={20} /> },
  { id: 'tycoon', label: 'Tycoons', icon: <Users size={20} /> },
  { id: 'people', label: 'People', icon: <UserSearch size={20} /> },
  { id: 'rankings', label: 'Rankings', icon: <Trophy size={20} /> },
  { id: 'banks', label: 'Banks', icon: <Landmark size={20} /> },
];

// ---------------------------------------------------------------------------
// Towns sub-page
// ---------------------------------------------------------------------------

function TownsPage() {
  const towns = useSearchStore((s) => s.townsData?.towns ?? []);
  const client = useClient();

  if (towns.length === 0) {
    return <div className={styles.emptyState}>No towns found.</div>;
  }

  return (
    <div className={styles.listContainer}>
      {towns.map((town: TownInfo) => (
        <GlassCard
          key={town.name}
          className={styles.listItem}
          light
          onClick={() => client.onNavigateToBuilding(town.x, town.y)}
        >
          <div className={styles.listItemHeader}>
            <Building2 size={16} className={styles.listItemIcon} />
            <span className={styles.listItemTitle}>{town.name}</span>
          </div>
          <div className={styles.listItemDetails}>
            {town.mayor && <span>Mayor: {town.mayor}</span>}
            <span>Pop: {town.population.toLocaleString()}</span>
            <span>QoL: {town.qualityOfLife}%</span>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tycoon profile sub-page (name lookup)
// ---------------------------------------------------------------------------

function TycoonPage() {
  const profile = useSearchStore((s) => s.tycoonData?.profile ?? null);
  const isLoading = useSearchStore((s) => s.isLoading);
  const client = useClient();
  const [searchName, setSearchName] = useState('');

  const handleSearch = useCallback(() => {
    const trimmed = searchName.trim();
    if (trimmed) {
      useSearchStore.getState().setLoading(true);
      client.onSearchMenuTycoonProfile(trimmed);
    }
  }, [searchName, client]);

  return (
    <div className={styles.listContainer}>
      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Enter tycoon name..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className={styles.searchBtn} onClick={handleSearch} disabled={isLoading}>
          <Search size={14} />
        </button>
      </div>
      {profile && (
        <GlassCard className={styles.profileCard} light>
          <div className={styles.listItemHeader}>
            <Users size={16} className={styles.listItemIcon} />
            <span className={styles.listItemTitle}>{profile.name}</span>
          </div>
          <div className={styles.listItemDetails}>
            <span>Fortune: ${profile.fortune.toLocaleString()}</span>
            <span>Profit: ${profile.thisYearProfit.toLocaleString()}</span>
            <span>Level: {profile.level}</span>
            <span>Prestige: {profile.prestige}</span>
          </div>
        </GlassCard>
      )}
      {!profile && !isLoading && (
        <div className={styles.emptyState}>Search for a tycoon by name.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// People search sub-page
// ---------------------------------------------------------------------------

function PeoplePage() {
  const results = useSearchStore((s) => s.peopleData?.results ?? []);
  const isLoading = useSearchStore((s) => s.isLoading);
  const client = useClient();
  const [searchStr, setSearchStr] = useState('');

  const handleSearch = useCallback(() => {
    const trimmed = searchStr.trim();
    if (trimmed) {
      useSearchStore.getState().setLoading(true);
      client.onSearchMenuPeopleSearch(trimmed);
    }
  }, [searchStr, client]);

  return (
    <div className={styles.listContainer}>
      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search people..."
          value={searchStr}
          onChange={(e) => setSearchStr(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className={styles.searchBtn} onClick={handleSearch} disabled={isLoading}>
          <Search size={14} />
        </button>
      </div>
      {results.length > 0 && (
        <div className={styles.simpleList}>
          {results.map((name: string) => (
            <div key={name} className={styles.simpleListItem}>{name}</div>
          ))}
        </div>
      )}
      {results.length === 0 && !isLoading && (
        <div className={styles.emptyState}>Search for people by name.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rankings sub-page (tree → detail)
// ---------------------------------------------------------------------------

function RankingsPage() {
  const categories = useSearchStore((s) => s.rankingsData?.categories ?? []);
  const detail = useSearchStore((s) => s.rankingDetailData);
  const client = useClient();

  const handleCategoryClick = useCallback((cat: RankingCategory) => {
    useSearchStore.getState().setLoading(true);
    client.onSearchMenuRankingDetail(cat.url);
  }, [client]);

  // Show detail view if loaded
  if (detail) {
    return (
      <div className={styles.listContainer}>
        <button
          className={styles.backLink}
          onClick={() => useSearchStore.getState().clearRankingDetail()}
        >
          ← Back to categories
        </button>
        <h3 className={styles.sectionTitle}>{detail.title}</h3>
        <div className={styles.rankingTable}>
          {detail.entries.map((entry: RankingEntry) => (
            <div key={`${entry.rank}-${entry.name}`} className={styles.rankingRow}>
              <span className={styles.rankingRank}>#{entry.rank}</span>
              <span className={styles.rankingName}>{entry.name}</span>
              <span className={styles.rankingValue}>{entry.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (categories.length === 0) {
    return <div className={styles.emptyState}>No ranking categories available.</div>;
  }

  return (
    <div className={styles.listContainer}>
      {categories.map((cat: RankingCategory) => (
        <GlassCard
          key={cat.id}
          className={styles.listItem}
          light
          onClick={() => handleCategoryClick(cat)}
        >
          <div className={styles.listItemHeader}>
            <Trophy size={16} className={styles.listItemIcon} />
            <span className={styles.listItemTitle}>{cat.label}</span>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Banks sub-page
// ---------------------------------------------------------------------------

function BanksPage() {
  const banks = useSearchStore((s) => s.banksData?.banks ?? []);

  if (banks.length === 0) {
    return <div className={styles.emptyState}>No banks found.</div>;
  }

  return (
    <div className={styles.listContainer}>
      {banks.map((bank, idx) => {
        const b = bank as Record<string, unknown>;
        return (
          <GlassCard key={String(b.name ?? idx)} className={styles.listItem} light>
            <div className={styles.listItemHeader}>
              <Landmark size={16} className={styles.listItemIcon} />
              <span className={styles.listItemTitle}>{String(b.name ?? `Bank ${idx + 1}`)}</span>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component map
// ---------------------------------------------------------------------------

const PAGE_COMPONENTS: Record<string, React.FC> = {
  towns: TownsPage,
  tycoon: TycoonPage,
  people: PeoplePage,
  rankings: RankingsPage,
  banks: BanksPage,
};

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function SearchPanel() {
  const currentPage = useSearchStore((s) => s.currentPage);
  const isLoading = useSearchStore((s) => s.isLoading);
  const navigateTo = useSearchStore((s) => s.navigateTo);
  const goBack = useSearchStore((s) => s.goBack);
  const pageHistory = useSearchStore((s) => s.pageHistory);
  const client = useClient();

  // Request home data when opened
  useEffect(() => {
    client.onSearchMenuHome();
  }, [client]);

  // Fetch category data when navigating to a category page
  useEffect(() => {
    if (currentPage === 'home' || currentPage === 'ranking-detail') return;
    const fetchers: Record<string, () => void> = {
      towns: () => client.onSearchMenuTowns(),
      tycoon: () => {
        // Tycoon page shows a search field — just stop loading
        useSearchStore.getState().setLoading(false);
      },
      people: () => client.onSearchMenuPeople(),
      rankings: () => client.onSearchMenuRankings(),
      banks: () => client.onSearchMenuBanks(),
    };
    fetchers[currentPage]?.();
  }, [currentPage, client]);

  const PageComponent = currentPage !== 'home' ? PAGE_COMPONENTS[currentPage] : null;

  return (
    <div className={styles.panel}>
      {/* Breadcrumb navigation */}
      {currentPage !== 'home' && (
        <div className={styles.breadcrumb}>
          <button className={styles.breadcrumbLink} onClick={goBack}>
            {pageHistory.length > 0 ? '← Back' : '← Home'}
          </button>
          <ChevronRight size={12} className={styles.breadcrumbSep} />
          <span className={styles.breadcrumbCurrent}>
            {CATEGORIES.find((c) => c.id === currentPage)?.label ?? currentPage}
          </span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className={styles.loading}>
          <Skeleton width="100%" height="60px" />
          <Skeleton width="100%" height="60px" />
          <Skeleton width="100%" height="60px" />
        </div>
      )}

      {/* Home — category grid */}
      {!isLoading && currentPage === 'home' && (
        <div className={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <GlassCard
              key={cat.id}
              className={styles.categoryCard}
              onClick={() => navigateTo(cat.id)}
            >
              <span className={styles.categoryIcon}>{cat.icon}</span>
              <span className={styles.categoryLabel}>{cat.label}</span>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Drill-down pages — actual data from stores */}
      {!isLoading && currentPage !== 'home' && PageComponent && (
        <div className={styles.pageContent}>
          <PageComponent />
        </div>
      )}
    </div>
  );
}
