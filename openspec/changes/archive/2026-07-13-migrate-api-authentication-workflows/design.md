## Context

`apps/api/src/routes/auth/auth.service.ts` 当前以单一 `AuthService` 承载 password login、mobile login 与 local-session
`authz`。两个 login workflow 同时协调 Human Verification、live user lookup、Redis-backed failure/blacklist state、密码或短信
验证码校验、Session Kernel PrincipalSession 创建与 audit；这些是 Application workflow，而不是 HTTP route behavior。

同一 route 目录中的 `login-failure.helper.ts` 实际拥有 Redis sorted set、blacklist key、clock 和 random 依赖；
`login-credential.helper.ts` 则实现 SM2/SM4 credential 解密、timestamp window 与 Redis nonce 防重放。前者是 authentication
state service，后者是 protocol security parser，二者都不应继续以 route-local stateful helper 表达。

本 child 依赖已归档的 Account Recovery child 和既有 `composition/use-cases` 聚合，只迁移 Authentication。现有
`authentication-sessions`、`human-verification` 与 `audit-logging` specs 已定义行为基线，本 change 只增加应用边界要求，不改变
这些运行时契约。

## Goals / Non-Goals

**Goals:**

- 用 `login-with-password` 与 `login-with-mobile` 两个 caller-goal use-case 表达登录 workflow。
- 将 Redis failure/blacklist state 与 encrypted credential parser 迁入 `services/authentication`，使用明确的 Service/Parser 角色。
- 删除 `AuthService`，让 auth route 只负责 credential、header/cookie、request context、facade 调用和 response adaptation。
- 为新 use-case 建立 consumer-owned ports，并增加迁移范围内的 architecture guards。
- 保持 Human Verification、magic code、failure/blacklist、Session Kernel、audit、Redis 与 HTTP 行为完全兼容。
- 修复 umbrella 已分配给本 child 的 `auth.handlers.test.ts` import-order lint baseline。

**Non-Goals:**

- 不迁移 SSO authorize/callback/code exchange/OA/WeChat/logout；这些属于后续 SSO child。
- 不修改 `CustomSsoSessionKernelAdapter`、`UserService`、`MobileService`、Cap/HumanRisk service 或 audit builders 的行为。
- 不改变 login credential 加密格式、key rotation、timestamp window、nonce key/TTL 或前端登录协议。
- 不改变 Session Kernel token/session lifetime、`global_session` cookie attributes、REST/OpenAPI schema 或 error mapping。
- 不处理历史 Admin/OIDC ports；全局 port hardening 仍由最后一个 child 完成。

## Decisions

### 1. Password 与 mobile login 按调用方目标拆成两个 use-case

新增：

```text
apps/api/src/use-cases/authentication/
  login-with-password/
    login-with-password.use-case.ts
    login-with-password.port.ts
    login-with-password.type.ts
  login-with-mobile/
    login-with-mobile.use-case.ts
    login-with-mobile.port.ts
    login-with-mobile.type.ts
```

两个 use-case 对外只暴露 `execute(input, options)`。Input 包含已解析 primitive、可选 opaque `capToken`；options 只包含
`ApiRequestContext`。它们不得接收 Hono `Context`，返回现有 `{ token, isMobileSet }`。

Password login 保留以下顺序：Human Verification → active user lookup → blacklist check → password/MAGIC_CODE 校验 → failure
risk/audit/count/blacklist → detail lookup → clear failure/blacklist → `amr=["pwd"]` PrincipalSession → success audit。User lookup
失败时继续先记录 risk 与 `user_lookup_failed` audit；Human Verification required error 不产生重复 failure side effect。

Mobile login 保留以下顺序：Human Verification → active user lookup → blacklist check → MAGIC_CODE 或 atomic login code consume →
failure risk/audit/count/blacklist → detail lookup → clear failure/blacklist → `amr=["sms"]` PrincipalSession → success audit。未知
active user 的 invalid code 不写用户 failure count；valid code 后 user 不存在仍按原顺序抛错。

替代方案是把 `AuthService` 原样移动到 `services/authentication`。未采用，因为 password/mobile 具有不同 credential、verification、
failure 与 audit 分支，继续合并会保留 omnibus workflow。也不抽取单一 `LoginUseCase` 加 mode 参数，避免把协议分支重新内聚到一个
入口。

### 2. Failure state 使用 domain-aligned service，credential 使用 Parser

将 `login-failure.helper.ts` 迁为：

```text
apps/api/src/services/authentication/login-failure.service.ts
```

保留 `createLoginFailureService`、public methods、Redis keys、30 分钟 sorted-set window、5 次阈值、blacklist TTL、reason 与提示
文案。该模块围绕 authentication failure state 提供可复用 command/query facade，因此保留 `Service` 角色。

将 `login-credential.helper.ts` 迁为：

```text
apps/api/src/services/authentication/login-credential.parser.ts
```

保留 `createLoginCredentialParser` 与 `parseLoginPasswordCredential` public seam。Parser 继续拥有 credential 解密、schema、timestamp
与 nonce 防重放，但不拥有 login workflow。

删除 route 下旧文件，不保留 forwarding re-export。替代方案是将两者都作为 use-case collaborator 放到 `use-cases` scope；未采用，
因为它们分别是可复用状态能力与安全 parser，而不是调用方目标。

### 3. `authz` 直接消费最小 local-session authorizer

`authz` 仍由 route 负责 `Client`、`X-Forwarded-Uri`、cookie/header token precedence、client lookup、错误映射和 `X-User-Info`
header。Handler 通过直接声明的最小依赖调用现有 `authorizeLocalSession(sessionId, client)`，不再经过 `AuthService.authz`。

Production composition 将 `services.customSsoSession` 结构化适配到该最小 route facade。这里不新建 `AuthenticationService`，因为
authz 的 Session Kernel adapter 已有明确职责，新建转发 facade 只会保留旧命名层。

### 4. 新 ports 直接声明消费方法与中立 shape

每个 login use-case 的 `*.port.ts` 只声明实际调用的 user lookup/password verification、verification-code consumer、Human
Verification、Human Risk、login failure、PrincipalSession creator 与 audit writer 方法。Active-user 最小 shape 放在对应
`*.type.ts`；完整 user detail 使用 `@iam/domain/user` 的中立 `UserDetailDto` contract。

Ports 不使用 `Pick<UserService>`、`Pick<MobileService>`、`Pick<CustomSsoSessionKernelAdapter>` 或 repository-owned DTO。
Composition 依靠 TypeScript structural typing 连接现有 production implementations；use-case 不 import concrete service modules。

### 5. Composition 通过 `useCases.authentication` 暴露登录 operation

`createApiServices` 只创建 login failure service 与 credential parser，不再创建或返回 `auth`。`createApiUseCases` 在
`useCases.authentication` 下创建 `loginWithPassword`、`loginWithMobile` 两个 operation facade。该 aggregate 只表达 composition
ownership，不提供新的 omnibus business API。

`createApiRoutes` 将两个 use-case、credential parser 与 local-session authorizer 注入 `createAuthHandlers`。Route definitions、
schemas 与 cookie config 保持无 diff。

### 6. Characterization 与 architecture guards 锁定行为和结构

先扩展现有 public seams 的 characterization tests，再迁移到最终模块位置。Architecture tests 增加迁移范围 guard：

- `routes/auth/auth.service.ts`、`auth.port.ts`、`login-failure.helper.ts` 与 `login-credential.helper.ts` 不得恢复；
- `routes/auth` production module 不得导出 `create*Service` 或重新拥有 stateful login helper；
- Authentication use-case ports 不得 import repository/concrete service module，或使用
  `Pick<...Repository>`/`Pick<...Service>`；
- `services/authentication` 不得反向 import `use-cases/authentication`。

Guard 只覆盖已迁移 Authentication 范围，不提前禁止 SSO route 中待后续 child 处理的 `SsoService`。

## Risks / Trade-offs

- [Risk] 两个 use-case 共享同一 Redis failure streak，拆分后可能产生顺序或 reason 漂移。→ Mitigation：用同一个真实
  `LoginFailureService` fake boundary 做交叉 password/mobile characterization，并断言 key、window、threshold、TTL 与消息。
- [Risk] mobile magic code、atomic consume 与 unknown-user 分支顺序改变会影响重放和枚举行为。→ Mitigation：覆盖 MAGIC_CODE、
  successful consume/replay、unknown user invalid/valid code 与 no-session failure paths。
- [Risk] Human Verification required、user lookup、blacklist 与 credential failure 的 audit/risk side effect 顺序漂移。→
  Mitigation：为两个 execute seams 编写顺序敏感 tests，并复用既有 audit builders。
- [Risk] composition aggregate 增加 wiring 长度。→ Mitigation：只按 `useCases.authentication` 聚合实例，不创建共享 workflow
  facade。
- [Trade-off] 两个 use-case 会各自保留少量 failure/blacklist orchestration。→ 接受该重复以保持调用方目标独立；共享的 Redis
  state 与格式化规则仍集中在 `LoginFailureService`。

## Migration Plan

1. 记录现有 auth focused/architecture baseline，确认 API lint 仅有分配给本 child 的 import-order diagnostic。
2. 在 production code 修改前补齐 handler、password/mobile workflow、failure service、credential parser 与 architecture red tests。
3. 新增两个 use-case 与 consumer-owned ports，迁移 support modules，并保持每个 red-green vertical slice。
4. 更新 services/useCases/routes composition，删除 `AuthService` 与 route stateful helpers，修复 auth test lint baseline。
5. 运行 focused tests、API architecture、full test、typecheck、lint、child strict validation 与 `pnpm check:openspec`；人工复核
   REST/OpenAPI、cookie、Human Verification、Redis、Session Kernel 与 audit compatibility matrix。
6. 用户确认 Archive 后同步 delta specs、归档并 squash merge 回 `feature/standardize-backend-application-boundaries`。

Rollback 只需回退该 child 的 squash commit，即可恢复 `AuthService` 与旧 route wiring。没有 database、Redis data migration、
workspace dependency 或 deployment 切换步骤。

## Open Questions

无阻断性开放问题。SSO operation 对 `customSsoSession` 的后续拆分属于下一个 child，本 change 只改变 Authentication login/authz
wiring，不先行重命名或收窄 SSO ports。
