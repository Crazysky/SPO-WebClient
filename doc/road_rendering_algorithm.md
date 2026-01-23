# Algorithme de rendu des routes - Starpeace Online

**Document de référence pour l'implémentation complète du système de rendu des routes**

---

## État actuel de l'implémentation

### ✅ Implémenté (système simplifié)
- Analyse des 4 voisins (N/E/S/W) pour chaque tile de route
- 11 types de textures de base:
  - Roadhorz / Roadvert (segments droits)
  - RoadcornerN/E/S/W (virages)
  - RoadTN/TE/TS/TW (jonctions en T)
  - Roadcross (carrefours)
- Détection automatique du type de texture basée sur la connectivité

### ❌ Non implémenté (système complet)
- **Tables de transition** (16 types topologiques avec start/end)
- **Types de surface** (11 variants: land, urban, bridges, crossings, smooth)
- **Smooth corners** (coins arrondis)
- **Ponts** (routes sur l'eau)
- **Passages à niveau** (routes sur rails)
- **Routes urbaines** (routes sur béton)
- **Encodage textureId** (topology | surface << 4)

---

## 1. Architecture du système complet

### 1.1 Types topologiques (16 valeurs)

| Valeur | Constante | Description |
|--------|-----------|-------------|
| 0 | `TOPO_NONE` | Pas de route |
| 1 | `TOPO_NS_START` | Début segment Nord-Sud (côté Sud) |
| 2 | `TOPO_NS_END` | Fin segment Nord-Sud (côté Nord) |
| 3 | `TOPO_WE_START` | Début segment Ouest-Est (côté Ouest) |
| 4 | `TOPO_WE_END` | Fin segment Ouest-Est (côté Est) |
| 5 | `TOPO_NS` | Segment Nord-Sud |
| 6 | `TOPO_WE` | Segment Ouest-Est |
| 7 | `TOPO_LEFT_PLUG` | Jonction T (ouvert à gauche) |
| 8 | `TOPO_RIGHT_PLUG` | Jonction T (ouvert à droite) |
| 9 | `TOPO_TOP_PLUG` | Jonction T (ouvert en haut) |
| 10 | `TOPO_BOTTOM_PLUG` | Jonction T (ouvert en bas) |
| 11 | `TOPO_CORNER_W` | Coin direction Ouest |
| 12 | `TOPO_CORNER_S` | Coin direction Sud |
| 13 | `TOPO_CORNER_N` | Coin direction Nord |
| 14 | `TOPO_CORNER_E` | Coin direction Est |
| 15 | `TOPO_CROSSROADS` | Croisement 4 directions |

### 1.2 Types de surface (11 valeurs)

| Valeur | Constante | Description |
|--------|-----------|-------------|
| 0 | `SURFACE_LAND` | Route rurale (campagne) |
| 1 | `SURFACE_URBAN` | Route urbaine (sur béton) |
| 2 | `SURFACE_BRIDGE_NORTH` | Pont direction Nord |
| 3 | `SURFACE_BRIDGE_SOUTH` | Pont direction Sud |
| 4 | `SURFACE_BRIDGE_EAST` | Pont direction Est |
| 5 | `SURFACE_BRIDGE_WEST` | Pont direction Ouest |
| 6 | `SURFACE_BRIDGE_FULL` | Pont central (milieu de l'eau) |
| 7 | `SURFACE_LEVEL_CROSSING` | Passage à niveau rural |
| 8 | `SURFACE_URBAN_CROSSING` | Passage à niveau urbain |
| 9 | `SURFACE_SMOOTH` | Coin lisse rural |
| 10 | `SURFACE_URBAN_SMOOTH` | Coin lisse urbain |

### 1.3 Encodage textureId

```
textureId = (topology - 1) | (surface << 4)

Bits 0-3: Index topologique (0-14)
Bits 4-7: Index de surface (0-10)
```

**Exemple:** Coin Est urbain smooth
- topology = CORNER_E = 14 → index = 13
- surface = URBAN_SMOOTH = 10
- textureId = 13 | (10 << 4) = 13 | 160 = 173

---

## 2. Algorithme en 3 phases

### Phase 1: Calcul de la topologie

```typescript
// Pour chaque segment {x1, y1, x2, y2}:
if (x1 === x2) {
  // Segment vertical (Nord-Sud)
  renderSegmentNS(x1, min(y1, y2), max(y1, y2));
} else if (y1 === y2) {
  // Segment horizontal (Ouest-Est)
  renderSegmentWE(y1, min(x1, x2), max(x1, x2));
}
```

**Utilise 6 tables de transition:**
- TRANSITION_NS_START (arrivée par le Sud)
- TRANSITION_NS_END (arrivée par le Nord)
- TRANSITION_NS_MIDDLE (traversée verticale)
- TRANSITION_WE_START (arrivée par l'Ouest)
- TRANSITION_WE_END (arrivée par l'Est)
- TRANSITION_WE_MIDDLE (traversée horizontale)

### Phase 2: Détermination de la surface

```typescript
function determineSurface(i, j, topology, terrainGrid, concreteGrid, railroadGrid) {
  // 1. Vérifier smooth corner d'abord
  const smooth = detectSmoothCorner(i, j, concreteGrid);
  if (smooth) return smooth;

  // 2. Vérifier si eau → pont
  if (terrain.isWater && !concrete) {
    return determineBridgeType(terrain.waterType, isHorizontal);
  }

  // 3. Vérifier si rails → passage à niveau
  if (hasRailroad) {
    return concrete ? SURFACE_URBAN_CROSSING : SURFACE_LEVEL_CROSSING;
  }

  // 4. Route normale
  return concrete ? SURFACE_URBAN : SURFACE_LAND;
}
```

### Phase 3: Calcul de l'ID de texture

```typescript
function calcTextureId(topology, surface) {
  if (topology === TOPO_NONE) return -1;
  return (topology - 1) | (surface << 4);
}
```

---

## 3. Tables de transition (extraits)

### TRANSITION_NS_START (arrivée par le Sud)

| État actuel | Nouvel état |
|-------------|-------------|
| NONE | NS_START |
| NS_END | NS |
| WE_START | CORNER_W |
| WE_END | CORNER_N |
| WE | BOTTOM_PLUG |
| CORNER_S | RIGHT_PLUG |
| TOP_PLUG | CROSSROADS |

### TRANSITION_WE_START (arrivée par l'Ouest)

| État actuel | Nouvel état |
|-------------|-------------|
| NONE | WE_START |
| NS_START | CORNER_W |
| NS_END | CORNER_S |
| WE_END | WE |
| NS | RIGHT_PLUG |
| LEFT_PLUG | CROSSROADS |

*(Voir code JavaScript complet en fin de document)*

---

## 4. Détection des smooth corners

Un coin est "smooth" (arrondi) quand il n'est pas connecté à son coin opposé:

```typescript
function detectSmoothCorner(i, j, concreteGrid) {
  const topology = grid[i][j].topology;
  if (!isCorner(topology)) return null;

  const up = grid[i-1][j].topology;
  const down = grid[i+1][j].topology;
  const left = grid[i][j-1].topology;
  const right = grid[i][j+1].topology;

  let isSmooth = false;

  switch (topology) {
    case TOPO.CORNER_W:
      // Smooth si pas de CORNER_E adjacent (bas ou droite)
      isSmooth = (down !== TOPO.CORNER_E) && (right !== TOPO.CORNER_E);
      break;
    case TOPO.CORNER_S:
      isSmooth = (up !== TOPO.CORNER_N) && (right !== TOPO.CORNER_N);
      break;
    case TOPO.CORNER_N:
      isSmooth = (down !== TOPO.CORNER_S) && (left !== TOPO.CORNER_S);
      break;
    case TOPO.CORNER_E:
      isSmooth = (up !== TOPO.CORNER_W) && (left !== TOPO.CORNER_W);
      break;
  }

  if (isSmooth) {
    return concreteGrid[i][j] ? SURFACE.URBAN_SMOOTH : SURFACE.SMOOTH;
  }
  return null;
}
```

**Explication visuelle:**

```
Coin W + Coin E adjacents = PAS smooth (virage en S)
┌──┐
│  └──
└──┐
   └──

Coin W seul = SMOOTH (virage simple)
┌──┐
│  └──────
└─────────
```

---

## 5. Gestion des ponts (routes sur eau)

### Types de terrain pour l'eau

| Valeur | Constante | Description |
|--------|-----------|-------------|
| 0 | `WATER_CENTER` | Centre de l'eau |
| 1 | `WATER_N` | Bord Nord |
| 2 | `WATER_E` | Bord Est |
| 3 | `WATER_S` | Bord Sud |
| 4 | `WATER_W` | Bord Ouest |
| 5 | `WATER_NE_OUT` | Coin extérieur Nord-Est |
| 6 | `WATER_SE_OUT` | Coin extérieur Sud-Est |
| 7 | `WATER_SW_OUT` | Coin extérieur Sud-Ouest |
| 8 | `WATER_NW_OUT` | Coin extérieur Nord-Ouest |
| 9 | `WATER_NE_IN` | Coin intérieur Nord-Est |
| 10 | `WATER_SE_IN` | Coin intérieur Sud-Est |
| 11 | `WATER_SW_IN` | Coin intérieur Sud-Ouest |
| 12 | `WATER_NW_IN` | Coin intérieur Nord-Ouest |

### Sélection du type de pont

```typescript
function determineBridgeType(waterType, isHorizontal) {
  switch (waterType) {
    case WATER_N: return SURFACE_BRIDGE_NORTH;
    case WATER_S: return SURFACE_BRIDGE_SOUTH;
    case WATER_E: return SURFACE_BRIDGE_EAST;
    case WATER_W: return SURFACE_BRIDGE_WEST;

    case WATER_NE_OUT:
      return isHorizontal ? SURFACE_BRIDGE_EAST : SURFACE_BRIDGE_NORTH;
    case WATER_SE_OUT:
      return isHorizontal ? SURFACE_BRIDGE_EAST : SURFACE_BRIDGE_SOUTH;
    case WATER_SW_OUT:
      return isHorizontal ? SURFACE_BRIDGE_WEST : SURFACE_BRIDGE_SOUTH;
    case WATER_NW_OUT:
      return isHorizontal ? SURFACE_BRIDGE_WEST : SURFACE_BRIDGE_NORTH;

    case WATER_CENTER:
    case WATER_NE_IN:
    case WATER_SE_IN:
    case WATER_SW_IN:
    case WATER_NW_IN:
      return SURFACE_BRIDGE_FULL;

    default:
      return SURFACE_LAND;
  }
}
```

---

## 6. Données requises pour l'implémentation complète

### 6.1 Données serveur (déjà disponibles)
- ✅ `segments[]` - Liste des segments de routes `{x1, y1, x2, y2}`

### 6.2 Données terrain (à ajouter)

#### terrainGrid[][]
```typescript
interface TerrainCell {
  isWater: boolean;
  waterType: number; // 0-12 (WATER_CENTER, WATER_N, etc.)
}
```

**Source:** Fichier `.bmp` du terrain (palette index → type de terrain)

#### concreteGrid[][]
```typescript
boolean[][] // true si la case a du béton/urbanisation
```

**Source:** Fichier `.concrete` ou calcul basé sur les bâtiments adjacents

#### railroadGrid[][]
```typescript
boolean[][] // true si la case a des voies ferrées
```

**Source:** Segments ferroviaires (similaire aux segments de routes)

---

## 7. Implémentation de référence (JavaScript complet)

```javascript
// Constantes de topologie
const TOPO = {
  NONE: 0,
  NS_START: 1,
  NS_END: 2,
  WE_START: 3,
  WE_END: 4,
  NS: 5,
  WE: 6,
  LEFT_PLUG: 7,
  RIGHT_PLUG: 8,
  TOP_PLUG: 9,
  BOTTOM_PLUG: 10,
  CORNER_W: 11,
  CORNER_S: 12,
  CORNER_N: 13,
  CORNER_E: 14,
  CROSSROADS: 15
};

// Constantes de surface
const SURFACE = {
  LAND: 0,
  URBAN: 1,
  BRIDGE_NORTH: 2,
  BRIDGE_SOUTH: 3,
  BRIDGE_EAST: 4,
  BRIDGE_WEST: 5,
  BRIDGE_FULL: 6,
  LEVEL_CROSSING: 7,
  URBAN_CROSSING: 8,
  SMOOTH: 9,
  URBAN_SMOOTH: 10
};

// Tables de transition complètes
const TRANSITION_NS_START = [
  TOPO.NS_START,    // 0: NONE → NS_START
  TOPO.NS_START,    // 1: NS_START → NS_START
  TOPO.NS,          // 2: NS_END → NS
  TOPO.CORNER_W,    // 3: WE_START → CORNER_W
  TOPO.CORNER_N,    // 4: WE_END → CORNER_N
  TOPO.NS,          // 5: NS → NS
  TOPO.BOTTOM_PLUG, // 6: WE → BOTTOM_PLUG
  TOPO.LEFT_PLUG,   // 7: LEFT_PLUG → LEFT_PLUG
  TOPO.RIGHT_PLUG,  // 8: RIGHT_PLUG → RIGHT_PLUG
  TOPO.CROSSROADS,  // 9: TOP_PLUG → CROSSROADS
  TOPO.BOTTOM_PLUG, // 10: BOTTOM_PLUG → BOTTOM_PLUG
  TOPO.CORNER_W,    // 11: CORNER_W → CORNER_W
  TOPO.RIGHT_PLUG,  // 12: CORNER_S → RIGHT_PLUG
  TOPO.CORNER_N,    // 13: CORNER_N → CORNER_N
  TOPO.LEFT_PLUG,   // 14: CORNER_E → LEFT_PLUG
  TOPO.CROSSROADS   // 15: CROSSROADS → CROSSROADS
];

const TRANSITION_NS_END = [
  TOPO.NS_END,      // 0: NONE → NS_END
  TOPO.NS,          // 1: NS_START → NS
  TOPO.NS_END,      // 2: NS_END → NS_END
  TOPO.CORNER_S,    // 3: WE_START → CORNER_S
  TOPO.CORNER_E,    // 4: WE_END → CORNER_E
  TOPO.NS,          // 5: NS → NS
  TOPO.TOP_PLUG,    // 6: WE → TOP_PLUG
  TOPO.LEFT_PLUG,   // 7: LEFT_PLUG → LEFT_PLUG
  TOPO.RIGHT_PLUG,  // 8: RIGHT_PLUG → RIGHT_PLUG
  TOPO.TOP_PLUG,    // 9: TOP_PLUG → TOP_PLUG
  TOPO.CROSSROADS,  // 10: BOTTOM_PLUG → CROSSROADS
  TOPO.RIGHT_PLUG,  // 11: CORNER_W → RIGHT_PLUG
  TOPO.CORNER_S,    // 12: CORNER_S → CORNER_S
  TOPO.LEFT_PLUG,   // 13: CORNER_N → LEFT_PLUG
  TOPO.CORNER_E,    // 14: CORNER_E → CORNER_E
  TOPO.CROSSROADS   // 15: CROSSROADS → CROSSROADS
];

const TRANSITION_NS_MIDDLE = [
  TOPO.NS,          // 0: NONE → NS
  TOPO.NS,          // 1: NS_START → NS
  TOPO.NS,          // 2: NS_END → NS
  TOPO.RIGHT_PLUG,  // 3: WE_START → RIGHT_PLUG
  TOPO.LEFT_PLUG,   // 4: WE_END → LEFT_PLUG
  TOPO.NS,          // 5: NS → NS
  TOPO.CROSSROADS,  // 6: WE → CROSSROADS
  TOPO.LEFT_PLUG,   // 7: LEFT_PLUG → LEFT_PLUG
  TOPO.RIGHT_PLUG,  // 8: RIGHT_PLUG → RIGHT_PLUG
  TOPO.CROSSROADS,  // 9: TOP_PLUG → CROSSROADS
  TOPO.CROSSROADS,  // 10: BOTTOM_PLUG → CROSSROADS
  TOPO.RIGHT_PLUG,  // 11: CORNER_W → RIGHT_PLUG
  TOPO.RIGHT_PLUG,  // 12: CORNER_S → RIGHT_PLUG
  TOPO.LEFT_PLUG,   // 13: CORNER_N → LEFT_PLUG
  TOPO.LEFT_PLUG,   // 14: CORNER_E → LEFT_PLUG
  TOPO.CROSSROADS   // 15: CROSSROADS → CROSSROADS
];

const TRANSITION_WE_START = [
  TOPO.WE_START,    // 0: NONE → WE_START
  TOPO.CORNER_W,    // 1: NS_START → CORNER_W
  TOPO.CORNER_S,    // 2: NS_END → CORNER_S
  TOPO.WE_START,    // 3: WE_START → WE_START
  TOPO.WE,          // 4: WE_END → WE
  TOPO.RIGHT_PLUG,  // 5: NS → RIGHT_PLUG
  TOPO.WE,          // 6: WE → WE
  TOPO.CROSSROADS,  // 7: LEFT_PLUG → CROSSROADS
  TOPO.RIGHT_PLUG,  // 8: RIGHT_PLUG → RIGHT_PLUG
  TOPO.TOP_PLUG,    // 9: TOP_PLUG → TOP_PLUG
  TOPO.BOTTOM_PLUG, // 10: BOTTOM_PLUG → BOTTOM_PLUG
  TOPO.CORNER_W,    // 11: CORNER_W → CORNER_W
  TOPO.CORNER_S,    // 12: CORNER_S → CORNER_S
  TOPO.BOTTOM_PLUG, // 13: CORNER_N → BOTTOM_PLUG
  TOPO.TOP_PLUG,    // 14: CORNER_E → TOP_PLUG
  TOPO.CROSSROADS   // 15: CROSSROADS → CROSSROADS
];

const TRANSITION_WE_END = [
  TOPO.WE_END,      // 0: NONE → WE_END
  TOPO.CORNER_N,    // 1: NS_START → CORNER_N
  TOPO.CORNER_E,    // 2: NS_END → CORNER_E
  TOPO.WE,          // 3: WE_START → WE
  TOPO.WE_END,      // 4: WE_END → WE_END
  TOPO.LEFT_PLUG,   // 5: NS → LEFT_PLUG
  TOPO.WE,          // 6: WE → WE
  TOPO.LEFT_PLUG,   // 7: LEFT_PLUG → LEFT_PLUG
  TOPO.CROSSROADS,  // 8: RIGHT_PLUG → CROSSROADS
  TOPO.TOP_PLUG,    // 9: TOP_PLUG → TOP_PLUG
  TOPO.BOTTOM_PLUG, // 10: BOTTOM_PLUG → BOTTOM_PLUG
  TOPO.BOTTOM_PLUG, // 11: CORNER_W → BOTTOM_PLUG
  TOPO.TOP_PLUG,    // 12: CORNER_S → TOP_PLUG
  TOPO.CORNER_N,    // 13: CORNER_N → CORNER_N
  TOPO.CORNER_E,    // 14: CORNER_E → CORNER_E
  TOPO.CROSSROADS   // 15: CROSSROADS → CROSSROADS
];

const TRANSITION_WE_MIDDLE = [
  TOPO.WE,          // 0: NONE → WE
  TOPO.BOTTOM_PLUG, // 1: NS_START → BOTTOM_PLUG
  TOPO.TOP_PLUG,    // 2: NS_END → TOP_PLUG
  TOPO.WE,          // 3: WE_START → WE
  TOPO.WE,          // 4: WE_END → WE
  TOPO.CROSSROADS,  // 5: NS → CROSSROADS
  TOPO.WE,          // 6: WE → WE
  TOPO.CROSSROADS,  // 7: LEFT_PLUG → CROSSROADS
  TOPO.CROSSROADS,  // 8: RIGHT_PLUG → CROSSROADS
  TOPO.TOP_PLUG,    // 9: TOP_PLUG → TOP_PLUG
  TOPO.BOTTOM_PLUG, // 10: BOTTOM_PLUG → BOTTOM_PLUG
  TOPO.BOTTOM_PLUG, // 11: CORNER_W → BOTTOM_PLUG
  TOPO.TOP_PLUG,    // 12: CORNER_S → TOP_PLUG
  TOPO.BOTTOM_PLUG, // 13: CORNER_N → BOTTOM_PLUG
  TOPO.TOP_PLUG,    // 14: CORNER_E → TOP_PLUG
  TOPO.CROSSROADS   // 15: CROSSROADS → CROSSROADS
];

class RoadRenderer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.grid = this.createGrid();
  }

  createGrid() {
    return Array(this.height).fill(null).map(() =>
      Array(this.width).fill(null).map(() => ({
        topology: TOPO.NONE,
        surface: SURFACE.LAND,
        textureId: -1
      }))
    );
  }

  getTopology(i, j) {
    if (i < 0 || i >= this.height || j < 0 || j >= this.width) {
      return TOPO.NONE;
    }
    return this.grid[i][j].topology;
  }

  setTopology(i, j, value) {
    if (i >= 0 && i < this.height && j >= 0 && j < this.width) {
      this.grid[i][j].topology = value;
    }
  }

  renderSegment(segment) {
    const { x1, y1, x2, y2 } = segment;

    if (x1 === x2) {
      // Segment vertical (Nord-Sud)
      const yMin = Math.min(y1, y2);
      const yMax = Math.max(y1, y2);
      this.renderSegmentNS(x1, yMin, yMax);
    } else if (y1 === y2) {
      // Segment horizontal (Ouest-Est)
      const xMin = Math.min(x1, x2);
      const xMax = Math.max(x1, x2);
      this.renderSegmentWE(y1, xMin, xMax);
    }
  }

  renderSegmentNS(x, yMin, yMax) {
    // Extrémité Nord
    const currentEnd = this.getTopology(yMin, x);
    this.setTopology(yMin, x, TRANSITION_NS_END[currentEnd]);

    // Blocs intermédiaires
    for (let y = yMin + 1; y < yMax; y++) {
      const current = this.getTopology(y, x);
      this.setTopology(y, x, TRANSITION_NS_MIDDLE[current]);
    }

    // Extrémité Sud
    if (yMax > yMin) {
      const currentStart = this.getTopology(yMax, x);
      this.setTopology(yMax, x, TRANSITION_NS_START[currentStart]);
    }
  }

  renderSegmentWE(y, xMin, xMax) {
    // Extrémité Ouest
    const currentStart = this.getTopology(y, xMin);
    this.setTopology(y, xMin, TRANSITION_WE_START[currentStart]);

    // Blocs intermédiaires
    for (let x = xMin + 1; x < xMax; x++) {
      const current = this.getTopology(y, x);
      this.setTopology(y, x, TRANSITION_WE_MIDDLE[current]);
    }

    // Extrémité Est
    if (xMax > xMin) {
      const currentEnd = this.getTopology(y, xMax);
      this.setTopology(y, xMax, TRANSITION_WE_END[currentEnd]);
    }
  }

  detectSmoothCorner(i, j, concreteGrid) {
    const topology = this.getTopology(i, j);
    const corners = [TOPO.CORNER_W, TOPO.CORNER_S, TOPO.CORNER_N, TOPO.CORNER_E];

    if (!corners.includes(topology)) {
      return null;
    }

    const up = this.getTopology(i - 1, j);
    const down = this.getTopology(i + 1, j);
    const left = this.getTopology(i, j - 1);
    const right = this.getTopology(i, j + 1);

    let isSmooth = false;

    switch (topology) {
      case TOPO.CORNER_W:
        isSmooth = (down !== TOPO.CORNER_E) && (right !== TOPO.CORNER_E);
        break;
      case TOPO.CORNER_S:
        isSmooth = (up !== TOPO.CORNER_N) && (right !== TOPO.CORNER_N);
        break;
      case TOPO.CORNER_N:
        isSmooth = (down !== TOPO.CORNER_S) && (left !== TOPO.CORNER_S);
        break;
      case TOPO.CORNER_E:
        isSmooth = (up !== TOPO.CORNER_W) && (left !== TOPO.CORNER_W);
        break;
    }

    if (isSmooth) {
      return concreteGrid[i][j] ? SURFACE.URBAN_SMOOTH : SURFACE.SMOOTH;
    }

    return null;
  }

  determineSurface(i, j, topology, terrainGrid, concreteGrid, railroadGrid) {
    if (topology === TOPO.NONE) {
      return null;
    }

    const isHorizontal = [TOPO.WE, TOPO.WE_START, TOPO.WE_END].includes(topology);
    const terrain = terrainGrid[i][j];
    const hasConcrete = concreteGrid[i][j];
    const hasRailroad = railroadGrid[i][j];

    // Pont sur l'eau
    if (terrain.isWater && !hasConcrete) {
      return this.determineBridgeType(terrain.waterType, isHorizontal);
    }

    // Passage à niveau
    if (hasRailroad) {
      return hasConcrete ? SURFACE.URBAN_CROSSING : SURFACE.LEVEL_CROSSING;
    }

    // Route normale
    return hasConcrete ? SURFACE.URBAN : SURFACE.LAND;
  }

  determineBridgeType(waterType, isHorizontal) {
    switch (waterType) {
      case 1: return SURFACE.BRIDGE_NORTH;  // WATER_N
      case 3: return SURFACE.BRIDGE_SOUTH;  // WATER_S
      case 2: return SURFACE.BRIDGE_EAST;   // WATER_E
      case 4: return SURFACE.BRIDGE_WEST;   // WATER_W
      case 5: // WATER_NE_OUT
        return isHorizontal ? SURFACE.BRIDGE_EAST : SURFACE.BRIDGE_NORTH;
      case 6: // WATER_SE_OUT
        return isHorizontal ? SURFACE.BRIDGE_EAST : SURFACE.BRIDGE_SOUTH;
      case 7: // WATER_SW_OUT
        return isHorizontal ? SURFACE.BRIDGE_WEST : SURFACE.BRIDGE_SOUTH;
      case 8: // WATER_NW_OUT
        return isHorizontal ? SURFACE.BRIDGE_WEST : SURFACE.BRIDGE_NORTH;
      case 0:  // WATER_CENTER
      case 9:  // WATER_NE_IN
      case 10: // WATER_SE_IN
      case 11: // WATER_SW_IN
      case 12: // WATER_NW_IN
        return SURFACE.BRIDGE_FULL;
      default:
        return SURFACE.LAND;
    }
  }

  calcTextureId(topology, surface) {
    if (topology === TOPO.NONE) {
      return -1;
    }
    return (topology - 1) | (surface << 4);
  }

  render(segments, terrainGrid, concreteGrid, railroadGrid) {
    // Phase 1: Topologie
    for (const segment of segments) {
      this.renderSegment(segment);
    }

    // Phase 2: Surface et texture
    for (let i = 0; i < this.height; i++) {
      for (let j = 0; j < this.width; j++) {
        const topology = this.grid[i][j].topology;

        if (topology !== TOPO.NONE) {
          // Vérifier smooth corner d'abord
          const smoothSurface = this.detectSmoothCorner(i, j, concreteGrid);

          if (smoothSurface !== null) {
            this.grid[i][j].surface = smoothSurface;
          } else {
            this.grid[i][j].surface = this.determineSurface(
              i, j, topology, terrainGrid, concreteGrid, railroadGrid
            );
          }

          this.grid[i][j].textureId = this.calcTextureId(
            topology,
            this.grid[i][j].surface
          );
        }
      }
    }

    return this.grid;
  }
}

// Exemple d'utilisation
const renderer = new RoadRenderer(1000, 1000);
const grid = renderer.render(segments, terrainGrid, concreteGrid, railroadGrid);
```

---

## 8. Feuille de route pour l'implémentation

### Étape 1: Préparer les données terrain (1-2 jours)
- [ ] Parser les fichiers `.bmp` pour extraire les types de terrain (palette → waterType)
- [ ] Créer `terrainGrid[][]` avec `{isWater, waterType}`
- [ ] Implémenter `concreteGrid[][]` (basé sur les bâtiments ou fichier séparé)
- [ ] Implémenter `railroadGrid[][]` (si segments ferroviaires disponibles)

### Étape 2: Implémenter les tables de transition (2-3 jours)
- [ ] Créer les 6 tables de transition (NS_START, NS_END, NS_MIDDLE, WE_START, WE_END, WE_MIDDLE)
- [ ] Implémenter `renderSegmentNS()` et `renderSegmentWE()` avec transitions
- [ ] Créer la grille de topologie `RoadGrid[][]`
- [ ] Tester avec des patterns simples (segments droits, coins, T-junctions)

### Étape 3: Implémenter la détection de surface (1 jour)
- [ ] Implémenter `determineSurface()` avec les 5 cas
- [ ] Implémenter `determineBridgeType()` pour les ponts
- [ ] Implémenter `detectSmoothCorner()` pour les coins arrondis
- [ ] Tester avec différents types de terrain

### Étape 4: Créer le système de textures (2-3 jours)
- [ ] Générer les 78 textures requises (topology × surface)
- [ ] Implémenter l'encodage `textureId = (topology-1) | (surface<<4)`
- [ ] Créer un cache de textures avec lookup par ID
- [ ] Mapper les IDs aux fichiers `.bmp` appropriés

### Étape 5: Intégration et optimisation (2-3 jours)
- [ ] Intégrer avec `IsometricMapRenderer`
- [ ] Optimiser les calculs de grille (cache, dirty regions)
- [ ] Ajouter le rendu des textures dans `drawRoads()`
- [ ] Tests de performance (1000+ segments)

### Étape 6: Tests et validation (1-2 jours)
- [ ] Comparer rendu avec client officiel (screenshots)
- [ ] Tester tous les types de jonctions
- [ ] Tester ponts sur eau
- [ ] Tester passages à niveau
- [ ] Tester smooth corners

**Total estimé: 10-15 jours de développement**

---

## 9. Nomenclature des fichiers de texture

### Format suggéré
```
road_{topology}_{surface}.bmp
```

### Exemples
```
road_ns_land.bmp              // Segment Nord-Sud rural
road_we_urban.bmp             // Segment Ouest-Est urbain
road_corner_e_land.bmp        // Coin Est rural
road_corner_w_smooth.bmp      // Coin Ouest lisse rural
road_crossroads_urban.bmp     // Carrefour urbain
road_we_bridge_east.bmp       // Pont Est-Ouest direction Est
road_ns_level_crossing.bmp    // Passage à niveau Nord-Sud rural
```

### Correspondance avec les fichiers actuels
```
Roadvert.bmp → road_ns_land.bmp
Roadhorz.bmp → road_we_land.bmp
RoadcornerN.bmp → road_corner_n_land.bmp
RoadcornerE.bmp → road_corner_e_land.bmp
RoadcornerS.bmp → road_corner_s_land.bmp
RoadcornerW.bmp → road_corner_w_land.bmp
RoadTN.bmp → road_top_plug_land.bmp
RoadTE.bmp → road_right_plug_land.bmp
RoadTS.bmp → road_bottom_plug_land.bmp
RoadTW.bmp → road_left_plug_land.bmp
Roadcross.bmp → road_crossroads_land.bmp
```

---

## 10. Références

- **Fichier source:** Lander.pas (Delphi) - Reverse engineering du client officiel
- **Algorithme complet:** Fourni par l'utilisateur (documentation originale)
- **Implémentation actuelle:** `src/client/renderer/game-object-texture-cache.ts`

---

**Document créé:** Janvier 2026
**Dernière mise à jour:** Janvier 2026
**Statut:** Spécification complète - Implémentation partielle
