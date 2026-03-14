#!/bin/bash

# Design Style Skill Verification Script
# Checks if the skill is properly configured

echo "🔍 Verifying Design Style Skill Configuration..."
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
PASS=0
FAIL=0

# Function to check file exists
check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} Found: $1"
    ((PASS++))
    return 0
  else
    echo -e "${RED}✗${NC} Missing: $1"
    ((FAIL++))
    return 1
  fi
}

# Function to check directory exists
check_dir() {
  if [ -d "$1" ]; then
    echo -e "${GREEN}✓${NC} Directory exists: $1"
    ((PASS++))
    return 0
  else
    echo -e "${RED}✗${NC} Directory missing: $1"
    ((FAIL++))
    return 1
  fi
}

echo "1. Checking Skill Structure..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SKILL_DIR=".claude/skills/design-style"
check_dir "$SKILL_DIR"
check_file "$SKILL_DIR/SKILL.md"
check_file "$SKILL_DIR/README.md"
check_file "$SKILL_DIR/reference.md"
check_file "$SKILL_DIR/styles-mapping.json"
check_dir "$SKILL_DIR/scripts"
check_file "$SKILL_DIR/scripts/list-styles.sh"

echo ""
echo "2. Checking Prompts Directory..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PROMPTS_DIR="prompts"
if check_dir "$PROMPTS_DIR"; then
  PROMPT_COUNT=$(find "$PROMPTS_DIR" -name "*.md" -type f | wc -l)
  if [ "$PROMPT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Found $PROMPT_COUNT design system prompts"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} No .md files found in prompts directory"
    ((FAIL++))
  fi
fi

echo ""
echo "3. Validating SKILL.md Format..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SKILL_FILE="$SKILL_DIR/SKILL.md"
if [ -f "$SKILL_FILE" ]; then
  # Check for required YAML frontmatter
  if grep -q "^---$" "$SKILL_FILE"; then
    echo -e "${GREEN}✓${NC} YAML frontmatter present"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} Missing YAML frontmatter"
    ((FAIL++))
  fi

  # Check for required fields
  if grep -q "^name:" "$SKILL_FILE"; then
    NAME=$(grep "^name:" "$SKILL_FILE" | sed 's/name: //')
    echo -e "${GREEN}✓${NC} Skill name: $NAME"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} Missing 'name' field"
    ((FAIL++))
  fi

  if grep -q "^description:" "$SKILL_FILE"; then
    echo -e "${GREEN}✓${NC} Description field present"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} Missing 'description' field"
    ((FAIL++))
  fi
fi

echo ""
echo "4. Checking Sample Prompts..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_file "prompts/Neo-brutalism.md"
check_file "prompts/ModernDark.md"
check_file "prompts/Cyberpunk.md"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Results:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Passed: ${GREEN}$PASS${NC}"
echo -e "Failed: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed! Skill is properly configured.${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Try asking Claude: 'What design styles do you have?'"
  echo "2. Test with: 'Create a button with neo-brutalist style'"
  echo "3. Or: 'Build a landing page with modern dark aesthetic'"
  exit 0
else
  echo -e "${RED}✗ Some checks failed. Please review the errors above.${NC}"
  exit 1
fi
