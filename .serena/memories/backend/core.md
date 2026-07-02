# Backend Core

- Backend surfaces include Bun + Hono API apps, a Node-based OIDC provider app, and a Bun worker app.
- `apps/api` owns public IAM tiers: `/public`, `/open`, `/internal`, `/sso`, `/auth`.
- `apps/admin-api` owns admin tiers: `/admin`, `/rpc`; `/rpc` maps to `src/routes/trpc`.
- `apps/oidc-provider` is `@iam/oidc-provider`, a Node 24 app using `oidc-provider`; main code lives under `src/composition`, `src/provider`, `src/session`, `src/storage`, `src/stores`, plus `src/app.ts`, `src/env.ts`, and `src/index.ts`.
- `apps/worker` is `@iam/worker`, a Bun background job runtime; composition lives under `src/composition`, module selection under `src/modules`, health/Bull Board HTTP support under `src/http`, and command-only backfill/repair entrypoints under `src/commands`.
- API tiers are declared in `apps/api/app.config.ts` and `apps/admin-api/app.config.ts`.
- `createApp` lives in `packages/api-core` and mounts materialized route/middleware records supplied by app composition roots; keep it app-agnostic and free of app-specific DI wiring.
- API app `src/app.ts` files should stay focused on app assembly: env, app config, logger, composition root, and `createApp` inputs.
- App-local composition creates production runtime, repository, tx, service, route, middleware, integration, session, and worker instances under `src/composition/`.
- Backend replaceable modules export factories and return types, e.g. `createUserService(deps)` and `type UserService = ReturnType<typeof createUserService>`; do not reintroduce bound production service/repository singletons.
- App-local infrastructure singletons belong under `src/lib/`, e.g. logger aliases and `src/lib/infra/redis.ts`.
- Consumer-owned `*.port.ts` files define outbound behavior consumed by services/use-cases; keep enums, DTO schemas, domain errors, constants, and pure helpers as static imports.
- Tier-level `_middleware.ts` files stay thin; shared auth handlers live in app-level `src/middlewares/*.handler.ts` files and are materialized by composition.
- REST route modules use `*.routes.ts`, `*.handlers.ts`, and `*.type.ts`; route `*.index.ts` files expose router factories that receive materialized handlers/adapters.
- Admin REST + tRPC route modules share `*.adapter.ts` operation factories and expose thin `*.trpc.ts` modules.
- Bun API/worker app `tsconfig.json` files include Bun runtime types; backend ESLint configs ignore generated/unsupported script surfaces as configured locally.
- Architecture guard tests in `apps/api/src/__tests__/architecture.test.ts` and `apps/admin-api/src/__tests__/architecture.test.ts` intentionally fail on forbidden production imports.