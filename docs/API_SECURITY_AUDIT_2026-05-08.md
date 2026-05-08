# apps/api 安全审计报告

审计日期：2026-05-08  
审计对象：`apps/api` 当前工作区代码（Bun + Hono + Drizzle + Redis + tRPC）  
审计方式：静态代码审计、路由/中间件链路追踪、敏感关键字检索、`pnpm audit -P` 依赖漏洞检查。

## 结论摘要

当前 API 存在多项可被实际利用的安全风险。最高优先级问题集中在认证绕过、客户端密钥泄露、会话与授权边界缺失、SSO 回调校验不足，以及公开依赖漏洞。

建议将以下 5 项作为 P0 紧急修复：

1. 移除 `MAGIC_CODE` 登录后门。
2. 禁止公开接口返回 `clientSecret`，并轮换已泄露的客户端密钥。
3. 为 `admin` / `rpc` / `internal` 增加明确的角色、权限、客户端来源校验。
4. 修复 SSO `redirectUrl.startsWith()` 校验、一次性 auth code、URL 中传 token/clientSecret 的问题。
5. 升级或移除存在公开 advisory 的依赖，至少处理 `axios`、`hono`、`sm-crypto`、`xlsx`、`hono-pino/defu`。

## 风险总览

| 严重级别 | 数量 | 主要类别 |
|---|---:|---|
| Critical | 5 | 登录后门、客户端密钥公开、admin 越权、内部鉴权绕过、SSO 重定向/令牌泄露 |
| High | 9 | 短信验证码弱保护、auth code 重放、密钥轮换失效、依赖漏洞、会话失效缺失 |
| Medium | 8 | Cookie/CSRF/安全头、用户枚举、明文密钥配置、Redis/DB 配置校验不足 |

## Critical Findings

### C-01 `MAGIC_CODE` 可绕过密码和短信验证码登录

位置：

- `apps/api/src/routes/auth/auth.service.ts:15-20`
- `apps/api/src/routes/auth/auth.service.ts:26-35`

问题：

`loginPassword` 在用户密码不匹配时，只要输入值等于 `config.MAGIC_CODE` 就允许登录；`loginMobile` 也允许验证码等于 `MAGIC_CODE` 时绕过 Redis 中的真实验证码。

影响：

任何知道该环境变量的人可以登录任意已启用用户名或手机号账户。仓库中的开发 compose 还包含明文 `MAGIC_CODE` 配置位置（`docker/docker-compose-dev.yml:47-54`），如果该文件被共享或复制到生产环境，风险会直接升级为全局账号接管。

建议：

- 立即移除 `password !== config.MAGIC_CODE` 和 `code !== config.MAGIC_CODE` 分支。
- 如确需应急登录，改为短期、审计化、单账号、单次使用的后台 break-glass 流程。
- 轮换所有已经暴露或曾经使用过的 `MAGIC_CODE`。

### C-02 公开接口泄露 `clientSecret`

位置：

- `apps/api/src/routes/open/open.handlers.ts:9-12`
- `apps/api/src/routes/open/open.routes.ts:13-24`
- `apps/api/src/services/client/client.schema.ts:5-18`
- `apps/api/src/db/schema/core/clients.ts:5-10`

问题：

`GET /open/client/status?clientCode=...` 是公开接口，直接返回 `ClientDtoSchema`。该 schema 来自完整 `client` 表 select schema，包含 `clientSecret` 字段。

影响：

攻击者只要知道或猜到 `clientCode`，就能获取客户端密钥。该密钥又被用于：

- `internal` tier 的 `apikey` 鉴权。
- SSO `/sso/token` 的 `clientSecret` 校验。
- OA 第三方登录签名计算。

这会导致内部接口越权、SSO token 兑换、客户端配置篡改链路被进一步打开。

建议：

- 为公开接口创建 `ClientPublicDtoSchema`，显式 `omit({ clientSecret: true })`，同时评估是否应隐藏 `validRedirectUrls`、`callbackEndpoint`、`logoutEndpoint`。
- 对所有已通过公开接口可能泄露的 `clientSecret` 做强制轮换。
- 将客户端密钥改为只显示一次、数据库中只保存哈希或 HMAC 摘要。

### C-03 `admin` 与 `rpc` 只校验登录，不校验管理员权限

位置：

- `apps/api/src/routes/admin/_middleware.ts:1-4`
- `apps/api/src/routes/trpc/_middleware.ts:1-4`
- `apps/api/src/routes/admin/user/user.ops.ts:32-65`
- `apps/api/src/lib/core/business-op.ts:31-50`

问题：

`admin` 和 `rpc` tier 复用 `publicAuthenicationHandler`，只验证 session 是否存在。业务操作层 `defineQueryOp` / `defineMutationOp` 也没有接收当前用户上下文或做权限校验。当前任意已登录用户在携带有效 session 后，可以调用用户创建、禁用、删除、重置密码、组织/岗位/任职管理、客户端创建/更新等管理接口。

额外风险：

`publicAuthenicationHandler` 根据请求头 `Client` 决定读 `global_session` 还是 `local_<client>_session`（`apps/api/src/middlewares/authenication.handler.ts:10-23`）。因此拥有任意客户端本地 session 的用户，也可能通过伪造 `Client` 头访问 `admin`。

影响：

普通用户可提升为事实上的系统管理员，执行账号接管、重置他人密码、禁用用户、创建或修改客户端密钥、修改组织任职关系等操作。

建议：

- 为 `admin` / `rpc` 建立独立中间件，要求 `Client=iam` 或专用 admin client，并校验用户角色/权限。
- 在 `business-op` 层传入当前用户上下文，集中做权限声明，例如 `requiredPrivileges`。
- 对所有管理端 mutation 增加审计日志。

### C-04 内部鉴权可被伪造请求头绕过

位置：

- `apps/api/src/routes/auth/auth.handlers.ts:52-67`

问题：

`internalAuthz` 信任客户端传入的 `IP-Chain` 头，只要包含特定内网字符串就直接返回成功，不再校验 `apikey`。普通外部请求如果能触达该接口，可以伪造该头绕过内部鉴权。

影响：

依赖 `/auth/internal-authz` 作为网关鉴权的内部服务可能被绕过，进而访问本应仅内部系统调用的接口。

建议：

- 不信任客户端自带 `IP-Chain`；只使用网关注入且在边界层清洗后的 `X-Forwarded-For` / mTLS 身份。
- 优先改为 mTLS、网关签名 JWT，或至少校验来源 IP 来自真实 socket/可信代理链。
- 删除该 bypass 分支，所有 internal 调用都必须验证服务身份。

### C-05 SSO 重定向校验可绕过，并将 token 放入 URL

位置：

- `apps/api/src/routes/sso/sso.service.ts:18-24`
- `apps/api/src/routes/sso/sso.service.ts:77-84`
- `apps/api/src/routes/sso/sso.handlers.ts:21-41`
- `apps/api/src/routes/sso/sso.handlers.ts:77-103`

问题：

SSO 只用 `redirectUrl.startsWith(allowedUrl)` 判断回调地址是否合法。若白名单为 `https://trusted.example.com`，攻击者可构造 `https://trusted.example.com.evil.test/...` 通过检查。回调处理随后把 `token` 和 `orcasToken` 写入查询参数并重定向。

影响：

攻击者可把授权码或本地 session token 引导到恶意域名，导致 session 泄露和账号接管。`loginOA` / `loginWX` 也把全局 token 拼进 `/sso/authorize?...&token=...`，增加浏览器历史、反向代理日志、Referer 泄露面。

建议：

- 使用 `new URL()` 后精确比较 `origin`，必要时再比较路径前缀；禁止 `startsWith()` 判定 URL 归属。
- 不在 URL 查询参数中传 session token；使用 HttpOnly Secure Cookie 或后端到后端 token exchange。
- `/sso/logout` 的 `redirectUrl` 也应走同一白名单。

## High Findings

### H-01 SSO auth code 非一次性，可在有效期内重放

位置：

- `apps/api/src/routes/sso/sso.service.ts:26-33`
- `apps/api/src/routes/sso/sso.service.ts:60-68`
- `apps/api/src/routes/sso/sso.service.ts:92-100`

问题：

`authorize` 生成 `auth_code:<code>` 后，`callback` 和 `setToken` 只读取 Redis，不删除该 code。攻击者一旦获得 code，可在 `AUTH_CODE_EXPIRE_TIME` 内反复兑换多个 local session。

建议：

- 用 Redis 原子操作实现一次性消费，例如 Lua 脚本或 `GETDEL`。
- 绑定 `code`、`clientCode`、`redirectUri`、`globalSessionId`，兑换时逐项校验。

### H-02 短信验证码 4 位、`Math.random()`、无频控、可复用

位置：

- `apps/api/src/lib/integrations/sms/sms.client.ts:13-15`
- `apps/api/src/services/mobile/mobile.service.ts:12-24`
- `apps/api/src/services/mobile/mobile.service.ts:51-53`
- `apps/api/src/routes/open/open.handlers.ts:25-47`

问题：

验证码只有 4 位，使用 `Math.random()` 生成；发送、校验、登录、重置密码路径没有尝试次数限制；验证码校验成功后不删除 Redis key，180 秒内可重复使用。

影响：

攻击者可以对公开的验证码校验、短信登录、密码重置接口进行撞库和暴力尝试。结合 `MAGIC_CODE` 与用户枚举接口，账号接管风险更高。

建议：

- 使用 `crypto.getRandomValues()` / `crypto.randomInt()` 生成 6 位或更长验证码。
- 对手机号、IP、用户名、设备指纹加发送与校验限流。
- 校验成功后立即删除验证码；失败次数超过阈值锁定该验证码。

### H-03 客户端密钥轮换后旧密钥仍可能在 Redis 中永久有效

位置：

- `apps/api/src/services/client/client.service.ts:9-13`
- `apps/api/src/services/client/client.service.ts:73-78`
- `apps/api/src/services/client/client.repository.ts:14-17`

问题：

客户端缓存以 `cache:client:secret:<clientSecret>` 为 key，且没有 TTL。`updateClient` 只写入新 secret 的缓存，不删除旧 secret key。旧 secret 如果曾被缓存，轮换后仍可通过缓存命中并通过 `getClientBySecret`。

影响：

客户端密钥轮换不可靠，泄露密钥可能长期有效，影响 internal API 和 SSO token exchange。

建议：

- 缓存设置短 TTL。
- 更新 client 时删除旧 `clientCode` 与旧 `clientSecret` cache key。
- 不要把 secret 作为 Redis key 的一部分；使用 client id/code 查询，再常量时间比较密钥摘要。

### H-04 Client 状态和删除标记未参与鉴权

位置：

- `apps/api/src/services/client/client.repository.ts:8-17`
- `apps/api/src/middlewares/authenication.handler.ts:37-46`

问题：

`getClientByCode` / `getClientBySecret` 只按 code 或 secret 查询，没有过滤 `status`、`isDelete`。`internalAuthenicationHandler` 只判断是否查到 client。

影响：

已禁用或软删除的客户端仍可能继续调用 internal 接口或参与 SSO 流程。

建议：

- 所有鉴权查询必须过滤 `status=Enable` 且 `isDelete=false`。
- 禁用/删除 client 时立即清理 session、auth code、cache。

### H-05 密码变更、重置、禁用、删除后未撤销已有 session

位置：

- `apps/api/src/middlewares/authenication.handler.ts:21-33`
- `apps/api/src/services/session/session.service.ts:77-89`
- `apps/api/src/services/user/user.service.ts:65-103`
- `apps/api/src/services/user/user.service.ts:301-329`

问题：

session 中保存的是登录时的用户详情 JSON。后续请求只从 Redis 读 session，不重新检查数据库中的用户状态、删除标记、密码版本。密码修改、密码重置、账号禁用、软删除后，旧 session 仍可继续使用至 TTL 到期。

影响：

离职、封禁、密码泄露处置无法立即生效。

建议：

- 引入 `sessionVersion` / `passwordChangedAt` / `disabledAt`，每次请求校验。
- 密码修改、重置、禁用、删除用户时撤销该用户所有 global/local session。

### H-06 认证代理 `authz` 只认证，不授权路径

位置：

- `apps/api/src/routes/auth/auth.handlers.ts:34-49`
- `apps/api/src/routes/auth/auth.service.ts:39-69`

问题：

`authz` 只检查 `X-Forwarded-Uri` 是否存在，不使用该 URI 做权限匹配。`auth.service.ts` 中原本关于 path/client/session 的校验已被注释，当前只要 local session 存在就返回 `X-User-Info`。

影响：

如果网关或业务系统依赖该接口做“鉴权”，实际结果是任意已登录本地用户均可通过。

建议：

- 明确接口语义：若只做认证，改名并避免被当成授权；若做授权，应基于 client、path、method、用户 privileges 做策略判断。

### H-07 公开依赖漏洞影响 API 生产依赖

验证命令：

```bash
pnpm --registry=https://registry.npmjs.org audit -P --json
```

结果摘要：

API 路径相关 advisory 共 27 个：8 high、18 moderate、1 low。

| 包 | 当前版本 | 相关风险 | 建议 |
|---|---:|---|---|
| `axios` | 1.13.5 | 多个 SSRF / 原型污染 / header 注入 / DoS advisory | 升级到至少 1.15.2，或改用内置 `fetch` |
| `hono` | 4.12.8 | cookie 处理、bodyLimit 绕过、JSX HTML injection 等 advisory | 升级到至少 4.12.16 |
| `sm-crypto` | 0.3.14 | SM2-DSA 签名伪造 advisory | 升级到 0.4.0+；同时评估 OA 签名实现 |
| `xlsx` | 0.18.5 | SheetJS 原型污染与 ReDoS，且官方 npm 包无修复版本 | 若 API 未使用则移除；如需解析 Excel，改用维护状态明确的替代库并隔离上传解析 |
| `defu` | 6.1.4 | 经 `hono-pino` 引入的原型污染 advisory | 升级 `hono-pino` 或覆盖 `defu>=6.1.5` |

## Medium Findings

### M-01 Cookie 缺少 `secure`，且缺少统一 CSRF 防护

位置：

- `apps/api/src/routes/auth/auth.handlers.ts:13-18`
- `apps/api/src/routes/auth/auth.handlers.ts:25-30`
- `apps/api/src/routes/sso/sso.handlers.ts:24-39`
- `apps/api/src/routes/sso/sso.handlers.ts:85-101`

问题：

Session cookie 设置了 `httpOnly` 和 `sameSite: "Lax"`，但未设置 `secure`。管理端 mutation 和 SSO logout 也没有 CSRF token 或 Origin/Referer 校验。

建议：

- 生产环境 cookie 必须设置 `secure: true`。
- 对所有 cookie 鉴权的 mutation 增加 CSRF token 或 Origin/Referer allowlist。
- 将登出等状态变更操作从 GET 改为 POST。

### M-02 缺少全局安全响应头、请求体大小限制和 CORS 策略

位置：

- `apps/api/src/lib/core/create-app.ts:120-128`

问题：

应用注册了静态资源、日志、错误处理和 request id，但没有看到安全响应头（如 CSP、X-Content-Type-Options、X-Frame-Options/ frame-ancestors、Referrer-Policy）、明确 CORS 策略或请求体大小限制。

建议：

- 增加安全头中间件。
- 明确允许的 CORS origin、method、header、credentials。
- 对 JSON body 设置大小上限，并升级 Hono 后再依赖 `bodyLimit`。

### M-03 用户枚举和手机号存在性泄露

位置：

- `apps/api/src/routes/open/open.handlers.ts:15-23`
- `apps/api/src/routes/open/open.service.ts:14-26`
- `apps/api/src/services/mobile/mobile.service.ts:12-18`

问题：

公开接口可按 username 查询姓名和脱敏手机号；发送验证码在手机号不存在时返回明确错误；密码重置路径会区分用户名不存在、未绑定手机号、手机号不匹配等状态。

建议：

- 公开找回密码流程统一返回“如信息匹配将发送验证码”。
- 对 user info 查询加图形验证码、频控或登录前挑战。

### M-04 客户端密钥明文存储、明文比较

位置：

- `apps/api/src/db/schema/core/clients.ts:5-10`
- `apps/api/src/services/client/client.repository.ts:14-17`
- `apps/api/src/routes/sso/sso.service.ts:55-59`

问题：

`clientSecret` 明文存储在数据库中，并用普通字符串比较。泄露数据库、日志、Redis key 或公开接口后，密钥可直接使用。

建议：

- 将 `clientSecret` 改为只保存哈希摘要。
- 比较时使用常量时间比较。
- 密钥只在创建时显示一次，后续仅支持轮换。

### M-05 生产样例 compose 含明文密钥和内网地址

位置：

- `docker/docker-compose-dev.yml:39-60`

问题：

compose 中包含生产模式、数据库连接、默认密码、魔法码、第三方密钥和内网服务地址。这些值即使是开发用途，也容易被复制到部署环境或泄露给无关人员。

建议：

- compose 只保留占位符或引用 `.env.example`。
- 已出现的密钥统一视为泄露并轮换。

### M-06 Redis 连接未配置认证、TLS、命名空间

位置：

- `apps/api/src/lib/clients/redis.ts:5-10`

问题：

Redis 仅配置 host/port/db，没有 password、TLS、key prefix。当前 Redis 存储 global/local session、验证码、客户端 secret cache，一旦 Redis 被横向访问，可直接接管会话。

建议：

- 生产 Redis 启用 ACL/password、TLS 或私有网络强隔离。
- 设置应用级 key prefix。
- 对敏感 cache 设置 TTL，并避免把 secret 放在 key 名中。

### M-07 环境变量 schema 未校验 `DATABASE_URL`

位置：

- `apps/api/src/env.ts:3-26`
- `apps/api/src/db/index.ts:6-12`

问题：

`DATABASE_URL` 在 DB 层直接从 `process.env` 读取，不在统一 Zod env schema 中校验。其他 URL 也只用 `z.string()`，没有限制协议。

建议：

- 将 `DATABASE_URL`、`MYSQL_DATABASE_URL` 等纳入 env schema。
- 对外部 URL 使用 `z.url()`，并限制生产环境必须为 HTTPS，内网服务例外需显式 allowlist。

### M-08 Docker 镜像未显式使用非 root 用户，并写入构建代理

位置：

- `apps/api/Dockerfile:5-10`
- `apps/api/Dockerfile:30-40`

问题：

Dockerfile 在 base/deps 阶段写入代理地址，runtime 阶段未显式 `USER`。如果基础镜像默认 root，则容器逃逸后的影响面更大。

建议：

- runtime 镜像显式创建并切换到非 root 用户。
- 通过 build args 或 CI secret 管理代理配置，避免写入镜像层。

## 正向观察

- 多数 REST 路由使用 `@hono/zod-openapi` 的 schema 校验请求体、query、params。
- 数据库访问大多使用 Drizzle query builder，未发现明显字符串拼接 SQL 注入。
- OpenAPI/Scalar 主页按配置仅在 `NODE_ENV !== "production"` 时启用（`apps/api/app.config.ts:6-8`）。
- 本地 `.env` 文件已被 `.gitignore` 忽略，未纳入 git 跟踪。

## 建议整改路线

### 7 天内

1. 移除 `MAGIC_CODE`；轮换所有 client secret、第三方密钥和默认密码。
2. 修复公开 `clientStatus` 返回值，隐藏 secret 和敏感 endpoint。
3. 增加 admin/rpc 权限中间件，先按最小可行策略限制为明确 admin privilege。
4. 修复 `internalAuthz` 的 `IP-Chain` 信任问题。
5. 修复 SSO redirect allowlist、GET token 泄露、auth code 一次性消费。
6. 对登录、验证码发送/校验、密码重置加 Redis 限流。

### 30 天内

1. 引入统一授权模型：route/op 声明 `requiredPrivileges`，中间件集中执行。
2. 实现 session revocation：密码/状态/删除/client 禁用后立即撤销相关 session。
3. 客户端密钥改为哈希存储，轮换时删除旧缓存。
4. 升级 `hono`、`axios`、`sm-crypto`；移除或替换 `xlsx`。
5. 增加安全头、CORS allowlist、请求体大小限制。

### 90 天内

1. 将 internal API 改为 mTLS 或网关签名 JWT。
2. 建立审计日志：登录、验证码、管理员 mutation、client secret 轮换。
3. 建立 CI 安全门禁：`pnpm audit --audit-level high`、secret scanning、依赖更新检查。
4. 对 SSO 流程补充集成测试和滥用用例测试。

## 审计限制

本报告基于静态源码、当前 lockfile 与依赖公告结果，不包含真实部署拓扑、网关规则、数据库数据、Redis 配置、WAF/安全组策略和运行时日志。因此部分风险的可达性取决于实际网络暴露面；但上述 Critical/High 项即使只在内网可达，也建议按生产安全事故前置修复。
