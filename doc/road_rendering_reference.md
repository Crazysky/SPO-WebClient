# Données de référence - Système de rendu des routes (Reverse Engineered)

**Source:** Client officiel Starpeace Online (Delphi)
**Fichiers clés:** `Concrete.pas`, `Roads.pas`, `Map.pas`, `VoyagerServerInterfaces.pas`

---

## 1. Types de terrain pour l'eau (TerrainGrid)

### 1.1 Encodage dans la palette BMP

**Source:** `Voyager/Components/MapIsoView/Concrete.pas`

```typescript
const cPlatformFlag = 0x80;  // Bit haut = eau
const cPlatformMask = 0x7F;  // Masque pour extraire le type

// Détection:
function isWater(paletteIndex: number): boolean {
  return (paletteIndex & 0x80) !== 0;
}

// Extraction du type:
function getWaterType(paletteIndex: number): number {
  return paletteIndex & 0x7F;  // Retourne 0-8
}
```

### 1.2 Table de mapping Palette → Type d'eau

| Palette Index | Valeur Type | Constante | Description |
|---------------|-------------|-----------|-------------|
| 0x80 (128) | 0 | `WATER_CENTER` | Centre (eau complète, 4 voisins eau) |
| 0x81 (129) | 1 | `WATER_N` | Bord Nord (eau au Nord) |
| 0x82 (130) | 2 | `WATER_E` | Bord Est (eau à l'Est) |
| 0x83 (131) | 3 | `WATER_NE` | Coin Nord-Est |
| 0x84 (132) | 4 | `WATER_S` | Bord Sud (eau au Sud) |
| 0x85 (133) | 5 | `WATER_SW` | Coin Sud-Ouest |
| 0x86 (134) | 6 | `WATER_W` | Bord Ouest (eau à l'Ouest) |
| 0x87 (135) | 7 | `WATER_SE` | Coin Sud-Est |
| 0x88 (136) | 8 | `WATER_NW` | Coin Nord-Ouest |

**Total:** 9 types d'eau (0-8)

### 1.3 Configuration 8-voisins

**Source:** `Concrete.pas:66-77` - `cWaterConcreteConfigs`

```typescript
// Configuration [NW, NE, SE, SW] pour chaque type d'eau
// true = voisin a de l'eau, false = voisin a de la terre
const waterConfigs: boolean[][] = [
  [true,  true,  true,  true],   // 0 - WATER_CENTER (4 coins eau)
  [false, true,  false, true],   // 1 - WATER_N (coins NE et NW eau)
  [true,  true,  false, false],  // 2 - WATER_E (coins NE et SE eau)
  [true,  true,  false, true],   // 3 - WATER_NE (coins NE, NW, SW eau)
  [true,  true,  true,  false],  // 4 - WATER_S (coins SE et SW eau)
  [false, false, true,  true],   // 5 - WATER_SW (coins SW et SE eau)
  [false, true,  true,  true],   // 6 - WATER_W (coins NW et SW eau)
  [true,  false, true,  true],   // 7 - WATER_SE (coins SE, SW, NW eau)
  [true,  false, true,  false]   // 8 - WATER_NW (coins NW et SW eau)
];
```

### 1.4 Structure TypeScript

```typescript
interface TerrainCell {
  isWater: boolean;    // (paletteIndex & 0x80) !== 0
  waterType: number;   // paletteIndex & 0x7F (0-8)
}

class TerrainGridParser {
  parseTerrainGrid(bmpData: Uint8Array, width: number, height: number): TerrainCell[][] {
    const grid: TerrainCell[][] = [];

    for (let i = 0; i < height; i++) {
      grid[i] = [];
      for (let j = 0; j < width; j++) {
        const paletteIndex = bmpData[i * width + j];

        grid[i][j] = {
          isWater: (paletteIndex & 0x80) !== 0,
          waterType: paletteIndex & 0x7F
        };
      }
    }

    return grid;
  }
}
```

---

## 2. Grille de béton (ConcreteGrid)

### 2.1 Source des données

**Source:** `Map.pas:2312-2321`

**Important:** Pas de fichier `.concrete` séparé ! Le béton est calculé **dynamiquement** à partir des bâtiments urbains.

### 2.2 Algorithme de calcul

```typescript
// Pseudo-code basé sur Map.pas
function calculateConcreteGrid(buildings: Building[]): number[][] {
  const grid: number[][] = Array(mapHeight).fill(0).map(() => Array(mapWidth).fill(0));
  const CONCRETE_SIZE = 2;  // Rayon d'expansion du béton

  for (const building of buildings) {
    if (!building.isUrban) continue;  // Seulement bâtiments urbains

    const { row, col, size } = building;

    // Expand béton autour du bâtiment
    for (let i = row - CONCRETE_SIZE; i < row + size + CONCRETE_SIZE; i++) {
      for (let j = col - CONCRETE_SIZE; j < col + size + CONCRETE_SIZE; j++) {
        if (i >= 0 && i < mapHeight && j >= 0 && j < mapWidth) {
          grid[i][j]++;  // Incrémente compteur béton
        }
      }
    }
  }

  return grid;
}

// Usage pour les routes
function hasConcrete(x: number, y: number): boolean {
  return concreteGrid[y][x] > 0;
}
```

### 2.3 Structure de stockage

**Source:** `Map.pas` - `TConcreteItems`

```typescript
// Grid 64×64 par bloc (chunk)
type ConcreteItems = Uint8Array;  // [64 * 64]
type TConcrete = number;  // 0-12

// Configurations béton (similaire à l'eau)
const cFullConcrete = 12;      // Béton complet (sous un bâtiment)
const cRoadConcrete = 0x10;    // Modificateur pour routes

// 13 configurations béton selon les 8 voisins (0-12)
// Même logique que les types d'eau pour déterminer la texture
```

### 2.4 Propriété Urban des bâtiments

```typescript
interface Building {
  id: number;
  row: number;
  col: number;
  size: number;
  isUrban: boolean;  // buildclass.Urban = true → génère du béton
}

// Exemples de bâtiments urbains:
// - Offices
// - Magasins
// - Immeubles résidentiels
// - Services publics (police, pompiers, etc.)
```

---

## 3. Grille de voies ferrées (RailroadGrid)

### 3.1 Format des segments

**Source:** `VoyagerServerInterfaces.pas` - `TSegmentInfo`

```typescript
interface RailSegment {
  x1: number;  // word - Point de départ X
  y1: number;  // word - Point de départ Y
  x2: number;  // word - Point d'arrivée X
  y2: number;  // word - Point d'arrivée Y
  cargo?: number[];  // TCargoArray - Cargaisons transportées
}
```

**Format identique aux segments de routes** (`{x1, y1, x2, y2}`)

### 3.2 RDO Protocol

```typescript
const cirRoads = 1;      // Identifiant circuits routes
const cirRailRoads = 2;  // Identifiant circuits rails

// Récupération via RDO
interface IRailroadsRendering {
  RefreshArea(circuitType: number, x: number, y: number, w: number, h: number): RailSegment[];
}

// Exemple d'appel
const railSegments = fCircuitsHandler.RefreshArea(cirRailRoads, x, y, width, height);
```

### 3.3 Types de blocs rail

**Source:** `Roads.pas`

**Total:** 60 types de blocs rail (vs 16 pour routes)

| Catégorie | Exemples | Description |
|-----------|----------|-------------|
| **Basiques** | `rrbNS`, `rrbWE`, `rrbNSStart`, `rrbWEEnd` | Segments droits avec start/end |
| **Jonctions** | `rrbmNE`, `rrbmtN`, `rrbc` | Merge points et centre |
| **Ponts** | `rrbNSBrClimb1`, `rrbNSBrClimb2`, `rrbNSBr`, `rrbNSBrDesc1`, `rrbNSBrDesc2` | Rails sur ponts avec montées/descentes |
| **Croisements** | `rrbcNE`, `rrbctN` | Croisements ferroviaires |

**Différence avec routes:**
- Routes: 16 types (topologie simple)
- Rails: 60 types (inclut ponts avec élévation, croisements complexes)

### 3.4 Structure TypeScript

```typescript
class RailroadGridBuilder {
  buildRailroadGrid(segments: RailSegment[], width: number, height: number): boolean[][] {
    const grid: boolean[][] = Array(height).fill(false).map(() => Array(width).fill(false));

    for (const segment of segments) {
      const { x1, y1, x2, y2 } = segment;

      // Marquer toutes les cases du segment
      if (x1 === x2) {
        // Segment vertical
        const yMin = Math.min(y1, y2);
        const yMax = Math.max(y1, y2);
        for (let y = yMin; y <= yMax; y++) {
          grid[y][x1] = true;
        }
      } else if (y1 === y2) {
        // Segment horizontal
        const xMin = Math.min(x1, x2);
        const xMax = Math.max(x1, x2);
        for (let x = xMin; x <= xMax; x++) {
          grid[y1][x] = true;
        }
      }
    }

    return grid;
  }

  hasRailroad(x: number, y: number): boolean {
    return railroadGrid[y][x] === true;
  }
}
```

---

## 4. Textures de routes officielles

### 4.1 Organisation des fichiers

**Source:** Client officiel Starpeace Online

```
cache/
├── RoadBlockImages/      ← Textures téléchargées du serveur
│   ├── Roadvert.bmp
│   ├── Roadhorz.bmp
│   ├── RoadcornerN.bmp
│   ├── RoadcornerE.bmp
│   ├── RoadcornerS.bmp
│   ├── RoadcornerW.bmp
│   ├── RoadTN.bmp
│   ├── RoadTE.bmp
│   ├── RoadTS.bmp
│   ├── RoadTW.bmp
│   ├── Roadcross.bmp
│   └── ... (variantes urban, bridge, etc.)
└── RoadBlockClasses/     ← INI files de configuration
    └── *.ini
```

**Important:** Le repo de développement ne contient PAS les textures de production. Elles sont téléchargées dynamiquement depuis le serveur.

### 4.2 Types de blocs route

**Source:** `Roads.pas` - Enum `TRoadBlock`

| ID | Nom | Constante | Description |
|----|-----|-----------|-------------|
| 0 | None | `rbNone` | Aucune route |
| 1 | NS Start | `rbNSRoadStart` | Début segment Nord-Sud |
| 2 | NS End | `rbNSRoadEnd` | Fin segment Nord-Sud |
| 3 | WE Start | `rbWERoadStart` | Début segment Ouest-Est |
| 4 | WE End | `rbWERoadEnd` | Fin segment Ouest-Est |
| 5 | NS | `rbNS` | Segment Nord-Sud |
| 6 | WE | `rbWE` | Segment Ouest-Est |
| 7 | Left Plug | `rbLeftPlug` | Jonction T ouvert à gauche |
| 8 | Right Plug | `rbRightPlug` | Jonction T ouvert à droite |
| 9 | Top Plug | `rbTopPlug` | Jonction T ouvert en haut |
| 10 | Bottom Plug | `rbBottomPlug` | Jonction T ouvert en bas |
| 11 | Corner W | `rbCornerW` | Coin direction Ouest |
| 12 | Corner S | `rbCornerS` | Coin direction Sud |
| 13 | Corner N | `rbCornerN` | Coin direction Nord |
| 14 | Corner E | `rbCornerE` | Coin direction Est |
| 15 | Crossroads | `rbCrossRoads` | Carrefour 4 directions |

**Total:** 16 types de base

### 4.3 Format des images

**Spécifications:**
- **Dimensions:** 64×32 pixels (isométrique)
- **Format:** BMP (Windows Bitmap)
- **Profondeur:** 8-bit indexed color (palette)
- **Transparence:** Color key (RGB spécifique selon type)

**Variantes supplémentaires:**
- Chaque type peut avoir une image de **garde-fou** (`RailingImgPath`)
- Variantes **urbaines** (sur béton)
- Variantes **ponts** (sur eau)
- Variantes **passages à niveau** (sur rails)
- Variantes **smooth corners** (coins arrondis)

### 4.4 Nomenclature des fichiers

**Format actuel (client officiel):**
```
Road{Type}.bmp
```

**Exemples:**
```
Roadvert.bmp          → Segment vertical (N-S)
Roadhorz.bmp          → Segment horizontal (E-O)
RoadcornerN.bmp       → Coin Nord
RoadcornerE.bmp       → Coin Est
RoadcornerS.bmp       → Coin Sud
RoadcornerW.bmp       → Coin Ouest
RoadTN.bmp            → T-junction ouvert Nord
RoadTE.bmp            → T-junction ouvert Est
RoadTS.bmp            → T-junction ouvert Sud
RoadTW.bmp            → T-junction ouvert Ouest
Roadcross.bmp         → Carrefour (crossroads)
```

**Format étendu (avec surfaces):**
```
Road{Type}_{Surface}.bmp
```

**Exemples théoriques (système complet):**
```
Roadvert_land.bmp         → Vertical rural
Roadvert_urban.bmp        → Vertical urbain
Roadhorz_bridge_east.bmp  → Horizontal pont direction Est
RoadcornerE_smooth.bmp    → Coin Est arrondi
Roadcross_urban.bmp       → Carrefour urbain
```

### 4.5 Mapping textureId → Fichier

```typescript
// Encodage: textureId = (topology - 1) | (surface << 4)
function getTextureFilename(textureId: number): string {
  const topologyIndex = textureId & 0x0F;  // Bits 0-3
  const surfaceIndex = (textureId >> 4) & 0x0F;  // Bits 4-7

  const topology = topologyIndex + 1;  // 1-15 (TOPO_NS_START à TOPO_CROSSROADS)
  const surface = surfaceIndex;  // 0-10 (SURFACE_LAND à SURFACE_URBAN_SMOOTH)

  // Table de mapping topology → nom
  const topologyNames = [
    'NSStart', 'NSEnd', 'WEStart', 'WEEnd',
    'NS', 'WE',
    'LeftPlug', 'RightPlug', 'TopPlug', 'BottomPlug',
    'CornerW', 'CornerS', 'CornerN', 'CornerE',
    'Crossroads'
  ];

  // Table de mapping surface → nom
  const surfaceNames = [
    'land', 'urban',
    'bridge_north', 'bridge_south', 'bridge_east', 'bridge_west', 'bridge_full',
    'level_crossing', 'urban_crossing',
    'smooth', 'urban_smooth'
  ];

  const topoName = topologyNames[topologyIndex];
  const surfName = surfaceNames[surfaceIndex];

  return `Road${topoName}_${surfName}.bmp`;
}

// Exemple
textureId = 13 | (10 << 4);  // CORNER_E + URBAN_SMOOTH
// → "RoadCornerE_urban_smooth.bmp"
```

---

## 5. Correspondances avec notre implémentation actuelle

### 5.1 Types de routes actuels → Types officiels

| Notre type | Type officiel | ID | Correspondance exacte |
|------------|---------------|----|-----------------------|
| `Roadvert` | `rbNS` | 5 | ✅ Oui |
| `Roadhorz` | `rbWE` | 6 | ✅ Oui |
| `RoadcornerN` | `rbCornerN` | 13 | ✅ Oui |
| `RoadcornerE` | `rbCornerE` | 14 | ✅ Oui |
| `RoadcornerS` | `rbCornerS` | 12 | ✅ Oui |
| `RoadcornerW` | `rbCornerW` | 11 | ✅ Oui |
| `RoadTN` | `rbTopPlug` | 9 | ✅ Oui |
| `RoadTE` | `rbRightPlug` | 8 | ✅ Oui |
| `RoadTS` | `rbBottomPlug` | 10 | ✅ Oui |
| `RoadTW` | `rbLeftPlug` | 7 | ✅ Oui |
| `Roadcross` | `rbCrossRoads` | 15 | ✅ Oui |

**Résultat:** Notre nomenclature correspond exactement aux fichiers officiels ! ✅

### 5.2 Types manquants dans notre système

| Type officiel | ID | Description | Nécessaire pour |
|---------------|----|--------------|--------------------|
| `rbNSRoadStart` | 1 | Début N-S | Système complet avec transitions |
| `rbNSRoadEnd` | 2 | Fin N-S | Système complet avec transitions |
| `rbWERoadStart` | 3 | Début W-E | Système complet avec transitions |
| `rbWERoadEnd` | 4 | Fin W-E | Système complet avec transitions |

**Note:** Ces types nécessitent l'implémentation des **tables de transition** pour être utilisés correctement.

---

## 6. Exemples de code TypeScript complet

### 6.1 Parser de terrain avec eau

```typescript
class TerrainParser {
  private readonly PLATFORM_FLAG = 0x80;
  private readonly PLATFORM_MASK = 0x7F;

  parseTerrainFromBMP(bmpData: Uint8Array, width: number, height: number): TerrainCell[][] {
    const grid: TerrainCell[][] = [];

    for (let i = 0; i < height; i++) {
      grid[i] = [];
      for (let j = 0; j < width; j++) {
        const paletteIndex = bmpData[i * width + j];

        grid[i][j] = {
          isWater: (paletteIndex & this.PLATFORM_FLAG) !== 0,
          waterType: paletteIndex & this.PLATFORM_MASK
        };
      }
    }

    return grid;
  }
}
```

### 6.2 Générateur de grille de béton

```typescript
class ConcreteGridGenerator {
  private readonly CONCRETE_RADIUS = 2;

  generateConcreteGrid(
    buildings: Building[],
    mapWidth: number,
    mapHeight: number
  ): number[][] {
    // Initialiser grille vide
    const grid = Array(mapHeight).fill(0).map(() => Array(mapWidth).fill(0));

    // Appliquer béton pour chaque bâtiment urbain
    for (const building of buildings) {
      if (!building.isUrban) continue;

      const { x, y, xsize, ysize } = building;

      // Expand béton autour du bâtiment
      const minI = Math.max(0, y - this.CONCRETE_RADIUS);
      const maxI = Math.min(mapHeight - 1, y + ysize + this.CONCRETE_RADIUS - 1);
      const minJ = Math.max(0, x - this.CONCRETE_RADIUS);
      const maxJ = Math.min(mapWidth - 1, x + xsize + this.CONCRETE_RADIUS - 1);

      for (let i = minI; i <= maxI; i++) {
        for (let j = minJ; j <= maxJ; j++) {
          grid[i][j]++;
        }
      }
    }

    return grid;
  }

  hasConcrete(grid: number[][], x: number, y: number): boolean {
    return grid[y]?.[x] > 0;
  }
}
```

### 6.3 Builder de grille ferroviaire

```typescript
class RailroadGridBuilder {
  buildFromSegments(
    segments: RailSegment[],
    mapWidth: number,
    mapHeight: number
  ): boolean[][] {
    const grid = Array(mapHeight).fill(false).map(() => Array(mapWidth).fill(false));

    for (const segment of segments) {
      this.markSegment(grid, segment);
    }

    return grid;
  }

  private markSegment(grid: boolean[][], segment: RailSegment): void {
    const { x1, y1, x2, y2 } = segment;

    if (x1 === x2) {
      // Segment vertical
      const yMin = Math.min(y1, y2);
      const yMax = Math.max(y1, y2);
      for (let y = yMin; y <= yMax; y++) {
        if (y >= 0 && y < grid.length && x1 >= 0 && x1 < grid[0].length) {
          grid[y][x1] = true;
        }
      }
    } else if (y1 === y2) {
      // Segment horizontal
      const xMin = Math.min(x1, x2);
      const xMax = Math.max(x1, x2);
      for (let x = xMin; x <= xMax; x++) {
        if (y1 >= 0 && y1 < grid.length && x >= 0 && x < grid[0].length) {
          grid[y1][x] = true;
        }
      }
    }
  }
}
```

---

## 7. Récapitulatif des sources de données

| Donnée | Source | Format | Disponibilité |
|--------|--------|--------|---------------|
| **TerrainGrid** | Fichier BMP de la carte | Palette 8-bit (0x80-0x88 = eau) | ✅ Disponible |
| **ConcreteGrid** | Calculé dynamiquement | À partir des bâtiments urbains | ✅ Implémentable |
| **RailroadGrid** | RDO Protocol | Segments `{x1,y1,x2,y2}` via `cirRailRoads=2` | ✅ Récupérable |
| **Textures routes** | Serveur (cache) | BMP 64×32 pixels | ⚠️ Téléchargeables à l'exécution |

---

## 8. Références

- **Fichiers sources Delphi:**
  - `Voyager/Components/MapIsoView/Concrete.pas` - Détection eau/béton
  - `Protocol/Roads.pas` - Types de routes
  - `Voyager/Map.pas` - Calcul du béton
  - `Voyager/VoyagerServerInterfaces.pas` - Structures RDO

- **Documentation projet:**
  - [road_rendering_algorithm.md](road_rendering_algorithm.md) - Algorithme complet
  - [CLAUDE.md](../CLAUDE.md) - État de l'implémentation

---

**Document créé:** Janvier 2026
**Source:** Reverse engineering du client officiel Starpeace Online
**Auteur:** Documentation technique basée sur le code source Delphi
