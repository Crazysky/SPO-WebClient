# Fix - Camera Bounds & Texture Rendering Issues

## Problèmes Identifiés

### 1. ❌ **Chargement Partiel de la Carte (Camera Bounds Incorrect)**

**Symptôme:** Seulement une petite zone de la carte est chargée/rendue au lieu de toute la zone visible à l'écran.

**Cause:** Le calcul des bounds visibles dans `getVisibleBounds()` utilisait la position de la caméra au lieu du point où la caméra regarde.

**Contexte:**
- La caméra Three.js est positionnée à `(target.x, 1000, target.z + 1000)`
- Elle regarde vers le point `(target.x, 0, target.z)` sur le sol
- L'ancien code utilisait `camera.position.x/z` au lieu du point réel visé
- Résultat: Les chunks étaient calculés pour la mauvaise zone de la carte

### 2. ❌ **Textures Violettes/Cyans (Fallback Colors au lieu des Vraies Textures)**

**Symptôme:** Les textures chargent correctement (HTTP 200), mais s'affichent en couleurs violettes/cyans au lieu des textures Alien Swamp.

**Cause Potentielle:** Problème dans le système de texture atlas ou dans le mapping UV.

**Investigation en cours:**
- Les textures se chargent: ✅ `[TextureAtlasManager] Response status for X: 200`
- Les textures sont placées dans l'atlas: ✅ `[TextureAtlasManager] Texture X successfully placed in atlas`
- **Hypothèse:** Le material n'est pas correctement mis à jour ou les UVs pointent vers la mauvaise zone de l'atlas

---

## Solutions Appliquées

### Fix #1: Camera Bounds Calculation

**Fichier:** [src/client/renderer/three/CoordinateMapper3D.ts](../src/client/renderer/three/CoordinateMapper3D.ts#L145)

**Avant (Incorrect):**
```typescript
// Get camera position (looking down at ground plane)
const cameraTarget = new THREE.Vector3();
// For orthographic, camera.position.x and camera.position.z give the view center
// The camera looks down from above, so we project to y=0
cameraTarget.set(camera.position.x, 0, camera.position.z);
```

**Après (Correct):**
```typescript
// Get camera target on ground plane (where camera is looking)
// For orthographic camera, we need to project the camera's lookAt vector to y=0
const cameraTarget = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();
camera.getWorldDirection(cameraDirection);

// Ray from camera position along view direction
// Intersect with y=0 plane to find where camera is looking at ground
// Formula: origin + t * direction = y
// camera.position.y + t * direction.y = 0
// t = -camera.position.y / direction.y
const t = -camera.position.y / cameraDirection.y;
cameraTarget.set(
  camera.position.x + cameraDirection.x * t,
  0,
  camera.position.z + cameraDirection.z * t
);
```

**Explication:**
- La caméra est inclinée (pas directement au-dessus)
- On doit calculer où le rayon de vue intersecte le plan y=0
- Utilise la direction de la caméra (`getWorldDirection()`)
- Calcule l'intersection avec le sol: `origin + t * direction = (x, 0, z)`

**Résultat Attendu:**
✅ Tous les chunks visibles à l'écran seront maintenant chargés et rendus
✅ Plus de "zones vides" lors du zoom/pan
✅ Expérience fluide même en plein écran

---

### Fix #2: Diagnostic Logs pour Textures

**Fichier:** [src/client/renderer/three/TerrainChunkManager.ts](../src/client/renderer/three/TerrainChunkManager.ts#L267)

**Ajout:**
```typescript
// DEBUG: Log first few tiles to check texture IDs
if (i < startI + 2 && j < startJ + 2) {
  console.log(`[TerrainChunkManager] Tile (${i},${j}) -> textureId=${textureId}, UV=(${uv.u0.toFixed(3)},${uv.v0.toFixed(3)} to ${uv.u1.toFixed(3)},${uv.v1.toFixed(3)})`);
}
```

**But:**
- Vérifier que les `textureId` sont corrects (0-255)
- Vérifier que les UVs pointent vers les bonnes positions dans l'atlas (0-1)
- Comparer avec Canvas2D pour identifier les différences

**Logs Attendus:**
```
[TerrainChunkManager] Tile (0,0) -> textureId=55, UV=(0.688,0.000 to 0.750,0.063)
[TerrainChunkManager] Tile (0,1) -> textureId=53, UV=(0.313,0.063 to 0.375,0.125)
[TerrainChunkManager] Tile (1,0) -> textureId=57, UV=(0.563,0.000 to 0.625,0.063)
[TerrainChunkManager] Tile (1,1) -> textureId=62, UV=(0.875,0.125 to 0.938,0.188)
```

---

## Instructions de Test

### Étape 1: Recharger la Page

1. **Rechargez** la page (Ctrl+F5 ou Cmd+Shift+R)
2. **Ouvrez la console** (F12)

### Étape 2: Vérifier les Logs

**Logs attendus pour le fix Camera:**
```
[CameraController] fitMapToView: map=1000x1000, canvas=1479x961, zoom=0.091
[CoordinateMapper3D] Visible bounds calculated: (...)
```

**Logs attendus pour les Textures:**
```
[TerrainChunkManager] Tile (0,0) -> textureId=XX, UV=(...)
[TextureAtlasManager] Response status for XX: 200
[TextureAtlasManager] Texture XX loaded, size: 64xYY
[TextureAtlasManager] Texture XX successfully placed in atlas
```

### Étape 3: Vérifications Visuelles

**Pour le Fix Camera:**
- [ ] **Toute la carte** est visible à l'écran (pas juste un coin)
- [ ] Le terrain **couvre tout le canvas** (pas de zones noires)
- [ ] Le zoom est adapté (environ 0.09x pour map 1000×1000)

**Pour les Textures:**
- [ ] Les textures montrent des **motifs reconnaissables** (pas juste des couleurs unies)
- [ ] Les textures correspondent au type de terrain (**Alien Swamp** = marécage alien)
- [ ] Pas de carrés violets/magenta/cyan (fallback colors)

### Étape 4: Tester le Zoom

1. **Utilisez la molette** pour zoomer
2. **Vérifiez** que de nouveaux chunks se chargent correctement
3. **Vérifiez** que les textures s'affichent à tous les niveaux de zoom

---

## Problème Textures - Investigation Continue

### Hypothèses à Vérifier

**Hypothèse A: L'atlas n'est pas mis à jour après chargement des textures**
- Les textures sont chargées dans l'atlas
- Mais `material.map.needsUpdate = true` ne suffit peut-être pas
- **Test:** Vérifier si `render()` est appelé après chaque texture chargée

**Hypothèse B: Les UVs pointent vers la mauvaise zone de l'atlas**
- Les UVs sont calculés avec `atlasManager.getUV(textureId)`
- Mais les textureId peuvent être incorrects
- **Test:** Comparer les textureId entre Canvas2D et Three.js pour la même tuile

**Hypothèse C: Le terrain provider inverse i/j**
- Line 665: `getTextureId: (i, j) => this.terrainLoader.getTextureId(j, i)`
- TerrainLoader attend `(x, y)` où x=colonne, y=ligne
- **Test:** Inverser l'ordre des paramètres et recharger

**Hypothèse D: L'atlas est créé avec la mauvaise saison**
- Les fallback colors sont violettes/cyans (pas dans le code)
- Peut-être un problème de palette BMP?
- **Test:** Vérifier les couleurs exactes dans l'atlas avec un debugger

### Prochaines Étapes

1. **Copier les logs de console** (textureId, UV, status)
2. **Comparer avec Canvas2D:** Ouvrir Canvas2D pour la même carte et comparer les textureId
3. **Inspecter l'atlas:** Ajouter un log pour sauvegarder l'atlas en PNG et vérifier visuellement

---

## Comparaison Canvas2D vs Three.js

### Canvas2D (Fonctionne)
```
TerrainRenderer
    ↓
TextureCache.getTextureSync(textureId)
    ↓
Charge depuis /api/terrain-texture/{terrainType}/{season}/{textureId}
    ↓
Dessine directement sur canvas 2D
    ↓
Textures affichées ✅
```

### Three.js (Problème)
```
TerrainChunkManager
    ↓
terrainProvider.getTextureId(i, j)
    ↓
atlasManager.getUV(textureId)
    ↓
Charge via /api/terrain-texture/{terrainType}/{season}/{textureId}
    ↓
Place dans atlas (1024×512 texture)
    ↓
Material utilise l'atlas
    ↓
Rendu Three.js avec UVs
    ↓
Textures incorrectes ❌
```

**Différence Clé:** Canvas2D dessine directement, Three.js utilise un atlas + UVs.

---

## Fichiers Modifiés

1. **[src/client/renderer/three/CoordinateMapper3D.ts](../src/client/renderer/three/CoordinateMapper3D.ts)**
   - Méthode `getVisibleBounds()` - Fix calcul du target caméra (~15 lignes modifiées)

2. **[src/client/renderer/three/TerrainChunkManager.ts](../src/client/renderer/three/TerrainChunkManager.ts)**
   - Méthode `createChunkGeometry()` - Ajout logs diagnostic (~5 lignes ajoutées)

---

## Logs à Copier

Après rechargement, **copiez et partagez ces logs:**

```bash
# Camera bounds
[CameraController] fitMapToView: ...
[CoordinateMapper3D] ...

# Texture IDs
[TerrainChunkManager] Tile (0,0) -> textureId=...
[TerrainChunkManager] Tile (0,1) -> textureId=...
[TerrainChunkManager] Tile (1,0) -> textureId=...

# Texture loading
[TextureAtlasManager] Response status for XX: ...
[TextureAtlasManager] Texture XX loaded, size: ...
```

Ces logs permettront d'identifier exactement où le problème de textures se situe.
