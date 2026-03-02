---
name: building-inspector
description: "Building facility inspector: property fetching protocol, tab configurations, handler types, and gap status."
user-invokable: false
disable-model-invocation: false
---

# Building Inspector

Auto-loaded when working on `building-details/`, `property-templates.ts`, `template-groups.ts`, or facility inspector features.

## GetPropertyList Protocol

The core method to fetch building properties:

```
Request:  Proxy.GetPropertyList("SecurityId\tTrouble\tCurrBlock\t")
Response: "value1\tvalue2\tvalue3\t"
```

- Property names joined with TAB (`\t`) separator
- Request string MUST end with a trailing TAB
- Response values are TAB-separated in same order
- Empty values = TAB without preceding text
- Source: `Voyager/SheetUtils.pas:67`

## Tab Configuration (from CLASSES.BIN)

Each of the 863 visual classes has an `[InspectorInfo]` section:
```ini
TabCount=4
TabName0=GENERAL
TabHandler0=IndGeneral
TabName1=PRODUCTS
TabHandler1=Products
```

The parser at `src/server/classes-bin-parser.ts` reads `[General]`, `[MapImages]`, etc. but does NOT yet extract `[InspectorInfo]`.

## Handler Types (27 total)

Handlers map to PropertyGroups via `HANDLER_TO_GROUP` in `property-templates.ts`:

| Handler | Property Group | Category |
|---------|---------------|----------|
| `IndGeneral` | IND_GENERAL_GROUP | General info |
| `Products` | PRODUCTS_GROUP | Output flows |
| `Supplies` | SUPPLIES_GROUP | Input flows (GetInputNames+SetPath protocol) |
| `compInputs` | ADVERTISEMENT_GROUP | Company inputs (cInputCount/cInput{i}.* protocol) |
| `facManagement` | UPGRADE_GROUP | Upgrades/management |
| `Workforce` | WORKFORCE_GROUP | Labor stats |
| `Chart` | FINANCES_GROUP | Financial |
| `indResGeneral` | RES_GENERAL_GROUP | Residential |
| `indFilms` | FILMS_GROUP | Movies |
| `TownGeneral` | TOWN_GENERAL_GROUP | Town info |
| `Ministeries` | MINISTERIES_GROUP | Government |
| `Votes` | VOTES_GROUP | Elections |

> **SERVICES tab name reuse:** The CLASSES.BIN tab name `SERVICES` appears with **two different handlers**:
> - `compInputs` (Config 3 factory, Config 4 service, Config 8/9 HQ variant, media) — uses `cInputCount` + indexed `cInput{i}.0`, `cInputSup{i}`, `cInputDem{i}`, `cInputRatio{i}`, `cInputMax{i}`, `cEditable{i}`, `cUnits{i}.0`
> - `Supplies` (Config 6 HQ buildings only) — uses `GetInputNames` + `SetPath` + per-gate `GetPropertyList`
>
> These are **completely different Delphi sheets** (`CompanyServicesSheetForm.pas` vs `SupplySheetForm.pas`). The `Supplies` handler already works correctly. The `compInputs` handler maps to `ADVERTISEMENT_GROUP` (special: 'compInputs') and fetches data eagerly via `fetchCompInputData()`.

## Mandatory Traceability Rule (enforced since 2026-03)

**Every UI element in the Building Inspector must satisfy this 4-link chain:**

```
UI Element  →  RDO wire command  →  RDO unit test  →  Behavior unit test
```

**Rules:**
- No element may be added or modified without all 4 links present
- Test naming: `"<Handler>: <element description>"` — enables `--testNamePattern="SrvGeneral"` targeting
- All RDO wire tests live in: `src/server/__tests__/rdo/building-inspector-rdo.test.ts`
- All behavior tests live in: `src/client/components/building/__tests__/building-inspector-behavior.test.ts`

**Reference:** `C:\Users\Crazz\.claude\plans\moonlit-prancing-lerdorf.md` — full element registry with status per handler (all items marked DONE as of 2026-03-02)

## Gap Status (as of 2026-03-02)

**All previously identified gaps closed** — traceability plan complete.

Remaining known work (lower priority):
1. **GAP-01**: Missing handlers — `hdqInventions`, `InputSelection`, `townPolitics`, `facMinisteries` (NOT in `HANDLER_TO_GROUP`)
2. **GAP-03**: `[InspectorInfo]` not yet parsed from CLASSES.BIN
3. **GAP-04**: Connection picker for clone/upgrade needs live company lookup

## Key Gotcha

- `worldContextId` = world operations (map focus, queries)
- `interfaceServerId` = building operations (property fetch, set, actions)
- Building property requests use `interfaceServerId`, NOT `worldContextId`

## Key Files

| File | Purpose |
|------|---------|
| `src/shared/building-details/template-groups.ts` | PropertyGroup definitions |
| `src/shared/building-details/property-templates.ts` | HANDLER_TO_GROUP mapping |
| `src/server/spo_session.ts` | RDO property fetching + SET commands |
| `src/client/ui/building-details/building-details-panel.ts` | Inspector UI rendering |
| `src/server/classes-bin-parser.ts` | CLASSES.BIN parser (extend for InspectorInfo) |

## Deep-Dive References

- [Building Details Protocol](../../../doc/building_details_protocol.md) — Full GetPropertyList/GetInputNames/GetSubObjectProps
- [Facility Tabs Reference](../../../doc/facility-tabs-reference.md) — All 27 handlers × 20 tab configs × 863 classes
- [Gap Analysis Report](../../../doc/FACILITY-INSPECTOR-GAP-ANALYSIS.md) — 5 critical gaps, 12 functional issues
