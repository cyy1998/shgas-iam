## Context

`apps/api/src/routes/sso/sso.service.ts` 当前暴露 `authorize`、`callback`、`setToken`、`loginOA`、`loginWX` 和 `logout`，并在
同一个 factory 中协调 client lookup、redirect allowlist、Custom SSO Session Kernel adapter、ORCAS、OA signature、WeChat cache、
user lookup、PrincipalSession 和 audit。`sso.handlers.ts` 同时负责 Hono query/header/cookie 解析、token precedence、cookie 写删、
redirect 拼装、endpoint configuration 与 response envelope；后者是合法的 protocol adapter 职责。

本 child 依赖已归档的 Account Recovery 与 Authentication child，复用现有 `composition/use-cases` 聚合和 consumer-owned port
模式。既有 `sso-session-consistency.test.ts` 已覆盖 redirect wildcard、Kernel session、auth code、ORCAS 和 logout cleanup 的主要行为，
但测试 seam 仍是 omnibus `createSsoService`，handler tests 也只覆盖 endpoint configuration。迁移必须先补齐六个 operation 与 route
协议行为的 characterization，再移除旧 service。

## Goals / Non-Goals

**Goals:**

- 用六个 caller-goal use-case 表达 authorize、callback、code exchange、OA login、WeChat login 与 logout workflow。
- 让 route 保留 cookie、query/header precedence、redirect、endpoint configuration 和 response adaptation。
- 让 redirect allowlist 使用可复用且职责明确的 validator，WeChat cache/retry 由 WeChat login use-case 拥有。
- 为新 use-case 建立 consumer-owned ports，并增加 migrated SSO architecture guards。
- 保持 client validation、Custom SSO Session Kernel、ORCAS、OA、WeChat、Redis、audit、cookie、redirect 和错误传播完全兼容。

**Non-Goals:**

- 不修改 `CustomSsoSessionKernelAdapter`、cleanup adapter、Session Kernel authority model 或 local-session authz 行为。
- 不改变 SSO REST/OpenAPI path、method、schema、response envelope、redirect query、cookie attributes 或 endpoint configuration。
- 不改变 OA hash/timestamp algorithm、WeChat cache key/sentinel/retry/TTL、ORCAS integration contract 或 audit builders。
- 不处理 Admin、OIDC provider 或历史 production ports；全局 port hardening 仍由后续 child 完成。
- 不改变 database schema、Redis keyspace、workspace dependency、session lifetime 或 deployment topology。

## Decisions

### 1. 按六个调用方目标建立 operation-specific use-cases

新增：

```text
apps/api/src/use-cases/sso/
  authorize-sso/
    authorize-sso.use-case.ts
    authorize-sso.port.ts
    authorize-sso.type.ts
  complete-sso-callback/
    complete-sso-callback.use-case.ts
    complete-sso-callback.port.ts
    complete-sso-callback.type.ts
  exchange-sso-code/
    exchange-sso-code.use-case.ts
    exchange-sso-code.port.ts
    exchange-sso-code.type.ts
  login-with-oa/
    login-with-oa.use-case.ts
    login-with-oa.port.ts
    login-with-oa.type.ts
  login-with-wechat/
    login-with-wechat.use-case.ts
    login-with-wechat.port.ts
    login-with-wechat.type.ts
  logout-sso-session/
    logout-sso-session.use-case.ts
    logout-sso-session.port.ts
    logout-sso-session.type.ts
```

每个 factory 对外只暴露 `execute(input, options?)`。Input 只包含已验证 primitive 与 token source；options 只包含中立的
`AuditRequestContext`。Use-case 不接收 Hono `Context`，也不读写 cookie/header 或拼装 redirect URL。

Authorize 保留 client lookup → redirect validation → `customSsoSession.authorize` 顺序。Callback 保留 client lookup → redirect
validation → auth code consume → required ORCAS login → Gateway local session 顺序。Code exchange 保留 client/secret validation → auth
code consume → Independent local session 顺序。Logout 只委托 session adapter 并返回现有成功结果。

替代方案是把 `SsoService` 原样移动到 `services/sso`。未采用，因为六个 operation 具有不同身份、凭据、integration 与失败边界，
继续使用单一 facade 会保留 omnibus workflow。也不为六个 operation 增加统一 `SsoUseCase` mode 参数，避免重新聚合分支。

### 2. Redirect allowlist 使用共享 Validator，WeChat retry 保持 operation-owned

Authorize 与 callback 共用的 URL syntax、wildcard matching 和 invalid historical pattern logging 迁到：

```text
apps/api/src/services/sso/redirect-url.validator.ts
```

`createSsoRedirectUrlValidator` 只暴露 `isAllowed(clientCode, redirectUrl, patterns, options)`，保留 `http/https` 限制、
`matchRedirectUrlPattern` 行为、跳过非法历史 pattern 的策略、warning event/message 和 request observability fields。它是跨两个
operation 复用的安全 validator，不拥有 client lookup 或 redirect response。

WeChat cache/retry 只服务于 WeChat login，因此留在 `login-with-wechat` use-case 内部：保持 `wx-code:${code}`、`Processing` sentinel、
600 秒 TTL、200ms delay、既有 retry 边界、cache payload compatibility、active-user revalidation、`amr=["wechat"]` 与仅首次流程写
success audit。Delay 作为最小 consumer-owned port 从 composition 注入，便于 deterministic tests；production 仍适配 Bun `sleep`。

替代方案是创建通用 `WechatLoginService`。未采用，因为当前没有第二个消费者，提前抽取会制造仅转发一个 workflow 的 service。

### 3. OA、WeChat 与 session side-effect 顺序逐项保持

OA login 保留 client lookup、production-only 五分钟 timestamp window、SM3 + Base64 signature、active username lookup、Formal user
限制、detail lookup、`amr=["oa"]` PrincipalSession、success audit 和结果 shape。Handler 仍在 OA login 前注销 cookie/header 中的旧
global session，并在成功后设置 cookie、重定向到 authorize。

WeChat first-pass 保留 cache miss → 写 `Processing` → exchange wxId → active user/detail lookup → PrincipalSession → success audit →
cache final userId 的顺序。Cache hit/retry 不重复 success audit；错误继续原样传播，不在迁移中增加 cleanup 或 fallback。

Callback 中 ORCAS login 必须在 Gateway local session 创建前成功，失败时不得返回 local token；返回的 ORCAS session id 继续由
handler 写入 cookie 与 redirect query。Code exchange、callback 和 logout 继续使用现有 Custom SSO Session Kernel adapter，不复制或
直接读写 session authority Redis key。

### 4. Route 只消费六个 operation facade

`CreateSsoHandlersDeps` 改为接收 `sso` operation aggregate，每项仅含 `execute`。Handler 继续拥有：

- `global_session` cookie 优先于 `Authorization` header，header 优先于 query token 的 authorize precedence；
- callback 的 `local_${client}_session`、`orcas_sso_sessionid` cookie 与 `token`/`orcasToken` redirect query；
- logout 的 cookie/query selection、cookie deletion 和 fallback redirect；
- OA 登录前旧 session logout、OA/WeChat 成功 cookie 与 authorize redirect；
- `X-IAM-Entry-Network` endpoint configuration、request context 提取和 response envelope。

Routes、schemas 与 route index 不应发生行为性修改。`clientService.getClientByCode` 仍作为 route 的最小依赖，仅用于 authorize 后选择
Gateway callback path；workflow 内的 client validation 则由对应 use-case 自己执行。

### 5. Ports 直接声明消费方法与中立 shape

每个 `*.port.ts` 只声明该 operation 实际调用的 client、user、redirect validator、session、integration、Redis、delay 与 audit 方法。
完整 user detail 使用 `@iam/domain/user` 的 `UserDetailDto`；client 与 auth-code/local-session 输入输出在 consumer-owned `*.type.ts`
中声明最小结构，或使用已有中立 domain contract。

Ports 不使用 `Pick<ClientService>`、`Pick<UserService>`、`Pick<CustomSsoSessionKernelAdapter>`，不 import `routes/**`、concrete
`*.service.ts`/`*.adapter.ts` 或 repository-owned DTO。Composition 通过 TypeScript structural typing 连接现有 production
implementations；必要的参数适配在 composition root 显式完成。

### 6. Composition 通过 `useCases.sso` 暴露 operations

`createApiServices` 只创建并返回 redirect validator，不再创建或返回 `sso`。`createApiUseCases` 在 `useCases.sso` 下创建
`authorize`、`completeCallback`、`exchangeCode`、`loginWithOa`、`loginWithWechat`、`logout` 六个 operation facade。该 aggregate
只表达 composition ownership，不提供新的 omnibus business API。

`createApiRoutes` 将该 aggregate、route-only client lookup 与 logger/config 注入 `createSsoHandlers`。删除 `sso.service.ts` 与
`sso.port.ts`，不保留 forwarding re-export。

### 7. Characterization 与 architecture guards 锁定行为和结构

先把现有 omnibus tests 按最终 `execute` seams 拆分或迁移，并补 handler characterization。Architecture tests 增加：

- `routes/sso/sso.service.ts` 与 `sso.port.ts` 不得恢复，route production module 不得导出 `create*Service`；
- `routes/sso` 不得静态拥有 Redis、ORCAS、WeChat、audit 或 Session Kernel workflow dependency；
- SSO use-case ports 不得 import repository/concrete service/adapter module，或使用
  `Pick<...Repository>`/`Pick<...Service>`；
- `services/sso` 不得反向 import `use-cases/sso`。

Guard 只覆盖本 child 已迁移的 SSO 范围，不提前改变 Admin/OIDC 或 umbrella 最后 port-hardening child 的范围。

## Risks / Trade-offs

- [Risk] 拆分 authorize、callback 与 exchange 会改变 auth code consume、client validation 或 local-session 创建顺序。→ Mitigation：
  为三条流程覆盖 invalid client/redirect/code、revoked principal、payload write failure、ORCAS failure 与 one-time consume 的顺序测试。
- [Risk] WeChat retry 迁移可能改变 sentinel、retry 次数、TTL、cache payload 或 audit 次数。→ Mitigation：对 cache miss/hit、
  `Processing`、legacy payload、timeout、active-user revalidation 和首次/重试 audit 建立 fake clock/delay/Redis tests。
- [Risk] Route facade 重接线可能改变 cookie/token precedence 或 redirect encoding。→ Mitigation：补齐 handler-level characterization，
  并保持 routes/schema 文件无行为性 diff。
- [Risk] 六个 use-case ports 会产生重复的 client/session shape。→ Mitigation：只共享稳定的中立 type，避免为了减少少量重复而创建
  新 omnibus port。
- [Trade-off] Composition wiring 会显著变长。→ 接受显式 wiring，以换取 operation ownership、独立测试 seam 和可回滚边界。

## Migration Plan

1. 记录现有 SSO focused/architecture 与 API full test、typecheck、lint 基线。
2. 在 production code 修改前补 handler、六个 workflow、redirect validator 与 architecture red tests，并确认预期 red signal。
3. 新增 redirect validator 与六个 consumer-owned use-cases，按 operation 完成 red-green vertical slices。
4. 更新 services/useCases/routes composition，删除 `SsoService`、legacy port 与 `services.sso` wiring，保持 routes/schema 契约不变。
5. 运行 focused tests、API architecture、full test、typecheck、lint、child strict validation、`pnpm check:openspec` 与
   `git diff --check`；人工复核 SSO compatibility matrix。
6. 用户确认 Archive 后同步 delta specs、归档并 squash merge 回 `feature/standardize-backend-application-boundaries`。

Rollback 只需回退该 child 的 squash commit，即可恢复 `SsoService` 与旧 wiring。没有 database、Redis data migration、workspace
dependency 或 deployment 切换步骤。

## Open Questions

无阻断性开放问题。共享 port shape 的进一步全局收敛属于最后一个 consumer-owned ports child；本 child 只保证新建 SSO ports 不
引入 provider-owned shape。
