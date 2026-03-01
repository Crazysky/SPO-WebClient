# Supply System — RDO Protocol Reference

Documented from Delphi source: `Kernel.pas`, `SupplySheetForm.pas`, `ObjectInspectorHandleViewer.pas`.

## FindSuppliers

Server-side method (Kernel.pas) for searching available suppliers.

```
FindSuppliers(Output, World, Town, Name, Count, XPos, YPos, SortMode, Roles)
```

**Returns:** Newline-separated results, each row: `x}y}FacName}Company}Town}$Price}Quality`

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| Output | widestring | Output path (Kernel object) |
| World | widestring | World name |
| Town | widestring | Town filter (empty = all) |
| Name | widestring | Fluid name to search |
| Count | integer | Max results |
| XPos, YPos | integer | Building coordinates (for distance sort) |
| SortMode | integer | 0=cost, 1=quality |
| Roles | integer | Role bitmask filter |

**Role bitmask:**
| Value | Constant | Meaning |
|-------|----------|---------|
| 1 | rolProducer | Producer |
| 2 | rolDistributer | Distributor |
| 4 | rolBuyer | Buyer |
| 8 | rolCompExport | Company Export |
| 16 | rolImporter | Importer |

## Supply RDO Methods (SupplySheetForm.pas)

All methods are **procedures** (void). They operate on the currently selected object via `BindTo`.

| Method | Parameters | Description |
|--------|-----------|-------------|
| `RDOSetInputMaxPrice` | `(FluidId: widestring, MaxPrice: integer)` | Set max price willing to pay (0-1000) |
| `RDOSetInputMinK` | `(FluidId: widestring, MinK: integer)` | Set minimum quality threshold (0-100) |
| `RDOSetInputOverPrice` | `(FluidId: widestring, SupplierIdx: integer, OverPrice: integer)` | Set per-supplier overpayment (0-150%) |
| `RDOConnectInput` | `(FluidId: widestring, Suppliers: widestring)` | Connect suppliers. Suppliers = "x1,y1,x2,y2,..." |
| `RDODisconnectInput` | `(FluidId: widestring, Suppliers: widestring)` | Disconnect suppliers. Same coordinate format. |
| `RDOSetInputSortMode` | `(FluidId: widestring, SortMode: integer)` | Set sort mode: 0=cost, 1=quality |

## Supply Properties (per-gate, after SetPath)

| Property | Type | Description |
|----------|------|-------------|
| `MetaFluid` | string | Fluid type identifier |
| `FluidValue` | string | Current production/consumption value |
| `LastCostPerc` | string | Last cost as percentage |
| `minK` | string | Minimum quality threshold (0-100) |
| `MaxPrice` | string | Maximum price (0-1000) |
| `cnxCount` | integer | Number of connections |
| `SortMode` | string | Sort mode: 0=cost, 1=quality |
| `QPSorted` | string | Whether Q/P sorted ("Yes"/"No") |

## Connection Properties (per-connection, indexed)

| Property | Type | Description |
|----------|------|-------------|
| `cnxFacilityName{i}` | string | Connected facility name |
| `cnxCreatedBy{i}` | string | Who created the connection |
| `cnxNfPrice{i}` | string | Negotiated price |
| `OverPriceCnxInfo{i}` | string | Overpayment percentage |
| `LastValueCnxInfo{i}` | string | Last transaction value |
| `tCostCnxInfo{i}` | string | Transportation cost |
| `cnxQuality{i}` | string | Quality percentage |
| `ConnectedCnxInfo{i}` | boolean | Whether actively connected |
| `cnxXPos{i}` | integer | X coordinate of connected facility |
| `cnxYPos{i}` | integer | Y coordinate of connected facility |

## Server Handler Location

All supply RDO commands are handled in `spo_session.ts:6056-6167`. The `additionalParams` object carries:
- `fluidId` — the meta fluid identifier
- `connectionList` — "x1,y1,x2,y2,..." for connect/disconnect
- `index` — supplier index for RDOSetInputOverPrice
