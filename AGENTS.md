# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` + Turborepo monorepo. Runtime code lives under `apps/` and shared code under `packages/`.

- `apps/api`: Bun + Hono backend. Main code is in `src/`, with routes under `src/routes/`, domain logic under `src/services/`, and Prisma schema under `src/db/schema.prisma`.
- `apps/admin` and `apps/sso`: Umi Max frontends. Pages live in `src/pages/`, reusable UI in `src/components/`, and API wrappers in `src/services/`.
- `packages/shared/src`: shared enums and helpers consumed across apps.
- `docker/`: local dependency stacks and dev compose files.
- `docs/`: architecture notes, plans, and design specs.

Do not hand-edit generated backend files in `apps/api/src/db/generated/`.

## Build, Test, and Development Commands
- `pnpm dev`: start all workspace dev tasks through Turbo.
- `pnpm build`: build all packages in dependency order.
- `pnpm lint`: run workspace lint tasks.
- `pnpm typecheck`: run workspace type checks.
- `pnpm --filter @iam/api dev`: run the API with Bun hot reload.
- `pnpm --filter @iam/admin dev` / `pnpm --filter @iam/sso dev`: run a frontend locally.
- `pnpm --filter @iam/api exec prisma generate`: refresh Prisma client and generated schemas after schema changes.
- `pnpm --filter @iam/api exec prisma migrate dev --name <name>`: create and apply a local migration.

## Coding Style & Naming Conventions
Use TypeScript throughout and keep 2-space indentation. Follow the formatter already configured in each app:

- API (`apps/api`): ESLint enforces double quotes, semicolons, and a 120-character soft limit.
- Admin/SSO (`apps/admin`, `apps/sso`): Prettier uses single quotes, trailing commas, and 80-character wrap.

Preserve existing domain file naming: `user.service.ts`, `user.repository.ts`, `user.schema.ts`, `user.routes.ts`, `user.handlers.ts`. Use PascalCase for React components and pages, and prefer existing `@/` import aliases.

## Testing Guidelines
There is no committed automated test framework yet. Minimum validation before a PR:

- run `pnpm lint` and `pnpm typecheck`
- for Prisma changes, run `prisma generate` and the migration command
- smoke-test API endpoints via `/doc/scalar`
- smoke-test affected UI flows in `admin` or `sso`

## Commit & Pull Request Guidelines
Recent history uses Conventional Commits with scopes, for example `feat(db): ...`, `fix(auth): ...`, and `style(sso): ...`. Keep commits focused and describe the changed area explicitly.

PRs should summarize affected apps/packages, call out env or migration changes, link the related issue, and include screenshots for UI work. Keep schema, API, and frontend changes synchronized in one reviewable branch when they ship together.
