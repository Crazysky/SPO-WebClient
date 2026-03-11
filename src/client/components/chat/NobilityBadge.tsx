/**
 * NobilityBadge — Displays nobility tier icon and modifier flag dots.
 *
 * Tier icons: Crown (Duke+), Shield (Marquess/Earl), Award (Baron/Viscount).
 * Modifier dots: tiny colored circles for each active account flag.
 */

import React, { memo } from 'react';
import { Crown, Shield, Award } from 'lucide-react';
import { CHAT_MODIFIER_FLAGS } from '../../../shared/types/domain-types';
import styles from './NobilityBadge.module.css';

interface NobilityBadgeProps {
  nobilityTier: string;
  modifiers: number;
  size?: 'sm' | 'md';
}

/** Modifier flag → CSS class + label for tooltip. */
const MODIFIER_DEFS = [
  { flag: CHAT_MODIFIER_FLAGS.GAME_MASTER, className: styles.modGameMaster, label: 'GM' },
  { flag: CHAT_MODIFIER_FLAGS.DEVELOPER,   className: styles.modDeveloper,   label: 'Dev' },
  { flag: CHAT_MODIFIER_FLAGS.SUPPORT,     className: styles.modSupport,     label: 'Support' },
  { flag: CHAT_MODIFIER_FLAGS.PUBLISHER,   className: styles.modPublisher,   label: 'Publisher' },
  { flag: CHAT_MODIFIER_FLAGS.AMBASSADOR,  className: styles.modAmbassador,  label: 'Ambassador' },
  { flag: CHAT_MODIFIER_FLAGS.VETERAN,     className: styles.modVeteran,     label: 'Veteran' },
  { flag: CHAT_MODIFIER_FLAGS.TRIAL,       className: styles.modTrial,       label: 'Trial' },
  { flag: CHAT_MODIFIER_FLAGS.NEWBIE,      className: styles.modNewbie,      label: 'Newbie' },
] as const;

function getTierIcon(tier: string, iconSize: number) {
  switch (tier) {
    case 'Sr. Duke':
    case 'Duke':
      return <Crown size={iconSize} className={`${styles.tierIcon} ${styles.tierGold}`} aria-hidden="true" />;
    case 'Marquess':
    case 'Earl':
      return <Shield size={iconSize} className={`${styles.tierIcon} ${styles.tierSilver}`} aria-hidden="true" />;
    case 'Viscount':
    case 'Baron':
      return <Award size={iconSize} className={`${styles.tierIcon} ${styles.tierBronze}`} aria-hidden="true" />;
    default:
      return null;
  }
}

function buildTooltip(tier: string, modifiers: number): string {
  const parts: string[] = [];
  if (tier !== 'Commoner') parts.push(tier);
  for (const def of MODIFIER_DEFS) {
    if (modifiers & def.flag) parts.push(def.label);
  }
  return parts.join(' \u2022 '); // bullet separator
}

export const NobilityBadge = memo(function NobilityBadge({
  nobilityTier,
  modifiers,
  size = 'sm',
}: NobilityBadgeProps) {
  const iconSize = size === 'sm' ? 9 : 12;
  const tierIcon = getTierIcon(nobilityTier, iconSize);

  const modDots: React.ReactElement[] = [];
  for (const def of MODIFIER_DEFS) {
    if (modifiers & def.flag) {
      modDots.push(<span key={def.label} className={`${styles.modDot} ${def.className}`} />);
    }
  }

  if (!tierIcon && modDots.length === 0) return null;

  const tooltip = buildTooltip(nobilityTier, modifiers);

  return (
    <span className={styles.badge} title={tooltip}>
      {tierIcon}
      {modDots}
    </span>
  );
});
