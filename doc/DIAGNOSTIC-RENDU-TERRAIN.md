# Diagnostic - Problèmes de Rendu du Terrain

## Problèmes Identifiés

### 1. Le terrain ne couvre pas tout l'écran
**Symptôme**: Le rendu est limité à une petite zone (800x600 pixels) en bas à gauche au lieu de couvrir tout l'écran.

**Cause probable**: Le canvas a `clientWidth` et `clientHeight` = 0 au moment où le renderer Three.js est initialisé, donc il utilise les valeurs par défaut (800x600).

### 2. Type de terrain incorrect (Earth au lieu d'Alien Swamp)
**Symptôme**: La carte Shamba affiche les textures "Earth" au lieu de "Alien Swamp".

**Cause à vérifier**: Le mapping de la carte vers le type de terrain.

---

## Changements Appliqués pour le Diagnostic

J'ai ajouté des logs de diagnostic dans **IsometricThreeRenderer.ts**:

### 1. Log des dimensions du canvas à l'initialisation
**Ligne ~164**:
```typescript
console.log(`[IsometricThreeRenderer] Canvas dimensions at init: ${width}x${height} (clientWidth=${canvas.clientWidth}, clientHeight=${canvas.clientHeight})`);
```

### 2. Log des appels à handleResize
**Ligne ~270**:
```typescript
console.log(`[IsometricThreeRenderer] handleResize called: ${width}x${height}`);
```

### 3. Log du mapping carte → type de terrain
**Ligne ~743**:
```typescript
console.log(`[IsometricThreeRenderer] Map '${mapName}' -> Terrain type '${terrainType}'`);
```

---

## Instructions pour Diagnostiquer

### Étape 1: Ouvrir le navigateur avec la console

1. Ouvrez **http://localhost:8080** dans votre navigateur
2. Appuyez sur **F12** pour ouvrir la console développeur
3. Sélectionnez l'onglet **Console**

### Étape 2: Vérifier les logs au chargement

Vous devriez voir les logs suivants dans la console:

```
[IsometricThreeRenderer] Canvas dimensions at init: XXXxYYY (clientWidth=XXX, clientHeight=YYY)
[IsometricThreeRenderer] Map 'Shamba' -> Terrain type 'Alien Swamp'
[TextureAtlasManager] Terrain type set to: Alien Swamp
[IsometricThreeRenderer] handleResize called: WWWxHHH
```

### Étape 3: Analyser les résultats

#### Scénario A: Canvas dimensions = 0x0 à l'init
```
[IsometricThreeRenderer] Canvas dimensions at init: 800x600 (clientWidth=0, clientHeight=0)
```

**Diagnostic**: Le canvas n'a pas encore de dimensions quand le renderer est créé.

**Solution**: Le ResizeObserver devrait corriger ça. Vérifiez si vous voyez le log `handleResize` avec les bonnes dimensions juste après.

#### Scénario B: handleResize n'est jamais appelé
Si vous ne voyez PAS le log `handleResize` après l'initialisation:

**Diagnostic**: Le ResizeObserver ne se déclenche pas.

**Solution possible**:
1. Le canvas doit être ajouté au DOM AVANT de créer le renderer
2. Ou ajouter un appel manuel à `handleResize()` après l'ajout au DOM

#### Scénario C: Le type de terrain est incorrect
Si vous voyez:
```
[IsometricThreeRenderer] Map 'Shamba' -> Terrain type 'Earth'
```

**Diagnostic**: Le nom de la carte ne correspond pas exactement à "Shamba" (problème de casse ou d'espaces).

**Solution**: Vérifier le nom exact passé à `loadMap()`.

---

## Solutions Possibles

### Solution 1: Forcer le resize après initialisation

Si le ResizeObserver ne se déclenche pas immédiatement, ajouter dans **map-navigation-ui.ts** après la création du renderer:

```typescript
// After line 80 (renderer creation)
// Force initial resize
setTimeout(() => {
  const width = this.canvas.clientWidth;
  const height = this.canvas.clientHeight;
  console.log(`[MapNavigationUI] Forcing resize: ${width}x${height}`);

  if (width > 0 && height > 0) {
    // Trigger a manual resize event
    window.dispatchEvent(new Event('resize'));
  }
}, 100); // Wait 100ms for DOM to settle
```

### Solution 2: Utiliser requestAnimationFrame

Alternative plus propre dans le constructeur d'**IsometricThreeRenderer.ts**:

```typescript
// After setupResizeObserver() call
// Force initial size calculation on next frame
requestAnimationFrame(() => {
  const width = this.canvas.clientWidth;
  const height = this.canvas.clientHeight;

  if (width > 0 && height > 0) {
    console.log(`[IsometricThreeRenderer] Force resize on next frame: ${width}x${height}`);
    this.handleResize(width, height);
  }
});
```

### Solution 3: Corriger le nom de la carte

Si le problème est le type de terrain, vérifier dans **map-navigation-ui.ts** ligne 98:

```typescript
this.renderer.loadMap('Shamba').then(() => {
```

Vérifier que c'est exactement `'Shamba'` (avec un S majuscule).

---

## Diagnostic Visuel

### À quoi devrait ressembler le rendu correct:

1. **Le terrain couvre TOUT l'écran** (pas juste 800x600 pixels)
2. **Les textures Alien Swamp** (marécage alien, couleurs vertes/brunes spécifiques)
3. **Pas de barre noire sur les côtés**

### À quoi ressemble le problème actuel:

1. Rendu limité à une petite zone en bas à gauche (800x600)
2. Textures Earth (désert/sable beige)

---

## Prochaines Étapes

1. **Ouvrir la console du navigateur** et noter les valeurs exactes des logs
2. **Prendre une capture d'écran** de la console montrant les logs
3. **Me communiquer les résultats** pour que je puisse appliquer le fix approprié

---

## Logs Serveur

Le serveur est démarré et devrait afficher:
```
[Gateway] Server running at http://localhost:8080
```

Les types de terrain disponibles sont:
- **Alien Swamp/Winter**: 181 textures
- **Earth/Winter**: 181 textures
- **Earth/Spring**: 181 textures
- **Earth/Summer**: 181 textures
- **Earth/Autumn**: 181 textures

La carte Shamba devrait utiliser **Alien Swamp**.
