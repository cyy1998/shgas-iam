# authentication-sessions Specification

## Purpose
描述当前 IAM 公共 API 中已经实现的登录、SSO 授权、全局/局部会话、网关鉴权与内部鉴权行为。该 baseline 仅记录现状，不表示这些行为已经完成安全整改或代表目标态。

## Requirements
### Requirement: 全局登录创建会话
系统 SHALL 在密码登录、手机验证码登录或受支持的第三方登录成功后创建 Redis 全局会话，并向调用方返回会话 token 与 `isMobileSet`。

#### Scenario: 密码登录成功
- **WHEN** 用户名对应的用户详情存在，并且输入密码匹配用户密码或输入值等于配置的 `MAGIC_CODE`
- **THEN** 系统 SHALL 创建 `global_session:<token>` Redis 记录
- **AND** 系统 SHALL 返回 `{ token, isMobileSet }`
- **AND** HTTP handler SHALL 写入名为 `global_session` 的 HttpOnly、SameSite=Lax cookie

#### Scenario: 手机验证码登录成功
- **WHEN** 手机号对应的用户详情存在，并且登录用途验证码匹配 Redis 中保存的验证码或输入值等于配置的 `MAGIC_CODE`
- **THEN** 系统 SHALL 创建 `global_session:<token>` Redis 记录
- **AND** 系统 SHALL 返回 `{ token, isMobileSet }`
- **AND** HTTP handler SHALL 写入名为 `global_session` 的 HttpOnly、SameSite=Lax cookie

#### Scenario: 第三方登录成功
- **WHEN** OA 或 WeChat 登录校验通过并解析到用户详情
- **THEN** 系统 SHALL 创建全局会话并记录对应的全局第三方登录日志

### Requirement: 登录失败计数与账号暂停
系统 SHALL 对密码登录失败和登录用途手机验证码失败按用户共享失败计数，并在 30 分钟窗口内第 5 次失败时暂停该用户。

#### Scenario: 密码失败累计
- **WHEN** 用户提交错误密码且输入值不等于 `MAGIC_CODE`
- **THEN** 系统 SHALL 在 Redis 有序集合 `login-failures:user:<userId>` 中记录一次失败
- **AND** 失败响应 SHALL 包含当前失败次数与距离账号暂停的剩余次数

#### Scenario: 手机验证码失败累计
- **WHEN** 登录用途手机验证码校验失败且验证码不等于 `MAGIC_CODE`，并且该手机号匹配一个 active user
- **THEN** 系统 SHALL 在同一个用户失败计数中记录一次失败
- **AND** 失败响应 SHALL 包含当前失败次数与距离账号暂停的剩余次数

#### Scenario: 第五次失败暂停账号
- **WHEN** 同一用户在 30 分钟窗口内累计到第 5 次密码或登录验证码失败
- **THEN** 系统 SHALL 将该用户状态更新为 `UserStatus.Pause`
- **AND** 失败响应 SHALL 说明账号已暂停

#### Scenario: 成功登录清理失败计数
- **WHEN** 用户通过密码或手机验证码成功登录
- **THEN** 系统 SHALL 删除该用户的 `login-failures:user:<userId>` 失败计数

### Requirement: SSO 授权码与局部会话
系统 SHALL 为已登录用户和合法客户端生成 SSO 授权码，并在 callback 或 token 兑换时创建面向客户端的局部会话。

#### Scenario: 未登录用户发起 SSO 授权
- **WHEN** `/sso/authorize` 请求没有可用的 `global_session`
- **THEN** 系统 SHALL 返回 `isLogin=false`
- **AND** HTTP handler SHALL 重定向到登录端点并保留原查询参数

#### Scenario: 已登录用户发起 SSO 授权
- **WHEN** `/sso/authorize` 请求包含可用全局会话，客户端存在，并且 `redirectUrl` 通过客户端允许地址前缀校验
- **THEN** 系统 SHALL 刷新全局会话过期时间
- **AND** 系统 SHALL 创建 `auth_code:<code>` Redis 记录，内容包含全局会话 ID 和用户快照
- **AND** HTTP handler SHALL 重定向到客户端 callback 地址并携带 `code`、`client` 和 `redirectUrl`

#### Scenario: Gateway callback 兑换局部会话
- **WHEN** `/sso/callback` 收到存在的 auth code、合法 client code 和通过前缀校验的 redirect URL
- **THEN** 系统 SHALL 创建 `local_<client>_session:<localSessionId>`、`local_session_reverse:<localSessionId>` 和 `local_session_set:<globalSessionId>` Redis 记录
- **AND** HTTP handler SHALL 写入 `local_<client>_session` cookie 并重定向到 redirect URL
- **AND** 重定向 URL SHALL 携带 `token=<localSessionId>`

#### Scenario: Independent token 兑换局部会话
- **WHEN** `/sso/token` 收到存在的 auth code、合法 client code 和匹配的 client secret
- **THEN** 系统 SHALL 创建 Independent 模式局部会话
- **AND** 响应 SHALL 返回 `sid`、`ttl` 和 `userInfo`

### Requirement: SSO 登出清理会话
系统 SHALL 在 SSO 登出时删除全局会话及其仍有效的局部会话。

#### Scenario: 全局会话存在时登出
- **WHEN** `/sso/logout` 解析到有效的全局会话 ID
- **THEN** 系统 SHALL 找出该全局会话下仍有效的局部会话
- **AND** 系统 SHALL 删除局部会话 Redis key 与反向映射 key
- **AND** 系统 SHALL 删除全局会话 Redis key 与局部会话集合 key
- **AND** HTTP handler SHALL 删除 `global_session` cookie 并重定向到请求中的 `redirectUrl`

#### Scenario: Independent 局部会话被移除
- **WHEN** 被移除的局部会话模式是 `ClientManagementLevel.Independent`
- **THEN** 系统 SHALL 调用该客户端配置的 `logoutEndpoint` 并提交局部会话 ID

### Requirement: 网关鉴权返回用户摘要
系统 SHALL 通过客户端标识和局部会话校验网关请求，并在通过时返回 base64 编码的用户摘要。

#### Scenario: 缺少必要请求上下文
- **WHEN** `/auth/authz` 请求缺少 `Client` header 或 `X-Forwarded-Uri`
- **THEN** 系统 SHALL 拒绝请求并报告非法访问

#### Scenario: 局部会话有效
- **WHEN** `/auth/authz` 请求的客户端存在，且 cookie 或 `Authorization` header 中的 local session ID 能读取到用户快照
- **THEN** 系统 SHALL 将 `{ username, id }` 编码为 base64 字符串
- **AND** 系统 SHALL 将该字符串写入 `X-User-Info` 响应头并作为成功响应数据返回

#### Scenario: 客户端维护中
- **WHEN** 客户端状态为 `ClientStatus.Maintance`，且当前用户不在客户端 `userExcluding` 列表中
- **THEN** 系统 SHALL 拒绝请求并报告系统维护中

### Requirement: 内部服务鉴权
系统 SHALL 对 `/auth/internal-authz` 使用 `IP-Chain` 白名单或 `apikey` 客户端密钥作为当前准入判断。

#### Scenario: IP-Chain 命中白名单片段
- **WHEN** `IP-Chain` header 包含 `192.168.93.` 或 `192.168.73.88`
- **THEN** 系统 SHALL 直接返回准许

#### Scenario: apikey 匹配客户端密钥
- **WHEN** 请求未命中 `IP-Chain` 白名单，但提供的 `apikey` 能解析到客户端
- **THEN** 系统 SHALL 返回准许

#### Scenario: 缺少或无效服务凭据
- **WHEN** 请求未命中 `IP-Chain` 白名单，并且缺少 `apikey` 或 `apikey` 不能解析到客户端
- **THEN** 系统 SHALL 拒绝请求

## Open Questions
- `MAGIC_CODE` 是当前已实现行为和已有测试覆盖点，但安全审计将其标为 Critical；是否继续作为目标行为需要后续单独确认。
- SSO auth code 当前通过 Redis `get` 读取，没有从代码证据看到一次性消费；baseline 未把“可重复兑换”写成 Requirement，需要人工确认是否只记录为风险。
- `redirectUrl` 当前使用字符串 `startsWith` 前缀校验；baseline 只记录当前合法性判断，不声明其安全充分性。
- `local session` 读取的是登录时用户快照；用户状态变化后的会话实时失效行为没有从代码证据中确认。
- `/auth/internal-authz` 的 `IP-Chain` header 信任边界依赖部署网关，代码本身无法证明该 header 一定可信。

## Evidence Review
- 全局登录创建会话: 证据 `apps/api/src/routes/auth/auth.routes.ts`, `apps/api/src/routes/auth/auth.handlers.ts`, `apps/api/src/routes/auth/auth.service.ts`, `apps/api/src/routes/sso/sso.service.ts`, `apps/api/src/services/session/session.service.ts`。状态: 有证据；含安全风险 `MAGIC_CODE`。
- 登录失败计数与账号暂停: 证据 `apps/api/src/routes/auth/login-failure.helper.ts`, `apps/api/src/routes/auth/auth.service.ts`, `apps/api/src/routes/auth/__tests__/auth.service.test.ts`。状态: 有代码和测试证据；未覆盖所有第三方失败路径。
- SSO 授权码与局部会话: 证据 `apps/api/src/routes/sso/sso.routes.ts`, `apps/api/src/routes/sso/sso.handlers.ts`, `apps/api/src/routes/sso/sso.service.ts`, `apps/api/src/services/session/session.service.ts`, `packages/db/src/schema/core/clients.ts`。状态: 有代码证据；redirect/token 传输存在已知安全风险。
- SSO 登出清理会话: 证据 `apps/api/src/routes/sso/sso.handlers.ts`, `apps/api/src/routes/sso/sso.service.ts`, `apps/api/src/services/session/session.service.ts`。状态: 有代码证据；未见自动化测试。
- 网关鉴权返回用户摘要: 证据 `apps/api/src/routes/auth/auth.handlers.ts`, `apps/api/src/routes/auth/auth.service.ts`, `apps/api/src/services/client/client.service.ts`。状态: 有代码证据；未证明 path/method 权限校验。
- 内部服务鉴权: 证据 `apps/api/src/routes/auth/auth.handlers.ts`, `apps/api/src/services/client/client.service.ts`, `docs/API_SECURITY_AUDIT_2026-05-08.md`。状态: 有代码证据；`IP-Chain` 白名单属于需要人工确认的部署假设。
