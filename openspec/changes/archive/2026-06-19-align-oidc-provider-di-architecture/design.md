## Context

`apps/api` 和 `apps/admin-api` 已经通过 app-local `src/composition/` 实现 functional DI：entry 只负责 app assembly，composition root 创建 runtime、repositories、UnitOfWork、services、routes 和 middlewares。`apps/oidc-provider` 是独立 Node + `oidc-provider` 后端，不使用 Hono `createApp`，但它同样承担生产协议流量，目前缺少同等架构边界。

当前 `apps/oidc-provider/src/app.ts` 同时负责 provider 实例创建、repository 创建、claims/global session/interaction 组装、`oidc-provider` prototype/model patch、Koa middleware、event handler 和 Node HTTP server。OIDC repositories 直接 value import `@iam/db` singleton，多个业务/协议模块直接接收 concrete `ioredis.Redis`。这让测试更依赖 production module 形态，也让后续 provider 升级和 Redis/DB 边界审查困难。

## Goals / Non-Goals

**Goals:**

- 将 OIDC provider 纳入现有 backend functional DI 纪律，同时承认它是非 Hono backend app。
- 建立 `apps/oidc-provider/src/composition/` 分层，集中 production wiring 和 lifecycle resources。
- 将 OIDC repositories 变为 `DbClient`-bound factory，消除 repository 内部对 DB singleton 的 value import。
- 将 protocol/business modules 改为依赖 consumer-owned Ports 和语义 Redis stores。
- 集中 `oidc-provider` hooks、middleware、prototype/model patch 和 events，降低升级风险。
- 增加 architecture guard，防止 OIDC provider 回到 static production imports。
- 保持 OIDC endpoint、token、session、CORS、logout、client invalidation 和 Redis key 语义不变。

**Non-Goals:**

- 不把 `apps/oidc-provider` 并入 `apps/api` 或 Hono `createApp`。
- 不新增数据库 schema、migration 或 OIDC 协议能力。
- 不为了形式对齐引入空壳 UnitOfWork。
- 不重写 `oidc-provider` Adapter 的 Redis 存储算法，除非是为依赖边界做等价拆分。
- 不改变 admin-api 已有 client/user afterCommit invalidation 语义。

## Decisions

### 1. 用同一 DI 纪律覆盖非 Hono 后端

`backend-functional-di` 将增加非 Hono backend app 场景。`apps/oidc-provider` 不输出 Hono routes/middlewares，也不调用 `createApp`；它的 composition root 输出 provider runtime、Node HTTP server、worker/subscriber 和 shutdown resources。

备选方案是为 OIDC provider 单独建立一套 architecture spec。该方案会让仓库出现三种后端哲学，且会重复 functional factory、repository factory、consumer-owned Port 和 architecture guard 规则，因此不采用。

```text
api/admin-api composition
  -> routes + middlewares
  -> createApp(...)

oidc-provider composition
  -> provider + http server + workers + shutdown
  -> node server.listen(...)
```

### 2. 保留独立 Node + `oidc-provider`

OIDC provider 继续作为 `apps/oidc-provider` 独立 Node app。`oidc-provider` 自带 Koa callback、protocol model、Adapter lifecycle 和 provider hooks，强行塞入 Hono 会模糊协议边界。改造只复用 DI 和 composition 纪律，不复用 Hono route mounting。

### 3. Composition root 分层

目标结构：

```text
apps/oidc-provider/src/index.ts
apps/oidc-provider/src/composition/
  index.ts
  runtime/
  repositories/
  stores/
  services/
  provider/
  http/
  workers/
```

`index.ts` 只解析 env、创建 composition、调用 `server.listen()` 并绑定 signal。`createOidcProviderComposition()` 创建 logger、Redis、signing keys、DB-bound repositories、Redis-backed stores、services、provider wiring、HTTP server、invalidation subscriber，并返回 `shutdown(signal)`。

### 4. Repository 与 Redis runtime store 分离

OIDC DB repositories 只负责 PostgreSQL 查询：

```text
createOidcClientRepository(db)
createOidcAccountRepository(db)
createOidcAuthorizationRepository(db)
```

client runtime 的 read-through cache 不再放在 DB repository 内，而是由 runtime store 组合：

```text
OidcClientRepository        DB-only
OidcClientRuntimeCache      Redis-only
OidcClientRuntimeStore      read-through + DTO parse + availability check
OidcClientSecretVerifier    secret hash verification
```

这样 repository factory 规则与 `apps/api`、`apps/admin-api` 保持一致，Redis cache 失效和 JSON payload 校验也有独立边界。

### 5. Consumer-owned Ports 优先

OIDC provider 的 claims、interaction、global session、storage adapter、client auth rate limit 等模块只声明自己消费的最小 Port。避免建立全局 `src/ports/` 聚合目录，防止它变成 service locator。

示例：

```text
provider/claims.port.ts
  ClaimsAccountReader
  ClaimsAuthorizationReader
  ClaimsClientRuntimeReader
  ClaimsSessionResolver
  ClaimsTokenRevoker

interaction/interaction.port.ts
  InteractionClientReader
  InteractionSessionResolver
  InteractionReturnHandleStore

storage/redis-adapter.port.ts
  AdapterClientVersionReader
  AdapterSessionBindingStore
  AdapterTokenRegistry
```

### 6. Redis 依赖按 storage 边界收口

业务/协议协调模块不直接依赖 concrete `Redis`。它们依赖语义 stores，例如 global session store、provider session binding store、return handle store、OIDC client runtime cache、token registry、token revocation port、client auth failure store。

`RedisOidcAdapter`、Redis-backed store 实现和 `lib/redis.ts` 可以继续直接使用 `ioredis.Redis`，因为它们是 infrastructure 层。`RedisOidcAdapter` 对 client/session/token 的协作依赖也要收窄为 Port，而不是 concrete repository。

### 7. Provider wiring 集中化

`oidc-provider` 的扩展点集中放在 `provider/` wiring 模块：

```text
provider/create-provider.ts
provider/client-auth.ts
provider/protocol-models.ts
provider/middleware.ts
provider/events.ts
```

这些模块由 composition 调用。HTTP server 和业务 services 不直接知道 prototype patch、`AuthorizationCode.IN_PAYLOAD` patch、CORS cleanup、rate limit middleware 或 provider events 的细节。

### 8. 当前不引入 UnitOfWork

OIDC provider 当前 DB 行为主要是读取：client runtime、secret record、account、authorization claim。事务性写入在 `admin-api` 中完成，并通过 afterCommit best-effort invalidation 通知 OIDC Redis 对象清理。此时引入空壳 UoW 只会制造噪音。

规格将写成条件式：有事务性 DB 写入的 backend app SHALL wire shared UnitOfWork；只有 DB read-only protocol/runtime access 的 backend app MAY omit UnitOfWork，但 repositories 仍必须是 `DbClient`-bound factories。未来如果 OIDC provider 增加 DB 写入，例如 consent、protocol audit 或 refresh token metadata，再新增 `createOidcProviderUnitOfWork()`。

### 9. Architecture guard 覆盖 OIDC provider

新增 Vitest architecture guard，规则与 Bun 后端 guard 对齐但适配 OIDC 目录：

- `composition/**` 允许 import DB singleton、Redis factory、logger、repository factory、store factory、provider wiring。
- `repositories/**` 允许 import schema 和 `DbClient` type，不允许 value import `db` singleton。
- Redis-backed store 和 `storage/**` 允许 import `ioredis.Redis`。
- `provider/**`、`interaction/**`、business services、HTTP server 不允许 value import `@iam/db`、app-local Redis singleton、app-local logger singleton、concrete production repository/service。

## Risks / Trade-offs

- [Risk] 结构性迁移可能误改 OIDC 协议行为。Mitigation: 保留现有 protocol、claims、interaction、redis-adapter、http-server tests，并补充 targeted tests 覆盖新增 stores 和 wiring。
- [Risk] Ports 过度细碎会降低可读性。Mitigation: Port 文件跟随 consumer 放置，只声明当前模块真实消费的方法。
- [Risk] provider prototype/model patch 对 `oidc-provider` 版本敏感。Mitigation: 集中在 `provider/` wiring 模块并保留协议回归测试。
- [Risk] Redis store 拆分可能造成 key 规则漂移。Mitigation: 复用现有 key helper 和 Redis adapter tests，不改变 key namespace 或 payload 语义。
- [Risk] architecture guard 初期可能误报合理 infrastructure imports。Mitigation: 用小而明确的 allowlist，只允许 composition、repository 和 Redis-backed storage 边界例外。

## Migration Plan

1. 创建 `apps/oidc-provider/src/composition/` scaffold，并让 `index.ts` 改为只调用 composition、listen 和 shutdown。
2. 将 OIDC repositories 改为 `createXRepository(dbClient)` 工厂，补充 repository factory tests 或更新现有 tests。
3. 拆出 Redis-backed semantic stores，并让 claims、interaction、global session、rate limit 和 adapter 使用 consumer-owned Ports。
4. 拆出 provider wiring 模块，保持 `createProviderConfiguration()` 的纯配置形态并集中 provider hooks/events。
5. 更新 HTTP server 创建函数，使它接收 materialized runtime/services，而不是自己触达 production dependencies。
6. 增加 OIDC architecture guard 和必要的 focused unit tests。
7. 运行 `pnpm --filter @iam/oidc-provider test`、`typecheck` 和按影响范围选择的 lint。

Rollback strategy: 本变更不改变数据模型或公开协议；如迁移出现问题，回滚代码即可恢复旧 wiring。若已经部署，关闭新版本并回退镜像，不需要数据库回滚。

## Open Questions

- 无。当前设计决策已确认：独立 Node provider、纳入通用 DI、repository/store 分离、consumer-owned Ports、不引入空壳 UnitOfWork。
