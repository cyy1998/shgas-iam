## Why

当前 IAM 已经具备 Loki/Grafana 系统日志观测链路，但三个预置 dashboard 仍偏向“原始数据展示”：图例暴露 LogQL labels，错误日志默认铺开 JSON，Request Drilldown 缺少请求摘要和结构化时间线。排障人员需要先自行理解字段、筛选错误和拼接 requestId 上下文，影响定位效率。

本变更将现有 Grafana 日志 dashboard 从基础可用提升为面向 IAM 运行时排障的操作界面，让 Overview 先给结论、Error Center 聚合问题、Request Drilldown 聚焦单次请求链路，同时保持 Loki labels 纪律、Grafana provisioning 和 admin deep link 边界不变。

## What Changes

- 改进 `IAM Overview` dashboard，新增首屏摘要指标和更清晰的服务/错误/网关状态概览。
- 改进 `IAM Error Center` dashboard，将错误从原始日志列表升级为按服务、事件和错误类型聚合的错误中心，并保留可跳转的示例日志上下文。
- 改进 `IAM Request Drilldown` dashboard，围绕 `requestId` / `traceId` 展示请求摘要、跨服务时间线和可展开原始 JSON。
- 统一 Grafana dashboard 的图例、字段命名、颜色语义和 panel 标题，隐藏不必要的 `{label="value"}` 原始表达。
- 优化 LogQL 查询和 table/logs panel 展示方式，在不新增高基数 Loki labels 的前提下提高可读性。
- 保持 dashboard UID、datasource UID、folder provisioning 和 admin deep link 入口稳定，避免破坏现有跳转。
- 不引入新的日志采集目标、数据库表、admin-api Loki 代理、Grafana iframe 或 Tempo/OpenTelemetry tracing。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `system-log-observability`: 强化 Grafana dashboard 的信息架构、可读性、结构化展示和 drilldown 行为要求。

## Impact

- 影响 `observability/grafana/dashboards/iam-overview.json`、`iam-error-center.json` 和 `iam-request-drilldown.json`。
- 可能影响 `docs/observability-system-logs.md` 中关于 dashboard 使用方式和排障入口的说明。
- 不影响 Loki/Alloy/Grafana compose 拓扑、datasource provisioning、alert rules、后端日志 JSON 合同、APISIX access log 合同或 admin deep link 安全边界。
- 验证需要覆盖 dashboard JSON 可解析、Grafana provisioning 能加载、关键 LogQL 查询符合低基数 label 约束，并通过 dev observability stack 或 Grafana UI smoke test 检查可读性。
