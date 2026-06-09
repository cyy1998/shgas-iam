## ADDED Requirements

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
