## 1. Dashboard 基线梳理

- [x] 1.1 读取三个现有 dashboard JSON，记录 `uid`、变量、datasource UID、panel ID、当前 LogQL 和 admin deep link 依赖参数
- [x] 1.2 制定统一字段命名、图例命名、颜色语义和 data link 参数约定
- [x] 1.3 确认所有新增或调整查询继续使用低基数 labels，并通过 LogQL pipeline 处理 `requestId`、`traceId`、`route`、`clientIp` 和 `userAgent`

## 2. IAM Overview 改进

- [x] 2.1 在 `iam-overview.json` 顶部新增摘要 stat panels，覆盖总日志量、错误日志数或错误率、HTTP 4xx/5xx、APISIX upstream 异常和请求耗时信号
- [x] 2.2 调整服务日志量、warn/error、HTTP 状态和 APISIX upstream 趋势图的标题、legend、颜色和字段展示
- [x] 2.3 将最近错误展示从默认原始 JSON 噪音改为结构化字段展示，并保留查看原始日志的能力
- [x] 2.4 校验 `iam-overview` UID、dashboard title、datasource UID 和基础变量保持兼容

## 3. IAM Error Center 改进

- [x] 3.1 在 `iam-error-center.json` 中保留错误趋势并调整为按服务或错误类型可读分组
- [x] 3.2 将错误聚合表改为展示 `service`、`event`、`errorName` 或 `errorCode`、错误次数、最近出现时间和示例摘要
- [x] 3.3 为包含 `requestId` 或 `traceId` 的示例字段添加跳转 `IAM Request Drilldown` 的 data link
- [x] 3.4 调整最近错误面板，使其作为示例日志入口而不是首要排障界面

## 4. IAM Request Drilldown 改进

- [x] 4.1 在 `iam-request-drilldown.json` 中新增请求摘要 panels，展示关联 ID、服务范围、最高状态码、最大耗时和错误数量等关键字段
- [x] 4.2 将 request timeline 改为结构化时间线展示，包含时间、服务、事件、方法、路径、状态、耗时、upstream 和错误摘要
- [x] 4.3 保留 raw logs 面板或等价展开方式，确保可以查看原始 JSON 日志
- [x] 4.4 校验 `requestId`、`traceId`、`service`、`env` 和时间范围变量可通过 admin deep link 与 Error Center data link 正确传入

## 5. 文档与使用路径

- [x] 5.1 更新 `docs/observability-system-logs.md`，说明三个 dashboard 的推荐使用路径：Overview 判断、Error Center 聚合、Request Drilldown 定位
- [x] 5.2 记录 dashboard 中允许携带到 deep link 的字段边界，避免误把业务标识、敏感字段或错误堆栈放入链接
- [x] 5.3 如 dashboard 截图或可视基准被纳入仓库流程，记录生成和更新方式

## 6. 验证

- [x] 6.1 使用 Node 或等价工具解析三个 dashboard JSON，确认 JSON 结构有效且 `uid` 稳定
- [x] 6.2 静态检查关键 LogQL，确认未新增高基数字段 labels，且查询语法符合 Grafana Loki datasource 预期
- [x] 6.3 启动或复用 dev observability stack，验证 Grafana provisioning 能加载三个 dashboard
- [x] 6.4 在 Grafana UI 中检查桌面视口下首屏可读性、图例命名、颜色语义、data link 和 raw JSON 查看路径
- [x] 6.5 运行 `openspec validate improve-log-grafana-dashboard-ux --strict`
