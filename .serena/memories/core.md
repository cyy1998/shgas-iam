# Core

- Canonical repo entry point is `AGENTS.md`; it is a short index. Detailed current rules live under `docs/`.
- Before repository development or lifecycle work, route the task through `docs/workflows/index.md`; workflow selects stage gates, skills select execution methods, and OpenSpec/tasks define scope.
- Monorepo: `pnpm` workspace + Turborepo at `/home/caiyi/projects/shgas-iam`.
- Workspace packages: `apps/*`, `packages/*`, and `gateway`.
- Runtime apps: public IAM backend `apps/api`; admin backend `apps/admin-api`; OIDC provider `apps/oidc-provider`; background worker `apps/worker`; admin frontend `apps/admin`; SSO portal `apps/sso`.
- Shared packages: `packages/api-core` for backend infrastructure; `packages/contracts` for stable cross-app enums/contracts; `packages/db` for Drizzle/PostgreSQL schema/client/query helpers; `packages/domain` for shared domain DTO/errors/audit helpers; `packages/jobs` for BullMQ helpers; `packages/user-profile-read-model` for user-profile producer/query/worker logic.
- Gateway package: `gateway` (`@iam/gateway-apisix`).
- Avoid generated/vendor output unless the task explicitly targets it: Umi `.umi`/`.umi-production`, frontend `dist/`, and backend static API docs assets.
- For backend app boundaries, composition, use-cases/services, routes, and workers, read `mem:backend/core`.
- For admin/SSO frontend layout and validation expectations, read `mem:frontend/core`.
- For Drizzle schema, migrations, relations, and query conventions, read `mem:db/core`.
- For APISIX app-scoped manifests and sync commands, read `mem:gateway/core`.
- For pinned tooling/framework versions, read `mem:tech_stack`.
- For project commands, read `mem:suggested_commands`.
- For code style and behavioral conventions, read `mem:conventions`.
- For completion/verification expectations, read `mem:task_completion`.