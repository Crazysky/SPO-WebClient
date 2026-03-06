/**
 * Smoke tests for login stage components.
 */

import { describe, it, expect } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../__tests__/setup/render-helpers';
import { AuthStage } from './AuthStage';
import { WorldStage } from './WorldStage';
import { ZoneStage } from './ZoneStage';
import { CompanyStage } from './CompanyStage';
import type { WorldInfo, CompanyInfo } from '@/shared/types';

// ---------------------------------------------------------------------------
// AuthStage
// ---------------------------------------------------------------------------

describe('AuthStage', () => {
  const defaultProps = {
    onConnect: () => {},
    isLoading: false,
    status: 'idle',
  };

  it('renders login form', () => {
    renderWithProviders(<AuthStage {...defaultProps} />);
    expect(screen.getByPlaceholderText('Username')).toBeTruthy();
    expect(screen.getByPlaceholderText('Password')).toBeTruthy();
    expect(screen.getByText('Enter the World')).toBeTruthy();
  });

  it('renders loading state', () => {
    renderWithProviders(<AuthStage {...defaultProps} isLoading />);
    expect(screen.getByText('Connecting...')).toBeTruthy();
  });

  it('shows logo and tagline', () => {
    renderWithProviders(<AuthStage {...defaultProps} />);
    expect(screen.getByText('STARPEACE ONLINE')).toBeTruthy();
    expect(screen.getByText('Build your empire. Shape the world.')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ZoneStage
// ---------------------------------------------------------------------------

describe('ZoneStage', () => {
  it('renders zone selection title', () => {
    renderWithProviders(<ZoneStage onSelect={() => {}} isLoading={false} />);
    expect(screen.getByText('Select a Region')).toBeTruthy();
  });

  it('renders zone cards', () => {
    renderWithProviders(<ZoneStage onSelect={() => {}} isLoading={false} />);
    expect(screen.getByText('BETA')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// WorldStage
// ---------------------------------------------------------------------------

describe('WorldStage', () => {
  const worlds: WorldInfo[] = [
    { name: 'Shamba', url: '', ip: '127.0.0.1', port: 1234, running3: true, online: 12, players: 12, population: 5000 },
    { name: 'Offline World', url: '', ip: '127.0.0.1', port: 1234, running3: false, online: 0, players: 0, population: 0 },
  ];

  it('renders world selection title', () => {
    renderWithProviders(<WorldStage worlds={worlds} onSelect={() => {}} isLoading={false} />);
    expect(screen.getByText('Select a World')).toBeTruthy();
  });

  it('renders available worlds', () => {
    renderWithProviders(<WorldStage worlds={worlds} onSelect={() => {}} isLoading={false} />);
    expect(screen.getByText('Shamba')).toBeTruthy();
  });

  it('renders offline worlds', () => {
    renderWithProviders(<WorldStage worlds={worlds} onSelect={() => {}} isLoading={false} />);
    expect(screen.getByText('Offline World')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// CompanyStage
// ---------------------------------------------------------------------------

describe('CompanyStage', () => {
  const companies: CompanyInfo[] = [
    { id: '1', name: 'TestCo', ownerRole: 'Owner', value: 500000 },
    { id: '2', name: 'Shamba Gov', ownerRole: 'President of Shamba', value: 0 },
  ];

  const defaultProps = {
    companies,
    worldName: 'Shamba',
    onSelect: () => {},
    onCreate: () => {},
    onBack: () => {},
    isLoading: false,
  };

  it('renders company selection title', () => {
    renderWithProviders(<CompanyStage {...defaultProps} />);
    expect(screen.getByText('Select a Company')).toBeTruthy();
    expect(screen.getByText('Shamba')).toBeTruthy();
  });

  it('separates owned and political companies', () => {
    renderWithProviders(<CompanyStage {...defaultProps} />);
    expect(screen.getByText('Your Companies')).toBeTruthy();
    expect(screen.getByText('Political Offices')).toBeTruthy();
  });

  it('renders company names', () => {
    renderWithProviders(<CompanyStage {...defaultProps} />);
    expect(screen.getByText('TestCo')).toBeTruthy();
    expect(screen.getByText('Shamba Gov')).toBeTruthy();
  });

  it('renders create new company card', () => {
    renderWithProviders(<CompanyStage {...defaultProps} />);
    expect(screen.getByText('Create New Company')).toBeTruthy();
  });

  it('renders back button', () => {
    renderWithProviders(<CompanyStage {...defaultProps} />);
    expect(screen.getByText('Back to worlds')).toBeTruthy();
  });
});
