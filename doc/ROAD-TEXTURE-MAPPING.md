# Road Texture Mapping Reference

This document provides the **definitive** mapping of road textures based on visual analysis of the actual BMP files.

## Coordinate System

### Map Coordinates to Screen Positions

The isometric transformation formula:
```
screen_x = u * (rows - i + j)
screen_y = (u/2) * ((rows - i) + (cols - j))
```

### CRITICAL: Code Variables vs Screen Directions

**The code uses N/S/E/W variable names, but these do NOT match visual screen directions!**

| Code Variable | Offset | Actual Screen Position |
|---------------|--------|------------------------|
| `hasN` (i-1) | row above | **SOUTH-EAST** (right-down) |
| `hasS` (i+1) | row below | **NORTH-WEST** (left-up) |
| `hasE` (j+1) | column right | **NORTH-EAST** (right-up) |
| `hasW` (j-1) | column left | **SOUTH-WEST** (left-down) |

### Isometric Diamond on Screen

```
                 TOP (vertex)
                   /\
         (i+1)   /    \   (j+1)
        NW      /        \      NE
      (left-up)/          \(right-up)
              /            \
       LEFT  ·    TILE      ·  RIGHT
              \            /
    (left-down)\          /(right-down)
        SW      \        /      SE
         (j-1)   \    /   (i-1)
                   \/
                BOTTOM (vertex)
```

## Corner Textures - DEFINITIVE MAPPING

Based on **visual analysis of actual BMP files** (ASCII art pixel analysis):

| Texture File | Visual Shape | Fills | Code Neighbors | Screen Directions |
|--------------|--------------|-------|----------------|-------------------|
| **RoadcornerW.bmp** | L on RIGHT | Right half | `hasN && hasE` | SE ↔ NE |
| **RoadcornerE.bmp** | L on LEFT | Left half | `hasS && hasW` | NW ↔ SW |
| **RoadcornerN.bmp** | L on BOTTOM | Bottom half | `hasN && hasW` | SE ↔ SW |
| **RoadcornerS.bmp** | L on TOP | Top half | `hasS && hasE` | NW ↔ NE |

### Visual Representation

**RoadcornerW.bmp** - Road fills RIGHT side of diamond
```
        ·
       / \
      /   ·····> (j+1 = NE)
     /    ###\
    ·    ####·
     \   ###/
      \  ##/
       \##/
        ·
      (i-1 = SE)
```

**RoadcornerE.bmp** - Road fills LEFT side of diamond
```
        ·
       /##\
      /###\
(j-1) <···##·
    ·####    ·
     \###   /
      \##  /
       \##/
        ·
      (i+1 = NW)
```

**RoadcornerN.bmp** - Road fills BOTTOM of diamond
```
        ·
       / \
      /   \
     /     \
    ·       ·
     \#####/
 (j-1) ·###· (i-1)
  SW    \#/    SE
        ·
```

**RoadcornerS.bmp** - Road fills TOP of diamond
```
        ·
       /#\
 (i+1) ·###· (j+1)
  NW   /###\   NE
    ·#######·
     \     /
      \   /
       \ /
        ·
```

## T-Junction Textures

Based on **visual testing** (corrected mapping):

| Texture | Missing Neighbor | Screen Direction | Code Check |
|---------|------------------|------------------|------------|
| **RoadTN.bmp** | j+1 missing | NE on screen | `!hasE` |
| **RoadTS.bmp** | j-1 missing | SW on screen | `!hasW` |
| **RoadTE.bmp** | i-1 missing | SE on screen | `!hasN` |
| **RoadTW.bmp** | i+1 missing | NW on screen | `!hasS` |

## Straight Road Textures

| Texture | Direction | Connects | Code Check |
|---------|-----------|----------|------------|
| **Roadvert.bmp** | Diagonal `/` | SE ↔ NW | `hasN && hasS` |
| **Roadhorz.bmp** | Diagonal `\` | NE ↔ SW | `hasE && hasW` |

## Implementation Code

```typescript
// In calculateTopologyFromMap():

// Neighbors (LEGACY variable names - do NOT match screen directions!)
const hasN = roadTilesMap.has(`${j},${i - 1}`);  // Actually SOUTH-EAST on screen
const hasS = roadTilesMap.has(`${j},${i + 1}`);  // Actually NORTH-WEST on screen
const hasE = roadTilesMap.has(`${j + 1},${i}`);  // Actually NORTH-EAST on screen
const hasW = roadTilesMap.has(`${j - 1},${i}`);  // Actually SOUTH-WEST on screen

// Corners - based on VISUAL texture analysis
if (hasN && hasE) return CORNER_W;  // RIGHT side (SE + NE)
if (hasS && hasE) return CORNER_S;  // TOP side (NW + NE)
if (hasS && hasW) return CORNER_E;  // LEFT side (NW + SW)
if (hasN && hasW) return CORNER_N;  // BOTTOM side (SE + SW)

// T-junctions (corrected based on visual testing)
if (!hasN) return T_E;  // Missing SE → RoadTE
if (!hasS) return T_W;  // Missing NW → RoadTW
if (!hasE) return T_N;  // Missing NE → RoadTN
if (!hasW) return T_S;  // Missing SW → RoadTS
```

## Texture Variants

### Surface Types

| Surface | Prefix | Example |
|---------|--------|---------|
| Rural (land) | Country | CountryRoadcornerW.bmp |
| Urban (concrete) | (none) | RoadcornerW.bmp |

### Smooth Corners

| Corner | Rural | Urban |
|--------|-------|-------|
| W (RIGHT) | countryroadSmoothCornerW.bmp | roadSmoothCornerW.bmp |
| E (LEFT) | countryroadSmoothCornerE.bmp | roadSmoothCornerE.bmp |
| N (BOTTOM) | countryroadSmoothCornerN.bmp | roadSmoothCornerN.bmp |
| S (TOP) | countryroadSmoothCornerS.bmp | roadSmoothCornerS.bmp |

### Bridges

| Texture | Direction |
|---------|-----------|
| NSBridge.bmp | Diagonal `/` (SE ↔ NW) |
| WEBridge.bmp | Diagonal `\` (NE ↔ SW) |

## Debugging

Press **'D'** to enable debug mode, then **'5'** to toggle road info overlay.

**Checklist:**
1. Check neighbor values (N/S/E/W) - remember they are LEGACY names
2. Verify topology matches expected based on this document
3. Verify texture file is correct for the topology
4. Check screen position of rendered sprite

## Summary Table

| Code Neighbors | Topology | Texture | Visual Position |
|----------------|----------|---------|-----------------|
| N + E | CORNER_W | RoadcornerW | RIGHT side |
| S + E | CORNER_S | RoadcornerS | TOP side |
| S + W | CORNER_E | RoadcornerE | LEFT side |
| N + W | CORNER_N | RoadcornerN | BOTTOM side |
| N + S | NS | Roadvert | Diagonal `/` |
| E + W | WE | Roadhorz | Diagonal `\` |
| !N | T_E | RoadTE | Missing SE on screen |
| !S | T_W | RoadTW | Missing NW on screen |
| !E | T_N | RoadTN | Missing NE on screen |
| !W | T_S | RoadTS | Missing SW on screen |
