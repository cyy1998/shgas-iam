# Task Completion

- Validate with the narrowest meaningful commands for touched packages; broaden when shared contracts/db/api-core behavior affects multiple apps.
- Bun API/shared package baseline: `pnpm --filter <pkg> lint`, `pnpm --filter <pkg> test`, `pnpm --filter <pkg> typecheck`.
- Backend service/handler/adapter tests should construct factories with DI fakes instead of `mock.module` for app-local service/repository/db/redis/logger modules.
- OIDC provider baseline: `pnpm --filter @iam/oidc-provider lint`, `pnpm --filter @iam/oidc-provider test`, `pnpm --filter @iam/oidc-provider typecheck`.
- Frontend baseline: `pnpm --filter @iam/admin typecheck` or `pnpm --filter @iam/sso typecheck`; run `build`/`format` when UI/build/format-sensitive work changes.
- tRPC changes consumed by admin need both `pnpm --filter @iam/admin-api typecheck` and `pnpm --filter @iam/admin typecheck`.
- Drizzle schema changes need an appropriate DB command: local sync via `pnpm --filter @iam/db db:push`, or migration flow via `db:generate` + `db:migrate`; also check package type/lint as relevant.
- Changes in `packages/contracts`, `packages/api-core`, `packages/domain`, or `packages/db` should typecheck the shared package and directly affected apps.
- APISIX gateway manifest/script changes require `pnpm gateway:apisix:validate -- --env <env>:<app>` plus `pnpm --filter @iam/gateway-apisix typecheck` or `test` when scripts changed.
- Public API smoke targets: Scalar UI `http://localhost:30000`, or tier `/doc` endpoints.
- Admin API smoke targets: Scalar UI `http://localhost:30001`, `/admin/doc`, `/rpc/doc`.
- UI changes should be smoke-tested in the affected `admin` or `sso` flow.
- After Serena onboarding/memory edits, user can run `serena memories check` from repo root.