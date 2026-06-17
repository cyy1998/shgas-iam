# authentication-sessions Specification

## Purpose
描述当前 IAM 公共 API 中已经实现的登录、SSO 授权、全局/局部会话、网关鉴权与内部鉴权行为。该 baseline 仅记录现状，不表示这些行为已经完成安全整改或代表目标态。
## Requirements
### Requirement: 密码登录加密凭证传输
系统 SHALL 要求 `/auth/login/password` 使用 SM2 + SM4 加密凭证块传输用户名、密码、传输时间戳和 nonce，并在进入既有密码登录业务逻辑前完成解密、完整性校验、时间戳校验和 nonce 防重放。

#### Scenario: 密码登录请求使用 credential
- **WHEN** 客户端调用 `/auth/login/password`
- **THEN** 请求体 SHALL 只接受 `credential` 和可选 `capToken`
- **AND** 请求体 SHALL NOT 接受明文 `username` 或 `password` 字段作为登录输入

#### Scenario: credential 文本块结构有效
- **WHEN** 后端收到 `credential`
- **THEN** 系统 SHALL 解析协议版本、`kid`、算法标识、SM2 加密后的 key material、SM4 IV、SM4 密文和完整性标签
- **AND** 系统 SHALL 根据 `kid` 选择对应 SM2 私钥

#### Scenario: credential 解密成功
- **WHEN** `credential` 使用受支持算法、有效 `kid` 和正确密钥生成，且完整性标签校验通过
- **THEN** 系统 SHALL 使用 SM2 私钥解密 key material
- **AND** 系统 SHALL 使用解出的 key material 验证完整性标签
- **AND** 系统 SHALL 使用 SM4 解密登录凭证明文 JSON
- **AND** 登录凭证明文 JSON SHALL 包含 `v`、`typ=password-login`、`username`、`password`、`ts` 和 `nonce`

#### Scenario: credential 时间戳有效
- **WHEN** 登录凭证明文 JSON 的 `ts` 与服务端当前时间差在配置允许窗口内
- **THEN** 系统 SHALL 允许凭证继续进行 nonce 防重放校验

#### Scenario: credential 时间戳无效
- **WHEN** 登录凭证明文 JSON 的 `ts` 已过期或显著晚于服务端当前时间
- **THEN** 系统 SHALL 拒绝继续执行密码校验和全局会话创建
- **AND** 响应 SHALL 使用统一业务错误表示登录凭证无效

#### Scenario: credential nonce 首次使用
- **WHEN** 登录凭证明文 JSON 的 `nonce` 在当前有效窗口内未被使用
- **THEN** 系统 SHALL 在 Redis 中记录该 nonce 的防重放标记
- **AND** 系统 SHALL 允许凭证继续进入既有密码登录业务逻辑

#### Scenario: credential nonce 重放
- **WHEN** 登录凭证明文 JSON 的 `nonce` 在当前有效窗口内已经存在防重放标记
- **THEN** 系统 SHALL 拒绝继续执行密码校验和全局会话创建
- **AND** 响应 SHALL 使用统一业务错误表示登录凭证无效

#### Scenario: credential 无效
- **WHEN** `credential` 缺失、格式错误、协议版本不支持、算法不支持、`kid` 不存在、SM2 解密失败、完整性标签校验失败、SM4 解密失败或明文 JSON 结构无效
- **THEN** 系统 SHALL 拒绝继续执行密码校验和全局会话创建
- **AND** 响应 SHALL 使用统一业务错误表示登录凭证无效

#### Scenario: credential 校验通过后保持登录语义
- **WHEN** `credential` 解密、完整性校验、时间戳校验和 nonce 防重放均通过
- **THEN** 系统 SHALL 使用解密出的 `username` 与 `password` 执行既有密码登录逻辑
- **AND** 系统 SHALL 保持既有 Cap 人机校验、密码校验、登录失败计数、账号暂停、全局 session 创建、cookie 写入和登录日志行为

### Requirement: 全局登录创建会话
系统 SHALL 在加密凭证密码登录、手机验证码登录或受支持的第三方登录成功后创建 Redis 全局会话，并向调用方返回会话 token 与 `isMobileSet`。

#### Scenario: 密码登录成功
- **WHEN** `/auth/login/password` 请求提供有效 `credential`，该凭证解密出的用户名对应用户详情存在，并且解密出的密码匹配用户密码或输入值等于配置的 `MAGIC_CODE`
- **THEN** 系统 SHALL 创建 `global_session:<token>` Redis 记录
- **AND** 系统 SHALL 返回 `{ token, isMobileSet }`
- **AND** HTTP handler SHALL 写入名为 `global_session` 的 HttpOnly、SameSite=Lax cookie

#### Scenario: 手机验证码登录成功
- **WHEN** 手机号对应的用户详情存在，并且登录用途验证码匹配 Redis 中保存的验证码或输入值等于配置的 `MAGIC_CODE`
- **THEN** 系统 SHALL 创建 `global_session:<token>` Redis 记录
- **AND** 系统 SHALL 返回 `{ token, isMobileSet }`
- **AND** HTTP handler SHALL 写入名为 `global_session` 的 HttpOnly、SameSite=Lax cookie
- **AND** 当使用 Redis 中保存的登录用途验证码时，系统 SHALL 原子消费该 `mobile-code:login:<phone>` 验证码

#### Scenario: 手机验证码重复登录被拒绝
- **WHEN** 同一登录用途验证码已经被一次成功手机验证码登录消费
- **THEN** 后续使用相同手机号和验证码登录 SHALL 视为验证码错误
- **AND** 系统 SHALL NOT 创建新的 `global_session:<token>` Redis 记录

#### Scenario: 第三方登录成功
- **WHEN** OA 或 WeChat 登录校验通过并解析到用户详情
- **THEN** 系统 SHALL 创建全局会话并记录对应的全局第三方登录日志

### Requirement: 登录失败计数与账号暂停
系统 SHALL 对密码登录失败和登录用途手机验证码失败按用户共享失败计数，并在 30 分钟窗口内第 5 次失败时将该用户加入 30 分钟临时黑名单。

#### Scenario: 密码失败累计
- **WHEN** 用户提交错误密码且输入值不等于 `MAGIC_CODE`
- **THEN** 系统 SHALL 在 Redis 有序集合 `login-failures:user:<userId>` 中记录一次失败
- **AND** 失败响应 SHALL 包含当前失败次数与距离临时黑名单生效的剩余次数

#### Scenario: 手机验证码失败累计
- **WHEN** 登录用途手机验证码校验失败且验证码不等于 `MAGIC_CODE`，并且该手机号匹配一个 active user
- **THEN** 系统 SHALL 在同一个用户失败计数中记录一次失败
- **AND** 失败响应 SHALL 包含当前失败次数与距离临时黑名单生效的剩余次数

#### Scenario: 第五次失败进入临时黑名单
- **WHEN** 同一用户在 30 分钟窗口内累计到第 5 次密码或登录验证码失败
- **THEN** 系统 SHALL 在 Redis 中记录该用户 30 分钟临时黑名单
- **AND** 系统 SHALL NOT 将该用户状态更新为 `UserStatus.Pause`
- **AND** 失败响应 SHALL 说明账号已被临时限制 30 分钟

#### Scenario: 成功登录清理失败计数
- **WHEN** 用户通过密码或手机验证码成功登录
- **THEN** 系统 SHALL 删除该用户的 `login-failures:user:<userId>` 失败计数
- **AND** 系统 SHALL 删除该用户的临时黑名单标记

### Requirement: 异常登录请求的人机校验
系统 SHALL 在密码登录和手机验证码登录触发异常条件时要求有效 Cap token，并在未触发异常时保持原有登录语义。

#### Scenario: 密码登录异常且缺少 Cap token
- **WHEN** `/auth/login/password` 请求命中 `passwordLogin` 异常触发策略且未携带有效 Cap token
- **THEN** 系统 SHALL 拒绝执行密码校验和全局会话创建
- **AND** 响应 SHALL 使用可被前端稳定识别的业务码表示需要人机校验

#### Scenario: 密码登录异常且 Cap token 有效
- **WHEN** `/auth/login/password` 请求命中 `passwordLogin` 异常触发策略且携带有效 Cap token
- **THEN** 系统 SHALL 消费该 Cap token
- **AND** 系统 SHALL 继续执行既有密码登录成功或失败处理

#### Scenario: 手机验证码登录异常且缺少 Cap token
- **WHEN** `/auth/login/mobile` 请求命中 `mobileLogin` 异常触发策略且未携带有效 Cap token
- **THEN** 系统 SHALL 拒绝执行短信验证码校验和全局会话创建
- **AND** 响应 SHALL 使用可被前端稳定识别的业务码表示需要人机校验

#### Scenario: 手机验证码登录异常且 Cap token 有效
- **WHEN** `/auth/login/mobile` 请求命中 `mobileLogin` 异常触发策略且携带有效 Cap token
- **THEN** 系统 SHALL 消费该 Cap token
- **AND** 系统 SHALL 继续执行既有手机验证码登录成功或失败处理

#### Scenario: 登录请求未触发异常
- **WHEN** `/auth/login/password` 或 `/auth/login/mobile` 请求未命中对应异常触发策略
- **THEN** 系统 SHALL 不要求 Cap token
- **AND** 系统 SHALL 保持既有登录成功、失败计数和账号暂停行为

#### Scenario: 登录失败更新 Cap 异常状态
- **WHEN** 密码登录失败或手机验证码登录失败
- **THEN** 系统 SHALL 更新对应 action、subject 和 IP 的短窗口风险状态
- **AND** 系统 SHALL 保持既有用户维度登录失败计数和账号暂停规则

### Requirement: SSO 授权码与局部会话
系统 SHALL 为已登录用户和合法客户端生成一次性 SSO 授权码，并在 callback 或 token 兑换时一致地创建面向客户端的局部会话。

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
- **THEN** 系统 SHALL 原子消费 `auth_code:<code>`
- **AND** 系统 SHALL 校验授权码引用的 `global_session:<globalSessionId>` 仍存在且 TTL 大于 0
- **AND** 系统 SHALL 一致创建 `local_<client>_session:<localSessionId>`、`local_session_reverse:<localSessionId>` 和 `local_session_set:<globalSessionId>` Redis 记录
- **AND** HTTP handler SHALL 写入 `local_<client>_session` cookie 并重定向到 redirect URL
- **AND** 重定向 URL SHALL 携带 `token=<localSessionId>`

#### Scenario: Independent token 兑换局部会话
- **WHEN** `/sso/token` 收到存在的 auth code、合法 client code 和匹配的 client secret
- **THEN** 系统 SHALL 原子消费 `auth_code:<code>`
- **AND** 系统 SHALL 校验授权码引用的 `global_session:<globalSessionId>` 仍存在且 TTL 大于 0
- **AND** 系统 SHALL 一致创建 Independent 模式局部会话
- **AND** 响应 SHALL 返回 `sid`、`ttl` 和 `userInfo`

#### Scenario: 授权码重复兑换被拒绝
- **WHEN** 同一个 `auth_code:<code>` 已经被 `/sso/callback` 或 `/sso/token` 成功消费
- **THEN** 后续使用相同 code 的兑换请求 SHALL 被拒绝
- **AND** 系统 SHALL NOT 创建新的 `local_<client>_session:<localSessionId>`、`local_session_reverse:<localSessionId>` 或 `local_session_set:<globalSessionId>` 记录

#### Scenario: 授权码引用的全局会话已失效
- **WHEN** `/sso/callback` 或 `/sso/token` 消费到的 auth code 引用不存在或已过期的 `global_session:<globalSessionId>`
- **THEN** 系统 SHALL 拒绝创建局部会话
- **AND** 系统 SHALL NOT 留下可用于鉴权的局部会话 Redis key

#### Scenario: 局部会话创建原子失败
- **WHEN** 创建局部会话时任一 Redis 写入步骤失败
- **THEN** 系统 SHALL 将本次局部会话创建视为失败
- **AND** 系统 SHALL NOT 留下可用于鉴权的局部会话实体与反向映射组合

### Requirement: SSO 登出清理会话
系统 SHALL 在 SSO 登出时删除全局会话及其仍有效的局部会话，并确保 IAM Redis 清理不被 Independent 客户端通知失败阻断。

#### Scenario: 全局会话存在时登出
- **WHEN** `/sso/logout` 解析到有效的全局会话 ID
- **THEN** 系统 SHALL 找出该全局会话下仍有效的局部会话
- **AND** 系统 SHALL 删除局部会话 Redis key、反向映射 key 与局部会话集合索引
- **AND** 系统 SHALL 删除全局会话 Redis key 与局部会话集合 key
- **AND** HTTP handler SHALL 删除 `global_session` cookie 并重定向到请求中的 `redirectUrl`

#### Scenario: Independent 局部会话被移除
- **WHEN** 被移除的局部会话模式是 `ClientManagementLevel.Independent`
- **THEN** 系统 SHALL 调用该客户端配置的 `logoutEndpoint` 并提交局部会话 ID

#### Scenario: Independent 登出通知失败
- **WHEN** SSO 登出过程中某个 Independent 客户端 `logoutEndpoint` 请求失败、超时或返回异常响应
- **THEN** 系统 SHALL 记录该通知失败
- **AND** 系统 SHALL 继续完成 IAM Redis 中全局会话、局部会话 key、反向映射 key 和集合 key 的清理
- **AND** HTTP handler SHALL 按登出成功路径删除 `global_session` cookie 并重定向

#### Scenario: 登出遇到残留集合成员
- **WHEN** `local_session_set:<globalSessionId>` 中存在对应 local key 或 reverse key 已不存在的残留成员
- **THEN** 系统 SHALL 清理该残留成员
- **AND** 系统 SHALL NOT 因残留成员缺失对应 Redis key 而中断全局登出

### Requirement: 网关鉴权返回用户摘要
系统 SHALL 通过客户端标识和局部会话校验网关请求，并在局部会话与全局会话一致有效时返回 base64 编码的用户摘要。

#### Scenario: 缺少必要请求上下文
- **WHEN** `/auth/authz` 请求缺少 `Client` header 或 `X-Forwarded-Uri`
- **THEN** 系统 SHALL 拒绝请求并报告非法访问

#### Scenario: 局部会话有效
- **WHEN** `/auth/authz` 请求的客户端存在，且 cookie 或 `Authorization` header 中的 local session ID 能读取到用户快照、反向映射和仍有效的全局会话
- **THEN** 系统 SHALL 将 `{ username, id }` 编码为 base64 字符串
- **AND** 系统 SHALL 将该字符串写入 `X-User-Info` 响应头并作为成功响应数据返回

#### Scenario: 局部会话实体残留但全局会话已失效
- **WHEN** `/auth/authz` 请求能读取到 `local_<client>_session:<localSessionId>`，但 `local_session_reverse:<localSessionId>` 缺失或其引用的 `global_session:<globalSessionId>` 缺失
- **THEN** 系统 SHALL 拒绝请求并报告未登录
- **AND** 系统 SHALL 尽量删除当前残留局部会话 key 与反向映射 key

#### Scenario: 客户端维护中
- **WHEN** 客户端状态为 `ClientStatus.Maintance`，且当前用户不在客户端 `userExcluding` 列表中
- **THEN** 系统 SHALL 拒绝请求并报告系统维护中

### Requirement: 内部服务鉴权
系统 SHALL 对 `/auth/internal-authz` 和 `/internal/*` 使用统一 internal client 身份校验。系统 MUST 仅将 `apikey` header 作为当前 internal client secret 准入凭据，且认证出的 client MUST 存在、未软删除并且 `status` 为 `ClientStatus.Enable`。系统 MUST NOT 因 `IP-Chain` header 命中任何内网片段而放行请求。

#### Scenario: apikey 匹配 active client
- **WHEN** `/auth/internal-authz` 请求提供的 `apikey` 能解析到未软删除且状态为 `ClientStatus.Enable` 的 client
- **THEN** 系统 SHALL 返回准许
- **AND** 成功响应 SHALL 使用 boolean data 表示准许结果

#### Scenario: internal middleware 写入认证上下文
- **WHEN** `/internal/*` 请求通过统一 internal client 身份校验
- **THEN** 系统 SHALL 在 Hono context 中提供认证出的 `clientCode`
- **AND** 系统 SHALL 在 Hono context 中提供认证出的 `clientDto`

#### Scenario: IP-Chain 不产生准入效果
- **WHEN** `/auth/internal-authz` 请求携带包含 `192.168.93.` 或 `192.168.73.88` 的 `IP-Chain` header，但缺少有效 `apikey`
- **THEN** 系统 SHALL 拒绝请求

#### Scenario: 缺少或无效服务凭据
- **WHEN** `/auth/internal-authz` 或 `/internal/*` 请求缺少 `apikey`，或 `apikey` 不能解析到 client
- **THEN** 系统 SHALL 拒绝请求

#### Scenario: inactive client 不得通过内部服务鉴权
- **WHEN** `/auth/internal-authz` 或 `/internal/*` 请求提供的 `apikey` 解析到软删除 client、`ClientStatus.Maintance` client 或 `ClientStatus.Disable` client
- **THEN** 系统 SHALL 拒绝请求

### Requirement: public 用户密码校验与账号暂停服务规则具备单元测试覆盖
系统 SHALL 为 public API 用户服务中的密码校验和账号暂停规则提供 Bun 单元测试覆盖，且测试不得依赖真实数据库、Redis、bcrypt 计算或网络。

#### Scenario: 密码校验处理用户不存在和无密码用户
- **WHEN** `checkPassword` 被调用且用户不存在
- **THEN** 单元测试 SHALL 验证服务抛出“用户不存在”
- **AND** 单元测试 SHALL 验证用户没有密码时返回 false

#### Scenario: 密码校验透传 bcrypt compare 结果
- **WHEN** `checkPassword` 被调用且用户有密码
- **THEN** 单元测试 SHALL 验证服务调用 `compare(inputPassword, user.password)`
- **AND** 单元测试 SHALL 验证 `compare` 返回 true 时服务返回 true
- **AND** 单元测试 SHALL 验证 `compare` 返回 false 时服务返回 false

#### Scenario: 暂停启用账号透传 repository 结果
- **WHEN** `pauseEnabledUser` 被调用
- **THEN** 单元测试 SHALL 验证服务调用 `userRepository.updateEnabledUserStatus(userId, UserStatus.Pause)`
- **AND** 单元测试 SHALL 验证 repository 返回暂停后的用户时服务透传该用户
- **AND** 单元测试 SHALL 验证 repository 返回 null 时服务透传 null

### Requirement: Authentication errors use standardized API error contract
Authentication and session flows SHALL use centralized API errors with string business error codes for stable login, credential, session, and maintenance failures.

#### Scenario: Encrypted login credential is invalid
- **WHEN** password login receives an invalid encrypted credential
- **THEN** the backend SHALL return the standardized invalid login credential error

#### Scenario: Session is missing or expired
- **WHEN** authentication requires a valid session but none exists
- **THEN** the backend SHALL return the standardized unauthorized error with a distinct business error code and HTTP status

#### Scenario: Client is under maintenance
- **WHEN** an authz check rejects access because the target client is under maintenance
- **THEN** the backend SHALL return the standardized maintenance error code

## Open Questions
- `MAGIC_CODE` 是当前已实现行为和已有测试覆盖点，但安全审计将其标为 Critical；是否继续作为目标行为需要后续单独确认。
- `redirectUrl` 当前使用字符串 `startsWith` 前缀校验；baseline 只记录当前合法性判断，不声明其安全充分性。
- `local session` 读取的是登录时用户快照；用户状态变化后的会话实时失效行为没有从代码证据中确认。

## Evidence Review
- 密码登录加密凭证传输: 证据 `apps/api/src/routes/auth/login-credential.ts`, `apps/api/src/routes/auth/auth.handlers.ts`, `apps/sso/src/services/auth.ts`, `apps/sso/src/lib/login-credential.ts`。状态: 有代码和测试证据。
- 全局登录创建会话: 证据 `apps/api/src/routes/auth/auth.routes.ts`, `apps/api/src/routes/auth/auth.handlers.ts`, `apps/api/src/routes/auth/auth.service.ts`, `apps/api/src/routes/sso/sso.service.ts`, `apps/api/src/services/session/session.service.ts`。状态: 有证据；含安全风险 `MAGIC_CODE`。
- 登录失败计数与账号暂停: 证据 `apps/api/src/routes/auth/login-failure.helper.ts`, `apps/api/src/routes/auth/auth.service.ts`, `apps/api/src/routes/auth/__tests__/auth.service.test.ts`。状态: 有代码和测试证据；未覆盖所有第三方失败路径。
- SSO 授权码与局部会话: 证据 `apps/api/src/routes/sso/sso.routes.ts`, `apps/api/src/routes/sso/sso.handlers.ts`, `apps/api/src/routes/sso/sso.service.ts`, `apps/api/src/services/session/session.service.ts`, `packages/db/src/schema/core/clients.ts`。状态: 有代码和测试证据；redirect/token 传输存在已知安全风险。
- SSO 登出清理会话: 证据 `apps/api/src/routes/sso/sso.handlers.ts`, `apps/api/src/routes/sso/sso.service.ts`, `apps/api/src/services/session/session.service.ts`。状态: 有代码和测试证据。
- 网关鉴权返回用户摘要: 证据 `apps/api/src/routes/auth/auth.handlers.ts`, `apps/api/src/routes/auth/auth.service.ts`, `apps/api/src/services/client/client.service.ts`。状态: 有代码和测试证据；未证明 path/method 权限校验。
- 内部服务鉴权: 证据 `packages/api-core/src/middlewares/auth.ts`, `apps/api/src/routes/auth/auth.handlers.ts`, `apps/api/src/services/client/client.service.ts`, `gateway/manifests/dev/tender/routes.yaml`, `gateway/manifests/prod/tender/routes.yaml`。状态: 有代码和测试证据；内部服务鉴权统一依赖 active client `apikey`，不再接受 `IP-Chain` 白名单绕过。
