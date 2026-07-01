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
系统 SHALL 在加密凭证密码登录、手机验证码登录或受支持的第三方登录成功后通过 Session Kernel 创建 PrincipalSession，并向调用方返回 opaque 会话 token 与 `isMobileSet`。

#### Scenario: 密码登录成功
- **WHEN** `/auth/login/password` 请求提供有效 `credential`，该凭证解密出的用户名对应用户详情存在，并且解密出的密码匹配用户密码或输入值等于配置的 `MAGIC_CODE`
- **THEN** 系统 SHALL 通过 Session Kernel 创建 `sessionKind=browser_user` 的 PrincipalSession
- **AND** PrincipalSession external token SHALL 是 high-entropy opaque string
- **AND** 系统 SHALL 返回 `{ token, isMobileSet }`
- **AND** HTTP handler SHALL 写入名为 `global_session` 的 HttpOnly、SameSite=Lax cookie

#### Scenario: 手机验证码登录成功
- **WHEN** 手机号对应的用户详情存在，并且登录用途验证码匹配 Redis 中保存的验证码或输入值等于配置的 `MAGIC_CODE`
- **THEN** 系统 SHALL 通过 Session Kernel 创建 `sessionKind=browser_user` 的 PrincipalSession
- **AND** PrincipalSession external token SHALL 是 high-entropy opaque string
- **AND** 系统 SHALL 返回 `{ token, isMobileSet }`
- **AND** HTTP handler SHALL 写入名为 `global_session` 的 HttpOnly、SameSite=Lax cookie
- **AND** 当使用 Redis 中保存的登录用途验证码时，系统 SHALL 原子消费该 `mobile-code:login:<phone>` 验证码

#### Scenario: 手机验证码重复登录被拒绝
- **WHEN** 同一登录用途验证码已经被一次成功手机验证码登录消费
- **THEN** 后续使用相同手机号和验证码登录 SHALL 视为验证码错误
- **AND** 系统 SHALL NOT 创建新的 PrincipalSession

#### Scenario: 第三方登录成功
- **WHEN** OA 或 WeChat 登录校验通过并解析到用户详情
- **THEN** 系统 SHALL 通过 Session Kernel 创建 PrincipalSession
- **AND** 系统 SHALL 记录对应的全局第三方登录日志

#### Scenario: PrincipalSession 保存最小用户快照
- **WHEN** 登录成功创建 PrincipalSession
- **THEN** PrincipalSession SHALL 保存最小 PrincipalSnapshot
- **AND** PrincipalSession SHALL NOT 保存完整 `UserDetailDto`、roles、privileges、employments、ORCAS 信息或 custom SSO local session payload

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
系统 SHALL 为已登录用户和合法客户端生成一次性 Kernel ProtocolArtifact，并在 callback 或 token 兑换时一致地创建面向客户端的 ClientBinding 与 local session IssuedCredential。local session payload SHALL 保留协议私有一致性数据，但后续用户资料读取 SHALL NOT 以 Redis payload 快照作为权威来源。

#### Scenario: 未登录用户发起 SSO 授权
- **WHEN** `/sso/authorize` 请求没有可用的 PrincipalSession
- **THEN** 系统 SHALL 返回 `isLogin=false`
- **AND** HTTP handler SHALL 重定向到登录端点并保留原查询参数

#### Scenario: 已登录用户发起 SSO 授权
- **WHEN** `/sso/authorize` 请求包含可用 PrincipalSession，客户端存在，并且 `redirectUrl` 通过客户端允许地址前缀校验
- **THEN** 系统 SHALL 按前台交互规则刷新 PrincipalSession idle TTL
- **AND** 系统 SHALL 创建 `protocol=custom-sso`、`artifactType=auth_code` 的 Kernel ProtocolArtifact
- **AND** auth code artifact SHALL 保存 PrincipalSession、client、redirectUrl 和 custom SSO exchange metadata 引用
- **AND** auth code artifact SHALL NOT 保存完整 `UserDetailDto`
- **AND** HTTP handler SHALL 重定向到客户端 callback 地址并携带 opaque `code`、`client` 和 `redirectUrl`

#### Scenario: legacy PrincipalSession token 来源被兼容
- **WHEN** `/sso/authorize` 通过 `Authorization` header 或 query `token` 而不是 `global_session` cookie 解析到 PrincipalSession token
- **THEN** 系统 SHALL 按兼容路径继续执行授权
- **AND** 系统 SHALL 记录脱敏 legacy bearer source system log
- **AND** system log SHALL NOT 包含 PrincipalSession token 明文

#### Scenario: Gateway callback 兑换局部会话
- **WHEN** `/sso/callback` 收到存在且未撤销的 auth code、合法 client code 和通过前缀校验的 redirect URL
- **THEN** 系统 SHALL 通过 Session Kernel 原子消费 auth code artifact
- **AND** 系统 SHALL 校验 artifact 引用的 PrincipalSession 仍存在、未撤销且未过期
- **AND** 系统 SHALL live 校验 PrincipalSession 引用的用户仍启用且未软删除
- **AND** 系统 SHALL 从当前 schema version profile 读取 `UserDetailDto`
- **AND** 系统 SHALL 为该 client 创建 custom SSO ClientBinding 与 local session IssuedCredential
- **AND** custom SSO adapter SHALL 保存协议私有 local session payload 以校验 credential/binding/principal/client 一致性
- **AND** local session payload 中的用户快照 SHALL NOT 作为后续用户资料权威来源
- **AND** HTTP handler SHALL 写入 `local_<client>_session` cookie 并重定向到 redirect URL
- **AND** 重定向 URL SHALL 携带 `token=<localSessionOpaqueToken>`

#### Scenario: Gateway callback 需要 ORCAS
- **WHEN** `/sso/callback` 兑换的 client 配置要求 ORCAS 登录
- **THEN** custom SSO adapter SHALL 在创建 local session payload 前完成 ORCAS 登录
- **AND** local session payload SHALL 保留兼容的 ORCAS 用户信息
- **AND** ORCAS 登录失败时系统 SHALL NOT 向调用方返回可用 local session token

#### Scenario: Independent token 兑换局部会话
- **WHEN** `/sso/token` 收到存在且未撤销的 auth code、合法 client code 和匹配的 client secret
- **THEN** 系统 SHALL 通过 Session Kernel 原子消费 auth code artifact
- **AND** 系统 SHALL 校验 artifact 引用的 PrincipalSession 仍存在、未撤销且未过期
- **AND** 系统 SHALL live 校验 PrincipalSession 引用的用户仍启用且未软删除
- **AND** 系统 SHALL 创建 Independent 模式 custom SSO ClientBinding 与 local session IssuedCredential
- **AND** 响应 SHALL 返回 `sid`、`ttl` 和 `userInfo`
- **AND** `userInfo` SHALL 保持 custom SSO 现有 `UserDetailDto` 响应契约并来自当前 schema version profile

#### Scenario: 授权码重复兑换被拒绝
- **WHEN** 同一个 custom SSO auth code 已经被 `/sso/callback` 或 `/sso/token` 成功消费
- **THEN** 后续使用相同 code 的兑换请求 SHALL 命中 `reason=consumed` 的 artifact tombstone 并被拒绝
- **AND** 系统 SHALL NOT 创建新的 ClientBinding、IssuedCredential 或 local session payload

#### Scenario: 授权码引用的 PrincipalSession 已失效
- **WHEN** `/sso/callback` 或 `/sso/token` 消费到的 auth code 引用不存在、已撤销或已过期的 PrincipalSession
- **THEN** 系统 SHALL 拒绝创建局部会话
- **AND** 系统 SHALL NOT 留下可用于鉴权的 custom SSO credential 或 payload

#### Scenario: 局部会话创建原子失败
- **WHEN** 创建 ClientBinding、IssuedCredential、lookup、索引或必要 tombstone 时任一安全关键 Redis 写入失败
- **THEN** 系统 SHALL 将本次局部会话创建视为失败
- **AND** 系统 SHALL NOT 向调用方返回可用 local session token

#### Scenario: 协议私有 payload 写入失败
- **WHEN** auth code 已成功消费，但 custom SSO local session payload 写入失败
- **THEN** 系统 SHALL 撤销本次兑换创建的 ClientBinding 或 IssuedCredential
- **AND** 系统 SHALL NOT 向调用方返回可用 local session token

### Requirement: SSO 登出清理会话
系统 SHALL 在 SSO 登出时通过 Session Kernel 撤销当前 PrincipalSession 及其仍有效的派生对象，并确保 IAM 权威态清理不被 Independent 客户端通知失败阻断。

#### Scenario: PrincipalSession 存在时登出
- **WHEN** `/sso/logout` 解析到有效 PrincipalSession
- **THEN** 系统 SHALL 调用 Session Kernel 撤销该 PrincipalSession
- **AND** Kernel SHALL 撤销该 PrincipalSession 下的 active ClientBinding、IssuedCredential 和 ProtocolArtifact
- **AND** Kernel SHALL 为被主动撤销的 principal、binding、credential 和 artifact 写入 tombstone
- **AND** HTTP handler SHALL 删除 `global_session` cookie 并重定向到请求中的 `redirectUrl`

#### Scenario: PrincipalSession 不存在时登出
- **WHEN** `/sso/logout` 未解析到有效 PrincipalSession
- **THEN** 系统 SHALL NOT 创建新的 tombstone
- **AND** HTTP handler SHALL 删除 `global_session` cookie 并重定向到请求中的 `redirectUrl`

#### Scenario: Independent 局部会话被移除
- **WHEN** 被撤销的 custom SSO binding 或 credential 模式是 `ClientManagementLevel.Independent`
- **THEN** custom SSO adapter SHALL best-effort 调用该客户端配置的 `logoutEndpoint` 并提交局部会话 ID 或等价撤销引用

#### Scenario: Independent 登出通知失败
- **WHEN** SSO 登出过程中某个 Independent 客户端 `logoutEndpoint` 请求失败、超时或返回异常响应
- **THEN** 系统 SHALL 记录该通知失败
- **AND** 系统 SHALL 继续完成 Session Kernel active object 删除、tombstone 写入和索引清理
- **AND** HTTP handler SHALL 按登出成功路径删除 `global_session` cookie 并重定向

#### Scenario: 登出遇到残留索引成员
- **WHEN** Session Kernel 索引中存在 active object 已过期或缺失的残留 member
- **THEN** 系统 SHALL 清理该残留成员
- **AND** 系统 SHALL NOT 因残留 member 缺失对应 active object 而中断全局登出

#### Scenario: 协议 payload cleanup 失败
- **WHEN** Session Kernel 已写入 tombstone，但 custom SSO adapter 删除私有 payload 失败
- **THEN** 系统 SHALL 在 revoke summary 或 system log 中记录 cleanup failure
- **AND** 后续携带同一 local session token 的请求 SHALL 因 tombstone 被拒绝

### Requirement: 网关鉴权返回用户摘要
系统 SHALL 通过客户端标识和 custom SSO local session credential 校验网关请求，并在 credential、binding、PrincipalSession、用户和 client 状态一致有效时返回 base64 编码的用户摘要。

#### Scenario: 缺少必要请求上下文
- **WHEN** `/auth/authz` 请求缺少 `Client` header 或 `X-Forwarded-Uri`
- **THEN** 系统 SHALL 拒绝请求并报告非法访问

#### Scenario: 局部会话有效
- **WHEN** `/auth/authz` 请求的客户端存在，且 cookie 或 `Authorization` header 中的 local session token 可通过 Session Kernel lookup 解析到 active custom SSO IssuedCredential
- **THEN** 系统 SHALL 校验该 credential 未被 tombstone 撤销
- **AND** 系统 SHALL 校验 credential 关联的 clientCode 与请求 client 一致
- **AND** 系统 SHALL 校验关联 ClientBinding 和 PrincipalSession 仍有效
- **AND** 系统 SHALL 通过注入 hook 或 adapter 校验实时 user 和 client 状态
- **AND** 系统 SHALL 校验 custom SSO local session payload 与 credential、binding、PrincipalSession 和 client 一致
- **AND** 系统 SHALL 从当前 schema version profile 读取用户详情
- **AND** 系统 SHALL 将 `{ username, id }` 编码为 base64 字符串
- **AND** 系统 SHALL 将该字符串写入 `X-User-Info` 响应头并作为成功响应数据返回

#### Scenario: 局部会话 credential 已撤销
- **WHEN** `/auth/authz` 请求携带的 local session token 命中 credential tombstone
- **THEN** 系统 SHALL 拒绝请求并报告未登录
- **AND** 系统 SHALL NOT 读取 custom SSO local session payload

#### Scenario: 局部会话 credential 客户端不匹配
- **WHEN** `/auth/authz` 请求携带的 local session token 可解析到 custom SSO IssuedCredential，但 credential clientCode 与请求 `Client` header 不一致
- **THEN** 系统 SHALL 拒绝请求并报告未登录
- **AND** 系统 SHALL NOT 返回用户摘要

#### Scenario: PrincipalSession 已失效
- **WHEN** `/auth/authz` 请求能解析到 custom SSO credential，但其关联 PrincipalSession 缺失、已撤销或已过期
- **THEN** 系统 SHALL 拒绝请求并报告未登录
- **AND** 系统 SHALL lazy revoke 当前 binding 或 credential

#### Scenario: 用户不可用
- **WHEN** `/auth/authz` 实时校验发现用户已禁用或已删除
- **THEN** 系统 SHALL 拒绝请求并报告未登录
- **AND** 系统 SHALL lazy revoke 该用户的所有 PrincipalSession

#### Scenario: 客户端维护中
- **WHEN** 客户端状态为 `ClientStatus.Maintance`，且当前用户不在客户端 `userExcluding` 列表中
- **THEN** 系统 SHALL 拒绝请求并报告系统维护中
- **AND** 系统 SHALL NOT 因 custom SSO maintenance 主动撤销该 local session credential

#### Scenario: 协议私有 payload 缺失或无效
- **WHEN** `/auth/authz` 请求能解析到 active custom SSO credential，但 custom SSO local session payload 缺失或 schema 无效
- **THEN** 系统 SHALL 拒绝请求并报告未登录
- **AND** 系统 SHALL lazy revoke 当前 credential

#### Scenario: Profile detail unavailable
- **WHEN** `/auth/authz` 请求的 credential、binding、PrincipalSession、用户和 client 状态均有效，但当前 schema version profile 缺失或无效
- **THEN** 系统 SHALL 拒绝请求并报告未登录
- **AND** 系统 SHALL NOT fallback 到源表构建用户摘要
- **AND** 系统 SHALL NOT 仅因为 profile 缺失而 lazy revoke 该用户的所有 PrincipalSession

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

### Requirement: custom SSO 发布文档必须覆盖 Session Kernel 切换
系统 SHALL 在 custom SSO 接入或发布文档中说明 Session Kernel 切换后的运行边界、兼容风险和 smoke 验收要求。

#### Scenario: 文档说明 opaque token 与 legacy bearer 风险
- **WHEN** 维护者查看 custom SSO 接入或发布文档
- **THEN** 文档 SHALL 说明 PrincipalSession token、auth code 和 local session sid 都是 opaque bearer
- **AND** 文档 SHALL 说明 `Authorization` header 或 query `token` 作为 PrincipalSession 来源仅为 legacy 兼容路径
- **AND** 文档 MUST NOT 鼓励新 client 通过 URL query 传递 PrincipalSession token

#### Scenario: 文档说明旧 key 清理范围
- **WHEN** 维护者准备发布 custom SSO Session Kernel 版本
- **THEN** 文档 SHALL 列出必须清理的旧 custom SSO Redis namespace，包括 `global_session:*`、`auth_code:*`、`local_*_session:*`、`local_session_reverse:*` 和 `local_session_set:*`
- **AND** 文档 SHALL 说明清理后所有用户和 custom SSO client 都需要重新登录或重新发起授权

#### Scenario: 文档说明回滚前置条件
- **WHEN** 发布需要回滚到旧 custom SSO session 实现
- **THEN** 文档 SHALL 要求停止登录、authorize、callback、token 和 authz 流量
- **AND** 文档 SHALL 要求清理新版本 `sess:v2:` 相关 active/lookup/revoked/index key 以及 custom SSO 私有 payload key
- **AND** 文档 SHALL 要求回滚后重新执行 custom SSO 登录与网关鉴权 smoke

### Requirement: custom SSO Session Kernel smoke 必须覆盖网关鉴权主路径
系统 SHALL 在发布前验证 custom SSO 通过 Session Kernel 生成、兑换、鉴权和撤销 local session 的完整路径。

#### Scenario: Gateway 模式 smoke 成功
- **WHEN** smoke test 使用 Gateway 模式 client 完成登录、`/sso/authorize` 和 `/sso/callback`
- **THEN** 系统 SHALL 创建 custom SSO ClientBinding 和 local session IssuedCredential
- **AND** `/auth/authz` SHALL 使用 local session opaque token 返回兼容的 `X-User-Info`
- **AND** Redis 中 SHALL NOT 出现旧 `local_<client>_session:*` authority key

#### Scenario: Independent 模式 smoke 成功
- **WHEN** smoke test 使用 Independent 模式 client 完成登录、`/sso/authorize` 和 `/sso/token`
- **THEN** 响应 SHALL 返回兼容的 `sid`、`ttl` 和 `userInfo`
- **AND** local session sid SHALL 通过 Session Kernel credential lookup 校验
- **AND** Redis 中 SHALL NOT 出现旧 `local_session_reverse:*` 或 `local_session_set:*` authority key

#### Scenario: auth code 重放 smoke 被拒绝
- **WHEN** smoke test 第二次提交已经成功兑换的 custom SSO auth code
- **THEN** 请求 SHALL 被拒绝
- **AND** 系统 SHALL 命中 `reason=consumed` 的 artifact tombstone
- **AND** 系统 SHALL NOT 创建新的 ClientBinding、IssuedCredential 或 local session payload

#### Scenario: logout smoke 撤销派生对象
- **WHEN** smoke test 对已登录 PrincipalSession 调用 `/sso/logout`
- **THEN** 系统 SHALL 通过 Session Kernel 撤销该 PrincipalSession 下的 custom SSO binding、credential 和 artifact
- **AND** 后续 `/auth/authz` 使用旧 local session token SHALL 被拒绝
- **AND** cleanup failure 如发生 SHALL 只影响系统日志和 revoke summary，不得恢复已撤销 token

### Requirement: legacy PrincipalSession bearer source 必须可观测且不泄密
系统 SHALL 保留 custom SSO legacy PrincipalSession token 来源的兼容观测，并 SHALL 禁止在日志中输出 bearer 明文。

#### Scenario: Authorization header 来源被记录
- **WHEN** `/sso/authorize` 通过 `Authorization` header 解析到 PrincipalSession token
- **THEN** 系统 SHALL 输出稳定 system log event
- **AND** 日志 SHALL 包含 source、clientCode、requestId 和 sourceApp
- **AND** 日志 MUST NOT 包含 Authorization header 值、PrincipalSession token、Cookie 或完整 query

#### Scenario: query token 来源被记录
- **WHEN** `/sso/authorize` 通过 query `token` 解析到 PrincipalSession token
- **THEN** 系统 SHALL 输出稳定 system log event
- **AND** 日志 SHALL 标识该来源为 legacy query token
- **AND** 日志 MUST NOT 包含 query token 明文或完整 redirect URL query

### Requirement: API 旧 Redis SessionService 不得作为运行时会话路径
系统 SHALL 只通过 Session Kernel adapter 创建、解析、授权和撤销 IAM 浏览器会话与 custom SSO local session，并 SHALL 不再通过 API 旧 `SessionService` 或 legacy Redis authority key helper 管理运行时会话。

#### Scenario: API 服务组合不暴露旧 SessionService
- **WHEN** `apps/api` composition 创建服务集合
- **THEN** 服务集合 SHALL NOT 创建或返回旧 `SessionService`
- **AND** auth、SSO、public authentication 和 gateway authz 路径 SHALL 依赖 Session Kernel-backed `customSsoSession` 或等价端口

#### Scenario: custom SSO 主路径不写旧 authority key
- **WHEN** 用户完成登录、`/sso/authorize`、`/sso/callback`、`/sso/token`、`/auth/authz` 或 `/sso/logout`
- **THEN** 系统 SHALL NOT 调用 `createGlobalSession`、`writeLocalSession`、`readGlobalSession`、`readValidatedLocalSessionUser` 或等价 legacy helper 作为会话权威操作
- **AND** 系统 SHALL NOT 创建新的 `global_session:*`、`local_*_session:*`、`local_session_reverse:*` 或 `local_session_set:*` authority key

### Requirement: Admin API 不得回退旧 Redis session
Admin API SHALL 使用 Session Kernel PrincipalSession 作为唯一登录态来源，并 SHALL 在缺失或无法解析 PrincipalSession 时 fail closed。

#### Scenario: Admin 请求缺少 Kernel PrincipalSession token
- **WHEN** `/admin` 或 `/rpc` 请求携带允许的 `Client` header 但没有 `global_session` cookie 或 `Authorization` token
- **THEN** admin authentication SHALL 返回未登录错误
- **AND** admin authentication SHALL NOT 尝试读取 legacy `global_session:*` Redis envelope

#### Scenario: Admin 请求携带无效 Kernel token
- **WHEN** `/admin` 或 `/rpc` 请求携带的 `global_session` cookie 或 `Authorization` token 不能解析为 active Session Kernel PrincipalSession
- **THEN** admin authentication SHALL 清理 `global_session` 和 `orcas_sso_sessionid` cookie
- **AND** admin authentication SHALL 返回未登录错误
- **AND** admin authentication SHALL NOT 回退到 legacy `createAdminAuthenticationHandler`

#### Scenario: Admin 用户与 PrincipalSession 不一致
- **WHEN** Kernel PrincipalSession 可解析，但实时用户不存在、已禁用、用户 ID 不匹配或缺少管理员角色
- **THEN** admin authentication SHALL 拒绝请求
- **AND** 对未登录类失败 SHALL 清理浏览器主会话 cookie

## Open Questions
- `MAGIC_CODE` 是当前已实现行为和已有测试覆盖点，但安全审计将其标为 Critical；是否继续作为目标行为需要后续单独确认。
- `redirectUrl` 当前使用字符串 `startsWith` 前缀校验；baseline 只记录当前合法性判断，不声明其安全充分性。
- OIDC 与 admin afterCommit revoke 尚未迁移到 Session Kernel；跨协议 PrincipalSession cleanup 顺序和统一 revoke summary 由后续 child change 固化。

## Evidence Review
- 密码登录加密凭证传输: 证据 `apps/api/src/routes/auth/login-credential.ts`, `apps/api/src/routes/auth/auth.handlers.ts`, `apps/sso/src/services/auth.ts`, `apps/sso/src/lib/login-credential.ts`。状态: 有代码和测试证据。
- 全局登录创建会话: 证据 `apps/api/src/routes/auth/auth.routes.ts`, `apps/api/src/routes/auth/auth.handlers.ts`, `apps/api/src/routes/auth/auth.service.ts`, `apps/api/src/routes/sso/sso.service.ts`, `apps/api/src/services/session/custom-sso-session-kernel.adapter.ts`, `packages/api-core/src/session/kernel`。状态: 有代码和测试证据；含安全风险 `MAGIC_CODE`。
- 登录失败计数与账号暂停: 证据 `apps/api/src/routes/auth/login-failure.helper.ts`, `apps/api/src/routes/auth/auth.service.ts`, `apps/api/src/routes/auth/__tests__/auth.service.test.ts`。状态: 有代码和测试证据；未覆盖所有第三方失败路径。
- SSO 授权码与局部会话: 证据 `apps/api/src/routes/sso/sso.routes.ts`, `apps/api/src/routes/sso/sso.handlers.ts`, `apps/api/src/routes/sso/sso.service.ts`, `apps/api/src/services/session/custom-sso-session-kernel.adapter.ts`, `packages/api-core/src/session/kernel`, `packages/db/src/schema/core/clients.ts`。状态: 有代码和测试证据；redirect/token 传输存在已知安全风险。
- SSO 登出清理会话: 证据 `apps/api/src/routes/sso/sso.handlers.ts`, `apps/api/src/routes/sso/sso.service.ts`, `apps/api/src/services/session/custom-sso-session-kernel.adapter.ts`, `packages/api-core/src/session/kernel`。状态: 有代码和测试证据。
- 网关鉴权返回用户摘要: 证据 `apps/api/src/routes/auth/auth.handlers.ts`, `apps/api/src/routes/auth/auth.service.ts`, `apps/api/src/services/session/custom-sso-session-kernel.adapter.ts`, `apps/api/src/services/client/client.service.ts`。状态: 有代码和测试证据；未证明 path/method 权限校验。
- 内部服务鉴权: 证据 `packages/api-core/src/middlewares/auth.ts`, `apps/api/src/routes/auth/auth.handlers.ts`, `apps/api/src/services/client/client.service.ts`, `gateway/manifests/dev/tender/routes.yaml`, `gateway/manifests/prod/tender/routes.yaml`。状态: 有代码和测试证据；内部服务鉴权统一依赖 active client `apikey`，不再接受 `IP-Chain` 白名单绕过。
