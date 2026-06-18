## 1. Composition And Runtime Foundations

- [x] 1.1 Create `apps/api/src/composition` and `apps/admin-api/src/composition` directory structures with `runtime`, `repositories`, `tx`, `services`, `routes`, `middlewares`, and `index` modules.
- [x] 1.2 Define app-local runtime Port types for logger, Redis, password hashing, random generation, clock, config slices, integration adapters, and `afterCommit` logging.
- [x] 1.3 Implement app-local `UnitOfWork` factories that create tx-bound ports from transaction `DbClient`, collect `afterCommit` callbacks, await them after commit, and log best-effort failures without failing committed operations.
- [x] 1.4 Update `apps/api/src/app.ts` and `apps/admin-api/src/app.ts` to call composition roots and pass materialized routes and middlewares to `createApp` without changing `api-core`.

## 2. Repository Factories

- [x] 2.1 Convert `apps/api/src/services/**/**.repository.ts` modules to export `createXRepository(db)` factories and repository return types.
- [x] 2.2 Convert `apps/admin-api/src/services/**/**.repository.ts` modules to export `createXRepository(db)` factories and repository return types.
- [x] 2.3 Replace repository-internal root `db.select(...)` subqueries with transaction-bound query construction so repository methods only use the bound `DbClient`.
- [x] 2.4 Wire root and tx-bound repositories in both app composition roots.

## 3. Audit Writer And Event Builders

- [x] 3.1 Convert `apps/api/src/services/audit/audit.service.ts` and `apps/admin-api/src/services/audit/audit.service.ts` into audit writer factories that can bind root or tx repositories.
- [x] 3.2 Convert `apps/api/src/services/audit/events/*.audit.ts` to pure audit payload builders with no direct persistence imports.
- [x] 3.3 Convert `apps/admin-api/src/services/audit/events/*.audit.ts` and `admin-resource-audit.ts` to pure audit payload builders with no direct persistence imports.
- [x] 3.4 Update audit event tests to validate payload builder output and audit writer behavior through DI fakes.

## 4. API Service And Use-Case Migration

- [x] 4.1 Add consumer-owned `*.port.ts` files for `apps/api` service/use-case modules that depend on other modules, repositories, runtime ports, config slices, or integration ports.
- [x] 4.2 Convert `apps/api/src/services/user`, `organization`, `privilege`, `session`, `client`, `mobile`, and `human-verification` service/helper modules to factory exports with injected deps.
- [x] 4.3 Convert `apps/api/src/routes/auth/*.service.ts`, `routes/open/*.service.ts`, and `routes/sso/*.service.ts` to factory exports with injected deps.
- [x] 4.4 Move API transaction workflows to `UnitOfWork` and tx-bound ports; move Redis/cache/external side effects to root ports or best-effort `afterCommit`.
- [x] 4.5 Wire all API service factories in `apps/api/src/composition/services.ts` without lazy service getters.

## 5. Admin API Service And Use-Case Migration

- [x] 5.1 Add consumer-owned `*.port.ts` files for `apps/admin-api` service/use-case modules that depend on other modules, repositories, runtime ports, config slices, or integration ports.
- [x] 5.2 Convert `apps/admin-api/src/services/user`, `client`, `organization`, `position`, `employment`, and supporting service modules to factory exports with injected deps.
- [x] 5.3 Move admin mutation workflows to `UnitOfWork` and tx-bound ports; move Redis cache/OIDC invalidation/token revocation side effects to root ports or best-effort `afterCommit`.
- [x] 5.4 Wire all admin-api service factories in `apps/admin-api/src/composition/services.ts` without lazy service getters.

## 6. Integration Adapter Migration

- [x] 6.1 Convert API Cap, Wechat, Orcas, and SMS integration clients to adapter factories with no production singleton default exports.
- [x] 6.2 Convert admin-api client cache, OIDC invalidation, and token revocation behavior to injectable business ports.
- [x] 6.3 Wire integration adapters in app composition runtime modules and expose only semantic ports to service factories.

## 7. Route, Adapter, TRPC, And Middleware Migration

- [x] 7.1 Convert `apps/api/src/routes/**/*.handlers.ts` and route-local service handlers to factory exports with injected service facades and runtime ports.
- [x] 7.2 Convert `apps/api/src/routes/**/*.index.ts` and tier `_middleware.ts` modules to factories materialized by composition root.
- [x] 7.3 Convert `apps/admin-api/src/routes/admin/**/*.adapter.ts`, `*.trpc.ts`, and `*.index.ts` modules to factories that share injected operation definitions between REST and tRPC.
- [x] 7.4 Convert `apps/admin-api/src/routes/admin/_middleware.ts` and `routes/trpc/_middleware.ts` to factories materialized by composition root.
- [x] 7.5 Ensure REST paths, OpenAPI route definitions, tRPC router exports, cookies, auth behavior, and response envelopes remain unchanged.

## 8. Test Fake Migration

- [x] 8.1 Add app-level infrastructure fakes under `apps/api/src/test/fakes` and `apps/admin-api/src/test/fakes` for `UnitOfWork`, Redis-like behavior, logger, password hasher, random, clock, and common runtime ports.
- [x] 8.2 Add local fake builders in affected module `__tests__` directories for service deps, route deps, and adapter deps.
- [x] 8.3 Migrate `apps/api` business, handler, middleware, and route tests from app-local `mock.module` to factory construction with DI fakes.
- [x] 8.4 Migrate `apps/admin-api` business, adapter, tRPC, middleware, and route tests from app-local `mock.module` to factory construction with DI fakes.
- [x] 8.5 Keep third-party mocks only where a boundary is not yet represented by an injected Port, and prefer adding a Port before adding a new module mock.

## 9. Architecture Guards

- [x] 9.1 Add backend architecture tests that scan `apps/api/src` and `apps/admin-api/src` for forbidden static imports of app-local service/repository/db/redis/logger production dependencies outside composition/runtime/repository implementation allowlists.
- [x] 9.2 Add architecture test coverage for route/middleware factories to prevent `*.index.ts` and `_middleware.ts` from importing production service singletons.
- [x] 9.3 Document approved import exceptions near the architecture test so future changes can update allowlists deliberately.

## 10. Validation

- [x] 10.1 Run `pnpm --filter @iam/api typecheck`, `pnpm --filter @iam/api test`, and `pnpm --filter @iam/api lint`.
- [x] 10.2 Run `pnpm --filter @iam/admin-api typecheck`, `pnpm --filter @iam/admin-api test`, and `pnpm --filter @iam/admin-api lint`.
- [x] 10.3 Run typecheck/tests for directly affected shared packages if public types change. (Not required; no shared package public types changed.)
- [x] 10.4 Run focused smoke checks for public API auth/session flows and admin REST/tRPC client/user mutation flows.
- [x] 10.5 Verify `openspec validate introduce-functional-di --strict` passes before archive.
