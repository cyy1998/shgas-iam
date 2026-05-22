## ADDED Requirements

### Requirement: Gateway manifests are repository managed

系统 SHALL 在仓库中提供 APISIX manifest 目录，用于声明各环境的 IAM 基础 routes、upstreams、services、plugin-configs、consumers、ssl 配置、默认策略、策略模板和环境约束。

#### Scenario: Manifest directory exists

- **WHEN** 开发者查看 `gateway/apisix/manifests`
- **THEN** 系统 SHALL 提供按环境分层的 manifest 目录
- **AND** 每个环境 SHALL 能表达 APISIX 基础路由、upstream、service、插件配置、consumer、证书对象和策略模板

#### Scenario: Manifest does not register third-party instances

- **WHEN** 开发者查看仓库 manifest
- **THEN** manifest MUST NOT 将每一个第三方业务应用实例作为实时注册事实来源
- **AND** manifest SHALL 只保留基础路由、默认策略、策略模板、环境约束或非敏感样例

#### Scenario: Manifest excludes secrets

- **WHEN** manifest 中出现 Admin API key、JWT secret、TLS private key、数据库密码或第三方系统密钥
- **THEN** 校验 SHALL 失败
- **AND** 错误信息 SHALL 指出敏感字段所在文件和路径

### Requirement: Gateway sync validates manifests

系统 SHALL 提供 APISIX manifest 校验能力，在同步前验证文件格式、必填字段、对象 ID、引用关系和环境约束。

#### Scenario: Valid manifest passes validation

- **WHEN** 开发者对合法 manifest 执行校验命令
- **THEN** 系统 SHALL 返回校验成功
- **AND** 不 SHALL 调用 APISIX Admin API 修改远端配置

#### Scenario: Broken reference fails validation

- **WHEN** route 引用了不存在的 upstream、service 或 plugin-config
- **THEN** 校验 SHALL 失败
- **AND** 错误信息 SHALL 包含引用方对象 ID 和缺失目标 ID

### Requirement: Gateway sync diffs repository and remote state

系统 SHALL 提供 diff 能力，对比仓库 manifest 与目标 APISIX Admin API 返回的远端配置。

#### Scenario: Diff shows changed managed objects

- **WHEN** 远端 APISIX 中受仓库管理的对象与 manifest 不一致
- **THEN** diff SHALL 展示新增、修改和删除候选对象
- **AND** diff SHALL 标明对象类型、对象 ID 和目标环境

#### Scenario: Diff ignores unmanaged objects by default

- **WHEN** 远端 APISIX 存在未带仓库归属标记的对象
- **THEN** diff 默认 SHALL 不将这些对象列为待删除对象
- **AND** 输出 SHALL 提示这些对象不由当前仓库 manifest 管理

#### Scenario: Diff ignores dynamic registry objects

- **WHEN** 远端 APISIX 存在 `labels.source=dynamic-registry` 的对象
- **THEN** diff 默认 MUST NOT 将这些对象列为 manifest 漂移或删除候选
- **AND** 输出 SHALL 标明这些对象由 IAM 动态注册流程管理

### Requirement: Gateway sync applies manifests through APISIX Admin API

系统 SHALL 通过 APISIX Admin API 将通过校验的 manifest 同步到目标 APISIX。

#### Scenario: Dry run does not modify APISIX

- **WHEN** 开发者执行 dry-run apply
- **THEN** 系统 SHALL 完成校验并展示计划变更
- **AND** 系统 MUST NOT 向 APISIX Admin API 发送写入或删除请求

#### Scenario: Apply updates managed objects

- **WHEN** 开发者执行 apply 且 manifest 通过校验
- **THEN** 系统 SHALL 通过 APISIX Admin API 创建或更新受仓库管理的对象
- **AND** 写入对象 SHALL 包含 `managed_by=shgas-iam` 和 `source=repo-manifest` 归属标记

#### Scenario: Prune requires explicit opt-in

- **WHEN** manifest 删除了一个远端已存在的受仓库管理对象
- **THEN** apply 默认 MUST NOT 删除该远端对象
- **AND** 只有显式启用 prune 时系统 SHALL 删除该对象

#### Scenario: Apply does not modify dynamic registry objects

- **WHEN** 远端 APISIX 对象包含 `labels.source=dynamic-registry`
- **THEN** 仓库 apply MUST NOT 更新或删除该对象
- **AND** 该对象 SHALL 由 IAM 动态注册流程通过 APISIX Admin API 管理

### Requirement: Dynamic third-party gateway ownership is separated

系统 SHALL 明确第三方业务应用实例由 IAM 运行时状态管理，并通过 APISIX Admin API 热更新到 APISIX。

#### Scenario: Dynamic object ownership is labeled

- **WHEN** IAM 动态注册流程向 APISIX 写入第三方业务应用 route、upstream 或 plugin-config
- **THEN** 写入对象 SHALL 包含 `managed_by=shgas-iam` 和 `source=dynamic-registry`
- **AND** 写入对象 SHALL 包含可追踪的 `app_code` 和 `config_version`

#### Scenario: Third-party application uses policy templates

- **WHEN** 第三方业务应用申请网关认证、限流或 CORS 策略
- **THEN** IAM SHALL 从平台定义的策略模板中选择或展开 APISIX 配置
- **AND** 第三方业务应用 MUST NOT 直接提交任意 APISIX plugin 配置

### Requirement: Local development runs through APISIX

系统 SHALL 在本地开发编排中提供 APISIX 和 etcd 服务，使开发者能够通过网关入口访问 IAM 公共 API、管理 API、SSO 前端和管理前端。

#### Scenario: Public API routes through gateway

- **WHEN** 本地开发环境启动 APISIX、etcd、`api` 和 `admin-api`
- **THEN** `/api/iam/public/*`、`/api/iam/open/*`、`/api/iam/internal/*`、`/sso/*` 和 `/api/iam/auth/*` 请求 SHALL 经 APISIX 转发到 `api`

#### Scenario: Admin API routes through gateway

- **WHEN** 本地开发环境启动 APISIX、etcd、`api` 和 `admin-api`
- **THEN** `/api/iam/admin/*` 和 `/api/iam/rpc/*` 请求 SHALL 经 APISIX 转发到 `admin-api`

#### Scenario: SSO frontend routes through gateway

- **WHEN** 本地开发环境启动 APISIX、etcd 和 `sso`
- **THEN** `/portal` 和 `/portal/*` 请求 SHALL 经 APISIX 转发到 `sso`

#### Scenario: Admin frontend routes through gateway

- **WHEN** 本地开发环境启动 APISIX、etcd 和 `admin`
- **THEN** `/iam-admin` 和 `/iam-admin/*` 请求 SHALL 经 APISIX 转发到 `admin`

### Requirement: Frontends are packaged as nginx static containers

系统 SHALL 将 SSO 前端和管理前端构建为 nginx 静态容器，并保持前端根路径与 Umi 配置一致。

#### Scenario: SSO frontend container serves portal root

- **WHEN** `apps/sso` 镜像构建完成并运行
- **THEN** 容器 SHALL 在 `/portal` 和 `/portal/*` 服务 SSO 前端
- **AND** 容器 SHALL 为 SPA 子路径 fallback 到 `/portal/index.html`

#### Scenario: Admin frontend container serves admin root

- **WHEN** `apps/admin` 镜像构建完成并运行
- **THEN** 容器 SHALL 在 `/iam-admin` 和 `/iam-admin/*` 服务管理前端
- **AND** 容器 SHALL 为 SPA 子路径 fallback 到 `/iam-admin/index.html`

### Requirement: Production gateway deployment is externally configurable

系统 SHALL 提供生产 APISIX 部署模板，并要求生产密钥、Admin API key、TLS 私钥和环境差异通过外部环境变量或 secret 注入。

#### Scenario: Production template avoids hard-coded secrets

- **WHEN** 开发者查看生产 APISIX compose 模板和配置示例
- **THEN** 文件 MUST NOT 包含真实 Admin API key、TLS private key、JWT secret 或第三方系统密钥
- **AND** 文件 SHALL 使用占位符、环境变量或 secret 引用表达这些值

#### Scenario: Admin API access is constrained

- **WHEN** 生产 APISIX 配置启用 Admin API
- **THEN** 配置 SHALL 明确 Admin API key 来源
- **AND** 配置 SHALL 提供限制监听地址或允许来源的方式

### Requirement: Gateway documentation defines operating workflow

系统 SHALL 提供网关配置管理文档，说明 manifest 编写、校验、diff、apply、dry-run、prune、密钥边界和回滚流程。

#### Scenario: Developer follows documented baseline sync workflow

- **WHEN** 开发者需要新增或修改 IAM 基础路由、默认策略、策略模板或环境约束
- **THEN** 文档 SHALL 指导其修改 manifest、执行校验、查看 diff、执行 dry-run 和提交 review

#### Scenario: Developer follows documented dynamic registry boundary

- **WHEN** 开发者需要新增或修改第三方业务应用实例
- **THEN** 文档 SHALL 指导其通过 IAM 动态注册流程管理
- **AND** 文档 SHALL 说明仓库 manifest 不作为第三方业务应用实例的实时注册入口

#### Scenario: Operator follows rollback workflow

- **WHEN** 网关配置发布后出现异常
- **THEN** 文档 SHALL 提供基于 Git 回滚和重新 apply 的恢复步骤
- **AND** 文档 SHALL 说明如何使用 APISIX 远端配置导出作为应急恢复输入
