/**
 * src/shared/types.ts
 *
 * THE GOLDEN CONTRACT (Barrel Re-export)
 * --------------------------------------
 * This file re-exports all types from the modular type system.
 * Maintains backward compatibility for existing imports.
 *
 * New code should import from specific modules:
 *   - import { RdoPacket } from '../shared/types/protocol-types'
 *   - import { WorldInfo } from '../shared/types/domain-types'
 *   - import { WsMessageType } from '../shared/types/message-types'
 *
 * Or from the barrel export:
 *   - import { RdoPacket, WorldInfo, WsMessageType } from '../shared/types'
 */

export * from './types/index';
