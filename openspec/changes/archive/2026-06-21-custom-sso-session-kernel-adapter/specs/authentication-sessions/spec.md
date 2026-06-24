## MODIFIED Requirements

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

### Requirement: SSO 授权码与局部会话
系统 SHALL 为已登录用户和合法客户端生成一次性 Kernel ProtocolArtifact，并在 callback 或 token 兑换时一致地创建面向客户端的 ClientBinding 与 local session IssuedCredential。

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
- **AND** 系统 SHALL 为该 client 创建 custom SSO ClientBinding 与 local session IssuedCredential
- **AND** custom SSO adapter SHALL 构造并保存协议私有 `UserDetailDto` local session payload
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
- **AND** 系统 SHALL 创建 Independent 模式 custom SSO ClientBinding 与 local session IssuedCredential
- **AND** 响应 SHALL 返回 `sid`、`ttl` 和 `userInfo`
- **AND** `userInfo` SHALL 保持 custom SSO 现有 `UserDetailDto` 响应契约

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
- **THEN** 系统 SHALL 清理该残留 member
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
- **AND** 系统 SHALL 从 custom SSO local session payload 中读取用户快照
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
