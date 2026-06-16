## Why

`api`、`admin-api` 和 `oidc-provider` 当前的 logger 装配方式不一致：前两者复用 `@iam/api-core/logger` 并受 `NODE_ENV` 影响日志格式，`oidc-provider` 则自建 Pino logger，仅复用脱敏基线，导致系统日志在本地排查、容器采集、Loki 查询和 OIDC 请求关联时行为漂移。

统一后端 logger policy 与 access log 合同，可以让 Grafana/Loki 观测、requestId/traceId 关联、敏感字段脱敏和三后端运行时配置保持同一语义。

## What Changes

- 统一 `api`、`admin-api` 和 `oidc-provider` 的基础 logger policy，包括 `LOG_LEVEL`、`LOG_FORMAT`、`NODE_ENV` 默认映射、transport、redaction 和 `sourceApp`。
- 新增显式 `LOG_FORMAT=auto | json | pretty` 配置；默认 `auto` 在 `development` 输出 pretty，在其他环境输出 JSON。
- 将 `sourceApp` 收敛为受控常量，并要求应用日志依赖 logger binding 或共享 helper 注入，不再在事件对象里重复手写。
- 让 OIDC 专属敏感字段通过 `extraRedactPaths` 接入共享 logger，同时保留全局脱敏基线。
- 统一 HTTP request/access log 字段、level 规则和 header 解析规则，使 Hono 后端和 OIDC provider 共享 `http.request.completed` 合同。
- 为 `oidc-provider` 补齐覆盖 `/health`、interaction、resume、provider callback、404 和异常请求的 access log。
- 调整共享 logger 工厂，避免单一全局 singleton 导致测试或多 app logger 配置串味。
- 不改变业务 API、OIDC 协议行为、审计表语义或 Loki label 纪律。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `system-log-observability`: 补充后端 logger policy、日志格式配置、`sourceApp` 约束、OIDC access log、共享 request correlation 和敏感字段脱敏要求。

## Impact

- 影响代码：`packages/api-core/src/logger`、`packages/api-core/src/core/create-app.ts`、三个后端 app 的 env/logger 装配、`apps/oidc-provider` HTTP server/request logging、相关 focused tests。
- 影响配置：三个后端新增 `LOG_FORMAT` 环境变量，默认保持向后兼容；`api` 和 `admin-api` 非 development JSON 输出改为 Pino 默认 stdout。
- 影响依赖边界：`pino-pretty` 作为共享 logger 实现细节归属 `@iam/api-core`；app 不应直接拥有它。
- 影响观测：Grafana/Loki 能以一致字段查询三后端 access log，OIDC `/health` 和协议请求也会产生 `http.request.completed` 日志。
