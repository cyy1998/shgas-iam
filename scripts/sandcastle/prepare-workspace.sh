#!/bin/sh
# Linux sandbox initialization; keep package-manager input separate from the agent prompt.
set -eu

git config --global --add safe.directory "$PWD"
node scripts/sandcastle/workspace-dependencies.mts
if [ -n "${IAM_AFK_PNPM_STORE_DIR:-}" ]; then
  HUSKY=0 pnpm install --frozen-lockfile --store-dir "$IAM_AFK_PNPM_STORE_DIR"
else
  HUSKY=0 pnpm install --frozen-lockfile
fi
