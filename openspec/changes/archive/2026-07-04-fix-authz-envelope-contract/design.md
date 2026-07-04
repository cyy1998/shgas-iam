## Context

`/auth/authz` 是 custom SSO 网关鉴权入口。当前实现会校验 `Client`、`X-Forwarded-Uri` 和 local session token，成功后把 `{ username, id }` 编码为 base64 字符串，同时写入 `X-User-Info` header 和成功响应 envelope 的 `data` 字段。

现有 OpenAPI route definition 把 `/auth/authz` 成功响应 `data` 声明为 `z.object()`，但运行时返回字符串。这个漂移没有被 TypeScript 拦住，是因为 `packages/api-core/src/http/response.ts` 中 `makeResponse` 返回 `any`，导致 `resp.ok(data)` 经 `c.json(...)` 传给 `RouteHandler` 时丢失了实际 body 类型。

Hono/zod-openapi 已经能从 route response schema 推导 handler 期望返回类型。本变更不新增独立契约系统，而是恢复既有类型链路：

```text
OpenAPI route schema
  -> RouteConfigToTypedResponse<typeof route>
  -> AuthRouteHandler<"authz">
  -> c.json(resp.ok(data))
  -> ApiEnvelope<typeof data>
```

## Goals / Non-Goals

**Goals:**

- 让 `/auth/authz` 的 OpenAPI 成功响应与当前运行时行为一致。
- 让 `resp.ok/fail` 返回具体 `ApiEnvelope<T>`，避免 envelope 被 `any` 擦除。
- 让 route handler 的显式类型注解重新校验 `resp.ok(data)` 是否匹配 OpenAPI response schema。
- 让 admin-api REST adapter 在生成 REST handler 时保留相同的 envelope 类型护栏。
- 用聚焦测试覆盖本次契约风险。

**Non-Goals:**

- 不改变 `/auth/authz` 的运行时 JSON body、`X-User-Info` header 或 base64 用户摘要格式。
- 不调整 Session Kernel、custom SSO local session 校验、用户实时校验或维护模式语义。
- 不修改错误 envelope 的外部响应结构。
- 不处理审查报告中的其它 P1/P2 问题，例如 employment 唯一约束或验证码 reserve/confirm。
- 不引入 OpenAPI client codegen 或新的运行时响应校验框架。

## Decisions

### Decision: `/auth/authz` 文档匹配当前字符串响应

采用方案：将 `/auth/authz` 成功 response schema 从 `createSuccessResponseSchema(z.object())` 改为 `createSuccessResponseSchema(z.string())`。

理由：

- 当前生产行为和已有 handler 测试都表明调用方收到的是 base64 字符串。
- `authentication-sessions` 现有主 spec 已描述 `/auth/authz` 将 `{ username, id }` 编码为 base64 字符串，并作为成功响应数据返回。
- 先修正文档可以避免对网关或客户端造成行为变更。

备选方案：

- 改实现返回对象，例如 `{ userInfo: string }` 或 `{ username, id }`。不采用，因为这会改变已存在的外部 contract，需要另开兼容迁移设计。

### Decision: 在 `api-core` 定义泛型 `ApiEnvelope<TData, TCode>`

采用方案：在 `packages/api-core/src/http/response.ts` 中导出共享 envelope 类型，并让 `makeResponse`、`ok`、`fail` 返回泛型 envelope。

目标类型形态：

```ts
export type ResponseCode = number | string;

export interface ApiEnvelope<TData = null, TCode extends ResponseCode = ResponseCode> {
  code: TCode;
  data: TData;
  message: string;
}
```

`ok<TData>()` 返回 `ApiEnvelope<TData, 200>`，`fail<TData, TCode>()` 保留错误码和错误 data 的类型。运行时输出仍为 `{ code, data, message }`。

理由：

- `c.json(...)` 会把 object 的 TypeScript 类型转换为 Hono `TypedResponse`，只要 `resp.ok` 不返回 `any`，Hono/zod-openapi 的 `RouteHandler` 就能比对实际 body 和 route schema。
- 中央 helper 修复能覆盖 `apps/api` 和 `apps/admin-api` 的主要 REST 响应路径。
- 泛型类型不影响运行时 JSON，也不会改变错误处理语义。

备选方案：

- 只在 `/auth/authz` handler 手写返回类型。该方案只能修一个端点，不能修复 envelope 被 `any` 擦除的根因。
- 在每个 handler 添加 Zod runtime parse。该方案能提高运行时安全性，但侵入面大、成本高，不适合作为本次 P1 快速护栏。

### Decision: `createSuccessResponseSchema` 继续作为 OpenAPI schema helper

采用方案：保留 `createSuccessResponseSchema(dataSchema)` 的现有运行方式，不把 `ApiEnvelope<T>` 反向塞进 Zod helper。

理由：

- `ApiEnvelope<T>` 是 TypeScript 静态类型，`createSuccessResponseSchema` 是运行时/OpenAPI schema helper，两者职责不同。
- 只要 envelope 字段结构一致，route schema 仍由 Zod 作为 OpenAPI source of truth。
- 后续如需复用 error/success envelope schema，可以另行收敛 schema helper 命名，不扩大本次范围。

备选方案：

- 新增统一 `createApiEnvelopeSchema` 并迁移所有 success/error schema。该方案更完整，但会碰到错误 schema、validation schema 和 protocol exception，超出本次两个 P1 的边界。

### Decision: admin-api adapter 不得绕过 envelope 类型护栏

采用方案：收紧 `apps/admin-api/src/lib/admin-api-adapter.ts` 中 REST `toHandler` 的类型边界，让 generated REST handler 的 `resp.ok(data)` 类型需要与调用方传入的 `AdminRouteHandler` 兼容。

理由：

- admin REST route 通过 `.toHandler<SpecificRouteHandler>()` 绑定 OpenAPI route schema，但当前实现使用 `as THandler`，会弱化编译期检查。
- `resp.ok<T>` 泛型化后，如果 adapter 仍无条件强转，admin REST 不能完整受益。
- 该收紧只影响 TypeScript 编译期，不改变 tRPC resolver 或 REST runtime behavior。

备选方案：

- 暂时不动 admin adapter。该方案能修 `/auth/authz`，但无法保证共享 envelope 护栏覆盖另一个主要 REST 应用。

## Risks / Trade-offs

- [Risk] `ok()` 默认参数从 `unknown = null` 改为泛型默认时可能触发 TypeScript 推断边角问题。
  Mitigation: 保持 `ok()` 无参返回 `ApiEnvelope<null, 200>`，并用现有 response helper 测试和 backend typecheck 验证。

- [Risk] 泛型化后暴露出其它 route handler 与 OpenAPI schema 的既有漂移。
  Mitigation: 视为护栏生效；本 change 只修与本次范围直接相关的漂移，若发现更多端点漂移，优先以测试证据记录并拆分处理。

- [Risk] admin adapter 类型收紧可能需要小幅调整 helper 泛型签名。
  Mitigation: 只修改 adapter typing，不改变 `defineAdminApiQueryOperation`、`defineAdminApiMutationOperation` 的调用 API 和 runtime flow。

- [Risk] `/auth/authz` 文档从对象改为字符串会改变 OpenAPI client 生成结果。
  Mitigation: 该改变使文档匹配现有运行时行为，属于修正文档漂移；不改变实际响应。

## Migration Plan

1. 更新 OpenAPI route schema 和 envelope helper 类型。
2. 更新或补充聚焦测试，证明 `/auth/authz` schema 接受字符串并拒绝对象。
3. 运行受影响 package 的测试和 typecheck。
4. 发布时不需要数据迁移或运行时开关；如需回滚，可回滚代码改动，运行时响应本身不会发生变化。

## Open Questions

- 是否需要在后续 change 中为所有 REST route 引入统一的 type-level contract test 模式。本次只要求恢复 helper 类型链路和补聚焦测试。
