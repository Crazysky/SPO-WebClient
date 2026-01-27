# CAB Extraction Setup

The SPO WebClient uses **7zip-min** npm package to extract Microsoft Cabinet (.cab) files containing game assets.

## Why 7zip-min?

The project previously attempted to use external tools (cabextract CLI) and the `cabarc` npm package, but encountered issues:

- **cabarc** (npm package): Had compatibility issues with Node.js v24+ due to outdated buffer APIs causing `ERR_OUT_OF_RANGE` errors
- **cabextract** (CLI tool): Not easily available on Windows 11, requires system installation

**7zip-min** solves all these problems:

- ✅ **No external dependencies** - Includes precompiled 7za binaries
- ✅ **Cross-platform** - Works on Windows, Linux, and macOS
- ✅ **Reliable** - Based on the battle-tested 7-Zip project
- ✅ **Simple integration** - Pure Node.js API (no CLI spawning)
- ✅ **CAB support** - Native support for Microsoft Cabinet format
- ✅ **npm-managed** - Installed as a standard dependency

## Installation

7zip-min is included in `package.json` dependencies:

```bash
npm install
```

That's it! No system tools required.

## Supported Formats

7zip-min (via the bundled 7za binary) supports:
- **7z** - 7-Zip format
- **lzma** - LZMA compressed files
- **cab** - Microsoft Cabinet files (our use case)
- **zip** - ZIP archives
- **gzip** - GNU zip
- **bzip2** - Bzip2 compressed files
- **Z** - Unix compress format
- **tar** - TAR archives

## Usage in Code

The UpdateService automatically uses 7zip-min for CAB extraction:

```typescript
import { extractCabArchive, listCabContents } from './cab-extractor';

// Extract CAB file
const result = await extractCabArchive('path/to/file.cab', 'output/directory');
if (result.success) {
  console.log(`Extracted ${result.extractedFiles.length} files`);
}

// List contents without extracting
const files = await listCabContents('path/to/file.cab');
console.log('Files in archive:', files);
```

## API Reference

### `extractCabArchive(cabPath, targetDir)`

Extracts all files from a CAB archive to the target directory.

**Parameters:**
- `cabPath` (string) - Path to the CAB file
- `targetDir` (string) - Directory to extract files to (created if needed)

**Returns:** `Promise<CabExtractionResult>`
```typescript
{
  success: boolean;
  extractedFiles: string[];  // Relative paths of extracted files
  errors: string[];
}
```

### `listCabContents(cabPath)`

Lists files in a CAB archive without extracting them.

**Parameters:**
- `cabPath` (string) - Path to the CAB file

**Returns:** `Promise<CabFileInfo[] | null>`
```typescript
{
  name: string;
  size: number;
  offset: number;
}
```

### `isCabExtractorAvailable()`

Checks if 7zip-min is available (should always return true).

**Returns:** `Promise<boolean>`

## Migration History

### v1: cabarc (npm package) - DEPRECATED
- **Issue**: Incompatible with Node.js v24+ (`ERR_OUT_OF_RANGE` errors)
- **Reason**: Outdated buffer APIs, unmaintained package

### v2: cabextract (CLI tool) - REPLACED
- **Issue**: Not easily available on Windows 11, requires system installation
- **Reason**: Better solution found (7zip-min)

### v3: 7zip-min (npm package) - CURRENT ✅
- **Benefits**: Bundled binaries, cross-platform, no external dependencies
- **Status**: Production-ready, all tests passing

## Troubleshooting

### Module not found error

If you see `Cannot find module '7zip-min'`:

```bash
npm install
```

### CAB extraction fails

Check the error message in the extraction result:

```typescript
const result = await extractCabArchive(cabPath, targetDir);
if (!result.success) {
  console.error('Extraction errors:', result.errors);
}
```

Common causes:
- Corrupted CAB file
- Invalid CAB format
- Insufficient disk space
- Permission issues

## References

- 7zip-min npm package: https://www.npmjs.com/package/7zip-min
- 7zip-min GitHub: https://github.com/onikienko/7zip-min
- 7-Zip official site: https://www.7-zip.org/
- 7-Zip command-line reference: https://7-zip.org/doc/7z.html
