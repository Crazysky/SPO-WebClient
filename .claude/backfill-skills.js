#!/usr/bin/env node
/**
 * backfill-skills.js
 * Downloads missing sub-files for skills that were installed with only SKILL.md.
 * Uses GitHub Contents API to recursively fetch the full directory tree.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, 'skills');

const SKILLS_TO_BACKFILL = [
  {
    name: 'design-style',
    githubUrl: 'https://github.com/openclaw/skills/tree/main/skills/benangel65/design-style',
  },
  {
    name: 'web-typography',
    githubUrl: 'https://github.com/jeremylongshore/claude-code-plugins-plus-skills/tree/main/plugins/design/wondelai-web-typography/skills/web-typography',
  },
];

/**
 * Convert a GitHub tree URL to a GitHub Contents API URL.
 * e.g. https://github.com/owner/repo/tree/main/path/to/skill
 *   -> https://api.github.com/repos/owner/repo/contents/path/to/skill?ref=main
 */
function githubUrlToApiUrl(githubUrl) {
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.*)/);
  if (!match) throw new Error('Cannot parse GitHub URL: ' + githubUrl);
  const [, owner, repo, branch, filePath] = match;
  return `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
}

/**
 * Fetch JSON from a URL (follows redirects, sets GitHub-friendly User-Agent).
 */
function fetchJson(url) {
  return new Promise(function(resolve, reject) {
    https.get(url, { headers: { 'User-Agent': 'SPO-Backfill/1.0' } }, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse failed: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

/**
 * Download a file from url to destPath (follows redirects).
 */
function downloadFile(url, destPath) {
  return new Promise(function(resolve, reject) {
    https.get(url, { headers: { 'User-Agent': 'SPO-Backfill/1.0' } }, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      const f = fs.createWriteStream(destPath);
      res.pipe(f);
      f.on('finish', function() { f.close(); resolve(); });
      f.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Recursively download all files in a GitHub directory to destDir.
 * Skips files that already exist (avoids re-downloading SKILL.md).
 */
async function downloadSkillTree(apiUrl, destDir, stats) {
  const entries = await fetchJson(apiUrl);
  if (!Array.isArray(entries)) {
    throw new Error('Expected array from GitHub API, got: ' + JSON.stringify(entries).slice(0, 200));
  }
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of entries) {
    const entryDest = path.join(destDir, entry.name);
    if (entry.type === 'file') {
      if (fs.existsSync(entryDest)) {
        console.log('    [skip] ' + entry.name + ' (already exists)');
        stats.skipped++;
      } else {
        console.log('    [download] ' + entry.name);
        await downloadFile(entry.download_url, entryDest);
        stats.downloaded++;
      }
    } else if (entry.type === 'dir') {
      console.log('    [dir] ' + entry.name + '/');
      await downloadSkillTree(entry.url, entryDest, stats);
    }
    // Small delay to respect GitHub rate limits (60 unauthenticated req/h)
    await new Promise(function(r) { setTimeout(r, 100); });
  }
}

async function main() {
  console.log('SPO Skills Backfill');
  console.log('===================\n');

  for (const skill of SKILLS_TO_BACKFILL) {
    const skillDir = path.join(SKILLS_DIR, skill.name);
    console.log('Backfilling: ' + skill.name);
    console.log('  Dir: ' + skillDir);

    try {
      const apiUrl = githubUrlToApiUrl(skill.githubUrl);
      console.log('  API: ' + apiUrl);
      const stats = { downloaded: 0, skipped: 0 };
      await downloadSkillTree(apiUrl, skillDir, stats);
      console.log('  Done: ' + stats.downloaded + ' downloaded, ' + stats.skipped + ' skipped\n');
    } catch(e) {
      console.error('  ERROR: ' + e.message + '\n');
    }
  }

  console.log('Backfill complete.');
}

main().catch(function(e) {
  console.error('Fatal: ' + e.message);
  process.exit(1);
});
