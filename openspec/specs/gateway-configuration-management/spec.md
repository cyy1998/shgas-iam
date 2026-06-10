# gateway-configuration-management Specification

## Purpose
描述仓库管理的 APISIX 网关基线配置、同步脚本、本地和生产部署模板，以及与 IAM 动态注册网关对象的边界。
## Requirements
### Requirement: APISIX gateway tools are managed as a workspace package

系统 SHALL 将 `gateway/apisix` 作为私有 pnpm workspace package 管理，使 APISIX manifest 同步工具拥有明确的脚本入口、依赖声明和验证生命周期。

#### Scenario: Workspace discovers APISIX gateway package

- **WHEN** 开发者查看 workspace package 配置
- **THEN** `gateway/apisix` SHALL 被 pnpm workspace 发现为 package
- **AND** 该 package SHALL 使用私有 package 名称标识 APISIX gateway 工具边界

#### Scenario: Package provides gateway sync commands

- **WHEN** 开发者进入 APISIX gateway package 或使用 pnpm filter 调用 package 脚本
- **THEN** package SHALL 提供 `apisix`、`validate`、`diff` 和 `apply` 脚本来执行 APISIX manifest 同步 CLI
- **AND** `validate`、`diff` 和 `apply` SHALL 分别调用同名 CLI 子命令
- **AND** 这些脚本 SHALL 支持 `--` 后参数透传方式

#### Scenario: Package participates in validation lifecycle

- **WHEN** 开发者运行 APISIX gateway package 的验证命令
- **THEN** package SHALL 提供 `test`、`lint` 和 `typecheck` 脚本
- **AND** 这些脚本 SHALL 能被 Turbo workspace 任务发现并执行

#### Scenario: Root gateway commands remain compatible

- **WHEN** 开发者运行根级 `pnpm gateway:apisix:validate`、`pnpm gateway:apisix:diff` 或 `pnpm gateway:apisix:apply`
- **THEN** 命令 SHALL 委托到 APISIX gateway package
- **AND** 命令 SHALL 继续支持现有 `--` 后参数透传方式

### Requirement: Gateway sync CLI requires explicit app scope

系统 SHALL 要求 APISIX sync CLI 的 `validate`、`diff` 和 `apply` 命令在运行时使用显式 app scope，scope MUST 使用 `<env>:<app>` 格式。

#### Scenario: Command uses explicit CLI scope

- **WHEN** 开发者运行 APISIX sync CLI 并传入 `--env prod:iam`
- **THEN** 系统 SHALL 使用 `prod:iam` 作为 manifest scope
- **AND** 系统 SHALL 从 `gateway/apisix/manifests/prod/iam` 或显式 `--manifest-dir` 加载 manifest

#### Scenario: Command uses environment scope

- **WHEN** 开发者未传入 `--env` 但设置了 `APISIX_MANIFEST_ENV=prod:tender`
- **THEN** 系统 SHALL 使用 `prod:tender` 作为 manifest scope

#### Scenario: Missing scope fails

- **WHEN** 开发者运行 `validate`、`diff` 或 `apply` 且未传入 `--env` 也未设置 `APISIX_MANIFEST_ENV`
- **THEN** 命令 MUST 失败
- **AND** 错误信息 SHALL 指出必须提供 `--env <env:app>` 或 `APISIX_MANIFEST_ENV`

#### Scenario: Env-only scope fails

- **WHEN** 开发者传入 `--env dev`
- **THEN** 命令 MUST 失败
- **AND** 错误信息 SHALL 指出 scope 必须使用 `<env>:<app>` 格式

#### Scenario: Invalid scope segment fails

- **WHEN** 开发者传入包含大写字母、空片段、路径片段或非法字符的 scope
- **THEN** 命令 MUST 失败
- **AND** 错误信息 SHALL 指出 `env` 和 `app` 只能使用小写字母、数字和短横线

### Requirement: Gateway sync JSON output uses normalized change lists

系统 SHALL 为 APISIX sync CLI 的 JSON 输出提供统一、可程序消费的 change list 结构。

#### Scenario: Diff JSON reports ignored changes with reasons

- **WHEN** 开发者运行 `diff --json`
- **THEN** 输出 SHALL 包含 `creates`、`updates`、`deletes` 和 `ignored` 数组
- **AND** `ignored` 中的每一项 SHALL 包含 `kind`、`id` 和 `reason`
- **AND** `reason` MUST 为 `dynamic`、`out_of_scope` 或 `unmanaged`
- **AND** 输出 MUST NOT 包含 `ignoredDynamic`、`ignoredOutOfScope` 或 `ignoredUnmanaged`

#### Scenario: Apply JSON reports applied actions as a list

- **WHEN** 开发者运行 `apply --json`
- **THEN** 输出 SHALL 包含 `creates`、`updates`、`deletes`、`ignored`、`dryRun`、`prune` 和 `applied`
- **AND** `applied` SHALL 是数组
- **AND** `applied` 中的每一项 SHALL 包含 `kind`、`id` 和 `action`
- **AND** `action` MUST 为 `create`、`update` 或 `delete`

#### Scenario: Dry-run apply reports no applied actions

- **WHEN** 开发者运行 `apply --json --dry-run`
- **THEN** 输出 SHALL 包含 `dryRun: true`
- **AND** 输出 SHALL 包含 `applied: []`

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

### Requirement: Repository API routes SHALL use IP-based smooth rate limiting

系统 SHALL 在仓库管理的 `dev` 和 `prod` APISIX manifest 中，为 `iam`、`tender` 和 `gds` 的 API routes 绑定基于 `plugin_config` 的 IP 平滑限流策略。

#### Scenario: Ordinary API routes have default IP limit

- **WHEN** 开发者查看 `dev` 或 `prod` 的 `iam`、`tender`、`gds` API route manifest
- **THEN** 普通 API route SHALL 绑定包含 `limit-req` 的 `plugin_config_id`
- **AND** 该 `limit-req` SHALL 使用 `rate: 10`、`burst: 20`、`rejected_code: 429`、`key_type: var`、`key: remote_addr` 和 `policy: local`

#### Scenario: API route plugins are preserved

- **WHEN** API route 已经直接配置 `forward-auth`、`proxy-rewrite` 或其他 route 级 `plugins`
- **THEN** 新增限流策略 SHALL 通过 `plugin_config_id` 合并到该 route
- **AND** 实施 MUST NOT 删除或改写既有认证、转发改写或上游配置

### Requirement: Gateway API limiting SHALL normalize real client IPs from trusted proxy

系统 SHALL 在 API 限流 `plugin_config` 中配置真实 IP 解析，使外网经腾讯云 Nginx 访问时按真实客户端 IP 限流，内网直连访问时按 APISIX 看到的来源 IP 限流。

#### Scenario: External proxy supplies X-Forwarded-For

- **WHEN** 请求来自可信腾讯云 Nginx 出口 CIDR 并携带 `X-Forwarded-For`
- **THEN** API 限流策略 SHALL 通过 `real-ip.source: http_x_forwarded_for` 解析真实客户端 IP
- **AND** `limit-req` SHALL 按解析后的 `remote_addr` 计数

#### Scenario: Direct internal access keeps peer address

- **WHEN** 请求不来自可信腾讯云 Nginx 出口 CIDR
- **THEN** API 限流策略 MUST NOT 信任请求自带的 `X-Forwarded-For`
- **AND** `limit-req` SHALL 按 APISIX 看到的直接来源 IP 计数

#### Scenario: Trusted proxy CIDR is constrained

- **WHEN** 生产 manifest 渲染 API 限流策略
- **THEN** `real-ip.trusted_addresses` SHALL 由生产环境变量或 secret 注入
- **AND** `real-ip.trusted_addresses` MUST NOT 使用 `0.0.0.0/0` 作为可信代理范围

### Requirement: IAM internal API route SHALL use relaxed IP limit

系统 SHALL 对 `iam` 内部互调 API route 使用独立的、更宽松的 IP 平滑限流策略。

#### Scenario: Internal route uses relaxed limit

- **WHEN** 开发者查看 `iam-internal-dev` 或 `iam-internal-prod` route
- **THEN** route SHALL 绑定内部 API 专用 `plugin_config_id`
- **AND** 该 `plugin_config` SHALL 使用 `limit-req` 的 `rate: 50`、`burst: 100`、`rejected_code: 429`、`key_type: var`、`key: remote_addr` 和 `policy: local`

#### Scenario: Internal route does not require source whitelist

- **WHEN** 内部系统调用 `/api/iam/internal/*`
- **THEN** 仓库基线限流策略 SHALL NOT 要求来源 IP 白名单
- **AND** 该 route SHALL 继续通过内部认证或已有安全边界控制访问权限

### Requirement: SSO API policy SHALL combine CORS and rate limiting

系统 SHALL 为 IAM SSO API route 使用合并后的专用 `plugin_config`，同时保留 CORS 策略并启用 API IP 限流。

#### Scenario: SSO route has one combined plugin config

- **WHEN** 开发者查看 `iam-sso-dev` 或 `iam-sso-prod` route
- **THEN** route SHALL 只引用一个 SSO 专用 `plugin_config_id`
- **AND** 该 `plugin_config` SHALL 同时包含原有 `cors` 策略、`real-ip` 策略和普通 API `limit-req` 策略

#### Scenario: SSO CORS behavior is preserved

- **WHEN** SSO 浏览器端点需要跨域访问
- **THEN** 合并后的 SSO `plugin_config` SHALL 保留原 manifest 中的 CORS allow origins、headers、methods、credentials 和 max age 语义

### Requirement: Non-API gateway routes SHALL be excluded from API IP limiting

系统 SHALL 只对 API routes 启用本变更的 IP 限流策略，避免影响前端页面、静态资源、文件服务或 Webroot 入口。

#### Scenario: Frontend routes are not rate limited by API policy

- **WHEN** 开发者查看 `/portal`、`/portal/*`、`/iam-admin`、`/iam-admin/*`、`/tender`、`/tender/*`、`/tender-portal`、`/tender-portal/*`、`/data-platform` 或 `/data-platform/*` routes
- **THEN** 这些 routes SHALL NOT 绑定本变更新增的 API IP 限流 `plugin_config_id`

#### Scenario: File and webroot routes are not rate limited by API policy

- **WHEN** 开发者查看 Tender `/minio/*` route 或 GDS `/webroot/*` route
- **THEN** 这些 routes SHALL NOT 绑定本变更新增的 API IP 限流 `plugin_config_id`

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

### Requirement: Gateway documentation SHALL describe API IP rate limiting operations

系统 SHALL 在 APISIX 网关配置管理文档中说明 API IP 限流策略、真实 IP 解析要求、验证命令和多节点注意事项。

#### Scenario: Developer follows documented validation workflow

- **WHEN** 开发者修改 API IP 限流相关 manifest
- **THEN** 文档 SHALL 指导其分别对 `dev` 和 `prod` 的 `iam`、`tender`、`gds` 执行 `validate`
- **AND** 生产发布前 SHALL 执行 `diff` 和 `apply --dry-run`

#### Scenario: Operator reviews production proxy prerequisites

- **WHEN** 运维人员准备发布生产 API IP 限流策略
- **THEN** 文档 SHALL 要求确认腾讯云 Nginx 出口 CIDR 固定且最小化
- **AND** 文档 SHALL 说明 APISIX 多节点部署前必须从 `policy: local` 重新评估为 Redis 或 redis-cluster 策略
