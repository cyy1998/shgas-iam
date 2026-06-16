## ADDED Requirements

### Requirement: Grafana Dashboard Usability
系统 SHALL 将预置 Grafana 系统日志 dashboard 设计为面向 IAM 排障任务的结构化操作界面，而不是仅展示原始 LogQL 结果。

#### Scenario: Overview presents health summary first
- **WHEN** 用户打开 `IAM Overview` dashboard
- **THEN** dashboard SHALL 在首屏展示关键摘要指标，至少覆盖总日志量、错误日志数或错误率、HTTP 4xx/5xx、APISIX upstream 异常和请求耗时信号
- **AND** dashboard SHALL 保留按服务或等级分组的趋势图用于解释异常变化

#### Scenario: Overview avoids raw label noise
- **WHEN** `IAM Overview` dashboard 展示图例、字段标题或表格列
- **THEN** dashboard SHALL 使用可读名称展示服务、等级、状态码、事件和错误字段
- **AND** dashboard SHOULD NOT 在主要图例或列名中暴露 `{service="..."}` 这类原始 label 表达

#### Scenario: Error Center groups actionable errors
- **WHEN** 用户打开 `IAM Error Center` dashboard
- **THEN** dashboard SHALL 按 `service`、`event`、`errorName` 或 `errorCode` 聚合错误
- **AND** dashboard SHALL 展示错误次数、最近出现时间和至少一个可用于继续排查的示例字段，例如 `requestId`、`traceId` 或错误摘要

#### Scenario: Error examples link to request drilldown
- **WHEN** Error Center 中的错误示例包含 `requestId` 或 `traceId`
- **THEN** dashboard SHALL 提供跳转到 `IAM Request Drilldown` 的 data link 或等价导航
- **AND** 跳转参数 MUST 仅包含 `requestId`、`traceId`、`service`、`env` 和时间范围等技术关联字段

#### Scenario: Request Drilldown shows request summary and timeline
- **WHEN** 用户通过 `requestId` 或 `traceId` 打开 `IAM Request Drilldown`
- **THEN** dashboard SHALL 展示请求摘要，至少包括关联 ID、服务范围、时间范围、最高状态码、最大耗时或错误数量中的关键字段
- **AND** dashboard SHALL 展示跨 APISIX 和后端服务的结构化时间线

#### Scenario: Request Drilldown preserves raw evidence
- **WHEN** Request Drilldown 对日志进行格式化展示
- **THEN** dashboard SHALL 保留查看原始 JSON 日志的能力
- **AND** 格式化展示 MUST NOT 删除 Loki 中已采集的原始日志内容

#### Scenario: Dashboard colors have stable semantics
- **WHEN** dashboard 使用颜色区分状态、等级或趋势
- **THEN** error/fatal SHALL 使用红色语义，warn SHALL 使用黄色语义，正常或 2xx SHALL 使用绿色语义，流量或总量 SHALL 使用蓝色语义
- **AND** 同一 dashboard 内相同语义的颜色 SHALL 保持一致

#### Scenario: Dashboard keeps stable provisioning identities
- **WHEN** dashboard UX 被改进并通过 provisioning 发布
- **THEN** `IAM Overview`、`IAM Request Drilldown` 和 `IAM Error Center` 的 dashboard UID SHALL 保持稳定
- **AND** datasource UID、dashboard folder provisioning 和现有 admin deep link 入口 SHALL 继续可用

#### Scenario: Dashboard queries preserve Loki label discipline
- **WHEN** dashboard 查询 requestId、traceId、route、clientIp、userAgent 或用户标识
- **THEN** 查询 MUST 通过 LogQL pipeline 或日志字段过滤完成
- **AND** dashboard 变更 MUST NOT 要求这些字段成为 Loki labels
