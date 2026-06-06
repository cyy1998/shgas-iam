# Task Completion

- Validate with the narrowest meaningful commands for touched packages; broaden when shared contracts/db/api-core behavior affects multiple apps.
- Backend/shared package baseline: `pnpm --filter <pkg> lint`, `pnpm --filter <pkg> test`, `pnpm --filter <pkg> typecheck`.
- Backend tests use package scripts (`bun test --parallel`); keep module mocks local to each test file.
- Frontend baseline: `pnpm --filter @iam/admin typecheck` or `pnpm --filter @iam/sso typecheck`; run `build`/`format` when UI/build/format-sensitive work changes.
- tRPC changes consumed by admin need both `pnpm --filter @iam/admin-api typecheck` and `pnpm --filter @iam/admin typecheck`.
- Drizzle schema changes need an appropriate DB command: local sync via `pnpm --filter @iam/db db:push`, or migration flow via `db:generate` + `db:migrate`; also check package type/lint as relevant.
- Changes in `packages/contracts`, `packages/api-core`, or `packages/db` should typecheck the shared package and directly affected apps.
- Public API smoke targets: Scalar UI `http://localhost:30000`, or tier `/doc` endpoints.
- Admin API smoke targets: Scalar UI `http://localhost:30001`, `/admin/doc`, `/rpc/doc`.
- UI changes should be smoke-tested in the affected `admin` or `sso` flow.
- After Serena onboarding/memory edits, user can run `serena memories check` from repo root.