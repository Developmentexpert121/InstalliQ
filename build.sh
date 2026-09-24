#!/bin/bash
set -e

echo "=== InstalliQ.ai Build ==="
echo "Node: $(node -v) | npm: $(npm -v)"
echo ""

echo "Building app..."
export NODE_OPTIONS="--max-old-space-size=1536"
npx tsx script/build.ts

echo ""
echo "Build complete! Run with: NODE_ENV=production node dist/index.cjs"
