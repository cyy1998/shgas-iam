# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository is a **pnpm + Turborepo monorepo** for an IAM (Identity and Access Management) platform. It contains:

- **`apps/api`** (`@iam/api`) — Backend service (Bun + Hono + Prisma)
- **`apps/admin`** (`@iam/admin`) — Admin dashboard frontend (UMI Max + React + Ant Design Pro)
- **`packages/shared`** (`@iam/shared`) — Cross-package shared code (enums, constants)

Key characteristics:

- **Package manager**: pnpm (`packageManager: pnpm@10.33.0` at the root `package.json`)
- **Task runner**: [Turborepo](https://turbo.build/) — `turbo dev / build / lint / typecheck`
- **End-to-end type safety**: `apps/admin` imports `AppType` from `@iam/api` through `hono/client` (`apps/admin/src/lib/api-client.ts`), giving the frontend typed request/response for every route
- **Workspace layout**: `apps/*` and `packages/*` declared in `pnpm-workspace.yaml`

## Repository Layout

```
iam-service/
├── apps/
│   ├── api/                # Backend (@iam/api) — Bun + Hono
│   │   ├── src/
│   │   ├── static/swagger/
│   │   ├── scripts/
│   │   ├── prisma.config.ts
│   │   ├── eslint.config.js
│   │   └── tsconfig.json
│   └── admin/              # Admin frontend (@iam/admin) — UMI Max + React
│       ├── src/
│       │   ├── pages/      # users / organizations / positions / employments / 403
│       │   ├── components/
│       │   ├── models/
│       │   ├── services/
│       │   ├── lib/api-client.ts
│       │   ├── access.ts
│       │   └── app.ts
│       ├── mock/
│       ├── .umirc.ts       # Routes, proxy, UMI config
│       └── .env.example    # UMI_APP_* variables
├── packages/
│   └── shared/             # @iam/shared — enums, cross-cutting constants
│       └── src/
│           ├── enums/service.status.ts
│           └── index.ts
├── docs/
├── pnpm-workspace.yaml
├── turbo.json
└── package.json            # Root scripts: turbo dev/build/lint/typecheck
```

## Development Commands

### Prerequisites

- **Bun** (matches `apps/api` `devEngines.runtime`) — used to run the API
- **Node.js ≥ 18** — required by UMI Max build
- **pnpm ≥ 10** — `packageManager` pinned at `pnpm@10.33.0`
- **MySQL** reachable via `DATABASE_URL`
- **Redis** configured via `REDIS_URL` / `REDIS_PORT` / `REDIS_DB`

### Root-level (Turborepo)

```bash
pnpm install        # install all workspace deps
pnpm dev            # turbo dev — runs dev in every package in parallel
pnpm build          # turbo build — respects ^build dependency order
pnpm lint           # turbo lint
pnpm typecheck      # turbo typecheck
```

### Backend (`apps/api` — `@iam/api`)

```bash
pnpm --filter @iam/api dev          # bun --hot src/index.ts
pnpm --filter @iam/api serve        # production: bun run src/index.ts
pnpm --filter @iam/api lint
pnpm --filter @iam/api lint:fix
pnpm --filter @iam/api typecheck    # bunx tsc --noEmit

# Prisma (run from apps/api via --filter)
pnpm --filter @iam/api exec prisma generate
pnpm --filter @iam/api exec prisma migrate dev --name <name>
pnpm --filter @iam/api exec prisma studio
```

### Admin frontend (`apps/admin` — `@iam/admin`)

```bash
pnpm --filter @iam/admin dev        # max dev (UMI Max)
pnpm --filter @iam/admin build      # max build → apps/admin/dist
pnpm --filter @iam/admin format     # prettier
```

## Architecture

### Backend (`apps/api/src`)

- **`app.ts`** — Hono app assembly and OpenAPI registration
- **`index.ts`** — Service entry point exporting Bun server config
- **`env.ts`** — Environment variable validation via Zod
- **`routes/`** — API routes grouped by access level:
  - `admin/` — administrative endpoints (client, employment, organization, position, user)
  - `auth/` — authentication
  - `internal/` — internal service calls
  - `open/` — open APIs
  - `public/` — public APIs
  - `sso/` — OIDC single sign-on
- **`services/`** — business logic, one folder per domain. Each contains:
  - `*.service.ts` — main service functions
  - `*.repository.ts` — Prisma calls
  - `*.schema.ts` — Zod validation schemas
  - `*.type.ts` — TypeScript types
- **`db/`** — `schema.prisma`, generated Prisma client/Zod schemas under `generated/`, raw SQL under `sql/`
- **`lib/`** — external clients (Redis, Pino, OpenAPI helpers)
- **`middlewares/`** — Hono middlewares (error handler, etc.)
- **`utils/`** — HTTP helpers, Zod utilities, pagination
- **`enums/`** — status codes, usage types, etc.
- **`errors/`** — custom errors extending `CustomError`

Path aliases (see `apps/api/tsconfig.json`): `@/*`, `@db`, `@lib/*`, `@services/*`, `@repositories/*`, `@schemas/*`, `@enums/*`, `@mapper/*`, `@errors/*`, `@middlewares/*`, `@utils/*`, `@prisma-client/*`.

### Admin frontend (`apps/admin/src`)

- **`.umirc.ts`** — UMI config: routes, `proxy` mapping `/admin`, `/auth`, `/public`, `/sso`, `/internal`, `/open` to the backend; sets `antd`, `access`, `model`, `initialState`, `request`, `layout`
- **`app.ts`** — UMI runtime configuration
- **`access.ts`** — access policy (checks role code against `UMI_APP_ADMIN_ROLE_CODE`)
- **`pages/`** — `users`, `organizations`, `positions`, `employments`, `403`
- **`lib/api-client.ts`** — `hc<AppType>('/')` typed Hono client; any route defined in `@iam/api` is typed here
- **`models/`** — UMI data-flow models
- **`services/`**, **`components/`**, **`utils/`**

Environment variables — UMI Max only exposes variables prefixed with `UMI_APP_`:

- `UMI_APP_SSO_AUTHORIZE_URL` (default `/sso/authorize`)
- `UMI_APP_SSO_CLIENT_CODE` (default `iam`)
- `UMI_APP_ADMIN_ROLE_CODE` (default `iam:admin`)

Copy `apps/admin/.env.example` to `apps/admin/.env.local` to override locally.

### Shared package (`packages/shared`)

- `@iam/shared` — imported by both `apps/api` and `apps/admin` via `workspace:*`
- Currently exports `ServiceStatusCode` and related status helpers from `src/enums/service.status.ts`
- Add new cross-cutting constants / enums here rather than duplicating them across apps

### Key Patterns

1. **Route handlers**: Hono + `@hono/zod-openapi` (OpenAPI-aware, Zod-validated)
2. **Service layer**: business logic in `*.service.ts`, DB access isolated to `*.repository.ts`
3. **Error handling**: custom errors with `ServiceStatusCode`, caught by the `errorHandler` middleware
4. **Validation**: Zod schemas drive both runtime validation and TS types
5. **Pagination**: `paginate` helper in `@/utils/page.util`
6. **Logging**: Pino configured in `@/lib/clients/pino`, attached via middleware in `app.ts`
7. **Typed RPC**: frontend consumes backend types via `hc<AppType>` — keep `apps/api` exports at `./src/app.ts` typed correctly

### Data Flow

1. Request → Route handler (Zod validation via `@hono/zod-openapi`) → Service → Repository → Prisma → DB
2. Response ← Service formats data ← Repository returns Prisma models ← DB
3. Frontend (`apps/admin`) calls backend through `apiClient` in `apps/admin/src/lib/api-client.ts`, sharing types through `@iam/api`’s `AppType` export.

## Environment Variables

### Backend (`apps/api/.env`)

Required variables — full schema in `apps/api/src/env.ts`:

- `DATABASE_URL` — MySQL connection string (consumed by Prisma directly)
- `REDIS_URL`, `REDIS_PORT`, `REDIS_DB`
- `PORT` (default 30000)
- `IAM_SECRET_KEY`
- `WX_CORPID`, `WX_CORPSECRET`
- `SMS_URL`, `SMS_SIGNATURE_KEY`
- `ORCAS_URL`
- `LOG_LEVEL` (default `info`)
- `LOGIN_ENDPOINT`, `AUTHORIZATION_ENDPOINT`, `LOGOUT_ENDPOINT`, `THIRDPARTY_OA_ENDPOINT`

Template: `apps/api/.env.example`. Bun auto-loads `apps/api/.env` when the API is started via `pnpm --filter @iam/api dev/serve` (CWD is `apps/api`). Prisma commands executed through `pnpm --filter @iam/api exec prisma ...` pick up the same file.

### Frontend (`apps/admin/.env` / `.env.local`)

Only `UMI_APP_*` variables are injected into client code — see above.

## Code Style

- **Backend**: ESLint (Antfu config) — semicolons required, double quotes, max 120 chars (warn)
- **Frontend**: Prettier + ESLint (`.prettierrc`, `.eslintrc.js`) — organize imports via `prettier-plugin-organize-imports`
- **Formatting**: ESLint/Prettier handle formatting; do not reintroduce separate formatters
- **VS Code**: `.vscode/settings.json` enables auto-fix on save
- **Imports**: prefer path aliases in `apps/api` (`@/`, `@services/`, etc.) over relative paths

## Core Principles

- **Simplicity first**: every change should touch the minimum number of files
- **No shortcuts**: find and fix root causes; hold to senior-developer standards
- **Minimal blast radius**: avoid unrelated changes; respect package boundaries (don’t leak API-only code into the shared package)

## Testing

No test framework is configured yet. When adding tests, consider `bun:test` or Vitest for the API, and Vitest / Playwright for the admin.

## Deployment

### Backend

```bash
pnpm install --frozen-lockfile
pnpm --filter @iam/api exec prisma generate
pnpm --filter @iam/api exec prisma migrate deploy
pnpm --filter @iam/api serve   # or: bun run apps/api/src/index.ts
```

- Static files (Swagger) served from `apps/api/static/`
- Apply DB migrations before deploy (`prisma migrate deploy`)

### Admin frontend

```bash
pnpm --filter @iam/admin build  # artifacts in apps/admin/dist
```

Serve `apps/admin/dist` via Nginx/CDN and proxy `/admin`, `/auth`, `/public`, `/sso`, `/internal`, `/open` to the backend.

## Common Tasks

### Add a new API endpoint

1. Add/extend Zod schema in `apps/api/src/services/<domain>/*.schema.ts`
2. Implement service logic in `*.service.ts`; add repository methods if new DB access is required
3. Add the route handler under `apps/api/src/routes/<group>/`
4. If it is a new route group, mount it in `apps/api/src/app.ts`
5. Frontend can call the endpoint via `apiClient.<path>.$get/$post(...)` with full type inference

### Modify the database schema

1. Edit `apps/api/src/db/schema.prisma`
2. `pnpm --filter @iam/api exec prisma generate`
3. `pnpm --filter @iam/api exec prisma migrate dev --name <name>`
4. Zod schemas auto-regenerate via `prisma-zod-generator`

### Share code between api and admin

- Put it in `packages/shared/src/` and re-export from `packages/shared/src/index.ts`
- Import via `import { ... } from "@iam/shared"` in both apps

### Debugging

- Pino logs — configure level via `LOG_LEVEL`
- Scalar API reference: <http://localhost:30000/doc/scalar>
- Prisma Studio for DB inspection
- UMI proxies defined in `apps/admin/.umirc.ts` — update targets when running against a different backend
