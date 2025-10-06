#!/bin/bash
# Archive old tools that were generated before the fixes
# This will allow the system to start fresh with properly generated tools

set -e

TOOLS_DIR="packages/agents/src/generated-tools"
ARCHIVE_DIR="$TOOLS_DIR/archive-$(date +%Y%m%d-%H%M%S)"

echo "Creating archive directory: $ARCHIVE_DIR"
mkdir -p "$ARCHIVE_DIR/code"
mkdir -p "$ARCHIVE_DIR/manifests"

# Count tools before archiving
CODE_COUNT=$(ls -1 "$TOOLS_DIR/code" 2>/dev/null | wc -l || echo 0)
MANIFEST_COUNT=$(ls -1 "$TOOLS_DIR/manifests" 2>/dev/null | wc -l || echo 0)

echo "Found $CODE_COUNT tool code files and $MANIFEST_COUNT manifest files"

if [ "$CODE_COUNT" -gt 0 ]; then
  echo "Archiving code files..."
  mv "$TOOLS_DIR/code/"* "$ARCHIVE_DIR/code/" 2>/dev/null || true
fi

if [ "$MANIFEST_COUNT" -gt 0 ]; then
  echo "Archiving manifest files..."
  mv "$TOOLS_DIR/manifests/"* "$ARCHIVE_DIR/manifests/" 2>/dev/null || true
fi

# Keep the directories
mkdir -p "$TOOLS_DIR/code"
mkdir -p "$TOOLS_DIR/manifests"

echo "✓ Archived old tools to: $ARCHIVE_DIR"
echo "✓ System will now generate fresh tools with the latest fixes"
echo ""
echo "To restore archived tools if needed:"
echo "  mv $ARCHIVE_DIR/code/* $TOOLS_DIR/code/"
echo "  mv $ARCHIVE_DIR/manifests/* $TOOLS_DIR/manifests/"
