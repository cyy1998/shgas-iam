export const OPEN_SPEC_CHECK_COMMAND = "pnpm run check:openspec --staged";

export const OPEN_SPEC_SENSITIVE_PATTERN = `{${[
  "openspec/**/*",
  "scripts/check-openspec*.ts",
  "scripts/__tests__/check-openspec*.test.ts",
  "scripts/__tests__/nano-staged-config.test.ts",
  "scripts/__tests__/install-git-hooks.test.ts",
  "scripts/__tests__/precommit-integration.test.ts",
  "scripts/install-git-hooks.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "nano-staged.mjs",
].join(",")}}`;

export default {
  [OPEN_SPEC_SENSITIVE_PATTERN]: () => OPEN_SPEC_CHECK_COMMAND,
};
