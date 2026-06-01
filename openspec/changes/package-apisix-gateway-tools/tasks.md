## 1. Package Boundary

- [x] 1.1 Add `gateway/*` to `pnpm-workspace.yaml` so `gateway/apisix` is discovered as a workspace package.
- [x] 1.2 Create `gateway/apisix/package.json` with private package metadata for `@iam/gateway-apisix`.
- [x] 1.3 Add package scripts for `validate`, `diff`, `apply`, `test`, `lint`, and `typecheck`.
- [x] 1.4 Move APISIX sync tool dependencies and devDependencies from the root package to `@iam/gateway-apisix` where they are only used by that package.

## 2. Command Compatibility

- [x] 2.1 Update root `gateway:apisix` and `gateway:apisix:*` scripts to delegate to `@iam/gateway-apisix`.
- [x] 2.2 Verify root command argument passthrough still supports `pnpm gateway:apisix:validate -- --env dev:iam`.
- [x] 2.3 Verify package-level commands support direct filtered usage such as `pnpm --filter @iam/gateway-apisix validate -- --env dev:iam`.

## 3. Validation Lifecycle

- [x] 3.1 Run `pnpm --filter @iam/gateway-apisix test` and fix package-local test setup issues.
- [x] 3.2 Run `pnpm --filter @iam/gateway-apisix typecheck` and fix package-local type issues.
- [x] 3.3 Run `pnpm --filter @iam/gateway-apisix lint` and fix package-local lint issues.
- [x] 3.4 Run the narrow root compatibility command for manifest validation.

## 4. Documentation and Spec Verification

- [x] 4.1 Update `gateway/apisix/README.md` if package-level commands or validation workflow need to be documented.
- [x] 4.2 Run `openspec status --change package-apisix-gateway-tools` and confirm the change is apply-ready.
- [x] 4.3 Run the relevant OpenSpec validation command for `package-apisix-gateway-tools`.
