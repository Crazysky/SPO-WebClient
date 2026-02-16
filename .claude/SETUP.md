# Claude Code Automation Setup

This document contains installation instructions for all Claude Code automations configured for the Starpeace Online WebClient project.

## Quick Start

All configurations are already in place:
- ✅ MCP servers configured in [.mcp.json](../.mcp.json)
- ✅ Hooks configured in [.claude/settings.json](settings.json)
- ✅ E2E test skill created in [.claude/skills/e2e-test/SKILL.md](skills/e2e-test/SKILL.md)
- ✅ Subagents created in [.claude/agents/](agents/)

Follow the installation steps below to complete the setup.

---

## 1. MCP Server Installation

MCP servers are configured in [.mcp.json](../.mcp.json) at the project root. They will be automatically loaded by Claude Code.

### Prerequisites

**Install Node.js dependencies:**
```bash
npm install
```

**Install GitHub CLI (for GitHub MCP):**
```bash
# Windows (using winget)
winget install --id GitHub.cli

# Verify installation
gh --version

# Authenticate
gh auth login
```

### MCP Server Configuration

The following MCP servers are configured:

#### 1. Playwright MCP (Browser Automation)
- **Purpose**: E2E testing with real browser
- **Status**: ✅ Configured in .mcp.json
- **Usage**: Used by `/e2e-test` skill for automated testing
- **No additional installation required** - npx will auto-install on first use

#### 2. GitHub MCP (Repository Integration)
- **Purpose**: Create PRs, manage issues, check CI status
- **Status**: ✅ Configured in .mcp.json
- **Requires**: `gh` CLI (install above)
- **Setup**:
  ```bash
  # Authenticate GitHub CLI
  gh auth login

  # Test GitHub MCP
  gh api user
  ```

#### 3. context7 MCP (Documentation Lookup)
- **Purpose**: Live docs for TypeScript, Jest, WebSocket, etc.
- **Status**: ✅ Configured in .mcp.json
- **No additional installation required** - npx will auto-install on first use

### Verify MCP Servers

```bash
# Check if .mcp.json is valid
cat .mcp.json

# Claude Code will automatically load MCP servers on next run
# No manual activation needed
```

---

## 2. Plugin Installation

### anthropic-agent-skills Plugin

This plugin includes useful skills like `/commit`, `/pdf`, `/docx`, `/xlsx`.

**Installation:**
```bash
# Install the plugin
claude plugin install anthropic-agent-skills

# Verify installation
claude plugin list
```

**Included skills:**
- `/commit` - Automated git commits with conventional commit messages
- `/pdf` - Generate PDF documents
- `/docx` - Generate Word documents
- `/xlsx` - Generate Excel spreadsheets

**Usage:**
```bash
# Create a git commit
/commit

# Generate documentation
/pdf "Generate API documentation for RDO protocol"
```

### commit-commands Plugin

Dedicated git commit automation.

**Installation:**
```bash
# Install the plugin
claude plugin install commit-commands

# Verify installation
claude plugin list
```

**Usage:**
```bash
# Auto-stage, generate commit message, and commit
/commit

# The skill will:
# 1. Run git status
# 2. Run git diff
# 3. Analyze changes
# 4. Generate conventional commit message
# 5. Stage files
# 6. Create commit with Co-Authored-By footer
```

---

## 3. Skills

### E2E Test Skill

**Location**: [.claude/skills/e2e-test/SKILL.md](skills/e2e-test/SKILL.md)

**Status**: ✅ Already created

**Usage:**
```bash
# Run login test (always run this first)
/e2e-test login --debug-overlay --save-screenshots

# Run building placement test
/e2e-test building-placement --debug-overlay --save-screenshots

# Run road building test
/e2e-test road-building --debug-overlay --save-screenshots

# Run custom test
/e2e-test custom --debug-overlay
```

**Requirements:**
- Playwright MCP server (configured above)
- Dev server running or skill will start it
- Mandatory credentials: `SPO_test3` / `test3` / BETA / Shamba

**Documentation**: See [doc/E2E-TESTING.md](../doc/E2E-TESTING.md) for full procedure

---

## 4. Subagents

Subagents run specialized analysis tasks in parallel. Claude Code will invoke them automatically when needed.

### Performance Analyzer

**Location**: [.claude/agents/performance-analyzer.md](agents/performance-analyzer.md)

**Status**: ✅ Already created

**Purpose**: Analyze rendering bottlenecks, cache efficiency, frame-budget issues

**When invoked**:
- When performance issues are reported
- When FPS drops below 60
- When cache hit rates are low
- During optimization work

**Usage** (Claude invokes automatically):
```typescript
Task(
  subagent_type: "performance-analyzer",
  prompt: "Analyze chunk cache efficiency and identify rendering bottlenecks in isometric-terrain-renderer.ts"
)
```

### Security Reviewer

**Location**: [.claude/agents/security-reviewer.md](agents/security-reviewer.md)

**Status**: ✅ Already created

**Purpose**: Security audit for OWASP Top 10, RDO injection, WebSocket vulnerabilities

**When invoked**:
- When modifying security-critical files (rdo-types.ts, rdo.ts)
- When adding new API endpoints
- When implementing authentication changes
- During security review requests

**Usage** (Claude invokes automatically):
```typescript
Task(
  subagent_type: "security-reviewer",
  prompt: "Audit the proxy-image endpoint for SSRF vulnerabilities and validate URL scheme handling"
)
```

---

## 5. Hooks

Hooks are configured in [.claude/settings.json](settings.json) and run automatically on tool usage.

### TypeScript Type-Check Hook (PostToolUse)

**Status**: ✅ Already configured

**Triggers**: After `Edit` or `Write` tool usage

**Action**: Runs `npx tsc --noEmit` to catch type errors immediately

**Behavior**:
- Runs automatically after file edits
- Continues on error (won't block workflow)
- Displays type errors in output

**Example:**
```
[PostToolUse Hook] Running: npx tsc --noEmit
src/client/renderer/chunk-cache.ts:42:5 - error TS2322: Type 'string' is not assignable to type 'number'.
```

### Protected Files Hook (PreToolUse)

**Status**: ✅ Already configured

**Triggers**: Before `Edit` or `Write` on protected files:
- `src/shared/rdo-types.ts`
- `src/server/rdo.ts`
- `BuildingClasses/facility_db.csv`
- `src/__fixtures__/**`

**Action**: Requires user confirmation before modifying

**Behavior**:
- Displays warning message
- Waits for user approval
- Blocks edit if denied

**Example:**
```
[PreToolUse Hook] ⚠️  WARNING: This file is protected per CLAUDE.md.
Confirm before editing: rdo-types.ts

Allow this operation? [y/N]
```

---

## 6. Permissions

Configured in [.claude/settings.json](settings.json) under `permissions.allow`.

**Allowed tools/commands:**
- `Read`, `Grep`, `Glob` - Always allowed
- `npm test*` - Run tests
- `npm run*` - Run build/dev scripts
- `git status*`, `git diff*`, `git log*` - Git inspection
- `git add*`, `git commit*` - Git operations (for `/commit` skill)
- `npx tsc*` - TypeScript compiler

**Blocked by default** (require confirmation):
- `git push` - Prevents accidental pushes
- `rm -rf` - Prevents destructive operations
- File operations outside project directory

---

## 7. Testing the Setup

### Test MCP Servers

**Playwright MCP:**
```bash
# Claude Code will test Playwright MCP when you run:
/e2e-test login
```

**GitHub MCP:**
```bash
# Test GitHub CLI (used by GitHub MCP)
gh api user
gh repo view
```

**context7 MCP:**
```bash
# Will be tested automatically when Claude looks up TypeScript docs
# No manual test needed
```

### Test Hooks

**Type-check hook:**
```bash
# Edit any TypeScript file via Claude Code
# Hook will run automatically after edit
```

**Protected files hook:**
```bash
# Try editing rdo-types.ts via Claude Code
# Hook will prompt for confirmation
```

### Test Skills

**E2E test skill:**
```bash
# Run login test
/e2e-test login --debug-overlay --save-screenshots
```

**Commit skill:**
```bash
# Make some code changes, then:
/commit
```

---

## 8. Troubleshooting

### MCP Servers Not Loading

**Issue**: MCP servers don't appear in Claude Code

**Solution**:
```bash
# Verify .mcp.json is valid JSON
cat .mcp.json | jq .

# Restart Claude Code
# MCP servers load on startup
```

### GitHub MCP Authentication Error

**Issue**: GitHub MCP fails with "authentication required"

**Solution**:
```bash
# Re-authenticate GitHub CLI
gh auth login

# Verify authentication
gh auth status
```

### Playwright MCP Installation Error

**Issue**: Playwright MCP fails on first use

**Solution**:
```bash
# Manually install Playwright
npm install -g playwright
npx playwright install chromium

# Try again
/e2e-test login
```

### Hooks Not Running

**Issue**: TypeScript type-check hook doesn't run after edits

**Solution**:
```bash
# Verify settings.json is valid
cat .claude/settings.json | jq .

# Check if npx tsc works
npx tsc --noEmit

# Restart Claude Code
```

### Skills Not Found

**Issue**: `/e2e-test` skill not recognized

**Solution**:
```bash
# Verify skill file exists
ls .claude/skills/e2e-test/SKILL.md

# Check YAML front matter is valid
head -10 .claude/skills/e2e-test/SKILL.md

# Restart Claude Code to reload skills
```

---

## 9. Directory Structure

After setup, your `.claude` directory should look like this:

```
.claude/
├── settings.json              # Hooks and permissions
├── SETUP.md                   # This file
├── skills/
│   └── e2e-test/
│       └── SKILL.md          # E2E test automation
└── agents/
    ├── performance-analyzer.md  # Performance profiling
    └── security-reviewer.md     # Security auditing

.mcp.json                     # MCP server configuration (project root)

screenshots/                  # E2E test screenshots (git-ignored)
```

---

## 10. Next Steps

1. **Install plugins**:
   ```bash
   claude plugin install anthropic-agent-skills
   claude plugin install commit-commands
   ```

2. **Authenticate GitHub**:
   ```bash
   gh auth login
   ```

3. **Test E2E workflow**:
   ```bash
   /e2e-test login --debug-overlay --save-screenshots
   ```

4. **Make a commit**:
   ```bash
   # Edit some code
   /commit
   ```

5. **Review automations** in this directory:
   - [skills/e2e-test/SKILL.md](skills/e2e-test/SKILL.md)
   - [agents/performance-analyzer.md](agents/performance-analyzer.md)
   - [agents/security-reviewer.md](agents/security-reviewer.md)

---

## 11. Documentation References

- **Claude Code docs**: https://docs.claude.ai/claude-code
- **MCP servers**: https://modelcontextprotocol.io/servers
- **Playwright MCP**: https://github.com/microsoft/playwright
- **GitHub CLI**: https://cli.github.com/
- **Project docs**: [doc/](../doc/)
- **CLAUDE.md**: [CLAUDE.md](../CLAUDE.md)

---

## 12. Getting Help

**For automation issues**:
- Check this SETUP.md file
- Review `.claude/settings.json` configuration
- Check `.mcp.json` MCP server configuration

**For project issues**:
- See [CLAUDE.md](../CLAUDE.md) for project rules
- See [doc/E2E-TESTING.md](../doc/E2E-TESTING.md) for E2E testing
- See [doc/BACKLOG.md](../doc/BACKLOG.md) for known issues

**For Claude Code help**:
```bash
claude --help
/help
```

**Report issues**:
- Claude Code: https://github.com/anthropics/claude-code/issues
- Project: https://github.com/Crazysky/SPO-WebClient/issues
