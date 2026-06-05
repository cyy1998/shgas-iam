## ADDED Requirements

### Requirement: OIDC client 记录包含标准协议配置
系统 SHALL 维护独立的 OIDC client 注册表，用于 provider 运行时校验 client、redirect URI、scope 和 token endpoint 认证方式。

#### Scenario: OIDC client 基础字段
- **WHEN** 系统读取 OIDC client 记录
- **THEN** 记录 SHALL 包含 `clientId`、`clientName`、`clientType`、`status`、`redirectUris`、`postLogoutRedirectUris`、`grantTypes`、`responseTypes`、`scopes`、`tokenEndpointAuthMethod`、`description`、`createTime` 和 `updateTime`

#### Scenario: public client 配置
- **WHEN** 管理员创建 public OIDC client
- **THEN** 系统 SHALL 允许该 client 不配置 client secret
- **AND** 系统 SHALL 要求该 client 使用 Authorization Code Flow + PKCE

#### Scenario: confidential client 配置
- **WHEN** 管理员创建 confidential OIDC client
- **THEN** 系统 SHALL 为该 client 生成或接收 client secret
- **AND** 系统 SHALL 仅保存 client secret 摘要

### Requirement: OIDC redirect URI 精确匹配
系统 SHALL 对 OIDC client 的 redirect URI 和 post logout redirect URI 使用精确匹配规则。

#### Scenario: redirect URI 命中注册值
- **WHEN** provider 校验 authorize 或 token 请求中的 `redirect_uri`
- **AND** 该值与 OIDC client 注册的某个 `redirectUris` 字符串完全相同
- **THEN** 系统 SHALL 允许请求继续进行后续校验

#### Scenario: redirect URI 仅前缀命中
- **WHEN** 请求中的 `redirect_uri` 仅以前缀方式命中已注册 URI，但字符串不完全相同
- **THEN** 系统 SHALL 拒绝该请求

#### Scenario: post logout redirect URI 命中注册值
- **WHEN** provider 校验 end session 请求中的 `post_logout_redirect_uri`
- **AND** 该值与 OIDC client 注册的某个 `postLogoutRedirectUris` 字符串完全相同
- **THEN** 系统 SHALL 允许退出完成后跳转到该 URI

### Requirement: OIDC client secret 只显示一次并支持轮换
系统 SHALL 对 confidential OIDC client 的 client secret 执行只显示一次、摘要存储和可审计轮换。

#### Scenario: 创建 confidential client
- **WHEN** 管理员创建 confidential OIDC client 且系统生成 client secret
- **THEN** 响应 SHALL 返回一次明文 client secret
- **AND** 数据库 SHALL 只保存 client secret 摘要
- **AND** 后续详情查询 SHALL NOT 返回明文 client secret

#### Scenario: 校验 client secret
- **WHEN** provider 需要校验 confidential OIDC client secret
- **THEN** 系统 SHALL 使用保存的摘要进行校验
- **AND** 系统 SHALL NOT 通过明文 secret 查询数据库或 Redis key

#### Scenario: 轮换 client secret
- **WHEN** 管理员轮换 confidential OIDC client secret
- **THEN** 系统 SHALL 生成或接收新的 secret 并保存新摘要
- **AND** 系统 SHALL 使旧 secret 不再通过 provider 校验
- **AND** 响应 SHALL 仅本次返回新明文 secret

### Requirement: 管理端维护 OIDC client
系统 SHALL 通过 admin-api 和 admin 页面提供 OIDC client 搜索、创建、详情、更新、状态变更、删除和密钥轮换能力。

#### Scenario: 搜索 OIDC client
- **WHEN** 管理员在 admin 页面搜索 OIDC client
- **THEN** 页面 SHALL 展示 clientId、clientName、clientType、status、redirectUris、scopes 和 createTime
- **AND** 搜索 SHALL 支持按关键字、状态和 clientType 筛选

#### Scenario: 创建 OIDC client
- **WHEN** 管理员提交 OIDC client 创建表单且输入通过 schema 校验
- **THEN** admin-api SHALL 创建 OIDC client 记录
- **AND** 页面 SHALL 在创建成功后展示必要的 client 接入信息

#### Scenario: 更新 OIDC client
- **WHEN** 管理员更新 OIDC client 的名称、redirect URI、post logout redirect URI、scope、状态或描述
- **THEN** admin-api SHALL 更新对应记录
- **AND** provider 后续读取 SHALL 使用更新后的配置

#### Scenario: 禁用或删除 OIDC client
- **WHEN** 管理员禁用或删除 OIDC client
- **THEN** provider SHALL 拒绝该 client 后续 authorize 和 token 请求

### Requirement: OIDC client 变更记录审计
系统 SHALL 对 OIDC client 的创建、更新、状态变更、删除和 secret 轮换记录管理审计事件。

#### Scenario: 记录 client 创建审计
- **WHEN** 管理员创建 OIDC client
- **THEN** 系统 SHALL 记录包含操作者、clientId、clientType 和允许 scope 的审计事件
- **AND** 审计事件 SHALL NOT 包含明文 client secret

#### Scenario: 记录 secret 轮换审计
- **WHEN** 管理员轮换 OIDC client secret
- **THEN** 系统 SHALL 记录 secret 已轮换的审计事件
- **AND** 审计事件 SHALL NOT 包含旧 secret 或新 secret 明文

### Requirement: Provider 运行时解析 OIDC client
系统 SHALL 为 OIDC provider 提供按 `client_id` 解析启用 OIDC client 的能力。

#### Scenario: 解析启用 client
- **WHEN** provider 按 `client_id` 读取 OIDC client
- **AND** client 存在、未删除且状态为启用
- **THEN** 系统 SHALL 返回该 client 的 provider runtime metadata

#### Scenario: 解析禁用或已删除 client
- **WHEN** provider 按 `client_id` 读取禁用或已删除 OIDC client
- **THEN** 系统 SHALL 将该 client 视为不存在或不可用
- **AND** provider SHALL 拒绝相关 authorize 和 token 请求
