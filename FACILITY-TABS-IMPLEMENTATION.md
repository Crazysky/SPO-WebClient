# Facility Tabs — Remaining Implementation Plan

> Optimised for Opus 4.6 AI Agent. Each item is self-contained with exact file paths, line numbers, code patterns, and Voyager source references. Items are independent — implement in any order.

## Status After Phase 2

Phase 1 completed: 18 dedicated handler definitions, TABLE renderer, columnSuffix, rdoCommands, TABLE response grouping.

Phase 2 completed:
- **Item 1** (RDO write commands): 6 new commands in `buildRdoCommandArgs()`, `property` direct-set support in `setBuildingProperty()`
- **Item 2** (townRes): `TOWN_RES_GROUP` with 9 properties — **all 27/27 handlers now have dedicated definitions (zero GENERIC fallbacks)**
- **Item 3** (CSS): `.data-table`, `.property-enum-select`, `.property-checkbox` styles added
- **Item 6** (ENUM): `PropertyType.ENUM` + `enumLabels` + `renderEnumProperty()` for TradeRole/TradeLevel/Role dropdowns
- **Item 7** (Booleans): Editable checkbox rendering for `AutoProd`/`AutoRel` with `RDOAutoProduce`/`RDOAutoRelease` commands

**All 27 handlers have dedicated PropertyGroup definitions. 136 tests pass, 0 regressions.**

---

## Item 1: RDO Write Commands — Server-Side Wiring

### Problem
`buildRdoCommandArgs()` in `spo_session.ts:4673-4735` only handles 5 commands: `RDOSetPrice`, `RDOSetSalaries`, `RDOSetCompanyInputDemand`, `RDOSetInputMaxPrice`, `RDOSetInputMinK`. The client-side `rdoCommands` mappings in `template-groups.ts` reference 8 additional commands that the server doesn't know how to build arguments for.

### Commands to Add

| Command | Handler | Delphi Source | Args (Delphi types) | RdoValue args |
|---------|---------|--------------|----------------------|---------------|
| `RDOSetTradeLevel` | IndGeneral, WHGeneral | `IndustryGeneralSheet.pas:160` | `value: integer` | `RdoValue.int(value)` |
| `RDOSetRole` | IndGeneral | `IndustryGeneralSheet.pas:145` | `value: integer` | `RdoValue.int(value)` |
| `RDOSetLoanPerc` | BankGeneral | `BankGeneralSheet.pas:98` | `value: integer` | `RdoValue.int(value)` |
| `RDOSetTaxPercent` | townTaxes | `TownTaxesSheet.pas:112` | `index: integer, value: integer` | `RdoValue.int(index), RdoValue.int(value)` |
| `RDOAutoProduce` | Films | `FilmsSheet.pas:372` | `value: WordBool` | `RdoValue.int(value ? 1 : 0)` |
| `RDOAutoRelease` | Films | `FilmsSheet.pas:356` | `value: WordBool` | `RdoValue.int(value ? 1 : 0)` |
| `property` (direct set) | ResGeneral (Rent, Maintenance), TVGeneral (HoursOnAir, Comercials) | Various | Direct property set | `RdoValue.int(value)` |

### Files to Modify

**`src/server/spo_session.ts`**

1. **`buildRdoCommandArgs()` at line 4726** — add cases before `default`:

```typescript
case 'RDOSetTradeLevel':
case 'RDOSetRole':
case 'RDOSetLoanPerc': {
  // Single integer argument
  args.push(RdoValue.int(parseInt(value, 10)));
  break;
}

case 'RDOSetTaxPercent': {
  // Args: tax index, new percentage
  const index = parseInt(params.index || '0', 10);
  args.push(RdoValue.int(index), RdoValue.int(parseInt(value, 10)));
  break;
}

case 'RDOAutoProduce':
case 'RDOAutoRelease': {
  // Boolean as WordBool (#0 or #-1)
  const boolVal = parseInt(value, 10) !== 0 ? -1 : 0;
  args.push(RdoValue.int(boolVal));
  break;
}

case 'property': {
  // Direct property set: command becomes the property name from additionalParams
  // Handled differently — use SET instead of CALL
  args.push(RdoValue.int(parseInt(value, 10)));
  break;
}
```

2. **`setBuildingProperty()` at line 4621** — handle `property` command differently:
   - Current code always uses `call` verb: `C sel ${currBlock} call ${propertyName} "*" ${rdoArgs};`
   - For `command: 'property'`, change to `set` verb: `C sel ${currBlock} set ${actualPropName}="${rdoArgs}";`
   - The actual property name (e.g., `Rent`) must be passed via `additionalParams.propertyName`

3. **`mapRdoCommandToPropertyName()` at line 4771** — add verification mappings:

```typescript
case 'RDOSetTradeLevel':
  return 'TradeLevel';
case 'RDOSetRole':
  return 'Role';
case 'RDOSetLoanPerc':
  return 'BudgetPerc';
case 'RDOSetTaxPercent':
  return `Tax${params.index || '0'}Percent`;
case 'RDOAutoProduce':
  return 'AutoProd';
case 'RDOAutoRelease':
  return 'AutoRel';
case 'property':
  return params.propertyName || rdoCommand;
```

**`src/client/ui/building-details/building-details-panel.ts`**

4. Update `mapPropertyToRdoCommand()` — for `command: 'property'`, pass property name:

```typescript
if (mapping.command === 'property') {
  return { rdoCommand: 'property', params: { propertyName: propertyName } };
}
```

### RDO Conformity Check
- `RDOSetTradeLevel`: Delphi published procedure, single integer arg → `call`, `*` separator
- `RDOSetRole`: Delphi published procedure, single integer arg → `call`, `*` separator
- `RDOSetLoanPerc`: Delphi published procedure, single integer arg → `call`, `*` separator
- `RDOSetTaxPercent`: Delphi published procedure, index + value → `call`, `*` separator
- `RDOAutoProduce`/`RDOAutoRelease`: Delphi published procedure, WordBool arg → `call`, `*` separator, `#-1`=true `#0`=false
- `property` (direct set): Delphi published property → `set` verb, no separator

### Tests
Add cases to existing `spo_session` tests or create `src/server/__tests__/building-property-write.test.ts`:
- Verify `buildRdoCommandArgs` produces correct RDO string for each new command
- Verify `mapRdoCommandToPropertyName` returns correct read-back property

---

## Item 2: `townRes` Handler — Residential Statistics

### Problem
`townRes` maps to `GENERIC_GROUP` in `template-groups.ts:575`. The Voyager source reveals 9 specific RDO properties.

### Voyager Source
**File:** `C:\Users\Crazz\Documents\SPO\SPO-Original\Voyager\TownHallResSheet.pas`

The handler uses `FiveViewUtils.GetViewPropNames()` which extracts property names from UI control names prefixed with `xfer_`. All 9 properties are read-only (no write commands).

### RDO Properties

| Property | Type | Description |
|----------|------|-------------|
| `hiResDemand` | NUMBER | High-class residential demand |
| `hiResQ` | NUMBER | High-class residential quantity |
| `hiRentPrice` | CURRENCY | High-class rent price |
| `midResDemand` | NUMBER | Middle-class residential demand |
| `midResQ` | NUMBER | Middle-class residential quantity |
| `midRentPrice` | CURRENCY | Middle-class rent price |
| `loResDemand` | NUMBER | Low-class residential demand |
| `loResQ` | NUMBER | Low-class residential quantity |
| `loRentPrice` | CURRENCY | Low-class rent price |

### UI Layout (from Voyager DFM)
Three horizontal panels (High / Middle / Low class), each showing Demand, Rent Price, Quantity.

### Files to Modify

**`src/shared/building-details/template-groups.ts`**

1. Add new group constant:

```typescript
export const TOWN_RES_GROUP: PropertyGroup = {
  id: 'townRes',
  name: 'Residential',
  icon: 'R',
  order: 10,
  properties: [
    { rdoName: 'hiResDemand', displayName: 'High Class Demand', type: PropertyType.NUMBER },
    { rdoName: 'hiResQ', displayName: 'High Class Population', type: PropertyType.NUMBER },
    { rdoName: 'hiRentPrice', displayName: 'High Class Rent', type: PropertyType.CURRENCY },
    { rdoName: 'midResDemand', displayName: 'Middle Class Demand', type: PropertyType.NUMBER },
    { rdoName: 'midResQ', displayName: 'Middle Class Population', type: PropertyType.NUMBER },
    { rdoName: 'midRentPrice', displayName: 'Middle Class Rent', type: PropertyType.CURRENCY },
    { rdoName: 'loResDemand', displayName: 'Low Class Demand', type: PropertyType.NUMBER },
    { rdoName: 'loResQ', displayName: 'Low Class Population', type: PropertyType.NUMBER },
    { rdoName: 'loRentPrice', displayName: 'Low Class Rent', type: PropertyType.CURRENCY },
  ],
};
```

2. Update `HANDLER_TO_GROUP`:
```typescript
'townRes': TOWN_RES_GROUP,  // was GENERIC_GROUP
```

3. Add to `GROUP_BY_ID`:
```typescript
'townRes': TOWN_RES_GROUP,
```

4. Export `TOWN_RES_GROUP`.

**`src/shared/building-details/template-groups.test.ts`**

5. Update test: `'should map most handlers to non-GENERIC groups'` — `genericHandlers` should now be empty `[]`.
6. Add property verification test for townRes.

---

## Item 3: CSS Styles for `renderDataTable()`

### Problem
The TABLE renderer (`property-renderers.ts:439-533`) creates HTML with CSS classes that have no styles defined: `.data-table-container`, `.data-table`, `.data-table-empty`, `.data-cell`, `.data-cell-*`, `.table-cell-slider`, `.table-cell-slider-value`.

### File to Modify

**`public/design-system.css`** — append after line 1490.

### CSS to Add

Model after existing `.workforce-table` styles (lines 962-1059). Use the same CSS variables for consistency.

```css
/* =============================================================================
   DATA TABLE (PropertyType.TABLE — bank loans, votes, towns, taxes, etc.)
   ============================================================================= */

.data-table-container {
  width: 100%;
  overflow-x: auto;
}

.data-table-empty {
  padding: var(--space-4);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface-base);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.data-table thead {
  background: var(--surface-elevated);
}

.data-table th {
  padding: var(--space-2) var(--space-3);
  text-align: left;
  font-weight: 600;
  font-size: var(--text-xs);
  color: var(--text-primary);
  border-bottom: 2px solid var(--glass-border);
  white-space: nowrap;
}

.data-table tbody tr {
  border-bottom: 1px solid var(--glass-border);
  transition: background-color var(--transition-fast);
}

.data-table tbody tr:hover {
  background: var(--surface-elevated);
}

.data-table tbody tr:last-child {
  border-bottom: none;
}

.data-table td {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.data-cell-currency {
  color: var(--success-green);
  font-weight: 500;
}

.data-cell-percentage {
  text-align: right;
}

.data-cell-number {
  text-align: right;
}

.data-cell-boolean {
  text-align: center;
}

/* Inline slider in table cells */
.table-cell-slider {
  width: 80px;
  height: 4px;
  vertical-align: middle;
  accent-color: var(--accent-primary);
}

.table-cell-slider-value {
  display: inline-block;
  width: 36px;
  text-align: right;
  font-size: var(--text-xs);
  color: var(--text-primary);
  margin-left: var(--space-1);
}
```

### CSS Variables Reference (from design-system.css)
All variables used above already exist in `:root` at the top of design-system.css:
- `--surface-base`, `--surface-elevated` — background colors
- `--text-primary`, `--text-secondary`, `--text-muted` — text colors
- `--glass-border` — subtle borders
- `--space-1` through `--space-4` — spacing scale
- `--text-xs`, `--text-sm` — font sizes
- `--radius-md`, `--shadow-sm` — border radius and shadows
- `--transition-fast` — hover transition
- `--success-green` — positive value color
- `--accent-primary` — slider accent

---

## Item 4: Mock Server Scenarios for New Handlers

### Problem
Development mode uses mock scenarios. No mock data exists for the newly-mapped handlers (BankLoans, Antennas, Films, Votes, CapitolTowns, Ministeries, townJobs, townServices, townTaxes, etc.). When testing in dev mode, these tabs show "No data available".

### Architecture
- Scenario files live in `src/mock-server/scenarios/`
- Each exports a `create*Scenario()` function returning `{ ws, rdo, http? }`
- RDO exchanges use `matchKeys: { verb, action, member }` for matching
- GetPropertyList responses are tab-delimited values matching tab-delimited property names
- Registered in `src/mock-server/scenarios/scenario-registry.ts`

### Pattern (from switch-focus-scenario.ts)

```typescript
const rdo: RdoScenario = {
  name: 'scenario-name',
  description: '...',
  exchanges: [{
    id: 'exchange-id',
    request: '',
    response: 'C sel <objectId> get PropertyList "%prop1\\tprop2\\tprop3"',
    matchKeys: { verb: 'get', action: 'get', member: 'PropertyList' },
  }],
};
```

### Implementation

Create `src/mock-server/scenarios/building-details-scenario.ts` with:

1. **Sample data objects** for each building type (factory, bank, TV station, capitol, town hall)
2. **GetPropertyList mock responses** with realistic tab-separated values
3. **Register** in `scenario-registry.ts`

Example for BankLoans:
```typescript
// LoanCount=3, then 3 rows of: Debtor{i}, Amount{i}, Interest{i}, Term{i}
const bankLoansResponse = [
  '3',                      // LoanCount
  'Yellow Inc.',            // Debtor0
  '1500000',               // Amount0
  '12',                     // Interest0
  '5',                      // Term0
  'Blue Corp.',             // Debtor1
  '800000',                 // Amount1
  '15',                     // Interest1
  '3',                      // Term1
  'Green Ltd.',             // Debtor2
  '2000000',                // Amount2
  '10',                     // Interest2
  '7',                      // Term2
].join('\t');
```

### Scope
This is medium priority — real server testing works without mocks. Defer if time-constrained.

---

## Item 5: HQ Inventions Sub-Handler

### Problem
HQ buildings (`HqGeneral`, 35 classes) show basic properties identical to `unkGeneral`. The Voyager client has a dedicated `hdqInventions` handler with a tree view showing available/researched/scheduled inventions.

### Voyager Source
- **`InventionsSheet.pas`**: `TInventionsSheetHandler` with tree views (`tvAvailInventions`, `tvAlrDevInventions`, `lvSchedInvention`)
- **`InventionData.pas`**: `TInventionData` class parsing MSXML invention data
- **`HqMainSheet.pas`**: Loads `SheetHandlerRegistry.GetSheetHandler('hdqInventions')` as sub-handler

### Complexity: HIGH
This is a complex nested UI requiring:
1. XML parsing of invention data from server
2. Tree view rendering (available → researched → scheduled)
3. RDO calls for scheduling/canceling inventions: `RDOResearchInvention`, `RDOCancelResearch`
4. Server-side GetSubObjectProps for invention details
5. Custom UI components (tree nodes, drag-drop scheduling)

### Recommendation
**Defer to a separate PR.** The current `HQ_GENERAL_GROUP` shows the same basic info as before. Inventions require a dedicated UI component, not just property rendering.

### When Implementing
- Add `INVENTIONS_GROUP` with `special: 'inventions'` to template-groups.ts
- Add inventions handler ID `'hdqInventions'` to HANDLER_TO_GROUP
- Create `src/client/ui/building-details/inventions-panel.ts` with tree view renderer
- Add `isInventions` special case to `renderTabContent()` in building-details-panel.ts
- Server: implement `GetSubObjectProps` proxy for invention sub-objects

---

## Item 6: Dropdown/Enum Renderers for TradeRole and TradeLevel

### Problem
`TradeRole` and `TradeLevel` are displayed as raw numbers (e.g., "3" instead of "Buyer").

### Voyager Enum Values

**TradeRole** (from `IndustryGeneralSheet.pas:130`):
```
TFacilityRole = (rolNeutral, rolProducer, rolDistributer, rolBuyer, rolImporter, rolCompExport, rolCompInport);
```

| Value | Enum | Display Label |
|-------|------|---------------|
| 0 | `rolNeutral` | Neutral |
| 1 | `rolProducer` | Producer |
| 2 | `rolDistributer` | Distributor |
| 3 | `rolBuyer` | Buyer |
| 4 | `rolImporter` | Importer |
| 5 | `rolCompExport` | Export |
| 6 | `rolCompInport` | Import |

**TradeLevel** (from `IndustryGeneralSheet.pas:131`):
```
TTradeLevel = (tlvSameOnwner, tlvPupil, tlvAllies, tlvAnyone);
```

| Value | Enum | Display Label |
|-------|------|---------------|
| 0 | `tlvSameOnwner` | Same Owner |
| 1 | `tlvPupil` | Subsidiaries |
| 2 | `tlvAllies` | Allies |
| 3 | `tlvAnyone` | Anyone |

### Files to Modify

**`src/shared/building-details/property-definitions.ts`**

1. Add new PropertyType:
```typescript
/** Dropdown/select for enum values (TradeRole, TradeLevel) */
ENUM = 'ENUM',
```

2. Add enum mapping field to PropertyDefinition:
```typescript
/** For ENUM: map of numeric value → display label */
enumLabels?: Record<string, string>;
```

**`src/shared/building-details/template-groups.ts`**

3. Update `IND_GENERAL_GROUP`, `WH_GENERAL_GROUP` properties:
```typescript
{
  rdoName: 'TradeRole',
  displayName: 'Trade Role',
  type: PropertyType.ENUM,
  enumLabels: {
    '0': 'Neutral', '1': 'Producer', '2': 'Distributor',
    '3': 'Buyer', '4': 'Importer', '5': 'Export', '6': 'Import',
  },
},
{
  rdoName: 'TradeLevel',
  displayName: 'Trade Level',
  type: PropertyType.ENUM,
  editable: true,
  enumLabels: {
    '0': 'Same Owner', '1': 'Subsidiaries', '2': 'Allies', '3': 'Anyone',
  },
},
```

**`src/client/ui/building-details/property-renderers.ts`**

4. Add `renderEnumProperty()`:
```typescript
export function renderEnumProperty(
  value: string,
  definition: PropertyDefinition,
  onChange?: (value: number) => void
): HTMLElement {
  if (definition.editable && definition.enumLabels && onChange) {
    // Render as <select> dropdown
    const select = document.createElement('select');
    select.className = 'property-enum-select';
    for (const [val, label] of Object.entries(definition.enumLabels)) {
      const option = document.createElement('option');
      option.value = val;
      option.textContent = label;
      option.selected = val === value;
      select.appendChild(option);
    }
    select.onchange = () => onChange(parseInt(select.value, 10));
    return select;
  }
  // Read-only: show label
  const span = document.createElement('span');
  span.className = 'property-value property-enum';
  span.textContent = definition.enumLabels?.[value] || value;
  return span;
}
```

5. Add `case PropertyType.ENUM:` to `renderPropertyRow()` switch at line 171.

**`public/design-system.css`**

6. Add select styling:
```css
.property-enum-select {
  background: var(--surface-elevated);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
}
```

---

## Item 7: Editable Boolean/Checkbox Controls

### Problem
Properties like `AutoProd`, `AutoRel` (Films handler) display as "Yes/No" text but are not interactive. The Voyager source shows these are togglable via dedicated RDO methods.

### Voyager Commands
- `RDOAutoProduce(value: WordBool)` — `FilmsSheet.pas:372`
- `RDOAutoRelease(value: WordBool)` — `FilmsSheet.pas:356`
- WordBool: `#-1` = true, `#0` = false (Delphi convention)

### Files to Modify

**`src/shared/building-details/template-groups.ts`**

1. Mark boolean properties as editable in `FILMS_GROUP`:
```typescript
{ rdoName: 'AutoProd', displayName: 'Auto Produce', type: PropertyType.BOOLEAN, editable: true },
{ rdoName: 'AutoRel', displayName: 'Auto Release', type: PropertyType.BOOLEAN, editable: true },
```

2. Add rdoCommands to FILMS_GROUP:
```typescript
rdoCommands: {
  'AutoProd': { command: 'RDOAutoProduce' },
  'AutoRel': { command: 'RDOAutoRelease' },
},
```

**`src/client/ui/building-details/property-renderers.ts`**

3. Update `renderBooleanProperty()` (line 136) to accept optional onChange callback:
```typescript
export function renderBooleanProperty(
  value: string,
  editable?: boolean,
  onChange?: (value: number) => void
): HTMLElement {
  const isTrue = value === '1' || value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';

  if (editable && onChange) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'property-checkbox';
    checkbox.checked = isTrue;
    checkbox.onchange = () => onChange(checkbox.checked ? 1 : 0);
    return checkbox;
  }

  const span = document.createElement('span');
  span.className = 'property-value property-boolean';
  span.textContent = isTrue ? 'Yes' : 'No';
  span.classList.add(isTrue ? 'text-success' : 'text-muted');
  return span;
}
```

4. Update `renderPropertyRow()` BOOLEAN case (line 192) to pass editable + onChange:
```typescript
case PropertyType.BOOLEAN:
  valueElement = renderBooleanProperty(
    propertyValue.value,
    definition.editable,
    definition.editable && onSliderChange ? onSliderChange : undefined
  );
  break;
```

**`src/server/spo_session.ts`**

5. Add `RDOAutoProduce` and `RDOAutoRelease` to `buildRdoCommandArgs()` (covered in Item 1).

**`public/design-system.css`**

6. Add checkbox styling:
```css
.property-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}
```

---

## Item 8: Connection Management UI

### Problem
Supply and service tabs show connection count (`cnxCount`) but no UI to connect/disconnect suppliers. The Voyager client has a full connection management UI with a list of connected suppliers and connect/disconnect buttons.

### Voyager Architecture
- **SupplySheetForm.pas**: Iterates `cnxCount` connections using `GetSubObjProperties(proxy, i, [cnxFacilityName, cnxCreatedBy, ...])`
- **SetPath**: Required before accessing sub-object properties — navigates proxy to input path
- **RDO Commands**: `RDOConnectInput(fluidId%, cnxs%)`, `RDODisconnectInput(fluidId%, cnxs%)`

### Connection Properties per Index

| Property | Type | Description |
|----------|------|-------------|
| `cnxFacilityName{i}` | TEXT | Connected facility name |
| `cnxCreatedBy{i}` | TEXT | Creator company |
| `cnxCompanyName{i}` | TEXT | Supplier company |
| `cnxNfPrice{i}` | CURRENCY | Negotiated price |
| `cnxQuality{i}` | PERCENTAGE | Quality rating |
| `ConnectedCnxInfo{i}` | BOOLEAN | Is actively connected |
| `cnxXPos{i}` | NUMBER | Map X coordinate (for navigation) |
| `cnxYPos{i}` | NUMBER | Map Y coordinate (for navigation) |
| `OverPriceCnxInfo{i}` | TEXT | Overpricing details |
| `LastValueCnxInfo{i}` | TEXT | Last value transferred |

### Implementation Scope: HIGH

**Server-side:**
1. `spo_session.ts`: Implement `SetPath` before reading connection sub-objects
2. `spo_session.ts`: Implement `GetSubObjectProps(index, propertyNames)` call
3. `spo_session.ts`: Add `RDOConnectInput` and `RDODisconnectInput` to `buildRdoCommandArgs()`
4. Wire connection list data into the existing `BuildingSupplyData` type in `shared/types.ts`

**Client-side:**
5. `property-table.ts`: Already has `renderConnectionsTable()` with navigation support
6. Add connect/disconnect buttons to each connection row
7. Add "Find Suppliers" search UI (optional — complex)

**WebSocket messages:**
8. May need new message types for connection operations, or reuse `REQ_BUILDING_SET_PROPERTY`

### Recommendation
**Split into sub-tasks:**
- Phase A: Read-only connection list display (show connected suppliers with navigate buttons) — Medium effort
- Phase B: Connect/disconnect buttons with RDO commands — Medium effort
- Phase C: "Find Suppliers" search — High effort (requires server-side supplier search)

### Current Partial Implementation
`src/client/ui/building-details/property-table.ts` already renders a connections table from `BuildingSupplyData.connections[]`. The data flow from server to this component is already wired. The gap is:
- Server doesn't fetch connection sub-object properties (only fetches supply-level properties)
- No connect/disconnect RDO command handling

---

## Priority Order

| Priority | Item | Effort | Impact | Status |
|----------|------|--------|--------|--------|
| 1 | Item 3: CSS for data tables | Low (CSS only) | All TABLE handlers visible | DONE |
| 2 | Item 2: townRes handler | Low (9 properties) | Last handler completed | DONE |
| 3 | Item 6: Enum dropdowns | Low-Medium | TradeRole/TradeLevel readable | DONE |
| 4 | Item 7: Boolean checkboxes | Low-Medium | Films toggles work | DONE |
| 5 | Item 1: RDO write commands | Medium | All editable properties work | DONE |
| 6 | Item 4: Mock scenarios | Medium | Dev mode testing | TODO |
| 7 | Item 8: Connections | High | Supply management | TODO |
| 8 | Item 5: HQ Inventions | Very High | Research system | TODO |

---

## Cross-Cutting References

### Key File Paths
| Purpose | Path |
|---------|------|
| Property type definitions | `src/shared/building-details/property-definitions.ts` |
| Handler registry | `src/shared/building-details/template-groups.ts` |
| Template cache + property collection | `src/shared/building-details/property-templates.ts` |
| Client property renderers | `src/client/ui/building-details/property-renderers.ts` |
| Client panel controller | `src/client/ui/building-details/building-details-panel.ts` |
| Client supply/connection renderer | `src/client/ui/building-details/property-table.ts` |
| Server building details handler | `src/server/spo_session.ts` (lines 4120-4779) |
| Server WebSocket handler | `src/server/server.ts` (line 1470) |
| Client WebSocket client | `src/client/client.ts` (lines 814, 958) |
| CSS styles | `public/design-system.css` |
| Mock scenarios | `src/mock-server/scenarios/` |
| Tests | `src/shared/building-details/template-groups.test.ts` |

### RDO Type Prefix Quick Reference
| Prefix | Type | RdoValue method |
|--------|------|-----------------|
| `#` | Integer | `RdoValue.int(n)` |
| `%` | WideString | `RdoValue.string(s)` |
| `!` | Float | `RdoValue.float(n)` |
| `@` | Double | `RdoValue.double(n)` |
| `$` | ShortString | `RdoValue.stringId(s)` |
| `*` | Void | `RdoValue.void()` |

### WordBool Convention (Delphi)
- `#-1` = true (all bits set)
- `#0` = false
- Used by: `RDOAutoProduce`, `RDOAutoRelease`
