## MODIFIED Requirements

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
