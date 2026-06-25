## Context

Session Kernel 已经成为 IAM 浏览器主会话、custom SSO local session、OIDC provider session binding、OIDC authorization code、OIDC access token 和 admin API 鉴权的权威状态层。当前仓库仍保留一组迁移前实现：`apps/api` 的旧 `SessionService`、OIDC provider 的旧 Redis stores、admin API 对旧 Redis session id 的 fallback，以及 `@iam/api-core/session` 中的 legacy helper。这些实现不再承载主路径，却仍在 composition、测试或公共导出中可见。

这次变更的核心是删除旧权威路径，让运行时只能通过 Session Kernel 读写会话状态；同时保留 `@iam/api-core/session/kernel` 作为稳定公共子路径。

## Goals / Non-Goals

**Goals:**

- 移除 API 旧 `SessionService` 及其配套类型/schema/port，避免 app composition 暴露未使用的 `services.session`。
- 移除 OIDC provider 中未再注入运行时的旧 global session、provider session binding 和 return handle Redis stores。
- 移除 admin API 对旧 Redis session id 的 fallback；无效或缺失的 `global_session` SHALL fail closed。
- 收窄 `@iam/api-core/session` legacy helper 导出，让生产代码不再依赖 `global_session:*`、`local_*_session:*` 等旧 authority key helper。
- 更新测试和架构守卫，证明 custom SSO、OIDC 和 admin API 均只使用 Session Kernel 会话路径。

**Non-Goals:**

- 不改变 Session Kernel object model、token 前缀、HMAC lookup、TTL 或 tombstone 语义。
- 不移除 `/sso/authorize` 对 PrincipalSession token 的 `Authorization` header / query `token` 兼容输入；该兼容输入仍使用 Session Kernel PrincipalSession。
- 不改变 OIDC Authorization Code Flow、UserInfo、RP-Initiated Logout 或 custom SSO public API 响应契约。
- 不引入新的 Redis 数据模型或数据库迁移。

## Decisions

1. **直接删除旧 API SessionService，而不是保留空 facade。**
   旧服务只围绕 legacy `@iam/api-core/session` helper 工作，当前生产路由、中间件和 SSO service 已使用 `customSsoSession` adapter。保留空 facade 会继续让调用方误以为存在第二套会话入口。实现时应从 `createApiServices()` 返回值、测试 fixture 和 imports 中移除 `session`。

2. **admin API 只接受 Session Kernel PrincipalSession。**
   当前 `createAdminAuthenticationHandlers()` 在 token 缺失或非 `iam_ps_` 格式解析失败时回退到 `createAdminAuthenticationHandler()`。变更后 admin API SHALL 对缺失 token、Kernel 解析失败、用户状态失效或角色不足分别 fail closed，不再读取 legacy `global_session:*`。

3. **OIDC provider composition 只注入 `oidcSession` adapter。**
   `global-session.store.ts`、`provider-session-binding.store.ts` 和 `return-handle.store.ts` 都是迁移前 Redis store；其中 provider session store 还生成 `legacy:*` bindingId。当前 provider runtime、interaction handler、claims service 和 redis adapter 已可以通过 `deps.session.oidcSession` 访问对应能力，因此这些旧 store 应从 `createOidcProviderStores()` 和类型中移除。

4. **`@iam/api-core/session` legacy helper 作为生产 API 退场。**
   `@iam/api-core/session/kernel` 继续导出 Kernel public API；根 `./session` 子路径可以删除、改为只 re-export kernel namespace，或保留最小兼容壳但不再导出 legacy helper。实现时优先选择能让旧 helper import 在 typecheck 中暴露的方案，并同步删除只覆盖 legacy helper 的测试。

5. **保留 Session Kernel cleanup adapter 与发布清理能力。**
   本变更清理的是运行时 legacy authority 模块，不改变 Kernel cleanup refs、OIDC token store、client invalidation 或发布前 Redis cleanup 语义。若实现发现某个 cleanup 脚本只依赖已删除 helper，应将其改为自包含的 key pattern 工具，而不是恢复旧会话 helper。

## Risks / Trade-offs

- **旧浏览器 cookie 或旧 Redis session id 不再可用** → 这是目标行为；发布说明和 smoke test 需要明确要求重新登录。
- **隐藏的测试 fixture 仍依赖旧 helper** → 通过 `rg`、package typecheck 和相关测试定位并替换为 Session Kernel fixture。
- **admin API 失去旧 session 兜底后更早返回 401** → 前端已有 401 跳转 SSO 登录逻辑；验证 admin REST 和 tRPC 请求均保持该行为。
- **删除 OIDC stores 可能影响旧单测** → 将测试关注点迁移到 `oidc-session-kernel.adapter.ts`、provider wiring 和 redis adapter 端口，不保留旧 store 单测。
- **`@iam/api-core/session` 导出收窄可能影响 workspace import** → 先用 typecheck 暴露所有调用方，再将需要保留的 Kernel 能力改为 `@iam/api-core/session/kernel`。

## Migration Plan

1. 删除 API、OIDC provider、admin API 和 api-core 中的 legacy runtime 模块与 composition 注入。
2. 更新或删除只覆盖旧 Redis session helper/store/fallback 的测试；补充 Session Kernel 主路径和 fail-closed 行为测试。
3. 运行 `@iam/api`、`@iam/admin-api`、`@iam/oidc-provider`、`@iam/api-core` 的 focused typecheck/test。
4. 执行 custom SSO、OIDC 和 admin API 的窄 smoke：登录授权、local session 鉴权、OIDC authorize/token/UserInfo/logout、admin 401 跳转。
5. 发布时要求旧 cookie/session 用户重新登录；如需回滚到旧版本，按既有 Session Kernel runbook 停流并清理新旧会话 key。

## Open Questions

- 是否保留 `@iam/api-core` package export `./session` 作为仅 re-export `kernel` 的兼容入口，还是直接移除该 export？实现前可根据 workspace import 清理成本决定。
