## Why

当前登录、custom SSO、OIDC 和 admin 鉴权的权威会话已经迁移到 Session Kernel，但仓库仍保留旧 Redis 会话服务、旧 OIDC stores 和 admin legacy fallback。继续保留这些模块会让运行链路看起来有两套权威来源，增加维护成本、误用风险和后续会话清理的复杂度。

## What Changes

- 移除 `apps/api` 中旧 `SessionService` 及其 `session.port.ts`、`session.schema.ts`、`session.type.ts` 配套模块，并从服务组合中删除未被生产路由消费的 `session` 服务。
- 移除 `apps/oidc-provider` 中不再注入运行时的旧 `global-session.store.ts`、`provider-session-binding.store.ts` 和 `return-handle.store.ts`，让 OIDC interaction、provider session binding 和 return handle 只通过 `oidc-session-kernel.adapter.ts` 使用 Session Kernel。
- 移除 `apps/admin-api` admin 鉴权里的旧 Redis session fallback；admin API SHALL 只接受可解析的 Session Kernel PrincipalSession。
- **BREAKING**: 移除或收窄 `@iam/api-core/session` 中旧 `global_session:*` / `local_*_session:*` helper 的公开导出；保留 `@iam/api-core/session/kernel` 作为会话生命周期权威 API。
- 更新相关测试、架构约束和文档引用，确保不再把旧 Redis authority key 当作有效运行时路径。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `authentication-sessions`: 明确 API 侧不再创建、解析或回退到旧 `global_session:*` / `local_*_session:*` Redis authority key，admin legacy fallback 被移除。
- `oidc-provider`: 明确 OIDC provider 不再使用旧 global session store、provider session binding store 或 Redis return handle store，相关状态统一由 Session Kernel adapter 管理。
- `session-kernel-core`: 移除 legacy session helper 必须保持可用的要求，Session Kernel 成为 custom SSO、OIDC 和 admin session 校验的唯一会话基础设施。

## Impact

- 影响 `apps/api/src/services/session/*`、`apps/api/src/composition/services/index.ts`、`apps/admin-api/src/middlewares/authentication.handler.ts`、`apps/oidc-provider/src/stores/*` 和相关 composition 类型。
- 影响 `packages/api-core/src/session/index.ts`、`packages/api-core/src/middlewares/auth.ts`、legacy cleanup 脚本及其测试。
- 需要调整 `authentication-sessions`、`oidc-provider`、`session-kernel-core` 相关 specs 与测试；重点验证 custom SSO 登录/授权/登出、OIDC authorize/token/UserInfo/logout、admin API 鉴权和架构守卫。
