## Context

IAM 已经通过 Grafana Alloy、Loki 和 Grafana 提供系统日志观测能力，并 provision 了 `IAM Overview`、`IAM Error Center` 和 `IAM Request Drilldown` 三个 dashboard。当前 dashboard 证明了采集链路可用，但首屏缺少摘要结论，图例直接暴露 labels，错误和请求详情主要依赖原始 JSON，排障人员需要在 Grafana 中手动解析字段、聚合错误和拼接链路。

本设计只改进 Grafana dashboard 资产和必要文档，不改变日志采集、Loki labels、后端日志合同、APISIX access log 合同、admin deep link 安全边界或 Grafana 认证授权模型。

## Goals / Non-Goals

**Goals:**

- 让 `IAM Overview` 首屏先回答“系统是否异常、异常在哪个服务、是否影响网关/后端请求”。
- 让 `IAM Error Center` 先按服务、事件、错误类型聚合，再提供最近示例日志用于定位。
- 让 `IAM Request Drilldown` 围绕单个 `requestId` / `traceId` 展示摘要、跨服务时间线和可展开原文。
- 统一 dashboard 的变量、图例、字段标题、颜色语义和 panel 排版，降低 Grafana 原始表达噪音。
- 保持 dashboard UID 稳定，继续支持现有 admin deep link 和 Grafana provisioning。
- 继续遵守 Loki label discipline，不把 requestId、traceId、route、clientIp、userAgent 或用户标识提升为 labels。

**Non-Goals:**

- 不新增 Loki/Alloy/Grafana 运行时组件或采集目标。
- 不修改后端日志 JSON 合同、APISIX access log 字段合同或 Pino redact 策略。
- 不在 admin 或 admin-api 中实现 Loki 查询 UI、代理或 iframe 嵌入。
- 不引入 Tempo、OpenTelemetry span、trace graph 或新的 trace datasource。
- 不改变 Grafana OIDC、datasource UID、alert rule 语义或生产部署拓扑。

## Decisions

### 1. 保留三个 dashboard 的职责边界

`IAM Overview` 继续作为总览入口，聚焦健康摘要和关键趋势；`IAM Error Center` 聚焦错误分组和示例；`IAM Request Drilldown` 聚焦单次请求的上下文。不同 dashboard 通过 dashboard links 或 panel data links 互相跳转，而不是把所有信息堆在一个页面。

理由：

- 现有 admin deep link 和 dashboard UID 已经围绕这三个入口建立。
- 总览、错误聚合和单请求钻取的用户任务不同，分屏能保持信息密度可控。
- 保留现有 dashboard 文件能降低回归风险。

备选方案：

- 合并为一个大 dashboard：首屏会过载，单请求排障和全局观测的变量也会互相干扰。
- 新建更多 dashboard：会增加 provisioning、文档和入口复杂度，不适合这次 UX 聚焦改进。

### 2. Overview 首屏采用“摘要指标 + 趋势 + 最近异常”结构

Overview 顶部增加 stat 面板，展示总日志量、错误日志数、错误率、HTTP 4xx/5xx、APISIX 5xx 或 upstream 非 2xx、P95/P99 请求耗时等强信号。中段保留服务日志量、warn/error 趋势、HTTP 状态和 APISIX upstream 状态趋势。底部展示结构化最近错误，不默认铺满完整 JSON。

理由：

- 运维首屏需要快速判断是否需要介入，而不是先读多条曲线。
- 趋势图适合解释变化过程，stat 面板适合给出当前窗口结论。
- 最近异常作为入口即可，完整排查应进入 Error Center 或 Request Drilldown。

备选方案：

- 只调整现有图表标题和图例：可读性会提升，但仍缺少首屏结论。
- 增加更多原始 logs panel：会放大 JSON 噪音。

### 3. Error Center 采用“趋势 + Top 分组 + 示例日志”结构

Error Center 顶部保留按服务或错误类型分组的错误趋势；核心表格按 `service`、`event`、`errorName` / `errorCode` 聚合错误次数，并展示最近出现时间、示例 `errorMessage`、示例 `requestId` 或 `traceId`。示例字段通过 data link 跳转到 Request Drilldown。

理由：

- 错误排查首先需要知道“哪类错误最多、最近是否仍在发生、是否集中在某服务”。
- `requestId` 不作为 label，仍可通过 LogQL pipeline 提取并作为表格字段或 logs 示例。
- 示例日志保留向下钻取路径，避免聚合表变成孤立统计。

备选方案：

- 直接在 logs panel 中依赖用户搜索：定位重复错误较慢。
- 为 errorName 新增 Loki label：会扩大 label cardinality，不符合既有规格。

### 4. Request Drilldown 采用“请求摘要 + 时间线 + 原文详情”结构

Request Drilldown 顶部展示 requestId、traceId、服务数量、首末时间、最高状态码、最大耗时和错误数等摘要。主体使用 table 或 logs panel 的格式化行展示跨 APISIX/后端/OIDC provider 的时间线，列包含时间、服务、事件、方法、路径、状态、耗时、upstream、错误摘要。原始 JSON 作为可展开详情或保留在底部 raw logs 面板。

理由：

- 单请求排障要先看到链路顺序和异常节点，再决定是否展开原文。
- 表格化字段比整段 JSON 更适合比较 APISIX 与后端日志。
- 保留原文能避免格式化遗漏字段时失去取证能力。

备选方案：

- 继续使用单个 logs panel：实现简单，但体验和当前问题一致。
- 接入 Tempo trace：体验更强，但需要新的 tracing pipeline，不属于本次范围。

### 5. 使用 Grafana 原生 panel、transform 和 data link，不新增自定义插件

实现优先使用 Grafana 内置 stat、timeseries、table、logs panel，配合 LogQL pipeline、legend format、field overrides、transformations 和 data links。dashboard JSON 继续由仓库文件 provision。

理由：

- 现有 compose/provisioning 已经支持纯 JSON dashboard。
- 原生 panel 降低部署复杂度，不需要额外 plugin 安装和安全评估。
- field overrides 和 data links 足以改善命名、颜色和 drilldown。

备选方案：

- 引入 Grafana 插件或自定义前端：会增加部署和版本兼容风险。
- 在 admin 中重建日志 UI：违背既有“Grafana 负责日志查询”的边界。

### 6. 颜色和命名语义固定

Dashboard SHALL 使用稳定的视觉语义：error/fatal 用红色，warn 用黄色，正常/2xx 用绿色，流量/总量用蓝色，网关 upstream 非 2xx 使用橙红强调。字段标题使用业务可读命名，如“服务”“事件”“错误类型”“请求 ID”“耗时(ms)”，图例避免展示 `{service="..."}` 这种原始 labels。

理由：

- 同一颜色在不同 panel 中表达不同含义会增加误判。
- 排障页面更需要密度和清晰度，不需要营销式视觉装饰。
- 可读字段标题降低非 Grafana 熟练用户的门槛。

## Risks / Trade-offs

- [Risk] Grafana table transformation 对 Loki 查询返回格式较敏感。→ Mitigation: 优先使用 Loki metric 聚合和 logs/table 原生能力，实施后用 dev Grafana 加载 dashboard 验证。
- [Risk] 过多 stat 面板会挤压趋势图空间。→ Mitigation: 首屏只保留强信号指标，次要指标放到下方趋势或错误中心。
- [Risk] P95/P99 耗时从日志字段计算可能受缺失字段影响。→ Mitigation: 查询需要过滤 `durationMs` 存在且可解析的日志，缺失时显示 no data 而不是错误数值。
- [Risk] data link 变量转义不正确会导致 Request Drilldown 查询不到结果。→ Mitigation: 验证 requestId、traceId、service、env 和时间范围的链接参数，并保留手动 textbox 输入。
- [Risk] dashboard JSON 手工编辑容易破坏结构。→ Mitigation: 使用 JSON parse 校验和 Grafana provisioning smoke test，必要时用脚本读取关键 panel/UID 做结构检查。

## Migration Plan

1. 更新三个 dashboard JSON，保留 `uid`、`title`、datasource UID、folder provider 和基础变量。
2. 为 Overview 增加摘要 stat panels，并调整趋势图图例、字段名、颜色和最近错误展示。
3. 为 Error Center 增加 Top 错误分组表、示例字段和跳转到 Request Drilldown 的 data links。
4. 为 Request Drilldown 增加请求摘要、结构化时间线和 raw logs 详情区。
5. 更新运行手册中 dashboard 使用说明和推荐排障路径。
6. 运行 dashboard JSON 解析检查，并通过 dev observability stack 验证 Grafana 能加载三个 dashboard。

回滚策略：

- Dashboard 均由文件 provision，可通过回滚对应 JSON 文件恢复旧版页面。
- 本变更不修改日志采集、日志输出或数据库数据，回滚不影响 IAM 运行时服务。

## Open Questions

- P95/P99 请求耗时是否在一期 dashboard 中只基于日志字段计算，还是等后续指标体系补齐后再迁移到 Prometheus 指标。
- 是否需要为生产 Grafana 建立 dashboard 版本截图或导出基准，作为后续 UI 回归评审材料。
