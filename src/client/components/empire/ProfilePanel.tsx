/**
 * ProfilePanel — Tabbed tycoon profile (replaces EmpireOverview).
 *
 * Tabs: Curriculum, Bank, P&L, Companies, Connections, Policy.
 * Each tab fetches data from the server on activation via ClientCallbacks.
 */

import { useEffect, useState } from 'react';
import {
  GraduationCap, Landmark, TrendingUp, Factory, Link, Flag, X, Plus,
} from 'lucide-react';
import { Skeleton, SkeletonLines } from '../common';
import { useProfileStore, type ProfileTab } from '../../store/profile-store';
import { useClient } from '../../context';
import type { AutoConnectionActionType } from '@/shared/types';
import styles from './ProfilePanel.module.css';

const TABS: Array<{ id: ProfileTab; icon: typeof GraduationCap; label: string }> = [
  { id: 'curriculum', icon: GraduationCap, label: 'CV' },
  { id: 'bank', icon: Landmark, label: 'Bank' },
  { id: 'profitloss', icon: TrendingUp, label: 'P&L' },
  { id: 'companies', icon: Factory, label: 'Co.' },
  { id: 'autoconnections', icon: Link, label: 'Connect' },
  { id: 'policy', icon: Flag, label: 'Policy' },
];

export function ProfilePanel() {
  const currentTab = useProfileStore((s) => s.currentTab);
  const isLoading = useProfileStore((s) => s.isLoading);
  const refreshCounter = useProfileStore((s) => s.refreshCounter);
  const setCurrentTab = useProfileStore((s) => s.setCurrentTab);
  const client = useClient();

  // Fetch data when tab changes or after a successful action
  useEffect(() => {
    requestTabData(currentTab, client);
  }, [currentTab, client, refreshCounter]);

  return (
    <div className={styles.panel}>
      <PillGrid activeTab={currentTab} onTabChange={setCurrentTab} />
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

// ---------------------------------------------------------------------------
// Pill Grid — compact 3x2 tab selector
// ---------------------------------------------------------------------------

function PillGrid({ activeTab, onTabChange }: { activeTab: ProfileTab; onTabChange: (id: ProfileTab) => void }) {
  return (
    <div className={styles.pillGrid} role="tablist">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTab}
            className={`${styles.pill} ${tab.id === activeTab ? styles.pillActive : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <Icon size={14} className={styles.pillIcon} />
            <span className={styles.pillLabel}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

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
  const client = useClient();
  const [action, setAction] = useState<'borrow' | 'send' | null>(null);
  const [amount, setAmount] = useState('');
  const [toTycoon, setToTycoon] = useState('');
  const [reason, setReason] = useState('');

  if (!data) return <EmptyState message="No bank data" />;

  const handleBorrow = () => {
    if (!amount) return;
    client.onProfileBankAction('borrow', amount);
    setAction(null);
    setAmount('');
  };

  const handleSend = () => {
    if (!amount || !toTycoon) return;
    client.onProfileBankAction('send', amount, toTycoon, reason || undefined);
    setAction(null);
    setAmount('');
    setToTycoon('');
    setReason('');
  };

  const handlePayoff = (loanIndex: number) => {
    client.onProfileBankAction('payoff', undefined, undefined, undefined, loanIndex);
  };

  const cancelAction = () => {
    setAction(null);
    setAmount('');
    setToTycoon('');
    setReason('');
  };

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
                  <th></th>
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
                    <td>
                      <button
                        className={styles.payoffBtn}
                        onClick={() => handlePayoff(loan.loanIndex)}
                      >
                        Reimburse
                      </button>
                    </td>
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

      {/* Action buttons */}
      <div className={styles.actionBar}>
        <button
          className={`${styles.actionPill} ${action === 'borrow' ? styles.actionPillActive : ''}`}
          onClick={() => setAction(action === 'borrow' ? null : 'borrow')}
        >
          Request Loan
        </button>
        <button
          className={`${styles.actionPill} ${action === 'send' ? styles.actionPillActive : ''}`}
          onClick={() => setAction(action === 'send' ? null : 'send')}
        >
          Send Money
        </button>
      </div>

      {/* Inline forms */}
      {action === 'borrow' && (
        <div className={styles.inlineForm}>
          <label className={styles.formLabel}>Amount</label>
          <input
            className={styles.formInput}
            type="text"
            placeholder="Enter amount..."
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className={styles.hint}>Max loan: ${data.maxLoan} &middot; Rate: {data.defaultInterest}% &middot; Term: {data.defaultTerm}y</p>
          <div className={styles.formActions}>
            <button className={styles.formSubmit} onClick={handleBorrow} disabled={!amount}>Borrow</button>
            <button className={styles.formCancel} onClick={cancelAction}>Cancel</button>
          </div>
        </div>
      )}
      {action === 'send' && (
        <div className={styles.inlineForm}>
          <label className={styles.formLabel}>Recipient</label>
          <input
            className={styles.formInput}
            type="text"
            placeholder="Tycoon name..."
            value={toTycoon}
            onChange={(e) => setToTycoon(e.target.value)}
          />
          <label className={styles.formLabel}>Amount</label>
          <input
            className={styles.formInput}
            type="text"
            placeholder="Enter amount..."
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <label className={styles.formLabel}>Reason (optional)</label>
          <input
            className={styles.formInput}
            type="text"
            placeholder="Reason..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className={styles.formActions}>
            <button className={styles.formSubmit} onClick={handleSend} disabled={!amount || !toTycoon}>Send</button>
            <button className={styles.formCancel} onClick={cancelAction}>Cancel</button>
          </div>
        </div>
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
  const client = useClient();
  const [addingFluid, setAddingFluid] = useState<string | null>(null);
  const [supplierInput, setSupplierInput] = useState('');

  if (!data) return <EmptyState message="No connections data" />;

  const toggleOption = (fluidId: string, current: boolean, onAction: AutoConnectionActionType, offAction: AutoConnectionActionType) => {
    client.onProfileAutoConnectionAction(current ? offAction : onAction, fluidId);
  };

  const handleDeleteSupplier = (fluidId: string, facilityId: string) => {
    client.onProfileAutoConnectionAction('delete', fluidId, facilityId);
  };

  const handleAddSupplier = (fluidId: string) => {
    if (!supplierInput) return;
    client.onProfileAutoConnectionAction('add', fluidId, supplierInput);
    setAddingFluid(null);
    setSupplierInput('');
  };

  return (
    <div className={styles.tabBody}>
      {data.fluids.map((fluid) => (
        <div key={fluid.fluidId} className={styles.section}>
          <h4 className={styles.sectionTitle}>{fluid.fluidName}</h4>

          {/* Toggle switches */}
          <div className={styles.toggleGroup}>
            <div
              className={styles.toggleRow}
              onClick={() => toggleOption(fluid.fluidId, fluid.hireTradeCenter, 'hireTradeCenter', 'dontHireTradeCenter')}
            >
              <span className={styles.toggleLabel}>Trade Center</span>
              <div className={`${styles.toggle} ${fluid.hireTradeCenter ? styles.toggleOn : ''}`}>
                <div className={styles.toggleThumb} />
              </div>
            </div>
            <div
              className={styles.toggleRow}
              onClick={() => toggleOption(fluid.fluidId, fluid.onlyWarehouses, 'onlyWarehouses', 'dontOnlyWarehouses')}
            >
              <span className={styles.toggleLabel}>Warehouses Only</span>
              <div className={`${styles.toggle} ${fluid.onlyWarehouses ? styles.toggleOn : ''}`}>
                <div className={styles.toggleThumb} />
              </div>
            </div>
          </div>

          {/* Supplier list */}
          {fluid.suppliers.length > 0 ? (
            fluid.suppliers.map((s, i) => (
              <div key={i} className={styles.listRow}>
                <div className={styles.rowMain}>
                  <span className={styles.rowName}>{s.facilityName}</span>
                  <span className={styles.rowSub}>{s.companyName}</span>
                </div>
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDeleteSupplier(fluid.fluidId, s.facilityId)}
                  aria-label={`Remove ${s.facilityName}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))
          ) : (
            <p className={styles.hint}>No suppliers</p>
          )}

          {/* Add supplier */}
          {addingFluid === fluid.fluidId ? (
            <div className={styles.inlineForm}>
              <label className={styles.formLabel}>Supplier Facility ID</label>
              <input
                className={styles.formInput}
                type="text"
                placeholder="Facility ID..."
                value={supplierInput}
                onChange={(e) => setSupplierInput(e.target.value)}
              />
              <div className={styles.formActions}>
                <button className={styles.formSubmit} onClick={() => handleAddSupplier(fluid.fluidId)} disabled={!supplierInput}>Add</button>
                <button className={styles.formCancel} onClick={() => { setAddingFluid(null); setSupplierInput(''); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button
              className={styles.addBtn}
              onClick={() => setAddingFluid(fluid.fluidId)}
            >
              <Plus size={12} />
              <span>Add Supplier</span>
            </button>
          )}
        </div>
      ))}
      {data.fluids.length === 0 && <EmptyState message="No auto-connections configured" />}
    </div>
  );
}

function PolicyTab() {
  const data = useProfileStore((s) => s.policy);
  const client = useClient();
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
                  <td>
                    <div className={styles.policyBtnGroup}>
                      <button
                        className={`${styles.policyBtn} ${p.yourPolicy < 0 ? styles.policyEnemy : ''}`}
                        onClick={() => client.onProfilePolicySet(p.tycoonName, -1)}
                      >
                        Enemy
                      </button>
                      <button
                        className={`${styles.policyBtn} ${p.yourPolicy === 0 ? styles.policyNeutral : ''}`}
                        onClick={() => client.onProfilePolicySet(p.tycoonName, 0)}
                      >
                        Neutral
                      </button>
                      <button
                        className={`${styles.policyBtn} ${p.yourPolicy > 0 ? styles.policyAlly : ''}`}
                        onClick={() => client.onProfilePolicySet(p.tycoonName, 1)}
                      >
                        Ally
                      </button>
                    </div>
                  </td>
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
