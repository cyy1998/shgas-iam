## 1. Observability 目录与 Compose 基线

- [x] 1.1 新增 `observability/` 目录结构，包含 `loki/`、`alloy/`、`grafana/provisioning/` 和 `grafana/dashboards/`
- [x] 1.2 新增 `docker/docker-compose-observability-dev.yml`，提供按需启动的 Loki、Grafana 和 Alloy 开发栈
- [x] 1.3 新增 `docker/docker-compose-observability-prod.yml`，提供单机集中 Loki/Grafana 与 Alloy agent 的生产部署模板
- [x] 1.4 为 observability compose 使用固定默认镜像版本，并支持 `LOKI_IMAGE`、`GRAFANA_IMAGE`、`GRAFANA_ALLOY_IMAGE` 等环境变量覆盖
- [x] 1.5 配置 Loki dev/prod 文件，启用持久化目录、30 天默认 retention 和本地开发可用的存储设置
- [x] 1.6 配置 Grafana dev/prod provisioning 基线，确保 datasource、dashboard 和 alert rules 可由文件自动加载

## 2. Alloy 采集与 Loki 标签处理

- [x] 2.1 为 `api`、`admin-api`、`oidc-provider` 和 `apisix` compose service 增加 `shgas-iam.logs.*` Docker labels
- [x] 2.2 编写 Alloy dev 配置，从 Docker stdout/stderr 采集带 `shgas-iam.logs.enabled=true` 的容器日志
- [x] 2.3 编写 Alloy prod 配置，支持通过环境变量配置 Loki push URL、env 和 host
- [x] 2.4 在 Alloy 中将 Docker labels 映射为 Loki labels：`env`、`service`、`component`、`host`
- [x] 2.5 在 Alloy 中解析 Pino JSON 和 APISIX JSON access log，并将 Pino numeric level 归一化为字符串 `level`
- [x] 2.6 在 Alloy 中确保 requestId、traceId、route、clientIp、userAgent、userId 和 username 不成为 Loki labels
- [x] 2.7 在 Alloy 中处理非 JSON stderr 日志，使用 `event="runtime.stderr"` 和合理默认 `level`
- [x] 2.8 在 Alloy 中增加敏感字段二次 drop/redact 规则，兜底处理 Authorization、Cookie、password、token、secret 等字段

## 3. 后端系统日志合同

- [x] 3.1 调整 `packages/api-core` logger，添加统一 Pino redact paths，并保持生产 stdout 与开发 pretty 行为
- [x] 3.2 调整 `createApp` 中 requestId 与 pinoLogger 注册顺序，确保请求日志可读取 `c.get("requestId")`
- [x] 3.3 自定义 `hono-pino` 请求/响应日志 bindings，输出 IAM JSON 字段并避免完整 headers
- [x] 3.4 为后端系统日志定义首批稳定 `event` 常量或 helper，覆盖 HTTP 请求、未处理错误、人机验证、会话通知和集成调用失败等现有日志点
- [x] 3.5 将现有裸值或不规范日志调用改为结构化 IAM JSON 日志，至少修正 `logger.info(sourceIp)`
- [x] 3.6 更新 `api-core` error handler 日志，输出 `event="api.error.unhandled"`、requestId、source 和脱敏错误摘要
- [x] 3.7 为 `api-core` 日志合同和 requestId 行为补充 focused tests

## 4. OIDC Provider 日志对齐

- [x] 4.1 补齐 `apps/oidc-provider` logger redact paths，使其与 IAM 系统日志敏感字段基线一致
- [x] 4.2 将 OIDC provider server error、protocol error、HTTP request failed 和 lifecycle 日志对齐 `event`、`sourceApp`、`requestId` 字段
- [x] 4.3 确保 OIDC provider 不在系统日志中输出 token、authorization code、client secret、cookie 或 private key
- [x] 4.4 为 OIDC provider 日志字段和敏感字段不泄漏补充 focused tests 或 smoke 验证

## 5. APISIX Request ID 与 JSON Access Log

- [x] 5.1 更新 `gateway/config/config.dev.yaml` 和 `config.prod.example.yaml`，配置 APISIX JSON access log 到 stdout
- [x] 5.2 更新 IAM dev/prod APISIX manifests 或 plugin-configs，为仓库管理 routes 启用 request-id 能力
- [x] 5.3 确保 APISIX access log 输出 `event`、`sourceApp`、`requestId`、`method`、`path`、`statusCode`、`durationMs`、`upstreamStatus` 和 `upstreamAddr`
- [x] 5.4 确保 APISIX access log 不输出 request body、response body、authorization、cookie、set-cookie 或敏感 query 原文
- [x] 5.5 更新 gateway manifest/config 校验，覆盖 request-id 引用、JSON access log 关键字段和禁止 Loki/http/file logger 插件
- [x] 5.6 运行 `pnpm gateway:apisix:validate -- --env dev:iam` 和 `pnpm gateway:apisix:validate -- --env prod:iam`

## 6. Grafana Provisioning 与告警

- [x] 6.1 配置 Grafana Loki datasource provisioning，支持通过环境变量注入 Loki URL
- [x] 6.2 新增 `IAM Overview` dashboard，展示各服务日志量、warn/error 趋势、HTTP 4xx/5xx、APISIX upstream 状态和最近错误日志
- [x] 6.3 新增 `IAM Request Drilldown` dashboard，支持按 requestId、traceId、env、service 和时间范围查看跨网关/后端日志时间线
- [x] 6.4 新增 `IAM Error Center` dashboard，展示 error 趋势、按 service/event/errorName 分组和最近错误表格
- [x] 6.5 新增 Grafana alert provisioning，覆盖服务 error 突增、APISIX 5xx 突增、OIDC provider server error 和 Loki/Alloy 采集异常
- [x] 6.6 为 dev 环境配置静默或无通知渠道的告警规则，避免本地启动产生噪音

## 7. Grafana OIDC 与 Admin Deep Link

- [x] 7.1 编写 Grafana IAM OIDC client 配置说明，使用现有 client registry 创建 confidential `grafana` client
- [x] 7.2 为 admin 前端新增 Grafana URL 环境配置，例如 `UMI_APP_GRAFANA_URL`
- [x] 7.3 新增 admin 系统日志入口，沿用现有 `isAdmin` access，跳转 Grafana dashboard 或 Explore
- [x] 7.4 在审计日志详情抽屉中为具备 requestId 的记录增加 Grafana deep link
- [x] 7.5 deep link 仅携带 requestId、traceId、service、env 和时间范围，不携带用户或业务对象字段
- [x] 7.6 确保 admin 不 iframe 嵌入 Grafana，admin-api 不代理 Loki 查询

## 8. 文档与运行手册

- [x] 8.1 更新 README 或新增 observability runbook，说明 dev/prod 启动方式、端口、数据目录和环境变量
- [x] 8.2 记录 Loki 30 天默认 retention、磁盘水位告警、备份/回滚和停止 observability 栈的操作方式
- [x] 8.3 记录 Grafana OIDC 配置、一次性 client secret 保存、dashboard provisioning 和权限边界
- [x] 8.4 记录系统日志字段合同、event 命名规则、禁止采 body 和敏感字段 redact 基线

## 9. 端到端验证

- [x] 9.1 运行 `pnpm --filter @iam/api-core test` 和 `pnpm --filter @iam/api-core typecheck`
- [x] 9.2 运行 `pnpm --filter @iam/api typecheck`、`pnpm --filter @iam/admin-api typecheck` 和受影响 focused tests
- [x] 9.3 运行 `pnpm --filter @iam/oidc-provider typecheck` 和受影响 focused tests
- [x] 9.4 启动 dev observability stack，通过 APISIX 访问 IAM 后端并确认响应头包含 `X-Request-Id`
- [x] 9.5 在 Grafana/Loki 中按 requestId 查询到 APISIX 与对应后端日志，且 requestId 不是 Loki label
- [x] 9.6 构造带 Authorization、Cookie、password 和 token 测试值的请求，确认 Loki 查询不到这些原文
- [x] 9.7 验证 3 个 dashboard 能加载 Loki 数据源，4 类告警规则存在且 dev 不发送实际通知
- [x] 9.8 从 admin 审计日志详情点击 Grafana deep link，确认能打开围绕 requestId 和时间范围的日志上下文
- [x] 9.9 运行 `openspec validate add-loki-grafana-system-logs --strict`
