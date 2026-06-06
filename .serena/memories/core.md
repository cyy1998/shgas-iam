# Core

- Monorepo: `pnpm` workspace + Turborepo at `/home/caiyi/projects/iam-service`.
- Workspace roots: `apps/*`, `packages/*`, `gateway/*`.
- Runtime apps: public IAM backend `apps/api`; admin backend `apps/admin-api`; admin frontend `apps/admin`; SSO portal `apps/sso`.
- Shared packages: `packages/api-core` for backend infrastructure; `packages/contracts` for stable cross-app enums/contracts; `packages/db` for Drizzle/PostgreSQL schema/client/query helpers; `packages/domain` for shared domain modules.
- Gateway package: `gateway/apisix` manages APISIX manifests and sync scripts.
- Avoid editing generated/frontend output: `apps/admin/src/.umi/`, `apps/admin/src/.umi-production/`, `apps/sso/src/.umi/`, `apps/admin/dist/`, `apps/sso/dist/`.
- Avoid vendored API docs assets under `apps/api/static/` and `apps/admin-api/static/` unless the task is explicitly about those assets.
- For backend app/tier/route structure, read `mem:backend/core`.
- For admin/SSO frontend layout and validation expectations, read `mem:frontend/core`.
- For Drizzle schema, migrations, relations, and query conventions, read `mem:db/core`.
- For APISIX gateway manifests and sync commands, read `mem:gateway/core`.
- For pinned tooling/framework versions, read `mem:tech_stack`.
- For project commands, read `mem:suggested_commands`.
- For code style and behavioral conventions, read `mem:conventions`.
- For completion/verification expectations, read `mem:task_completion`.