/**
 * LoginScreen — Cinematic full-screen login experience.
 *
 * Three stages with cinematic transitions:
 * A) Authentication — centered glassmorphed card on atmospheric background
 * B) World Selection — centered world card grid with gold hover glow
 * C) Company Selection — role-grouped company cards + create new
 *
 * The LoginBackground component provides animated floating orbs.
 * Each stage is a self-contained component that receives callbacks.
 */

import { useState, useCallback } from 'react';
import { useGameStore } from '../store';
import { useLegacyBridge } from '../context';
import { LoginBackground, AuthStage, WorldStage, CompanyStage } from '../components/login';
import styles from './LoginScreen.module.css';

export function LoginScreen() {
  const status = useGameStore((s) => s.status);
  const stage = useGameStore((s) => s.loginStage);
  const worlds = useGameStore((s) => s.loginWorlds);
  const companies = useGameStore((s) => s.companies);
  const isLoading = useGameStore((s) => s.loginLoading);
  const setLoginStage = useGameStore((s) => s.setLoginStage);
  const setLoginLoading = useGameStore((s) => s.setLoginLoading);

  const bridge = useLegacyBridge();
  const [selectedWorld, setSelectedWorld] = useState('');

  // Stage A → B: authenticate
  const handleConnect = useCallback(
    (username: string, password: string) => {
      setLoginLoading(true);
      bridge.current?.onDirectoryConnect(username, password);
    },
    [bridge, setLoginLoading],
  );

  // Stage B → C: select world
  const handleWorldSelect = useCallback(
    (worldName: string) => {
      setLoginLoading(true);
      setSelectedWorld(worldName);
      bridge.current?.onWorldSelect(worldName);
    },
    [bridge, setLoginLoading],
  );

  // Stage C → game: select company
  const handleCompanySelect = useCallback(
    (companyId: string) => {
      setLoginLoading(true);
      bridge.current?.onCompanySelect(companyId);
    },
    [bridge, setLoginLoading],
  );

  const handleCreateCompany = useCallback(() => {
    bridge.current?.onCreateCompany();
  }, [bridge]);

  const handleBackToWorlds = useCallback(() => {
    setLoginStage('worlds');
  }, [setLoginStage]);

  return (
    <div className={styles.screen}>
      <LoginBackground />

      {stage === 'auth' && (
        <AuthStage
          onConnect={handleConnect}
          isLoading={isLoading}
          status={status}
        />
      )}

      {stage === 'worlds' && (
        <WorldStage
          worlds={worlds}
          onSelect={handleWorldSelect}
          isLoading={isLoading}
        />
      )}

      {stage === 'companies' && (
        <CompanyStage
          companies={companies}
          worldName={selectedWorld}
          onSelect={handleCompanySelect}
          onCreate={handleCreateCompany}
          onBack={handleBackToWorlds}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
