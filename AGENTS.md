# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` workspace + Turborepo monorepo. Runtime apps live under `apps/`, shared workspace packages live under `packages/`, and gateway tooling lives under `gateway/`.

- `apps/api`: Bun + Hono public IAM backend (`@iam/api`). Main code is in `src/`, with public/open/internal/sso/auth routes under `src/routes/`, app-side domain logic under `src/services/`, app-specific utilities under `src/lib/`, and env validation in `src/env.ts`.
- `apps/admin-api`: Bun + Hono admin backend (`@iam/admin-api`). Admin REST routes live under `src/routes/admin/`, tRPC entry routes under `src/routes/trpc/`, admin domain logic under `src/services/`, and tRPC router composition under `src/trpc/`.
- `apps/admin`: Umi Max + React management frontend. Pages live in `src/pages/`, reusable UI in `src/components/`, tRPC client setup in `src/lib/api-client.ts`, and page-side API wrappers in `src/services/`.
- `apps/sso`: Umi Max + React SSO portal. Pages live in `src/pages/`, assets in `src/assets/`, API wrappers in `src/services/`, and shared browser helpers in `src/lib/` and `src/utils/`.
- `packages/api-core/src`: shared backend infrastructure such as `createApp`, route factories, OpenAPI helpers, response helpers, errors, middlewares, Redis, logging, and tRPC utilities.
- `packages/contracts/src`: shared enums and stable contracts consumed across apps and packages.
- `packages/domain/src`: shared domain DTO schemas, DTO types, audit helpers, and reusable domain/business errors consumed by backend apps.
- `packages/db/src`: Drizzle schema, relations, migrations, singleton client, and query helpers. Schema and relation domains currently include `core` and `log`, with shared column helpers under `schema/_shard/`.
- `gateway/apisix`: APISIX gateway manifest package (`@iam/gateway-apisix`) with dev/prod manifests, config templates, and sync/validate/diff/apply scripts.
- `docker/`: local dependency stacks plus dev/prod compose files.
- `docs/`: architecture notes, plans, specs, audits, and remediation docs. Older plans may mention previous layouts; current database code is Drizzle + PostgreSQL in `packages/db`.
- `openspec/`: active OpenSpec changes, archived changes, main specs, and OpenSpec project configuration.
- `scripts/`: repo-level utility scripts.

Do not hand-edit generated frontend directories such as `apps/admin/src/.umi/`, `apps/admin/src/.umi-production/`, `apps/sso/src/.umi/`, or `apps/sso/src/.umi-production/`. Avoid editing frontend build outputs under `apps/admin/dist/` and `apps/sso/dist/`. Avoid editing vendored API documentation assets in `apps/api/static/` or `apps/admin-api/static/` unless the task is specifically about those assets.

## Backend Architecture Notes
- API tiers are declared per backend app in `apps/api/app.config.ts` and `apps/admin-api/app.config.ts`.
- `apps/api` currently owns `/public`, `/open`, `/internal`, `/sso`, and `/auth`.
- `apps/admin-api` currently owns `/admin` and `/rpc`; `/rpc` maps to the `src/routes/trpc` route directory.
- `createApp` lives in `packages/api-core` and auto-discovers `*.index.ts` route modules plus tier-level `_middleware.ts` files.
- Keep backend `src/app.ts` files focused on app assembly: import env, app config, app-local logger, discovered routes, and tier middlewares, then call `createApp`.
- App-local infrastructure singletons belong under `src/lib/`, for example `@api/lib/logger`, `@admin-api/lib/logger`, and `src/lib/infra/redis.ts`.
- Tier-level `_middleware.ts` files should stay thin and compose middleware arrays; shared authentication handlers belong in app-level `src/middlewares/*.handler.ts` files.
- REST-only route modules should use `*.routes.ts`, `*.handlers.ts`, and `*.type.ts`. Admin REST + tRPC route modules should share `*.adapter.ts` operations and expose thin `*.trpc.ts` modules.
- Backend app `tsconfig.json` files should include Bun runtime types and exclude `scripts`; backend app ESLint configs should ignore `scripts/**`.
- Repositories use Drizzle from `@iam/db` and accept an optional `tx: DbClient = db` for transaction-friendly calls.
- Drizzle table definitions belong in `packages/db/src/schema/<domain>/*.ts`; relation definitions belong in `packages/db/src/relations/<domain>/*.ts`; migrations belong in `packages/db/src/migrations/`.
- Keep schema exports and relation registration synchronized for each domain, for example `packages/db/src/schema/core/index.ts` with `packages/db/src/relations/core/index.ts`, and keep the top-level `schema/index.ts` / `relations/index.ts` exporting and registering all active domains.
- Put cross-app enums and stable constants in `packages/contracts`, not duplicated inside app folders. Put shared domain DTO schemas, DTO types, and reusable business errors in `packages/domain`. App-private enums, schemas, and errors may stay inside the owning app.

## Build, Test, and Development Commands
- `pnpm dev`: start all workspace dev tasks through Turbo.
- `pnpm build`: build all packages in dependency order.
- `pnpm lint`: run workspace lint tasks.
- `pnpm test`: run workspace tests through Turbo; backend/shared package test scripts use `bun test --parallel` for per-file isolation, while frontend packages should use their own configured test runner when one is added.
- `pnpm typecheck`: run workspace type checks.
- `pnpm --filter @iam/api dev`: run the public API with Bun hot reload on the app-configured port.
- `pnpm --filter @iam/api serve`: run the public API without hot reload.
- `pnpm --filter @iam/admin-api dev`: run the admin API with Bun hot reload.
- `pnpm --filter @iam/admin-api serve`: run the admin API without hot reload.
- `pnpm --filter @iam/api lint` / `pnpm --filter @iam/api test` / `pnpm --filter @iam/api typecheck`: validate public API code.
- `pnpm --filter @iam/admin-api lint` / `pnpm --filter @iam/admin-api test` / `pnpm --filter @iam/admin-api typecheck`: validate admin API code.
- `pnpm --filter @iam/domain lint` / `pnpm --filter @iam/domain test` / `pnpm --filter @iam/domain typecheck`: validate shared domain schemas, DTO types, helpers, and business errors.
- `pnpm --filter @iam/db db:push`: quickly sync Drizzle schema to a local development database.
- `pnpm --filter @iam/db db:generate`: generate Drizzle migration files.
- `pnpm --filter @iam/db db:migrate`: apply Drizzle migrations.
- `pnpm --filter @iam/db db:check`: validate Drizzle migration consistency.
- `pnpm --filter @iam/api db:push` / `db:generate` / `db:migrate`: compatibility wrappers that delegate to `@iam/db`.
- `pnpm --filter @iam/api migrate:mysql-to-postgres`: run the historical MySQL to PostgreSQL migration script.
- `pnpm --filter @iam/admin dev` / `pnpm --filter @iam/sso dev`: run a frontend locally.
- `pnpm --filter @iam/admin build` / `pnpm --filter @iam/sso build`: build a frontend.
- `pnpm --filter @iam/admin typecheck` / `pnpm --filter @iam/sso typecheck`: type-check a frontend.
- `pnpm --filter @iam/admin format` / `pnpm --filter @iam/sso format`: format a frontend.
- `pnpm gateway:apisix:validate` / `pnpm gateway:apisix:diff` / `pnpm gateway:apisix:apply`: validate, diff, or apply APISIX gateway manifests through the root convenience scripts.
- `pnpm --filter @iam/gateway-apisix validate` / `diff` / `apply` / `lint` / `test` / `typecheck`: operate directly on the APISIX gateway package.

## Coding Style & Naming Conventions
Use TypeScript throughout and keep 2-space indentation. Follow the formatter already configured in each app or package:

- API/backend/shared/gateway packages (`apps/api`, `apps/admin-api`, `packages/api-core`, `packages/contracts`, `packages/db`, `packages/domain`, `gateway/apisix`): ESLint uses the Antfu config with double quotes, semicolons, and a 120-character soft limit.
- Admin/SSO frontends (`apps/admin`, `apps/sso`): Prettier uses single quotes, trailing commas, and 80-character wrap.

Preserve existing domain file naming: `user.service.ts`, `user.repository.ts`, `user.schema.ts`, `user.routes.ts`, `user.handlers.ts`, `user.trpc.ts`, and `user.type.ts`. Use PascalCase for React components and pages, and prefer existing import aliases such as `@admin`, `@sso`, or workspace package imports where they are already used.

For Drizzle schema work:

- Use `snakeCase.table` / `snakeCase.schema`; do not rely on runtime casing conversion.
- Keep TypeScript property names camelCase and database table/column names snake_case.
- Use `drizzle-orm/zod` for table-derived Zod schemas.
- Put relations in `packages/db/src/relations/`, not in table definition files.
- Keep join-table primary keys, indexes, and uniqueness constraints explicit.

## Backend Implementation Conventions
- Route handlers should return shared response envelopes from `@iam/api-core/http`, for example `c.json(resp.ok(data))` for successful JSON responses and `resp.fail(...)` for explicit failure envelopes. Prefer throwing domain/API errors when the existing error middleware already maps them correctly.
- Use `@iam/api-core/core/http-status-codes` constants in OpenAPI route definitions and explicit non-200 responses rather than numeric literals.
- Use the app logger (`@api/lib/logger` or `@admin-api/lib/logger`) for runtime diagnostics. Prefer structured Pino calls with the data object first and the message second, for example `logger.info({ userId }, "user synced")`.
- Avoid `console.log`, `console.warn`, and `console.error` in application code. Acceptable exceptions are env validation, singleton/process lifecycle code, tests, one-off scripts, and the centralized error handler.
- Prefer enums and constants from `packages/contracts` or the owning module over magic strings/numbers in business queries, especially for status, type, and role-like fields.
- Prefer shared DTO schemas, DTO types, audit helpers, and reusable business errors from `@iam/domain` over duplicating cross-app domain contracts in app folders.
- Prefer deriving TypeScript types from Zod schemas with `z.infer<typeof Schema>` when a schema is already the source of truth.
- Keep simple guard clauses concise when they return a single obvious value, for example `if (!entity) return null;`.

## Workflow Orchestration
- Use Serena MCP by default for codebase analysis, architecture checks, symbol lookup, references, and targeted code reading. Start from Serena memories and symbol/search tools when they fit the task; use shell commands such as `rg`, `find`, and `sed` for workspace manifests, non-code files, command output, or broad file lists.
- For non-trivial work, start with a short plan or OpenSpec task list before implementation.
- Re-plan when new findings invalidate assumptions, expand scope, or make the current approach brittle.
- Use sub-agents when a task has independent workstreams, such as code archaeology, impact analysis, failing-test triage, API/schema contract review, security review, or UI smoke-checking.
- Keep each sub-agent focused on one bounded question and ask for concrete evidence: relevant files, line references, observed behavior, risks, and recommended next steps.
- The main agent remains responsible for the final plan, code integration, verification, and commit. Do not let parallel investigations produce conflicting edits without reconciling them first.
- For bug reports, reproduce or inspect the failing signal first, then fix the root cause and verify it.
- Before marking work complete, prove it with the narrowest meaningful validation: focused tests, type checks, lint, schema commands, logs, or a quick UI/API smoke test as appropriate.
- When a solution feels hacky, pause and look for a simpler design that fits existing patterns; avoid extra abstraction for obvious small fixes.
- Capture recurring lessons in AGENTS.md, OpenSpec docs, or nearby project documentation when they would prevent future mistakes.

## Engineering Principles
- Start by reading nearby code and following existing package patterns before adding new abstractions.
- Keep changes as small as the problem allows. Touch the minimum code needed, and avoid unrelated refactors or formatting churn.
- Fix root causes rather than layering temporary workarounds. If a solution feels brittle, pause and look for the simpler, more coherent design.
- When behavior is subtle or risky, compare against the existing branch behavior or surrounding implementations before changing the contract.

## Testing Guidelines
Bun tests are available through package-level `test` scripts. Minimum validation before a PR:

- Place test files in a `__tests__/` directory next to the code under test, for example `src/services/position/__tests__/position.service.test.ts`.
- run `pnpm test`, `pnpm lint`, and `pnpm typecheck`, or the narrower filtered commands for the touched app/package
- backend/shared package test scripts use `bun test --parallel`; keep module mocks local to each test file and prefer the package script over raw `bun test` when running several files together
- frontend packages should use their own configured test runner rather than inheriting Bun test semantics
- for Drizzle schema changes, run the appropriate `@iam/db` command: `db:push` for local sync or `db:generate` + `db:migrate` when producing migrations
- for `packages/domain` changes, type-check `@iam/domain` and every directly affected backend or frontend consumer
- for APISIX gateway manifest/script changes, run `pnpm gateway:apisix:validate -- --env <env>:<app>` plus `pnpm --filter @iam/gateway-apisix typecheck` or `test` when scripts changed
- smoke-test public API endpoints via the public API Scalar UI at `http://localhost:30000` or each public tier's `/doc` endpoint when running `@iam/api` directly
- smoke-test admin API endpoints via the admin API Scalar UI at `http://localhost:30001` or `/admin/doc` and `/rpc/doc` when running `@iam/admin-api` directly
- when using `docker/docker-compose-dev.yml`, direct backend host ports are `http://localhost:30011` for `api` and `http://localhost:30012` for `admin-api`; APISIX gateway host ports are `http://localhost:30080` and `https://localhost:30443`
- smoke-test affected UI flows in `admin` or `sso`
- for tRPC changes consumed by `admin`, run type checks for both `@iam/admin-api` and `@iam/admin`
- for changes in `packages/contracts`, `packages/api-core`, `packages/domain`, or `packages/db`, run type checks for the shared package and all directly affected apps

## Commit Guidelines
Recent history uses Conventional Commits with scopes, for example `feat(db): ...`, `fix(auth): ...`, `refactor(api): ...`, and `style(sso): ...`. Keep commits focused and describe the changed area explicitly.

This is a personal project, so pull requests are optional and not part of the default workflow. Keep `main` history clean by making each commit represent a completed, reviewable, and reasonably easy-to-revert unit of work.

For each non-trivial feature, fix, refactor, or behavior change, create a short-lived working branch before implementation, for example `work/<topic>`, `feat/<topic>`, or `fix/<topic>`. Tiny documentation or instruction-only edits may stay on the current branch when opening a branch would add more process than value.

Do not automatically create git commits by default, and never create an automatic process/WIP commit on `main`. Complete the requested code changes and validation first; create a commit only when the user explicitly asks for one.

When the user asks for a commit:

- inspect the current branch and `git diff` before staging anything;
- stage only files that belong to the completed task, leaving unrelated user changes untouched;
- if currently on `main`, create one focused aggregate commit for the completed task;
- if working on a temporary branch, process/WIP commits are acceptable locally, but squash them before merging into `main`, for example with `git merge --squash`;
- use the Conventional Commits format and write commit messages in Chinese unless the user explicitly requests another language.
