/**
 * Map Data Service
 * Handles CAB extraction, INI parsing, and map file management
 */

import * as fs from 'fs';
import * as path from 'path';
import { MapMetadata, MapTownInfo } from '../shared/map-config';
import type { Service } from './service-registry';

export class MapDataService implements Service {
  public readonly name = 'mapData';

  private cacheRoot: string;
  private extracted: Set<string> = new Set();

  constructor(cacheRoot: string = path.join(__dirname, '../../cache')) {
    this.cacheRoot = cacheRoot;
  }

  /**
   * Extract CAB file if not already extracted
   * For now, check if .bmp and .ini already exist
   * If not, log a warning (CAB extraction to be implemented)
   */
  async extractCabFile(mapName: string): Promise<void> {
    if (this.extracted.has(mapName)) {
      return; // Already extracted
    }

    const mapDir = path.join(this.cacheRoot, 'Maps', mapName);
    const bmpPath = path.join(mapDir, `${mapName}.bmp`);
    const iniPath = path.join(mapDir, `${mapName}.ini`);

    // Check if files already exist
    if (fs.existsSync(bmpPath) && fs.existsSync(iniPath)) {
      console.log(`[MapDataService] Map ${mapName} already extracted`);
      this.extracted.add(mapName);
      return;
    }

    // Check if CAB file exists
    const cabPath = path.join(mapDir, 'images.cab');
    if (!fs.existsSync(cabPath)) {
      throw new Error(`CAB file not found for map ${mapName}: ${cabPath}`);
    }

    console.log(`[MapDataService] Extracting CAB for ${mapName}...`);

    // TODO: Implement CAB extraction
    // For now, throw error if files don't exist
    throw new Error(`CAB extraction not yet implemented. Please manually extract ${cabPath} to ${mapDir}`);
  }

  /**
   * Parse INI file and return map metadata
   */
  async getMapMetadata(mapName: string): Promise<MapMetadata> {
    const iniPath = path.join(this.cacheRoot, 'Maps', mapName, `${mapName}.ini`);

    if (!fs.existsSync(iniPath)) {
      throw new Error(`INI file not found: ${iniPath}`);
    }

    const iniContent = fs.readFileSync(iniPath, 'utf-8');
    return this.parseINI(iniContent, mapName);
  }

  /**
   * Get absolute path to BMP file
   */
  getBmpFilePath(mapName: string): string {
    return path.join(this.cacheRoot, 'Maps', mapName, `${mapName}.bmp`);
  }

  /**
   * Parse INI file content
   */
  private parseINI(content: string, mapName: string): MapMetadata {
    const lines = content.split('\n').map(l => l.trim());

    const metadata: MapMetadata = {
      name: mapName,
      width: 2000,
      height: 2000,
      groundHref: '',
      towns: [],
      clusters: []
    };

    let currentSection = '';
    const towns: Map<number, Partial<MapTownInfo>> = new Map();

    for (const line of lines) {
      // Skip empty lines and comments
      if (!line || line.startsWith('#') || line.startsWith(';')) {
        continue;
      }

      // Section headers
      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.slice(1, -1);
        continue;
      }

      // Parse key=value pairs
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }

      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();

      if (currentSection === 'General') {
        if (key === 'Name') metadata.name = value;
        else if (key === 'Width') metadata.width = parseInt(value, 10);
        else if (key === 'Height') metadata.height = parseInt(value, 10);
      }
      else if (currentSection === 'Ground') {
        if (key === 'href') metadata.groundHref = value;
      }
      else if (currentSection === 'Clusters') {
        // Cluster0 = Moab, Cluster1 = Dissidents, ...
        const match = key.match(/^Cluster(\d+)$/);
        if (match) {
          metadata.clusters.push(value);
        }
      }
      else if (currentSection === 'Towns') {
        // TownName0 = Sparta, TownCluster0 = PGI, TownX0 = 994, TownY0 = 493
        const nameMatch = key.match(/^TownName(\d+)$/);
        const clusterMatch = key.match(/^TownCluster(\d+)$/);
        const xMatch = key.match(/^TownX(\d+)$/);
        const yMatch = key.match(/^TownY(\d+)$/);

        if (nameMatch) {
          const index = parseInt(nameMatch[1], 10);
          if (!towns.has(index)) towns.set(index, {});
          towns.get(index)!.name = value;
        } else if (clusterMatch) {
          const index = parseInt(clusterMatch[1], 10);
          if (!towns.has(index)) towns.set(index, {});
          towns.get(index)!.cluster = value;
        } else if (xMatch) {
          const index = parseInt(xMatch[1], 10);
          if (!towns.has(index)) towns.set(index, {});
          towns.get(index)!.x = parseInt(value, 10);
        } else if (yMatch) {
          const index = parseInt(yMatch[1], 10);
          if (!towns.has(index)) towns.set(index, {});
          towns.get(index)!.y = parseInt(value, 10);
        }
      }
    }

    // Convert towns map to array
    for (const town of towns.values()) {
      if (town.name && town.cluster !== undefined && town.x !== undefined && town.y !== undefined) {
        metadata.towns.push({
          name: town.name,
          cluster: town.cluster,
          x: town.x,
          y: town.y
        });
      }
    }

    return metadata;
  }
}
