/**
 * RDO Helpers - Pure utility functions for RDO protocol handling
 * Extracted from spo_session.ts to reduce complexity
 */

/**
 * Clean RDO payload by removing quotes, prefixes, and formatting
 * @param payload Raw payload string from RDO response
 * @returns Cleaned payload value
 */
export function cleanPayload(payload: string): string {
  let cleaned = payload.trim();

  // Handle res="..." format (e.g., res="#6805584" -> 6805584)
  const resMatch = cleaned.match(/^res="([^"]*)"$/);
  if (resMatch) {
    cleaned = resMatch[1];
  }

  // Remove outer quotes
  cleaned = cleaned.replace(/^"|"$/g, '');

  // Remove type prefix (#, %, @, $) if present
  if (cleaned.length > 0 && ['#', '%', '@', '$'].includes(cleaned[0])) {
    cleaned = cleaned.substring(1);
  }

  return cleaned.trim();
}

/**
 * Split multiline RDO payload into individual lines
 * Handles various line ending formats and empty lines
 * @param payload Raw multiline payload
 * @returns Array of non-empty trimmed lines
 */
export function splitMultilinePayload(payload: string): string[] {
  const raw = cleanPayload(payload);

  // Handle mixed line endings: \r\n, \n, \r, or even \n\r
  const lines = raw.split(/\r?\n\r?/);

  // Filter empty lines and trim
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Extract revenue amount from a line
 * Formats: "($26,564/h)" or "(-$39,127/h)" or "(-$28,858/h)"
 * @param line Line containing potential revenue information
 * @returns Extracted revenue string or empty string if not found
 */
export function extractRevenue(line: string): string {
  // Pattern: optional '(', optional '-', '$', digits with optional commas, '/h', optional ')'
  const revenuePattern = /\(?\-?\$[\d,]+\/h\)?/;
  const match = revenuePattern.exec(line);

  if (match) {
    // Return the matched string, cleaned
    return match[0].replace(/[()]/g, ''); // Remove parentheses
  }

  return '';
}

/**
 * Parse property response payload extracting a specific property value
 * @param payload Raw payload containing property value
 * @param propName Property name for error messages
 * @returns Extracted property value
 */
export function parsePropertyResponse(payload: string, propName: string): string {
  // Clean and extract the value
  const cleaned = cleanPayload(payload);

  // Handle multi-line responses - take first non-empty line
  const lines = cleaned.split(/\r?\n\r?/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    console.warn(`[RdoHelpers] Empty response for property ${propName}`);
    return '';
  }

  return lines[0].trim();
}

/**
 * Parse idof response to extract object ID
 * @param payload Response payload from idof command
 * @returns Extracted object ID
 */
export function parseIdOfResponse(payload: string | undefined): string {
  if (!payload) {
    throw new Error('Empty idof response');
  }

  const cleaned = cleanPayload(payload);

  // Some responses might be wrapped in quotes or have type prefix
  return cleaned.replace(/[#%@$"]/g, '').trim();
}

/**
 * Remove RDO type prefixes from a value
 * @param value Value potentially containing type prefix
 * @returns Value without type prefix
 */
export function stripTypePrefix(value: string): string {
  if (value.length > 0 && ['#', '%', '@', '$', '^', '!', '*'].includes(value[0])) {
    return value.substring(1);
  }
  return value;
}

/**
 * Check if a string has an RDO type prefix
 * @param value Value to check
 * @returns True if value starts with a type prefix
 */
export function hasTypePrefix(value: string): boolean {
  if (value.length === 0) return false;
  return ['#', '%', '@', '$', '^', '!', '*'].includes(value[0]);
}
