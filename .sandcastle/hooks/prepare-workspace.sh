#!/bin/sh
set -eu

if [ -n "${IAM_AFK_PNPM_STORE_DIR:-}" ]; then
  set -- --store-dir "$IAM_AFK_PNPM_STORE_DIR"
else
  set --
fi
HUSKY=0 pnpm install --frozen-lockfile --prefer-offline "$@"
