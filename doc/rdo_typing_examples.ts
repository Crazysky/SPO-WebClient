/**
 * RDO Type System - Code Examples
 *
 * This file demonstrates the usage of the RDO type system.
 * These are runnable examples showing common patterns.
 */

import { RdoValue, RdoParser, RdoCommand, rdoArgs } from '../src/shared/rdo-types';

// ============================================================================
// EXAMPLE 1: Creating Typed Values
// ============================================================================

function example1_CreatingValues() {
  console.log('=== Example 1: Creating Typed Values ===\n');

  // Integer values
  const buildingId = RdoValue.int(123456);
  console.log('Building ID:', buildingId.format());  // "#123456"

  // String values (wide string - most common)
  const username = RdoValue.string('Player1');
  console.log('Username:', username.format());  // "%Player1"

  // Float values
  const temperature = RdoValue.float(98.6);
  console.log('Temperature:', temperature.format());  // "!98.6"

  // Multiple values for a command
  const coords = [
    RdoValue.int(100),  // x coordinate
    RdoValue.int(200)   // y coordinate
  ];
  const formatted = coords.map(v => v.format()).join(',');
  console.log('Coordinates:', formatted);  // "#100","#200"

  console.log('\n');
}

// ============================================================================
// EXAMPLE 2: Parsing RDO Values
// ============================================================================

function example2_ParsingValues() {
  console.log('=== Example 2: Parsing RDO Values ===\n');

  // Extract type and value
  const rawPrice = '"#220"';
  const extracted = RdoParser.extract(rawPrice);
  console.log('Extracted:', extracted);  // { prefix: '#', value: '220' }

  // Get just the value
  const value = RdoParser.getValue(rawPrice);
  console.log('Value:', value);  // '220'

  // Parse as specific type
  const priceInt = RdoParser.asInt(rawPrice);
  console.log('As integer:', priceInt);  // 220

  // Check type prefix
  const hasIntPrefix = RdoParser.hasPrefix(rawPrice, '#');
  console.log('Is integer?', hasIntPrefix);  // true

  console.log('\n');
}

// ============================================================================
// EXAMPLE 3: Building Commands - Login
// ============================================================================

function example3_LoginCommand() {
  console.log('=== Example 3: Login Command ===\n');

  const worldId = '12345678';
  const username = 'TestPlayer';
  const password = 'SecurePass123';

  // Build RDO login command
  const loginCmd = RdoCommand.sel(worldId)
    .call('RDOLogonClient')
    .push()
    .args(
      RdoValue.string(username),
      RdoValue.string(password)
    )
    .build();

  console.log('Login command:');
  console.log(loginCmd);
  // Output: C sel 12345678 call RDOLogonClient "*" "%TestPlayer","%SecurePass123";

  console.log('\n');
}

// ============================================================================
// EXAMPLE 4: Building Commands - Set Building Price
// ============================================================================

function example4_SetBuildingPrice() {
  console.log('=== Example 4: Set Building Price ===\n');

  const buildingCurrBlock = '100575368';
  const priceIndex = 0;     // First price slot
  const newPrice = 220;     // New price value

  // Build command to set building price
  const setPriceCmd = RdoCommand.sel(buildingCurrBlock)
    .call('RDOSetPrice')
    .push()
    .args(
      RdoValue.int(priceIndex),
      RdoValue.int(newPrice)
    )
    .build();

  console.log('Set price command:');
  console.log(setPriceCmd);
  // Output: C sel 100575368 call RDOSetPrice "*" "#0","#220";

  console.log('\n');
}

// ============================================================================
// EXAMPLE 5: Building Commands - Set Multiple Salaries
// ============================================================================

function example5_SetSalaries() {
  console.log('=== Example 5: Set Multiple Salaries ===\n');

  const buildingCurrBlock = '100575368';
  const executiveSalary = 100;
  const professionalSalary = 120;
  const workerSalary = 150;

  // RDOSetSalaries requires all 3 salary values
  const setSalariesCmd = RdoCommand.sel(buildingCurrBlock)
    .call('RDOSetSalaries')
    .push()
    .args(
      RdoValue.int(executiveSalary),
      RdoValue.int(professionalSalary),
      RdoValue.int(workerSalary)
    )
    .build();

  console.log('Set salaries command:');
  console.log(setSalariesCmd);
  // Output: C sel 100575368 call RDOSetSalaries "*" "#100","#120","#150";

  console.log('\n');
}

// ============================================================================
// EXAMPLE 6: Building Commands - Unfocus Building
// ============================================================================

function example6_UnfocusBuilding() {
  console.log('=== Example 6: Unfocus Building ===\n');

  const worldContextId = '87654321';
  const buildingId = '202334236';

  // Simple command with single argument
  const unfocusCmd = RdoCommand.sel(worldContextId)
    .call('UnfocusObject')
    .push()
    .args(RdoValue.int(parseInt(buildingId)))
    .build();

  console.log('Unfocus command:');
  console.log(unfocusCmd);
  // Output: C sel 87654321 call UnfocusObject "*" "#202334236";

  console.log('\n');
}

// ============================================================================
// EXAMPLE 7: Using rdoArgs Helper
// ============================================================================

function example7_RdoArgsHelper() {
  console.log('=== Example 7: rdoArgs Helper Function ===\n');

  // Auto-detect types from prefixed strings
  const args1 = rdoArgs('#42', '%hello', '!3.14');
  console.log('Auto-detected args:');
  args1.forEach(arg => console.log('  ', arg.format()));
  // Output:
  //   "#42"
  //   "%hello"
  //   "!3.14"

  // Mix of prefixed strings and raw values
  const args2 = rdoArgs('#100', 200, 'world');
  console.log('\nMixed args:');
  args2.forEach(arg => console.log('  ', arg.format()));
  // Output:
  //   "#100"
  //   "#200"
  //   "%world"

  // Combine with RdoValue objects
  const args3 = rdoArgs(
    RdoValue.int(42),
    '#100',
    RdoValue.string('test')
  );
  console.log('\nCombined args:');
  args3.forEach(arg => console.log('  ', arg.format()));
  // Output:
  //   "#42"
  //   "#100"
  //   "%test"

  console.log('\n');
}

// ============================================================================
// EXAMPLE 8: Request with Return Value
// ============================================================================

function example8_RequestWithReturn() {
  console.log('=== Example 8: Request with Return Value ===\n');

  const worldContextId = '87654321';
  const requestId = 1001;
  const tycoonId = '999888';

  // Method call expecting a response (uses "^" separator)
  const getCompanyCmd = RdoCommand.sel(worldContextId)
    .call('GetTycoonCookie')
    .method()  // Use method separator instead of push
    .withRequestId(requestId)
    .args(
      RdoValue.string(tycoonId),
      RdoValue.string('')  // Empty string for "all cookies"
    )
    .build();

  console.log('Request command:');
  console.log(getCompanyCmd);
  // Output: C 1001 sel 87654321 call GetTycoonCookie "^" "%999888","%" ;

  console.log('\n');
}

// ============================================================================
// EXAMPLE 9: Building Placement
// ============================================================================

function example9_BuildingPlacement() {
  console.log('=== Example 9: Building Placement ===\n');

  const worldContextId = '87654321';
  const facilityClass = 'PGISmallFarm';
  const zoneLevel = 28;
  const x = 150;
  const y = 200;

  // NewFacility command for building placement
  const placeBuildingCmd = RdoCommand.sel(worldContextId)
    .call('NewFacility')
    .method()  // Expects return value (building ID)
    .withRequestId(1002)
    .args(
      RdoValue.string(facilityClass),
      RdoValue.int(zoneLevel),
      RdoValue.int(x),
      RdoValue.int(y)
    )
    .build();

  console.log('Place building command:');
  console.log(placeBuildingCmd);
  // Output: C 1002 sel 87654321 call NewFacility "^" "%PGISmallFarm","#28","#150","#200";

  console.log('\n');
}

// ============================================================================
// EXAMPLE 10: Chat Typing Status
// ============================================================================

function example10_ChatTyping() {
  console.log('=== Example 10: Chat Typing Status ===\n');

  const worldContextId = '87654321';
  const isTyping = true;

  // Notify server of typing status
  const typingCmd = RdoCommand.sel(worldContextId)
    .call('MsgCompositionChanged')
    .push()
    .args(RdoValue.int(isTyping ? 1 : 0))
    .build();

  console.log('Typing status command:');
  console.log(typingCmd);
  // Output: C sel 87654321 call MsgCompositionChanged "*" "#1";

  console.log('\n');
}

// ============================================================================
// Run All Examples
// ============================================================================

function runAllExamples() {
  example1_CreatingValues();
  example2_ParsingValues();
  example3_LoginCommand();
  example4_SetBuildingPrice();
  example5_SetSalaries();
  example6_UnfocusBuilding();
  example7_RdoArgsHelper();
  example8_RequestWithReturn();
  example9_BuildingPlacement();
  example10_ChatTyping();

  console.log('=== All examples completed ===');
}

// Uncomment to run (requires Node.js with TypeScript)
// runAllExamples();

export {
  example1_CreatingValues,
  example2_ParsingValues,
  example3_LoginCommand,
  example4_SetBuildingPrice,
  example5_SetSalaries,
  example6_UnfocusBuilding,
  example7_RdoArgsHelper,
  example8_RequestWithReturn,
  example9_BuildingPlacement,
  example10_ChatTyping,
  runAllExamples
};
