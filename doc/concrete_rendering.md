# Concrete Rendering System

Technical reference for the concrete texture system around buildings.

## Overview

Concrete textures are drawn around buildings to create paved areas. The system uses:
- **Land concrete** (IDs 0-12): Standard pavement on land
- **Water platforms** (IDs $80-$88): Platform textures for buildings near/on water
- **Road concrete** (IDs $10-$1B): Concrete under roads

## Coordinate System

Isometric cardinal directions relative to screen:
```
           N (row-1)
           ↗ top-right
           │
W (col-1) ─┼─ E (col+1)
top-left   │  bottom-right
           ↙
           S (row+1)
           bottom-left
```

## Land Concrete Textures

| ID | Texture | Pattern | Visual Position |
|----|---------|---------|-----------------|
| 0 | Conc1.bmp | Vertical/horizontal strip | Edge strip |
| 1 | Conc2.bmp | All cardinals, missing TL diagonal | Corner notch TL |
| 2 | Conc3.bmp | NE corner exposed | NE corner |
| 3 | Conc4.bmp | NW corner exposed | NW corner |
| 4 | Conc5.bmp | All cardinals, missing TR diagonal | Corner notch TR |
| 5 | Conc6.bmp | Right/East edge exposed | E edge |
| 6 | Conc7.bmp | Top/South edge exposed | S edge |
| 7 | Conc8.bmp | Left/West edge exposed | W edge |
| 8 | Conc9.bmp | All cardinals, missing BR diagonal | Corner notch BR |
| 9 | Conc10.bmp | SW corner exposed | SW corner |
| 10 | Conc11.bmp | SE corner exposed | SE corner |
| 11 | Conc12.bmp | All cardinals, missing BL diagonal | Corner notch BL |
| 12 | Conc13.bmp | Full concrete (all neighbors) | Center |

## Water Platform Textures

| ID | Texture | Cardinals Present | Edge Exposed |
|----|---------|-------------------|--------------|
| $80 (128) | platC.bmp | All 4 | Center (none) |
| $81 (129) | platE.bmp | T,L,B | East edge |
| $82 (130) | platN.bmp | L,R,B | North edge |
| $83 (131) | platNE.bmp | L,B | NE corner |
| $84 (132) | platNW.bmp | R,B | NW corner |
| $85 (133) | platS.bmp | T,L,R | South edge |
| $86 (134) | platSE.bmp | T,L | SE corner |
| $87 (135) | platSW.bmp | T,R | SW corner |
| $88 (136) | platW.bmp | T,R,B | West edge |

## Decision Tree Logic

The concrete ID is determined by which neighbors have concrete:

```
Pattern: [Top][Left][Right][Bottom] (cardinal neighbors)

TL__ (T+L present, R+B missing) → ID 3  (NW corner, Conc4)
__RB (R+B present, T+L missing) → ID 10 (SE corner, Conc11)
T_R_ (T+R present, L+B missing) → ID 9  (SW corner, Conc10)
_L_B (L+B present, T+R missing) → ID 2  (NE corner, Conc3)
_LRB (L+R+B present, T missing) → ID 0  (North edge, Conc1)
TLR_ (T+L+R present, B missing) → ID 6  (South edge, Conc7)
TL_B (T+L+B present, R missing) → ID 5  (East edge, Conc6)
T_RB (T+R+B present, L missing) → ID 7  (West edge, Conc8)
TLRB (all present)              → ID 12 or check diagonals
```

## Painter's Algorithm

Concrete tiles are sorted using `sortForPainter()` from `painter-algorithm.ts`:
- Higher `(i+j)` = back of screen (drawn first)
- Lower `(i+j)` = front of screen (drawn last, overlaps previous)

This ensures proper visual overlap at corners and edges.

## Water Concrete Rules

A water tile gets concrete if:
1. Adjacent to a building on water, OR
2. Adjacent to a road on water

A tile does NOT get concrete if:
- The tile itself has a road (road is drawn instead)
- The tile itself has a building (building is drawn instead)

```
Legend: ≈≈=water  ══=road  ▓▓=concrete  ██=building

T-section on water:          Corner on water:
 ≈≈  ≈≈  ══  ≈≈  ≈≈          ≈≈  ≈≈  ══  ≈≈  ≈≈
 ≈≈  ▓▓  ══  ▓▓  ≈≈          ≈≈  ▓▓  ══  ▓▓  ≈≈
 ≈≈  ▓▓  ══  ══  ══          ≈≈  ▓▓  ══  ══  ══
 ≈≈  ▓▓  ══  ▓▓  ≈≈          ≈≈  ▓▓  ▓▓  ▓▓  ≈≈
 ≈≈  ≈≈  ══  ≈≈  ≈≈          ≈≈  ≈≈  ≈≈  ≈≈  ≈≈

Building along road on water:
 ≈≈  ▓▓  ▓▓  ▓▓  ≈≈
 ≈≈  ▓▓  ██  ▓▓  ≈≈
 ══  ══  ══  ══  ══
 ≈≈  ▓▓  ▓▓  ▓▓  ≈≈
 ≈≈  ≈≈  ≈≈  ≈≈  ≈≈
```

## Water Platform Texture Selection

Only tiles ACTUALLY on water (LandClass.ZoneD) use platform textures.
Land tiles adjacent to water use regular land concrete.

Platform textures are drawn at native 64x32 size (no scaling).

## INI File Format

Concrete textures are defined in `cache/ConcreteClasses/*.ini`:

```ini
[General]
Id = 3          ; Decimal ID
; or
Id = $83        ; Hexadecimal ID (Delphi format)

[Images]
64X32 = Conc4.bmp
```

## Debug Mode

Press `3` to toggle concrete debug overlay showing:
- `C:XX` - Concrete ID in hex on each tile
- Debug panel with neighbor configuration
- Texture filename for hovered tile

## Key Files

| File | Purpose |
|------|---------|
| `src/client/renderer/concrete-texture-system.ts` | Core texture selection logic |
| `src/client/renderer/isometric-map-renderer.ts` | Rendering and debug overlay |
| `cache/ConcreteClasses/*.ini` | Texture ID definitions |
| `cache/ConcreteImages/*.bmp` | Texture assets |
