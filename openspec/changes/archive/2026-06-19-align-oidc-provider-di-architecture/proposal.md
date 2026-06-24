## Why

`apps/oidc-provider` 目前是独立 Node + `oidc-provider` 后端，但它没有被现有后端 DI 架构说明覆盖，导致 provider 组装、repository 创建、Redis 协议状态和 provider hooks 混在 `app.ts` 中。部分 OIDC repository 还直接 value import `@iam/db` singleton，使它成为第三种后端形态，增加测试、演进和架构回归风险。

## What Changes

- 将 `apps/oidc-provider` 纳入现有 backend functional DI 纪律，明确它是非 Hono backend app：复用 composition root、factory、consumer-owned Port 和 architecture guard 规则，但不强行使用 Hono `createApp`。
- 为 OIDC provider 设计 app-local `src/composition/` 分层，负责创建 runtime、DB-bound repositories、Redis-backed stores、services、provider wiring、Node HTTP server、workers 和 lifecycle resources。
- 将 OIDC provider repositories 调整为 `createXRepository(dbClient)` 工厂，repository 只绑定 `DbClient` 并访问 PostgreSQL，不直接 import DB singleton。
- 将 OIDC provider 业务/协议协调模块改为依赖 consumer-owned Ports 和语义 store，避免直接依赖 concrete repository、Redis singleton 或生产 runtime。
- 将 `oidc-provider` hooks、middleware、prototype/model patch 和 event registration 集中到 provider wiring 模块，降低升级和审查成本。
- 增加 `apps/oidc-provider` architecture guard，防止 DB、Redis、logger、concrete repository/service 等生产依赖重新进入业务/协议模块。
- 不引入空壳 UnitOfWork；OIDC provider 当前 DB 行为以读取为主，保留将来出现事务性 DB 写入时再接入 shared UnitOfWork 的规则。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `backend-functional-di`: 将非 Hono backend app，尤其是 `apps/oidc-provider`，纳入 functional DI、composition root、repository factory 和 architecture guard 要求。
- `oidc-provider`: 增加 provider 后端架构要求，覆盖 composition 分层、DB-bound repositories、Redis store 边界、provider wiring 集中化和 lifecycle 边界。

## Impact

- Affected code: `apps/oidc-provider/src/index.ts`、`app.ts`、`provider/`、`repositories/`、`storage/`、`interaction/`、`session/`、`invalidation/`、`security/`、`__tests__/`。
- Affected specs: `openspec/specs/backend-functional-di/spec.md`、`openspec/specs/oidc-provider/spec.md`。
- Affected tests: `@iam/oidc-provider` unit tests and a new architecture guard test.
- Public protocol behavior: no intended OIDC endpoint, token, session, CORS, logout, client invalidation, or Redis key semantic changes.
