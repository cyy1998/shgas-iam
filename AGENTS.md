# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` workspace + Turborepo monorepo. Runtime apps live under `apps/`, shared workspace packages live under `packages/`, and gateway tooling lives under `gateway/`.

- `apps/api`: Bun + Hono public IAM backend (`@iam/api`). Main code is in `src/`, with public/open/internal/sso/auth routes under `src/routes/`, app-side domain logic under `src/services/`, app-specific utilities under `src/lib/`, app composition wiring under `src/composition/`, and env validation in `src/env.ts`.
- `apps/admin-api`: Bun + Hono admin backend (`@iam/admin-api`). Admin REST routes live under `src/routes/admin/`, tRPC entry routes under `src/routes/trpc/`, admin domain logic under `src/services/`, app composition wiring under `src/composition/`, and tRPC router composition under `src/trpc/`.
- `apps/admin`: Umi Max + React management frontend. Pages live in `src/pages/`, reusable UI in `src/components/`, tRPC client setup in `src/lib/api-client.ts`, and page-side API wrappers in `src/services/`.
- `apps/sso`: Umi Max + React SSO portal. Pages live in `src/pages/`, assets in `src/assets/`, API wrappers in `src/services/`, and shared browser helpers in `src/lib/` and `src/utils/`.
- `packages/api-core/src`: shared backend infrastructure such as `createApp`, route factories, OpenAPI helpers, response helpers, errors, middlewares, Redis, logging, and tRPC utilities.
- `packages/contracts/src`: shared enums and stable contracts consumed across apps and packages.
- `packages/domain/src`: shared domain DTO schemas, DTO types, audit helpers, and reusable domain/business errors consumed by backend apps.
- `packages/db/src`: Drizzle schema, relations, migrations, singleton client, and query helpers. Schema and relation domains currently include `core` and `log`, with shared column helpers under `schema/_shard/`.
- `gateway`: APISIX gateway manifest package (`@iam/gateway-apisix`) with dev/prod manifests, config templates, and sync/validate/diff/apply scripts.
- `docker/`: local dependency stacks plus dev/prod compose files.
- `docs/`: architecture notes, plans, specs, audits, and remediation docs. Older plans may mention previous layouts; current database code is Drizzle + PostgreSQL in `packages/db`.
- `openspec/`: active OpenSpec changes, archived changes, main specs, and OpenSpec project configuration.
- `scripts/`: repo-level utility scripts.

Do not hand-edit generated frontend directories such as `apps/admin/src/.umi/`, `apps/admin/src/.umi-production/`, `apps/sso/src/.umi/`, or `apps/sso/src/.umi-production/`. Avoid editing frontend build outputs under `apps/admin/dist/` and `apps/sso/dist/`. Avoid editing vendored API documentation assets in `apps/api/static/` or `apps/admin-api/static/` unless the task is specifically about those assets.

## Backend Architecture Notes
- API tiers are declared per backend app in `apps/api/app.config.ts` and `apps/admin-api/app.config.ts`.
- `apps/api` currently owns `/public`, `/open`, `/internal`, `/sso`, and `/auth`.
- `apps/admin-api` currently owns `/admin` and `/rpc`; `/rpc` maps to the `src/routes/trpc` route directory.
- `createApp` lives in `packages/api-core` and mounts materialized route and middleware records supplied by each app composition root. It remains app-agnostic and does not own app-specific DI wiring.
- Keep backend `src/app.ts` files focused on app assembly: import env, app config, app-local logger, call the app-local composition root, and pass materialized routes and middlewares to `createApp`.
- App-local infrastructure singletons belong under `src/lib/`, for example `@api/lib/logger`, `@admin-api/lib/logger`, and `src/lib/infra/redis.ts`.
- Production runtime, repository, service, route, middleware, and integration instances are created under app-local `src/composition/` modules, organized by `runtime`, `repositories`, `tx`, `services`, `routes`, and `middlewares`.
- Backend replaceable modules should export factories and return types, for example `createUserService(deps)` and `type UserService = ReturnType<typeof createUserService>`. Do not reintroduce bound production service/repository singletons.
- Consumer-owned `*.port.ts` files define outbound behavior a service/use-case consumes. Keep enums, DTO schemas, domain errors, business constants, and pure helpers as static imports rather than DI deps.
- Tier-level `_middleware.ts` files should stay thin and expose middleware factories or compose injected middleware arrays; shared authentication handlers belong in app-level `src/middlewares/*.handler.ts` files and are materialized by composition.
- REST-only route modules should use `*.routes.ts`, `*.handlers.ts`, and `*.type.ts`. Route `*.index.ts` files should expose router factories that receive materialized handlers/adapters. Admin REST + tRPC route modules should share `*.adapter.ts` operation factories and expose thin `*.trpc.ts` modules.
- Backend app `tsconfig.json` files should include Bun runtime types and exclude `scripts`; backend app ESLint configs should ignore `scripts/**`.

## Shared Contracts & Database
- Put cross-app enums and stable constants in `packages/contracts`; put shared DTO schemas, DTO types, audit helpers, and reusable business errors in `packages/domain`. App-private enums, schemas, and errors may stay inside the owning app.
- Repositories use Drizzle from `@iam/db` and are created through `createXRepository(db)` factories bound to either the root `DbClient` or a transaction `DbClient`; business service methods should not pass `tx` arguments to repository calls.
- Transactional backend workflows should use the app-local `UnitOfWork`. Transaction callbacks receive tx-bound repository and audit writer ports; Redis/cache/OIDC/SMS/fetch side effects must run outside the callback or through best-effort `afterCommit`.
- Drizzle table definitions belong in `packages/db/src/schema/<domain>/*.ts`; relation definitions belong in `packages/db/src/relations/<domain>/*.ts`; migrations belong in `packages/db/src/migrations/`.
- Keep domain and top-level schema/relation exports synchronized, for example `packages/db/src/schema/core/index.ts`, `packages/db/src/relations/core/index.ts`, `schema/index.ts`, and `relations/index.ts`.
- Use `snakeCase.table` / `snakeCase.schema`; keep TypeScript property names camelCase and database table/column names snake_case.
- Use `drizzle-orm/zod` for table-derived Zod schemas, and keep join-table primary keys, indexes, and uniqueness constraints explicit.

## Build, Test, and Development Commands
- Workspace: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm typecheck`.
- Documentation index/freshness guard: `pnpm check:docs`.
- Backend apps: `pnpm --filter @iam/api <dev|serve|lint|test|typecheck>` and `pnpm --filter @iam/admin-api <dev|serve|lint|test|typecheck>`.
- Shared packages: use the same filtered `lint`, `test`, and `typecheck` pattern, for example `pnpm --filter @iam/domain typecheck`.
- Database: `pnpm --filter @iam/db <db:push|db:generate|db:migrate|db:check>`; `@iam/api` keeps compatibility wrappers for `db:push`, `db:generate`, and `db:migrate`.
- Historical migration: `pnpm --filter @iam/api migrate:mysql-to-postgres`.
- Frontends: `pnpm --filter @iam/admin <dev|build|typecheck|format>` and `pnpm --filter @iam/sso <dev|build|typecheck|format>`.
- Gateway: use root shortcuts `pnpm gateway:apisix:<validate|diff|apply>` or `pnpm --filter @iam/gateway-apisix <validate|diff|apply|lint|test|typecheck>`.

## Coding Style & Naming Conventions
Use TypeScript throughout and keep 2-space indentation. Follow the formatter already configured in each app or package:

- API/backend/shared/gateway packages (`apps/api`, `apps/admin-api`, `packages/api-core`, `packages/contracts`, `packages/db`, `packages/domain`, `gateway`): ESLint uses the Antfu config with double quotes, semicolons, and a 120-character soft limit.
- Admin/SSO frontends (`apps/admin`, `apps/sso`): Prettier uses single quotes, trailing commas, and 80-character wrap.

Preserve existing domain file naming: `user.service.ts`, `user.repository.ts`, `user.schema.ts`, `user.routes.ts`, `user.handlers.ts`, `user.trpc.ts`, and `user.type.ts`. Use PascalCase for React components and pages, and prefer existing import aliases such as `@admin`, `@sso`, or workspace package imports where they are already used.

## Backend Implementation Conventions
- Route handlers should return shared response envelopes from `@iam/api-core/http`, for example `c.json(resp.ok(data))` for successful JSON responses and `resp.fail(...)` for explicit failure envelopes. Prefer throwing domain/API errors when the existing error middleware already maps them correctly.
- Use `@iam/api-core/core/http-status-codes` constants in OpenAPI route definitions and explicit non-200 responses rather than numeric literals.
- Use the app logger (`@api/lib/logger` or `@admin-api/lib/logger`) for runtime diagnostics. Prefer structured Pino calls with the data object first and the message second, for example `logger.info({ userId }, "user synced")`.
- Avoid `console.log`, `console.warn`, and `console.error` in application code. Acceptable exceptions are env validation, singleton/process lifecycle code, tests, one-off scripts, and the centralized error handler.
- Prefer enums and constants from `packages/contracts` or the owning module over magic strings/numbers in business queries, especially for status, type, and role-like fields.
- Prefer deriving TypeScript types from Zod schemas with `z.infer<typeof Schema>` when a schema is already the source of truth.
- Keep simple guard clauses concise when they return a single obvious value, for example `if (!entity) return null;`.
- Backend audit event helpers under `services/audit/events` should be pure payload builders. Services and handlers write those payloads through injected root or tx audit writer ports.
- Architecture guard tests in `apps/api/src/__tests__/architecture.test.ts` and `apps/admin-api/src/__tests__/architecture.test.ts` intentionally fail on forbidden production imports. Update allowlists deliberately when a new exception is justified.

## Workflow Orchestration
- Use Serena MCP by default for codebase analysis, architecture checks, symbol lookup, references, and targeted code reading. Start from Serena memories and symbol/search tools when they fit the task; use shell commands such as `rg`, `find`, and `sed` for workspace manifests, non-code files, command output, or broad file lists.
- For non-trivial work, start with a short plan or OpenSpec task list before implementation.
- Read nearby code and follow existing package patterns before adding abstractions; re-plan when new findings invalidate assumptions, expand scope, or make the current approach brittle.
- Keep changes as small as the problem allows, fix root causes rather than layering temporary workarounds, and compare subtle behavior changes against existing branch behavior or surrounding implementations.
- The user explicitly authorizes Codex to spawn and manage sub-agents for delegation and parallel agent work when helpful.
- This standing authorization covers independent code archaeology, impact analysis, disjoint implementation slices, verification, test triage, API/schema contract review, security review, and UI smoke-checking. Ask for confirmation only when delegated write scopes are unclear or unusually risky.
- Use sub-agents when a task has independent workstreams, such as code archaeology, impact analysis, failing-test triage, API/schema contract review, security review, or UI smoke-checking.
- Keep each sub-agent focused on one bounded question and ask for concrete evidence: relevant files, line references, observed behavior, risks, and recommended next steps.
- The main agent remains responsible for the final plan, code integration, verification, and commit. Do not let parallel investigations produce conflicting edits without reconciling them first.
- For bug reports, reproduce or inspect the failing signal first, then fix the root cause and verify it.
- Before marking work complete, prove it with the narrowest meaningful validation: focused tests, type checks, lint, schema commands, logs, or a quick UI/API smoke test as appropriate.
- OpenSpec work must follow the target-branch, proposal, archive, and integration lifecycle defined in **Branch, OpenSpec, and Commit Workflow** below.
- Capture recurring lessons in AGENTS.md, OpenSpec docs, or nearby project documentation when they would prevent future mistakes.

## Branch, OpenSpec, and Commit Workflow
Recent history uses Conventional Commits with scopes, for example `feat(db): ...`, `fix(auth): ...`, `refactor(api): ...`, and `style(sso): ...`. Keep commits focused, reviewable, and reasonably easy to revert.

Treat an OpenSpec change and its Git branch as one lifecycle:

- **Propose:** before running `openspec new change <change-name>` or creating proposal artifacts, inspect the current branch and worktree, then create and switch to `work/<change-name>` from the change's target branch. The target is `main` for an independent change and `feature/<feature-name>` for a child change in a larger feature. Keep the OpenSpec change name and working-branch suffix identical. If already on that change's branch, continue there. Do not carry unrelated dirty changes onto the new branch; if the worktree, target branch, or correct base is ambiguous, resolve that with the user first.
- **Apply and continue:** perform artifact updates, implementation, tests, and verification on `work/<change-name>`. Process/WIP commits are allowed on this branch when useful, but are not required and must never be created automatically on `main`.
- **Verify:** complete the relevant OpenSpec verification and the narrowest meaningful repository checks before archiving. Archive is a finalization step, not a substitute for validation.
- **Archive and merge:** an explicit request to archive an OpenSpec change also authorizes finalizing that change's Git history and merging it into its target branch. First sync delta specs when applicable and move the change into `openspec/changes/archive/` on its working branch. Then inspect the full diff, stage only files belonging to the change, create a focused Conventional Commit, switch to the clean target branch, squash-merge the working branch with `git merge --squash`, and create the final commit there. Delete the local working branch only after the squash commit succeeds. Do not push the target branch or delete any remote branch unless the user explicitly asks.
- **Archive blockers:** do not merge when artifacts or tasks are incomplete, required validation fails, the worktree contains inseparable unrelated changes, or the target branch cannot accept the merge cleanly. Report the blocker and preserve the working branch.

For a large feature intentionally split across multiple OpenSpec changes, use a two-level branch model:

- Create `feature/<feature-name>` from `main` before proposing its first child change. Use an umbrella OpenSpec change when the feature needs a durable record of overall scope, child-change inventory, dependency order, cross-change decisions, and integration acceptance criteria; it coordinates the children but does not replace their artifacts or verification.
- Create every child `work/<change-name>` branch from `feature/<feature-name>`, and record that target branch in the child's proposal or design. Child changes may depend on earlier child changes already archived into the feature branch; make such ordering explicit in the umbrella artifacts.
- Archive each child independently into `feature/<feature-name>` using the normal squash workflow, producing one focused commit per child. Never merge a child change directly into `main` while its larger feature is still in progress.
- Keep the feature branch integration-ready: after each child merge, run the meaningful cross-change checks and resolve integration failures on a dedicated OpenSpec change when they require non-trivial code or contract changes.
- Finalize the feature only after every required child is archived, the umbrella tasks and acceptance criteria are complete, and full integration validation passes. Archive the umbrella change on the feature branch when one exists, then merge `feature/<feature-name>` into a clean `main` with `git merge --no-ff` so the per-change commits remain visible. Delete the local feature branch only after the merge commit succeeds; pushing and remote branch deletion still require explicit user approval.

For non-OpenSpec work, create a short-lived `feat/<topic>`, `fix/<topic>`, or `work/<topic>` branch before each non-trivial feature, fix, refactor, or behavior change. When a non-OpenSpec request is a small, quick change, use the `quick-change` skill workflow: implement on a temporary branch, wait for user confirmation, then commit, merge into the target branch, and delete the temporary branch. Tiny documentation or instruction-only edits may stay on the current branch when opening a branch would add more process than value.

Outside the OpenSpec archive workflow, do not automatically create commits. Create a commit only when the user explicitly asks. Whenever committing, inspect the current branch and `git diff`, stage only task-owned files, leave unrelated user changes untouched, and use a Conventional Commit message written in Chinese unless the user requests another language.

## Testing Guidelines
Package-level `test` scripts are available throughout the workspace. Backend/shared/gateway packages generally use Bun (`bun test --parallel`), while `apps/admin`, `apps/sso`, and `apps/oidc-provider` use Vitest. Minimum validation before a PR:

- Place test files in a `__tests__/` directory next to the code under test, for example `src/services/position/__tests__/position.service.test.ts`.
- Run `pnpm test`, `pnpm lint`, and `pnpm typecheck`, or the narrower filtered commands for touched apps/packages.
- Prefer package scripts over raw runner commands when running several files together. Backend service/handler/adapter tests should construct factories with DI fakes instead of using `mock.module` for app-local service/repository/db/redis/logger modules.
- Frontend unit tests use Vitest through package scripts; run affected `@iam/admin` or `@iam/sso` `test`/`typecheck`, and run filtered `e2e` (`pnpm --filter @iam/admin e2e` or `pnpm --filter @iam/sso e2e`) when user flows change.
- OIDC provider changes use Node.js 24.x and require the narrowest relevant filtered checks from `pnpm --filter @iam/oidc-provider test`, `lint`, and `typecheck`.
- Drizzle schema changes need the appropriate `@iam/db` command: `db:push` for local sync or `db:generate` + `db:migrate` when producing migrations.
- Shared package changes (`packages/contracts`, `packages/api-core`, `packages/domain`, `packages/db`) require type checks for the package and directly affected apps, including `@iam/oidc-provider` when session, OIDC, logging, or database contracts it consumes are touched; tRPC changes consumed by `admin` require both `@iam/admin-api` and `@iam/admin` type checks.
- APISIX gateway manifest/script changes require `pnpm gateway:apisix:validate -- --env <env>:<app>` plus `pnpm --filter @iam/gateway-apisix typecheck` or `test` when scripts changed.
- Smoke-test affected surfaces: public API Scalar UI at `http://localhost:30000` or public tier `/doc`; admin API Scalar UI at `http://localhost:30001` or `/admin/doc` and `/rpc/doc`; OIDC provider discovery/JWKS/authorization/token/UserInfo flows through gateway `http://localhost:30080/oidc` or direct dev port `http://localhost:30015`; affected `admin` or `sso` UI flows.
- With `docker/docker-compose-dev.yml`, direct backend host ports are `http://localhost:30011` for `api`, `http://localhost:30012` for `admin-api`, and `http://localhost:30015` for `oidc-provider`; APISIX gateway host ports are `http://localhost:30080` and `https://localhost:30443`.
