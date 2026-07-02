# Suggested Commands

- Install/setup: `pnpm install` from repo root.
- All workspace tasks: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm e2e`, `pnpm typecheck`.
- Repo guards: `pnpm check:docs`, `pnpm check:env-names`.
- Public API: `pnpm --filter @iam/api dev`, `pnpm --filter @iam/api serve`, `pnpm --filter @iam/api lint`, `pnpm --filter @iam/api test`, `pnpm --filter @iam/api typecheck`.
- Admin API: `pnpm --filter @iam/admin-api dev`, `pnpm --filter @iam/admin-api serve`, `pnpm --filter @iam/admin-api lint`, `pnpm --filter @iam/admin-api test`, `pnpm --filter @iam/admin-api typecheck`.
- OIDC provider: `pnpm --filter @iam/oidc-provider dev`, `pnpm --filter @iam/oidc-provider serve`, `pnpm --filter @iam/oidc-provider lint`, `pnpm --filter @iam/oidc-provider test`, `pnpm --filter @iam/oidc-provider typecheck`.
- Worker: `pnpm --filter @iam/worker dev`, `pnpm --filter @iam/worker serve`, `pnpm --filter @iam/worker lint`, `pnpm --filter @iam/worker test`, `pnpm --filter @iam/worker typecheck`, `pnpm --filter @iam/worker user-profile:backfill`, `pnpm --filter @iam/worker user-profile:repair`.
- Admin frontend: `pnpm --filter @iam/admin dev`, `pnpm --filter @iam/admin build`, `pnpm --filter @iam/admin lint`, `pnpm --filter @iam/admin test`, `pnpm --filter @iam/admin e2e`, `pnpm --filter @iam/admin typecheck`, `pnpm --filter @iam/admin format`.
- SSO frontend: `pnpm --filter @iam/sso dev`, `pnpm --filter @iam/sso build`, `pnpm --filter @iam/sso lint`, `pnpm --filter @iam/sso test`, `pnpm --filter @iam/sso e2e`, `pnpm --filter @iam/sso typecheck`, `pnpm --filter @iam/sso format`.
- DB package: `pnpm --filter @iam/db db:push`, `pnpm --filter @iam/db db:generate`, `pnpm --filter @iam/db db:migrate`, `pnpm --filter @iam/db db:check`.
- Jobs/read-model packages: `pnpm --filter @iam/jobs <lint|test|typecheck>`, `pnpm --filter @iam/user-profile-read-model <lint|test|typecheck>`.
- API compatibility DB wrappers: `pnpm --filter @iam/api db:push`, `pnpm --filter @iam/api db:generate`, `pnpm --filter @iam/api db:migrate`.
- Historical migration: `pnpm --filter @iam/api migrate:mysql-to-postgres`.
- APISIX gateway: `pnpm gateway:apisix`, `pnpm gateway:apisix:validate`, `pnpm gateway:apisix:diff`, `pnpm gateway:apisix:apply`; for manifest validation prefer `pnpm gateway:apisix:validate -- --env <env>:<app>`.
- Fast local search: use `rg` and `rg --files`.