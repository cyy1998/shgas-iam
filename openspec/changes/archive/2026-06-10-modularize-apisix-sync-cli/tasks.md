## 1. Package Entry And Dependencies

- [x] 1.1 Add `commander` as a runtime dependency of `@iam/gateway-apisix`.
- [x] 1.2 Update `gateway/apisix/package.json` scripts to run `bun src/cli.ts`, `bun src/cli.ts validate`, `bun src/cli.ts diff`, and `bun src/cli.ts apply`.
- [x] 1.3 Update `gateway/apisix/tsconfig.json` and lint scripts to include `src/**/*.ts` instead of `scripts/**/*.ts`.
- [x] 1.4 Remove the old `gateway/apisix/scripts/apisix-sync.ts` entrypoint and do not add a compatibility shim.

## 2. Source Module Structure

- [x] 2.1 Create `gateway/apisix/src/` with `cli.ts`, `commands.ts`, `index.ts`, `types.ts`, `resources.ts`, `manifest.ts`, `env.ts`, `ownership-policy.ts`, `planner.ts`, `applier.ts`, `apisix-admin-client.ts`, `normalize.ts`, and `output.ts`.
- [x] 2.2 Move APISIX resource definitions into `resources.ts` as the single source for kind, manifest file, top key, Admin API endpoint, ID fields, sync order, top-level references, and compare rules.
- [x] 2.3 Implement `createEmptyResourceMap()` from `resourceDefinitions` so resource containers no longer repeat the resource list manually.
- [x] 2.4 Move manifest scope parsing, package-root manifest path resolution, YAML loading, required resource-file handling, and env rendering into `manifest.ts` and `env.ts`.
- [x] 2.5 Move repo/dynamic/unmanaged ownership checks and scope checks into `ownership-policy.ts` without exposing CLI-configurable ownership options.
- [x] 2.6 Move diff normalization into `normalize.ts` and apply resource-specific generated-field/default-value rules from `resources.ts`.

## 3. Validation

- [x] 3.1 Create `src/validators/` with a static validator registry exported from `validators/index.ts`.
- [x] 3.2 Implement required ID, duplicate ID, ownership label, scope label, reference, sensitive value, and trusted proxy validators.
- [x] 3.3 Convert reference validation to use top-level `references` metadata from `resources.ts`.
- [x] 3.4 Convert sensitive-value non-secret allowlist entries into a code-level rule table.
- [x] 3.5 Preserve trusted proxy behavior: unresolved `${VAR}` placeholders are allowed, while rendered `0.0.0.0/0` and `::/0` fail validation.

## 4. CLI And Command Orchestration

- [x] 4.1 Implement Commander wiring in `src/cli.ts` with `validate`, `diff`, and `apply` subcommands.
- [x] 4.2 Implement `runValidate`, `runDiff`, and `runApply` in `src/commands.ts`, keeping `src/index.ts` side-effect free.
- [x] 4.3 Require explicit scope through `--env <env:app>` or `APISIX_MANIFEST_ENV`; fail when both are missing.
- [x] 4.4 Reject env-only scopes and invalid scope segments using the agreed lowercase letter, digit, and short-hyphen rule.
- [x] 4.5 Preserve `--manifest-dir`, `--env-file`, `--render-env`, `--json`, `--admin-url`, `--admin-key`, `--dry-run`, and `--prune` behavior where applicable.
- [x] 4.6 Preserve `--admin-url` resolution priority as `--admin-url` > `APISIX_ADMIN_URL` > `http://127.0.0.1:9180/apisix/admin`.
- [x] 4.7 Preserve `--admin-key` resolution priority as `--admin-key` > `APISIX_ADMIN_KEY`, and fail diff/apply when absent.

## 5. Planning, Applying, And Output

- [x] 5.1 Keep `creates`, `updates`, and `deletes` as separate plan groups.
- [x] 5.2 Replace `ignoredDynamic`, `ignoredOutOfScope`, and `ignoredUnmanaged` with unified `ignored[]` entries using `reason: "dynamic" | "out_of_scope" | "unmanaged"`.
- [x] 5.3 Replace grouped `applied.created/updated/deleted` with unified `applied[]` entries using `action: "create" | "update" | "delete"`.
- [x] 5.4 Ensure dry-run apply never writes to APISIX and emits `applied: []`.
- [x] 5.5 Preserve prune behavior so deletes are executed only when `--prune` is explicit and only for repo-managed objects inside the selected scope.
- [x] 5.6 Add a lightweight `Reporter` abstraction in `output.ts`, with a default console-backed reporter for CLI usage.
- [x] 5.7 Keep human-readable output useful by grouping ignored entries by reason and applied entries by action.

## 6. APISIX Admin Client

- [x] 6.1 Move Admin API access into `apisix-admin-client.ts`.
- [x] 6.2 Support fetch injection while defaulting to `globalThis.fetch`.
- [x] 6.3 Preserve request headers, URL joining, PUT/DELETE semantics, non-2xx error behavior, and APISIX list response unwrap behavior.
- [x] 6.4 Keep APISIX response unwrap helpers internal to the client module unless tests require a narrower internal export.

## 7. Tests

- [x] 7.1 Move tests to `gateway/apisix/src/__tests__/`.
- [x] 7.2 Preserve existing validation tests for checked-in manifests, broken references, duplicate IDs, secret-looking fields, APISIX `limit-req` variable keys, trusted proxy full-CIDR rejection, and env rendering.
- [x] 7.3 Preserve existing planning/apply tests for dry-run behavior, prune behavior, dynamic registry avoidance, unmanaged avoidance, and out-of-scope repo avoidance.
- [x] 7.4 Add CLI/command tests for missing scope, env-only scope rejection, invalid scope segment rejection, and `APISIX_MANIFEST_ENV` fallback.
- [x] 7.5 Add JSON output tests for unified `ignored[]`, unified `applied[]`, and dry-run `applied: []`.
- [x] 7.6 Add Admin API client tests covering fetch injection, `X-API-KEY` header, URL joining, non-2xx errors, and list response unwrap.

## 8. Documentation And Verification

- [x] 8.1 Update `gateway/apisix/README.md` to show `src/` as the sync tool source directory.
- [x] 8.2 Update README command examples to require explicit `--env <env:app>` or document `APISIX_MANIFEST_ENV`.
- [x] 8.3 Document the breaking JSON output changes for `ignored[]` and `applied[]`.
- [x] 8.4 Run `pnpm --filter @iam/gateway-apisix test`.
- [x] 8.5 Run `pnpm --filter @iam/gateway-apisix typecheck`.
- [x] 8.6 Run `pnpm --filter @iam/gateway-apisix lint`.
- [x] 8.7 Smoke-test at least one root gateway command, for example `pnpm gateway:apisix:validate -- --env dev:iam`.
