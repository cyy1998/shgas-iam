## ADDED Requirements

### Requirement: Gateway manifests SHALL use app-centric single-file source schema

系统 SHALL 将仓库管理的 APISIX manifest 源文件组织为 `gateway/manifests/<env>/<app>.yaml`，每个文件描述一个 app scope 的 service、upstreams、routes、consumers 和 ssls。

#### Scenario: Default scope loads single app manifest file

- **WHEN** 开发者运行 APISIX sync CLI 并传入 `--env dev:tender`
- **THEN** 系统 SHALL 默认从 `gateway/manifests/dev/tender.yaml` 加载 manifest
- **AND** 系统 MUST NOT 从 `gateway/manifests/dev/tender/` 旧目录加载 manifest

#### Scenario: Source manifest has exactly one generated service

- **WHEN** 系统加载 `gateway/manifests/prod/gds.yaml`
- **THEN** 源 manifest SHALL 包含且只包含一个顶层 `service` 对象
- **AND** materialized APISIX service id SHALL 为 `gds.prod`
- **AND** materialized APISIX service MUST NOT 绑定默认 `upstream_id`

#### Scenario: Source manifest uses local keys

- **WHEN** 源 manifest 声明 upstream、route 或 service plugin_config
- **THEN** 每个对象 SHALL 使用 `key` 标识本地名称
- **AND** `key` MUST 匹配 kebab-case segment
- **AND** 同一资源类型内 `key` MUST 唯一

#### Scenario: Generated APISIX fields are forbidden in source

- **WHEN** 源 manifest 对象声明 `id`、`name`、`service_id`、`upstream_id` 或 `plugin_config_id`
- **THEN** manifest 校验 MUST 失败
- **AND** 错误信息 SHALL 指向对应源 manifest 文件和字段路径

### Requirement: Gateway manifest materialization SHALL generate APISIX resources

系统 SHALL 将 app-centric source manifest materialize 为 APISIX Admin API 使用的平级 `routes`、`upstreams`、`services`、`plugin_configs`、`consumers` 和 `ssls` resources。

#### Scenario: Materialized ids use dot naming

- **WHEN** scope 为 `prod:tender` 且 route `key` 为 `api`
- **THEN** materialized route id 和 name SHALL 为 `tender.api.prod`
- **AND** 同名 upstream key materialized 后 upstream id 和 name SHALL 为 `tender.api.prod`
- **AND** 不同资源类型 MAY 使用相同 materialized id 字符串

#### Scenario: Route references local upstream

- **WHEN** 源 route 声明 `upstream: admin-api` 且 scope 为 `dev:iam`
- **THEN** materialized route SHALL 包含 `service_id: iam.dev`
- **AND** materialized route SHALL 包含 `upstream_id: iam.admin-api.dev`

#### Scenario: Terminal route is not attached to service or upstream

- **WHEN** 源 route 声明 `terminal: true`
- **THEN** materialized route MUST NOT 包含 `service_id`
- **AND** materialized route MUST NOT 包含 `upstream_id`
- **AND** materialized route MUST NOT 包含 `terminal`

#### Scenario: Non-terminal route requires upstream

- **WHEN** 源 route 未声明 `terminal: true`
- **THEN** 源 route MUST 声明 `upstream`
- **AND** `upstream` MUST 引用同一 manifest 文件内存在的 upstream key

#### Scenario: Service plugin configs expand to flat resources

- **WHEN** 源 service 声明 `plugin_configs` 且其中一个 key 为 `api-ip-rate-limit`
- **THEN** materialized APISIX resources SHALL 包含 id 为 `<app>.api-ip-rate-limit.<env>` 的 `plugin_config`
- **AND** 引用 `plugin_config: api-ip-rate-limit` 的 route SHALL materialize 为对应 `plugin_config_id`

#### Scenario: Consumers and ssls are optional flat source lists

- **WHEN** 源 manifest 省略 `consumers` 或 `ssls`
- **THEN** 系统 SHALL 将缺省资源视为空列表
- **AND** 源 manifest MAY 使用顶层 `consumers` 或 `ssls` 列表声明对应 APISIX resources

### Requirement: Gateway manifest labels SHALL be injected by loader

系统 SHALL 自动为 repository-managed materialized APISIX 对象注入基础 ownership 和 scope labels，并允许源 manifest 合并非保留 labels。

#### Scenario: Loader injects repo ownership labels

- **WHEN** 系统 materialize `gateway/manifests/dev/iam.yaml`
- **THEN** 每个 materialized APISIX 对象 SHALL 包含 `labels.managed_by=shgas-iam`
- **AND** 每个对象 SHALL 包含 `labels.source=repo-manifest`
- **AND** 每个对象 SHALL 包含 `labels.env=dev`
- **AND** 每个对象 SHALL 包含 `labels.app=iam`

#### Scenario: Source labels cannot override reserved labels

- **WHEN** 源 manifest 对象声明 `labels.managed_by`、`labels.source`、`labels.env` 或 `labels.app`
- **THEN** manifest 校验 MUST 失败
- **AND** 错误信息 SHALL 指出 reserved label 不能在源 manifest 中覆盖

#### Scenario: Source labels may add business metadata

- **WHEN** 源 manifest 对象声明非保留 label
- **THEN** materialized APISIX 对象 SHALL 保留该 label
- **AND** 系统 SHALL 同时注入基础 ownership 和 scope labels

### Requirement: Gateway app manifests SHALL preserve route behavior during materialization

系统 SHALL 在 app-centric manifest 迁移后保持现有仓库管理 route 的匹配条件、转发目标、认证、重写、限流和 SSO 入口网络语义。

#### Scenario: Route matching fields are preserved

- **WHEN** 系统 materialize 从旧 manifest 迁移而来的 route
- **THEN** route 的 `uri` 或 `uris` SHALL 保持原有匹配语义
- **AND** route 的 `hosts`、`methods` 和 `vars` SHALL 保持原有匹配语义

#### Scenario: Route plugin behavior is preserved

- **WHEN** 迁移后的 route 包含 `forward-auth`、`proxy-rewrite`、`redirect`、`cors` 或限流相关配置
- **THEN** materialized APISIX resources SHALL 保持迁移前同等插件行为
- **AND** route-specific 插件 MUST NOT 被提升到 app service 导致影响同 app 下其他 routes

#### Scenario: Existing special upstream overrides are preserved

- **WHEN** Tender 或 GDS 的生产 manifest 使用外部 frontend、MinIO 或 dashboard 专用 upstream
- **THEN** 迁移后的 route SHALL 继续显式引用对应 upstream
- **AND** 这些 route SHALL 仍挂载到当前 app 的唯一 APISIX service

### Requirement: Gateway dot-id migration SHALL require prune

系统 SHALL 将本次 app-centric manifest 迁移视为 APISIX repo-managed 对象 id rename，并在发布说明中要求首次迁移 apply 显式启用 prune。

#### Scenario: Migration dry-run includes creates and deletes

- **WHEN** 远端 APISIX 仍存在旧 kebab id 的 repo-managed 对象且新 manifest 使用 dot id
- **THEN** `diff` 或 `apply --dry-run --prune` SHALL 将新 dot id 对象列为 create 或 update
- **AND** SHALL 将同 scope 旧 kebab id repo-managed 对象列为 delete

#### Scenario: Migration apply without prune does not remove old ids

- **WHEN** 开发者执行迁移 apply 但未传入 `--prune`
- **THEN** 系统 MUST NOT 删除旧 kebab id repo-managed 对象
- **AND** 发布文档 SHALL 要求首次迁移发布使用 `--prune`

## MODIFIED Requirements

### Requirement: Gateway sync CLI requires explicit app scope

系统 SHALL 要求 APISIX sync CLI 的 `validate`、`diff` 和 `apply` 命令在运行时使用显式 app scope，scope MUST 使用 `<env>:<app>` 格式。

#### Scenario: Command uses explicit CLI scope

- **WHEN** 开发者运行 APISIX sync CLI 并传入 `--env prod:iam`
- **THEN** 系统 SHALL 使用 `prod:iam` 作为 manifest scope
- **AND** 系统 SHALL 从 `gateway/manifests/prod/iam.yaml` 或显式 `--manifest` 加载 manifest

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

### Requirement: Gateway manifests are repository managed

系统 SHALL 在仓库中提供 APISIX manifest 文件，用于声明各环境的 IAM 基础 routes、upstreams、service、plugin-configs、consumers、ssl 配置、默认策略、策略模板和环境约束。

#### Scenario: Manifest files exist

- **WHEN** 开发者查看 `gateway/manifests`
- **THEN** 系统 SHALL 提供按环境分层的 app manifest 文件
- **AND** 每个 app manifest SHALL 能表达 APISIX 基础路由、upstream、service、插件配置、consumer、证书对象和策略模板

#### Scenario: Manifest does not register third-party instances

- **WHEN** 开发者查看仓库 manifest
- **THEN** manifest MUST NOT 将每一个第三方业务应用实例作为实时注册事实来源
- **AND** manifest SHALL 只保留基础路由、默认策略、策略模板、环境约束或非敏感样例

#### Scenario: Manifest excludes secrets

- **WHEN** manifest 中出现 Admin API key、JWT secret、TLS private key、数据库密码或第三方系统密钥
- **THEN** 校验 SHALL 失败
- **AND** 错误信息 SHALL 指出敏感字段所在文件和路径

### Requirement: Gateway sync validates manifests

系统 SHALL 提供 APISIX manifest 校验能力，在同步前验证源文件格式、必填字段、对象 key、生成对象 ID、引用关系和环境约束。

#### Scenario: Valid manifest passes validation

- **WHEN** 开发者对合法 manifest 执行校验命令
- **THEN** 系统 SHALL 返回校验成功
- **AND** 不 SHALL 调用 APISIX Admin API 修改远端配置

#### Scenario: Broken reference fails validation

- **WHEN** route 引用了不存在的 upstream、service plugin-config 或 materialized APISIX resource
- **THEN** 校验 SHALL 失败
- **AND** 错误信息 SHALL 包含引用方对象 key 或 ID 和缺失目标 key 或 ID

### Requirement: IAM internal API route SHALL use relaxed IP limit

系统 SHALL 对 `iam` 内部互调 API route 使用独立的、更宽松的 IP 平滑限流策略。

#### Scenario: Internal route uses relaxed limit

- **WHEN** 开发者查看 `iam` app manifest 中 `key: internal` 的 API route
- **THEN** route SHALL 绑定内部 API 专用 `plugin_config`
- **AND** materialized route SHALL 引用内部 API 专用 `plugin_config_id`
- **AND** 该 `plugin_config` SHALL 使用 `limit-req` 的 `rate: 50`、`burst: 100`、`rejected_code: 429`、`key_type: var`、`key: remote_addr` 和 `policy: local`

#### Scenario: Internal route does not require source whitelist

- **WHEN** 内部系统调用 `/api/iam/internal/*`
- **THEN** 仓库基线限流策略 SHALL NOT 要求来源 IP 白名单
- **AND** 该 route SHALL 继续通过内部认证或已有安全边界控制访问权限

### Requirement: Tender internal auth forward-auth SHALL forward only apikey

仓库管理的 tender dev/prod APISIX manifest 中，调用 IAM `/auth/internal-authz` 的 `forward-auth` route SHALL 仅向该 auth endpoint 转发 `apikey` 请求头。

#### Scenario: Tender internal-authz request headers are minimal

- **WHEN** 开发者查看 `gateway/manifests/dev/tender.yaml` 或 `gateway/manifests/prod/tender.yaml` 中指向 `/auth/internal-authz` 的 `forward-auth` 配置
- **THEN** `request_headers` SHALL 只包含 `apikey`
- **AND** `request_headers` MUST NOT 包含 `IP-Chain`
- **AND** `request_headers` MUST NOT 包含 `Cookie`
- **AND** `request_headers` MUST NOT 包含 `Authorization`

### Requirement: SSO API policy SHALL combine CORS and rate limiting

系统 SHALL 为 IAM SSO API routes 使用合并后的专用 `plugin_config`，同时保留 CORS 策略并启用 API IP 限流。

#### Scenario: SSO routes have combined plugin config

- **WHEN** 开发者查看 dev 或 prod 的仓库管理 IAM SSO API route manifest
- **THEN** 每一条 SSO API route SHALL 引用一个 SSO 专用 `plugin_config`
- **AND** materialized route SHALL 引用对应 SSO 专用 `plugin_config_id`
- **AND** 该 `plugin_config` SHALL 同时包含原有 `cors` 策略、`real-ip` 策略和普通 API `limit-req` 策略

#### Scenario: SSO CORS behavior is preserved

- **WHEN** SSO 浏览器端点需要跨域访问
- **THEN** 合并后的 SSO `plugin_config` SHALL 保留原 manifest 中的 CORS allow origins、headers、methods、credentials 和 max age 语义

#### Scenario: SSO route splitting preserves upstream

- **WHEN** IAM SSO route 按内外网 host 拆分
- **THEN** 拆分后的 SSO routes SHALL 继续转发到 IAM API upstream
- **AND** 拆分 SHALL NOT 改变 SSO upstream 选择
