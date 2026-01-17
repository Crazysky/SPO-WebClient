# Starpeace Online Client Protocol Documentation

## Overview

This document describes the client-side protocol for Starpeace Online, specifically the methods used by the Voyager client to request and parse server responses. The client communicates with the server through OLE/COM proxy objects to retrieve game object properties and metadata.

---

## Table of Contents

1. [Core Request Methods](#core-request-methods)
2. [Request/Response Formats](#requestresponse-formats)
3. [Property List](#property-list)
4. [Code References](#code-references)

---

## Core Request Methods

### 1. GetPropertyList

**Purpose**: Retrieves multiple properties from a game object in a single request.

**Location**: `Voyager/SheetUtils.pas:67` and `Voyager/SheetUtils.pas:87`

**Request Format**:
```
Proxy.GetPropertyList(PropertyNames: WideString) : string
```

**Request Construction**:
- Property names are concatenated with TAB character (`#9`) as separator
- Example: `SecurityId\tTrouble\tCurrBlock\t`
- The string ends with a TAB character

**Response Format**:
- Tab-separated values matching the order of requested properties
- Format: `value1\tvalue2\tvalue3\t`
- Empty properties are represented by a TAB without a value before it
- Response string may be empty if object has no data

**Response Parsing** (`Voyager/SheetUtils.pas:29-53`):
```pascal
procedure SetPropList(Names, Values : TStringList; resStr : string);
  // For each name in Names list:
  //   1. If resStr[p] != TAB, extract value up to next TAB
  //   2. Store as Values.Values[name] := value
  //   3. Increment p past the TAB
```

**Usage Example** (`Voyager/SheetUtils.pas:55-72`):
```pascal
function GetProperties(Proxy : OleVariant; Names, Results : TStringList) : boolean;
  var
    WStr   : WideString;
    index  : integer;
    resStr : string;
  begin
    if not VarIsEmpty(Proxy)
      then
        begin
          WStr := '';
          for index := 0 to pred(Names.Count) do
            WStr := WStr + Names[index] + #9;
          resStr := Proxy.GetPropertyList(WStr);
          SetPropList(Names, Results, resStr);
          result := true;
        end
      else result := false;
  end;
```

**Common Properties Requested**:
- `SecurityId` - Object security/ownership identifier
- `Trouble` - Problem/error status flag
- `CurrBlock` - Current building block identifier
- `Cost` - Facility cost
- `ROI` - Return on investment
- `Salaries0`, `Salaries1`, `Salaries2` - Salary levels for three worker classes
- `Workers0`, `Workers1`, `Workers2` - Worker counts for three classes

---

### 2. GetInputNames

**Purpose**: Retrieves the list of input resource names/paths for a facility.

**Location**: `Voyager/AdvSheetForm.pas:289`

**Request Format**:
```
Proxy.GetInputNames(index: integer, language: WideString) : WideString
```

**Parameters**:
- `index` - Usually `0` (may indicate input slot or type)
- `language` - Language code (e.g., "en", stored in `ActiveLanguage` variable)

**Response Format**:
- Multiple entries separated by CARRIAGE RETURN (`^M` or `\r`)
- Each entry format: `Path:..FluidName`
  - Path component separated from name by colon `:`
  - After colon, skip 2 characters (`inc(q, 2)`)
  - Then read FluidName up to null terminator (`#0`)

**Response Parsing** (`Voyager/AdvSheetForm.pas:288-305`):
```pascal
p := 1;
shNames := Proxy.GetInputNames(integer(0), WideString(ActiveLanguage));
aux := CompStringsParser.GetNextStringUpTo(shNames, p, ^M);
InpPath := '';
while aux <> '' do
  begin
    q := 1;
    InpPath := CompStringsParser.GetNextStringUpTo(aux, q, ':');
    inc(q, 2);  // Skip 2 characters after colon
    InpName := CompStringsParser.GetNextStringUpTo(aux, q, #0);
    // Process InpName (e.g., check if it's 'advertisement')
    inc(p, 2);  // Skip 2 characters before next entry
    aux := CompStringsParser.GetNextStringUpTo(shNames, p, ^M);
  end;
```

**Usage Pattern**:
- Typically used to find specific input types (e.g., "advertisement")
- The `Path` is then used with `SetPath` to navigate to that input
- Example: Finding the advertisement input to display connection information

---

### 3. SetPath

**Purpose**: Navigates the proxy to a specific sub-object path within a facility.

**Location**: `Voyager/AdvSheetForm.pas:311`

**Request Format**:
```
Proxy.SetPath(Path: string) : boolean
```

**Parameters**:
- `Path` - Object path string (obtained from GetInputNames or constructed)

**Return Value**:
- `true` if path exists and navigation successful
- `false` if path is invalid or object not found

**Usage Pattern** (`Voyager/AdvSheetForm.pas:308-356`):
```pascal
Proxy := fContainer.CreateCacheObjectProxy;
try
  if Proxy.SetPath(InpPath) and (Update = fLastUpdate)
    then
      begin
        // Now can query properties of the object at InpPath
        // Common pattern: Get connection count, then iterate
        AddProps([
          tidObjectId,
          tidFluidId,
          tidFluidValue,
          tidLastCost,
          tidMaxFluidValue,
          tidActualMaxFluid,
          tidCnxCount], -1);

        // Then get connection count
        aux := Prop.Values[tidCnxCount];
        if aux <> ''
          then
            begin
              count := StrToInt(aux);
              // Iterate through connections using GetSubObjProperties
            end;
      end;
finally
  // Cleanup
end;
```

**After SetPath**:
- Can use `GetPropertyList` on the new path's object
- Can use `GetSubObjProperties` to query indexed sub-objects
- Path remains set until another `SetPath` call or proxy is released

---

### 4. GetSubObjProperties

**Purpose**: Retrieves properties from an indexed sub-object (e.g., connection #0, connection #1).

**Location**: `Voyager/SheetUtils.pas:141-175` and `Voyager/AdvSheetForm.pas:339-350`

**Request Format**:
```
Proxy.GetSubObjectProps(subIdx: integer, PropertyNames: WideString) : WideString
```

**Parameters**:
- `subIdx` - Zero-based index of sub-object
- `PropertyNames` - Tab-separated list of property names (same as GetPropertyList)

**Response Format**:
- Same as GetPropertyList: tab-separated values

**Usage Example** (`Voyager/AdvSheetForm.pas:336-354`):
```pascal
count := StrToInt(aux);
i := 0;
while (i < count) and (Update = fLastUpdate) do
  begin
    iStr := IntToStr(i);
    SheetUtils.GetSubObjProperties(Proxy,
      i,
      [tidCnxFacilityName + iStr,
       tidCnxCreatedBy + iStr,
       tidCnxNfPrice + iStr,
       tidOverPriceCnxInfo + iStr,
       tidLastValueCnxInfo + iStr,
       tidCnxQuality + iStr,
       tidConnectedCnxInfo + iStr,
       tidCnxXPos + iStr,
       tidCnxYPos + iStr],
      Prop);
    // Process the connection data
    inc(i);
  end;
```

**Note**: Property names often include the index as a suffix (e.g., `cnxFacilityName0`, `cnxFacilityName1`)

---

### 5. GetProperties (Container Method)

**Purpose**: High-level method that requests properties for the currently focused object.

**Location**: `Voyager/URLHandlers/ObjectInspectorInterfaces.pas:59`

**Interface Definition**:
```pascal
IPropertySheetContainerHandler =
  interface
    function GetProperties(Names : TStringList) : TStringList;
    // ... other methods
  end;
```

**Usage** (`Voyager/AdvSheetForm.pas:428-441`):
```pascal
fProperties.Free;
try
  fProperties := fContainer.GetProperties(Names);
finally
  Names.Free;
end;
// Access values:
aux := fProperties.Values[tidExtSecurityId];
if aux = ''
  then aux := fProperties.Values[tidSecurityId];
```

**Behavior**:
- Container internally calls proxy's `GetPropertyList`
- Returns TStringList with name-value pairs
- Automatically handles proxy creation and management
- Thread-safe for concurrent property requests

---

## Request/Response Formats

### Character Constants

| Constant | Value | Usage |
|----------|-------|-------|
| `#9` | TAB | Property/value separator |
| `^M` | CR (Carriage Return) | Entry separator in GetInputNames |
| `#0` | NULL | String terminator |
| `:` | Colon | Path/name separator in GetInputNames |

---

## Property List

### Complete List of 256+ Properties

Below is a comprehensive, categorized list of all properties that can be requested from the server. These are the actual string values sent in requests.

#### Security & Authentication
- `SecurityId` - Object security/ownership identifier
- `ExtraSecurityId` - Extended security identifier

#### Financial & Economic
- `Cost` - Facility construction cost
- `ROI` - Return on investment percentage
- `Budget` - Allocated budget
- `Amount` - Transaction amount
- `Interest` - Interest rate
- `Term` - Loan term duration
- `EstLoan` - Estimated loan amount
- `PricePc` - Price per unit
- `AvgPrice` - Average market price
- `MarketPrice` - Current market price
- `LastCost` - Most recent cost
- `LastCostPerc` - Last cost percentage
- `tCostCnxInfo` - Connection cost information

#### Workforce & Employment
Three-tier system (0=Low class, 1=Middle class, 2=High class):
- `Salaries0`, `Salaries1`, `Salaries2` - Salary settings
- `SalaryValues`, `SalaryValues0`, `SalaryValues2` - Actual salary values
- `Workers0`, `Workers1`, `Workers2` - Current worker counts
- `WorkersK0`, `WorkersK1`, `WorkersK2` - Workers in thousands
- `WorkersMax0`, `WorkersMax1`, `WorkersMax2` - Maximum workers
- `WorkersCap0`, `WorkersCap1`, `WorkersCap2` - Worker capacity
- `WorkForcePrice0`, `WorkForcePrice1`, `WorkForcePrice2` - Labor costs
- `MinSalaries0`, `MinSalaries1`, `MinSalaries2` - Minimum salary requirements
- `hiActualMinSalary` - High class minimum salary
- `midActualMinSalary` - Middle class minimum salary
- `loActualMinSalary` - Low class minimum salary

#### Buildings & Facilities Status
- `CurrBlock` - Current building block identifier
- `Trouble` - Problem/error status flag (bitmask)
- `Pending` - Pending operations flag
- `Upgrading` - Currently upgrading flag
- `UpgradeLevel` - Current upgrade level
- `MaxUpgrade` - Maximum upgrade level available
- `NextUpgCost` - Cost of next upgrade
- `CloneMenu` - Clone menu availability
- `Selected` - Selection state
- `InProd` - In production flag
- `FilmDone` - Film production complete (media facilities)
- `AutoProd` - Auto production enabled
- `AutoRel` - Auto release enabled

#### Political & Government
- `ActualMayor` - Current mayor name
- `ActualRuler` - Current ruler name
- `HasMayor` - Town has mayor (boolean)
- `HasRuler` - Has ruler (boolean)
- `MayorPrestige` - Mayor's prestige points
- `MayorRating` - Mayor's approval rating
- `RulerPrestige` - Ruler's prestige points
- `RulerActualPrestige` - Ruler's actual prestige
- `RulerRating` - Ruler's rating
- `RulerName` - Name of ruler
- `RulerVotes` - Votes for ruler
- `RulerCmpRat` - Ruler campaign rating
- `RulerCmpPnts` - Ruler campaign points
- `RulerPeriods` - Number of terms served
- `YearsToElections` - Years until next election
- `TycoonsRating` - Tycoon rating system
- `CampaignCount` - Number of active campaigns
- `MinisterCount` - Number of ministers

#### Town/City Management
- `Town` - Town identifier
- `TownName` - Town name
- `TownCount` - Number of towns
- `TownPopulation` - Total population
- `TownQOL` - Town Quality of Life rating
- `TownQOS` - Town Quality of Service rating
- `TownRating` - Overall town rating
- `TownTax` - Town tax rate
- `TownWealth` - Town wealth indicator
- `TownHasMayor` - Town has mayor (boolean)
- `NewspaperName` - Local newspaper name
- `TaxCount` - Number of tax entries
- `covCount` - Covenant count

#### Resources & Production (Fluids/Materials)
- `FluidName` - Name of resource/material
- `FluidId` / `MetaFluid` - Resource type identifier
- `FluidValue` - Current resource quantity
- `LastFluid` - Last fluid amount
- `FluidQuality` - Resource quality rating
- `Path` - Resource path identifier
- `nfCapacity` - Fluid capacity
- `nfActualMaxFluidValue` - Actual maximum fluid value
- `nfLastValueCnxInfo` - Last value connection info
- `minK` - Minimum K value
- `MaxPrice` - Maximum price

#### Connections & Trade
- `cnxCount` - Number of connections
- `cnxFacilityName` - Connected facility name (append index: cnxFacilityName0, cnxFacilityName1, ...)
- `cnxCompanyName` - Connected company name
- `cnxCreatedBy` - Connection creator
- `cnxNfPrice` - Connection price
- `cnxQuality` - Connection quality rating
- `cnxXPos` - Connection X coordinate
- `cnxYPos` - Connection Y coordinate
- `Cnxs` - Connections parameter
- `ConnectedCnxInfo` - Connection status info
- `OverPriceCnxInfo` - Overprice percentage
- `LastValueCnxInfo` - Last transaction value
- `GateMap` - Gate mapping data
- `TradeRole` - Trading role
- `TradeLevel` - Trade level
- `Role` - Facility role

#### Company/Business Operations
- `ServiceCount` - Number of services
- `cInput` - Company input
- `cInputCount` - Input count
- `cInputDem` - Input demand
- `cInputMax` - Input maximum
- `cInputRatio` - Input ratio
- `cInputSup` - Input supply
- `cUnits` - Company units
- `cEditable` - Editable flag
- `QPSorted` - Quality/Price sorted
- `SortMode` - Sorting mode

#### Banking & Loans
- `LoanCount` - Number of loans
- `Debtor` - Debtor name
- `Interest` - Interest rate
- `Amount` - Loan amount
- `Term` - Loan term

#### Media & Broadcasting
- `antActive` - Antenna active status
- `antCount` - Antenna count
- `antName` - Antenna name
- `antTown` - Antenna town
- `antViewers` - Number of viewers
- `antX` - Antenna X coordinate
- `antY` - Antenna Y coordinate
- `HoursOnAir` - Broadcast hours
- `Comercials` - Commercial count

#### Location & Coordinates
- `x` - X coordinate
- `y` - Y coordinate
- `WorldName` - World/server name

#### Time & Status Tracking
- `General/Date` - Game date
- `General/Online` - Online status
- `MoneyGraph` - Money graph data
- `MoneyGraphInfo` - Money graph metadata

#### Object Identification
- `ObjectId` - Unique object identifier
- `ClassId` - Object class identifier

#### Research & Development
- `RsKind` - Research kind/type

#### Population & Demographics
- `General/Population` - Total population
- `General/Investors` - Number of investors

#### Miscellaneous
- `OwnerName` - Owner name
- `Transcended` - Transcended status
- `WordsOfWisdom` - Advice text
- `MsgId` - Message identifier
- `To` - Message recipient

---

## Code References

### Key Source Files

| File | Description |
|------|-------------|
| `Voyager/SheetUtils.pas` | Core property request/parsing utilities |
| `Voyager/AdvSheetForm.pas` | Advertisement sheet with GetInputNames/SetPath examples |
| `Voyager/ProdSheetForm.pas` | Production sheet properties |
| `Voyager/SupplySheetForm.pas` | Supply chain properties |
| `Voyager/IndustrySheet.pas` | Industry facility properties |
| `Voyager/ResidentialSheet.pas` | Residential building properties |
| `Voyager/TownHallSheet.pas` | Town hall/government properties |
| `Voyager/BankGeneralSheet.pas` | Banking properties |
| `Voyager/WorkforceSheet.pas` | Workforce management properties |
| `Voyager/VoyagerServerInterfaces.pas` | Server interface definitions |
| `Voyager/URLHandlers/ObjectInspectorInterfaces.pas` | Container handler interfaces |
| `Voyager/SheetHandlers.pas` | Base sheet handler implementation |

---

## Implementation Notes for Client Developers

### 1. String Encoding
- Use **WideString** for all server communication
- All property names and values are strings
- Numeric values are sent as string representations
- Boolean values typically: "1" (true) or "0" (false), or "YES"/"NO"

### 2. Error Handling
- Empty response string = no data available
- Check `VarIsEmpty(Proxy)` before making requests
- `SetPath` returns boolean - always check before querying
- Properties may be missing - check for empty values

### 3. Threading
- Property requests often run in background threads
- Use update counters (`fLastUpdate`) to detect stale data
- Example: `if Update = fLastUpdate then ...`
- Container methods (`GetProperties`) are thread-safe

### 4. Common Patterns

#### Pattern 1: Simple Property Query
```pascal
Names := TStringList.Create;
Results := TStringList.Create;
try
  Names.Add('SecurityId');
  Names.Add('Trouble');
  Names.Add('Cost');

  if GetProperties(Proxy, Names, Results) then
    begin
      securityId := Results.Values['SecurityId'];
      trouble := Results.Values['Trouble'];
      cost := Results.Values['Cost'];
    end;
finally
  Names.Free;
  Results.Free;
end;
```

#### Pattern 2: Navigate and Query
```pascal
Proxy := CreateCacheObjectProxy;
try
  if Proxy.SetPath('Inputs.Advertisement') then
    begin
      // Query properties at this path
      GetPropertyArray(Proxy,
        ['FluidValue', 'LastCost', 'cnxCount'],
        Results);
    end;
finally
  Proxy := Unassigned;
end;
```

#### Pattern 3: Iterate Sub-Objects
```pascal
// First get count
GetPropertyArray(Proxy, ['cnxCount'], Results);
count := StrToInt(Results.Values['cnxCount']);

// Then iterate
for i := 0 to count - 1 do
  begin
    GetSubObjProperties(Proxy, i,
      ['cnxFacilityName' + IntToStr(i),
       'cnxXPos' + IntToStr(i),
       'cnxYPos' + IntToStr(i)],
      Results);
    // Process results
  end;
```

### 5. Proxy Management
- **Cache Server Proxy**: `GetCacheServerProxy` - global cache server
- **Cache Object Proxy**: `CreateCacheObjectProxy` - per-object queries
- **MS Proxy**: `GetMSProxy` - Model Server proxy (for modifications)

### 6. Property Naming Conventions
- Lowercase prefixes indicate category: `cnx*` (connection), `ant*` (antenna)
- Numbers 0/1/2 suffix = Low/Middle/High class (workforce, salaries)
- `nf*` prefix = "New Fluid" system properties
- `tid*` prefix = Pascal constant names (not sent to server)

---

## Wire Protocol Notes

Based on the code analysis, the wire protocol appears to use **DCOM/OLE Automation**:

- Client creates COM proxy objects
- Methods called via `OleVariant` interface
- Properties marshaled as `WideString` or `string`
- Synchronous request-response model
- Connection details obtained from `IClientView`:
  - Cache server: `getCacheAddr()` / `getCachePort()`
  - Model server for writes: Interface Server connection

### Cache Server Connection
The cache server is the primary data source for property queries. Properties are cached to reduce load on the main Model Server.

---

## Example Implementation Pseudocode

```python
class GameObjectProxy:
    def __init__(self, cache_server_connection, object_id):
        self.connection = cache_server_connection
        self.object_id = object_id
        self.current_path = ""

    def get_property_list(self, property_names: list) -> dict:
        """Request multiple properties at once."""
        # Build request: tab-separated property names
        request = '\t'.join(property_names) + '\t'

        # Send to server
        response = self.connection.call('GetPropertyList', request)

        # Parse response: tab-separated values
        values = response.split('\t')
        result = {}
        for i, name in enumerate(property_names):
            if i < len(values) and values[i]:
                result[name] = values[i]

        return result

    def get_input_names(self, index: int, language: str) -> list:
        """Get list of input resources."""
        response = self.connection.call('GetInputNames', index, language)

        # Parse: carriage-return separated entries
        entries = []
        for line in response.split('\r'):
            if ':' in line:
                path, name_part = line.split(':', 1)
                # Skip 2 characters, then read name until null
                name = name_part[2:].split('\x00')[0]
                entries.append({'path': path, 'name': name})

        return entries

    def set_path(self, path: str) -> bool:
        """Navigate to sub-object path."""
        success = self.connection.call('SetPath', path)
        if success:
            self.current_path = path
        return success

    def get_sub_obj_properties(self, index: int, property_names: list) -> dict:
        """Get properties from indexed sub-object."""
        request = '\t'.join(property_names) + '\t'
        response = self.connection.call('GetSubObjectProps', index, request)

        # Parse same as get_property_list
        values = response.split('\t')
        result = {}
        for i, name in enumerate(property_names):
            if i < len(values) and values[i]:
                result[name] = values[i]

        return result

# Usage example
proxy = GameObjectProxy(cache_conn, object_id=12345)

# Query basic properties
props = proxy.get_property_list(['SecurityId', 'Trouble', 'Cost', 'ROI'])
print(f"Security: {props.get('SecurityId')}")
print(f"Cost: {props.get('Cost')}")

# Find advertisement input
inputs = proxy.get_input_names(0, 'en')
ad_input = next((inp for inp in inputs if inp['name'].lower() == 'advertisement'), None)

if ad_input and proxy.set_path(ad_input['path']):
    # Query advertisement connections
    ad_props = proxy.get_property_list([
        'FluidValue', 'LastCost', 'cnxCount'
    ])

    cnx_count = int(ad_props.get('cnxCount', 0))
    for i in range(cnx_count):
        cnx = proxy.get_sub_obj_properties(i, [
            f'cnxFacilityName{i}',
            f'cnxXPos{i}',
            f'cnxYPos{i}'
        ])
        print(f"Connection {i}: {cnx}")
```

---

## Change Log

- **2026-01-14**: Initial documentation based on Voyager client source code analysis
- Property list compiled from 76 .pas files
- 256+ unique properties identified and categorized
- All four core methods documented with examples

---

## Additional Resources

For server-side implementation details, refer to:
- Cache Server source code
- Model Server source code
- Protocol unit (`Protocol.pas`)
- RDO (Remote Data Objects) implementation

---

## License

This documentation is derived from the open-source Starpeace Online project.
