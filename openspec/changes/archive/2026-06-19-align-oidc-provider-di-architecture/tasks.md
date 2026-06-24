## 1. Composition 与 lifecycle

- [x] 1.1 新建 `apps/oidc-provider/src/composition/` 分层目录和类型，定义 `createOidcProviderComposition()` 的返回结构。
- [x] 1.2 将 logger、Redis、signing keys、DB resource、workers 和 shutdown resource 创建集中到 OIDC composition root。
- [x] 1.3 调整 `apps/oidc-provider/src/index.ts`，使 entrypoint 只负责 env parse、composition 创建、`server.listen` 和 signal shutdown。
- [x] 1.4 将 Node HTTP server 创建移动到 composition-owned HTTP module，并让它接收 materialized runtime/services。

## 2. Repository 与 Redis store 边界

- [x] 2.1 将 OIDC account、authorization、client repositories 改为 `createXRepository(dbClient)` 工厂，并移除 repository 对 `@iam/db` singleton 的 value import。
- [x] 2.2 将 OIDC client runtime DB lookup、Redis cache、read-through runtime store 和 secret verifier 拆开，保持现有 DTO、availability 和 cache namespace 语义。
- [x] 2.3 抽出 provider session binding、return handle、global session、token registry/revocation、client auth failure 等 Redis-backed semantic stores。
- [x] 2.4 确认 Redis store 拆分不改变现有 Redis key、TTL、payload、consume/revoke 行为。

## 3. Ports 与 service factory 迁移

- [x] 3.1 为 claims、interaction、storage adapter、client auth rate limit 等模块建立 consumer-owned Port 类型。
- [x] 3.2 将 claims、global session resolver、interaction handler、client auth rate limiter 迁移为 `createX(deps)` factory 或等价 factory 形态。
- [x] 3.3 让 protocol/business modules 依赖 Ports 或 semantic stores，而不是 concrete repositories、Redis singleton 或 app-local production modules。
- [x] 3.4 将 `DynamicClientAdapter` 和 `RedisOidcAdapter` 的 client/session/token 协作依赖收窄为 Ports，保留 Redis adapter 内部对 concrete Redis 的使用。

## 4. Provider wiring

- [x] 4.1 拆出 provider instance creation module，保持 `createProviderConfiguration()` 由依赖驱动且不创建 production deps。
- [x] 4.2 将 client authentication、redirect URI checks、protocol model payload patch、Koa middleware 和 provider event registration 集中到 provider wiring modules。
- [x] 4.3 确认 HTTP server 和业务 services 不直接 patch `oidc-provider` prototypes 或 protocol models。
- [x] 4.4 保持 OIDC endpoint、token、session、CORS、logout、client invalidation 和 Redis key 语义不变。

## 5. Tests 与 architecture guard

- [x] 5.1 新增 `apps/oidc-provider` architecture guard test，覆盖 DB singleton、Redis singleton、logger singleton、concrete repository/service import 边界。
- [x] 5.2 更新 claims、interaction、redis-adapter、configuration、protocol、http-server logging 等现有 tests，使其通过 DI fakes 构造模块。
- [x] 5.3 为新增 client runtime store、Redis semantic stores 和 provider wiring 补充 focused tests。
- [x] 5.4 确认 architecture guard 允许 composition、repository implementation、Redis-backed stores 和 storage adapter 的必要 infrastructure imports。

## 6. Validation

- [x] 6.1 运行 `pnpm --filter @iam/oidc-provider test`。
- [x] 6.2 运行 `pnpm --filter @iam/oidc-provider typecheck`。
- [x] 6.3 运行 `pnpm --filter @iam/oidc-provider lint`。
- [x] 6.4 运行 `openspec status --change align-oidc-provider-di-architecture` 并确认 change apply-ready。
