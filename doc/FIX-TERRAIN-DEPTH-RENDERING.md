# Fix - Terrain Depth & Render Order Issues

## Problème Résolu

**Symptôme:** Les routes et le concrete étaient invisibles, recouverts par les textures du terrain (water tiles cyan/violet).

**Cause:** Deux problèmes dans le système de rendu Three.js:
1. Le material du terrain écrivait dans le depth buffer
2. Le terrain utilisait un `renderOrder` fixe au lieu du painter's algorithm

## Solutions Appliquées

### Fix #1: Depth Buffer Configuration

**Fichier:** [src/client/renderer/three/TerrainChunkManager.ts](../src/client/renderer/three/TerrainChunkManager.ts#L94-L105)

**Avant:**
```typescript
this.material = new THREE.MeshBasicMaterial({
  map: atlasTexture,
  transparent: true,
  side: THREE.DoubleSide,
  alphaTest: 0.5
});
```

**Après:**
```typescript
this.material = new THREE.MeshBasicMaterial({
  map: atlasTexture,
  transparent: true,
  side: THREE.DoubleSide,
  alphaTest: 0.5,
  depthWrite: false  // Allow roads/concrete to render on top via renderOrder
});
```

**Explication:**
- `depthWrite: false` empêche le terrain d'écrire dans le depth buffer
- Permet aux objets avec `renderOrder` supérieur de toujours s'afficher par-dessus
- Essential pour le système de layering: TERRAIN (0) < CONCRETE (1) < ROADS (2) < BUILDINGS (4)

---

### Fix #2: Painter's Algorithm pour le Terrain

**Fichier:** [src/client/renderer/three/TerrainChunkManager.ts](../src/client/renderer/three/TerrainChunkManager.ts#L221-L229)

**Avant:**
```typescript
const geometry = this.createChunkGeometry(startI, startJ, endI, endJ);
const material = this.getMaterial();
const mesh = new THREE.Mesh(geometry, material);

// Set render order for terrain layer
mesh.renderOrder = RENDER_LAYER.TERRAIN;  // Always 0

return mesh;
```

**Après:**
```typescript
const geometry = this.createChunkGeometry(startI, startJ, endI, endJ);
const material = this.getMaterial();
const mesh = new THREE.Mesh(geometry, material);

// Set render order for terrain layer using painter's algorithm
// Use middle of chunk for render order calculation
const centerI = Math.floor((startI + endI) / 2);
const centerJ = Math.floor((startJ + endJ) / 2);
mesh.renderOrder = this.coordinateMapper.getRenderOrder(centerI, centerJ, RENDER_LAYER.TERRAIN);

return mesh;
```

**Explication:**
- L'ancien code utilisait `renderOrder = 0` pour tous les terrain chunks
- Le nouveau code utilise `getRenderOrder()` qui calcule: `layer * 10000 + (i + j)`
- Cela permet au painter's algorithm de fonctionner correctement
- Les chunks plus "en arrière" (i+j plus petit) se rendent en premier
- Les chunks plus "en avant" (i+j plus grand) se rendent par-dessus

**Exemple de calcul:**
- Terrain chunk au centre (500, 500): `renderOrder = 0 * 10000 + 1000 = 1000`
- Road tile à (500, 500): `renderOrder = 2 * 10000 + 1000 = 21000`
- Résultat: Road toujours au-dessus du terrain (21000 > 1000) ✅

---

## Système de Layering Three.js

**RENDER_LAYER constants** ([IsometricThreeRenderer.ts:29-37](../src/client/renderer/three/IsometricThreeRenderer.ts#L29-L37)):

```typescript
export const RENDER_LAYER = {
  TERRAIN: 0,      // Lowest (renders first)
  CONCRETE: 1,
  ROADS: 2,
  TALL_TERRAIN: 3,
  BUILDINGS: 4,
  ZONE_OVERLAY: 5,
  UI: 6            // Highest (renders last, always on top)
}
```

**Render Order Calculation** ([CoordinateMapper3D.ts:239-245](../src/client/renderer/three/CoordinateMapper3D.ts#L239-L245)):

```typescript
getRenderOrder(i: number, j: number, layer: number): number {
  const layerBase = layer * 10000;  // Separate layers by 10000
  const depthOrder = i + j;          // Painter's algorithm
  return layerBase + depthOrder;
}
```

**Example render orders:**
| Object | Position | Calculation | renderOrder | Display Order |
|--------|----------|-------------|-------------|---------------|
| Terrain chunk | (500, 500) | `0*10000 + 1000` | 1000 | First (behind) |
| Concrete tile | (500, 500) | `1*10000 + 1000` | 11000 | Second |
| Road tile | (500, 500) | `2*10000 + 1000` | 21000 | Third (on top) |
| Building | (500, 500) | `4*10000 + 1000` | 41000 | Last (front) |

---

## Architecture du Rendu

### Canvas2D (pour comparaison)
1. Dessine terrain (toutes les tuiles)
2. Dessine concrete par-dessus
3. Dessine roads par-dessus
4. Dessine buildings par-dessus

**Fonctionne** car l'ordre de `drawImage()` est garanti.

### Three.js (avant fix)
1. Terrain chunks avec `renderOrder = 0` fixe
2. Roads avec `renderOrder = 20000+`
3. **Problème:** Depth buffer empêchait roads de s'afficher

### Three.js (après fix)
1. Terrain chunks avec `renderOrder = 0-2000` (painter's algorithm)
2. Concrete tiles avec `renderOrder = 10000-12000`
3. Roads tiles avec `renderOrder = 20000-22000`
4. **Solution:** `depthWrite: false` + renderOrder correct

---

## Résultats Attendus

### Avant le Fix
- ❌ Terrain water tiles (cyan/violet) visibles partout
- ❌ Routes invisibles ou partiellement masquées
- ❌ Concrete invisible
- ❌ Textures "pas au bon endroit"

### Après le Fix
- ✅ Terrain rendu en arrière-plan
- ✅ Routes visibles par-dessus le terrain
- ✅ Concrete visible par-dessus le terrain
- ✅ Layering correct: TERRAIN < CONCRETE < ROADS < BUILDINGS
- ✅ Painter's algorithm fonctionne pour les tiles qui se chevauchent

---

## Instructions de Test

1. **Rechargez la page** (Ctrl+F5 ou Cmd+Shift+R)
2. **Vérifications visuelles:**
   - [ ] Les routes sont visibles (beige/tan)
   - [ ] Le concrete est visible autour des buildings
   - [ ] Les routes ne sont PAS recouvertes par les water tiles
   - [ ] Les textures sont "au bon endroit"

3. **Vérifications techniques (optionnel):**
   - Ouvrir la console (F12)
   - Exécuter (si possible d'accéder au renderer):
   ```javascript
   // Vérifier les renderOrder
   const scene = /* access to scene */;
   const terrainGroup = scene.children.find(g => g.name === 'terrain');
   const roadGroup = scene.children.find(g => g.name === 'roads');

   console.log('Terrain renderOrder range:',
     Math.min(...terrainGroup.children.map(m => m.renderOrder)),
     '-',
     Math.max(...terrainGroup.children.map(m => m.renderOrder))
   );

   console.log('Road renderOrder range:',
     Math.min(...roadGroup.children.map(m => m.renderOrder)),
     '-',
     Math.max(...roadGroup.children.map(m => m.renderOrder))
   );
   ```

---

## Fichiers Modifiés

1. **[src/client/renderer/three/TerrainChunkManager.ts](../src/client/renderer/three/TerrainChunkManager.ts)**
   - Ligne 101: Ajout de `depthWrite: false` au material
   - Lignes 225-228: Calcul du renderOrder avec painter's algorithm

---

## Références

- **Depth Buffer:** [Three.js Material.depthWrite](https://threejs.org/docs/#api/en/materials/Material.depthWrite)
- **Render Order:** [Three.js Object3D.renderOrder](https://threejs.org/docs/#api/en/core/Object3D.renderOrder)
- **Painter's Algorithm:** [Wikipedia](https://en.wikipedia.org/wiki/Painter%27s_algorithm)

---

## Problèmes Potentiels Résolus

### Problème A: "Textures spéciales écrasées"
**Cause:** Terrain avec `depthWrite: true` masquait les routes
**Solution:** `depthWrite: false` ✅

### Problème B: "Pas au bon endroit"
**Cause:** Tous les terrain chunks avaient `renderOrder = 0`
**Solution:** Painter's algorithm avec `getRenderOrder()` ✅

### Problème C: Routes invisibles
**Cause:** Depth buffer + renderOrder fixe
**Solution:** Les deux fixes combinés ✅

---

## Validation

✅ Build réussi sans erreurs
⏳ Test visuel en attente
⏳ Confirmation utilisateur en attente

Une fois le test visuel confirmé, ce fix résout définitivement le problème de rendu des textures Three.js.
