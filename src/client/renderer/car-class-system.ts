/**
 * StarPeace Car Class System
 *
 * Parses car class INI files from cache/CarClasses/ and provides
 * vehicle type definitions for the vehicle animation system.
 *
 * Each car class defines:
 * - Id: unique identifier
 * - Prob: spawn probability weight (0-1)
 * - Cargo: vehicle cargo type ('People' | 'Light')
 * - Images: 8-direction sprite filenames (64x32 isometric)
 */

import { parseIniFile } from './road-texture-system';

/** The 8 compass directions used for vehicle sprites */
export const CAR_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CarDirection = typeof CAR_DIRECTIONS[number];

/**
 * Car class configuration loaded from INI file
 */
export interface CarClassConfig {
  id: number;
  prob: number;
  cargo: string;
  images: Record<string, string>; // direction -> BMP filename
}

/**
 * Load a car class configuration from INI content.
 *
 * Expected format:
 * [General]
 * Id = 6
 * Prob = 1
 * Cargo = People
 *
 * [Images]
 * 64X32N = Car1.N.bmp
 * 64X32NE = Car1.NE.bmp
 * ...
 */
export function loadCarClassFromIni(iniContent: string): CarClassConfig {
  const sections = parseIniFile(iniContent);

  const general = sections.get('General') ?? new Map<string, string>();
  const imagesSection = sections.get('Images') ?? new Map<string, string>();

  const id = parseInt(general.get('Id') ?? '0', 10);
  const prob = parseFloat(general.get('Prob') ?? '1');
  const cargo = general.get('Cargo') ?? 'People';

  // Parse image mappings: "64X32N" -> direction "N", value is BMP filename
  const images: Record<string, string> = {};
  for (const dir of CAR_DIRECTIONS) {
    const key = `64X32${dir}`;
    const filename = imagesSection.get(key);
    if (filename) {
      images[dir] = filename;
    }
  }

  return { id, prob, cargo, images };
}

/**
 * Manages car class definitions for the vehicle animation system.
 */
export class CarClassManager {
  private classes: Map<number, CarClassConfig> = new Map();
  private totalProbWeight: number = 0;

  /**
   * Load a car class from INI content
   */
  loadFromIni(iniContent: string): void {
    const config = loadCarClassFromIni(iniContent);
    this.classes.set(config.id, config);
    this.recalculateProbWeight();
  }

  /**
   * Load multiple car classes from an array of INI contents
   */
  loadAll(iniContents: string[]): void {
    for (const content of iniContents) {
      const config = loadCarClassFromIni(content);
      this.classes.set(config.id, config);
    }
    this.recalculateProbWeight();
  }

  /**
   * Get a car class by ID
   */
  getClass(id: number): CarClassConfig | undefined {
    return this.classes.get(id);
  }

  /**
   * Get all loaded car classes
   */
  getAllClasses(): CarClassConfig[] {
    return Array.from(this.classes.values());
  }

  /**
   * Get the number of loaded classes
   */
  getClassCount(): number {
    return this.classes.size;
  }

  /**
   * Select a random car class, weighted by probability.
   * Trucks (Prob=0.2) spawn less often than cars/vans (Prob=1).
   */
  getRandomClass(): CarClassConfig | undefined {
    if (this.classes.size === 0) return undefined;

    let roll = Math.random() * this.totalProbWeight;
    for (const config of this.classes.values()) {
      roll -= config.prob;
      if (roll <= 0) return config;
    }

    // Fallback: return last class
    const values = Array.from(this.classes.values());
    return values[values.length - 1];
  }

  /**
   * Get the sprite filename for a car class and direction
   */
  getImageFilename(classId: number, direction: string): string | null {
    const config = this.classes.get(classId);
    if (!config) return null;
    return config.images[direction] ?? null;
  }

  /**
   * Clear all loaded classes
   */
  clear(): void {
    this.classes.clear();
    this.totalProbWeight = 0;
  }

  private recalculateProbWeight(): void {
    this.totalProbWeight = 0;
    for (const config of this.classes.values()) {
      this.totalProbWeight += config.prob;
    }
  }
}
