# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` workspace + Turborepo monorepo. Runtime code lives under `apps/` and shared code under `packages/`.

- `apps/api`: Bun + Hono backend. Main code is in `src/`, with tiered routes under `src/routes/`, domain logic under `src/services/`, Drizzle schema under `src/db/schema/`, Drizzle relations under `src/db/relations/`, and tRPC composition under `src/trpc/`.
- `apps/admin`: Umi Max + React management frontend. Pages live in `src/pages/`, reusable UI in `src/components/`, tRPC client setup in `src/lib/api-client.ts`, and page-side API wrappers in `src/services/`.
- `apps/sso`: Umi Max + React SSO portal. Pages live in `src/pages/`, assets in `src/assets/`, API wrappers in `src/services/`, and shared browser helpers in `src/lib/` and `src/utils/`.
- `packages/shared/src`: shared enums and helpers consumed across apps.
- `docker/`: local dependency stacks and dev compose files.
- `docs/`: architecture notes, plans, and design specs. Older plans may mention Prisma; the current API database layer is Drizzle + PostgreSQL.

Do not hand-edit generated frontend directories such as `apps/admin/src/.umi/` or `apps/sso/src/.umi/`. Avoid editing vendored API documentation assets in `apps/api/static/` unless the task is specifically about those assets.

## Backend Architecture Notes
- API tiers are declared in `apps/api/app.config.ts`; routes are grouped under `src/routes/<tier>/`.
- `createApp` auto-discovers `*.index.ts` route modules and tier-level `_middleware.ts` files.
- Admin REST and tRPC endpoints commonly share `*.ops.ts` definitions; handlers and `*.trpc.ts` files should stay thin.
- Repositories use Drizzle and accept an optional `tx: DbClient = db` for transaction-friendly calls.
- Drizzle table definitions belong in `apps/api/src/db/schema/core/*.ts`; relation definitions belong in `apps/api/src/db/relations/core/*.ts`.
- Keep schema exports in `apps/api/src/db/schema/core/index.ts` and relation registration in `apps/api/src/db/relations/core/index.ts` synchronized.

## Build, Test, and Development Commands
- `pnpm dev`: start all workspace dev tasks through Turbo.
- `pnpm build`: build all packages in dependency order.
- `pnpm lint`: run workspace lint tasks.
- `pnpm typecheck`: run workspace type checks.
- `pnpm --filter @iam/api dev`: run the API with Bun hot reload.
- `pnpm --filter @iam/api serve`: run the API without hot reload.
- `pnpm --filter @iam/api lint` / `pnpm --filter @iam/api typecheck`: validate API code.
- `pnpm --filter @iam/api db:push`: quickly sync Drizzle schema to a local development database.
- `pnpm --filter @iam/api db:generate`: generate Drizzle migration files.
- `pnpm --filter @iam/api db:migrate`: apply Drizzle migrations.
- `pnpm --filter @iam/api migrate:mysql-to-postgres`: run the historical MySQL to PostgreSQL migration script.
- `pnpm --filter @iam/admin dev` / `pnpm --filter @iam/sso dev`: run a frontend locally.
- `pnpm --filter @iam/admin build` / `pnpm --filter @iam/sso build`: build a frontend.
- `pnpm --filter @iam/admin typecheck` / `pnpm --filter @iam/sso typecheck`: type-check a frontend.
- `pnpm --filter @iam/admin format` / `pnpm --filter @iam/sso format`: format a frontend.

## Coding Style & Naming Conventions
Use TypeScript throughout and keep 2-space indentation. Follow the formatter already configured in each app:

- API (`apps/api`): ESLint uses the Antfu config with double quotes, semicolons, and a 120-character soft limit.
- Admin/SSO (`apps/admin`, `apps/sso`): Prettier uses single quotes, trailing commas, and 80-character wrap.

Preserve existing domain file naming: `user.service.ts`, `user.repository.ts`, `user.schema.ts`, `user.routes.ts`, `user.handlers.ts`, `user.trpc.ts`, and `user.type.ts`. Use PascalCase for React components and pages, and prefer existing `@/` or `@api/` import aliases where they are already used.

For Drizzle schema work:

- Use `snakeCase.table` / `snakeCase.schema`; do not rely on runtime casing conversion.
- Keep TypeScript property names camelCase and database table/column names snake_case.
- Use `drizzle-orm/zod` for table-derived Zod schemas.
- Put relations in `src/db/relations/`, not in table definition files.
- Keep join-table primary keys, indexes, and uniqueness constraints explicit.

## Testing Guidelines
There is no committed automated test framework yet. Minimum validation before a PR:

- run `pnpm lint` and `pnpm typecheck`, or the narrower filtered commands for the touched app
- for Drizzle schema changes, run the appropriate Drizzle command: `db:push` for local sync or `db:generate` + `db:migrate` when producing migrations
- smoke-test API endpoints via the Scalar UI at the API root or each tier's `/doc` endpoint
- smoke-test affected UI flows in `admin` or `sso`
- for tRPC changes consumed by `admin`, run type checks for both `@iam/api` and `@iam/admin`

## Commit & Pull Request Guidelines
Recent history uses Conventional Commits with scopes, for example `feat(db): ...`, `fix(auth): ...`, `refactor(api): ...`, and `style(sso): ...`. Keep commits focused and describe the changed area explicitly.

After each completed feature or behavior change, automatically create a focused git commit using the Conventional Commits format. Write commit messages in Chinese unless the user explicitly requests another language.

PRs should summarize affected apps/packages, call out env or migration changes, link the related issue, and include screenshots for UI work. Keep schema, API, and frontend changes synchronized in one reviewable branch when they ship together.
