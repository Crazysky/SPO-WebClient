# Interface Server + Directory Server Migration Feasibility Report

> **Scope:** Full architectural analysis of migrating the SPO-Original Delphi 5 **Interface Server (IS)** and **Directory Server (DS)** to Node.js/TypeScript within the SPO-WebClient gateway.
> **Date:** 2026-02-24 | **Author:** Claude Opus 4.6 (Delphi Archaeologist + WebClient Audit)
> **Evidence base:** ~8,000 lines of Delphi implementation analyzed across 15 source files, 77 WebSocket message types audited, SQL Server persistence layer reverse-engineered.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Interface Server Architecture](#2-interface-server-architecture)
3. [Directory Server Architecture](#3-directory-server-architecture)
4. [Complete RDO Surface Inventory](#4-complete-rdo-surface-inventory)
5. [External Dependencies & Inter-Server Communication](#5-external-dependencies--inter-server-communication)
6. [Thread Model & Concurrency](#6-thread-model--concurrency)
7. [Event/Push Notification System](#7-eventpush-notification-system)
8. [Data Structures & State Management](#8-data-structures--state-management)
9. [Directory Server Data Model & Persistence](#9-directory-server-data-model--persistence)
10. [Authentication & Account System](#10-authentication--account-system)
11. [What the WebClient Gateway Already Implements](#11-what-the-webclient-gateway-already-implements)
12. [Gap Analysis: What's Missing](#12-gap-analysis-whats-missing)
13. [Migration Strategy Options](#13-migration-strategy-options)
14. [Risk Assessment](#14-risk-assessment)
15. [Recommended Approach](#15-recommended-approach)
16. [AI Agent Implementation Guide](#16-ai-agent-implementation-guide)

---

## 1. Executive Summary

### The Verdict: REALISTIC — as an incremental replacement of both servers

**Interface Server** = Session manager + event router (~5,000 lines Delphi)
**Directory Server** = Authentication + hierarchical key-value store backed by SQL Server (~4,700 lines Delphi)

Neither server contains game simulation logic. The Model Server (Kernel/, StdBlocks/) holds all game state. The IS and DS are **infrastructure services** — exactly the kind of thing Node.js excels at.

### Key Discovery: The Directory Server is a SQL Server wrapper

The DS is NOT a file-based registry. It's a **Microsoft SQL Server** database accessed via ADO, using ~18 stored procedures against two tables (`tbl_KeyPaths`, `tbl_Values`). The data model is a materialized-path tree (like Windows Registry but stored in SQL). This means migration requires either:
- (A) Keeping SQL Server and reimplementing the ADO layer in Node.js
- (B) Migrating to a different database (PostgreSQL, SQLite, MongoDB)
- (C) Replacing with a purpose-built auth service + config store

### Migration Realism Scorecard

| Component | Complexity | Node.js Fit | WebClient Coverage | Remaining Gap |
|-----------|-----------|-------------|-------------------|---------------|
| **IS: Session management** | Medium | 9/10 | ~55% | Event routing, viewport, focus |
| **IS: Event routing** | Medium | 9/10 | ~30% | RefreshArea, RefreshDate, companionship |
| **IS: Chat/presence** | Low | 10/10 | ~70% | Voice system (deprecated) |
| **IS: Map cache** | Low | 10/10 | 0% | 64×64 tile cache |
| **DS: Authentication** | Medium | 8/10 | ~80% | Account creation, SegaID (deprecated) |
| **DS: Key-value store** | High | 7/10 | ~10% | Full registry API, world metadata |
| **DS: Billing/subscriptions** | Medium | 8/10 | 0% | Likely deprecated for revival |
| **DS: SQL Server backend** | High | 6/10 | 0% | Schema + stored procedures |

### Overall Feasibility

| Metric | Score |
|--------|-------|
| **Architectural fit for Node.js** | 9/10 |
| **Complexity of the originals** | 6/10 (IS) + 7/10 (DS) |
| **WebClient already covers** | ~45% combined |
| **Risk of subtle protocol bugs** | 7/10 |
| **Overall feasibility** | **HIGH** — 14-19 weeks for full IS+DS replacement (incl. RDO server + data encoding layer) |

---

## 2. Interface Server Architecture

### What the IS Does

The IS is a **session manager and event router** between Voyager clients and the Model Server:

1. **Authentication bridge** — validates credentials against the Directory Server
2. **RDO proxy** — forwards client requests to the Model Server's `World` object
3. **Event router** — receives simulation events from the Model Server, routes them to clients based on viewport, focus, or tycoon ownership
4. **Map cache** — caches `ObjectsInArea` and `SegmentsInArea` results in a 64×64 tile grid
5. **Chat/presence** — manages channels, companionship (viewport overlap), voice queues
6. **Mail bridge** — forwards mail operations to the Mail Server, pushes notifications

### Architecture Diagram

```
                    Voyager Clients (N connections)
                           │
                    ┌──────▼──────┐
                    │  RDO Server │ Port: fClientPort
                    │  24 threads │ ISMaxThreads = 24
                    │  Registered:│
                    │  'InterfaceServer' = TInterfaceServer (1)
                    │   ClientView[N]   = TClientView (per user)
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │ Model Svr │   │ Dir. Svr  │   │ Mail Svr  │
    │ (World)   │   │ (Auth)    │   │ (Email)   │
    │ Pool: 8   │   │ Cnx: 1    │   │ Cnx: 1    │
    └─────┬─────┘   └───────────┘   └───────────┘
          │
    ┌─────▼──────┐
    │ MS Events  │ 1 thread inbound
    │ 'InterfaceEvents' = TModelEvents
    └────────────┘
```

### Initialization Sequence (InterfaceServer.pas:2617-2719)

| Step | Action | Target |
|------|--------|--------|
| 1 | Create locks (`fServerLock`, `fDAProxyLock`) | — |
| 2 | Create client collection, lobby channel, TModelEvents sink | — |
| 3 | Start client RDO server (24 threads), register as `'InterfaceServer'` | — |
| 4 | Connect to Model Server, create pool (8 connections), bind to `'World'` | Model Server |
| 5 | Start events listener (1 thread), register TModelEvents as `'InterfaceEvents'` | Model Server |
| 6 | Call `RDORegisterIS(localAddr, eventsPort)` — tell MS where to push events | Model Server |
| 7 | Read world metadata (name, URL, size) from Model Server | Model Server |
| 8 | Create map caches, start refresh thread (60s interval) | — |
| 9 | Connect to Mail Server, GameMaster Server, Directory Server | Mail, GM, DS |
| 10 | Start listening for client connections | — |

---

## 3. Directory Server Architecture

### What the DS Does

The DS is an **authentication service + hierarchical key-value configuration store**:

1. **Account management** — create accounts, validate serials, register users
2. **Authentication** — password validation (plaintext!), SEGA/SWAN integration, account status checks
3. **Key-value registry** — tree-structured data store (like Windows Registry) backed by SQL Server
4. **World metadata** — stores area/world configuration, population, online counts
5. **Billing/subscriptions** — subscription IDs, charge recording, trial management
6. **Session management** — per-client sessions with TTL and reference counting

### Architecture Diagram

```
    Clients (IS, Voyager, WebClient)
           │
    ┌──────▼──────┐       ┌──────▼──────┐
    │ Secure Port │       │ Unsecure Pt │
    │ 10 threads  │       │ 10 threads  │
    │ READ-ONLY   │       │ READ+WRITE  │
    │ isSecure=f  │       │ isSecure=t  │
    └──────┬──────┘       └──────┬──────┘
           │                     │
           └──────────┬──────────┘
                      │
              TDirectoryServer
              'DirectoryServer' hook
                      │
              TDirectorySession (per client)
                      │
              TDirectoryManager (ADO)
                      │
              ┌───────▼───────┐
              │  SQL Server   │
              │  SQLOLEDB.1   │
              │  tbl_KeyPaths │
              │  tbl_Values   │
              │  18 sprocs    │
              └───────────────┘
```

### Two-Port Design (MainWindow.pas:183-187)

```delphi
fSecureDirServer    := TDirectoryServer.Create(SecurePort,   DBName, false); // READ-ONLY (no writes)
fUnsecuredDirServer := TDirectoryServer.Create(UnsecuredPort, DBName, true);  // READ+WRITE
```

**Naming is inverted:** The "secure" server has `isSecure=false` (cannot write), the "unsecured" server has `isSecure=true` (can write). This is because `isSecure` maps to `fDirSecurity` which controls write permission.

### DS Initialization Sequence (DirectoryServer.pas:1414-1435)

| Step | Action |
|------|--------|
| 1 | Create `fAccountLock` (global mutex for account mutations) |
| 2 | Create `fSessions` collection |
| 3 | Create WinSock RDO listener (10 threads) |
| 4 | Register `self` as `'DirectoryServer'` |
| 5 | Start listening |
| 6 | Load global config from DB (`root/globalvars`) |

---

## 4. Complete RDO Surface Inventory

### 4.1 Interface Server — TInterfaceServer

Source: `InterfaceServer.pas:306-539`, registered as `'InterfaceServer'`

#### Published Properties

| Property | Type | R/W | Purpose |
|----------|------|-----|---------|
| `WorldName` | string | R | World display name |
| `WorldURL` | string | R | World web URL |
| `WorldXSize` | integer | R | Map width |
| `WorldYSize` | integer | R | Map height |
| `WorldYear` | integer | R | Current virtual year (proxied from MS) |
| `WorldPopulation` | integer | R | Total population (proxied from MS) |
| `WorldSeason` | integer | R | Current season 0-3 |
| `UserCount` | integer | R | Connected user count |
| `DAAddr` | string | R | Model Server address |
| `DAPort` | integer | R | Model Server port |
| `DSAddr` | string | R | Directory Server address |
| `DSPort` | integer | R | Directory Server port |
| `DSArea` | string | R | Directory Server area |
| `MailAddr` | string | R | Mail Server address |
| `MailPort` | integer | R | Mail Server port |
| `ForceCommand` | integer | W | Admin force command |
| `MSDown` | boolean | R | Is Model Server down? |
| `MinNobility` | integer | R | Minimum nobility to join |
| `ServerBusy` | boolean | R | Is server saving/busy? |

#### Published Methods

| Method | Params | Return | Purpose |
|--------|--------|--------|---------|
| `AccountStatus(UserName, Password)` | 2× widestring | OleVariant | Check account without login |
| `Logon(UserName, Password)` | 2× widestring | OleVariant (ClientView ptr) | Authenticate, return session |
| `Logoff(ClientView)` | TClientView | OleVariant | Disconnect client |
| `GetUserList(Channel)` | TChannel | OleVariant | Users in channel |
| `GetChannelList` | none | OleVariant | All channels |
| `GetChannelInfo(Name, langid)` | 2× widestring | OleVariant | Channel description |
| `GetClientView(Name)` | widestring | OleVariant | Look up client |
| `CanJoinWorld(Name)` | widestring | OleVariant | Join check |
| `BanPlayer(Name)` | widestring | void | Ban user |
| `ReportNewMail(Account, From, Subject, MsgId)` | 4× widestring | void | Mail callback |
| `GameMasterMsg(ClientId, Msg, Info)` | int+ws+int | OleVariant | GM relay |
| `GMNotify(ClientId, notID, Info)` | int+int+ws | void | GM notify |
| `GetConfigParm(name, def)` | 2× widestring | OleVariant | Read config |

### 4.2 Interface Server — TClientView

Source: `InterfaceServer.pas:91-273`, dynamically registered per user session

#### Published Properties

| Property | Type | R/W | Purpose |
|----------|------|-----|---------|
| `UserName` | string | R | Player username |
| `CompositeName` | string | R | Display name with role |
| `TycoonId` | integer | R | Tycoon entity ID |
| `AccountDesc` | integer | R | Account type |
| `AFK` | boolean | R/W | Away status |
| `x1, y1, x2, y2` | integer | R/W | Viewport bounds |
| `MailAccount` | string | R | Mail account |
| `EnableEvents` | boolean | R/W | Push events toggle |
| `ServerBusy` | boolean | R | Server busy state |

#### Published Methods (70+ methods)

**Map Queries:** `SetViewedArea`, `ObjectsInArea`, `ObjectAt`, `ObjectStatusText`, `AllObjectStatusText`, `ContextStatusText`, `ObjectConnections`, `GetSurface`, `GetNearestTownHall`

**Focus:** `FocusObject`, `UnfocusObject`, `SwitchFocus`, `SwitchFocusEx`

**Building Ops:** `ConnectFacilities`, `NewFacility`, `CloneFacility`, `DefineZone`

**Roads:** `CreateCircuitSeg`, `BreakCircuitAt`, `WipeCircuit`, `SegmentsInArea`

**Tycoon/Company:** `GetUserName`, `GetCompanyList/Count/Name/Id/Cluster/OwnerRole/FacilityCount/Profit`, `NewCompany`, `PickEvent`, `GetTycoonCookie`, `SetTycoonCookie`

**Chat/Presence:** `SayThis`, `VoiceThis`, `VoiceRequest`, `CancelVoiceRequest`, `VoiceTxOver`, `VoiceStatusChanged`, `MsgCompositionChanged`, `CreateChannel`, `JoinChannel`, `LaunchChannelSession`, `Chase`, `StopChase`, `GetUserList`, `GetChannelList`, `GetChannelInfo`, `ISStatus`, `ClientViewId`, `ClientAware`, `ClientNotAware`, `SetLanguage`

**Session/Events:** `RegisterEvents`, `RegisterEventsById`, `SetClientData`, `Logoff`

**Favorites:** `RDOFavoritesNewItem/DelItem/MoveItem/RenameItem/GetSubItems`

**GameMaster:** `ConnectToGameMaster`, `SendGMMessage`, `DisconnectUser`

### 4.3 Interface Server — TModelEvents

Source: `InterfaceServer.pas:541-559`, registered as `'InterfaceEvents'`

| Method | Params | Purpose |
|--------|--------|---------|
| `RefreshArea(x, y, dx, dy)` | 4× int | Map area changed |
| `RefreshObject(ObjId, KindOfChange)` | 2× int | Focused building changed |
| `RefreshTycoons(useless)` | int | All tycoon data changed |
| `RefreshDate(Date)` | TDateTime | Virtual date advanced |
| `RefreshSeason(Season)` | int | Season changed |
| `EndOfPeriod(useless)` | int | Year-end processing |
| `TycoonRetired(name)` | widestring | Bankruptcy |
| `SendTickData(...)` | 3×int+ws | **DEAD CODE** |
| `SendNotification(TycoonId, Kind, Title, Body, Options)` | 2×int+2×ws+int | Game notification |
| `ModelStatusChanged(Status)` | int | Busy/error |
| `ReportMaintenance(eta, LastDowntime)` | TDateTime+int | Maintenance |

### 4.4 Directory Server — TDirectoryServer

Source: `DirectoryServer.pas:136-216`, registered as `'DirectoryServer'`

| Method | Return | Purpose |
|--------|--------|---------|
| `RDOOpenSession` | OleVariant (session ptr) | Create new session |

### 4.5 Directory Server — TDirectorySession

Source: `DirectoryServer.pas:15-134`, dynamically registered per session

#### Key Navigation

| Method | Params | Return | Purpose |
|--------|--------|--------|---------|
| `RDOSetCurrentKey(FullPathKey)` | widestring | OleVariant (bool) | Navigate to key path |
| `RDOGetCurrentKey` | none | OleVariant (string) | Get current path |
| `RDOCreateFullPathKey(FullPathKey, ForcePath)` | ws+wordbool | OleVariant (bool) | Create key |
| `RDOCreateKey(KeyName)` | widestring | OleVariant (bool) | Create relative key |

#### Key Inspection

| Method | Params | Return | Purpose |
|--------|--------|--------|---------|
| `RDOFullPathKeyExists(FullPathKey)` | widestring | OleVariant (bool) | Key exists? |
| `RDOKeyExists(KeyName)` | widestring | OleVariant (bool) | Relative key exists? |
| `RDOKeysCount` | none | OleVariant (int) | Child key count |
| `RDOValuesCount` | none | OleVariant (int) | Child value count |
| `RDOGetKeyNames` | none | OleVariant (string) | List child key names |
| `RDOGetValueNames` | none | OleVariant (string) | List child value names |

#### Value Read/Write

| Write (procedure = void) | Read (function = returns value) |
|--------------------------|--------------------------------|
| `RDOWriteBoolean(Name, Value)` | `RDOReadBoolean(Name)` |
| `RDOWriteInteger(Name, Value)` | `RDOReadInteger(Name)` |
| `RDOWriteFloat(Name, Value)` | `RDOReadFloat(Name)` |
| `RDOWriteString(Name, Value)` | `RDOReadString(Name)` |
| `RDOWriteDate(Name, Value)` | `RDOReadDate(Name)` |
| `RDOWriteDateFromStr(Name, Value)` | `RDOReadDateAsStr(Name)` |
| `RDOWriteCurrency(Name, Value)` | `RDOReadCurrency(Name)` |

#### Node Operations

| Method | Params | Return | Purpose |
|--------|--------|--------|---------|
| `RDODeleteFullPathNode(FullPathNode)` | widestring | OleVariant (bool) | Delete key/value |
| `RDODeleteNode(NodeName)` | widestring | OleVariant (bool) | Delete relative |
| `RDOIsSecureKey(FullKeyName)` | widestring | OleVariant (bool) | Check security flag |
| `RDOSetSecurityOfKey(FullKeyName, Security)` | ws+wordbool | OleVariant (bool) | Set security |
| `RDOIsSecureValue(FullPathName)` | widestring | OleVariant (bool) | Value security |
| `RDOSetSecurityOfValue(FullPathName, Security)` | ws+wordbool | OleVariant (bool) | Set value security |
| `RDOSetSecurityLevel(secLevel)` | wordbool | OleVariant | Set write security flag |
| `RDOTypeOf(FullPathNode)` | widestring | OleVariant (int) | Node type (0-7) |

#### Query/Search

| Method | Params | Return | Purpose |
|--------|--------|--------|---------|
| `RDOQueryKey(FullKeyName, ValueNameList)` | 2× widestring | OleVariant (string) | Query child key values |
| `RDOSearchKey(SearchPattern, ValueNameList)` | 2× widestring | OleVariant (string) | Search with wildcards |
| `RDOIntegrateValues(RelValuePath)` | widestring | OleVariant (double) | Sum values across children |
| `RDOEditKey(FullPathKey, newName, oldName, Security)` | 3×ws+byte | OleVariant (bool) | Rename key |

#### Account Management

| Method | Params | Return | Purpose |
|--------|--------|--------|---------|
| `RDOGenAccountId(FamilyId)` | integer | OleVariant | Generate serial |
| `RDOGenSubscriptionId(Alias)` | widestring | OleVariant | Generate subscription ID |
| `RDOGenTransactionId(Alias)` | widestring | OleVariant | Generate transaction ID |
| `RDONewAccount(AccountId, FamilyId)` | ws+int | OleVariant | Register serial |
| `RDONewUserId(Alias, Password, AccountId, FamilyId)` | 3×ws+int | OleVariant | Create user |
| `RDOLogonUser(Alias, Password)` | 2× widestring | OleVariant | Authenticate |
| `RDOMapSegaUser(Alias)` | widestring | OleVariant | SEGA user mapping |
| `RDOIsValidAlias(Alias)` | widestring | OleVariant | Validate alias |
| `RDOGetAliasId(Alias)` | widestring | OleVariant | Normalize alias |
| `RDOGetUserPath(Alias)` | widestring | OleVariant | User path in registry |
| `RDOCanJoinNewWorld(Alias)` | widestring | OleVariant | Check world limit |
| `RDOExtendTrial(Alias, days)` | ws+int | OleVariant | Extend trial period |
| `RDOIsOnTrial(Alias)` | widestring | OleVariant | Check trial status |
| `RDONextChargeDate(Alias)` | widestring | OleVariant | Next billing date |

#### Subscription/Billing

| Method | Params | Return | Purpose |
|--------|--------|--------|---------|
| `RDORecordSubscriptionInfo(SubsId, Data)` | 2× ws | OleVariant | Record payment data |
| `RDORecordExtraInfo(Alias, Data)` | 2× ws | OleVariant | Extra user info |
| `RDONotifyCharge(subsid, pnref, code, msg)` | 4× ws | OleVariant | Credit card result |
| `RDONotifyMoneyTransfer(subsid, type, info, months)` | 4× ws | OleVariant | Wire transfer |
| `RDOUnsubscribe(alias, subsid)` | 2× ws | OleVariant | Cancel subscription |
| `RDOUpdateSubs(alias, valid)` | ws+wordbool | OleVariant | Update status |
| `RDOUpdateAccount(alias, expDate)` | 2× ws | OleVariant | Update expiry |
| `RDOGetExpDays(alias)` | widestring | OleVariant | Days until expiry |

#### Encryption/Security

| Method | Params | Return | Purpose |
|--------|--------|--------|---------|
| `RDOGenSessionKey(len)` | integer | OleVariant | RC4 session key |
| `RDOEncryptText(text)` | widestring | OleVariant | Double-encrypt |
| `RDOGetSecureTransId` | none | OleVariant | Time-limited token |
| `RDOValidateTransId(id, mins)` | ws+int | OleVariant | Validate token |

#### Session Lifecycle

| Method | Purpose |
|--------|---------|
| `RDOEndSession` | Close session, decrement refcount |
| `RDOSetExpires(value)` | Enable/disable TTL |
| `KeepAlive` | Reset TTL timer |

---

## 5. External Dependencies & Inter-Server Communication

### Interface Server Connection Map

| Connection | Target | Bind Object | Timeout | Pool |
|-----------|--------|-------------|---------|------|
| `fDAProxy` | Model Server | `'World'` | 10s | 1 primary + 7 pool = 8 |
| `fDAEventsRDO` | Model Server (inbound) | `'InterfaceEvents'` = TModelEvents | — | 1 thread |
| `fDSProxy` | Directory Server | `'DirectoryServer'` → session | 30s | 1 connection |
| `fMailServer` | Mail Server | `'MailServer'` | 10s | 1 connection |
| `fGMProxy` | GameMaster Server | `'GMServer'` | 40s | 1 connection |
| `fClientsRDO` | Voyager Clients (inbound) | `'InterfaceServer'` = self | — | 24 threads |

### Directory Server Connection Map

| Connection | Target | Purpose |
|-----------|--------|---------|
| SQL Server (ADO) | `tbl_KeyPaths` + `tbl_Values` | All data persistence |
| `sega_snap.dll` | SEGA SNAP auth | External auth (deprecated) |
| Master DS (slave mode only) | Another Directory Server | Auth forwarding + data replication |

### What the IS Reads/Writes on the DS

**During Logon** (InterfaceServer.pas:3109-3252):
- `fDSProxy.RDOLogonUser(UserName, Password)` — authenticate
- `fDSProxy.RDOSetCurrentKey(GetUserPath(UserName))` — navigate to user
- `fDSProxy.RDOReadInteger('NobPoints')` — read nobility points
- `fDSProxy.RDOReadInteger('AccModifier')` — read account modifier bitmask

**Periodic (every 60s)** via `StoreInfoInDS` (InterfaceServer.pas:4469-4514):
- Creates/navigates to `Root/Areas/{area}/Worlds/{name}/General`
- Writes: `Population`, `Investors`, `Visitors`, `Online`, `Date`
- Navigates to `Root/Areas/{area}/Worlds/{name}/Interface`
- Writes: `Running = true`

---

## 6. Thread Model & Concurrency

### Interface Server Threads

| Thread(s) | Count | Purpose |
|-----------|-------|---------|
| Main VCL thread | 1 | Win32 message pump for TServerSocket |
| Client query threads | 24 | Competing consumers from query queue |
| MS events listener | 1 | Receives Model Server push events |
| Refresh thread | 1 | 60s timer for StoreInfoInDS + CheckDAConnections |

### IS Locking Hierarchy

| Lock | Type | Protects |
|------|------|----------|
| `fServerLock` | TCriticalSection | All major operations (Logon, Refresh, etc.) |
| `fClients.Lock` | TLockableCollection | Client list iteration |
| `fDAProxyLock` | TCriticalSection | World proxy swap on reconnect |
| `fDACnntPool.Lock` | Pool internal | Connection pool access |
| `fObjectCache.fLock` | TAsymetrixCriticalSection | Map cache (reader-writer) |
| `TClientView.fLock[4]` | 4× TCriticalSection | Per-client: events, viewport, chasers, companionship |

### Directory Server Threads

| Thread(s) | Count | Purpose |
|-----------|-------|---------|
| Main VCL thread | 1 | Win32 message pump |
| Query threads (secure port) | 10 | Handle RDO queries (read-only) |
| Query threads (unsecure port) | 10 | Handle RDO queries (read+write) |
| Session cleanup timer | 1 | CheckSessions(TTL) |

### DS Locking

| Lock | Type | Protects |
|------|------|----------|
| `fAccountLock` | TCriticalSection | ALL account/subscription mutations (global) |
| `fLock` (per-session) | TCriticalSection | Session-level serialization |
| `fSessions` | TLockableCollection | Session list |

### Node.js Equivalent

**All concurrency complexity evaporates in Node.js:**

| Delphi | Node.js |
|--------|---------|
| 24+10+10 query threads | Single event loop + async/await |
| 8 lock types | Not needed |
| TRDOConnectionPool (8 sockets) | `generic-pool` or similar |
| TRefreshThread | `setInterval(60000)` |
| ADO connection-per-operation | Connection pool (pg-pool, better-sqlite3) |

---

## 7. Event/Push Notification System

### Event Flow: Model Server → IS → Clients

```
TWorld (Kernel/World.pas) → fires callbacks
    ↓
TModelServer → RDO proxy to IS events port
    ↓
TModelEvents ('InterfaceEvents') → delegates to TInterfaceServer
    ↓
TInterfaceServer → iterates clients, applies routing
    ↓
TClientView[i] → fClientEventsProxy.XXX → RDO push to client
```

### Event Routing Strategies

| Event | Routing | Frequency |
|-------|---------|-----------|
| `RefreshArea` | **Viewport intersection** | Per map change |
| `RefreshObject` | **Focus list membership** | Per focused building change |
| `RefreshTycoons` | **Broadcast all** | Every simulation tick |
| `RefreshDate` | **Broadcast all** | Per virtual day |
| `RefreshSeason` | **Broadcast all** | 4× per virtual year |
| `EndOfPeriod` | **Broadcast all** | Per virtual year |
| `TycoonRetired` | **Single client by name** | Rare |
| `SendNotification` | **Single client by tycoon ID** | Per game event |
| `ChatMsg` | **Channel + destination filter** | User-driven |
| `VoiceMsg` | **Channel, voice-enabled, excl sender** | User-driven |
| `ReportNewMail` | **Single client by name** | Per email |
| `MoveTo` | **Chasers only** | On viewport change |
| `NotifyCompanionship` | **Viewport overlap (personalized)** | On any viewport change |
| `NotifyUserListChange` | **Same channel, excl self** | Per state change |
| `NotifyChannelListChange` | **Global broadcast** | Per channel lifecycle |

### Client Event Interface (Protocol.pas:196-222)

```typescript
interface ClientEvents {
  InitClient(date: number, money: string, failureLevel: number, tycoonId: number): void;
  RefreshArea(x: number, y: number, dx: number, dy: number, extraInfo: string): void;
  RefreshObject(objId: number, kindOfChange: number, extraInfo: string): void;
  RefreshTycoon(money: string, netProfit: string, ranking: number, facCount: number, facMax: number): void;
  RefreshDate(date: number): void;
  RefreshSeason(season: number): void;
  EndOfPeriod(failureLevel: number): void;
  TycoonRetired(failureLevel: number): void;
  ChatMsg(from: string, msg: string): void;
  NewMail(msgCount: number): void;
  MoveTo(x: number, y: number): void;
  NotifyCompanionship(names: string): void;
  NotifyUserListChange(name: string, change: number): void;
  NotifyChannelListChange(name: string, password: string, change: number): void;
  ShowNotification(kind: number, title: string, body: string, options: number): void;
}
```

### BUGQUEST_NoEvnSpreading Flag

`{$DEFINE BUGQUEST_NoEvnSpreading}` at InterfaceServer.pas:3 was used to **disable all Model Server event propagation** during debugging, suggesting historical stability problems with the broadcast pattern under load.

---

## 8. Data Structures & State Management

### Interface Server — In-Memory (Ephemeral)

| Structure | Type | Purpose |
|-----------|------|---------|
| `fClients` | TLockableCollection | Connected client sessions |
| `fObjectCache` | TMapCache `(worldX/64+1)×(worldY/64+1)` | Cached ObjectsInArea |
| `fRoadsCache` | TMapCache (same) | Cached SegmentsInArea |
| `fChannels` | TLockableCollection | Chat channels |
| `fHomeChannel` | TChannel | Lobby channel |
| `fBanList` | TStringList | Banned usernames |

### Per-Client State (TClientView)

| Field | Purpose |
|-------|---------|
| `fUserName, fRealName, fPassword` | Identity |
| `fx1, fy1, fx2, fy2` | Viewport bounds |
| `fFocused` | Set of focused building IDs |
| `fChasers, fTarget` | Chase relationships |
| `fTycoonId, fTycoonProxyId` | Tycoon entity |
| `fTycoonProxy, fConnection` | Model Server proxy + pool connection |
| `fClientEventsProxy` | Push events proxy back to client |
| `fEnableEvents, fConnected` | Event gating |
| `fCurrChannel` | Current chat channel |
| `fCompanionship` | Cached viewport overlap list |
| `fLangId, fAFK, fAware` | Presence state |

**Key insight:** All IS state is ephemeral — nothing persists to disk. All persistent state lives in the Model Server and Directory Server.

---

## 9. Directory Server Data Model & Persistence

### Storage Backend: Microsoft SQL Server

- **Provider:** `SQLOLEDB.1` (ADO/OLE DB)
- **Credentials:** `FiveAdmin` / `awuado00` (hardcoded in DirectoryManager.pas:110-111)
- **Connection pattern:** Open → execute stored procedure → close (per operation, no pooling in Delphi code)

### Database Schema

**Two tables:**

| Table | Columns | Purpose |
|-------|---------|---------|
| `tbl_KeyPaths` | `key_id`, `full_path`, `is_secured` | Tree nodes (materialized path) |
| `tbl_Values` | `parent_key_id` (FK), `name`, `value` (varchar 7801), `kind` (0-7), `is_secured` | Leaf values |

### Value Type System

| Code | Type | Storage Format |
|------|------|---------------|
| 0 | Key (folder) | — |
| 1 | Boolean | `'true'` / `'false'` |
| 2 | Integer | `IntToStr(Value)` |
| 3 | Float | `FloatToStr(Value)` |
| 4 | String | As-is (with `'` → chr(7) encoding) |
| 5 | Date | `FloatToStr(TDateTime)` — Delphi double |
| 6 | Currency | `FloatToStr(Value)` |
| 7 | BigString | Stored via `adLongVarChar` for >7800 chars |

### Stored Procedures (18)

| Procedure | Purpose |
|-----------|---------|
| `proc_InsertKey` | Create key path |
| `proc_keysCount` | Count child keys |
| `proc_valuesCount` | Count child values |
| `proc_GetKeyNames` | List child key names |
| `proc_GetValueNames` | List child value names |
| `proc_DeleteKey` | Delete key + subtree |
| `proc_DeleteValue` | Delete single value |
| `proc_WriteValue` | Write typed value |
| `proc_WriteBigValue` | Write large text value |
| `proc_ReadValue` | Read value by name |
| `proc_ReadBigValue` | Read large text value |
| `proc_FullPathKeyExists` | Check key exists |
| `proc_FullPathValueExists` | Check value exists |
| `proc_TypeOf` | Get value type code |
| `proc_IsSecurityKey` | Check key security |
| `proc_IsSecurityValue` | Check value security |
| `proc_SetSecurityOfKey` | Set key security |
| `proc_SetSecurityOfValue` | Set value security |
| `proc_IntegrateValues` | Sum numeric values |
| `proc_RenameKey` | Rename key |

### Registry Tree Structure

```
Root/
├── System/
│   ├── LastIdSeed = 12345
│   ├── LastSubscriptionId = 678
│   └── LastTransactionId = 901
├── Users/
│   ├── A/
│   │   └── ALICE.SMITH/
│   │       ├── AccountId = "SERIAL-123"
│   │       ├── Password = "plaintext!"          ← CRITICAL SECURITY ISSUE
│   │       ├── Alias = "Alice Smith"
│   │       ├── AccountStatus = 0
│   │       ├── Created = 38456.5                ← TDateTime as float
│   │       ├── NobPoints = 200
│   │       ├── AccModifier = 64                 ← bitmask
│   │       ├── AccountInfo/
│   │       │   └── Worlds/
│   │       │       ├── Shamba/...
│   │       │       └── Noho/...
│   │       └── Subscription/
│   │           ├── pnref = "12345"
│   │           └── chargedate = 46123.0
│   └── S/
│       └── SPO_TEST3/...
├── Serials/
│   └── _SERIAL-123/
│       ├── Created = 38456.5
│       ├── ALICE.SMITH/...
│       └── BOB.JONES/...
├── SegaUsers/
│   └── A/
│       └── ALICE/
│           └── alias = "Alice Smith"
├── Areas/
│   └── BETAzone/
│       └── Worlds/
│           └── Shamba/
│               ├── General/
│               │   ├── Population = 15000
│               │   ├── Investors = 42
│               │   ├── Online = 5
│               │   └── Date = 2026
│               ├── Interface/
│               │   ├── Addr = "192.168.1.10"
│               │   ├── Port = 3000
│               │   └── Running = true
│               └── Cluster = "cluster7.starpeace.net"
├── Subcriptions/                                ← Note: typo in original
│   └── 678/
│       └── Alias = "Alice Smith"
├── Transactions/
│   └── 901/...
├── globalvars/
│   ├── GenID = true
│   ├── NobPoints = 2
│   ├── EndOfTrial = 30
│   ├── MaxSerialUses = 5
│   └── simkeys/
│       ├── count = 3
│       ├── key0 = "..."
│       └── key1 = "..."
└── paying/
    └── ALICE.SMITH/...
```

### QueryKey Return Format

Used by WebClient to list available worlds. For `RDOQueryKey('Root/Areas/BETAzone/Worlds', 'Population\r\nCluster')`:

```
Count=2
Key0=Shamba
Population0=15000
Cluster0=cluster7.starpeace.net
Key1=Noho
Population1=8000
Cluster1=cluster4.starpeace.net
```

---

## 10. Authentication & Account System

### Login Flow (DirectoryServer.pas:1660-1784)

```
Client → RDOLogonUser(alias, password)
  1. Trim + validate alias
  2. Compute user path: Root/Users/<firstchar>/<ALIASID>
  3. Check existence → DIR_ERROR_InvalidAlias if not found
  4. Read stored password (PLAINTEXT), sdcname, AccountStatus
  5. Compare passwords CASE-INSENSITIVE
  6. Branch by AccountStatus:
     - 2 (Blocked) → reject immediately
     - 3/33 (NoAuth) → local password check only
     - 4 (temp) → local check + 15-day age limit
     - 0/1 (Regular/Trial) → SEGA SNAP DLL if useSWAN, else local check
  7. On success: compute AccModifier flags (Newbie/Veteran), sync password
  8. Return DIR_NOERROR (0) or DIR_NOERROR_StillTrial (-1)
```

### Critical Security Findings

| Issue | Severity | Evidence |
|-------|----------|---------|
| **Plaintext passwords** | CRITICAL | DirectoryServer.pas:1635, 1689 |
| **Case-insensitive password comparison** | HIGH | DirectoryServer.pas:1697 |
| **Passwords logged in cleartext** | CRITICAL | DirectoryServer.pas:1759, 1765 |
| **RC4 encryption (weak)** | MEDIUM | Hardcoded key: `'starpeace'` |
| **SQL injection in ExecQuery** | HIGH | DirectoryManager.pas:1776 (string concatenation) |
| **Hardcoded DB credentials** | MEDIUM | `FiveAdmin`/`awuado00` in source |

### Account Status Constants

| Value | Name | Meaning |
|-------|------|---------|
| 0 | `DIR_ACC_RegUser` | Registered/paid |
| 1 | `DIR_ACC_TrialUser` | Trial/unsubscribed |
| 2 | `DIR_ACC_BlockedUser` | Blocked |
| 3 | `DIR_ACC_NoAuthUserA` | Pre-authorized (no SEGA) |
| 33 | `DIR_ACC_NoAuthUserB` | Pre-authorized variant |

### Account Modifier Bitmask

| Bit | Name | Meaning |
|-----|------|---------|
| `$0001` | Support | Support staff |
| `$0002` | Developer | Developer |
| `$0004` | Publisher | Publisher |
| `$0008` | Ambassador | Ambassador |
| `$0010` | GameMaster | Game Master |
| `$0020` | Trial | Trial account |
| `$0040` | Newbie | <15 days old |
| `$0080` | Veteran | >360 days old |
| `$8000` | UnknownUser | Unknown |

### Alias Validation Rules (DirectoryServerProtocol.pas:91-109)

- Must start with a letter (A-Z)
- Allowed characters: `A-Z 0-9 space - _ ! ( ) [ ] + = # ; ,`
- Must NOT contain reserved prefixes: `oc_`, `gm_`, `sp_`, `oceanus`, `starpeace`, `support`, `gamemaster`, `sega`
- Normalized form (AliasId): uppercase, spaces → dots (e.g., `"John Doe"` → `"JOHN.DOE"`)

---

## 11. What the WebClient Gateway Already Implements

### Current Architecture

```
Browser ──WS──> Node.js Gateway ──RDO──> Interface Server ──RDO──> Model Server
                               ──RDO──> Directory Server
                               ──RDO──> Mail Server
                               ──RDO──> Construction Service (port 7001)
```

### DS Operations Already Implemented

| Operation | Status |
|-----------|--------|
| `RDOOpenSession` | Working |
| `RDOMapSegaUser` | Working |
| `RDOLogonUser` | Working |
| `RDOQueryKey` (list worlds) | Working |
| `RDOEndSession` | Working |

### IS Operations Already Implemented (77 WebSocket message types)

| Category | Messages | Status |
|----------|----------|--------|
| Session management | 6 | Working |
| Map data (HTTP API) | 4 | Working |
| Building details & ops | 8 | Working |
| Building placement | 6 | Working |
| Road building | 2 | Working |
| Mail | 8 | Working |
| Profile & statistics | 17 | Working |
| Search & directory | 8 | Working |
| Politics | 3 | Working |
| Chat | 7 | Working |
| Push events | 10 | Partial |
| Direct RDO | 1 | Working |

### Push Events Already Forwarded

- `InitClient` → login completion
- `RefreshObject` → `EVENT_BUILDING_REFRESH`
- `RefreshTycoon` → `EVENT_TYCOON_UPDATE`
- `NewMail` → `EVENT_NEW_MAIL`
- Chat messages → `EVENT_CHAT_MSG`, etc.

---

## 12. Gap Analysis: What's Missing

### Interface Server Gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| `RefreshArea` event routing | Medium | Map doesn't auto-update |
| `RefreshDate/Season` forwarding | Low | Time/season changes |
| `EndOfPeriod` forwarding | Low | Year-end signal |
| `TycoonRetired` event | Medium | Bankruptcy notification |
| `ShowNotification` event | Medium | Game notifications lost |
| Viewport-based routing logic | Medium | Currently not tracking viewports |
| Focus tracking | Medium | Currently not managing focus sets |
| Map cache (64×64) | Medium | No caching layer |
| `MoveTo` (chase system) | Low | Nice-to-have |
| `NotifyCompanionship` | Low | "Who's nearby" |
| Favorites CRUD | Low | 5 methods |
| Surface queries | Medium | Environmental overlays |
| Voice system | Very Low | Likely deprecated |
| GameMaster system | Very Low | Support chat |

### Directory Server Gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| **Full key-value API** | High | Only QueryKey implemented; need Read/Write/Create/Delete |
| **Account creation** | High | NewUserId, NewAccount, GenAccountId not implemented |
| **Direct DB access** | High | Currently proxying through DS; need own persistence |
| **World metadata writes** | Medium | IS→DS StoreInfoInDS not replicated |
| **Subscription/billing** | Low | Likely deprecated for revival |
| **Security model** | Medium | Secure vs non-secure sessions |
| **Session TTL** | Low | CheckSessions equivalent |
| **Password security upgrade** | Critical | Must hash passwords on migration |
| **CanJoinNewWorld** | Low | Nobility-based world limit |
| **SEGA/SWAN auth** | None | Deprecated, not needed |

---

## 13. Inter-Service Dependency Map

> **CRITICAL**: The IS and DS are not isolated. Multiple Delphi services actively connect to them. Every migration phase must preserve wire-compatible RDO interfaces for all non-migrated consumers.

### Dependency Matrix

```
┌─────────────────┐     push events      ┌─────────────────────┐
│  Model Server    │─────────────────────>│  Interface Server    │
│  (Delphi)        │  'InterfaceEvents'   │  (IS)                │
│                  │  RDO hook            │                      │
│                  │                      │  Also consumed by:   │
│                  │                      │  • Mail Server       │
│                  │                      │  • GM Server (bidir) │
│                  │                      │  • WebClient Gateway │
└────────┬─────────┘                      └──────────────────────┘
         │
         │  persistent RDO session
         │  (curriculum, rankings, nob points)
         ▼
┌─────────────────┐                      ┌─────────────────────┐
│  Directory       │<────────────────────│  Daemon Scheduler    │
│  Server (DS)     │  persistent session  │  (Delphi)           │
│                  │  (rankings, stats)   └─────────────────────┘
│  Also consumed   │
│  by:             │<────────────────────┐ News Server (boot)
│  • IS (auth)     │<────────────────────┐ Cache Server (boot)
│  • WebClient GW  │
└─────────────────┘
```

### Consumer Detail

| Consumer | Target | Connection Type | Protocol | What It Does | Break Impact |
|----------|--------|-----------------|----------|--------------|--------------|
| **Model Server** | **IS** | Outbound → IS 'InterfaceEvents' hook | RDO push | Fires `RefreshArea`, `RefreshObject`, `RefreshTycoons`, `RefreshDate`, `RefreshSeason`, `EndOfPeriod`, `TycoonRetired`, `ShowNotification` | **CRITICAL**: All clients stop receiving game world updates |
| **Model Server** | **DS** | Persistent RDO session via IS `StoreInfoInDS` | RDO get/set/call | Writes curriculum paths, rankings, nob points, world population stats | **HIGH**: Player progression data stops saving |
| **Mail Server** | **IS** | Registers for event callbacks | RDO hook | Receives `NewMail` triggers to push to clients | **MEDIUM**: Mail notifications fail |
| **GM Server** | **IS** | Bidirectional RDO | RDO | Sends GM commands (kick, ban, msg), receives client info | **LOW**: Support tools break (not player-facing) |
| **Daemon Scheduler** | **DS** | Persistent RDO session | RDO get/set | Reads/writes world rankings, economic stats, periodic updates | **HIGH**: Rankings freeze, economy stats stale |
| **News Server** | **DS** | One-time read at boot | RDO get | Reads configuration (news URL, refresh interval) | **VERY LOW**: Only at startup |
| **Cache Server** | **DS** | Optional read at boot | RDO get | Reads cache directory configuration | **VERY LOW**: Only at startup |
| **IS** | **DS** | RDO session (auth + registry read/write) | RDO get/set/call | `RDOLogonUser`, `RDOQueryKey`, `StoreInfoInDS`, world metadata | **CRITICAL**: All logins fail |

### Migration Constraint Rules

These rules MUST be satisfied by any phased plan:

1. **Rule MS→IS**: The Model Server pushes to `InterfaceEvents` on the IS RDO port. Any IS replacement MUST expose an RDO-compatible listener on the same host:port that accepts the Model Server's push calls — OR the Model Server config must be updated to point to the new endpoint.

2. **Rule MS→DS (via IS)**: The Model Server writes to the DS indirectly through `StoreInfoInDS` (IS acts as proxy). If the IS is replaced, the new IS must still perform these DS writes. If the DS is also replaced, the new DS must accept these writes on the same RDO interface.

3. **Rule Daemon→DS**: The Daemon Scheduler opens a persistent DS session for rankings and world stats. Any DS replacement MUST either:
   - Expose the same RDO port with compatible `RDOOpenSession`/`ReadString`/`WriteString`/`QueryKey` API, OR
   - Migrate the Daemon Scheduler simultaneously (risky — different codebase).

4. **Rule Mail→IS**: The Mail Server registers for IS event callbacks. Any IS replacement must accept this registration and fire events when mail arrives.

5. **Rule GM↔IS**: Bidirectional — lower priority. GM Server can be temporarily disabled during IS cutover with minimal player impact.

6. **Rule News/Cache→DS**: One-time boot reads — negligible risk. These services just need the same key paths to exist at startup.

---

## 14. Risk Assessment

### Technical Risks

| Risk | P | Impact | Mitigation |
|------|---|--------|------------|
| RDO protocol mismatch (wire format) | High | Critical | `rdo-types.ts` + conformity checklist + byte-level comparison |
| Model Server can't push to new IS | High | Critical | Must implement RDO server listener on same port |
| Daemon Scheduler can't reach new DS | High | High | Keep Delphi DS running until Node.js DS is proven |
| SQL Server schema mismatch | Medium | High | Read existing stored procedures first |
| Password migration impossible | Certain | Medium | Force password resets on migration |
| Model Server connection pool exhaustion | Medium | High | Monitor + auto-reconnect |
| Event routing mismatch (wrong clients) | Medium | Medium | Side-by-side comparison tests |
| QueryKey format parsing bugs | Medium | High | Extensive test fixtures from real DS |
| ADO→Node.js SQL translation errors | Medium | High | Run parallel queries, compare results |
| Dual-write consistency (parallel mode) | Medium | Medium | Primary=Delphi, shadow=Node.js, log divergences |

### Security Risks (to FIX during migration)

| Current Issue | Migration Fix |
|---------------|---------------|
| Plaintext passwords | bcrypt/argon2 hashing |
| Case-insensitive password comparison | Decide: preserve (compat) or fix (security) |
| Cleartext password logging | Never log passwords |
| RC4 encryption | Replace with AES-256 or rely on TLS |
| SQL injection in ExecQuery | Parameterized queries |
| Hardcoded DB credentials | Environment variables |
| `sega_snap.dll` dependency | Remove entirely |

### Dependency-Specific Risks

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Replace IS while Model Server pushes events | Model Server connects at boot; if IS restarts, push channel is lost until MS reconnects | Implement reconnection handshake; test MS→IS reconnection behavior |
| Replace DS while Daemon Scheduler has persistent session | Scheduler's session handle becomes invalid | Run Delphi DS as read-only fallback during cutover; coordinate restart |
| Both IS and DS down simultaneously during migration | All game clients disconnect, all progression stops | Never migrate both in the same maintenance window |
| Node.js IS receives events but routes differently than Delphi IS | Subtle gameplay differences (wrong clients updated) | Shadow mode: run both, compare routing decisions |

### Code & Database Coexistence Risks

> During Phases 2-4, Node.js and Delphi services **share the same SQL Server database** and must speak the same RDO wire protocol. This section catalogs every known compatibility trap.

#### 14.1 The RDO Server Problem — A New Component

The WebClient codebase (`src/server/rdo.ts`) contains only an RDO **client** — it connects to Delphi servers and sends queries. Phases 2 and 4 require building an RDO **server** — a TCP listener that accepts connections from Delphi services (Model Server, Mail Server, Daemon Scheduler) and dispatches via the same verb model.

This is not a trivial addition. The RDO server must implement:

| Component | Source Reference | What Node.js Must Replicate |
|-----------|-----------------|----------------------------|
| **TCP framing** | `WinSockRDOConnectionsServer.pas:746-851` | Semicolon-delimited messages (`;` terminates), with `"` escaping of embedded semicolons. Per-socket buffer accumulation via `GetQueryText`. |
| **Direction markers** | `RDOProtocol.pas:47-48` | Inbound queries start with `C`, responses start with `A`. |
| **Query ID echo** | `RDOQueryServer.pas:172` | Every query has a correlation ID (decimal number); the response must echo it: `<QueryId> <result>;` |
| **Object registry** | `RDOObjectRegistry.pas:51-76` | `idof "Name"` → returns `objid="<id>"`. Linear scan, case-sensitive name match. |
| **sel/get/set/call verbs** | `RDOQueryServer.pas:72-175` | `sel <ObjectId>` selects an object, then `get`/`set`/`call` chains execute against it. Multiple verbs can chain in a single query. |
| **RTTI-like dispatch** | `RDOObjectServer.pas:63-351` | `get PropName` reads a published property; if not found, **falls through to calling a method** of that name (line 117). `set PropName` writes a property. `call MethodName` invokes a method with type-prefixed arguments. |
| **Type prefix serialization** | `RDOUtils.pas:315-397` | Values on the wire use `#`=int, `!`=single, `@`=double/date/currency, `$`=string, `%`=widestring, `^`=variant, `*`=void. Exact round-trip fidelity required. |
| **x86 calling convention** | `RDOObjectServer.pas:246-311` | Delphi uses EAX/EDX/ECX register convention for published methods. Node.js doesn't need this, but must produce identical parameter ordering and type coercions. |
| **1 MB query limit** | `WinSockRDOConnectionsServer.pas:55,777` | `MaxQueryLength = 1024*1024`. Connections exceeding this without a `;` terminator are forcibly closed. |

**Effort estimate:** This is ~2-3 weeks of work on its own, and should be called out as a **prerequisite** for Phase 2 (IS cutover), not something that happens "in passing."

#### 14.2 SQL Server Dual-Access During Phase 3

During Phase 3, the Delphi DS (via ADO/SQLOLEDB.1) and Node.js (via `mssql`/TDS) both access the same SQL Server database simultaneously.

**Connection behavior mismatch:**

| Aspect | Delphi DS (ADO) | Node.js (`mssql`) |
|--------|-----------------|-------------------|
| **Provider** | SQLOLEDB.1 (OLE DB) | TDS protocol (tabular data stream) |
| **Connection pattern** | Open → execute 1 SP → close (per operation) | Connection pool (persistent connections) |
| **Implicit pooling** | SQLOLEDB.1 has built-in OLE DB session pooling (transparent to Delphi code) | `mssql` maintains its own pool |
| **Isolation level** | Default: `READ COMMITTED` | Default: `READ COMMITTED` (same — OK) |
| **Transactions** | None explicit — each SP auto-commits | Must match: no explicit transactions |
| **Max connections** | Delphi sessions × 1 (but OLE DB pools) | Pool size (configurable) |

**Risk:** With OLE DB session pooling + Node.js connection pool both active, SQL Server's max connection limit could be reached. Default SQL Server max = 32,767, unlikely to be hit in practice, but worth monitoring.

**Mitigation:** Keep the Node.js pool small during Phase 3 (e.g., `max: 5`). Monitor with `SELECT @@MAX_CONNECTIONS` and `sp_who`.

#### 14.3 Data Encoding Traps — chr(7), chr(8), chr(9)

The Delphi DS applies **two layers of character encoding** before writing strings to SQL Server (DirectoryManager.pas:143-193):

| Encoding | Direction | Char | Replacement | Applied To |
|----------|-----------|------|-------------|------------|
| `EncodeString` | Write | `'` (single quote, 0x27) | `chr(7)` (BEL, 0x07) | All string values (`WriteString`, `WriteBigString`) |
| `UnEncodeString` | Read | `chr(7)` (0x07) | `'` (0x27) | All string values (`ReadString`, `ReadBigString`) |
| `LinkString` | Write (QueryKey results) | CR (0x0D) | `chr(8)` (0x08) | Multi-row query output |
| `LinkString` | Write (QueryKey results) | LF (0x0A) | `chr(9)` (0x09) | Multi-row query output |
| `SplitString` | Read (QueryKey input) | `chr(8)` (0x08) | CR (0x0D) | Inverse of LinkString |
| `SplitString` | Read (QueryKey input) | `chr(9)` (0x09) | LF (0x0A) | Inverse of LinkString |

**If Node.js reads directly from SQL Server (Phase 3), it sees raw `chr(7)` bytes in string values.** It MUST apply `UnEncodeString` (replace 0x07 → `'`) to produce correct results. Similarly, `LinkString`/`SplitString` encoding must be replicated for `QueryKey`/`SearchKey` operations.

**If Node.js writes directly to SQL Server (Phase 4), it MUST apply `EncodeString` (replace `'` → 0x07) before storage**, or the Delphi DS (and any other Delphi consumer still reading the same DB) will read corrupted data.

**This is not optional.** All existing data in the database has been written with this encoding. A Node.js implementation that skips it will:
- Read single quotes as BEL characters (display corruption)
- Write single quotes literally, which won't be decoded by Delphi consumers
- Break QueryKey results with embedded newlines

#### 14.4 Delphi TDateTime Float Representation

Dates in the DS are stored as `FloatToStr(TDateTime)` — a Delphi `double` where:
- Integer part = days since **1899-12-30** (Delphi epoch, NOT Unix epoch)
- Fractional part = fraction of day (0.5 = noon, 0.25 = 06:00, etc.)

**Example:** `38456.5` = 2005-04-15 12:00:00

Node.js must replicate this exactly:

```typescript
// Delphi epoch: 1899-12-30T00:00:00Z
const DELPHI_EPOCH_MS = new Date(1899, 11, 30).getTime(); // Dec 30, 1899
const MS_PER_DAY = 86_400_000;

function toDelphiDateTime(date: Date): number {
  return (date.getTime() - DELPHI_EPOCH_MS) / MS_PER_DAY;
}

function fromDelphiDateTime(dt: number): Date {
  return new Date(DELPHI_EPOCH_MS + dt * MS_PER_DAY);
}
```

**Precision trap:** Delphi's `FloatToStr` produces up to 15 significant digits. JavaScript's `Number.toString()` may produce a different digit count for the same IEEE 754 double. When Node.js writes a date value and the Delphi DS reads it back, the string representations must match. For read operations, `parseFloat()` is safe (IEEE 754 is the same). For write operations, Node.js must produce the same string that Delphi's `FloatToStr` would — this may require a custom formatter with explicit precision control (e.g., `value.toPrecision(15)` with trailing zero trimming).

#### 14.5 Stored Procedure Calling Convention — ADO vs TDS

The Delphi DS calls all 18+ stored procedures via ADO with specific parameter types (DirectoryManager.pas):

| ADO Param Type | ADO Constant | Node.js `mssql` Equivalent | Notes |
|----------------|-------------|---------------------------|-------|
| `adVarChar` | 200 | `sql.VarChar(n)` | Common — direct mapping |
| `adInteger` | 3 | `sql.Int` | Direct mapping |
| `adTinyInt` | 16 | `sql.TinyInt` | Used for `value_kind` (0-7) |
| `adBoolean` | 11 | `sql.Bit` | Delphi ADO `adBoolean` → SQL `bit` |
| `adDouble` | 5 | `sql.Float` | Used by `proc_IntegrateValues` output |
| `adLongVarChar` | 201 | `sql.Text` | BigString write — **check**: does `mssql` handle `sql.Text` the same way ADO handles `adLongVarChar`? |
| `adParamOutput` | 2 | `sql.output` direction | Verify output param retrieval syntax |
| `adParamReturnValue` | 4 | `request.output('RETURN_VALUE', sql.Int)` | Every SP has a `RETURN_VALUE` param |

**Key concern — `proc_ReadValue` output parameter:**

Delphi (DirectoryManager.pas:1043-1096):
```delphi
parm3 := cmd.CreateParameter('@value', adVarChar, adParamOutput, 7801, '');
// ... execute ...
result := parm3.Value;   // reads from output param
```

Node.js `mssql`:
```typescript
const result = await pool.request()
  .input('key_path', sql.VarChar(1024), keyPath)
  .input('value_name', sql.VarChar(128), name)
  .input('is_secured', sql.Bit, isSecured)
  .output('value', sql.VarChar(7801))
  .execute('proc_ReadValue');
return result.output.value;  // verify: same key name? same type coercion?
```

**The output parameter name (`@value`) and type (`VarChar(7801)`) must match exactly**, or the stored procedure will fail or return NULL. This applies to all SPs with output params: `proc_ReadValue`, `proc_keysCount`, `proc_valuesCount`, `proc_TypeOf`, `proc_IsSecurityKey`, `proc_IsSecurityValue`, `proc_FullPathKeyExists`, `proc_FullPathValueExists`, `proc_IntegrateValues`.

#### 14.6 ExecQuery — Raw SQL Injection Surface

The `QueryKey` and `SearchKey` operations do NOT use stored procedures. They build raw SQL via string concatenation (DirectoryManager.pas:1665-1844):

```sql
SELECT p.full_path, v.name, v.value
FROM tbl_KeyPaths p, tbl_Values v
WHERE full_path LIKE '{FullKeyName}/%'
  AND p.key_id = v.parent_key_id AND (v.name = '{name1}' OR v.name = '{name2}')
ORDER BY full_path, v.Name
```

**The Node.js implementation MUST NOT replicate this pattern.** Use parameterized queries. But the tricky part: the `LIKE` clause and the dynamic `OR` chain for value names require careful parameterization. `SearchKey` also converts `*` wildcards to SQL `%` (line 1677).

**Compatibility constraint:** Even with parameterized queries, the Node.js implementation must produce **identical result sets** to the raw SQL — same column order, same sorting, same `LIKE` matching behavior.

#### 14.7 One TDirectoryManager Per Session — State Model

Each `TDirectorySession` has its own `TDirectoryManager` instance (DirectoryServer.pas:263-279), which has its own ADO `Connection` object, and maintains a **current key path** (`fCurrentKey` — the "cursor" in the registry tree).

This means:
- `RDOSetCurrentKey("Root/Users/A/ALICE")` sets the cursor for THAT session only
- Subsequent `RDOReadString("Password")` reads relative to that cursor
- Two sessions can navigate independently

**Node.js must replicate this stateful session model.** When building the DS replacement (Phase 4), each RDO session must maintain:
- `currentKey: string` — the current path cursor
- `isSecure: boolean` — write permission flag (from the port binding)
- `securityLevel: boolean` — per-session security flag for new values
- `expires: boolean` — TTL behavior
- A reference to the shared SQL connection pool (NOT a per-session connection — Node.js can pool)

The Delphi DS creates a fresh `Connection` per session, but each operation opens/closes it anyway (DirectoryManager.pas:1847-1869). So in Node.js, a shared pool is correct — no per-session connection state leaks.

#### 14.8 Phase Dependency Summary — What Must Be Built Before What

```
                    ┌─────────────────────────────┐
                    │  RDO TCP Server (net.Server) │  ← NEW component, prerequisite
                    │  Framing: ";"-delimited      │     for Phase 2 AND Phase 4
                    │  Direction: C/A markers      │
                    │  Dispatch: sel/get/set/call   │
                    │  Registry: idof + object map  │
                    └──────────┬──────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                                 │
    ┌─────────▼──────────┐           ┌──────────▼──────────┐
    │  Phase 2: IS cutover│           │  Phase 4: DS cutover │
    │  Registers:         │           │  Registers:          │
    │  'InterfaceServer'  │           │  'DirectoryServer'   │
    │  'InterfaceEvents'  │           │  TDirectorySession×N │
    │  TClientView×N      │           │                      │
    └─────────────────────┘           └──────────────────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  SQL direct access   │
                                    │  chr(7) encoding     │
                                    │  TDateTime floats    │
                                    │  SP param matching   │
                                    │  ExecQuery (safe SQL)│
                                    └─────────────────────┘
```

The **RDO TCP Server** is a shared prerequisite for both Phase 2 and Phase 4. It should be developed and tested as Phase 1B (or a sub-phase of Phase 1), not deferred to Phase 2 week 1.

---

## 15. Recommended Approach: Dependency-Aware Incremental Migration

### Guiding Principle

> **Zero consumer breakage.** At every phase boundary, every non-migrated Delphi service must still be able to connect and operate exactly as before. We achieve this by:
> 1. Running Node.js implementations **alongside** Delphi servers (shadow/parallel mode) before cutting over
> 2. Never removing a Delphi server's RDO listener until all its consumers are verified against the replacement
> 3. Tackling the IS before the DS (because the IS has fewer persistent consumers and the DS is the foundation for all servers)

### Phase Overview

```
Phase 0: WebClient-only improvements     ← No dependency risk at all
Phase 1: Node.js IS alongside Delphi IS  ← Shadow mode, no cutover
Phase 2: IS cutover                       ← Delphi IS retired, DS untouched
Phase 3: DS read-path in Node.js          ← Delphi DS still running, no writes moved
Phase 4: DS full replacement              ← Delphi DS retired
Phase 5: Database migration (optional)    ← SQL Server → PostgreSQL/SQLite
```

### Phase 0: WebClient Gateway Improvements (2 weeks)

**Goal:** Fill the gaps in the WebClient's existing proxy layer. **Zero impact on any other service** — we only change how the WebClient talks to the already-running Delphi IS and DS.

**Dependency impact: NONE** — All Delphi services continue unchanged. WebClient is the only consumer affected.

| Week | Deliverable | Dependency Impact |
|------|-------------|-------------------|
| 1 | Forward missing IS push events (RefreshArea, Date, Season, EndOfPeriod, TycoonRetired, ShowNotification) to browser clients | None — we're consuming events the IS already sends |
| 1 | Implement `SetViewedArea` viewport tracking in the gateway (for smarter event filtering to browsers) | None — internal gateway optimization |
| 2 | Implement FocusObject/UnfocusObject tracking in the gateway | None — client-side tracking |
| 2 | Missing features: favorites CRUD, surface queries, companionship | None — adding more IS proxy calls |

**Exit criteria:** All 77+ WebSocket message types functional. Browser clients receive all event types. **No Delphi server touched or reconfigured.**

### Phase 1: Shadow IS + RDO TCP Server Foundation (4-5 weeks)

**Goal:** Build the full IS replacement in Node.js AND the RDO TCP Server library (shared prerequisite for Phases 2 and 4), running **in parallel** with the Delphi IS. The Node.js IS receives the same Model Server events and processes them, but does NOT serve any clients yet. We compare its decisions against the Delphi IS.

**Dependency impact: NONE** — The Delphi IS remains the primary. The Node.js IS is a passive shadow.

**Architecture during Phase 1:**
```
Model Server ──push──> Delphi IS (PRIMARY) ──> clients
             ──push──> Node.js IS (SHADOW) ──> log only (no clients)

Mail Server ──────────> Delphi IS (unchanged)
GM Server ──────────> Delphi IS (unchanged)
All services ──────────> Delphi DS (unchanged)
```

**How we receive Model Server pushes in shadow mode:** The Model Server pushes to a single registered 'InterfaceEvents' hook. We cannot register a second hook without modifying the MS. Instead:
- **Option A (preferred):** Have the Node.js IS listen on a different port and configure the Delphi IS to relay received events to the shadow (requires minor Delphi IS modification — likely not worth it).
- **Option B (practical):** Node.js IS taps into the same TCP stream by intercepting at the WebClient gateway level — the gateway already receives all push events from the Delphi IS and can forward them to the shadow IS for comparison.
- **Option C (simplest):** Skip real-time shadow comparison. Instead, build the Node.js IS logic and test it with recorded event traces captured from the Delphi IS. Validate routing decisions offline.

**Sub-phase 1A: RDO TCP Server library (2 weeks)** — This is a **shared prerequisite** for both Phase 2 (IS cutover) and Phase 4 (DS cutover). See Section 14.1 for full requirements.

| Week | Deliverable | Dependency Impact |
|------|-------------|-------------------|
| 1 | Implement RDO TCP Server core: `net.Server` listener, `;`-delimited framing with `"`-escape awareness, per-socket buffer accumulation, `C`/`A` direction markers, query ID echo | None |
| 1 | Implement object registry (`idof` command), `sel` object selection | None |
| 2 | Implement `get`/`set`/`call` verb dispatch with type prefix serialization (`#`/`!`/`@`/`$`/`%`/`^`/`*`), including the `get→call` fallthrough behavior | None |
| 2 | Full test suite: wire format fidelity tests against captured Delphi RDO traffic, multi-verb chaining, string escaping edge cases, 1MB query limit | None |

**Sub-phase 1B: IS shadow implementation (2-3 weeks)**

| Week | Deliverable | Dependency Impact |
|------|-------------|-------------------|
| 3 | Build Node.js `InterfaceServer` class: session management, viewport tracking, focus sets | None |
| 3 | Implement 64×64 map cache with invalidation | None |
| 4 | Implement all Model Event handlers (RefreshArea, RefreshObject, RefreshTycoons, RefreshDate, RefreshSeason, EndOfPeriod, TycoonRetired, ShowNotification, ModelStatusChange) | None |
| 4 | Implement event routing logic: viewport intersection, focus check, broadcast rules | None |
| 5 | Record event traces from Delphi IS; replay through Node.js IS; compare routing decisions | None |
| 5 | Implement chat channel management, companionship detection | None |

**Exit criteria:** (1) RDO TCP Server passes wire format fidelity tests. (2) Node.js IS produces identical routing decisions as Delphi IS for recorded event traces. All unit tests pass. **No Delphi server touched.**

### Phase 2: IS Cutover (2 weeks)

**Goal:** Replace the Delphi IS with the Node.js IS. This is the first **breaking change** for non-migrated services.

**Dependency impact:**

| Consumer | Impact | Mitigation |
|----------|--------|------------|
| **Model Server** | Must push to new Node.js IS instead of Delphi IS | Node.js IS exposes RDO listener on **same host:port** as Delphi IS was. MS sees no difference. |
| **Mail Server** | Must register events with new IS | Node.js IS implements same 'InterfaceEvents' RDO hook registration API |
| **GM Server** | Must connect to new IS | **Option:** Temporarily disable GM during cutover (low player impact). Implement GM RDO interface in Phase 2 week 2 if needed. |
| **DS (Delphi)** | **Unchanged** — DS doesn't connect TO the IS, IS connects to DS | Zero impact |
| **Daemon Scheduler** | **Unchanged** — doesn't use IS | Zero impact |

**Critical requirement:** The Node.js IS must expose a **native RDO TCP server** on the same port the Delphi IS used, accepting the same RDO verbs (sel/call/get/set). This is what the Model Server and Mail Server connect to. This is NOT a WebSocket — it's the raw RDO TCP protocol from `Rdo.IS/Server/WinSockRDOConnectionsServer.pas`.

| Week | Deliverable | Dependency Impact |
|------|-------------|-------------------|
| 1 | Implement RDO TCP server listener (Node.js `net.Server`) that speaks the `Rdo.IS` wire protocol | None yet — listening on a test port |
| 1 | Implement `RDORegisterIS` handler so Model Server can register its event push hook | None yet — test port |
| 1 | Implement direct Node.js → Model Server RDO connection pool (8 sockets, health check) | None yet — parallel connection |
| 2 | **CUTOVER:** Stop Delphi IS → Start Node.js IS on same host:port | **Model Server, Mail Server, GM Server affected** |
| 2 | Validate: MS events arrive, mail notifications work, client sessions function | Rollback plan: restart Delphi IS if failures detected |
| 2 | IS→DS proxy (`StoreInfoInDS`): Node.js IS writes to Delphi DS via RDO (same as before) | DS unchanged |

**Rollback plan:** If cutover fails, restart the Delphi IS binary. No data loss — the DS is untouched and all state was transient.

**Exit criteria:** Model Server events route correctly to all browser clients. Mail Server receives event callbacks. GM Server connectivity restored (or intentionally deferred). **Delphi IS binary no longer running. Delphi DS untouched.**

### Phase 3: DS Read Path in Node.js (2-3 weeks)

**Goal:** Node.js gateway reads directly from SQL Server for DS queries, **but the Delphi DS remains running** for all write operations and for all other consumers (Model Server writes via IS, Daemon Scheduler).

**Dependency impact: NONE for external consumers** — The Delphi DS continues running. We're only changing the WebClient gateway's read path.

**Architecture during Phase 3:**
```
WebClient Gateway ──SQL──> SQL Server (reads)
                  ──RDO──> Delphi DS (writes, auth)

Model Server ──(via Node.js IS)──> Delphi DS (writes)  ← unchanged
Daemon Scheduler ──RDO──> Delphi DS (reads+writes)     ← unchanged
News/Cache Server ──RDO──> Delphi DS (boot reads)      ← unchanged
```

**Data encoding requirement (see Section 14.3):** All direct SQL reads MUST apply `UnEncodeString` (0x07 → `'`) to string values. `QueryKey`/`SearchKey` results must apply `SplitString` (0x08 → CR, 0x09 → LF). TDateTime values stored as Delphi floats must be parsed correctly (see Section 14.4).

| Week | Deliverable | Dependency Impact |
|------|-------------|-------------------|
| 1 | Connect Node.js to SQL Server (`mssql` package, pool `max: 5`), same DB as Delphi DS | None — read-only secondary connection |
| 1 | Implement data encoding layer: `UnEncodeString` (chr(7)→`'`), `SplitString` (chr(8)→CR, chr(9)→LF), Delphi TDateTime ↔ JS Date conversion | None |
| 1 | Implement `QueryKey` directly using **parameterized SQL** (not raw string concat) | None — Delphi DS still handles all external reads |
| 2 | Implement `ReadString/Integer/Boolean/Float/Date/Currency` via stored procedures with exact ADO-compatible parameter types (see Section 14.5) | None |
| 2 | Implement `FullPathKeyExists`, `SetCurrentKey`, `GetKeyNames`, `GetValueNames` | None |
| 3 | Run parallel reads: gateway reads from both Delphi DS and SQL Server directly, compares results **byte-for-byte** (including encoding) | None — comparison mode only |
| 3 | Switch WebClient gateway to direct SQL reads once parity confirmed | None — only WebClient affected |

**Exit criteria:** WebClient gateway reads from SQL Server directly for all read operations. All string values correctly decoded (chr(7)→`'`). TDateTime floats round-trip identically. Delphi DS still handles all writes + serves all other consumers. Read results match byte-for-byte.

### Phase 4: DS Full Replacement (3-4 weeks)

**Goal:** Replace the Delphi DS entirely. This is the **hardest phase** because the DS has persistent consumers: Model Server (via IS), Daemon Scheduler, and boot-time readers (News/Cache Server).

**Dependency impact:**

| Consumer | Impact | Mitigation |
|----------|--------|------------|
| **Model Server (via Node.js IS)** | IS currently calls Delphi DS via RDO for `StoreInfoInDS`. After this phase, IS writes to SQL Server directly. | Node.js IS updated to use direct SQL writes instead of RDO→DS. No MS change needed — MS talks to IS, not DS. |
| **Daemon Scheduler** | Has persistent RDO session with DS. **Must switch to new Node.js DS.** | Node.js DS exposes RDO TCP listener on same host:port as Delphi DS. Scheduler sees no difference. |
| **News Server** | One-time boot read via RDO. | Same RDO TCP listener. |
| **Cache Server** | One-time boot read via RDO. | Same RDO TCP listener. |

**Critical requirement:** Just like Phase 2 for the IS, the Node.js DS must expose a **native RDO TCP server** on the same port the Delphi DS used. The Daemon Scheduler and boot-time services connect via raw RDO, not WebSocket.

**Phase 4 sub-phases:**

**4A: Implement DS write operations (2 weeks)**

**Data encoding requirement (see Section 14.3):** All writes MUST apply `EncodeString` (`'` → 0x07) before storing string values. Writes must use `LinkString` encoding for multi-line values. `WriteBigString` (type 7) must use `adLongVarChar`-equivalent (`sql.Text`) for values >7800 chars (see Section 14.5). Stateful session model required (see Section 14.7): each RDO session maintains its own `currentKey` cursor.

| Week | Deliverable | Dependency Impact |
|------|-------------|-------------------|
| 1 | Implement `WriteString/Integer/Boolean/Float` directly via stored procedures with `EncodeString` applied | None — not live yet |
| 1 | Implement `CreateFullPathKey`, `DeleteFullPathNode` via SQL | None |
| 1 | Implement auth flow directly: `RDOLogonUser`, alias validation, account status checks | None |
| 2 | Implement account creation (`NewUserId`, `NewAccount`) with **bcrypt** passwords (dual-write: bcrypt + legacy plaintext for Delphi backward compat during transition) | None |
| 2 | Implement `StoreInfoInDS` as direct SQL (retire RDO→DS proxy in Node.js IS) | None — not live yet |
| 2 | Implement security model: secure vs non-secure paths, session-level permissions | None |

**4B: Build DS RDO facade + cutover (1-2 weeks)**

| Week | Deliverable | Dependency Impact |
|------|-------------|-------------------|
| 1 | Implement Node.js RDO TCP server for DS: exposes `RDOOpenSession`, `ReadString`, `WriteString`, `QueryKey`, `EndSession` + all session methods | None — listening on test port |
| 1 | Run parallel: Daemon Scheduler connects to Delphi DS, shadow Node.js DS processes same requests, compare | None |
| 2 | **CUTOVER:** Stop Delphi DS → Start Node.js DS on same host:port | **Daemon Scheduler, News Server, Cache Server affected** |
| 2 | Validate: Scheduler writes succeed, boot services start, auth works | Rollback: restart Delphi DS |

**Rollback plan:** If cutover fails, restart the Delphi DS binary. SQL Server data is the source of truth — no data loss.

**Exit criteria:** All DS consumers (Daemon Scheduler, News Server, Cache Server) work against the Node.js DS. Auth works. All writes go through parameterized SQL (no injection). **Delphi DS binary no longer running.**

### Phase 5: Database Migration (optional, 3-4 weeks)

**Goal:** Replace SQL Server with PostgreSQL or SQLite. Only attempt this after Phase 4 is stable.

**Dependency impact:** None for Delphi services — they were all retired or rerouted in Phases 2 and 4. Only the Node.js IS and DS are affected.

| Week | Deliverable | Dependency Impact |
|------|-------------|-------------------|
| 1 | Design PostgreSQL/SQLite schema (key-value tree + values) | None |
| 1 | Write migration script: SQL Server → new DB | None |
| 2 | Implement new DB driver in Node.js DS (replace `mssql` with `pg`/`better-sqlite3`) | None |
| 2 | Password migration: bcrypt all plaintext passwords from Phase 4's auth | None |
| 3 | Run parallel reads against both databases, validate parity | None |
| 3-4 | Cutover + decommission SQL Server | Only Node.js services affected |

**Exit criteria:** SQL Server fully decommissioned. All data in PostgreSQL/SQLite. Passwords hashed.

### Phase Summary with Dependency Safety

| Phase | What Changes | Delphi IS | Delphi DS | SQL Server | MS | Daemon | Mail | GM | News/Cache |
|-------|-------------|-----------|-----------|------------|-----|--------|------|----|------------|
| **0** | WebClient gateway only | Running | Running | Running | OK | OK | OK | OK | OK |
| **1** | Shadow IS built | Running | Running | Running | OK | OK | OK | OK | OK |
| **2** | IS cutover | **RETIRED** | Running | Running | **→Node.js IS** | OK | **→Node.js IS** | **→Node.js IS** | OK |
| **3** | DS reads in Node.js | — | Running | Running (+Node.js reads) | OK | OK | OK | OK | OK |
| **4** | DS cutover | — | **RETIRED** | Running | OK | **→Node.js DS** | OK | OK | **→Node.js DS** |
| **5** | DB migration | — | — | **RETIRED** | OK | OK | OK | OK | OK |

### Total Timeline: 14-19 weeks

| Phase | Duration | Risk | Key Prerequisite | Rollback |
|-------|----------|------|-----------------|----------|
| Phase 0 | 2 weeks | Very Low | None | Revert gateway code |
| Phase 1A (RDO TCP Server) | 2 weeks | Medium | None — new component | Delete library code |
| Phase 1B (Shadow IS) | 2-3 weeks | Low | Phase 1A | Delete shadow code |
| Phase 2 | 2 weeks | **High** | Phase 1A + 1B | Restart Delphi IS |
| Phase 3 | 2-3 weeks | Medium | Data encoding layer (14.3, 14.4, 14.5) | Revert to Delphi DS reads |
| Phase 4 | 3-4 weeks | **High** | Phase 1A + Phase 3 + session state model (14.7) | Restart Delphi DS |
| Phase 5 | 3-4 weeks | Medium | Phase 4 stable | Keep SQL Server as fallback |

---

## 16. AI Agent Implementation Guide

> Optimized for an Opus 4.6 agent tasked with implementing the migration.

### Critical Files to Read Before Starting

| Priority | File | Why |
|----------|------|-----|
| 1 | `src/server/spo_session.ts` | Current RDO commands to IS and DS |
| 2 | `src/server/server.ts` | WebSocket message handlers |
| 3 | `src/shared/rdo-types.ts` | RDO type system (NEVER modify without discussion) |
| 4 | `src/server/rdo.ts` | RDO protocol parser |
| 5 | `doc/spo-original-reference.md` | RDO method index |
| 6 | `src/shared/types/` | All WsReq/WsResp message types |

### IS Implementation Patterns

**Viewport intersection (InterfaceServer.pas:2062):**
```typescript
function viewportIntersects(client: ClientSession, x: number, y: number, dx: number, dy: number): boolean {
  return !(client.x2 < x || client.x1 > x + dx || client.y2 < y || client.y1 > y + dy);
}
```

**Focus check (InterfaceServer.pas:2084):**
```typescript
function hasFocus(client: ClientSession, objId: number): boolean {
  return client.focusedObjects.has(objId);
}
```

**Map cache (InterfaceServer.pas:276-292):**
```typescript
const MAP_CHUNK_SIZE = 64;
const cache = new Map<string, string>();
function getCacheKey(x: number, y: number): string {
  return `${Math.floor(x / MAP_CHUNK_SIZE) * MAP_CHUNK_SIZE},${Math.floor(y / MAP_CHUNK_SIZE) * MAP_CHUNK_SIZE}`;
}
```

**Push event guard (InterfaceServer.pas:2062):**
```typescript
function canPushTo(client: ClientSession): boolean {
  return client.connected && client.enableEvents && client.eventProxy !== null;
}
```

### DS Implementation Patterns

**QueryKey return format parsing:**
```typescript
// Parse: "Count=3\r\nKey0=Shamba\r\nPopulation0=15000\r\nKey1=Noho\r\n..."
function parseQueryKeyResult(text: string): Array<Record<string, string>> {
  const lines = text.split('\r\n');
  const pairs: Record<string, string> = {};
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq > 0) pairs[line.substring(0, eq)] = line.substring(eq + 1);
  }
  const count = parseInt(pairs['Count'] || '0');
  const results: Array<Record<string, string>> = [];
  for (let i = 0; i < count; i++) {
    const entry: Record<string, string> = {};
    for (const [key, value] of Object.entries(pairs)) {
      if (key.endsWith(String(i)) && key !== 'Count') {
        entry[key.slice(0, -String(i).length)] = value;
      }
    }
    results.push(entry);
  }
  return results;
}
```

**Alias normalization (DirectoryServerProtocol.pas:111-120):**
```typescript
function getAliasId(alias: string): string {
  return alias.trim().toUpperCase().replace(/ /g, '.');
}
function getUserPath(alias: string): string {
  const id = getAliasId(alias);
  return `Root/Users/${id[0]}/${id}`;
}
```

**SQL Server direct query (Phase 2+):**
```typescript
import sql from 'mssql';
const pool = new sql.ConnectionPool({
  server: DS_HOST, database: DS_DBNAME,
  user: 'FiveAdmin', password: 'awuado00',
  options: { trustServerCertificate: true }
});

async function readValue(keyPath: string, name: string): Promise<string | null> {
  const result = await pool.request()
    .input('key_path', sql.VarChar, keyPath)
    .input('value_name', sql.VarChar, name)
    .execute('proc_ReadValue');
  return result.output.value ?? null;
}
```

### Constants to Match

```typescript
// IS Constants (InterfaceServer.pas)
const IS_MAX_THREADS = 24;         // Not relevant for Node.js
const CLIENT_TIMEOUT = 2;          // Minutes
const CLIENTS_CHECK_RATE = 15_000; // ms
const DA_TIMEOUT = 10_000;         // ms — Model Server
const DS_TIMEOUT = 30_000;         // ms — Directory Server
const MAIL_TIMEOUT = 10_000;       // ms
const REFRESH_RATE = 60_000;       // ms — periodic refresh
const MAX_DA_POOL_CNX = 8;         // Model Server pool size
const MAP_CHUNK_SIZE = 64;         // Cache grid size

// DS Error Codes (DirectoryServerProtocol.pas)
const DIR_NOERROR_StillTrial = -1;
const DIR_NOERROR = 0;
const DIR_ERROR_Unknown = 1;
const DIR_ERROR_AccountAlreadyExists = 2;
const DIR_ERROR_UnexistingAccount = 3;
const DIR_ERROR_SerialMaxed = 4;
const DIR_ERROR_InvalidSerial = 5;
const DIR_ERROR_InvalidAlias = 6;
const DIR_ERROR_InvalidPassword = 7;
const DIR_ERROR_AccountBlocked = 8;
const DIR_ERROR_TrialExpired = 9;
const DIR_ERROR_SubscriberIdNotFound = 10;

// DS Value Types (DirectoryManager.pas)
const ntKey = 0;
const ntBoolean = 1;
const ntInteger = 2;
const ntFloat = 3;
const ntString = 4;
const ntDate = 5;
const ntCurrency = 6;
const ntBigString = 7;

// Account Status (DirectoryServerProtocol.pas)
const DIR_ACC_RegUser = 0;
const DIR_ACC_TrialUser = 1;
const DIR_ACC_BlockedUser = 2;
const DIR_ACC_NoAuthUserA = 3;
const DIR_ACC_NoAuthUserB = 33;

// Account Modifier Bitmask (Protocol.pas)
const AccMod_Support = 0x0001;
const AccMod_Developer = 0x0002;
const AccMod_Publisher = 0x0004;
const AccMod_Ambassador = 0x0008;
const AccMod_GameMaster = 0x0010;
const AccMod_Trial = 0x0020;
const AccMod_Newbie = 0x0040;
const AccMod_Veteran = 0x0080;
const AccMod_UnknownUser = 0x8000;

// Event Types (Protocol.pas)
enum FacilityChange { Status = 0, Structure = 1, Destruction = 2 }
enum NotificationKind { MessageBox = 0, URLFrame = 1, ChatMessage = 2, Sound = 3, GenericEvent = 4 }
enum ModelStatus { Busy = 0x01, NotBusy = 0x02, Error = 0x04 }
enum MsgCompositionState { Idle = 0, Composing = 1, AFK = 2 }
enum UserListChange { Inclusion = 0, Exclusion = 1 }
```

### Known Bugs to Replicate (or fix)

1. **CanonicalSquare bug** (InterfaceServer.pas:2477): checks `x mod 64` twice instead of `y mod 64`. Cache may miss y-axis alignment.
2. **Subscription path typo**: `Root/Subcriptions/` (missing 's') — baked into all existing data.
3. **SendTickData is dead code** — commented out everywhere. Do not implement.
4. **RDOMemberEntered/Leaved swapped** (Sessions.pas:189-213): `Entered` notifies `Leaved` and vice versa. Intentional behavior.
5. **RefCount race** (DirectoryServer.pas:1386-1398): `inc(fRefCount)` before `fLock.Enter` — race condition in Delphi, not relevant in Node.js.

### Test Strategy

**For IS migration:**
- Send same RDO commands to both Delphi IS and Node.js, compare responses
- For push events: validate routing (which clients received, which didn't)
- For cache ops: validate invalidation behavior

**For DS migration:**
- Run parallel queries against Delphi DS and Node.js implementation
- Compare QueryKey output byte-for-byte
- Test all account status branches (0, 1, 2, 3, 33)
- Verify case-insensitive password behavior (match or improve)

---

## Appendix A: Source File Index

| File | Lines | Role |
|------|-------|------|
| `Interface Server/InterfaceServer.pas` | 5,011 | IS: main logic |
| `Interface Server/Sessions.pas` | 417 | IS: session apps |
| `Interface Server/SessionInterfaces.pas` | 48 | IS: session constants |
| `Interface Server/ISMLS.pas` | 90 | IS: localization |
| `Interface Server/FIVEInterfaceServer.dpr` | 28 | IS: entry point |
| `DServer/DirectoryServer.pas` | 2,778 | DS: main logic |
| `DServer/DirectoryManager.pas` | 1,920 | DS: ADO data access |
| `DServer/DirectoryServerProtocol.pas` | 139 | DS: error codes, helpers |
| `DServer/DirectoryServer1.pas` | 1,785 | DS: alternate build (same unit) |
| `DServer/MainWindow.pas` | ~200 | DS: initialization UI |
| `Protocol/Protocol.pas` | ~230 | Shared protocol constants |
| `Rdo.IS/Server/RDOQueryServer.pas` | ~180 | RDO.IS: query dispatch |
| `Rdo.IS/Server/RDOObjectServer.pas` | ~360 | RDO.IS: RTTI dispatch |
| `Rdo.IS/Common/RDOProtocol.pas` | 56 | RDO: protocol constants |
| `Rdo.IS/Server/WinSockRDOConnectionsServer.pas` | 934 | RDO.IS: socket server |

## Appendix B: DS Security Model Summary

```
                       isSecure=false (Secure Port)   isSecure=true (Unsecure Port)
                       ─────────────────────────────   ─────────────────────────────
Read non-secure keys:  YES                            YES
Read secure keys:      NO                             YES
Write values:          NO                             YES
Delete nodes:          NO                             YES
GetKeyNames:           Returns '<nothing>'            Returns actual names
GetValueNames:         Returns '<empty>'              Returns actual names
New value security:    N/A                            Set by RDOSetSecurityLevel
```
