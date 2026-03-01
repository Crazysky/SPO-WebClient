/**
 * Parser for the Voyager `research.{lang}.dat` binary format.
 *
 * These files are compiled by `InvComp.dpr` from the game's XML invention
 * definitions and shipped inside `inventions.cab`. They contain pre-cached
 * invention metadata (name, description, parent group, properties) that the
 * server cache does NOT include for non-volatile inventions.
 *
 * Binary layout:
 *   uint32           inventionCount
 *   Invention[]      inventions (×count)
 *   DelphiString     tabNames ("\r\n"-separated)
 *
 * Per-invention record:
 *   DelphiString     id            — e.g. "24HoursProduction"
 *   DelphiString     name|category — "24 Hour Production|Industry"
 *   DelphiString     description   — text + "\r\nRequires: X, Y."
 *   DelphiString     parent        — tree grouping e.g. "Oil"
 *   byte             cache         — boolean
 *   DelphiString     properties    — formatted "\r\n"-separated lines
 *
 * DelphiString = uint32_LE(length) + raw_bytes(length)
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Single invention parsed from the `.dat` file. */
export interface DatInvention {
  /** Unique string ID matching server cache values (e.g. "24HoursProduction") */
  id: string;
  /** Display name (e.g. "24 Hour Production") */
  name: string;
  /** InventionKind display name (e.g. "Industry", "Commerce", "Real Estate") */
  category: string;
  /** Description text (may include "\r\nRequires: X, Y." suffix) */
  description: string;
  /** Tree grouping label (e.g. "Oil", "Farms", "Housing") */
  parent: string;
  /** Whether pre-cached in client (almost always true) */
  cached: boolean;
  /** Pre-formatted property lines (e.g. "Price: $190,000,000") */
  properties: string[];
  /** Prerequisite invention names parsed from description (empty if none) */
  requires: string[];
}

/** Complete parsed result from a `research.{lang}.dat` file. */
export interface DatParseResult {
  /** Total number of inventions in the file */
  inventionCount: number;
  /** Category tab labels from footer (e.g. ["GENERAL", "COMMERCE", ...]) */
  categoryTabs: string[];
  /** All inventions in file order */
  inventions: DatInvention[];
}

/** Lookup index built from parsed data for fast access. */
export interface DatInventionIndex {
  /** Lookup by invention ID → full invention data */
  byId: Map<string, DatInvention>;
  /** Inventions grouped by category (key = category name) */
  byCategory: Map<string, DatInvention[]>;
  /** Inventions grouped by category → parent (nested) */
  byCategoryAndParent: Map<string, Map<string, DatInvention[]>>;
  /** Category tab labels from the file footer */
  categoryTabs: string[];
  /** Maps tab index (0..N) → category name(s) that belong to that tab */
  tabToCategories: Map<number, string[]>;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Internal reader state for the binary buffer. */
class BinaryReader {
  private pos = 0;
  constructor(private readonly buf: Buffer) {}

  get position(): number { return this.pos; }
  get remaining(): number { return this.buf.length - this.pos; }

  readUint32(): number {
    if (this.pos + 4 > this.buf.length) {
      throw new Error(`Unexpected EOF at offset ${this.pos} reading uint32`);
    }
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  readByte(): number {
    if (this.pos >= this.buf.length) {
      throw new Error(`Unexpected EOF at offset ${this.pos} reading byte`);
    }
    return this.buf[this.pos++];
  }

  /** Read a Delphi-format string: uint32 length + raw bytes (latin1). */
  readDelphiString(): string {
    const len = this.readUint32();
    if (len > 100_000) {
      throw new Error(`Suspicious string length ${len} at offset ${this.pos - 4}`);
    }
    if (this.pos + len > this.buf.length) {
      throw new Error(`Unexpected EOF at offset ${this.pos} reading ${len}-byte string`);
    }
    const s = this.buf.slice(this.pos, this.pos + len).toString('latin1');
    this.pos += len;
    return s;
  }
}

/**
 * Parse a `research.{lang}.dat` binary file into structured data.
 *
 * @param buffer - Raw file contents as a Buffer
 * @returns Parsed inventions and category tabs
 */
export function parseResearchDat(buffer: Buffer): DatParseResult {
  const reader = new BinaryReader(buffer);

  // Header: invention count
  const inventionCount = reader.readUint32();
  if (inventionCount > 10_000) {
    throw new Error(`Invention count ${inventionCount} exceeds sanity limit (10000)`);
  }

  // Parse each invention
  const inventions: DatInvention[] = [];
  for (let i = 0; i < inventionCount; i++) {
    const id = reader.readDelphiString();
    const nameCategory = reader.readDelphiString();
    const rawDescription = reader.readDelphiString();
    const parent = reader.readDelphiString();
    const cached = reader.readByte() !== 0;
    const rawProperties = reader.readDelphiString();

    // Split "Name|Category"
    const pipeIdx = nameCategory.indexOf('|');
    const name = pipeIdx >= 0 ? nameCategory.substring(0, pipeIdx) : nameCategory;
    const category = pipeIdx >= 0 ? nameCategory.substring(pipeIdx + 1) : '';

    // Parse properties lines
    const properties = rawProperties.split('\r\n').filter(Boolean);

    // Extract "Requires: X, Y." from description
    let description = rawDescription;
    const requires: string[] = [];
    const reqMatch = rawDescription.match(/\r\nRequires:\s*(.+)\.$/);
    if (reqMatch) {
      description = rawDescription.substring(0, reqMatch.index);
      requires.push(...reqMatch[1].split(',').map(s => s.trim()));
    }

    inventions.push({ id, name, category, description, parent, cached, properties, requires });
  }

  // Footer: tab names as a single \r\n-separated string
  let categoryTabs: string[] = [];
  if (reader.remaining > 4) {
    try {
      const tabStr = reader.readDelphiString();
      categoryTabs = tabStr.split('\r\n').filter(Boolean);
    } catch {
      // Some .dat files may not have a footer — tolerate gracefully
    }
  }

  return { inventionCount, categoryTabs, inventions };
}

// ---------------------------------------------------------------------------
// Index builder
// ---------------------------------------------------------------------------

/**
 * Build a fast-lookup index from parsed `.dat` data.
 *
 * The `tabToCategories` map resolves which category names belong to each tab
 * index, handling the case where tab 4 (CIVICS) collects both "Civics" and
 * "Ministry Headquarters".
 */
export function buildInventionIndex(parsed: DatParseResult): DatInventionIndex {
  const byId = new Map<string, DatInvention>();
  const byCategory = new Map<string, DatInvention[]>();
  const byCategoryAndParent = new Map<string, Map<string, DatInvention[]>>();

  for (const inv of parsed.inventions) {
    byId.set(inv.id, inv);

    // Group by category
    let catList = byCategory.get(inv.category);
    if (!catList) { catList = []; byCategory.set(inv.category, catList); }
    catList.push(inv);

    // Group by category + parent
    let parentMap = byCategoryAndParent.get(inv.category);
    if (!parentMap) { parentMap = new Map(); byCategoryAndParent.set(inv.category, parentMap); }
    let parentList = parentMap.get(inv.parent);
    if (!parentList) { parentList = []; parentMap.set(inv.parent, parentList); }
    parentList.push(inv);
  }

  // Build tab→categories mapping
  // Match by comparing uppercase tab label to uppercase category name.
  // Categories that don't match any tab go into the last tab (fallback bucket).
  const tabToCategories = new Map<number, string[]>();
  const allCategoryNames = Array.from(byCategory.keys());
  const matchedCategories = new Set<string>();

  for (let tabIdx = 0; tabIdx < parsed.categoryTabs.length; tabIdx++) {
    const tabLabel = parsed.categoryTabs[tabIdx].toUpperCase();
    const matching = allCategoryNames.filter(c => c.toUpperCase() === tabLabel);
    matching.forEach(c => matchedCategories.add(c));
    tabToCategories.set(tabIdx, matching);
  }

  // Unmatched categories go to the last tab
  const unmatched = allCategoryNames.filter(c => !matchedCategories.has(c));
  if (unmatched.length > 0 && parsed.categoryTabs.length > 0) {
    const lastTabIdx = parsed.categoryTabs.length - 1;
    const existing = tabToCategories.get(lastTabIdx) ?? [];
    tabToCategories.set(lastTabIdx, [...existing, ...unmatched]);
  }

  return {
    byId,
    byCategory,
    byCategoryAndParent,
    categoryTabs: parsed.categoryTabs,
    tabToCategories,
  };
}
