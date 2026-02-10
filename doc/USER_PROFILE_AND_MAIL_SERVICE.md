# StarPeace Original — User Profile & Mail Service Documentation

> **Purpose**: This document describes the architecture, data flow, protocols, and implementation details of the **User Profile** and **Mail** systems in the original StarPeace Delphi codebase. It is intended as a reference for implementing equivalent functionality in the new web client.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Communication Protocol (RDO)](#2-communication-protocol-rdo)
3. [User Profile System](#3-user-profile-system)
   - 3.1 [Directory Server — Account & Profile Storage](#31-directory-server--account--profile-storage)
   - 3.2 [Kernel — TTycoon (In-World Player Entity)](#32-kernel--ttycoon-in-world-player-entity)
   - 3.3 [Interface Server — Profile Assembly & Session](#33-interface-server--profile-assembly--session)
   - 3.4 [Client-Side Profile Components](#34-client-side-profile-components)
   - 3.5 [Complete Logon & Profile Data Flow](#35-complete-logon--profile-data-flow)
4. [Mail Service](#4-mail-service)
   - 4.1 [Mail Server Architecture](#41-mail-server-architecture)
   - 4.2 [Mail Data Model](#42-mail-data-model)
   - 4.3 [Mail Addressing System](#43-mail-addressing-system)
   - 4.4 [Mail Server API (RDO Methods)](#44-mail-server-api-rdo-methods)
   - 4.5 [Mail Client Components (ActiveX / COM)](#45-mail-client-components-activex--com)
   - 4.6 [Mail Notification Flow](#46-mail-notification-flow)
   - 4.7 [Mail Forwarding & Attachments](#47-mail-forwarding--attachments)
   - 4.8 [Complete Mail Send/Receive Flow](#48-complete-mail-sendreceive-flow)
5. [Key Constants & Protocol Values](#5-key-constants--protocol-values)
6. [File Storage Layout](#6-file-storage-layout)
7. [Database Schema (Directory Server)](#7-database-schema-directory-server)
8. [Implementation Guide for Web Client](#8-implementation-guide-for-web-client)

---

## 1. Architecture Overview

StarPeace uses a distributed multi-server architecture. Relevant servers for Profile and Mail:

```
┌──────────────────────────────────────────────────────────┐
│                     GAME CLIENT                          │
│            (Delphi Voyager / Future Web Client)          │
└──────────┬───────────────────────────────┬───────────────┘
           │ RDO over WinSock              │
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│  INTERFACE SERVER    │◄───────►│    MAIL SERVER       │
│  (Gateway/Router)    │         │  (FIVEMailServer)    │
│                      │         └─────────────────────┘
│  - Client sessions   │
│  - Profile assembly  │         ┌─────────────────────┐
│  - Mail integration  │◄───────►│  DIRECTORY SERVER    │
│  - Event dispatch    │         │  (Account/Profile DB)│
│                      │         └─────────────────────┘
│                      │
│                      │         ┌─────────────────────┐
│                      │◄───────►│  MODEL SERVER (DA)   │
│                      │         │  (World/Tycoon Data) │
└──────────────────────┘         └─────────────────────┘
```

### Server Roles

| Server | Source File | Role |
|--------|-----------|------|
| **Interface Server** | `Interface Server/InterfaceServer.pas` | Gateway between clients and backend. Manages sessions, assembles profile data, routes mail events |
| **Directory Server** | `Directory Server/DirectoryServer.pas` | Persistent user accounts, authentication, profile metadata (NobPoints, trial status) |
| **Mail Server** | `Mail Server/MailServer.pas` | Full mail system: accounts, folders, messages, forwarding, notifications |
| **Model Server (DA)** | `Model Server/ModelServer.pas` | World simulation, TTycoon objects, in-game data (budget, rankings, companies) |

---

## 2. Communication Protocol (RDO)

All inter-server and client-server communication uses **RDO (Remote Data Objects)** over WinSock TCP connections.

### How RDO Works

1. **Connection**: Client opens a WinSock TCP connection to the server
2. **Binding**: Client creates an `RDOObjectProxy` and binds it to a named hook (e.g., `'MailServer'`)
3. **Method Calls**: Client invokes published methods on the proxy; RDO serializes calls to the server
4. **Object References**: Methods return integer pointers to server-side objects; client rebinds proxy to interact with them
5. **Events**: Server creates reverse proxies to push notifications to clients

### RDO Hooks (Named Entry Points)

```
tidRDOHook_MailServer        = 'MailServer'
tidRDOHook_MailEvents        = 'MailEvents'
tidRDOHook_DirectoryServer   = 'DirectoryServer'
tidRDOHook_InterfaceServer   = 'InterfaceServer'
tidRDOHook_InterfaceEvents   = 'InterfaceEvents'
tidRDOHook_World             = 'World'
```

### Typical Client Connection Pattern

```
1. Create WinSock connection (address + port)
2. Connect with timeout (e.g., 10000 ms)
3. Create RDOObjectProxy
4. SetConnection(connection)
5. BindTo('MailServer')         // or other hook name
6. Call published methods: proxy.NewMail(from, to, subject)
7. Rebind to returned object IDs as needed
```

---

## 3. User Profile System

User profile data is distributed across three servers, assembled by the Interface Server during logon.

### 3.1 Directory Server — Account & Profile Storage

**Source**: `Directory Server/DirectoryServer.pas`, `Directory Server/DirectoryManager.pas`

The Directory Server is a hierarchical key-value store backed by MSSQL. It stores account registration, authentication, and account-level metadata.

#### Directory Structure (Hierarchical Keys)

```
Root/
├── Users/
│   ├── A/
│   │   └── ALICE.SMITH/              ← User profile key
│   │       ├── AccountId = "SER-12345"
│   │       ├── Password  = "mypass"
│   │       ├── Alias     = "Alice Smith"
│   │       ├── AccountStatus = 1      (>0 = active)
│   │       ├── Created   = <TDateTime>
│   │       ├── TrialExpires = <TDateTime>
│   │       ├── NobPoints = 2          (max worlds)
│   │       └── AccountInfo/
│   │           └── Worlds/            (tracks joined worlds)
│   └── B/
│       └── BOB.JONES/
│           └── ...
├── Serials/
│   └── _SER-12345/                   ← Serial/license key
│       ├── FirstUsed = <TDateTime>
│       ├── LastUsed  = <TDateTime>
│       └── SerialClass = <family>
└── System/
    └── LastIdSeed = <counter>
```

#### Key User Path Construction

```
AliasId = UpperCase(Alias).Replace(' ', '.')
UserPath = 'Root/Users/' + AliasId[1] + '/' + AliasId

Example: "John Doe" → "Root/Users/J/JOHN.DOE"
```

#### Authentication API

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `RDOLogonUser` | `Alias, Password` | Status code | Validates credentials, checks trial, checks blocked status |
| `RDONewUserId` | `Alias, Password, AccountId, FamilyId` | Status code | Creates new user profile |
| `RDONewAccount` | `AccountId, FamilyId` | Status code | Creates serial/license entry |
| `RDOIsValidAlias` | `Alias` | Boolean | Validates alias format |
| `RDOGetAliasId` | `Alias` | String | Returns directory-safe alias ID |
| `RDOGetUserPath` | `Alias` | String | Returns full key path |
| `RDOCanJoinNewWorld` | `Alias` | Boolean | Checks if user has room for another world |
| `RDOGenAccountId` | `FamilyId` | String | Generates unique account/serial ID |

#### Logon Return Codes

```pascal
DIR_NOERROR_StillTrial         = -1   // Valid, trial active
DIR_NOERROR                    =  0   // Valid, full access
DIR_ERROR_Unknown              =  1
DIR_ERROR_AccountAlreadyExists =  2
DIR_ERROR_UnexistingAccount    =  3
DIR_ERROR_SerialMaxed          =  4
DIR_ERROR_InvalidSerial        =  5
DIR_ERROR_InvalidAlias         =  6
DIR_ERROR_InvalidPassword      =  7
DIR_ERROR_AccountBlocked       =  8
DIR_ERROR_TrialExpired         =  9
```

#### Alias Validation Rules

- First character must be a letter (A-Z)
- Remaining characters: `A-Z`, `0-9`, space, `-`, `_`, `:`, `?`, `!`, `(`, `)`, `[`, `]`, `<`, `>`, `+`, `=`, `&`, `@`, `#`, `$`, `%`, `^`, `|`, `;`, `,`

#### Serial Family Types

```pascal
famRegular    = 0.3737
famTester     = 0.1212
famGameMaster = 0.5555
famTutor      = 0.9191
```

#### Directory Session Management

- Each client gets a `TDirectorySession` wrapping a `TDirectoryManager`
- Sessions have TTL-based expiration (configurable)
- `KeepAlive` resets the timer on each call
- `CheckSessions(TTL)` runs periodically to clean idle sessions

### 3.2 Kernel — TTycoon (In-World Player Entity)

**Source**: `Kernel/Kernel.pas` (class definition at ~line 2357)

Once logged into a world, a player is represented by a `TTycoon` object in the simulation. This holds all in-game profile data.

#### TTycoon Class Hierarchy

```
TLockable
  └── TMoneyDealer          (budget, accounts, loans, profit)
        └── TTycoon          (player entity with all game state)
```

#### TTycoon Core Properties

| Property | Type | Description |
|----------|------|-------------|
| `Id` | `TTycoonId` (word) | Unique numeric identifier |
| `Name` | `string` | Display name |
| `RealName` | `string` | Master role name (for sub-accounts) |
| `Password` | `string` | Login password |
| `Budget` | `TMoney` | Current money balance |
| `Ranking` | `integer` | Main ranking position |
| `RankingAvg` | `integer` | Average ranking across all rankings |
| `FailureLevel` | `integer` | Bankruptcy proximity level |
| `FocusX`, `FocusY` | `integer` | Last map camera position |
| `Language` | `TLanguageId` | Preferred language code |
| `LicenceLevel` | `single` | License level (0.0–1.0) |
| `Prestige` | `TPrestige` | Overall prestige score |
| `FacPrestige` | `TPrestige` | Facility-based prestige |
| `ResearchPrest` | `TPrestige` | Research-based prestige |
| `CurrFacPrestige` | `TPrestige` | Current facility prestige |
| `ResearchCount` | `integer` | Number of researched technologies |
| `NobPoints` | `integer` | Nobility points |
| `FacCount` | `integer` | Number of owned facilities |
| `FacMax` | `integer` | Maximum allowed by level |
| `Area` | `integer` | Land tiles owned |
| `AreaTax` | `TMoney` | Land tax amount |
| `IsDemo` | `boolean` | Demo/tutorial account flag |
| `RoadBlocks` | `integer` | Road blocks placed |
| `Deleted` | `boolean` | Soft-delete flag |
| `Transcending` | `boolean` | Currently transcending |
| `WillTranscend` | `boolean` | Marked for transcendence |
| `IsRole` | `boolean` | Whether this is a sub-account/role |
| `TournamentOn` | `boolean` | Tournament mode active |

#### TTycoon Collections

| Property | Type | Description |
|----------|------|-------------|
| `Companies` | `TLockableCollection` | Owned companies |
| `Roles` | `TLockableCollection` | Sub-accounts (secondary tycoons) |
| `Rankings` | `TLockableCollection` | All ranking positions (`TRankingInfo`) |
| `Events` | `TLockableCollection` | Game events queue |
| `AutoConnections` | `TLockableCollection` | Automatic supply chains |
| `Curriculum` | `TLockableCollection` | Research/learning items |
| `Favorites` | `TFavorites` | Bookmarked locations |

#### TTycoon Relationships

```
TTycoon
  ├── SuperRole : TTycoon          (parent tycoon, if this is a role)
  ├── MasterRole : TTycoon         (root of role chain)
  ├── Companies[] : TCompany       (owned businesses)
  ├── Roles[] : TTycoon            (sub-accounts)
  ├── Level : TTycoonLevel         (current advancement tier)
  ├── Votes : TVoteSystem          (election participation)
  ├── Policy[Tycoon] : TPolicyStatus  (diplomatic stance)
  ├── WorldLocator : IWorldLocator (world interface)
  └── MailServer : IMailServer     (notification interface)
```

#### TTycoon Level System

```pascal
TTycoonLevel properties:
  Name             : string        // Level name (e.g., "Apprentice")
  Tier             : integer       // Numeric tier (0 = lowest)
  FacLimit         : integer       // Max facilities at this level
  Fee              : currency      // Upgrade fee
  HourIncome       : currency      // Hourly income at this level
  MoneyBackOnDemolish : single     // % returned on demolish
  PercOfResearchSubs  : single     // Research subsidy %
  PrestigeBoost    : integer       // Prestige multiplier
  NextLevel        : TTycoonLevel  // Advancement target
```

#### Key TTycoon RDO Methods (Published)

| Method | Description |
|--------|-------------|
| `RDOGetBudget` | Returns current money balance |
| `RDOAskLoan(Amount)` | Request a bank loan |
| `RDOPayLoan(Amount)` | Repay loan amount |
| `RDOSendMoney(ToTycoon, Reason, Amount)` | Transfer money to another tycoon |
| `RDOSetCookie(Name, Value)` | Store persistent key-value pair |
| `RDOSetPolicyStatus(ToTycoon, Status)` | Set diplomatic policy |
| `RDOSetAdvanceToNextLevel(yes)` | Request level advancement |
| `RDOActivateTutorial(Value)` | Toggle tutorial |
| `RDOFavoritesNewItem(...)` | Add bookmark |
| `RDOFavoritesDelItem(Location)` | Remove bookmark |
| `RDOAddAutoConnection(FluidId, Suppliers)` | Add auto supply chain |
| `RDODelAutoConnection(FluidId, Suppliers)` | Remove auto supply chain |
| `RDODelCurItem(index)` | Delete curriculum item |

#### TTycoon Cache Key

```pascal
function GetCacheName : string;
  result := 'Ty' + IntToStr(fId);
  // Example: 'Ty42'
```

### 3.3 Interface Server — Profile Assembly & Session

**Source**: `Interface Server/InterfaceServer.pas`

The Interface Server is the central gateway. It assembles profile data from multiple sources during logon.

#### TClientView (Per-User Session Object)

```pascal
TClientView fields:
  fUserName         : widestring      // Login alias
  fPassword         : string          // Password (for re-validation)
  fRealName         : string          // Master role name (from tycoon)
  fTycoonId         : integer         // Tycoon ID in world simulation
  fTycoonProxyId    : integer         // RDO proxy reference to tycoon
  fTycoonProxy      : OleVariant      // RDO proxy object to tycoon
  fAccountDesc      : integer         // Composed account descriptor
  fLangId           : string          // Language preference
  fId               : integer         // Internal IS client ID
  fIPAddr           : string          // Client IP address
  fEnterDate        : TDateTime       // Login timestamp
  fAFK              : boolean         // Away From Keyboard status
  fLongChatLines    : integer         // Chat line preference
  fConnected        : boolean         // Connection status
  fEnableEvents     : boolean         // Event dispatch enabled
  fClientEventsProxy: OleVariant      // Reverse proxy for pushing events to client
```

#### Mail Account Derivation

```pascal
function TClientView.GetMailAccount : string;
  result := fUserName + '@' + fServer.WorldName + '.net';
  // Example: 'JohnDoe@StarWorld.net'
```

#### Account Descriptor

The `fAccountDesc` integer is composed from two Directory Server values:
- **NobPoints**: Maximum number of worlds the account can join
- **AccModifier**: Account modifier flags

Retrieved from: `Root/Users/[FirstLetter]/[AliasId]/NobPoints` and `AccModifier`

### 3.4 Client-Side Profile Components

**Source**: `Voyager/` directory

| File | Purpose |
|------|---------|
| `Privacy.pas` | `IPrivacyHandler` interface: IgnoreUser, ClearIgnoredUser, UserIsIgnored, DefaultChannelData |
| `TycoonPictureDialog.pas` | Dialog for selecting tycoon avatar picture (3 buttons + image display) |
| `Tasks/YourProfile.pas` | `TYourProfileTask` — task for displaying profile info, extends `TInformativeTask` with `StoreToCache` |

#### IPrivacyHandler Interface

```pascal
IPrivacyHandler = interface
  procedure IgnoreUser(username : string);
  procedure ClearIgnoredUser(username : string);
  function  UserIsIgnored(username : string) : boolean;
  procedure GetDefaultChannelData(out name, password : string);
  procedure SetDefaultChannelData(name, password : string);
end;
```

### 3.5 Complete Logon & Profile Data Flow

```
CLIENT                    INTERFACE SERVER              BACKEND SERVERS
  │                             │                             │
  │ RDOLogon(User, Pass)        │                             │
  │────────────────────────────►│                             │
  │                             │                             │
  │                             │  1. CheckUserAccount        │
  │                             │  ──────────────────────────►│ DIRECTORY SERVER
  │                             │  RDOLogonUser(User, Pass)   │
  │                             │  ◄──────────────────────────│ Returns: DIR_NOERROR
  │                             │                             │
  │                             │  2. Get Tycoon Proxy        │
  │                             │  ──────────────────────────►│ MODEL SERVER (DA)
  │                             │  RDOGetTycoon(User, Pass)   │
  │                             │  ◄──────────────────────────│ Returns: TycoonProxyId
  │                             │                             │
  │                             │  3. Read Tycoon Data        │
  │                             │  ──────────────────────────►│ MODEL SERVER (DA)
  │                             │  .Id, .RealName, .Language  │
  │                             │  .FailureLevel, .Budget     │
  │                             │  ◄──────────────────────────│ Returns: values
  │                             │                             │
  │                             │  4. Read Account Metadata   │
  │                             │  ──────────────────────────►│ DIRECTORY SERVER
  │                             │  SetCurrentKey(UserPath)    │
  │                             │  ReadInteger('NobPoints')   │
  │                             │  ReadInteger('AccModifier') │
  │                             │  ◄──────────────────────────│ Returns: values
  │                             │                             │
  │                             │  5. Create TClientView      │
  │                             │  (assembles all data)       │
  │                             │                             │
  │                             │  6. Count Unread Mail       │
  │                             │  ──────────────────────────►│ MAIL SERVER
  │                             │  CheckNewMail(MailId, User) │
  │                             │  ◄──────────────────────────│ Returns: count
  │                             │                             │
  │ InitClient(Date, Money,     │                             │
  │   FailureLevel, ProxyId)    │                             │
  │◄────────────────────────────│                             │
  │                             │                             │
  │ NewMail(unreadCount)        │                             │
  │◄────────────────────────────│                             │
  │                             │                             │
  │ NotifyUserListChange()      │                             │
  │◄────────────────────────────│  (broadcast to all clients) │
```

---

## 4. Mail Service

### 4.1 Mail Server Architecture

**Source**: `Mail Server/MailServer.pas`

The Mail Server is a standalone process (`FIVEMailServer.dpr`) managing mail for all game worlds.

#### Key Classes

```
TMailServer (extends TRDORootServer)
  ├── fWorlds : TLockableCollection of TWorldData
  ├── fWorldGarbage : TLockableCollection (disconnected worlds)
  ├── fMessages : TLockableCollection of TMailMessage (in-memory messages)
  └── fMsgTimeOut : TDateTime (15 minutes)

TWorldData
  ├── fWorldName : string (uppercase)
  ├── fConnection : IRDOConnection (to Model Server)
  ├── fIntServers : TLockableCollection of TInterfaceServerData
  └── fDate : TDateTime (in-game date)

TInterfaceServerData
  ├── fOwner : TWorldData
  ├── fEventsProxy : OleVariant (reverse proxy for mail notifications)
  └── fConnection : IRDOConnection (to Interface Server)

TMailMessage
  ├── fHeaders : TStringList (key=value pairs)
  ├── fBody : TStringList (message lines)
  ├── fAttachs : TCollection of TAttachment
  └── fLastUpdate : TDateTime (for expiration)
```

#### Thread Safety

- All collections are `TLockableCollection` with explicit Lock/Unlock
- `TInterfaceServerData` and `TWorldData` each have `TCriticalSection` locks
- Maximum query threads: `MaxMailQueryThreads = 5`

### 4.2 Mail Data Model

#### Message Structure

A message consists of three components stored as separate files:

**Headers** (`msg.header`):
```ini
[Header]
FromAddr=alice@starworld.net
ToAddr=bob@starworld.net
From=Alice Smith
To=Bob Jones
Subject=Hello World
MessageId=ZZZABCD1
Date=38718.5
DateFmt=03/15/2006
Read=0
Stamp=42
NoReply=0
```

**Body** (`msg.body`):
```
This is the first line of the message.
This is the second line.
```

**Attachments** (`attach0.ini`, `attach1.ini`, ...):
```ini
[Properties]
Class=MoneyTransfer
Amount=50000
Executed=Yes
```

#### Header Fields

| Field | Key | Description |
|-------|-----|-------------|
| From Address | `FromAddr` | Sender's mail address (e.g., `alice@starworld.net`) |
| To Address | `ToAddr` | Recipient address(es), semicolon-separated |
| From Name | `From` | Sender's display name (resolved from alias) |
| To Name | `To` | Recipient display name(s) |
| Subject | `Subject` | Message subject line |
| Message ID | `MessageId` | Unique ID generated from timestamp (`GenMessageId`) |
| Date | `Date` | In-game date as float |
| Date Formatted | `DateFmt` | Human-readable date string |
| Read Status | `Read` | `0` = unread, `1` = read |
| Stamp | `Stamp` | Random 0-99 value (visual variety) |
| No Reply | `NoReply` | `1` = system message, no reply allowed |

### 4.3 Mail Addressing System

#### Address Format

```
<account>@<domain>
```

Where domain is one of:
- `tycoons` — Player accounts
- `companies` — Company accounts
- `towns` — Town government accounts
- `clusters` — Cluster accounts

Full address examples:
```
johndoe@starworld.net       (tycoon in world "starworld")
acmecorp@companies          (company account)
springfield@towns           (town account)
```

#### Address Validation

Invalid characters for mail addresses:
```
\ / : * ? " < > |
```

#### Account Path Resolution

```pascal
function GetAccountPath(World, Account : string) : string;
  // If no '@' in account:
  //   MailRoot + 'Worlds\' + World + '\' + Account + '.' + World + '.net\'
  // If '@' in account:
  //   Replace '@' with '.', then:
  //   MailRoot + 'Worlds\' + World + '\' + TranslatedAccount + '\'
```

Example:
```
GetAccountPath('StarWorld', 'alice')
→ 'C:\Mail\Worlds\StarWorld\alice.StarWorld.net\'

GetAccountPath('StarWorld', 'alice@StarWorld.net')
→ 'C:\Mail\Worlds\StarWorld\alice.StarWorld.net\'
```

#### Mail Root Configuration

The mail root directory is stored in Windows Registry:
```
HKEY_LOCAL_MACHINE\Software\Oceanus\Five\Mail\MailRoot
```

### 4.4 Mail Server API (RDO Methods)

#### World/Server Registration

| Method | Called By | Description |
|--------|----------|-------------|
| `RegisterWorld(WorldName)` | Model Server | Register a game world, returns `TWorldData` reference |
| `LogServerOn(WorldName)` | Interface Server | Register an IS connection, returns `TInterfaceServerData` ref |
| `LogServerOff(Id)` | Interface Server | Disconnect an IS or World |

#### Account Management (Called by Interface Server)

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `NewMailAccount` | `ServerId, Account, Alias, FwdAddr, KeepMsg` | Status code | Create mail account directory |
| `DeleteAccount` | `ServerId, Account` | Status code | Delete mail account |
| `CheckNewMail` | `ServerId, Account` | Integer (count) | Count unread messages in Inbox |
| `SetForwardRule` | `ServerId, Account, FwdAddr, KeepMsg` | Boolean | Set mail forwarding |

Account creation status codes:
```pascal
CREATE_ACCOUNT_FAILED = -2
INVALID_ACCOUNT       = -1
ACCOUNT_CREATED       =  0
ACCOUNT_DELETED       =  1
```

#### Message Operations (Called by Clients)

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `NewMail` | `aFrom, aTo, aSubject` | Integer (msg ID) | Create new in-memory message |
| `OpenMessage` | `WorldName, Account, Folder, MessageId` | Integer (msg ID) | Load message from disk |
| `DeleteMessage` | `WorldName, Account, Folder, MessageId` | void | Delete message from disk |
| `Post` | `WorldName, MsgId` | Boolean | Send message to recipients |
| `Save` | `WorldName, MsgId` | Boolean | Save message to Drafts |
| `CloseMessage` | `MsgId` | void | Release in-memory message |

#### Message Object Methods (After binding to message ID)

| Method | Parameters | Description |
|--------|-----------|-------------|
| `AddLine` | `line` | Append line to message body |
| `AddHeaders` | `headers` | Append custom headers |
| `AttachObject` | `info` | Add attachment (key=value properties) |
| `GetHeaders` | `void (0)` | Returns all headers as text |
| `GetLines` | `void (0)` | Returns full body as text |
| `GetAttachmentCount` | `void (0)` | Returns number of attachments |
| `GetAttachment` | `index` | Returns attachment properties as text |
| `KeepAlive` | — | Reset expiration timer |

### 4.5 Mail Client Components (ActiveX / COM)

The original client uses two COM/ActiveX components for mail UI:

#### TMailBrowser (IMailBrowser) — Folder Browser

**Source**: `Mail/MailBrowserAuto.pas`

Iterates through messages in a mail folder.

| Property/Method | Description |
|----------------|-------------|
| `World` | Get/set world name |
| `Account` | Get/set account name |
| `Folder` | Get/set folder name (`Inbox`, `Sent`, `Draft`) |
| `Reset` | Begin iteration (creates folder iterator) |
| `Next` | Move to next message |
| `Empty` | Check if folder is empty |
| `Header[Name]` | Read header value from current message |
| `FullPath` | Get full filesystem path of current folder |
| `DeleteMessage(MsgPath)` | Delete a message by path |

**Usage Pattern**:
```
Browser.World   := 'StarWorld';
Browser.Account := 'alice@starworld.net';
Browser.Folder  := 'Inbox';
Browser.Reset;
if not Browser.Empty then
  repeat
    from    := Browser.Header['From'];
    subject := Browser.Header['Subject'];
    read    := Browser.Header['Read'];
    msgId   := Browser.Header['MessageId'];
    // display in list...
  until not Browser.Next;
```

#### TFiveMessage (IFiveMessage) — Message Viewer

**Source**: `Mail/MailMessageAuto.pas`

Opens and reads a specific message.

| Property/Method | Description |
|----------------|-------------|
| `SetMessage(World, Account, Folder, MessageId)` | Select message to read |
| `Header[Name]` | Read header field (auto-marks as read) |
| `LineCount` | Number of body lines |
| `Lines[index]` | Get specific body line |
| `AttachmentCount` | Number of attachments |
| `CurrentAttachment` | Get/set current attachment index |
| `Attachment[prop]` | Get attachment property value |
| `Delete` | Delete this message |

**Important**: When `LoadHeader` is called, it automatically sets `Read=1` and saves the header file, marking the message as read.

### 4.6 Mail Notification Flow

When a new message is delivered, the Mail Server notifies the Interface Server, which notifies the client.

```
MAIL SERVER                      INTERFACE SERVER              CLIENT
     │                                  │                        │
     │  1. PostMailIn (save to Inbox)   │                        │
     │  2. ReportMail(World, Account,   │                        │
     │     From, Subject, MsgId)        │                        │
     │─────────────────────────────────►│                        │
     │  (via fEventsProxy.ReportNewMail)│                        │
     │                                  │                        │
     │                                  │  3. Find client by     │
     │                                  │     account name       │
     │                                  │                        │
     │                                  │  4. HearThis(msg)      │
     │                                  │  5. ReportNewMail(1)   │
     │                                  │───────────────────────►│
     │                                  │  (fClientEventsProxy   │
     │                                  │   .NewMail(count))     │
     │                                  │                        │
     │                                  │                        │  6. Client updates
     │                                  │                        │     mail icon/badge
```

### 4.7 Mail Forwarding & Attachments

#### Forwarding Rules

Each account has an `account.ini` file:
```ini
[Forward]
Address=bob@starworld.net
Keep=true

[General]
Alias=Alice Smith
```

When mail arrives for an account with forwarding:
1. If `KeepMsg = true`: deliver to original inbox AND add forward address to delivery list
2. If `KeepMsg = false`: only deliver to forward address (skip original inbox)

#### Attachment System

**Source**: `Mail/Attachments.pas`

Attachments are typed objects with key-value properties:

```pascal
TAttachment = class
  Kind : string              // From 'Class' property
  Properties : TStringList   // Key=Value pairs

  // Stored as: attach0.ini, attach1.ini, etc.
  // Format:
  // [Properties]
  // Class=MoneyTransfer
  // Amount=50000
  // Executed=Yes
```

Attachments can be **executed** when delivered (server-side):
- `TAttachmentExecuter` subclasses handle specific attachment types
- Execution results: `erOk`, `erError`, `erDelete`, `erIgnoredAttachment`
- The `Executed` property tracks whether the attachment was processed

### 4.8 Complete Mail Send/Receive Flow

#### Sending a Message

```
CLIENT                          MAIL SERVER
  │                                │
  │  1. NewMail(from, to, subject) │
  │───────────────────────────────►│  Creates TMailMessage in memory
  │  ◄ returns MsgId (pointer)     │
  │                                │
  │  2. BindTo(MsgId)              │
  │───────────────────────────────►│
  │                                │
  │  3. AddLine("Hello World")     │
  │───────────────────────────────►│  Appends to fBody
  │                                │
  │  4. AddLine("Second line")     │
  │───────────────────────────────►│  Appends to fBody
  │                                │
  │  5. AttachObject("Class=Gift") │
  │───────────────────────────────►│  Creates TAttachment
  │                                │
  │  6. BindTo('MailServer')       │
  │───────────────────────────────►│
  │                                │
  │  7. Post(WorldName, MsgId)     │
  │───────────────────────────────►│
  │                                │  a. Parse To addresses (;-separated)
  │                                │  b. Validate each address
  │                                │  c. Resolve display names
  │                                │  d. Set Date header from world time
  │                                │  e. For each recipient:
  │                                │     - Check forwarding rules
  │                                │     - PostMailIn(recipientPath, 'Inbox', msg)
  │                                │       → ForceDirectories
  │                                │       → Save msg.header, msg.body, attach*.ini
  │                                │       → Execute attachments if enabled
  │                                │     - ReportMail(world, account, from, subject)
  │                                │       → Notify all Interface Servers
  │                                │  f. PostMailIn(senderPath, 'Sent', msg)
  │                                │     → Save copy to sender's Sent folder
  │  ◄ returns true/false          │
```

#### Opening/Reading a Message

```
CLIENT                          MAIL SERVER / COM OBJECTS
  │                                │
  │  Via COM (TMailBrowser):       │
  │  Browser.World := 'StarWorld'  │
  │  Browser.Account := 'user@..'  │
  │  Browser.Folder := 'Inbox'     │
  │  Browser.Reset                 │  Iterates message subdirectories
  │                                │  Reads msg.header for each message
  │  Browser.Header['From']        │  Returns header value
  │  Browser.Header['Subject']     │
  │  Browser.Header['Read']        │  '0' = unread, '1' = read
  │  Browser.Next                  │  Moves to next message directory
  │                                │
  │  Via COM (TFiveMessage):       │
  │  Msg.SetMessage(w, a, f, id)   │  Loads message from disk
  │  Msg.Header['Subject']         │  Returns header; marks Read=1
  │  Msg.Lines[0]                  │  Returns first line of body
  │  Msg.AttachmentCount           │  Returns attachment count
  │                                │
  │  OR via RDO (direct server):   │
  │  OpenMessage(World, Acct,      │
  │    Folder, MessageId)          │  Loads into server memory
  │  ◄ returns MsgId               │
  │  BindTo(MsgId)                 │
  │  GetHeaders(0)                 │  Returns all headers as text
  │  GetLines(0)                   │  Returns body as text
  │  GetAttachmentCount(0)         │
  │  GetAttachment(idx)            │  Returns attachment props
  │  BindTo('MailServer')          │
  │  CloseMessage(MsgId)           │  Release from memory
```

---

## 5. Key Constants & Protocol Values

### Mail Folders

```pascal
tidInbox     = 'Inbox'
tidSentItems = 'Sent'
tidDraft     = 'Draft'
```

### Mail Domains

```pascal
tidTycoons   = 'tycoons'
tidCompanies = 'companies'
tidTowns     = 'towns'
tidCluster   = 'clusters'
```

### Mail File Names

```pascal
tidAccount_File   = 'account.ini'
tidMessage_Header = 'msg.header'
tidMessage_Body   = 'msg.body'
tidAttchment_Mask = 'attach*.ini'
```

### Directory Node Types

```pascal
ntKey       = 0   // Directory/folder node
ntBoolean   = 1
ntInteger   = 2
ntFloat     = 3
ntString    = 4
ntDate      = 5
ntCurrency  = 6
ntBigString = 7   // Large text (> 250 chars)
```

### Server Timeouts

```pascal
MaxMailQueryThreads  = 5
DAConnectionTimeOut  = 10000   // 10 seconds
MailConnectionTimeOut = 10000  // 10 seconds
MessageTimeOut       = 15 min  // In-memory message expiration
```

---

## 6. File Storage Layout

### Mail Storage on Disk

```
<MailRoot>/
└── Worlds/
    └── <WorldName>/
        └── <account.domain>/           ← e.g., alice.StarWorld.net/
            ├── account.ini             ← Account settings (forwarding, alias)
            ├── Inbox/
            │   ├── <MessageId1>/       ← Unique message directory
            │   │   ├── msg.header      ← Key=value headers
            │   │   ├── msg.body        ← Plain text body
            │   │   ├── attach0.ini     ← First attachment properties
            │   │   └── attach1.ini     ← Second attachment (if any)
            │   └── <MessageId2>/
            │       └── ...
            ├── Sent/
            │   └── <MessageId>/
            │       └── ...
            └── Draft/
                └── <MessageId>/
                    └── ...
```

### account.ini Format

```ini
[Forward]
Address=recipient@world.net
Keep=true

[General]
Alias=Display Name
```

### Message ID Generation

```pascal
function GenMessageId(Date : TDateTime) : string;
  result := DateTimeToAbc(MaxDate - Date) + IntToAbc(random(25), 1);
  // Produces sortable alphabetic string from date
  // Newer messages sort first (uses date complement)
```

---

## 7. Database Schema (Directory Server)

The Directory Server uses a single MSSQL table with this structure:

| Column | Type | Description |
|--------|------|-------------|
| `ID` | `integer` (auto) | Primary key |
| `Entry` | `string` | Full path (e.g., `Root/Users/J/JOHN.DOE/Password`) |
| `ParentID` | `integer` | FK to parent key's ID (0 = root level) |
| `Kind` | `integer` | Node type (0=key, 1=boolean, 2=integer, etc.) |
| `Value` | `text` | Stored value (as string) |
| `Security` | `boolean` | Whether this key is access-restricted |
| `ValueSize` | `integer` | Size for BigString values |

The `Entry` column contains forward-slash-separated paths, forming a virtual hierarchical namespace in a flat table. All queries use `LIKE` matching on these paths.

---

## 8. Implementation Guide for Web Client

### User Profile Implementation

#### What to Implement

1. **Login/Authentication**:
   - Send credentials to server → validate via Directory Server
   - Receive tycoon proxy reference from Model Server
   - Receive initial profile data (budget, ranking, level, etc.)

2. **Profile Display Panel** should show:
   - Tycoon name and avatar
   - Current level and tier
   - Budget / net worth
   - Ranking position
   - Prestige scores (overall, facility, research)
   - Facility count vs. maximum
   - Land area owned
   - Company list
   - Nobility points

3. **Profile Actions**:
   - Change language preference
   - Toggle tutorial
   - Manage favorites/bookmarks
   - Set auto-connections
   - Set diplomatic policies toward other tycoons
   - Level advancement request
   - Cookie storage for preferences

4. **Privacy Features**:
   - Ignore/unignore users
   - Default chat channel settings

#### API Endpoints to Expose (REST/WebSocket)

```
POST /api/auth/login         → { username, password } → { session, profile }
GET  /api/profile            → Full profile data
GET  /api/profile/rankings   → All ranking positions
GET  /api/profile/companies  → Company list
PUT  /api/profile/language   → Update language
PUT  /api/profile/policy     → Set policy toward tycoon
POST /api/profile/level-up   → Request level advancement
PUT  /api/profile/cookie     → Set persistent preference
```

### Mail Implementation

#### What to Implement

1. **Mail Folders**: Inbox, Sent, Drafts (three standard folders)
2. **Message List**: Browse messages in a folder with headers (From, Subject, Date, Read status)
3. **Message View**: Display full message (headers + body + attachments)
4. **Compose**: Create new message with To, Subject, Body, optional attachments
5. **Actions**: Send, Save Draft, Delete, Reply
6. **Notifications**: Real-time "new mail" badge/indicator via WebSocket events
7. **Forwarding**: Account-level mail forwarding rules

#### API Endpoints to Expose (REST/WebSocket)

```
GET    /api/mail/folders                    → ['Inbox', 'Sent', 'Draft']
GET    /api/mail/{folder}                   → Message list (headers only)
GET    /api/mail/{folder}/{messageId}       → Full message
POST   /api/mail/compose                    → Create new draft
POST   /api/mail/send                       → Send message
PUT    /api/mail/{folder}/{messageId}/read  → Mark as read
DELETE /api/mail/{folder}/{messageId}       → Delete message
GET    /api/mail/unread-count               → Unread message count
PUT    /api/mail/forwarding                 → Set forwarding rule

WebSocket event: 'new-mail' → { from, subject, messageId }
```

#### Address Validation for Web Client

```javascript
const INVALID_CHARS = /[\\/:*?"<>|]/;

function isValidMailAddress(addr) {
  return addr.length > 0 && !INVALID_CHARS.test(addr);
}

function extractAccount(addr) {
  const atIdx = addr.indexOf('@');
  return atIdx > 0 ? addr.substring(0, atIdx) : addr;
}

function buildMailAddress(username, worldName) {
  return `${username}@${worldName}.net`;
}
```

#### Message Data Structure (JSON)

```json
{
  "messageId": "ZZZABCD1",
  "fromAddr": "alice@starworld.net",
  "toAddr": "bob@starworld.net",
  "from": "Alice Smith",
  "to": "Bob Jones",
  "subject": "Hello World",
  "date": "2006-03-15T12:00:00",
  "dateFmt": "03/15/2006",
  "read": false,
  "stamp": 42,
  "noReply": false,
  "body": [
    "First line of message.",
    "Second line of message."
  ],
  "attachments": [
    {
      "class": "MoneyTransfer",
      "amount": "50000",
      "executed": true
    }
  ]
}
```

#### Key Implementation Notes

1. **Message IDs** are generated from a date-complement formula producing sortable alphabetic strings — newer messages sort first. For the web client, consider UUIDs or timestamp-based IDs.

2. **Read status** is tracked per-message in the header file. Opening a message automatically marks it as read.

3. **Multiple recipients** are supported via semicolon-separated addresses in the `ToAddr` field.

4. **Forwarding** is recursive — if A forwards to B and B forwards to C, the message reaches C. The `KeepMsg` flag controls whether intermediaries keep copies.

5. **Attachments are executable** — they can trigger server-side actions (e.g., money transfers). The web client should handle attachment types:
   - Display-only attachments (informational)
   - Action attachments (require server processing)

6. **Spam/broadcast** functionality exists for admin messages to all accounts in a world. This is password-protected.

7. **In-memory messages expire** after 15 minutes of inactivity. The `KeepAlive` method resets the timer. For the web client, implement similar timeout or use persistent storage.

8. **Mail notifications** are push events — the server notifies the client when new mail arrives. Implement via WebSocket for the web client.

---

## Source File Reference

| File | Location | Purpose |
|------|----------|---------|
| `MailServer.pas` | `Mail Server/` | Mail server core (TMailServer, TMailMessage, TWorldData) |
| `MailProtocol.pas` | `Mail/` | RDO hook name constants |
| `MailServerInterfaces.pas` | `Mail/` | IMailServer interface definition |
| `MailConsts.pas` | `Mail/` | All mail constants (folders, headers, domains) |
| `MailUtils.pas` | `Mail/` | Address validation, path building, message ID generation |
| `MailData.pas` | `Mail/` | Mail root directory configuration (Windows Registry) |
| `Attachments.pas` | `Mail/` | Attachment model and execution framework |
| `MailBrowserAuto.pas` | `Mail/` | COM browser component for folder iteration |
| `MailMessageAuto.pas` | `Mail/` | COM message component for reading messages |
| `MailForm.pas` | `Tests/` | Test client demonstrating full send/receive flow |
| `DirectoryServer.pas` | `Directory Server/` | Account/profile server (auth, metadata) |
| `DirectoryServerProtocol.pas` | `Directory Server/` | Error codes and serial family types |
| `DirectoryManager.pas` | `Directory Server/` | Hierarchical key-value store (MSSQL-backed) |
| `InterfaceServer.pas` | `Interface Server/` | Gateway server, profile assembly, mail integration |
| `Sessions.pas` | `Interface Server/` | Session and member management |
| `SessionInterfaces.pas` | `Interface Server/` | Session RDO interface |
| `Kernel.pas` | `Kernel/` | TTycoon class (in-world player entity) |
| `Accounts.pas` | `Kernel/` | Financial account hierarchy |
| `BasicAccounts.pas` | `Kernel/` | Standard account type definitions |
| `LoggedUserData.pas` | `Kernel/` | Thread-level user data storage |
| `YourProfile.pas` | `Tasks/` | Profile task (cache integration) |
| `Privacy.pas` | `Voyager/` | Privacy/ignore interface |
| `TycoonPictureDialog.pas` | `Voyager/` | Avatar selection dialog |
