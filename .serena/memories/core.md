# Core

- Canonical repo guidance lives in `AGENTS.md`; Serena memories are compact entry points and stale-fact traps, not full copies.
- Monorepo: `pnpm` workspace + Turborepo at `D:/projects/iam-service`.
- Workspace packages: `apps/*`, `packages/*`, and `gateway`.
- Runtime apps: public IAM backend `apps/api`; admin backend `apps/admin-api`; OIDC provider `apps/oidc-provider`; admin frontend `apps/admin`; SSO portal `apps/sso`.
- Shared packages: `packages/api-core` for backend infrastructure; `packages/contracts` for stable cross-app enums/contracts; `packages/db` for Drizzle/PostgreSQL schema/client/query helpers; `packages/domain` for shared domain modules.
- Gateway package: `gateway` (`@iam/gateway-apisix`).
- Avoid generated/vendor output unless the task is explicitly about it: Umi `.umi`/`.umi-production`, frontend `dist/`, and backend static API docs assets.
- For backend app/tier/route structure, read `mem:backend/core`.
- For admin/SSO frontend layout and validation expectations, read `mem:frontend/core`.
- For Drizzle schema, migrations, relations, and query conventions, read `mem:db/core`.
- For APISIX gateway manifests and sync commands, read `mem:gateway/core`.
- For pinned tooling/framework versions, read `mem:tech_stack`.
- For project commands, read `mem:suggested_commands`.
- For code style and behavioral conventions, read `mem:conventions`.
- For completion/verification expectations, read `mem:task_completion`.