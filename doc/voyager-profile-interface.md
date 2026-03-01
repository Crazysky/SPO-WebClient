# Voyager Profile Interface — RDO-to-Visual Pipeline

> **Purpose**: Comprehensive reference for the StarPeace Voyager client's **profile page** interface — how RDO/ASP data becomes visual elements, how tabs are organized, how permissions control editability (grayed-out controls), and the exact HTTP/ASP/RDO endpoints for every action.
>
> **Related docs**: [USER_PROFILE_AND_MAIL_SERVICE.md](USER_PROFILE_AND_MAIL_SERVICE.md) (architecture & protocol), [spo-original-reference.md](spo-original-reference.md) (RDO conformity index)

---

## Table of Contents

1. [Data Flow Architecture](#1-data-flow-architecture)
2. [Permission System (GrantAccess)](#2-permission-system-grantaccess)
3. [ASP Base URL Pattern](#3-asp-base-url-pattern)
4. [Tab 1: Curriculum (CV)](#4-tab-1-curriculum-cv)
5. [Tab 2: Bank Account](#5-tab-2-bank-account)
6. [Tab 3: Profit & Loss (P&L)](#6-tab-3-profit--loss-pl)
7. [Tab 4: Companies](#7-tab-4-companies)
8. [Tab 5: Auto Connections](#8-tab-5-auto-connections)
9. [Tab 6: Policy (Diplomacy)](#9-tab-6-policy-diplomacy)
10. [Delphi Property Sheet System](#10-delphi-property-sheet-system)
11. [WebClient Implementation Map](#11-webclient-implementation-map)

---

## 1. Data Flow Architecture

The profile system uses **two parallel data paths** — the legacy Delphi VCL path (original Voyager) and the WebClient path (current implementation). Both consume the same Interface Server ASP pages as their data source.

### Legacy Delphi Path (Voyager Client)

```
┌─────────────────────┐                    ┌───────────────────────┐
│   Voyager Client     │  HTTP GET/POST     │  Interface Server     │
│   (Delphi VCL)       │───────────────────►│  (IIS + Classic ASP)  │
│                      │                    │                       │
│  TCustomWebBrowser   │◄───────────────────│  ASP pages render     │
│  (embedded IE)       │  HTML response     │  server-side data     │
│                      │                    │  into HTML templates  │
│  JavaScript in HTML  │                    │                       │
│  handles UI updates  │                    │  TTycoon RDO methods  │
│  and form submission │                    │  called internally    │
└─────────────────────┘                    └───────────────────────┘
```

For **facility inspection** (building details), the Voyager client uses a separate **VCL Property Sheet system** where Delphi controls (`TEdit`, `TLabel`, `TFramedButton`) are populated directly from RDO `TStringList` name=value pairs via `TSheetHandler.RenderProperties()`. See [Section 10](#10-delphi-property-sheet-system).

### WebClient Path (Current Implementation)

```
┌──────────────┐  WS JSON   ┌──────────────┐  HTTP GET/POST  ┌──────────────────┐
│  React UI     │◄──────────│  Node.js      │────────────────►│  Interface Server │
│  ProfilePanel │            │  Gateway      │                 │  (IIS + ASP)      │
│  (Zustand)    │───────────►│  spo_session  │◄────────────────│                   │
│               │  WS JSON   │              │  HTML response   │  Same ASP pages   │
└──────────────┘             │  Regex parse  │                 │  as Voyager       │
                             │  → typed TS   │                 └──────────────────┘
                             └──────────────┘
```

**Step-by-step flow:**

1. **React** → user clicks profile tab → `onProfileXxx()` callback fires
2. **Client** → sends `WsMessageType.REQ_PROFILE_XXX` over WebSocket
3. **Server** → `server.ts` handler calls `session.fetchXxxData()`
4. **Session** → `fetchAspPage()` does HTTP GET to IS: `http://{worldIp}/Five/0/Visual/Voyager/{aspPath}?{params}`
5. **Session** → parses HTML response with regex (extracts JS vars, table rows, form values)
6. **Session** → returns typed TypeScript object (`CurriculumData`, `BankAccountData`, etc.)
7. **Server** → sends `WsMessageType.RESP_PROFILE_XXX` with typed data
8. **Bridge** → `ClientBridge.setCurriculum(data)` updates Zustand store
9. **React** → `ProfilePanel` re-renders with new data

---

## 2. Permission System (GrantAccess)

### How It Works

Every facility and tycoon entity in SPO has a `SecurityId` — a colon-delimited string listing all tycoon IDs with ownership access.

**Source**: `SPO-Original/Protocol/Protocol.pas`

```pascal
function GrantAccess(RequesterId, SecurityId: TSecurityId): boolean;
begin
  result := system.pos(
    SecIdItemSeparator + RequesterId + SecIdItemSeparator,
    SecurityId
  ) > 0;
end;
```

- `SecIdItemSeparator` = `:` (colon)
- `SecurityId` format: `:123:456:` (colon-wrapped list of tycoon IDs)
- `RequesterId` = current player's tycoon ID

**Example:**
```
Player TycoonId = 456
Facility SecurityId = ':123:'       → GrantAccess(456, ':123:') = false (not owner)
Facility SecurityId = ':123:456:'   → GrantAccess(456, ':123:456:') = true (co-owner via role)
```

### UI Behavior: Grayed-Out, Not Hidden

The Voyager client **never hides** controls based on permissions — it **disables** them (grays them out). This pattern is consistent across all property sheet handlers.

**Source**: `SPO-Original/Voyager/HqMainSheet.pas` (lines 115-137)

```pascal
procedure THqSheetHandler.RenderProperties(Properties: TStringList);
begin
  // Step 1: Check ownership
  fOwnsFacility := GrantAccess(
    fContainer.GetClientView.getSecurityId,    // Current player's security context
    Properties.Values[tidSecurityId]           // Facility's security ID
  );

  // Step 2: Toggle controls based on ownership
  // --- Name field: DUAL PATTERN (label vs edit) ---
  fControl.NameLabel.Caption := fControl.xfer_Name.Text;  // Copy text to label
  fControl.NameLabel.Visible := not fOwnsFacility;        // Read-only label shown to non-owners
  fControl.xfer_Name.Enabled := fOwnsFacility;            // Edit field enabled for owners
  fControl.xfer_Name.Visible := fOwnsFacility;            // Edit field only shown to owners

  // --- Action buttons: DISABLED, never hidden ---
  fControl.btnClose.Enabled    := fOwnsFacility;          // Grayed out for non-owners
  fControl.btnDemolish.Enabled := fOwnsFacility;          // Grayed out for non-owners
  fControl.btnConnect.Enabled  := true;                    // Always enabled (map navigation)
end;
```

**ManagementSheet.pas** extends this pattern:

```pascal
// Checkboxes, clone button — all disabled, never hidden
fControl.cbAcceptSettings.Enabled := fOwnsFacility;
fControl.cblSettings.Enabled      := fOwnsFacility;
fControl.btnClone.Enabled         := fOwnsFacility;

// Upgrade button — disabled if not owner OR no upgrades available
canUpgrd := fOwnsFacility and (fMaxUpgrades > 0);
fControl.fbUpgrade.Enabled := canUpgrd and (fUpgradeCost > 0);

// Downgrade button — disabled if not owner OR already at level 1
fControl.fbDowngrade.Enabled := fOwnsFacility and (upgrade > 1);
```

### SecurityId Composition

A tycoon's `SecurityId` is built from their tycoon ID plus all their role IDs:

```pascal
// From Kernel.pas — TTycoon.SecurityId (computed property)
// Returns colon-separated list: ':mainTycoonId:role1Id:role2Id:'
// This allows a master account to have access to all its role-owned facilities
```

### WebClient Note

In the WebClient's profile tabs, the data is always the **current user's own profile** — there is no concept of viewing another player's profile tabs. Therefore, all fields are always editable. The GrantAccess pattern only applies to the **building inspector** (facility inspection), not the profile panel.

---

## 3. ASP Base URL Pattern

All profile ASP pages follow this URL template:

```
http://{worldIp}/Five/0/Visual/Voyager/{aspPath}?{queryParams}
```

### Common Query Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `Tycoon` | Username string | Current player name |
| `Password` | Password string | Authentication |
| `Company` | Company name | Currently selected company |
| `WorldName` | World name | Current game world |
| `DAAddr` | IP address | Directory Server (DA) address |
| `DAPort` | Port number | Directory Server port |
| `ISAddr` | IP address | Interface Server address |
| `ISPort` | `8000` | Interface Server port |
| `ClientViewId` | Integer | Session proxy ID on IS |
| `RIWS` | Empty string | Required by some pages (legacy) |
| `TycoonId` | Integer | Numeric tycoon ID (for some actions) |
| `SecurityId` | String | Security context (for some actions) |

### URL Encoding Rule

Spaces must be encoded as `%20` (not `+`). Legacy IIS/Classic ASP may not decode `+` as space in URL query strings.

**WebClient implementation** (`spo_session.ts`):
```typescript
private buildAspUrl(aspPath: string, extraParams?: Record<string, string>): string {
  const params = this.buildAspBaseParams(); // Tycoon, Password, Company, WorldName, DA*, IS*, ClientViewId
  return `http://${worldIp}/Five/0/Visual/Voyager/${aspPath}?${params.toString().replace(/\+/g, '%20')}`;
}
```

---

## 4. Tab 1: Curriculum (CV)

### ASP Endpoint

```
GET /Five/0/Visual/Voyager/NewTycoon/TycoonCurriculum.asp?{baseParams}&RIWS=
```

### Visual Layout (Voyager)

```
┌─────────────────────────────────────────────────────────────┐
│  CURRICULUM                                                  │
├──────────────────────────┬──────────────────────────────────┤
│  [Level Image]           │  [Next Level Image]              │
│  levelApprentice.gif     │  levelEntrepreneur.gif           │
│                          │                                  │
│  Current Level           │  Next Level                      │
│  ─────────────           │  ──────────                      │
│  Description text        │  Description text                │
│                          │                                  │
│                          │  Requires:                       │
│                          │  Requirements text               │
│                          │                                  │
│                          │  [ ] Advance to next level       │
├──────────────────────────┴──────────────────────────────────┤
│  Personal Fortune:     $1,234,567                           │
│  Average Profit:       $45,678                              │
│  Prestige:             150                                  │
│  Facility Prestige:    120                                  │
│  Research Prestige:    30                                   │
│  Buildings:            13 / 100                             │
│  Area:                 450                                  │
│  Nobility:             5                                    │
├─────────────────────────────────────────────────────────────┤
│  Rankings                                                    │
│  ┌────────────┬──────┐                                      │
│  │ Category   │ Rank │                                      │
│  ├────────────┼──────┤                                      │
│  │ Overall    │ 3    │                                      │
│  │ Wealth     │ 2    │                                      │
│  │ ...        │ ...  │                                      │
│  └────────────┴──────┘                                      │
├─────────────────────────────────────────────────────────────┤
│  Curriculum Items                                            │
│  ┌─────────────────────────────────┬──────────┐             │
│  │ Item                            │ Prestige │             │
│  ├─────────────────────────────────┼──────────┤             │
│  │ Founded Shamba Inc.             │ +10      │             │
│  │ Researched Organic Farming      │ +5       │             │
│  └─────────────────────────────────┴──────────┘             │
├─────────────────────────────────────────────────────────────┤
│  [Reset Account]  [Abandon Role]  [Rebuild Links]           │
└─────────────────────────────────────────────────────────────┘
```

### HTML Parsing (WebClient)

**Source**: `src/server/spo_session.ts` lines 1797-1990

```typescript
// Level name from image filename
/images\/level(\w+)\.gif/i  → profile.levelName (e.g., "Paradigm")

// Key-value pairs from label/value spans
/class=label[^>]*>\s*([^<:]+):\s*<\/(?:span|div)>\s*(?:<[^>]*>\s*)*?class=value[^>]*>\s*([^<]+)/gi

// Personal Fortune
/Personal\s+Fortune:\s*(?:<[^>]*>\s*)*\$([^<]+)/i

// Average Profit
/Average\s+Profit[^:]*:\s*(?:<[^>]*>\s*)*\$([^<]+)/i

// Rankings table
/in\s+the\s+rankings[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i
  → cells: /<td\s+class=label>\s*([^<]+)<\/td>\s*<td[^>]*class=value[^>]*>\s*([^<]*)/gi

// Curriculum items table
/Curriculum\s+items[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i
  → rows: /<td[^>]*class=value[^>]*>\s*([\s\S]*?)\s*<\/td>\s*<td[^>]*class=value[^>]*>\s*([^<]+)/gi

// Upgrade checkbox
/onAdvanceClick/i → canUpgrade
/type="checkbox"[^>]*checked/i → isUpgradeRequested
```

### Level Tier Mapping

| Level Name | Tier | Image File |
|------------|------|------------|
| Apprentice | 0 | `levelApprentice.gif` |
| Entrepreneur | 1 | `levelEntrepreneur.gif` |
| Tycoon | 2 | `levelTycoon.gif` |
| Master | 3 | `levelMaster.gif` |
| Paradigm | 4 | `levelParadigm.gif` |
| Legend | 5 | `levelLegend.gif` |
| BeyondLegend | 6 | `levelBeyondlegend.gif` |

### Buttons & Actions

| Button | ASP Endpoint | Method | Parameters |
|--------|-------------|--------|------------|
| **Upgrade Level** | `NewTycoon/rdoSetAdvanceLevel.asp` | GET | `TycoonId`, `Password`, `Value` (true/false), `WorldName`, `DAAddr`, `DAPort`, `Tycoon` |
| **Reset Account** | `NewTycoon/resetTycoon.asp` | GET | `Tycoon`, `WorldName`, `DAAddr`, `DAPort`, `TycoonId`, `Password` |
| **Abandon Role** | `NewTycoon/abandonRole.asp` | GET | `Tycoon`, `WorldName`, `DAAddr`, `DAPort`, `TycoonId`, `Password` |
| **Rebuild Links** | `util/links.asp` | GET | `Tycoon`, `Password`, `Company`, `WorldName`, `DAAddr`, `DAPort`, `ISAddr`, `ISPort`, `ClientViewId`, `RIWS` |

### Delphi RDO Equivalents

```pascal
// TTycoon methods (Kernel.pas)
procedure RDOSetAdvanceToNextLevel(yes: integer);    // 0=disable, 1=enable auto-advance
procedure RDODelCurItem(index: integer);             // Delete curriculum item
```

### TypeScript Types

```typescript
// src/shared/types/domain-types.ts lines 503-538
interface CurriculumData {
  tycoonName: string;
  currentLevel: number;        currentLevelName: string;
  currentLevelDescription: string;
  nextLevelName: string;       nextLevelDescription: string;
  nextLevelRequirements: string;
  canUpgrade: boolean;         isUpgradeRequested: boolean;
  fortune: string;             averageProfit: string;
  prestige: number;            facPrestige: number;
  researchPrestige: number;    budget: string;
  ranking: number;             facCount: number;
  facMax: number;              area: number;
  nobPoints: number;
  rankings: CurriculumRanking[];
  curriculumItems: CurriculumItem[];
}
type CurriculumActionType = 'resetAccount' | 'abandonRole' | 'upgradeLevel' | 'rebuildLinks';
```

---

## 5. Tab 2: Bank Account

### ASP Endpoint

```
GET /Five/0/Visual/Voyager/NewTycoon/TycoonBankAccount.asp?{baseParams}&RIWS=
```

### Visual Layout (Voyager)

```
┌─────────────────────────────────────────────────────────────┐
│  BANK ACCOUNT                                                │
├─────────────────────────────────────────────────────────────┤
│  Balance:        $1,234,567,890                              │
│  Maximum Loan:   $2,500,000,000                              │
│  Total Loans:    $500,000,000                                │
│  Transfer Limit: $100,000,000                                │
├─────────────────────────────────────────────────────────────┤
│  Active Loans                                                │
│  ┌──────┬────────────┬──────────────┬────┬──────┬──────────┐│
│  │ Bank │ Date       │ Amount       │ %  │ Term │ Payment  ││
│  ├──────┼────────────┼──────────────┼────┼──────┼──────────┤│
│  │ WB   │ 01/15/2020 │ $250,000,000 │ 3% │ 150  │ $1.8M   ││
│  │ NB   │ 03/22/2020 │ $250,000,000 │ 4% │ 120  │ $2.5M   ││
│  └──────┴────────────┴──────────────┴────┴──────┴──────────┘│
│  Total Next Payment: $4,300,000                              │
│                                                    [Pay Off] │
├─────────────────────────────────────────────────────────────┤
│  Request Loan: [__________] amount   [Request]               │
│  Send Money:   [__________] amount  To: [________] [Send]    │
│  You can transfer up to $100,000,000                         │
└─────────────────────────────────────────────────────────────┘
```

### HTML Parsing (WebClient)

**Source**: `src/server/spo_session.ts` lines 2008-2092

```typescript
// Budget from JS variable
/var\s+budget\s*=\s*(-?\d+)\s*;/i                    → balance

// Max loan from JS
/var\s+maxVal\s*=\s*new\s+Number\((\d+)\)/i           → maxLoan

// Total loans from JS
/var\s+loans\s*=\s*new\s+Number\((\d+)\)/i            → totalLoans

// Max transfer from text
/You can transfer up to \$([0-9,]+)/i                  → maxTransfer

// Loan rows: <tr id="rN" lid="N"> with 6 TD cells
/<tr[^>]*\bid\s*=\s*"?r(\d+)"?[^>]*\blid\s*=\s*"?(\d+)"?/gi
  → per row: Bank, Date, Amount, Interest, Term, Next Payment

// Error messages (from action responses)
/class=errorText[^>]*>\s*([^<]+)/i                     → error message
```

### Buttons & Actions

| Button | ASP Endpoint | Method | Parameters |
|--------|-------------|--------|------------|
| **Request Loan** | `NewTycoon/TycoonBankAccount.asp` | GET | `Action=LOAN`, `LoanValue=<amount>`, `Tycoon`, `Password`, `Company`, `WorldName`, `DAAddr`, `DAPort`, `SecurityId` |
| **Send Money** | `NewTycoon/TycoonBankAccount.asp` | GET | `Action=SEND`, `SendValue=<amount>`, `SendDest=<tycoonName>`, `SendReason=<text>`, same auth params |
| **Pay Off Loan** | `NewTycoon/TycoonBankAccount.asp` | GET | `Action=PAYOFF`, `LID=<loanIndex>`, same auth params |

### Delphi RDO Equivalents

```pascal
// TTycoon methods (Kernel1.pas lines 6885-6967)
function RDOAskLoan(AmountStr: widestring): OleVariant;
  // Returns: NOERROR or ERROR_LoanNotGranted
  // Calls: fWorldLocator.GetMainBank.AskLoan(self, Amount)
  // Side effects: Logs to tidLog_Survival, updates budget, CacheObject(self)

function RDOSendMoney(ToTycoon, Reason, AmountStr: widestring): OleVariant;
  // Returns: NOERROR, ERROR_UnknownTycoon, ERROR_InvalidMoneyValue, ERROR_Unknown
  // Side effects: Deducts sender budget, sends HTML mail to recipient, GenMoney on both

function RDOPayLoan(AmountStr: widestring): OleVariant;
  // STUB: Currently returns NOERROR (no-op in Kernel1.pas)
```

### Error Handling

The ASP page returns error messages in `<span class=errorText>` elements. The WebClient extracts these:

```typescript
const errorMatch = /class=errorText[^>]*>\s*([^<]+)/i.exec(html);
if (errorMatch) {
  return { success: false, message: errorMatch[1].trim() };
}
```

### TypeScript Types

```typescript
// src/shared/types/domain-types.ts lines 544-570
interface BankAccountData {
  balance: string;         maxLoan: string;
  totalLoans: string;      maxTransfer: string;
  totalNextPayment: string;
  loans: LoanInfo[];
  defaultInterest: number; defaultTerm: number;
}
interface LoanInfo {
  bank: string;    date: string;     amount: string;
  interest: number; term: number;    slice: string;
  loanIndex: number;
}
type BankActionType = 'borrow' | 'send' | 'payoff';
```

---

## 6. Tab 3: Profit & Loss (P&L)

### ASP Endpoint

```
GET /Five/0/Visual/Voyager/NewTycoon/TycoonProfitAndLoses.asp?{baseParams}&RIWS=
```

### Visual Layout (Voyager)

```
┌─────────────────────────────────────────────────────────────┐
│  PROFIT & LOSS                                               │
├─────────────────────────────────────────────────────────────┤
│  Net Profit (losses)                        $12,345,678      │
│  ├─ Operating Revenues                      $45,678,901      │
│  │  ├─ Product Sales                        $30,000,000      │
│  │  │  ├─ RESIDENTIALS                                       │
│  │  │  │  ├─ Low Income Housing             $5,000,000  [📊]│
│  │  │  │  └─ Middle Class Homes             $8,000,000  [📊]│
│  │  │  ├─ COMMERCIAL                                         │
│  │  │  │  └─ Shopping Mall                  $10,000,000 [📊]│
│  │  │  └─ INDUSTRIAL                                         │
│  │  │     └─ Steel Factory                  $7,000,000  [📊]│
│  │  └─ Service Sales                        $15,678,901      │
│  └─ Operating Expenses                     -$33,333,223      │
│     ├─ Salaries                            -$10,000,000      │
│     ├─ Supplies                            -$15,000,000      │
│     └─ Taxes                               -$8,333,223       │
└─────────────────────────────────────────────────────────────┘
```

### HTML Parsing (WebClient)

**Source**: `src/server/spo_session.ts` lines 2188-2254

```typescript
// P&L rows: <div class=labelAccountLevelN> with nested label + amount
/<div\s+class=labelAccountLevel(\d)[^>]*>[\s\S]*?<nobr>([\s\S]*?)<\/nobr>[\s\S]*?<\/td>\s*<td[^>]*>[\s\S]*?(?:\$([0-9,.-]+)|<\/nobr>)/gi
  → level (0-3), label, amount

// Chart sparkline data
/ChartInfo=(\d+),([-\d,]+)/i → count + comma-separated values

// Tree building: stack-based nesting
// Level 0 = root, each node is child of nearest lower-level ancestor
```

### Tree Building Algorithm

```typescript
const stack: ProfitLossNode[] = [root];
for (let i = 1; i < nodes.length; i++) {
  const node = nodes[i];
  // Pop until we find a parent with lower level
  while (stack.length > 1 && stack[stack.length - 1].level >= node.level) {
    stack.pop();
  }
  const parent = stack[stack.length - 1];
  parent.children.push(node);
  stack.push(node);
}
```

### Buttons & Actions

**None** — P&L is a read-only view. The `[📊]` icons link to chart detail popups in the original Voyager client (via `ChartInfo=` href attributes).

### TypeScript Types

```typescript
// src/shared/types/domain-types.ts lines 576-587
interface ProfitLossNode {
  label: string;       level: number;     amount: string;
  chartData?: number[];  isHeader?: boolean;
  children?: ProfitLossNode[];
}
interface ProfitLossData { root: ProfitLossNode; }
```

---

## 7. Tab 4: Companies

### ASP Endpoint

```
GET /Five/0/Visual/Voyager/NewLogon/chooseCompany.asp?{baseParams}&Logon=FALSE&UserName=<tycoon>&RIWS=
```

### Visual Layout (Voyager)

```
┌─────────────────────────────────────────────────────────────┐
│  COMPANIES                                                   │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────┐                   │
│  │ ★ Shamba Inc.                   [Switch] │                │
│  │   Private · Moab Cluster · 13 Facilities│                │
│  │   Owner: SPO_test3                       │                │
│  └───────────────────────────────────────┘                   │
│  ┌───────────────────────────────────────┐                   │
│  │   Shamba Trading Co.            [Switch] │                │
│  │   Private · PGI Cluster · 5 Facilities  │                │
│  │   Owner: SPO_test3                       │                │
│  └───────────────────────────────────────┘                   │
│                                                              │
│  [Create New Company]                                        │
└─────────────────────────────────────────────────────────────┘
```

### HTML Parsing (WebClient)

**Source**: `src/server/spo_session.ts` lines 2285-2332

```typescript
// Company <td> elements
/<td[^>]*companyId="(\d+)"[^>]*>/gi → companyId
  → per element: /companyName="([^"]+)"/i → name
  → per element: /companyOwnerRole="([^"]*)"/i → ownerRole

// Cluster from "more info" link
/CompanyCluster=(\w+)/i → cluster name

// Facility count
/(\d+)\s+Facilities/i → facilityCount

// Company type
/<nobr>\s*(Private|Public|Mayor|Minister|President)\s*<\/nobr>/i → companyType
```

### Buttons & Actions

| Button | Protocol | Details |
|--------|----------|---------|
| **Switch Company** | WebSocket `REQ_SWITCH_COMPANY` | Changes `session.currentCompany`, triggers re-login to IS with new company context |
| **Create Company** | Not in current WebClient scope | In Voyager: redirects to company creation ASP page flow |

### TypeScript Types

```typescript
// src/shared/types/domain-types.ts lines 593-606
interface CompanyListItem {
  name: string;       companyId: number;
  ownerRole: string;  cluster: string;
  facilityCount: number; companyType: string;
}
interface CompaniesData {
  companies: CompanyListItem[];
  currentCompany: string;  worldName: string;
}
```

---

## 8. Tab 5: Auto Connections

### ASP Endpoints

**Read data:**
```
GET /Five/0/Visual/Voyager/NewTycoon/TycoonAutoConnections.asp?{baseParams}&RIWS=
```

**Actions:**
```
GET /Five/0/Visual/Voyager/NewTycoon/DeleteDefaultSupplier.asp?{params}
GET /Five/0/Visual/Voyager/NewTycoon/ModifyTradeCenterStatus.asp?{params}
GET /Five/0/Visual/Voyager/NewTycoon/ModifyWarehouseStatus.asp?{params}
```

### Visual Layout (Voyager)

```
┌─────────────────────────────────────────────────────────────┐
│  AUTO CONNECTIONS (Initial Suppliers)                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─ Coal ─────────────────────────────────────────────────┐ │
│  │  [ ] Hire Trade Centers   [ ] Only Warehouses          │ │
│  │  ┌──────────────────────┬───────────────────┐          │ │
│  │  │ Facility             │ Company           │ [Delete] │ │
│  │  ├──────────────────────┼───────────────────┤          │ │
│  │  │ Coal Mine West       │ Shamba Inc.       │ [X]      │ │
│  │  │ Coal Mine East       │ Mining Co.        │ [X]      │ │
│  │  └──────────────────────┴───────────────────┘          │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌─ Steel ────────────────────────────────────────────────┐ │
│  │  [✓] Hire Trade Centers   [ ] Only Warehouses          │ │
│  │  ┌──────────────────────┬───────────────────┐          │ │
│  │  │ Steel Works Alpha    │ Shamba Inc.       │ [X]      │ │
│  │  └──────────────────────┴───────────────────┘          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### HTML Parsing (WebClient)

**Source**: `src/server/spo_session.ts` lines 2353-2416

```typescript
// Fluid section headers
/<div\s+id="([^"]+)"\s+class=header3[^>]*>\s*([^<]*)/gi → fluidName, startIdx

// Supplier rows (per fluid section)
/<tr[^>]*\bfluid=(\w+)[^>]*\bfacilityId="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/gi
  → facilityId, rowContent
  → /<div\s+class=value[^>]*>\s*([^<]+)/gi → facility name, company name

// Trade center checkbox
/<input[^>]*id=${fluidName}HireTC[^>]*\bchecked\b/i → hireTradeCenter

// Warehouse checkbox
/<input[^>]*id=${fluidName}HireWH[^>]*\bchecked\b/i → onlyWarehouses
```

### Buttons & Actions

| Button | ASP Endpoint | Method | Parameters |
|--------|-------------|--------|------------|
| **Delete Supplier** | `NewTycoon/DeleteDefaultSupplier.asp` | GET | `TycoonId`, `FluidId`, `DAAddr`, `DAPort`, `Supplier` (facilityId) |
| **Hire Trade Center** | `NewTycoon/ModifyTradeCenterStatus.asp` | GET | `TycoonId`, `FluidId`, `DAAddr`, `WorldName`, `Tycoon`, `Password`, `DAPort`, `Hire=YES` |
| **Don't Hire TC** | same | GET | same but `Hire=NO` |
| **Only Warehouses** | `NewTycoon/ModifyWarehouseStatus.asp` | GET | `TycoonId`, `FluidId`, `DAAddr`, `WorldName`, `Tycoon`, `Password`, `DAPort`, `Hire=YES` |
| **Don't Only WH** | same | GET | same but `Hire=NO` |

### Delphi RDO Equivalents

```pascal
// TTycoon methods (Kernel1.pas lines 7039-7117)
procedure RDOAddAutoConnection(FluidId, Suppliers: widestring);
  // Add suppliers to auto-connect list for resource type

procedure RDODelAutoConnection(FluidId, Suppliers: widestring);
  // Remove suppliers from auto-connect list

procedure RDOHireTradeCenter(FluidId: widestring);
  // Enable trade center hiring for resource type

procedure RDODontHireTradeCenter(FluidId: widestring);
  // Disable trade center hiring

procedure RDOHireOnlyFromWarehouse(FluidId: widestring);
  // Filter to warehouse-only suppliers

procedure RDODontHireOnlyFromWarehouse(FluidId: widestring);
  // Allow all supplier types
```

### TypeScript Types

```typescript
// src/shared/types/domain-types.ts lines 612-630
interface SupplierEntry {
  facilityName: string;  facilityId: string;  companyName: string;
}
interface AutoConnectionFluid {
  fluidName: string;     fluidId: string;
  suppliers: SupplierEntry[];
  hireTradeCenter: boolean;  onlyWarehouses: boolean;
}
interface AutoConnectionsData { fluids: AutoConnectionFluid[]; }
type AutoConnectionActionType = 'add' | 'delete' | 'hireTradeCenter' | 'dontHireTradeCenter'
  | 'onlyWarehouses' | 'dontOnlyWarehouses';
```

---

## 9. Tab 6: Policy (Diplomacy)

### ASP Endpoints

**Read data:**
```
GET /Five/0/Visual/Voyager/NewTycoon/TycoonPolicy.asp?{baseParams}&RIWS=
```

**Set policy:**
```
POST /Five/0/Visual/Voyager/NewTycoon/TycoonPolicy.asp?Action=modify&{authParams}
Content-Type: application/x-www-form-urlencoded
Body: NextStatus=<N>&SubTycoon=<name>&Subject=<name>&Status=<N>
```

### Visual Layout (Voyager)

```
┌─────────────────────────────────────────────────────────────┐
│  POLICY (DIPLOMACY)                                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┬──────────────────┬───────────────────┐ │
│  │ Tycoon          │ Your Policy      │ Their Policy      │ │
│  ├─────────────────┼──────────────────┼───────────────────┤ │
│  │ RichPlayer42    │ [Ally    ▾]      │ Neutral (N)       │ │
│  │ TycoonMaster    │ [Neutral ▾]      │ Enemy (E)         │ │
│  │ NewbieTrader    │ [Enemy   ▾]      │ Ally (A)          │ │
│  └─────────────────┴──────────────────┴───────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Policy Status Values

| Value | Label | Letter |
|-------|-------|--------|
| 0 | Ally | A |
| 1 | Neutral | N |
| 2 | Enemy | E |

### HTML Parsing (WebClient)

**Source**: `src/server/spo_session.ts` lines 2511-2538

```typescript
// Select elements with tycoon name
/<select[^>]*\btycoon="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi → tycoonName, selectContent

// Selected option value (your policy)
/<option\s+value="(\d)"[^>]*\bselected\b/i → yourPolicy (0/1/2)

// Their policy letter
/<span\s+id=otherspan{idx}[^>]*>\s*([ANE])/i → theirPolicy (A/N/E → 0/1/2)
```

### Buttons & Actions

| Button | Protocol | Details |
|--------|----------|---------|
| **Change Policy** (dropdown) | POST to `TycoonPolicy.asp` | Query: `Action=modify`, `WorldName`, `Tycoon`, `TycoonId`, `Password`, `DAAddr`, `DAPort`. Body: `NextStatus=<0/1/2>`, `SubTycoon=<name>`, `Subject=<name>`, `Status=<0/1/2>` |

### Delphi RDO Equivalent

```pascal
// TTycoon method (Kernel1.pas lines 7119-7135)
procedure RDOSetPolicyStatus(ToTycoon: widestring; Status: integer);
  // Parameters:
  //   ToTycoon: target tycoon name
  //   Status: 0=pstAlly, 1=pstNeutral, 2=pstEnemy
  // Side effects:
  //   1. Logs to tidLog_Survival
  //   2. Policy[Tycoon] := TPolicyStatus(Status)
  //   3. UpdateObjectCache(self)
  //   4. UpdateObjectCache(target tycoon)
```

### TypeScript Types

```typescript
// src/shared/types/domain-types.ts lines 636-644
interface PolicyEntry {
  tycoonName: string;  yourPolicy: number;  theirPolicy: number;
}
interface PolicyData { policies: PolicyEntry[]; }
```

---

## 10. Delphi Property Sheet System

> **Note**: This section documents the **building inspection** UI pattern (VCL-based property sheets), which uses the GrantAccess permission system. Profile tabs use embedded ASP HTML, not this system.

### Architecture

```
SheetHandlerRegistry (string → creator function)
  ↓ RegisterSheetHandler('HqGeneral', HqSheetHandlerCreator)
  ↓
ObjectInspectorHandler (TInterfacedObject, IURLHandler)
  ↓ HandleURL('SHOWOBJECT') → loads sheets for facility type
  ↓
TSheetHandler (base class, implements IPropertySheetHandler)
  ├── CreateControl(Owner) : TControl      // Create VCL form
  ├── SetFocus()                           // Triggered when tab opened
  │   ├── GetViewPropNames() → property list
  │   ├── Add extra props (SecurityId, Trouble, CurrBlock...)
  │   └── Threads.Fork(threadedGetProperties)  // Background RDO fetch
  ├── RenderProperties(Properties)         // Populate UI from TStringList
  │   ├── GrantAccess() check
  │   ├── Enable/disable controls based on ownership
  │   └── Format and display values
  ├── Clear()                              // Reset to NA/disabled
  └── Refresh()                            // Re-fetch on server push
```

### Thread Model

```pascal
// Background thread fetches data from RDO server
procedure threadedGetProperties(const parms: array of const);
  Names := TStringList.Create;    // Property names to fetch
  Prop := fContainer.GetProperties(Names);  // Blocking RDO call
  Threads.Join(threadedRenderProperties, [Prop]);  // Post to UI thread

// UI thread renders data
procedure threadedRenderProperties(const parms: array of const);
  if fLastUpdate = expectedUpdate then
    RenderProperties(Prop);  // Safe to update VCL controls
```

### Registered Sheet Handlers (30+ types)

| Sheet ID | File | Facility Type |
|----------|------|---------------|
| `HqGeneral` | `HqMainSheet.pas` | Headquarters main tab |
| `facManagement` | `ManagementSheet.pas` | Upgrade/clone/settings |
| `hdqInventions` | `InventionsSheet.pas` | Research inventions |
| `BankGeneral` | `BankGeneralSheet.pas` | Bank facility |
| `BankLoans` | `BankLoansSheet.pas` | Bank loan list |
| `IndGeneral` | `IndustryGeneralSheet.pas` | Industry facility |
| `townServices` | `TownProdxSheet.pas` | Town services |
| `townProducts` | `TownProdSheet.pas` | Town products |
| `townTaxes` | `TownTaxesSheet.pas` | Town taxes |
| `compInputs` | `CompanyServicesSheetForm.pas` | Company inputs |
| `Ads` | `AdvSheetForm.pas` | Advertisement |
| `Workforce` | `WorkforceSheet.pas` | Workforce stats |
| `Supplies` | `SupplySheetForm.pas` | Supply chains |
| `townGeneral` | `TownHallSheet.pas` | Town hall |
| `townPolitics` | `PoliticSheet.pas` | Town politics |
| `CapitolGeneral` | `CapitolSheet.pas` | Capitol building |

### RDO Action Patterns (from Sheet Handlers)

```pascal
// SET property (via OleVariant proxy)
MSProxy := fContainer.GetMSProxy;
MSProxy.Name := str;                     // Direct property set
MSProxy.Stopped := true;                 // Toggle facility on/off

// CALL method (via OleVariant proxy)
Proxy := GetContainer.GetMSProxy;
Proxy.BindTo(fCurrBlock);               // Target specific block
Proxy.RDOStartUpgrades(count);          // Call published method
Proxy.RDODowngrade;                     // Call with no args

// DELETE facility (world-level method)
Proxy.BindTo('World');
Proxy.RDODelFacility(xPos, yPos);       // Demolish by coordinates
```

---

## 11. WebClient Implementation Map

### Data Flow Per Tab

| Tab | ASP Page | Session Method | WS Request Type | WS Response Type | Store Action |
|-----|----------|---------------|-----------------|-----------------|-------------|
| Curriculum | `NewTycoon/TycoonCurriculum.asp` | `fetchCurriculumData()` | `REQ_PROFILE_CURRICULUM` | `RESP_PROFILE_CURRICULUM` | `setCurriculum()` |
| Bank | `NewTycoon/TycoonBankAccount.asp` | `fetchBankAccount()` | `REQ_PROFILE_BANK` | `RESP_PROFILE_BANK` | `setBankAccount()` |
| P&L | `NewTycoon/TycoonProfitAndLoses.asp` | `fetchProfitLoss()` | `REQ_PROFILE_PROFITLOSS` | `RESP_PROFILE_PROFITLOSS` | `setProfitLoss()` |
| Companies | `NewLogon/chooseCompany.asp` | `fetchCompanies()` | `REQ_PROFILE_COMPANIES` | `RESP_PROFILE_COMPANIES` | `setCompanies()` |
| Auto Connections | `NewTycoon/TycoonAutoConnections.asp` | `fetchAutoConnections()` | `REQ_PROFILE_AUTOCONNECTIONS` | `RESP_PROFILE_AUTOCONNECTIONS` | `setAutoConnections()` |
| Policy | `NewTycoon/TycoonPolicy.asp` | `fetchPolicy()` | `REQ_PROFILE_POLICY` | `RESP_PROFILE_POLICY` | `setPolicy()` |

### Action Flow Per Tab

| Tab | Action | WS Request Type | Session Method | ASP Endpoint |
|-----|--------|-----------------|---------------|-------------|
| Curriculum | Upgrade Level | `REQ_PROFILE_CURRICULUM_ACTION` | `executeCurriculumAction('upgradeLevel')` | `NewTycoon/rdoSetAdvanceLevel.asp` |
| Curriculum | Reset Account | same | `executeCurriculumAction('resetAccount')` | `NewTycoon/resetTycoon.asp` |
| Curriculum | Abandon Role | same | `executeCurriculumAction('abandonRole')` | `NewTycoon/abandonRole.asp` |
| Curriculum | Rebuild Links | same | `executeCurriculumAction('rebuildLinks')` | `util/links.asp` |
| Bank | Request Loan | `REQ_PROFILE_BANK_ACTION` | `executeBankAction('borrow')` | `TycoonBankAccount.asp?Action=LOAN` |
| Bank | Send Money | same | `executeBankAction('send')` | `TycoonBankAccount.asp?Action=SEND` |
| Bank | Pay Off Loan | same | `executeBankAction('payoff')` | `TycoonBankAccount.asp?Action=PAYOFF` |
| Auto Conn | Delete Supplier | `REQ_PROFILE_AUTOCONNECTION_ACTION` | `executeAutoConnectionAction('delete')` | `DeleteDefaultSupplier.asp` |
| Auto Conn | Toggle TC | same | `executeAutoConnectionAction('hireTradeCenter')` | `ModifyTradeCenterStatus.asp` |
| Auto Conn | Toggle WH | same | `executeAutoConnectionAction('onlyWarehouses')` | `ModifyWarehouseStatus.asp` |
| Policy | Set Policy | `REQ_PROFILE_POLICY_SET` | `setPolicyStatus()` | `TycoonPolicy.asp` (POST) |

### Key File Paths

| Layer | File | Lines |
|-------|------|-------|
| **Types** | `src/shared/types/domain-types.ts` | 470-644 |
| **WS Messages** | `src/shared/types/message-types.ts` | 185-204, 882-987 |
| **Server Handler** | `src/server/server.ts` | 2186-2335 |
| **ASP Fetch + Parse** | `src/server/spo_session.ts` | 1720-2664 |
| **Zustand Store** | `src/client/store/profile-store.ts` | entire file |
| **React Component** | `src/client/components/empire/ProfilePanel.tsx` | entire file (789 lines) |
| **Client Callbacks** | `src/client/client.ts` | 360-377 |
| **Bridge** | `src/client/bridge/client-bridge.ts` | profile-related setters |

---

## Appendix: TTycoon Property Reference

Key published properties from `Kernel.pas` (lines 2357-2636) relevant to the profile system:

| Property | Delphi Type | Description |
|----------|-------------|-------------|
| `Id` | `TTycoonId` (word) | Unique tycoon ID (0-65535) |
| `Name` | `string` | Tycoon username |
| `Password` | `string` | Login password |
| `Budget` | `TMoney` (currency) | Account balance |
| `FailureLevel` | `integer` | Bankruptcy warning (0=OK, 1=Warning, 2=Alert) |
| `Ranking` | `integer` | Overall ranking position |
| `RankingAvg` | `integer` | Average ranking |
| `NobPoints` | `integer` | Nobility points |
| `Prestige` | `TPrestige` (single) | Overall prestige |
| `FacPrestige` | `TPrestige` | Facility-based prestige |
| `ResearchPrest` | `TPrestige` | Research-based prestige |
| `FacCount` | `integer` | Number of owned facilities |
| `FacMax` | `integer` | Maximum facilities allowed |
| `Area` | `integer` | Total land area owned |
| `LicenceLevel` | `single` | Development tier |
| `Level` | `TTycoonLevel` | Current progression level |
| `IsDemo` | `boolean` | Demo account flag |
| `Language` | `TLanguageId` | UI language preference |
| `SecurityId` | `TSecurityId` | Colon-separated owner ID list |
| `Companies` | `TLockableCollection` | Owned companies |
| `Roles` | `TLockableCollection` | Sub-account roles |
| `AutoConnections` | `TLockableCollection` | Auto-supplier configs |
| `Policies` | `TLockableCollection` | Diplomatic relationships |
| `Curriculum` | `TLockableCollection` | Achievement/CV items |
| `Cookies` | `TStringList` | Persistent game state variables |
| `Favorites` | `TFavorites` | Bookmarked facilities |

### Trouble Flags (Facility Status Byte)

```pascal
facNoTrouble        = $00;  // All good
facNeedsConnection  = $01;  // Missing connections
facNeedsBudget      = $02;  // Insufficient funds
facStoppedByTycoon  = $04;  // Owner stopped the facility
facInsuficientInput = $08;  // Not enough supplies
facStoppedByAdmin   = $10;  // Admin/mayor shut it down
facNeedsWorkForce   = $20;  // Not enough workers
facNeedCompSupport  = $40;  // Needs company support
facForbiddenZone    = $80;  // Zoning violation
```
