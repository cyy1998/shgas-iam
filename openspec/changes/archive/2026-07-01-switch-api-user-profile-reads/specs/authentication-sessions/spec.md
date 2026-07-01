## MODIFIED Requirements

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
