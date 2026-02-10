# StarPeace Mail System Analysis

Complete analysis of the Mail Server, Interface Server, Mail Browser, and Voyager client mail subsystems.

---

## 1. TMailServer Published RDO Methods

**File:** `Mail Server/MailServer.pas`

Every `published` method is remotely callable via RDO (class inherits `TRDORootServer`):

| # | Method | Parameters | Return | Line |
|---|--------|-----------|--------|------|
| 1 | `RegisterWorld` | `WorldName: widestring` | `OleVariant` (int ptr) | ~412 |
| 2 | `LogServerOn` | `WorldName: widestring` | `OleVariant` (int ptr) | ~438 |
| 3 | `LogServerOff` | `Id: integer` | `OleVariant` (bool) | ~467 |
| 4 | `NewMailAccount` | `ServerId: int; Account, Alias, FwdAddr: widestring; KeepMsg: WordBool` | `OleVariant` (int status) | ~482 |
| 5 | `DeleteAccount` | `ServerId: int; Account: widestring` | `OleVariant` (int) | ~513 |
| 6 | **`CheckNewMail`** | `ServerId: int; Account: widestring` | `OleVariant` (int count) | ~533 |
| 7 | `SetForwardRule` | `ServerId: int; Account, FwdAddr: widestring; KeepMsg: WordBool` | `OleVariant` (bool) | ~577 |
| 8 | `NewMail` | `aFrom, aTo, aSubject: widestring` | `OleVariant` (int MsgId) | ~591 |
| 9 | **`OpenMessage`** | `WorldName, Account, Folder, MessageId: widestring` | `OleVariant` (int MsgId) | ~854 |
| 10 | `DeleteMessage` | `WorldName, Account, Folder, MessageId: widestring` | void | ~872 |
| 11 | `Post` | `WorldName: widestring; Id: int` | `OleVariant` (bool) | ~755 |
| 12 | `Save` | `WorldName: widestring; Id: int` | `OleVariant` (bool) | ~828 |
| 13 | `CloseMessage` | `Id: int` | void | ~843 |
| 14 | `Spam` | `WorldName, From, Subject, Password, Msg: widestring` | void | ~607 |

### Critical Finding

**There is NO method that returns a list of messages or message IDs for a folder.**

- `CheckNewMail` only returns a **count** of unread messages. It enumerates the Inbox internally via `FindFirst`/`FindNext` (~lines 547-564) but never exposes the IDs.
- `OpenMessage` reads a single message by known ID.

### fMessages Collection

The `fMessages` field is a `TLockableCollection` (initialized ~line 366). It holds messages currently being composed or edited in memory. It is **never** enumerated externally.

- **Insert:** `NewMail` (~line 597), `OpenMessage` (~line 862)
- **Delete:** `Post` (~line 818), `CloseMessage` (~line 846), `CheckMessages` (~line 899, expiration cleanup)
- **Enumeration:** Only `CheckMessages` (private, ~line 886) iterates it for expiration.

### Other Notable Private Methods

| Method | Line | Purpose |
|--------|------|---------|
| `SendMailTo` | ~623 | Iterates recipient list, delivers to each Inbox |
| `PostMailIn` | ~723 | Creates directory + writes message files to a folder |
| `ReportMail` | ~677 | Iterates connected ISes, sends new-mail callback |
| `CheckMessages` | ~886 | Iterates fMessages, deletes expired entries |
| `SpamWorld` | ~1170 | Enumerates all accounts via FindFirst/FindNext, posts to each Inbox |

---

## 2. TMailBrowser Internals

**File:** `Mail/MailBrowserAuto.pas`

TMailBrowser is a **COM Automation object** (`TAutoObject` implementing `IMailBrowser : IDispatch`). It reads the **local filesystem ONLY** — there are zero RDO calls.

### Class Hierarchy

```
TMailBrowser (MailBrowserAuto.pas)
  -> TAutoObject (ComObj)
       -> IMailBrowser (MailBrowser_TLB.pas)
            -> IDispatch (dual interface)
```

### Interface Members

| Method/Property | Line | Behavior |
|----------------|------|----------|
| `Account: WideString` | ~48 | Read/write property |
| `Folder: WideString` | ~49 | Read/write property |
| `World: WideString` | ~51 | Read/write property |
| `Empty: WordBool` | ~50 | Read-only, checks if iterator has items |
| `Header[Name]: WideString` | ~52 | Read-only, returns `fHeaders.Values[Name]` |
| `Reset()` | ~75 | Creates `TFolderIterator` on `GetAccountPath(fWorld, fAccount) + fFolder` with `FindFirst('*.*', faDirectory)` |
| `Next(): WordBool` | ~60 | Calls `fIterator.Next` (Win32 `FindNext`), then `ReadHeaders` |
| `DeleteMessage(MsgPath): WordBool` | ~144 | Calls `RemoveFullPath()` (Win32 `SHFileOperation` FO_DELETE) |
| `FullPath(): WideString` | ~153 | Returns current iterator path |

### Internal Methods

| Method | Line | Purpose |
|--------|------|---------|
| `ReadHeaders()` | ~130 | `fHeaders.LoadFromFile(fIterator.FullPath + '\msg.header')` |
| `Initialize()` | ~124 | Override, creates `fHeaders: TStringList` |
| `Destroy()` | ~117 | Destructor, frees iterator and headers |

### Path Structure

```
[MailRoot]\Worlds\[WorldName]\[account.world.net]\[Folder]\[MessageId]\msg.header
```

- `MailRoot` from registry: `HKEY_LOCAL_MACHINE\Software\Oceanus\Five\Mail\MailRoot` (MailData.pas ~line 10)
- Account path constructed by `GetAccountPath()` (MailUtils.pas ~line 69-81)
  - Without `@`: `MailRoot + 'Worlds\' + World + '\' + Account + '.' + World + '.net\'`
  - With `@`: converts `@` to `.` then: `MailRoot + 'Worlds\' + World + '\' + converted + '\'`

### COM Registration

- **LIBID:** `{4F7EC360-AD33-11D1-A1A8-0080C817C099}` (MailBrowser_TLB.pas ~line 16)
- **Class GUID:** `{4F7EC362-AD33-11D1-A1A8-0080C817C099}` (~line 21)
- **Interface GUID:** `{4F7EC361-AD33-11D1-A1A8-0080C817C099}` (~line 35)
- `CoMailBrowser.CreateRemote(MachineName)` available (~line 88) — can be instantiated remotely
- Threading model: `tmApartment`, instance policy: `ciMultiInstance`

---

## 3. InterfaceServer Mail Methods

**File:** `Interface Server/InterfaceServer.pas` (5010 lines)

### TClientView Mail Members (only 2)

| Member | Type | Line | Purpose |
|--------|------|------|---------|
| `MailAccount` | published property (read-only) | ~141 | Returns `fUserName + '@' + fWorldName + '.net'` (impl ~672) |
| `ReportNewMail(MsgCount: int)` | procedure | ~238 | Pushes `fClientEventsProxy.NewMail(MsgCount)` to client (impl ~2280) |

### TInterfaceServer Mail Members

| Member | Visibility | Line | Purpose |
|--------|-----------|------|---------|
| `ReportNewMail(Account, From, Subject, MsgId: widestring)` | published | ~485 | Event callback FROM MailServer — routes notification to correct TClientView |
| `CountUnreadMessages(Account: widestring): int` | private | ~4345 | Proxies `fMailServer.CheckNewMail(fMailId, Account)` |
| `InitMailServer(ServerName: string; ServerPort: integer)` | public | ~4131 | Establishes RDO connection to MailServer |

### Mail Connection Fields (TInterfaceServer)

```pascal
fMailAddr   : string;                // ~line 385
fMailPort   : integer;               // ~line 386
fMailConn   : IRDOConnectionInit;    // ~line 471
fMailServer : OleVariant;            // ~line 472 (RDO proxy)
fMailId     : integer;               // ~line 473
fMailEvents : TRDOServer;            // ~line 474
```

### Mail Initialization Flow (~line 4131-4183)

1. Creates `TWinSockRDOConnection` to MailServer
2. Creates `TRDOObjectProxy`, binds to `tidRDOHook_MailServer`
3. Calls `fMailServer.LogServerOn(fWorldName)` to get `fMailId`
4. Binds to the returned server ID
5. Registers event callback object (`tidRDOHook_MailEvents`)
6. On client login (~lines 1855, 1874, 1927): calls `ReportNewMail(CountUnreadMessages(fUserName))`

### What Is NOT Present

**No methods exist on TClientView or TInterfaceServer named:** GetMail, ListMail, BrowseMail, GetInbox, GetFolder, MailList, ReadMail, or any variant. The InterfaceServer is purely a **notification relay** for mail.

### All Published Methods on TClientView (59 total)

<details>
<summary>Click to expand full list</summary>

**Viewport/Object:**
1. `SetViewedArea(x, y, dx, dy: integer)` ~line 143
2. `ObjectsInArea(x, y, dx, dy: integer): OleVariant` ~line 144
3. `ObjectAt(x, y: integer): OleVariant` ~line 145
4. `ObjectStatusText(kind: TStatusKind; Id, TycoonId: TObjId): OleVariant` ~line 146
5. `AllObjectStatusText(Id, TycoonId: TObjId): OleVariant` ~line 147
6. `ContextStatusText(x, y: integer): OleVariant` ~line 148
7. `ObjectConnections(Id: TObjId): OleVariant` ~line 149
8. `FocusObject(Id: TObjId)` ~line 150
9. `UnfocusObject(Id: TObjId)` ~line 151
10. `SwitchFocus(From: TObjId; toX, toY: integer): OleVariant` ~line 153
11. `SwitchFocusEx(From: TObjId; toX, toY: integer): OleVariant` ~line 154

**Circuit/Facility:**
12. `ConnectFacilities(Facility1, Facility2: TObjId): OleVariant` ~line 155
13. `CreateCircuitSeg(CircuitId, OwnerId, x1, y1, x2, y2, cost: integer): OleVariant` ~line 156
14. `BreakCircuitAt(CircuitId, OwnerId, x, y: integer): OleVariant` ~line 157
15. `WipeCircuit(CircuitId, OwnerId, x1, y1, x2, y2: integer): OleVariant` ~line 158
16. `SegmentsInArea(CircuitId, x1, y1, x2, y2: integer): OleVariant` ~line 159

**Zone/Surface:**
17. `GetSurface(SurfaceId: widestring; x1, y1, x2, y2: integer): OleVariant` ~line 160
18. `DefineZone(TycoonId, ZoneId, x1, y1, x2, y2: integer): OleVariant` ~line 161

**Tycoon/Company:**
19. `GetTycoonCookie(TycoonId: integer; CookieId: widestring): OleVariant` ~line 162
20. `SetTycoonCookie(TycoonId: integer; CookieId, CookieValue: widestring)` ~line 163
21. `CloneFacility(x, y, LimitToTown, LimitToCompany, TycoonId: integer)` ~line 164
22. `GetNearestTownHall(x, y: integer): OleVariant` ~line 165
23. `PickEvent(TycoonId: integer): OleVariant` ~line 166
24. `GetUserName: OleVariant` ~line 167
25. `GetCompanyList: OleVariant` ~line 168
26. `GetCompanyOwnerRole(index: integer): OleVariant` ~line 169
27. `GetCompanyName(index: integer): OleVariant` ~line 170
28. `GetCompanyCluster(index: integer): OleVariant` ~line 171
29. `GetCompanyId(index: integer): OleVariant` ~line 172
30. `GetCompanyFacilityCount(index: integer): OleVariant` ~line 173
31. `GetCompanyProfit(index: integer): OleVariant` ~line 174
32. `GetCompanyCount: OleVariant` ~line 175
33. `NewCompany(name, cluster: widestring): OleVariant` ~line 176
34. `NewFacility(FacilityId: widestring; CompanyId: integer; x, y: integer): OleVariant` ~line 177

**Chat/Communication:**
35. `SayThis(Dest, Msg: widestring)` ~line 179
36. `VoiceThis(Msg: widestring; TxId, NewTx: integer)` ~line 180
37. `VoiceRequest(RequestId: integer): OleVariant` ~line 181
38. `CancelVoiceRequest(RequestId: integer)` ~line 182
39. `VoiceTxOver(RequestId: integer)` ~line 183
40. `VoiceStatusChanged(Status: integer)` ~line 184
41. `MsgCompositionChanged(State: TMsgCompositionState)` ~line 185

**Channels:**
42. `CreateChannel(ChannelName, Password, aSessionApp, aSessionAppId: widestring; anUserLimit: integer): OleVariant` ~line 186
43. `JoinChannel(ChannelName, Password: widestring): OleVariant` ~line 187
44. `LaunchChannelSession(ChannelName: widestring): OleVariant` ~line 188
45. `Chase(UserName: widestring): OleVariant` ~line 189
46. `StopChase: OleVariant` ~line 190
47. `GetUserList: OleVariant` ~line 191
48. `GetChannelList(Root: widestring): OleVariant` ~line 192
49. `GetChannelInfo(Name: widestring): OleVariant` ~line 193

**Status/Session:**
50. `ISStatus: OleVariant` ~line 194
51. `ClientViewId: OleVariant` ~line 195
52. `ClientAware` ~line 196
53. `ClientNotAware` ~line 197
54. `SetLanguage(langid: widestring)` ~line 198

**Favorites:**
55. `RDOFavoritesNewItem(Location: widestring; Kind: integer; Name, Info: widestring): OleVariant` ~line 200
56. `RDOFavoritesDelItem(Location: widestring): OleVariant` ~line 201
57. `RDOFavoritesMoveItem(ItemLoc, Dest: widestring): OleVariant` ~line 202
58. `RDOFavoritesRenameItem(ItemLoc, Name: widestring): OleVariant` ~line 203
59. `RDOFavoritesGetSubItems(ItemLoc: widestring): OleVariant` ~line 204

**Registration:**
60. `RegisterEvents(ClientAddress: widestring; ClientPort: integer): OleVariant` ~line 218
61. `RegisterEventsById(ClientId: integer): OleVariant` ~line 219
62. `SetClientData(data: widestring)` ~line 220
63. `Logoff: OleVariant` ~line 221

**Game Master:**
64. `ConnectToGameMaster(ClientId: TCustomerId; UserInfo, GameMasters: widestring): OleVariant` ~line 260
65. `SendGMMessage(ClientId: TCustomerId; GMId: TGameMasterId; Msg: WideString): OleVariant` ~line 261
66. `DisconnectUser(ClientId: TCustomerId; GMId: TGameMasterId)` ~line 262

</details>

---

## 4. Voyager Client Mail Flow

The client does **NOT** use TMailBrowser (COM) for the inbox UI. There are no `CreateOleObject` calls for mail browsing.

### Mail List Display — HTML/ASP Based

- `Voyager/VoyagerWindow.pas` ~line 63: `tidFrameId_MailView = 'MailView'` created as an `HTMLView` frame
- The inbox message list is rendered by **server-side ASP pages** loaded from the world web server URL
- Toolbar passes `MailAccount=user@world.net` parameter (~line 390)
- Refresh via: `frame_Action=Refresh&frame_Id=MailView` (~line 334 in MsgComposerHandler.pas)

### Composing/Reading — Direct RDO to MailServer

**File:** `Voyager/URLHandlers/MsgComposerHandler.pas`

The composer connects directly to the MailServer (bypassing InterfaceServer):

```pascal
// ~line 394-401: Direct RDO socket connection
result := TWinSockRDOConnection.Create('Mail Server');
result.Server := fMailServer;    // from fClientView.getMailAddr
result.Port   := fMailPort;      // from fClientView.getMailPort

// ~line 316: Bind to mail server hook
ServerProxy.BindTo(tidRDOHook_MailServer);

// Creating mail:
Id := ServerProxy.NewMail(fAccount, DestAddr, Subject);   // ~line 317
ServerProxy.AddHeaders(fHeaders.Text);                      // ~line 322
ServerProxy.AddLine(fControl.MsgBody.Lines[i]);            // ~line 325
ServerProxy.Post(fWorldName, Id);                           // ~line 329

// Opening mail:
Id := ServerProxy.OpenMessage(fWorldName, fAccount, Folder, MessageId);  // ~line 416
fHeaders.Text := ServerProxy.GetHeaders(0);                               // ~line 419
Lines.Text := ServerProxy.GetLines(0);                                    // ~line 420
```

### Mail Server Address Source

**File:** `Voyager/URLHandlers/ServerCnxHandler.pas`

```pascal
fMailAccount := fISProxy.MailAccount;    // ~line 1075 (from InterfaceServer)
// getMailAddr, getMailPort, getMailAccount defined ~lines 2489-2502
```

### Notification Flow

**File:** `Voyager/Events.pas`
- `evnAnswerPendingMail = 19` (~line 27)
- `evnNewMail` event

**File:** `Voyager/URLHandlers/ToolbarHandler.pas` (~lines 223-229):
```pascal
evnNewMail:
  if NewMailInfo.count > 0 then
    inc(fUnreadMsgs, NewMailInfo.count);
```

**File:** `Voyager/URLHandlers/ToolbarHandlerViewer.pas` (~lines 108-113):
- `MsgMailOn: TImage` — mail LED indicator
- Shows/hides based on `fUnreadMsgs > 0`

---

## 5. Mail Storage & Synchronization

### Directory Structure

```
[MailRoot]/
  Worlds/
    [WorldName]/
      [account.world.net]/
        account.ini              <- forward rules, alias
        Inbox/
          [MessageId]/
            msg.header           <- TStringList key=value pairs
            msg.body             <- TStringList lines
            attach0.ini          <- TIniFile attachment metadata
            attach1.ini
        Sent/
          [MessageId]/...
        Draft/
          [MessageId]/...
```

### Constants (MailConsts.pas)

```pascal
tidInbox      = 'Inbox';       // ~line 49
tidSentItems  = 'Sent';        // ~line 50
tidDraft      = 'Draft';       // ~line 54
tidMessage_Header = 'msg.header';  // ~line 9
tidMessage_Body   = 'msg.body';    // ~line 10
tidAttchment_Mask = 'attach*.ini'; // ~line 11
tidAccount_File   = 'account.ini'; // ~line 8
```

### Message File Operations

| Operation | Method | File | Line |
|-----------|--------|------|------|
| Create/Save msg | `TMailMessage.Post()` | MailServer.pas | ~1054 |
| Load msg | `TMailMessage.Load()` | MailServer.pas | ~955 |
| Delete msg | `DeleteMessage()` → `RemoveFullPath()` | MailServer.pas | ~872 |
| Deliver to Inbox | `PostMailIn()` → `ForceDirectories` + `Post` | MailServer.pas | ~723 |
| Browse headers | `TMailBrowser.ReadHeaders()` → `LoadFromFile` | MailBrowserAuto.pas | ~130 |
| Delete via browser | `TMailBrowser.DeleteMessage()` → `SHFileOperation` | MailBrowserAuto.pas | ~144 |
| Load body (COM) | `TMailMessage.LoadBody()` → `LoadFromFile` | MailMessageAuto.pas | ~147 |
| Load header (COM) | `TMailMessage.LoadHeader()` → `LoadFromFile` | MailMessageAuto.pas | ~154 |
| Load attachments | `TMailMessage.LoadAttachments()` → `TFolderIterator` | MailMessageAuto.pas | ~127 |

### Synchronization: None

- **No download/sync mechanism exists.** All operations are direct filesystem I/O.
- **No UNC paths.** No `\\server\share` references found.
- **No CopyFile operations.** Messages are created directly via `ForceDirectories` + `SaveToFile`.
- **No HTTP/FTP downloads.** All I/O uses `TStringList.LoadFromFile`/`SaveToFile`.
- The MailServer process and TMailBrowser COM object must have access to the **same filesystem**.

---

## 6. Architecture Summary

```
                                    +------------------+
                                    |  World Web Server |
                                    |  (ASP pages)      |
                                    +--------+---------+
                                             |
                                             | HTML (message list)
                                             v
+----------+     RDO events      +------------------+    RDO proxy    +-------------+
|  Voyager | <------------------ | Interface Server | ------------> | Mail Server |
|  Client  |                     |  (TClientView)   |  CheckNewMail | (TMailServer)|
+----+-----+                     +------------------+  ReportNewMail +------+------+
     |                                                                      |
     | Direct RDO (compose/read)                                           |
     +-------------------------------------------->                    filesystem
                NewMail, OpenMessage,                                      |
                Post, Save, DeleteMessage,                                 v
                GetHeaders, GetLines, AddLine                    +------------------+
                                                                 | [MailRoot]\Worlds |
                                                                 |   \[account]\     |
                                                                 |     Inbox\Sent\   |
                                                                 +------------------+
                                                                         ^
                                                                         |
                                                                   filesystem
                                                                         |
                                                                 +------------------+
                                                                 | TMailBrowser COM  |
                                                                 | (unused by client)|
                                                                 +------------------+
```

### Key Architectural Points

1. **Message listing** is handled by ASP pages on the World Web Server, not by any RDO method.
2. **Message compose/read/send** uses direct RDO from client to MailServer (bypassing InterfaceServer).
3. **InterfaceServer** only relays new-mail notifications and provides the MailServer address.
4. **TMailBrowser** is a COM object for filesystem-based mail iteration but is **not used** by the Voyager client.
5. **No RDO method exists** on TMailServer to list/enumerate messages in a folder.
6. **All storage** is flat-file based in a single filesystem location.

---

## 7. The Gap: No RDO Method for Message Listing

To implement message listing via RDO (without ASP), a new published method would need to be added to TMailServer. The pattern already exists in `CheckNewMail` (~lines 533-575):

```pascal
// Existing pattern in CheckNewMail:
Path := GetAccountPath(World, Account) + tidInbox + '\';
if FindFirst(Path + '*.*', faDirectory, Search) = 0 then
  repeat
    if (Search.Name <> '.') and (Search.Name <> '..') then
    begin
      Header.LoadFromFile(Path + Search.Name + '\msg.header');
      // ... process header ...
    end;
  until FindNext(Search) <> 0;
FindClose(Search);
```

A new method like `GetMessageList(WorldName, Account, Folder: widestring): OleVariant` could reuse this enumeration but return message IDs and key header fields instead of just a count.
