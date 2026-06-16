## Context

当前 `api` 与 `admin-api` 通过 `@iam/api-core/logger` 创建 Pino logger，并在 `NODE_ENV=development` 时使用 `pino-pretty`，其他环境输出 JSON。`oidc-provider` 作为独立 Node app，自建了 Pino logger，只接收 `LOG_LEVEL`，因此日志格式不受 `NODE_ENV` 影响，也没有与 Hono 后端共享 access log 字段构造、trace header 解析和 status level 规则。

现有 `system-log-observability` spec 已要求 `api`、`admin-api`、`oidc-provider` 和 APISIX 的 stdout/stderr 被 Alloy 采集，并要求 IAM 系统日志遵守稳定 JSON 合同、requestId 关联和敏感字段脱敏。本设计补齐三后端运行时 logger policy 与 access log 行为的一致性。

## Goals / Non-Goals

**Goals:**

- 让 `api`、`admin-api` 和 `oidc-provider` 通过同一个 logger factory 解释 `LOG_LEVEL`、`LOG_FORMAT`、`NODE_ENV`、transport、redaction 和 `sourceApp`。
- 新增 `LOG_FORMAT=auto | json | pretty`，默认 `auto` 在 `development` 输出 pretty，在其他环境输出 JSON，并允许显式覆盖。
- 保留 OIDC 专属敏感字段脱敏，但通过 `extraRedactPaths` 接入共享 logger。
- 统一 HTTP access log 的字段、事件名、level 规则、requestId/traceId/clientIp/userAgent 提取规则。
- 为 `oidc-provider` 在外层 HTTP server 生命周期补齐 access log，覆盖 `/health`、interaction、resume、provider callback、404 和异常请求。
- 避免共享 logger 使用单一全局 singleton 造成测试或多 app 配置串味。

**Non-Goals:**

- 不改变 REST、tRPC、OIDC 协议、session、client registry 或登录业务行为。
- 不改变 PostgreSQL `audit_log` 的字段语义，也不把审计 `sourceApp` 与系统日志 `sourceApp` 强行合并。
- 不改变 Loki label 纪律，不把 requestId、traceId、route、clientIp 或 userAgent 提升为 label。
- 不引入 OpenTelemetry span，不要求后端生成新的 traceId。
- 不要求本次实现重构 APISIX access log 或 Grafana dashboard。

## Decisions

### 1. `@iam/api-core/logger` 作为唯一后端 logger policy 入口

三个后端 SHALL 调用共享 `createLogger`，app 只传入身份和配置：

```ts
createLogger({
  sourceApp: LoggerSourceApp.OidcProvider,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  logFormat: env.LOG_FORMAT,
  extraRedactPaths: OIDC_EXTRA_LOG_REDACT_PATHS,
});
```

备选方案是继续保留 OIDC 自有 logger，仅复制 transport 逻辑。该方案短期改动少，但仍会让脱敏、format、sourceApp 和测试工具分叉，因此不采用。

### 2. `LOG_FORMAT` 显式控制日志渲染格式

`LOG_FORMAT` 使用严格枚举 `auto | json | pretty`。`auto` 的映射为：

- `NODE_ENV === "development"` -> `pretty`
- 其他 `NODE_ENV` 值 -> `json`

显式 `json` 或 `pretty` 优先于 `NODE_ENV`，包括生产环境。`NODE_ENV` 在 `api` 与 `admin-api` 中暂不收紧枚举，避免影响可能存在的 `staging`、`local` 等部署值。

备选方案是继续只用 `NODE_ENV` 控制格式。该方案无法表达“production 配置本地复现但仍看 pretty”或“development 容器强制 JSON”的运维需求，因此不采用。

### 3. JSON 模式使用 Pino 默认 stdout

`pretty` 模式使用 `pino.transport({ target: "pino-pretty" })`。`json` 模式直接使用 `pino(options)` 输出 JSON 行到 stdout，不再通过 `pino/file` transport 写 `destination: 1`。

备选方案是保留 `pino/file` transport。该方案外部表现相似，但增加 worker transport 复杂度，测试和运行时排查都更重，因此不采用。

### 4. `sourceApp` 使用受控常量和 logger binding

共享 logger 暴露受控 `LoggerSourceApp` 常量，至少包含：

- `iam-api`
- `iam-admin-api`
- `iam-oidc-provider`

`sourceApp` SHALL 由 logger child binding 或 request log helper 注入。应用事件日志不再在日志对象里手写 `sourceApp`；如果要表达外部来源系统，使用 `sourceSystem`、`clientCode` 或其他更具体字段。

### 5. 脱敏基线与 app 增量拆分

`IAM_LOG_REDACT_PATHS` 保持全局 baseline。OIDC 将当前额外敏感字段拆为 `OIDC_EXTRA_LOG_REDACT_PATHS`，共享 logger 内部合并、去重并使用统一 censor。这样 OIDC 安全要求保留，但输出策略不再分叉。

### 6. 共享 access log 纯函数与薄 adapter

`@iam/api-core/logger` SHALL 提供可测试纯函数，例如：

- `resolveLogFormat`
- `getStatusLogLevel`
- `buildHttpRequestLogFields`
- `getTraceIdFromHeaders`
- `getRequestIdFromHeaders`
- `getClientIpFromHeaders`

Hono middleware 和 OIDC HTTP server 只负责采集框架上下文，并调用共享函数构造字段。`traceId` 提取优先级为 `traceparent`、`x-b3-traceid`、`x-trace-id`；系统只提取 traceId，不生成 traceId。

### 7. OIDC access log 放在外层 HTTP server 生命周期

OIDC access log SHALL 在 `createOidcHttpServer` 外层记录开始时间，并通过 `response.finish`/`response.close` 输出最终状态。该位置可以覆盖 `/health`、预检 400、interaction/resume、provider callback、404 和异常请求。

OIDC route 归类规则：

- `/health` -> `route: "/health"`
- `/oidc/interaction/:uid` -> `route: "/oidc/interaction/:uid"`
- `/oidc/resume` -> `route: "/oidc/resume"`
- provider callback 请求 -> `route: "/oidc/*"`
- 非 OIDC 路径 404 -> `route: "not_found"`

如果 Koa/OIDC 上下文可提供 `ctx.oidc?.route`，作为 `oidcRoute` 附加字段，不替代低基数 `route`。

### 8. 异常日志与 access log 分离

OIDC HTTP 请求抛错时 SHALL 保留两条语义不同的日志：异常事件日志描述错误本身，access log 描述 HTTP 请求最终状态。异常事件不手写 `sourceApp`，access log 记录最终 500/503 或实际 `response.statusCode`。

### 9. logger 默认不使用全局 singleton

共享 `createLogger` 默认每次创建一个 logger。app 顶层 `export const logger = createLogger(...)` 已经足够提供 app-local 单例语义。若未来需要 HMR 缓存，可提供显式 `singletonKey`，但不能再使用固定 `"logger"` key。

## Risks / Trade-offs

- [Risk] `oidc-provider` 在 development 下从 JSON 变为 pretty，可能影响依赖 JSON stdout 的本地脚本。→ Mitigation：提供 `LOG_FORMAT=json` 显式覆盖。
- [Risk] JSON 模式从 `pino/file` transport 改为 Pino 默认 stdout，底层实现变化可能影响极少数依赖 transport 行为的测试。→ Mitigation：以输出合同为准，增加 focused tests 覆盖 JSON/pretty 解析。
- [Risk] OIDC `/health` access log 可能增加日志量。→ Mitigation：保持字段低成本；若生产噪音过高，后续通过采集端过滤或显式开关处理。
- [Risk] 移除事件对象手写 `sourceApp` 时可能漏改。→ Mitigation：增加 focused tests 检查 logger binding 与 OIDC 事件日志字段，必要时用 `rg` 验证。
- [Risk] header 解析在 Hono 与 Node/Koa adapter 之间存在大小写和数组值差异。→ Mitigation：共享 helper 接收框架无关 header reader，并覆盖数组、多值和大小写测试。

## Migration Plan

1. 在 `@iam/api-core/logger` 增加 `LOG_FORMAT` 解析、受控 `sourceApp`、redact 合并和 access log helper。
2. 更新 `api`、`admin-api`、`oidc-provider` 的 env schema 和 logger 装配。
3. 将 Hono request logger 改为调用共享 access log helper，保持现有字段兼容。
4. 在 OIDC HTTP server 外层新增 access log 生命周期钩子，并保留现有 OIDC error/lifecycle 事件。
5. 增加 focused tests 覆盖 format、redaction、sourceApp、header extraction、status level 和 OIDC route 分类。
6. 部署时默认不需要新增环境变量；如需保持 OIDC development JSON，可设置 `LOG_FORMAT=json`。

Rollback 策略：回退本次代码即可恢复旧 logger 装配；运行时也可先通过 `LOG_FORMAT=json` 降低 pretty 输出变化带来的本地兼容风险。

## Open Questions

无。设计决策已在 propose 前确认。
