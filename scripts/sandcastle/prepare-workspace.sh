#!/bin/sh
# Linux sandbox initialization; keep package-manager input separate from the agent prompt.
set -eu

git config --global --add safe.directory "$PWD"
HUSKY=0 pnpm install --frozen-lockfile

# Umi's bundled rimraf does not clear a busy mount root. Remove only its contents
# so repeated setup after dependency/config/route changes cannot retain stale types.
for app in admin sso; do
  for directory in .umi .umi-production .umi-test; do
    generated="apps/$app/src/$directory"
    mkdir -p "$generated"
    find "$generated" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  done
done
pnpm --filter @iam/admin --filter @iam/sso run setup
