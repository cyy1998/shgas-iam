# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` workspace + Turborepo monorepo. Runtime apps live under `apps/`, shared workspace packages live under `packages/`, and gateway tooling lives under `gateway/`.

- `apps/api`: Bun + Hono public IAM backend (`@iam/api`). Main code is in `src/`, with public/open/internal/sso/auth routes under `src/routes/`, app-side domain logic under `src/services/`, app-specific utilities under `src/lib/`, app composition wiring under `src/composition/`, and env validation in `src/env.ts`.
- `apps/admin-api`: Bun + Hono admin backend (`@iam/admin-api`). Admin REST routes live under `src/routes/admin/`, tRPC entry routes under `src/routes/trpc/`, admin domain logic under `src/services/`, app composition wiring under `src/composition/`, and tRPC router composition under `src/trpc/`.
- `apps/oidc-provider`: Node.js 24 + `oidc-provider` app (`@iam/oidc-provider`). Composition lives under `src/composition/`, OIDC provider wiring under `src/provider/`, Session Kernel adapters under `src/session/`, persistence under `src/storage/` and `src/stores/`, and env validation in `src/env.ts`.
- `apps/worker`: Bun background job runtime (`@iam/worker`). Runtime composition lives under `src/composition/`, worker module selection under `src/modules/`, health/Bull Board HTTP support under `src/http/`, command-only backfill/repair entrypoints under `src/commands/`, and env validation in `src/env.ts`.
- `apps/admin`: Umi Max + React management frontend. Pages live in `src/pages/`, reusable UI in `src/components/`, tRPC client setup in `src/lib/api-client.ts`, and page-side API wrappers in `src/services/`.
- `apps/sso`: Umi Max + React SSO portal. Pages live in `src/pages/`, assets in `src/assets/`, API wrappers in `src/services/`, and shared browser helpers in `src/lib/` and `src/utils/`.
- `packages/api-core/src`: shared backend infrastructure such as `createApp`, route factories, OpenAPI helpers, response helpers, errors, middlewares, Redis, logging, observability, Session Kernel, UnitOfWork, and tRPC utilities.
- `packages/contracts/src`: shared enums and stable contracts consumed across apps and packages.
- `packages/domain/src`: shared domain DTO schemas, DTO types, audit helpers, and reusable domain/business errors consumed by backend apps.
- `packages/db/src`: Drizzle schema, relations, migrations, singleton client, and query helpers. Schema and relation domains currently include `core` and `log`, with shared column helpers under `schema/_shard/`.
- `packages/jobs/src`: shared BullMQ connection, queue, worker, job ID, and default option helpers.
- `packages/user-profile-read-model/src`: versioned user-profile read model, dirty marker, producer/query APIs, repositories, and worker module consumed by API/admin-api/worker.
- `gateway`: APISIX gateway manifest package (`@iam/gateway-apisix`) with dev/prod manifests, config templates, and sync/validate/diff/apply scripts.
- `docker/`: local dependency stacks plus dev/prod compose files.
- `docs/`: workflow guides, architecture notes, plans, specs, audits, and remediation docs. Older plans may mention previous layouts; current database code is Drizzle + PostgreSQL in `packages/db`.
- `openspec/`: active OpenSpec changes, archived changes, main specs, and OpenSpec project configuration.
- `scripts/`: repo-level utility scripts.

Do not hand-edit generated frontend directories such as `apps/admin/src/.umi/`, `apps/admin/src/.umi-production/`, `apps/sso/src/.umi/`, or `apps/sso/src/.umi-production/`. Avoid editing frontend build outputs under `apps/admin/dist/` and `apps/sso/dist/`. Avoid editing vendored API documentation assets in `apps/api/static/` or `apps/admin-api/static/` unless the task is specifically about those assets.

## Backend Architecture Notes
- API tiers are declared per backend app in `apps/api/app.config.ts` and `apps/admin-api/app.config.ts`.
- `apps/api` currently owns `/public`, `/open`, `/internal`, `/sso`, and `/auth`.
- `apps/admin-api` currently owns `/admin` and `/rpc`; `/rpc` maps to the `src/routes/trpc` route directory.
- `createApp` lives in `packages/api-core` and mounts materialized route and middleware records supplied by each app composition root. It remains app-agnostic and does not own app-specific DI wiring.
- Keep backend `src/app.ts` files focused on app assembly: import env, app config, app-local logger, call the app-local composition root, and pass materialized routes and middlewares to `createApp`.
- App-local infrastructure singletons belong under `src/lib/`, for example `@api/lib/logger`, `@admin-api/lib/logger`, `@worker/lib/logger`, and `src/lib/infra/redis.ts`.
- Production runtime, repository, service, route, middleware, and integration instances are created under app-local `src/composition/` modules, organized by `runtime`, `repositories`, `tx`, `services`, `routes`, and `middlewares`.
- Backend replaceable modules should export factories and return types, for example `createUserService(deps)` and `type UserService = ReturnType<typeof createUserService>`. Do not reintroduce bound production service/repository singletons.
- Consumer-owned `*.port.ts` files define outbound behavior a service/use-case consumes. Keep enums, DTO schemas, domain errors, business constants, and pure helpers as static imports rather than DI deps.
- Tier-level `_middleware.ts` files should stay thin and expose middleware factories or compose injected middleware arrays; shared authentication handlers belong in app-level `src/middlewares/*.handler.ts` files and are materialized by composition.
- REST-only route modules should use `*.routes.ts`, `*.handlers.ts`, and `*.type.ts`. Route `*.index.ts` files should expose router factories that receive materialized handlers/adapters. Admin REST + tRPC route modules should share `*.adapter.ts` operation factories and expose thin `*.trpc.ts` modules.
- Backend app `tsconfig.json` files should include Bun runtime types and exclude `scripts`; backend app ESLint configs should ignore `scripts/**`.

## Shared Contracts & Database
- Put cross-app enums and stable constants in `packages/contracts`; put shared DTO schemas, DTO types, audit helpers, and reusable business errors in `packages/domain`; put shared BullMQ helpers in `packages/jobs`; put user-profile read-model producer/query/worker logic in `packages/user-profile-read-model`. App-private enums, schemas, and errors may stay inside the owning app.
- Repositories use Drizzle from `@iam/db` and are created through `createXRepository(db)` factories bound to either the root `DbClient` or a transaction `DbClient`; business service methods should not pass `tx` arguments to repository calls.
- Transactional backend workflows should use the app-local `UnitOfWork`. Transaction callbacks receive tx-bound repository and audit writer ports; Redis/cache/OIDC/SMS/fetch side effects must run outside the callback or through best-effort `afterCommit`.
- Drizzle table definitions belong in `packages/db/src/schema/<domain>/*.ts`; relation definitions belong in `packages/db/src/relations/<domain>/*.ts`; migrations belong in `packages/db/src/migrations/`.
- Keep domain and top-level schema/relation exports synchronized, for example `packages/db/src/schema/core/index.ts`, `packages/db/src/relations/core/index.ts`, `schema/index.ts`, and `relations/index.ts`.
- Use `snakeCase.table` / `snakeCase.schema`; keep TypeScript property names camelCase and database table/column names snake_case.
- Use `drizzle-orm/zod` for table-derived Zod schemas, and keep join-table primary keys, indexes, and uniqueness constraints explicit.

## Build, Test, and Development Commands
- Workspace: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm e2e`, and `pnpm typecheck`.
- Documentation index/freshness guard: `pnpm check:docs`; env naming guard: `pnpm check:env-names`.
- Backend apps: `pnpm --filter @iam/api <dev|serve|lint|test|typecheck>` and `pnpm --filter @iam/admin-api <dev|serve|lint|test|typecheck>`.
- OIDC provider: `pnpm --filter @iam/oidc-provider <dev|serve|lint|test|typecheck>`.
- Worker app: `pnpm --filter @iam/worker <dev|serve|lint|test|typecheck|user-profile:backfill|user-profile:repair>`.
- Shared packages: use the same filtered `lint`, `test`, and `typecheck` pattern, for example `pnpm --filter @iam/domain typecheck`.
- Database: `pnpm --filter @iam/db <db:push|db:generate|db:migrate|db:check>`; `@iam/api` keeps compatibility wrappers for `db:push`, `db:generate`, and `db:migrate`.
- Historical migration: `pnpm --filter @iam/api migrate:mysql-to-postgres`.
- Frontends: `pnpm --filter @iam/admin <dev|build|lint|test|e2e|typecheck|format>` and `pnpm --filter @iam/sso <dev|build|lint|test|e2e|typecheck|format>`.
- Gateway: use root shortcuts `pnpm gateway:apisix:<validate|diff|apply>` or `pnpm --filter @iam/gateway-apisix <validate|diff|apply|lint|test|typecheck>`.

## Coding Style & Naming Conventions
Use TypeScript throughout and keep 2-space indentation. Follow the formatter already configured in each app or package:

- API/backend/shared/gateway packages (`apps/api`, `apps/admin-api`, `apps/oidc-provider`, `apps/worker`, `packages/api-core`, `packages/contracts`, `packages/db`, `packages/domain`, `packages/jobs`, `packages/user-profile-read-model`, `gateway`): ESLint uses the Antfu config with double quotes, semicolons, and a 120-character soft limit.
- Admin/SSO frontends (`apps/admin`, `apps/sso`): Prettier uses single quotes, trailing commas, and 80-character wrap.

Preserve existing domain file naming: `user.service.ts`, `user.repository.ts`, `user.schema.ts`, `user.routes.ts`, `user.handlers.ts`, `user.trpc.ts`, and `user.type.ts`. Use PascalCase for React components and pages, and prefer existing import aliases such as `@admin`, `@sso`, or workspace package imports where they are already used.

## Backend Implementation Conventions
- Route handlers should return shared response envelopes from `@iam/api-core/http`, for example `c.json(resp.ok(data))` for successful JSON responses and `resp.fail(...)` for explicit failure envelopes. Prefer throwing domain/API errors when the existing error middleware already maps them correctly.
- Use `@iam/api-core/core/http-status-codes` constants in OpenAPI route definitions and explicit non-200 responses rather than numeric literals.
- Use the app logger (`@api/lib/logger`, `@admin-api/lib/logger`, `@worker/lib/logger`, or the OIDC provider logger) for runtime diagnostics. Prefer structured Pino calls with the data object first and the message second, for example `logger.info({ userId }, "user synced")`.
- Avoid `console.log`, `console.warn`, and `console.error` in application code. Acceptable exceptions are env validation, singleton/process lifecycle code, tests, one-off scripts, and the centralized error handler.
- Prefer enums and constants from `packages/contracts` or the owning module over magic strings/numbers in business queries, especially for status, type, and role-like fields.
- Prefer deriving TypeScript types from Zod schemas with `z.infer<typeof Schema>` when a schema is already the source of truth.
- Keep simple guard clauses concise when they return a single obvious value, for example `if (!entity) return null;`.
- Backend audit event helpers under `services/audit/events` should be pure payload builders. Services and handlers write those payloads through injected root or tx audit writer ports.
- Architecture guard tests in `apps/api/src/__tests__/architecture.test.ts` and `apps/admin-api/src/__tests__/architecture.test.ts` intentionally fail on forbidden production imports. Update allowlists deliberately when a new exception is justified.

## Workflow Orchestration
- Detailed development workflow, branching, OpenSpec lifecycle, commit rules, and delegation live in `docs/workflows/development.md`.
- Detailed design workflow, planning depth, proposal/design/task guidance, and decision-recording rules live in `docs/workflows/design.md`.
- Detailed testing workflow, validation matrix, smoke entrypoints, and failure handling live in `docs/workflows/testing.md`.
- For non-trivial work, read the relevant workflow doc before editing code or artifacts.
- Use Serena MCP by default for codebase analysis, architecture checks, symbol lookup, references, and targeted code reading. Use shell commands such as `rg`, `find`, and `sed` for workspace manifests, non-code files, command output, or broad file lists.
- For bug reports, reproduce or inspect the failing signal first, then fix the root cause and verify it.
- Before marking work complete, prove it with the narrowest meaningful validation: focused tests, type checks, lint, schema commands, logs, or a quick UI/API smoke test as appropriate.
- Do not automatically create commits outside the OpenSpec archive workflow or an explicit user confirmation. When committing, stage only task-owned files and use a Chinese Conventional Commit message unless the user requests another language.
- Capture recurring lessons in `docs/`, OpenSpec specs, or nearby project documentation; keep `AGENTS.md` as the short repository map.
