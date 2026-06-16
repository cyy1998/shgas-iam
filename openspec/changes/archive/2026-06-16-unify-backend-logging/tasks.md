## 1. Shared Logger Foundation

- [x] 1.1 扩展 `packages/api-core/src/logger` 的 logger config，支持 `logFormat`、`extraRedactPaths` 和受控 `LoggerSourceApp` 常量。
- [x] 1.2 实现 `resolveLogFormat`，支持 `auto | json | pretty`，并让 `auto` 按 `NODE_ENV` 映射为 development pretty、其他环境 JSON。
- [x] 1.3 将 JSON 模式改为 Pino 默认 stdout，pretty 模式继续通过共享 logger 使用 `pino-pretty`。
- [x] 1.4 将共享 logger 的脱敏路径合并逻辑改为 baseline + app 增量，并对重复路径去重。
- [x] 1.5 移除固定 `"logger"` 全局 singleton 语义，确保同进程可创建不同 `sourceApp`、format、level 和 redaction 配置的 logger。

## 2. Shared Request Log Helpers

- [x] 2.1 在共享 logger/core helper 中实现 `getStatusLogLevel`，覆盖 info/warn/error 状态码映射。
- [x] 2.2 实现框架无关的 header 解析 helper，统一提取 requestId、traceId、clientIp 和 userAgent。
- [x] 2.3 实现 `buildHttpRequestLogFields` 或等价 helper，统一 `http.request.completed` 字段合同。
- [x] 2.4 更新 Hono `createApp` request logger，使 `api` 和 `admin-api` 通过共享 helper 构造 access log，保持现有字段兼容。

## 3. App Logger Integration

- [x] 3.1 为 `apps/api/src/env.ts`、`apps/admin-api/src/env.ts` 和 `apps/oidc-provider/src/env.ts` 增加严格枚举 `LOG_FORMAT`，默认 `auto`。
- [x] 3.2 更新 `apps/api` logger 装配，传入 `LoggerSourceApp.Api`、`NODE_ENV`、`LOG_LEVEL` 和 `LOG_FORMAT`。
- [x] 3.3 更新 `apps/admin-api` logger 装配，传入 `LoggerSourceApp.AdminApi`、`NODE_ENV`、`LOG_LEVEL` 和 `LOG_FORMAT`。
- [x] 3.4 将 `apps/oidc-provider` logger 改为调用共享 logger factory，并拆出 `OIDC_EXTRA_LOG_REDACT_PATHS`。
- [x] 3.5 移除 OIDC 应用事件日志对象中重复手写的 `sourceApp` 字段，保留由 logger binding 注入的值。
- [x] 3.6 检查 app package 依赖边界，确认 `pino-pretty` 只作为共享 logger 实现细节存在；如移除 app 直接依赖会扩大 diff，则记录后续清理。

## 4. OIDC Access Logging

- [x] 4.1 在 `createOidcHttpServer` 外层添加 request log lifecycle，记录开始时间并在 `finish`/`close` 时输出最终 access log。
- [x] 4.2 为 `/health`、`/oidc/interaction/:uid`、`/oidc/resume`、provider callback 和非 OIDC 404 实现低基数 route 分类。
- [x] 4.3 在可用时为 OIDC provider callback access log 附加 `oidcRoute`，但不替代 `route`。
- [x] 4.4 确保异常请求同时保留 OIDC 错误事件日志与 `http.request.completed` access log，并共享同一 requestId。
- [x] 4.5 对 response close 且未正常 finish 的请求记录 `aborted = true` 或等价字段。

## 5. Tests And Verification

- [x] 5.1 为共享 logger 增加 focused tests，覆盖 `LOG_FORMAT` 解析、JSON/pretty transport 选择、redaction 合并去重和多 logger 配置隔离。
- [x] 5.2 为共享 request log helper 增加 focused tests，覆盖 status level、trace header 优先级、requestId fallback、clientIp 和 userAgent 提取。
- [x] 5.3 更新 `packages/api-core` request logging tests，证明 `api`/`admin-api` Hono access log 字段仍符合合同。
- [x] 5.4 更新 `apps/oidc-provider` logger tests，证明 OIDC 专属敏感字段继续脱敏且 logger 使用共享 `sourceApp` binding。
- [x] 5.5 增加或更新 `apps/oidc-provider` HTTP server tests，覆盖 `/health`、interaction/resume、provider callback、404、异常和 aborted access log 行为。
- [x] 5.6 运行最窄有意义验证：`pnpm --filter @iam/api-core test`、`pnpm --filter @iam/oidc-provider test`，以及受影响后端的 `typecheck`。
