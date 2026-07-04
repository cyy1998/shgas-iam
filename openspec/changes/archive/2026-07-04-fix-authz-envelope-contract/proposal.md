## Why

2026-07-03 软件工程原则审查发现 `/auth/authz` 的 OpenAPI 成功响应与运行时返回不一致，且 `resp.ok/fail` 的响应 envelope 被 `any` 擦除，导致 route handler 无法在编译期发现契约漂移。该问题会影响客户端生成类型、联调文档和后续回归防护，需要优先收敛。

## What Changes

- 修正 `/auth/authz` OpenAPI 成功响应，使 `data` 明确记录为当前运行时返回的 base64 用户摘要字符串。
- 定义共享 `ApiEnvelope<T>` 类型，并让 `resp.ok/fail` 保留 `data` 的泛型类型，不再通过 `any` 擦除响应体。
- 恢复 Hono/zod-openapi route handler 对 `resp.ok(data)` 与 route response schema 的编译期一致性检查。
- 补充聚焦契约测试，覆盖 `/auth/authz` 成功 schema、handler 响应和 response helper envelope 形状。
- 不改变 `/auth/authz` 运行时响应数据结构、`X-User-Info` header、Session Kernel 鉴权逻辑、错误 envelope 或非 envelope 协议例外。

## Capabilities

### New Capabilities

- `rest-response-contracts`: 约束 REST 成功响应 envelope helper、OpenAPI 成功响应 schema 与 route handler 返回类型保持一致。

### Modified Capabilities

- `authentication-sessions`: `/auth/authz` 网关鉴权成功响应的 OpenAPI contract SHALL 与当前 base64 用户摘要字符串行为一致。

## Impact

- 影响代码范围：
  - `packages/api-core/src/http/response.ts`
  - `packages/api-core/src/core/openapi/schemas/create-success-schema.ts`
  - `apps/api/src/routes/auth/auth.routes.ts`
  - `apps/api/src/routes/auth/auth.handlers.ts`
  - `apps/admin-api/src/lib/admin-api-adapter.ts`
- 影响测试范围：
  - `packages/api-core/src/http/__tests__/response.test.ts`
  - `apps/api/src/routes/auth/__tests__/auth.routes.test.ts`
  - `apps/api/src/routes/auth/__tests__/auth.handlers.test.ts`
  - 必要时补充 admin adapter type-level 或运行时契约测试
- 影响 API contract：
  - `/auth/authz` OpenAPI 文档中的成功 envelope `data` 从对象修正为字符串。
  - 运行时 JSON body 和 header 行为保持不变。
- 影响验证：
  - OpenSpec strict validation
  - `@iam/api-core` 测试或 typecheck
  - `@iam/api` 聚焦测试与 typecheck
  - `@iam/admin-api` typecheck，确认 adapter 不绕过 envelope 类型护栏
