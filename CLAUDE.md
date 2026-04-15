# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an IAM (Identity and Access Management) service built with:

- **Runtime**: Bun (see `devEngines.runtime` in package.json)
- **Framework**: Hono with OpenAPI extensions (`@hono/zod-openapi`)
- **Database**: MySQL with Prisma ORM
- **Session storage**: Redis (ioredis client)
- **Authentication**: OIDC provider (`oidc-provider`) for SSO
- **API documentation**: Swagger UI served at `/doc/swagger`
- **Code style**: ESLint with Antfu configuration (semicolons, double quotes, max line length 120)

## Development Commands

### Prerequisites

- **Bun** runtime (version compatible with `devEngines.runtime` in package.json)
- **MySQL** database with connection string in `DATABASE_URL` environment variable
- **Redis** instance for session storage (configured via `REDIS_URL`, `REDIS_PORT`, `REDIS_DB`)
- **Environment variables**: Set required variables (see `src/env.ts`). A `.env` file is used but not committed.

### Common Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# Start development server with hot reload
pnpm dev

# Start production server
pnpm serve

# Lint code
pnpm lint

# Lint and auto-fix
pnpm lint:fix

# Database operations (not in package.json but commonly used)
pnpm prisma generate    # Generate Prisma client after schema changes
pnpm prisma migrate dev # Create and apply migrations
pnpm prisma studio      # Open Prisma Studio for data inspection
```

## Architecture

### Application Structure

- **`src/app.ts`**: Main Hono application with route registration and OpenAPI configuration
- **`src/index.ts`**: Service entry point exporting Bun server configuration
- **`src/env.ts`**: Environment variable validation using Zod
- **`src/routes/`**: API routes organized by access level:
  - `admin/` – Administrative endpoints (client, employment, organization, position, user management)
  - `auth/` – Authentication endpoints
  - `internal/` – Internal service calls
  - `open/` – Open APIs
  - `public/` – Public APIs
  - `sso/` – Single sign-on endpoints
- **`src/services/`**: Business logic layer, each with:
  - `*.service.ts` – Main service functions
  - `*.repository.ts` – Database queries (Prisma calls)
  - `*.schema.ts` – Zod schemas for validation
  - `*.type.ts` – TypeScript type definitions
- **`src/db/`**: Database configuration
  - `schema.prisma` – Prisma schema defining models
  - `generated/` – Auto-generated Prisma client and Zod schemas
  - `sql/` – Raw SQL scripts for data synchronization
- **`src/lib/`**: External client configurations (Redis, Pino logger, OpenAPI utilities)
- **`src/middlewares/`**: Hono middlewares (error handling, etc.)
- **`src/utils/`**: Shared utilities (HTTP helpers, Zod utilities, pagination)
- **`src/enums/`**: TypeScript enums for status codes, usage types, etc.
- **`src/errors/`**: Custom error classes extending `CustomError`

### Key Patterns

1. **Route Handlers**: Use Hono's OpenAPI integration with Zod validation
2. **Service Layer**: Business logic in services, database operations in repositories
3. **Error Handling**: Custom error classes with service status codes (see `ServiceStatusCode` enum), caught by `errorHandler` middleware
4. **Validation**: Zod schemas for both runtime validation and TypeScript types
5. **Pagination**: Uses `paginate` utility from `@/utils/page.util`
6. **Path Aliases**: Configured in tsconfig.json (e.g., `@/*`, `@services/*`, `@db`, `@lib/*`)
7. **Error Codes**: Standardized error codes defined in `src/enums/service.status.ts`
8. **Logging**: Pino logger configured in `@/lib/clients/pino`, used via middleware in `app.ts`

### Data Flow

1. Request → Route handler (validates input with Zod OpenAPI) → Service method → Repository method → Prisma client → Database
2. Response ← Service formats data ← Repository returns Prisma models ← Database

### Dependencies

- **Core**: `hono`, `@hono/zod-openapi`, `@hono/swagger-ui`
- **Database**: `@prisma/client`, `@prisma/adapter-mariadb`, `prisma-zod-generator`
- **Auth**: `oidc-provider`, `bcrypt-ts`, `sm-crypto`
- **External APIs**: `axios` (HTTP client), `ioredis` (Redis), `pino` (logging)
- **Utilities**: `luxon` (datetime), `zod` (validation), `xlsx` (Excel), `csv-parse`

## Environment Variables

Required environment variables (see `src/env.ts` for complete schema):

- `DATABASE_URL`: MySQL connection string (used by Prisma)
- `REDIS_URL`, `REDIS_PORT`, `REDIS_DB`: Redis configuration
- `PORT`: Server port (default: 30000)
- `IAM_SECRET_KEY`: Secret for JWT/signing
- `WX_CORPID`, `WX_CORPSECRET`: WeChat integration
- `SMS_URL`, `SMS_SIGNATURE_KEY`: SMS service configuration
- `ORCAS_URL`: External service URL
- `LOG_LEVEL`: Pino log level (default: "info")

## Code Style

- **ESLint**: Antfu configuration with stylistic rules
- **Formatting**: ESLint handles formatting (Prettier disabled)
- **VS Code**: Settings in `.vscode/settings.json` enable ESLint auto-fix on save
- **Imports**: Use path aliases (`@/`, `@services/`, etc.) not relative paths
- **Line length**: Maximum 120 characters (warnings only)
- **Semicolons**: Required
- **Quotes**: Double quotes

## Core Principles

- **Simplicity first**: Make every change as simple as possible, touching minimal code
- **No shortcuts**: Find root causes, no temporary fixes, hold to senior developer standards
- **Minimal blast radius**: Only touch what's necessary, avoid introducing new bugs

## Testing

No test framework is currently configured. Consider adding tests with `bun:test` or Vitest.

## Deployment

- Service runs via Bun (`bun run serve`)
- Static files served from `static/` directory
- Swagger UI resources in `static/swagger/`
- Database migrations must be applied before deployment (`prisma migrate deploy`)

## Common Tasks

### Adding a New API Endpoint

1. Add Zod schema in appropriate `src/services/*/*.schema.ts`
2. Add route handler in relevant `src/routes/*/*.ts`
3. Register route in `src/app.ts` if new route group
4. Implement service method in `src/services/*/*.service.ts`
5. Add repository methods if new database queries needed

### Modifying Database Schema

1. Edit `src/db/schema.prisma`
2. Generate Prisma client: `bunx prisma generate`
3. Create migration: `bunx prisma migrate dev --name descriptive_name`
4. Update Zod schemas (auto-generated by prisma-zod-generator)

### Debugging

- Logging uses Pino with configurable log level via `LOG_LEVEL`
- Debug utilities in `debug/` directory
- Swagger UI available at `http://localhost:30000/doc/swagger` when running locally
