# 后端实现约定

本文记录后端实现层规则。结构边界和 composition 规则见
[../architecture/backend-architecture.md](../architecture/backend-architecture.md)。

## HTTP Responses 与 OpenAPI

- Route handler 应返回来自 `@iam/api-core/http` 的共享 response envelope，例如成功 JSON response 使用
  `c.json(resp.ok(data))`，显式失败 envelope 使用 `resp.fail(...)`。
- 当现有 error middleware 已能正确映射 domain/API error 时，优先 throw error。
- 在 OpenAPI route definition 和显式非 200 response 中使用 `@iam/api-core/core/http-status-codes` 常量，而不是
  numeric literal。

## Logging

- Runtime diagnostics 使用 app logger（`@api/lib/logger`、`@admin-api/lib/logger`、`@worker/lib/logger` 或 OIDC
  provider logger）。
- 优先使用结构化 Pino 调用，data object 在前、message 在后，例如 `logger.info({ userId }, "user synced")`。
- Application code 中避免使用 `console.log`、`console.warn` 和 `console.error`。
- 可接受的 console 例外包括 env validation、singleton/process lifecycle code、tests、one-off scripts 和 centralized
  error handler。

## Types、Constants 与 Guard Clauses

- Business query 中优先使用来自 `packages/contracts` 或所属模块的 enum 和 constant，避免 magic strings/numbers，
  尤其是 status、type 和 role-like 字段。
- 当 schema 已是 source of truth 时，优先使用 `z.infer<typeof Schema>` 从 Zod schema 派生 TypeScript type。
- 当 simple guard clause 返回单个明显值时，保持简洁，例如 `if (!entity) return null;`。

## Audit 与 Architecture Guards

- `services/audit/events` 下的 backend audit event helper 应是纯 payload builder。
- Service 和 handler 通过注入的 root 或 tx audit writer port 写入 audit payload。
- `apps/api/src/__tests__/architecture.test.ts` 和 `apps/admin-api/src/__tests__/architecture.test.ts` 中的
  architecture guard test 会故意在 forbidden production import 出现时失败。
- 只有在新例外确有理由时，才审慎更新 architecture guard allowlist。
