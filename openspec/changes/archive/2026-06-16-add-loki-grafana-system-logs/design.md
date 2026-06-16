## Context

IAM 当前已经具备统一审计日志能力，`audit_log` 作为 PostgreSQL 中的业务安全事实表，支持管理端查询、详情查看和 requestId 关联。普通系统日志则主要由 Pino、OIDC provider logger 和 APISIX stdout/stderr 输出承载，缺少统一字段合同、集中检索、保留策略、Grafana dashboard 和跨服务 requestId 排障入口。

本变更面向运行时排障和运维观测，不替代审计日志。系统日志的事实存储选择 Loki，查询和告警选择 Grafana，采集代理选择 Grafana Alloy。admin 仅提供入口和深链，不承担完整日志查询 UI 或 Loki 代理。

## Goals / Non-Goals

**Goals:**

- 为 `api`、`admin-api`、`oidc-provider` 和 `apisix` 建立集中系统日志链路。
- 使用 Docker stdout/stderr、Grafana Alloy、Loki 和 Grafana 形成可部署闭环。
- 统一 IAM 系统日志 JSON 字段合同、事件命名、requestId 传递和脱敏策略。
- 让 APISIX 生成/透传 `X-Request-Id`，后端直连时兜底生成，并在审计日志与系统日志之间复用该 requestId。
- 提供 Grafana datasource、dashboard、alert provisioning，并支持 admin 通过安全 deep link 跳转。
- 使用端到端 smoke test 验证采集、查询、脱敏和深链。

**Non-Goals:**

- 不新增 PostgreSQL `system_log` 表，不把系统日志写入业务数据库。
- 不在 admin-api 中代理 Loki 查询，不在 admin 中实现完整系统日志表格。
- 不 iframe 嵌入 Grafana，不绕过 Grafana 自身认证和授权。
- 不引入 Tempo、OpenTelemetry SDK instrumentation 或 APISIX opentelemetry plugin。
- 不把 admin 权限模型改造成细粒度 `system.logs.view`，一期入口沿用 `isAdmin`。
- 不采集 request body 或 response body。
- 不把 `admin` / `sso` 前端 Nginx 容器日志纳入一期采集范围。

## Decisions

### 1. 使用 Docker stdout/stderr + Grafana Alloy 采集

应用和 APISIX 继续向容器 stdout/stderr 输出日志，每台业务机部署 Alloy 读取 Docker 日志并推送到集中 Loki。应用不直接调用 Loki，也不引入 Pino Loki transport。

理由：

- 现有 Pino 生产输出已经走 stdout，APISIX 镜像的 access/error log 也链接到 stdout/stderr。
- 日志后端不可用时不应影响 IAM 请求路径。
- Docker stdout/stderr 采集模型便于后续迁移到 Kubernetes 或其他容器平台。
- Promtail 已不适合作为新方案起点，Alloy 是 Grafana 当前推荐的统一采集代理路线。

备选方案：

- 应用主动推 Loki：会把日志后端可用性带入请求路径，且每个 app 都需要维护 transport。
- Promtail：可用但不作为新方案首选，长期演进空间不如 Alloy。

### 2. 单机集中 Loki/Grafana，Alloy 分布式部署

一期部署一个集中 Loki 和 Grafana，每台承载 IAM 服务或 APISIX 的机器运行一个 Alloy agent。Loki 默认保留 30 天，数据目录挂载到持久化路径。

理由：

- 当前生产 compose 已采用按服务器启动部分服务的分布式部署方式，适合每台机器附加 Alloy。
- Loki 分布式模式会引入更多组件和对象存储依赖，一期复杂度过高。
- Alloy 推送目标后续可从单机 Loki 切换到分布式 Loki，而不要求应用改动。

### 3. Loki labels 只保留低基数字段

Loki labels 只使用 `env`、`service`、`component`、`level` 和 `host`。`requestId`、`traceId`、`route`、`userId`、`username`、`clientIp` 和 `userAgent` 不做 label。

理由：

- Loki label 高基数会导致索引膨胀和查询成本上升。
- `requestId` 和 `traceId` 更适合留在 JSON log line 或 structured metadata 中，通过 LogQL pipeline 过滤。
- `clientIp`、`userAgent` 和用户标识具有隐私敏感性，不适合作为索引标签。

### 4. 统一 IAM JSON 日志合同

后端和网关输出统一字段，如 `event`、`sourceApp`、`requestId`、`traceId`、`method`、`path`、`route`、`statusCode`、`durationMs`、`clientIp`、`userAgent`、`errorName`、`errorCode`、`source` 和 `msg`。`event` 使用小写点分层命名并常量化。

理由：

- 直接采集默认 `hono-pino` 字段会暴露完整 headers 且字段名不稳定。
- APISIX、Hono 和 OIDC provider 需要在 Grafana 中以同一组字段关联。
- 稳定 `event` 比自然语言 `msg` 更适合作为 dashboard、告警和查询条件。

### 5. APISIX 负责入口 requestId，后端兜底

APISIX 仓库管理的 IAM routes 启用 request-id 能力：无 `X-Request-Id` 时生成，已有合法值时透传，并写入响应头。后端 `requestId()` middleware 读取同一 header，在直连场景兜底生成。

理由：

- requestId 应从入口开始贯穿网关、后端日志和审计日志。
- 后端兜底保证本地直连和测试场景仍可关联。
- 统一响应头便于调用方和浏览器开发工具定位请求。

### 6. 双层脱敏，不采 body

应用输出前通过 Pino redact 和自定义请求日志白名单过滤敏感内容；Alloy 处理阶段对潜在敏感字段再做二次 drop 或替换。APISIX access log 不输出 authorization、cookie、query 全量、request body 或 response body。

理由：

- 只在 Alloy 层脱敏会让敏感信息先落入 Docker 本地日志文件。
- 登录、验证码、OIDC 和 client secret 路径极易包含敏感字段，系统日志必须默认克制。
- Grafana 中的日志会被更多运维和开发人员访问，不能依赖 UI 隐藏保护。

### 7. Grafana 负责完整查询和授权，admin 只提供入口和深链

Grafana 使用 IAM OIDC provider 登录，并由 Grafana 管理最终 datasource/dashboard/Explore 权限。admin 侧只在 `isAdmin` 下展示系统日志入口和审计日志详情中的 Grafana deep link，不 iframe 嵌入，不由 admin-api 代理 Loki。

理由：

- Grafana 已提供日志查询、dashboard、Explore、告警和权限体系。
- iframe 和代理查询会引入认证、授权、跨域、安全头、LogQL 构造、限流和分页复杂度。
- admin deep link 只携带 `requestId`、`traceId`、`service`、`env` 和时间范围，不携带用户或业务对象字段。

### 8. 配置和 dashboard 全部版本化

Loki、Grafana、Alloy 配置、Grafana datasource、dashboard 和 alert provisioning 均纳入仓库。镜像不使用 `latest`，使用固定默认版本并允许环境变量替换为内网镜像。

理由：

- 手工配置 Grafana UI 无法被代码评审、复现和回滚。
- 固定 dashboard UID 才能让 admin deep link 稳定。
- 镜像版本升级需要可追踪和可验证。

## Risks / Trade-offs

- [Risk] Loki 单机实例磁盘增长过快。→ Mitigation: 默认 30 天 retention、持久化目录、磁盘水位告警和只采四个高价值容器。
- [Risk] Alloy 通过 Docker socket 读取容器日志带来宿主机权限风险。→ Mitigation: Alloy 仅部署在受控服务器，socket 只读挂载，并通过 Docker labels 限定采集目标。
- [Risk] APISIX JSON access log 字段变量与实际 APISIX 版本不完全匹配。→ Mitigation: 实施时用 APISIX 3.16 镜像 smoke test 验证字段可用性，并保留最小可用字段集合。
- [Risk] Pino redact 路径漏掉某些业务字段。→ Mitigation: 输出前 redact 与 Alloy 二次脱敏结合，并增加带 Authorization/Cookie/password/token 的端到端泄漏测试。
- [Risk] Grafana OIDC 配置依赖正确的 client secret 和 redirect URI。→ Mitigation: 使用现有 OIDC client registry 管理 `grafana` confidential client，文档明确一次性 secret 保存流程。
- [Risk] admin 入口沿用 `isAdmin` 粒度较粗。→ Mitigation: Grafana 自身仍控制数据访问；细粒度 `system.logs.view` 作为后续独立变更。
- [Risk] 暂不接 Tempo 会限制跨服务调用链可视化。→ Mitigation: 一期用 requestId 覆盖排障主路径，后续单独评估 trace pipeline。

## Migration Plan

1. 新增 observability 目录和 dev/prod compose，提供 Loki、Grafana、Alloy 配置和 provisioning。
2. 给 `api`、`admin-api`、`oidc-provider` 和 `apisix` compose service 添加稳定 Docker labels，Alloy 仅采集这些 labels。
3. 调整 `api-core` 与 app logger：统一 redact、requestId middleware 顺序和 Hono 请求/响应日志字段。
4. 对齐 `oidc-provider` 日志字段和事件名，保留并补齐现有 redact。
5. 修改 APISIX 配置和 manifest，启用 request-id，并输出 JSON access log 到 stdout。
6. 增加 admin Grafana URL 配置、系统日志入口和审计日志详情 deep link。
7. 运行后端 typecheck、gateway manifest validate，并启动 dev observability stack 做端到端 smoke test。

回滚策略：

- 如果 Loki/Grafana/Alloy 部署异常，可停止 observability compose；应用仍向 stdout 输出日志。
- 如果新日志字段或 APISIX access log 配置异常，可回滚对应配置，审计日志和业务 API 合同不受影响。
- 本变更不迁移或删除业务数据库数据，回滚不涉及 PostgreSQL schema。

## Open Questions

- 实施时需要确认 Grafana、Loki 和 Alloy 的固定默认镜像版本，以当时官方稳定版本为准。
- 生产 Grafana 域名、Loki 内网地址、Alloy 每台机器的 `host` 命名规范需要在部署 runbook 中由环境变量落地。
