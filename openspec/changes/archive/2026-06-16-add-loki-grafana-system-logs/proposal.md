## Why

当前 IAM 只有审计日志具备持久化和管理端查询体验，普通系统日志仍主要依赖 Pino 结构化输出和容器 stdout，缺少集中存储、统一检索、跨服务 requestId 关联和可复用的排障入口。随着 `api`、`admin-api`、`oidc-provider` 与 APISIX 网关链路逐步成形，需要建立一条独立于业务审计的系统日志观测链路，支持开发和运维在 Grafana 中按请求、服务和错误快速定位问题。

## What Changes

- 新增基于 Grafana Alloy、Loki 和 Grafana 的系统日志观测能力，采集 `api`、`admin-api`、`oidc-provider` 和 `apisix` 容器 stdout/stderr。
- 统一后端和网关系统日志 JSON 字段合同，包括 `event`、`sourceApp`、`requestId`、`traceId`、`statusCode`、`durationMs`、`clientIp`、`userAgent` 等可检索字段。
- 使用 APISIX 作为入口 `X-Request-Id` 生成/透传方，后端在直连场景兜底生成，并将同一 requestId 用于系统日志和既有审计日志关联。
- 在 Pino 输出前执行敏感字段 redact，并在 Alloy 处理层增加二次脱敏兜底；系统日志一期不得采集 request body 或 response body。
- 为 APISIX 配置 request-id 插件和 JSON access log 到 stdout，不启用 APISIX 的 Loki/http/file logger 插件。
- 新增 observability dev/prod compose 与配置目录，开发环境默认不启动 Loki/Grafana/Alloy，生产采用单机集中 Loki/Grafana 与每台业务机 Alloy agent。
- Grafana 使用 IAM OIDC provider 登录，Grafana 自身负责最终日志访问授权；admin 只提供系统日志入口和按 requestId/traceId 的 Grafana 深链。
- 预置 3 个 Grafana dashboard、4 类强信号日志告警、Loki 30 天默认 retention，以及端到端 smoke test 验收路径。
- 不新增 PostgreSQL `system_log` 表，不在 admin-api 中代理 Loki 查询，不在 admin 中 iframe 嵌入 Grafana，不在本次变更引入 Tempo tracing 或细粒度 `system.logs.view` 权限。

## Capabilities

### New Capabilities

- `system-log-observability`: 描述 IAM 系统日志集中采集、Loki 存储、Grafana 查询/告警、日志字段合同、脱敏、保留期、admin 深链入口和验收要求。

### Modified Capabilities

- `gateway-configuration-management`: APISIX 仓库管理配置需要启用入口 request-id 生成/透传，并将 access log 统一为 JSON stdout 输出供 Alloy 采集。
- `audit-logging`: 管理端审计日志详情需要提供基于 `requestId` 的 Grafana 深链，用于从审计事件跳转到对应系统日志上下文。

## Impact

- 影响 `docker/` 与新增 `observability/` 配置：增加 Loki、Grafana、Alloy 的 dev/prod compose、配置、dashboard 和 alert provisioning。
- 影响 `packages/api-core`、`apps/api`、`apps/admin-api` 和 `apps/oidc-provider`：统一 Pino redact、requestId 顺序、请求日志字段、事件命名和少量现有日志调用。
- 影响 `gateway/config` 与 `gateway/manifests`：新增 APISIX request-id 插件配置、JSON access log 配置和相关 manifest 校验。
- 影响 `apps/admin`：新增系统日志/Grafana 入口，并在审计日志详情中增加安全的 Grafana deep link。
- 新增运行时依赖系统：Grafana Alloy、Loki、Grafana；镜像使用固定默认版本并允许通过环境变量替换为内网镜像。
- 不影响现有 REST/tRPC API 响应合同、审计日志 PostgreSQL 表结构、业务数据库 schema 或现有审计事件语义。
