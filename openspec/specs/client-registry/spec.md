# client-registry Specification

## Purpose
描述当前客户端应用注册表行为，包括 client 数据结构、管理端创建/更新、Redis 缓存，以及公共 API、SSO、网关鉴权和内部鉴权对 client 的读取方式。该 baseline 只记录现状，不代表密钥治理目标态。
## Requirements
### Requirement: 客户端记录包含 SSO 和会话管理属性
系统 SHALL 将客户端代码、名称、密钥、状态、描述和扩展属性保存在 client 记录中。

#### Scenario: 客户端扩展属性结构
- **WHEN** 系统解析 client extAttributes
- **THEN** extAttributes SHALL 包含 userExcluding、requireOrcas、validRedirectUrls、managementLevel、logoutEndpoint 和 callbackEndpoint

#### Scenario: 客户端状态枚举
- **WHEN** 系统读取 client status
- **THEN** status SHALL 使用 `ClientStatus.Enable`、`ClientStatus.Maintance` 或 `ClientStatus.Disable`

### Requirement: 管理端创建和更新客户端
系统 SHALL 通过管理端 client REST 接口创建和更新客户端，并同步写入 Redis code/secret 缓存。

#### Scenario: 创建客户端
- **WHEN** 管理端提交 `/admin/clients/create` 请求且输入通过 schema 校验
- **THEN** 系统 SHALL 插入 client 记录
- **AND** 系统 SHALL 将创建后的 ClientDto 写入 `cache:client:code:<clientCode>` 与 `cache:client:secret:<clientSecret>`
- **AND** 响应 SHALL 返回 ClientDto

#### Scenario: 更新客户端
- **WHEN** 管理端提交 `/admin/clients/update` 请求且输入包含 id
- **THEN** 系统 SHALL 按 id 更新 client 记录中的请求字段
- **AND** 系统 SHALL 将更新后的 ClientDto 写入 code 和 secret 缓存
- **AND** 响应 SHALL 返回 ClientDto

### Requirement: 公共 API 按 clientCode 返回客户端信息
系统 SHALL 通过公开接口按 clientCode 查询客户端信息。

#### Scenario: 查询客户端状态
- **WHEN** 调用 `/open/client/status` 并提供 clientCode
- **THEN** 系统 SHALL 优先读取 `cache:client:code:<clientCode>`
- **AND** 若缓存缺失或缓存内容不符合 ClientDtoSchema，系统 SHALL 查询数据库
- **AND** 成功查询后系统 SHALL 写入 code 和 secret 缓存
- **AND** 响应 SHALL 返回 ClientDto 或 null

### Requirement: 系统按 clientCode 和 clientSecret 解析客户端
系统 SHALL 为 SSO、网关鉴权和内部鉴权提供按 clientCode 或 clientSecret 解析 client 的能力。

#### Scenario: 按 clientCode 解析客户端
- **WHEN** SSO 授权、callback 或网关鉴权需要客户端配置
- **THEN** 系统 SHALL 按 clientCode 从缓存或数据库读取 ClientDto

#### Scenario: 按 clientSecret 解析客户端
- **WHEN** `/sso/token` 或 `/auth/internal-authz` 使用 client secret 校验
- **THEN** 系统 SHALL 按 clientSecret 从缓存或数据库读取 ClientDto

#### Scenario: 缓存 schema 失效
- **WHEN** Redis 中的 client 缓存不能通过 ClientDtoSchema 解析
- **THEN** 系统 SHALL 删除该缓存 key
- **AND** 系统 SHALL 返回 null 以便调用方继续走数据库查询

### Requirement: 客户端配置影响 SSO 和鉴权行为
系统 SHALL 根据 client extAttributes 和 status 影响 SSO callback、authorize、logout 和网关鉴权。

#### Scenario: SSO redirect 前缀校验
- **WHEN** SSO authorize 或 callback 校验 redirectUrl
- **THEN** 系统 SHALL 要求 redirectUrl 以 client.extAttributes.validRedirectUrls 中任一字符串开头

#### Scenario: Gateway 和 Independent 模式
- **WHEN** SSO authorize 生成 callback 重定向地址
- **THEN** Gateway 模式 SHALL 使用 redirectUrl 的协议和主机拼接 `/sso/callback`
- **AND** Independent 模式 SHALL 使用 client.extAttributes.callbackEndpoint

#### Scenario: ORCAS 集成
- **WHEN** client.extAttributes.requireOrcas 为 true 且执行 Gateway callback
- **THEN** 系统 SHALL 调用 ORCAS 登录并把 orcas session 写入 cookie 与重定向 URL 参数

#### Scenario: 维护状态鉴权
- **WHEN** client.status 为 `ClientStatus.Maintance` 且当前用户不在 userExcluding 列表中
- **THEN** 网关鉴权 SHALL 拒绝请求并报告系统维护中

### Requirement: Client and SSO errors use centralized API errors
Client registry and SSO flows SHALL use centralized named errors for stable client and SSO validation failures.

#### Scenario: Client does not exist
- **WHEN** a client operation targets a missing client
- **THEN** the backend SHALL throw a centralized client not found error

#### Scenario: Client code already exists
- **WHEN** creating or renaming a client would duplicate a client code
- **THEN** the backend SHALL throw a centralized client code exists error

#### Scenario: SSO request has invalid client or redirect URI
- **WHEN** an SSO request contains an invalid client code or redirect URI
- **THEN** the backend SHALL return the corresponding centralized SSO validation error

## Open Questions
- 当前公开 `/open/client/status` 返回完整 ClientDto，可能包含 clientSecret；安全审计已将其标为风险，是否保留为目标行为需要单独整改确认。
- client 查询 repository 当前不按 `status` 或 `isDelete` 过滤；禁用或软删除 client 是否仍可被缓存/解析需要确认。
- 管理端 client create/update 没有显式重复 code/secret 校验；是否依赖数据库唯一约束或外部流程需要确认。
- 更新 client 时旧 code 或旧 secret 对应的 Redis 缓存没有显式删除；旧缓存失效策略需要确认。

## Evidence Review
- 客户端记录包含 SSO 和会话管理属性: 证据 `packages/db/src/schema/core/clients.ts`, `packages/contracts/src/enums/client.status.ts`, `packages/contracts/src/enums/client.managementLevel.ts`, `packages/domain/src/client/schema.ts`。状态: 有 schema 证据。
- 管理端创建和更新客户端: 证据 `apps/admin-api/src/routes/admin/client/client.routes.ts`, `client.handlers.ts`, `apps/admin-api/src/services/client/client.service.ts`, `client.repository.ts`。状态: 有代码证据；缺少 tRPC 暴露。
- 公共 API 按 clientCode 返回客户端信息: 证据 `apps/api/src/routes/open/open.routes.ts`, `apps/api/src/routes/open/open.handlers.ts`, `apps/api/src/services/client/client.service.ts`。状态: 有代码证据；含敏感字段风险。
- 系统按 clientCode 和 clientSecret 解析客户端: 证据 `apps/api/src/services/client/client.service.ts`, `apps/api/src/services/client/client.repository.ts`, `apps/api/src/routes/auth/auth.handlers.ts`, `apps/api/src/routes/sso/sso.service.ts`。状态: 有代码证据。
- 客户端配置影响 SSO 和鉴权行为: 证据 `apps/api/src/routes/sso/sso.handlers.ts`, `apps/api/src/routes/sso/sso.service.ts`, `apps/api/src/routes/auth/auth.service.ts`, `packages/db/src/schema/core/clients.ts`。状态: 有代码证据；redirect/token 安全性需另行确认。
