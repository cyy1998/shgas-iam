#!/bin/sh
# Linux sandbox initialization; keep package-manager input separate from the agent prompt.
set -eu

git config --global --add safe.directory "$PWD"
node scripts/sandcastle/workspace-dependencies.mts
HUSKY=0 pnpm install --frozen-lockfile
