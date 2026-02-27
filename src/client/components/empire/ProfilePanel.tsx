/**
 * ProfilePanel — Tabbed tycoon profile (replaces EmpireOverview).
 *
 * Tabs: Curriculum, Bank, P&L, Companies, Connections, Policy.
 * Each tab fetches data from the server on activation via ClientCallbacks.
 */

import { useEffect } from 'react';
import { TabBar, Skeleton, SkeletonLines } from '../common';
import { useProfileStore, type ProfileTab } from '../../store/profile-store';
import { useClient } from '../../context';
import styles from './ProfilePanel.module.css';

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'bank', label: 'Bank' },
  { id: 'profitloss', label: 'P&L' },
  { id: 'companies', label: 'Companies' },
  { id: 'autoconnections', label: 'Connections' },
  { id: 'policy', label: 'Policy' },
];

export function ProfilePanel() {
  const currentTab = useProfileStore((s) => s.currentTab);
  const isLoading = useProfileStore((s) => s.isLoading);
  const setCurrentTab = useProfileStore((s) => s.setCurrentTab);
  const client = useClient();

  // Fetch data when tab changes
  useEffect(() => {
    requestTabData(currentTab, client);
  }, [currentTab, client]);

  const handleTabChange = (tabId: string) => {
    setCurrentTab(tabId as ProfileTab);
  };

  return (
    <div className={styles.panel}>
      <TabBar tabs={TABS} activeTab={currentTab} onTabChange={handleTabChange} />
      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>
            <Skeleton width="100%" height="60px" />
            <SkeletonLines lines={4} />
          </div>
        ) : (
          <TabContent tab={currentTab} />
        )}
      </div>
    </div>
  );
}

function requestTabData(tab: ProfileTab, client: ReturnType<typeof useClient>) {
  const setLoading = useProfileStore.getState().setLoading;
  setLoading(true);

  switch (tab) {
    case 'curriculum':
      client.onProfileCurriculum();
      break;
    case 'bank':
      client.onProfileBank();
      break;
    case 'profitloss':
      client.onProfileProfitLoss();
      break;
    case 'companies':
      client.onProfileCompanies();
      break;
    case 'autoconnections':
      client.onProfileAutoConnections();
      break;
    case 'policy':
      client.onProfilePolicy();
      break;
  }
}

function TabContent({ tab }: { tab: ProfileTab }) {
  switch (tab) {
    case 'curriculum':
      return <CurriculumTab />;
    case 'bank':
      return <BankTab />;
    case 'profitloss':
      return <ProfitLossTab />;
    case 'companies':
      return <CompaniesTab />;
    case 'autoconnections':
      return <AutoConnectionsTab />;
    case 'policy':
      return <PolicyTab />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Tab sub-components
// ---------------------------------------------------------------------------

function CurriculumTab() {
  const data = useProfileStore((s) => s.curriculum);
  if (!data) return <EmptyState message="No curriculum data" />;

  return (
    <div className={styles.tabBody}>
      <div className={styles.statGrid}>
        <StatCard label="Level" value={data.currentLevelName} />
        <StatCard label="Ranking" value={`#${data.ranking}`} />
        <StatCard label="Prestige" value={String(data.prestige)} />
        <StatCard label="Budget" value={`$${data.budget}`} />
      </div>
      <div className={styles.statGrid}>
        <StatCard label="Facilities" value={`${data.facCount} / ${data.facMax}`} />
        <StatCard label="Area" value={String(data.area)} />
        <StatCard label="Fac. Prestige" value={String(data.facPrestige)} />
        <StatCard label="Research" value={String(data.researchPrestige)} />
      </div>
    </div>
  );
}

function BankTab() {
  const data = useProfileStore((s) => s.bankAccount);
  if (!data) return <EmptyState message="No bank data" />;

  return (
    <div className={styles.tabBody}>
      <div className={styles.statGrid}>
        <StatCard label="Balance" value={`$${data.balance}`} />
        <StatCard label="Max Loan" value={`$${data.maxLoan}`} />
      </div>
      {data.loans.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Active Loans</h4>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Bank</th>
                  <th>Amount</th>
                  <th>Rate</th>
                  <th>Term</th>
                  <th>Slice</th>
                </tr>
              </thead>
              <tbody>
                {data.loans.map((loan) => (
                  <tr key={loan.loanIndex}>
                    <td>{loan.bank}</td>
                    <td className={styles.numCell}>${loan.amount}</td>
                    <td className={styles.numCell}>{loan.interest}%</td>
                    <td className={styles.numCell}>{loan.term}y</td>
                    <td className={styles.numCell}>${loan.slice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data.loans.length === 0 && (
        <p className={styles.hint}>No active loans</p>
      )}
    </div>
  );
}

function ProfitLossTab() {
  const data = useProfileStore((s) => s.profitLoss);
  if (!data) return <EmptyState message="No P&L data" />;

  return (
    <div className={styles.tabBody}>
      <ProfitLossNode node={data.root} />
    </div>
  );
}

function ProfitLossNode({ node }: { node: { label: string; amount: string; level: number; isHeader?: boolean; children?: Array<{ label: string; amount: string; level: number; isHeader?: boolean; children?: unknown[] }> } }) {
  const indent = node.level * 12;
  return (
    <>
      <div
        className={`${styles.plRow} ${node.isHeader ? styles.plHeader : ''}`}
        style={{ paddingLeft: `${indent + 12}px` }}
      >
        <span className={styles.plLabel}>{node.label}</span>
        <span className={styles.plAmount}>{node.amount}</span>
      </div>
      {node.children?.map((child, i) => (
        <ProfitLossNode key={i} node={child as Parameters<typeof ProfitLossNode>[0]['node']} />
      ))}
    </>
  );
}

function CompaniesTab() {
  const data = useProfileStore((s) => s.companies);
  if (!data) return <EmptyState message="No companies data" />;

  return (
    <div className={styles.tabBody}>
      {data.companies.map((co) => (
        <div
          key={co.companyId}
          className={`${styles.listRow} ${co.name === data.currentCompany ? styles.activeRow : ''}`}
        >
          <div className={styles.rowMain}>
            <span className={styles.rowName}>{co.name}</span>
            <span className={styles.rowSub}>{co.cluster} &middot; {co.companyType}</span>
          </div>
          <div className={styles.rowMeta}>
            <span className={styles.rowValue}>{co.facilityCount} facilities</span>
            <span className={styles.rowSub}>{co.ownerRole}</span>
          </div>
        </div>
      ))}
      {data.companies.length === 0 && <EmptyState message="No companies" />}
    </div>
  );
}

function AutoConnectionsTab() {
  const data = useProfileStore((s) => s.autoConnections);
  if (!data) return <EmptyState message="No connections data" />;

  return (
    <div className={styles.tabBody}>
      {data.fluids.map((fluid) => (
        <div key={fluid.fluidId} className={styles.section}>
          <h4 className={styles.sectionTitle}>
            {fluid.fluidName}
            {fluid.hireTradeCenter && <span className={styles.tag}>Trade Center</span>}
            {fluid.onlyWarehouses && <span className={styles.tag}>Warehouses</span>}
          </h4>
          {fluid.suppliers.length > 0 ? (
            fluid.suppliers.map((s, i) => (
              <div key={i} className={styles.listRow}>
                <span className={styles.rowName}>{s.facilityName}</span>
                <span className={styles.rowSub}>{s.companyName}</span>
              </div>
            ))
          ) : (
            <p className={styles.hint}>No suppliers</p>
          )}
        </div>
      ))}
      {data.fluids.length === 0 && <EmptyState message="No auto-connections configured" />}
    </div>
  );
}

function PolicyTab() {
  const data = useProfileStore((s) => s.policy);
  if (!data) return <EmptyState message="No policy data" />;

  const policyLabel = (val: number) => {
    if (val === 0) return 'Neutral';
    if (val > 0) return 'Ally';
    return 'Enemy';
  };

  return (
    <div className={styles.tabBody}>
      {data.policies.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tycoon</th>
                <th>Your Policy</th>
                <th>Their Policy</th>
              </tr>
            </thead>
            <tbody>
              {data.policies.map((p) => (
                <tr key={p.tycoonName}>
                  <td>{p.tycoonName}</td>
                  <td>{policyLabel(p.yourPolicy)}</td>
                  <td>{policyLabel(p.theirPolicy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="No diplomatic policies" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className={styles.empty}>{message}</div>;
}
