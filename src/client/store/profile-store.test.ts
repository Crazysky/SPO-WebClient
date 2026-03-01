/**
 * Tests for profile-store state management.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { useProfileStore } from './profile-store';
import type { CurriculumData, BankAccountData, PolicyData } from '@/shared/types';

const mockCurriculum: CurriculumData = {
  tycoonName: 'TestTycoon',
  currentLevel: 3,
  currentLevelName: 'Entrepreneur',
  currentLevelDescription: 'A seasoned entrepreneur',
  nextLevelName: 'Mogul',
  nextLevelDescription: 'A powerful mogul',
  nextLevelRequirements: 'Reach $10M fortune',
  canUpgrade: true,
  isUpgradeRequested: false,
  fortune: '$1,500,000',
  averageProfit: '$50,000',
  prestige: 120,
  facPrestige: 80,
  researchPrestige: 40,
  budget: '1500000',
  ranking: 5,
  facCount: 12,
  facMax: 50,
  area: 100,
  nobPoints: 45,
  rankings: [],
  curriculumItems: [],
};

const mockBank: BankAccountData = {
  balance: '250000',
  maxLoan: '500000',
  totalLoans: '100000',
  maxTransfer: '1000000',
  loans: [],
  totalNextPayment: '5000',
  defaultInterest: 5,
  defaultTerm: 10,
};

const mockPolicy: PolicyData = {
  policies: [
    { tycoonName: 'TestPlayer', yourPolicy: 0, theirPolicy: 1 },
  ],
};

describe('Profile Store', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  it('should start with all tab data null', () => {
    const state = useProfileStore.getState();
    expect(state.profile).toBeNull();
    expect(state.curriculum).toBeNull();
    expect(state.bankAccount).toBeNull();
    expect(state.profitLoss).toBeNull();
    expect(state.companies).toBeNull();
    expect(state.autoConnections).toBeNull();
    expect(state.policy).toBeNull();
    expect(state.refreshCounter).toBe(0);
  });

  it('setCurriculum should store curriculum data and clear loading', () => {
    useProfileStore.getState().setLoading(true);
    useProfileStore.getState().setCurriculum(mockCurriculum);
    const state = useProfileStore.getState();
    expect(state.curriculum).toEqual(mockCurriculum);
    expect(state.isLoading).toBe(false);
  });

  it('setBankAccount should store bank data and clear loading', () => {
    useProfileStore.getState().setLoading(true);
    useProfileStore.getState().setBankAccount(mockBank);
    const state = useProfileStore.getState();
    expect(state.bankAccount).toEqual(mockBank);
    expect(state.isLoading).toBe(false);
  });

  it('setPolicy should store policy data and clear loading', () => {
    useProfileStore.getState().setLoading(true);
    useProfileStore.getState().setPolicy(mockPolicy);
    const state = useProfileStore.getState();
    expect(state.policy).toEqual(mockPolicy);
    expect(state.isLoading).toBe(false);
  });

  it('incrementRefresh should bump the counter', () => {
    expect(useProfileStore.getState().refreshCounter).toBe(0);
    useProfileStore.getState().incrementRefresh();
    expect(useProfileStore.getState().refreshCounter).toBe(1);
    useProfileStore.getState().incrementRefresh();
    expect(useProfileStore.getState().refreshCounter).toBe(2);
  });

  describe('reset()', () => {
    it('should clear all tab data and reset counter', () => {
      // Populate state
      useProfileStore.getState().setCurriculum(mockCurriculum);
      useProfileStore.getState().setBankAccount(mockBank);
      useProfileStore.getState().setPolicy(mockPolicy);
      useProfileStore.getState().incrementRefresh();
      useProfileStore.getState().setCurrentTab('bank');

      // Verify populated
      expect(useProfileStore.getState().curriculum).not.toBeNull();
      expect(useProfileStore.getState().bankAccount).not.toBeNull();
      expect(useProfileStore.getState().currentTab).toBe('bank');

      // Reset
      useProfileStore.getState().reset();

      const state = useProfileStore.getState();
      expect(state.profile).toBeNull();
      expect(state.curriculum).toBeNull();
      expect(state.bankAccount).toBeNull();
      expect(state.profitLoss).toBeNull();
      expect(state.companies).toBeNull();
      expect(state.autoConnections).toBeNull();
      expect(state.policy).toBeNull();
      expect(state.refreshCounter).toBe(0);
      expect(state.currentTab).toBe('curriculum');
      expect(state.isLoading).toBe(false);
    });
  });
});
