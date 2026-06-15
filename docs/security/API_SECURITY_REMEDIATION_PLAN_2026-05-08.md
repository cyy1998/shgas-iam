# apps/api 漏洞解决方案报告

日期：2026-05-08  
关联审计报告：`docs/security/API_SECURITY_AUDIT_2026-05-08.md`  
适用范围：`apps/api` 认证、SSO、internal/admin 权限、会话、验证码、依赖与部署配置。

## 目标

本方案的目标不是一次性重构整个 IAM 服务，而是在可控变更范围内先阻断账号接管、密钥泄露和越权调用链路，再补齐长期安全治理能力。

整改完成后应达到以下效果：

1. 不存在全局登录绕过口令。
2. 公开接口不泄露 `clientSecret`、会话 token、内部 endpoint 等敏感信息。
3. `admin`、`rpc`、`internal` 均有明确身份与权限边界。
4. SSO 授权码一次性使用，重定向地址不可被前缀绕过。
5. 登录、验证码、密码重置具备基础抗暴力破解能力。
6. 密码、账号状态、client 状态变化后，旧 session 能及时失效。
7. API 生产依赖不保留已知高危 advisory。

## 整改优先级

| 优先级 | 时限 | 目标 | 涉及漏洞 |
|---|---:|---|---|
| P0 | 1-7 天 | 阻断可直接利用的账号接管和内部越权链路 | C-01、C-02、C-03、C-04、C-05、H-01、H-02 |
| P1 | 8-30 天 | 完成密钥、会话、权限模型和依赖治理 | H-03、H-04、H-05、H-06、H-07、M-01、M-02 |
| P2 | 31-90 天 | 完成部署安全、审计和持续安全门禁 | M-03、M-04、M-05、M-06、M-07、M-08 |

## P0 紧急修复方案

### 1. 移除 `MAGIC_CODE` 登录后门

涉及漏洞：C-01

改造方案：

1. 删除 `apps/api/src/routes/auth/auth.service.ts` 中 `password !== config.MAGIC_CODE` 和 `code !== config.MAGIC_CODE` 逻辑。
2. 从 `apps/api/src/env.ts` 中移除 `MAGIC_CODE` 必填项，或保留但不参与登录验证。
3. 清理 `apps/api/.env.example`、`docker/docker-compose-dev.yml`、README 中关于 `MAGIC_CODE` 的使用描述。
4. 若业务仍需要应急登录，新增独立 break-glass 流程：
   - 仅允许指定账号。
   - 单次令牌，有效期不超过 10 分钟。
   - 必须记录审批人、操作者、目标账号、原因和请求来源。
   - 默认关闭，通过运维后台或一次性配置开启。

验收标准：

- 使用 `MAGIC_CODE` 作为密码无法登录任意用户。
- 使用 `MAGIC_CODE` 作为短信验证码无法登录任意手机号。
- `rg "MAGIC_CODE|magic-code"` 不再命中认证绕过逻辑或真实默认值。
- 登录失败日志中能区分密码错误、验证码错误，但响应不泄露可枚举信息。

回滚注意：

不得回滚为全局魔法码。若紧急恢复，应只启用审批化 break-glass，并设置自动过期。

### 2. 修复公开 `clientStatus` 泄露 `clientSecret`

涉及漏洞：C-02、M-04

改造方案：

1. 新增公开 DTO，例如 `ClientPublicDtoSchema`，只返回：
   - `clientCode`
   - `clientName`
   - `status`
   - 必要的公开展示字段
2. 不返回以下字段：
   - `clientSecret`
   - `validRedirectUrls`
   - `callbackEndpoint`
   - `logoutEndpoint`
   - 内部扩展配置
3. 修改 `apps/api/src/routes/open/open.routes.ts` 的响应 schema。
4. 修改 `apps/api/src/routes/open/open.handlers.ts`，在返回前显式投影字段，不直接返回完整 `ClientDto`。
5. 对所有已可能泄露的 `clientSecret` 做一次强制轮换。

验收标准：

- `GET /open/client/status` 响应中没有 `clientSecret`。
- 响应中没有内部 endpoint 和 redirect allowlist。
- 旧 `clientSecret` 不能再通过 `/internal/*`、`/sso/token` 或 OA 登录签名验证。

回滚注意：

如果前端依赖完整 client 配置，应拆出受保护的管理端接口，不应让公开接口重新返回 secret。

### 3. 为 `admin` 和 `rpc` 增加管理员权限校验

涉及漏洞：C-03

改造方案：

1. 新增 `adminAuthenticationHandler`，要求：
   - 必须使用全局 session 或明确的 admin client session。
   - `Client` 头必须是 `iam` 或配置中的 admin client allowlist。
   - 当前用户必须具备管理端基础权限，例如 `iam:admin:access`。
2. 在 `apps/api/src/routes/admin/_middleware.ts` 和 `apps/api/src/routes/trpc/_middleware.ts` 使用该中间件替代 `publicAuthenticationHandler`。
3. 扩展 `defineQueryOp` / `defineMutationOp`，支持声明 `requiredPrivileges`。
4. 对高危 mutation 增加更细权限：
   - 用户创建、删除、禁用、重置密码：`iam:user:write`
   - 组织管理：`iam:organization:write`
   - 岗位/任职管理：`iam:employment:write`
   - 客户端创建/更新：`iam:client:write`
5. 所有管理端 mutation 写入审计日志。

验收标准：

- 普通登录用户调用 `/admin/users`、`/rpc/admin.user.*` 返回 403。
- 拥有 `iam:admin:access` 但缺少细粒度权限的用户无法执行高危 mutation。
- 管理员成功执行 mutation 后可查到审计日志。

回滚注意：

如果短期内权限数据不完整，可先启用单一 `iam:admin:access` 门槛，再逐步细化，但不能回退到“只登录即可访问 admin”。

### 4. 修复 internal 鉴权绕过

涉及漏洞：C-04

改造方案：

1. 删除 `/auth/internal-authz` 中基于 `IP-Chain.includes(...)` 的免密通过逻辑。
2. internal tier 必须验证服务身份：
   - 短期：使用 `apikey`，并检查 client 启用状态。
   - 中期：改为网关注入签名 JWT，包含 `clientCode`、`scope`、`iat`、`exp`。
   - 长期：使用 mTLS 或 SPIFFE/SPIRE 一类服务身份。
3. 仅信任边界网关注入的来源信息，应用层不直接信任客户端提交的 IP 相关头。

验收标准：

- 只伪造 `IP-Chain` 无法通过 `/auth/internal-authz`。
- 无效、禁用、删除的 client secret 均返回 401/403。
- internal 接口访问日志包含调用方 clientCode 和 requestId。

回滚注意：

若某些老系统暂时没有 `apikey`，可在网关层做临时 allowlist，但应用代码中不得保留可由外部伪造的 header bypass。

### 5. 修复 SSO 重定向、token 泄露和 auth code 重放

涉及漏洞：C-05、H-01

改造方案：

1. 重定向校验：
   - 将 `redirectUrl.startsWith(allowed)` 改为 URL 解析后比较。
   - 白名单至少比较 `origin`，如需路径限制，再比较规范化后的 pathname 前缀。
   - 拒绝非 `http:` / `https:` 协议；生产环境默认只允许 `https:`。
2. 授权码一次性消费：
   - `callback` / `setToken` 使用 Redis `GETDEL` 或 Lua 脚本读取并删除 `auth_code:<code>`。
   - auth code 绑定 `clientCode`、`redirectUrl`、`globalSessionId`。
   - 兑换时校验当前请求参数与绑定值完全一致。
3. token 传输：
   - 不再将 `token`、`orcasToken` 放入 URL query。
   - Gateway 模式使用 HttpOnly + Secure Cookie。
   - Independent 模式使用后端到后端 `/sso/token` 兑换，`clientSecret` 放在请求头或 body，不放 query。
4. 登出：
   - `/sso/logout` 的 `redirectUrl` 使用同一 allowlist。
   - 状态变更建议从 GET 改为 POST。

验收标准：

- `https://trusted.example.com.evil.test` 无法通过白名单。
- 同一个 auth code 第二次兑换返回失败。
- 反向代理日志、浏览器地址栏和 Referer 中不出现 session token。
- 错误 client 或错误 redirectUrl 无法兑换他人 auth code。

回滚注意：

如果部分旧客户端只能从 URL 读 token，应先加兼容期和迁移公告；兼容期内必须为这些 client 单独配置短 TTL 与严格 redirect allowlist。

### 6. 加强短信验证码与密码重置

涉及漏洞：H-02、M-03

改造方案：

1. 验证码生成改为 `crypto.randomInt(100000, 1000000)`，长度至少 6 位。
2. Redis key 设计：
   - `mobile-code:<usage>:<phone>` 保存验证码哈希或验证码值。
   - `mobile-code-attempts:<usage>:<phone>` 记录失败次数。
   - `mobile-code-send-limit:<usage>:<phone>` 和 `mobile-code-send-limit:ip:<ip>` 控制发送频率。
3. 校验成功后立即删除验证码与尝试次数。
4. 超过失败次数阈值后删除验证码并要求重新发送。
5. 公开找回密码流程统一响应，不区分用户名不存在、手机号不存在、未绑定手机号等细节。

建议阈值：

| 行为 | 限制 |
|---|---|
| 同手机号发送验证码 | 60 秒 1 次，15 分钟 5 次 |
| 同 IP 发送验证码 | 15 分钟 30 次 |
| 同验证码校验失败 | 5 次后作废 |
| 同账号密码失败 | 15 分钟 5 次，递增冷却 |

验收标准：

- 验证码为 6 位且由密码学安全随机数生成。
- 验证码成功使用后不能重复使用。
- 暴力尝试超过阈值返回 429 或统一业务错误。
- 找回密码接口不再泄露用户是否存在。

## P1 系统性加固方案

### 7. 客户端密钥治理与缓存修复

涉及漏洞：H-03、H-04、M-04

改造方案：

1. 数据库中新增 `clientSecretHash`，逐步替代明文 `clientSecret`。
2. 创建/轮换 client secret 时只返回一次明文。
3. 使用 HMAC-SHA256 或 Argon2/bcrypt 保存密钥摘要。
4. 比较时使用常量时间比较。
5. client 查询统一过滤 `status=Enable`、`isDelete=false`。
6. Redis client cache 设置 TTL，例如 5-15 分钟。
7. client 更新、禁用、删除时清理 code/secret 相关缓存。

验收标准：

- 数据库不再保存可直接使用的 client secret 明文。
- 旧 secret 轮换后立即失效。
- 禁用或软删除 client 不能通过 internal 和 SSO 校验。

迁移策略：

1. 先新增 hash 字段并支持双读。
2. 对现有 client 逐个轮换生成新 secret。
3. 所有 client 完成轮换后删除明文字段或停止读取明文字段。

### 8. 会话实时失效

涉及漏洞：H-05

改造方案：

1. 用户表新增或利用现有字段表达 session 版本：
   - `sessionVersion`
   - `passwordChangedAt`
   - `status`
   - `isDelete`
2. session 中保存 `userId`、`sessionVersion`、`issuedAt`，不要长期信任登录时完整用户快照。
3. `publicAuthenticationHandler` 每次请求校验：
   - 用户仍启用且未删除。
   - sessionVersion 一致。
   - session 签发时间晚于 `passwordChangedAt`。
4. 密码变更、管理员重置密码、禁用、删除用户时：
   - 递增 sessionVersion。
   - 删除该用户的 global/local session set。

验收标准：

- 用户被禁用后，旧 session 下一次请求立即返回 401/403。
- 密码重置后，旧 session 失效。
- local session 和 global session 一起撤销。

### 9. `authz` 从认证接口升级为授权接口

涉及漏洞：H-06

改造方案：

1. 明确接口契约：
   - `authenticate`：只确认用户身份。
   - `authorize`：基于 path/method/client/privileges 判断是否允许访问。
2. 如果保留 `/auth/authz` 名称，则必须执行授权：
   - 读取可信网关注入的 path 和 method。
   - 按 client 配置的策略表匹配需要权限。
   - 检查当前用户 roles/privileges。
3. `X-User-Info` 只返回必要身份字段，不返回完整用户详情。
4. 对授权失败和认证失败分别返回 403 与 401。

验收标准：

- 用户有 local session 但缺少目标权限时返回 403。
- 路径和 method 不在 client 策略中时默认拒绝。
- 网关集成测试覆盖允许、拒绝、未登录三种场景。

### 10. 安全头、CORS、CSRF 与请求体限制

涉及漏洞：M-01、M-02

改造方案：

1. Cookie：
   - 生产环境设置 `secure: true`。
   - 保持 `httpOnly: true`。
   - SSO 需要跨站时评估 `SameSite=None; Secure`，否则保持 `Lax`。
2. CSRF：
   - 对 cookie 鉴权 mutation 增加 CSRF token。
   - 或至少校验 `Origin` / `Referer` 在 allowlist 中。
3. CORS：
   - 只允许 admin/sso/openapi 需要的 origin。
   - 禁止 `*` 搭配 credentials。
4. 安全响应头：
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: no-referrer` 或 `strict-origin-when-cross-origin`
   - `Content-Security-Policy`
   - `frame-ancestors` 或 `X-Frame-Options`
5. 请求体大小：
   - 升级 Hono 后使用可靠 body limit。
   - 对 JSON、文件上传、Excel 解析设置不同大小上限。

验收标准：

- 生产 Set-Cookie 包含 `Secure`。
- 跨站伪造 POST 无 CSRF token 时失败。
- 非 allowlist origin 的 CORS 预检失败。
- 大请求体被拒绝且不会进入业务 handler。

### 11. 依赖漏洞治理

涉及漏洞：H-07

改造方案：

1. 优先升级：
   - `axios` 至至少 `1.15.2`，或将 `orcas.client.ts` 改为内置 `fetch` 后移除 `axios`。
   - `hono` 至至少 `4.12.16`，并确认 `@hono/zod-openapi`、`@scalar/hono-api-reference` 兼容。
   - `sm-crypto` 至 `0.4.0+`。
   - `hono-pino` 或通过 `pnpm.overrides` 固定 `defu>=6.1.5`。
2. 处理 `xlsx`：
   - 当前 `apps/api/src` 未发现直接使用 `xlsx`。
   - 若业务不需要，直接移除依赖。
   - 若后续需要 Excel 上传解析，应放到隔离 worker，并限制文件大小、sheet 数、行数、解析时间。
3. CI 增加：
   - `pnpm --registry=https://registry.npmjs.org audit -P --audit-level high`
   - 依赖升级 PR 的 API typecheck 和 smoke test。

验收标准：

- API 生产依赖 `pnpm audit -P --audit-level high` 无 high/critical。
- `pnpm --filter @iam/api typecheck` 通过。
- ORCAS、SSO、登录、admin 关键链路 smoke test 通过。

## P2 长期治理方案

### 12. 环境变量与部署配置治理

涉及漏洞：M-05、M-06、M-07、M-08

改造方案：

1. 将 `DATABASE_URL` 纳入 `apps/api/src/env.ts` 的 Zod schema。
2. URL 类配置使用 `z.url()`，生产环境限制 HTTPS，内网 HTTP 需显式 allowlist。
3. Redis 增加：
   - password / ACL
   - TLS 或网络隔离
   - key prefix
4. Docker：
   - runtime 阶段显式使用非 root 用户。
   - 代理地址改为 build arg 或 CI secret，不写死在 Dockerfile。
5. compose：
   - 移除真实密钥、内网地址和生产模式默认值。
   - `.env.example` 只保留占位符。

验收标准：

- 生产启动缺少 `DATABASE_URL` 或 URL 协议错误时直接失败。
- Redis 未配置认证时生产环境启动失败或告警。
- 镜像运行用户不是 root。
- secret scanning 不再命中真实密钥。

### 13. 用户枚举治理

涉及漏洞：M-03

改造方案：

1. 找回密码、发送验证码、用户脱敏信息接口统一响应。
2. 对公开查询加频控和验证码挑战。
3. 对不存在用户、手机号不匹配、未绑定手机号统一返回“如信息匹配将继续处理”。
4. 将详细原因只写入内部安全日志。

验收标准：

- 从公开接口无法稳定判断 username 或手机号是否存在。
- 安全日志仍保留排障所需原因。

### 14. 审计日志与监控告警

改造方案：

记录以下事件：

| 事件 | 字段 |
|---|---|
| 登录成功/失败 | userId/username、方式、IP、UA、requestId、失败原因分类 |
| 验证码发送/校验 | phone hash、usage、IP、结果、失败次数 |
| 管理端 mutation | actorUserId、target、action、before/after 摘要、requestId |
| client secret 轮换 | actor、clientCode、时间、旧 secret 指纹、新 secret 指纹 |
| SSO 授权码兑换 | clientCode、redirect origin、结果、requestId |

告警建议：

- 单 IP 多账号登录失败。
- 单账号多 IP 登录失败。
- 验证码发送异常峰值。
- client secret 校验失败持续增长。
- admin mutation 在非工作时间集中出现。

验收标准：

- 所有 P0/P1 安全敏感操作都有审计记录。
- 告警能定位 requestId 和调用方。

## 推荐实施顺序

1. 先修复 `MAGIC_CODE`、公开 `clientSecret`、internal header bypass。
2. 同一批次修复 admin/rpc 权限门槛，至少先加 `iam:admin:access`。
3. 修复 SSO redirect 与 auth code 一次性消费。
4. 增加验证码限流和一次性使用。
5. 轮换所有 client secret，并修复缓存失效。
6. 引入 sessionVersion，让禁用/改密立即失效。
7. 升级依赖，清理 `xlsx`。
8. 补安全头、CORS、CSRF、请求体限制。
9. 完成部署配置、Redis、Docker、审计日志治理。

## 验证计划

| 验证类型 | 命令或动作 | 通过标准 |
|---|---|---|
| 静态检查 | `pnpm --filter @iam/api typecheck` | 退出码 0 |
| Lint | `pnpm --filter @iam/api lint` | 退出码 0 |
| 依赖审计 | `pnpm --registry=https://registry.npmjs.org audit -P --audit-level high` | 无 high/critical |
| 登录绕过 | 使用旧 `MAGIC_CODE` 登录 | 返回失败 |
| admin 越权 | 普通用户调用 admin mutation | 返回 403 |
| secret 泄露 | 调用 `/open/client/status` | 响应无 `clientSecret` |
| internal 鉴权 | 伪造 `IP-Chain` 调用 | 返回 401/403 |
| SSO redirect | 使用 `trusted.com.evil.test` | 返回非法重定向 |
| auth code 重放 | 同 code 兑换两次 | 第二次失败 |
| 验证码复用 | 同验证码成功后再次使用 | 第二次失败 |
| session 失效 | 用户禁用后旧 session 请求 | 返回 401/403 |

## 回滚与发布策略

1. P0 修复建议分 3 个小版本发布：
   - 版本 A：移除 `MAGIC_CODE`、隐藏 `clientSecret`、禁用 header bypass。
   - 版本 B：admin/rpc 权限门槛、验证码限流。
   - 版本 C：SSO redirect、auth code 一次性消费、token query 清理。
2. 每个版本上线前准备数据库/Redis 回滚脚本和配置回滚方案。
3. 安全修复回滚不得恢复已确认漏洞；如果业务阻塞，应采用临时 allowlist、功能开关或客户端灰度。
4. Secret 轮换不可回滚为旧 secret。若客户端未完成迁移，应为该客户端生成新 secret 并设置短期双密钥过渡窗口。

## 风险接受建议

不建议接受以下风险：

- `MAGIC_CODE` 全局登录绕过。
- 公开返回 `clientSecret`。
- admin/rpc 只登录不授权。
- `IP-Chain` header bypass。
- SSO redirect 前缀校验和 URL query token。

可短期接受但必须登记到风险台账的事项：

- admin 细粒度权限暂时只做到 `iam:admin:access`。
- 某些旧客户端短期保留 URL token 兼容，但必须限制 client、redirect origin 和 TTL。
- `xlsx` 如果暂未使用但升级替换成本较高，可先移除依赖；如果业务确认需要，再单独设计上传解析安全边界。

## 交付物清单

| 交付物 | 说明 |
|---|---|
| 安全修复代码 | 认证、SSO、权限、验证码、会话、配置与依赖更新 |
| 数据库迁移 | client secret hash、sessionVersion 等字段 |
| Redis 清理脚本 | 清理旧 client secret cache、旧 session、旧 auth code |
| Secret 轮换记录 | client secret、第三方密钥、默认密码、历史 magic code |
| 验证记录 | typecheck、lint、audit、关键链路 smoke test |
| 运维变更单 | Redis/Docker/网关/环境变量配置变更 |
| 安全例外台账 | 暂缓项、接受期限、负责人、补偿控制 |

## 结论

本次整改应优先按“阻断账号接管链路”推进，而不是按代码模块顺序推进。`MAGIC_CODE`、`clientSecret` 泄露、admin 越权、internal header bypass 和 SSO token 泄露存在组合利用风险，建议作为同一安全事件级别处理：先修代码，再轮换密钥，最后补审计和持续门禁。P0 完成后，系统的直接可利用面会显著下降；P1/P2 则负责把一次性修复沉淀为长期安全能力。
