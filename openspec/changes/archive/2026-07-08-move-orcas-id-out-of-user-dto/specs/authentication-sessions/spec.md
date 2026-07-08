## MODIFIED Requirements

### Requirement: SSO 授权码与局部会话
系统 SHALL 为已登录用户和合法客户端生成一次性 Kernel ProtocolArtifact，并在 callback 或 token 兑换时一致地创建面向客户端的 ClientBinding 与 local session IssuedCredential。local session payload SHALL 保留协议私有一致性数据和必要集成上下文，但后续用户资料读取 SHALL NOT 以 Redis payload 快照作为权威来源。

#### Scenario: 未登录用户发起 SSO 授权
- **WHEN** `/sso/authorize` 请求没有可用的 PrincipalSession
- **THEN** 系统 SHALL 返回 `isLogin=false`
- **AND** HTTP handler SHALL 重定向到登录端点并保留原查询参数

#### Scenario: 已登录用户发起 SSO 授权
- **WHEN** `/sso/authorize` 请求包含可用 PrincipalSession，客户端存在，并且 `redirectUrl` 命中客户端允许的 redirect URL pattern
- **THEN** 系统 SHALL 按前台交互规则刷新 PrincipalSession idle TTL
- **AND** 系统 SHALL 使用结构化 URL 语义匹配 protocol、hostname、port 和 pathname
- **AND** 系统 SHALL NOT 使用纯字符串 `startsWith` 作为 redirectUrl 校验语义
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
- **WHEN** `/sso/callback` 收到存在且未撤销的 auth code、合法 client code 和命中客户端允许 redirect URL pattern 的 redirect URL
- **THEN** 系统 SHALL 通过 Session Kernel 原子消费 auth code artifact
- **AND** 系统 SHALL 使用结构化 URL 语义匹配 protocol、hostname、port 和 pathname
- **AND** 系统 SHALL NOT 使用纯字符串 `startsWith` 作为 redirectUrl 校验语义
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
- **AND** local session payload SHALL 在 ORCAS 集成上下文中保存 ORCAS 用户 ID 和 ORCAS session ID
- **AND** local session payload SHALL NOT 将 ORCAS 用户 ID 写入 `UserDetailDto` 或 `userInfo`
- **AND** ORCAS 登录失败时系统 SHALL NOT 向调用方返回可用 local session token

#### Scenario: Public ORCAS ID 查询
- **WHEN** 已认证 public 请求访问 `/public/orcasId`
- **THEN** 系统 SHALL 从当前 Custom SSO local session 的 ORCAS 集成上下文返回 `{ orcasId }`
- **AND** 当当前 session 没有 ORCAS 集成上下文时，系统 SHALL 返回 `{ orcasId: null }`
- **AND** 系统 SHALL NOT 从 `UserDetailDto` 读取 ORCAS ID

#### Scenario: Independent token 兑换局部会话
- **WHEN** `/sso/token` 收到存在且未撤销的 auth code、合法 client code 和匹配的 client secret
- **THEN** 系统 SHALL 通过 Session Kernel 原子消费 auth code artifact
- **AND** 系统 SHALL 校验 artifact 引用的 PrincipalSession 仍存在、未撤销且未过期
- **AND** 系统 SHALL live 校验 PrincipalSession 引用的用户仍启用且未软删除
- **AND** 系统 SHALL 创建 Independent 模式 custom SSO ClientBinding 与 local session IssuedCredential
- **AND** 响应 SHALL 返回 `sid`、`ttl` 和 `userInfo`
- **AND** `userInfo` SHALL 保持 custom SSO 现有 `UserDetailDto` 响应契约并来自当前 schema version profile
- **AND** `userInfo` SHALL NOT 包含 ORCAS 会话身份字段

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
