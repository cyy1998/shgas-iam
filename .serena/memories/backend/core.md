# Backend Core

- Backend apps are Bun + Hono with app-local assembly in `src/app.ts`.
- `apps/api` owns public IAM tiers: `/public`, `/open`, `/internal`, `/sso`, `/auth`.
- `apps/admin-api` owns admin tiers: `/admin`, `/rpc`; `/rpc` maps to `src/routes/trpc`.
- API tiers are declared in `apps/api/app.config.ts` and `apps/admin-api/app.config.ts`.
- `packages/api-core` provides `createApp`, route factories, OpenAPI helpers, response helpers, errors, middleware, Redis, logging, and tRPC utilities.
- `createApp` auto-discovers `*.index.ts` route modules and tier-level `_middleware.ts` files.
- Keep backend `src/app.ts` focused on env import, app config, app-local logger, discovered routes, tier middleware, and `createApp`.
- App-local infrastructure singletons belong under `src/lib/`, e.g. logger aliases and `src/lib/infra/redis.ts`.
- Tier-level `_middleware.ts` files stay thin and compose middleware arrays; shared auth handlers live in app-level `src/middlewares/*.handler.ts` files.
- REST route modules use `*.routes.ts`, `*.handlers.ts`, `*.type.ts`.
- Admin REST + tRPC route modules share `*.adapter.ts` operations and expose thin `*.trpc.ts` modules.
- Backend app `tsconfig.json` files include Bun runtime types and exclude `scripts`; backend ESLint configs ignore `scripts/**`.
- Place focused backend tests in nearby `__tests__/`, e.g. `src/services/position/__tests__/position.service.test.ts`.