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

### Requirement: 管理端查询和维护客户端
系统 SHALL 通过管理端 client REST 与 tRPC 接口提供 client 分页搜索、详情读取、状态变更和软删除能力。

#### Scenario: 分页搜索客户端
- **WHEN** 管理端通过 REST 或 tRPC 提交 client 分页搜索请求
- **THEN** 系统 SHALL 返回未软删除 client 的分页结果
- **AND** 结果 SHALL 支持按 clientCode、clientName、url 或 description 模糊匹配
- **AND** 结果 SHALL 支持按 status 和 managementLevel 精确筛选

#### Scenario: 查询客户端详情
- **WHEN** 管理端通过 REST 或 tRPC 按 clientCode 查询 client 详情
- **THEN** 系统 SHALL 返回对应 ClientDto
- **AND** 当 client 不存在或已软删除时，系统 SHALL 返回未找到错误

#### Scenario: 更新客户端状态
- **WHEN** 管理端通过 REST 或 tRPC 按 clientCode 提交 status 变更
- **THEN** 系统 SHALL 更新对应 client 的 status
- **AND** 系统 SHALL 同步刷新该 client 的 Redis code/secret 缓存

#### Scenario: 软删除客户端
- **WHEN** 管理端通过 REST 或 tRPC 按 clientCode 删除 client
- **THEN** 系统 SHALL 将该 client 标记为软删除
- **AND** 系统 SHALL 删除该 client 当前 code 和 secret 对应的 Redis 缓存 key
- **AND** 后续管理端搜索和详情查询 SHALL 不再返回该 client

### Requirement: 管理端页面管理客户端
系统 SHALL 在 `admin` 应用中提供 client 管理页面，使管理员可以通过页面完成常规 client 配置维护。

#### Scenario: 查看客户端列表
- **WHEN** 管理员打开 client 管理页面
- **THEN** 页面 SHALL 展示 clientCode、clientName、url、status、managementLevel 和 createTime 等列表信息
- **AND** 页面 SHALL 提供关键字搜索、状态筛选和管理模式筛选

#### Scenario: 新建客户端
- **WHEN** 管理员在 client 管理页面提交新建表单
- **THEN** 页面 SHALL 调用 admin client tRPC 创建接口
- **AND** 创建成功后 SHALL 关闭表单并刷新列表

#### Scenario: 编辑客户端
- **WHEN** 管理员在 client 管理页面提交编辑表单
- **THEN** 页面 SHALL 调用 admin client tRPC 更新接口
- **AND** 编辑表单 SHALL 支持维护 client 基础字段和 extAttributes 字段

#### Scenario: 页面变更客户端状态
- **WHEN** 管理员在 client 管理页面选择新的 client 状态
- **THEN** 页面 SHALL 调用 admin client tRPC 状态更新接口
- **AND** 成功后 SHALL 刷新列表并展示成功反馈

#### Scenario: 页面删除客户端
- **WHEN** 管理员在 client 管理页面确认删除 client
- **THEN** 页面 SHALL 调用 admin client tRPC 删除接口
- **AND** 成功后 SHALL 刷新列表并展示成功反馈

### Requirement: 管理端创建和更新客户端
系统 SHALL 通过管理端 client REST 与 tRPC 接口创建和更新客户端，并保持数据库记录与 Redis code/secret 缓存一致。

#### Scenario: 创建客户端
- **WHEN** 管理端提交 client 创建请求且输入通过 schema 校验
- **THEN** 系统 SHALL 插入 client 记录
- **AND** 系统 SHALL 将创建后的 ClientDto 写入 `cache:client:code:<clientCode>` 与 `cache:client:secret:<clientSecret>`
- **AND** 响应 SHALL 返回 ClientDto

#### Scenario: 更新客户端
- **WHEN** 管理端按 clientCode 提交 client 更新请求且输入通过 schema 校验
- **THEN** 系统 SHALL 更新对应 client 记录中的请求字段
- **AND** 系统 SHALL 将更新后的 ClientDto 写入 `cache:client:code:<clientCode>` 与 `cache:client:secret:<clientSecret>`
- **AND** 响应 SHALL 返回 ClientDto

#### Scenario: 更新客户端标识或密钥后清理旧缓存
- **WHEN** 管理端更新 client 且 clientCode 或 clientSecret 发生变化
- **THEN** 系统 SHALL 删除旧 `cache:client:code:<oldClientCode>` 或旧 `cache:client:secret:<oldClientSecret>` key
- **AND** 系统 SHALL 写入新 `cache:client:code:<newClientCode>` 与 `cache:client:secret:<newClientSecret>` key
- **AND** 旧 clientCode 或旧 clientSecret 后续 SHALL 不再因 Redis 缓存命中而解析为有效 client

### Requirement: Client redirect URL patterns are validated on write
系统 SHALL 在管理端创建或更新 client 时校验 `validRedirectUrls` 中每一条 redirect URL pattern。

#### Scenario: Valid redirect URL patterns are accepted
- **WHEN** 管理端创建或更新 client 且 `validRedirectUrls` 包含合法 pattern
- **THEN** Admin API SHALL 接受该 client 输入
- **AND** 系统 SHALL 保持 `validRedirectUrls` 的存储结构为 `string[]`

#### Scenario: Invalid redirect URL pattern is rejected
- **WHEN** 管理端创建或更新 client 且 `validRedirectUrls` 包含非法 pattern
- **THEN** Admin API SHALL 拒绝该请求
- **AND** 错误信息 SHALL 指明存在非法 redirect URL pattern

#### Scenario: Admin UI explains supported redirect patterns
- **WHEN** 管理员编辑 client 的 `validRedirectUrls`
- **THEN** 管理端页面 SHALL 提示支持 origin、一级子域 wildcard 和 path 末尾 `/*`
- **AND** 管理端页面 SHALL NOT 复制完整运行时 matcher 作为权威校验

### Requirement: Redirect URL pattern syntax is constrained
系统 SHALL 仅支持受限 URL pattern，以避免任意正则或过宽通配导致 redirectUrl 误放行。

#### Scenario: Exact origin and path pattern
- **WHEN** pattern 为 `http` 或 `https` URL 且不包含 wildcard
- **THEN** pattern SHALL 要求 redirectUrl 的 protocol、hostname 和 port 与 pattern 一致
- **AND** pattern path SHALL 按 path segment 边界匹配该 path 节点及其子树

#### Scenario: Host wildcard pattern
- **WHEN** pattern hostname 使用 `*.example.com`
- **THEN** pattern SHALL 只匹配 `example.com` 下一级子域
- **AND** pattern MUST NOT 匹配根域 `example.com`
- **AND** pattern MUST NOT 匹配多级子域

#### Scenario: Path wildcard pattern
- **WHEN** pattern pathname 以 `/*` 结尾
- **THEN** pattern SHALL 匹配该 path 下的子路径
- **AND** pattern SHALL NOT 匹配不带尾斜杠的基路径

#### Scenario: Unsupported wildcard syntax is invalid
- **WHEN** pattern 使用协议通配、端口通配、host 中间通配、path 中间通配、裸 `*` 或过宽 host wildcard
- **THEN** pattern SHALL 被判定为非法

#### Scenario: Query and hash are not allowed in patterns
- **WHEN** pattern 包含 query 或 hash
- **THEN** pattern SHALL 被判定为非法
- **AND** redirectUrl 自身的 query 或 hash SHALL NOT 参与白名单匹配

#### Scenario: HTTP redirect URLs are allowed
- **WHEN** pattern 和 redirectUrl 均使用 `http`
- **THEN** 系统 SHALL 允许该协议参与匹配
- **AND** 系统 SHALL NOT 因 redirectUrl 使用 `http` 而拒绝

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

#### Scenario: SSO redirect pattern 校验
- **WHEN** SSO authorize 或 callback 校验 redirectUrl
- **THEN** 系统 SHALL 要求 redirectUrl 命中 client.extAttributes.validRedirectUrls 中任一合法 redirect URL pattern
- **AND** 系统 SHALL 使用结构化 URL 语义匹配 protocol、hostname、port 和 pathname
- **AND** 系统 SHALL NOT 使用纯字符串 `startsWith` 作为 redirectUrl 校验语义

#### Scenario: 历史非法 pattern 按不匹配处理
- **WHEN** SSO authorize 或 callback 运行时读取到非法 redirect URL pattern
- **THEN** 系统 SHALL 跳过该 pattern 并记录结构化 warn 日志
- **AND** 若没有其他合法 pattern 匹配 redirectUrl，系统 SHALL 返回非法重定向地址错误

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

### Requirement: 管理端 client 变更撤销 Session Kernel 会话
系统 SHALL 在管理端 client 状态、删除、secret 和 custom SSO 会话相关配置变化后，通过 Session Kernel 主动撤销受影响 client 的会话对象。

#### Scenario: client 被禁用后撤销全部协议对象
- **WHEN** 管理员将 client status 变更为 `Disable`
- **THEN** 系统 SHALL 在 client 事务成功提交且 client cache 同步任务注册后，注册 best-effort Session Kernel 撤销任务
- **AND** 撤销任务 SHALL 调用 admin-api Session Revocation port 撤销该 `clientCode` 下全部协议对象
- **AND** revocation reason SHALL 为 `client_disabled`
- **AND** 撤销范围 SHALL 包含该 client 的 custom SSO ClientBinding、IssuedCredential、ProtocolArtifact 和 OIDC protocol 对象

#### Scenario: client 被软删除后撤销全部协议对象
- **WHEN** 管理员软删除 client 且事务成功提交
- **THEN** 系统 SHALL 继续删除该 client code 和 secret 的 runtime cache
- **AND** 系统 SHALL 注册 best-effort Session Kernel 撤销任务撤销该 `clientCode` 下全部协议对象
- **AND** revocation reason SHALL 为 `client_deleted`

#### Scenario: custom SSO 会话相关配置变化后撤销 custom-sso 对象
- **WHEN** 管理员更新 client 且 `clientSecret`、`extAttributes.validRedirectUrls`、`extAttributes.callbackEndpoint`、`extAttributes.logoutEndpoint`、`extAttributes.managementLevel` 或 `extAttributes.requireOrcas` 发生变化
- **THEN** 系统 SHALL 在事务成功提交后注册 best-effort Session Kernel 撤销任务
- **AND** 撤销任务 SHALL 只撤销该 `clientCode` 下 `protocol=custom-sso` 的 active ClientBinding、IssuedCredential 和 ProtocolArtifact
- **AND** revocation reason SHALL 为 `client_config_changed`
- **AND** 系统 SHALL NOT 因该 custom SSO 配置变化撤销其他 client 的会话对象

#### Scenario: custom SSO maintenance 不主动撤销 local session
- **WHEN** 管理员将 client status 变更为 `Maintance`
- **THEN** 系统 SHALL 保持 custom SSO maintenance 的运行时拒绝语义
- **AND** 系统 SHALL NOT 仅因 custom SSO maintenance 主动撤销该 client 的 custom-sso local session credential
- **AND** OIDC protocol 对象撤销 SHALL 由 `oidc-client-registry` 能力处理

#### Scenario: 非会话相关 client 字段变化不触发 custom-sso 撤销
- **WHEN** 管理员只更新 clientName、description、url、orderNum 或其他不影响会话有效性的展示字段
- **THEN** 系统 SHALL 继续同步 client runtime cache
- **AND** 系统 SHALL NOT 注册 custom-sso Session Kernel 撤销任务

#### Scenario: client 撤销失败不阻断 cache 同步和业务结果
- **WHEN** client 更新或删除事务已经提交
- **AND** Session Kernel revoke 或 adapter cleanup 失败
- **THEN** 系统 SHALL 保持 client cache required afterCommit 语义
- **AND** 管理端操作 SHALL 不因 best-effort session revoke failure 回滚或改为业务失败
- **AND** 系统 SHALL 记录包含 RevokeSummary 的 system log

#### Scenario: client 服务测试覆盖撤销触发
- **WHEN** 执行 admin-api client 服务单元测试
- **THEN** 测试 SHALL 覆盖 status Disable、soft delete、clientSecret rotation 和 custom SSO 会话相关 extAttributes 变化触发撤销
- **AND** 测试 SHALL 覆盖 status Maintance 不主动撤销 custom-sso local session
- **AND** 测试 SHALL 覆盖非会话字段更新不触发撤销

## Open Questions
- 当前公开 `/open/client/status` 返回完整 ClientDto，可能包含 clientSecret；安全审计已将其标为风险，是否保留为目标行为需要单独整改确认。
- client 查询 repository 当前不按 `status` 或 `isDelete` 过滤；禁用或软删除 client 是否仍可被缓存/解析需要确认。
- 管理端 client create/update 当前显式校验重复 clientCode；clientSecret 是否允许重复需要单独确认。

## Evidence Review
- 客户端记录包含 SSO 和会话管理属性: 证据 `packages/db/src/schema/core/clients.ts`, `packages/contracts/src/enums/client.status.ts`, `packages/contracts/src/enums/client.managementLevel.ts`, `packages/domain/src/client/schema.ts`。状态: 有 schema 证据。
- 管理端查询和维护客户端: 证据 `apps/admin-api/src/routes/admin/client/client.ops.ts`, `client.routes.ts`, `client.handlers.ts`, `client.trpc.ts`, `apps/admin-api/src/services/client/client.service.ts`, `client.repository.ts`, `apps/admin/src/pages/clients/index.tsx`。状态: 有代码和测试证据。
- 管理端创建和更新客户端: 证据 `apps/admin-api/src/routes/admin/client/client.ops.ts`, `client.routes.ts`, `client.handlers.ts`, `client.trpc.ts`, `apps/admin-api/src/services/client/client.service.ts`, `client.repository.ts`。状态: 有 REST 与 tRPC 代码证据。
- 公共 API 按 clientCode 返回客户端信息: 证据 `apps/api/src/routes/open/open.routes.ts`, `apps/api/src/routes/open/open.handlers.ts`, `apps/api/src/services/client/client.service.ts`。状态: 有代码证据；含敏感字段风险。
- 系统按 clientCode 和 clientSecret 解析客户端: 证据 `apps/api/src/services/client/client.service.ts`, `apps/api/src/services/client/client.repository.ts`, `apps/api/src/routes/auth/auth.handlers.ts`, `apps/api/src/routes/sso/sso.service.ts`。状态: 有代码证据。
- 客户端配置影响 SSO 和鉴权行为: 证据 `apps/api/src/routes/sso/sso.handlers.ts`, `apps/api/src/routes/sso/sso.service.ts`, `apps/api/src/routes/auth/auth.service.ts`, `packages/db/src/schema/core/clients.ts`。状态: 有代码证据；redirect/token 安全性需另行确认。
