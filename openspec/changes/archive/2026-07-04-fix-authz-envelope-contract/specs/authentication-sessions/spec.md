## MODIFIED Requirements

### Requirement: 网关鉴权返回用户摘要
系统 SHALL 通过客户端标识和 custom SSO local session credential 校验网关请求，并在 credential、binding、PrincipalSession、用户和 client 状态一致有效时返回 base64 编码的用户摘要。系统 SHALL 在 `/auth/authz` OpenAPI 成功响应中将该用户摘要记录为成功 envelope 的字符串 `data`。

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

#### Scenario: OpenAPI 成功响应记录字符串数据
- **WHEN** `/auth/authz` route definition 暴露 OpenAPI 成功响应 schema
- **THEN** 成功响应 SHALL 使用标准成功 envelope
- **AND** 成功响应 envelope 的 `data` SHALL 被记录为字符串
- **AND** 成功响应 envelope 的 `data` SHALL NOT 被记录为空对象或任意对象

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
- **WHEN** 客户端状态为 `ClientStatus.Maintenance`，且当前用户不在客户端 `userExcluding` 列表中
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
