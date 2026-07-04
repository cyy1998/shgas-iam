## 1. 契约测试先行

- [x] 1.1 在 `apps/api/src/routes/auth/__tests__/auth.routes.test.ts` 增加 `/auth/authz` 成功响应 schema 测试，验证字符串 `data` 通过、对象 `data` 不通过。
- [x] 1.2 在 `apps/api/src/routes/auth/__tests__/auth.handlers.test.ts` 保留并确认 `/auth/authz` handler 同时返回 `resp.ok("user-info")` 和写入 `X-User-Info` header。
- [x] 1.3 在 `packages/api-core/src/http/__tests__/response.test.ts` 覆盖 `resp.ok()`、`resp.ok(data)`、`resp.fail(code, message)` 和 `resp.fail(code, message, data)` 的运行时 envelope 形状。
- [x] 1.4 增加轻量 TypeScript 类型断言，证明 `resp.ok/fail` 返回值不是 `any`，且 `ApiEnvelope<T>` 保留 `data` 类型。
- [x] 1.5 为 `apps/admin-api/src/lib/admin-api-adapter.ts` 增加或调整聚焦测试/类型断言，证明 REST adapter 生成 handler 时不会无约束擦除 envelope 返回类型。

## 2. 响应 envelope 类型修复

- [x] 2.1 在 `packages/api-core/src/http/response.ts` 定义并导出 `ApiEnvelope<TData, TCode>`。
- [x] 2.2 将 `makeResponse` 改为泛型返回 `ApiEnvelope<TData, TCode>`，并保持运行时 `{ code, data, message }` 不变。
- [x] 2.3 将 `ok` 改为泛型返回 `ApiEnvelope<TData, 200>`，并保持无参调用返回 `data: null`。
- [x] 2.4 将 `fail` 改为泛型返回 `ApiEnvelope<TData, TCode>`，并保持未传 diagnostic data 时返回 `data: null`。

## 3. `/auth/authz` OpenAPI 契约修正

- [x] 3.1 将 `apps/api/src/routes/auth/auth.routes.ts` 中 `/auth/authz` 成功响应 schema 从对象 `data` 修正为字符串 `data`。
- [x] 3.2 确认 `apps/api/src/routes/auth/auth.handlers.ts` 不改变运行时行为，仍将 base64 用户摘要字符串写入 `X-User-Info` 并作为 `resp.ok(data)` 返回。
- [x] 3.3 运行聚焦测试，确认 `/auth/authz` route schema 和 handler 行为都与 spec 一致。

## 4. admin-api adapter 类型护栏

- [x] 4.1 收紧 `apps/admin-api/src/lib/admin-api-adapter.ts` 的 `toHandler` 类型边界，使 adapter 生成的 REST handler 返回值必须与调用方 route handler 类型兼容。
- [x] 4.2 保持 `defineAdminApiQueryOperation`、`defineAdminApiMutationOperation`、REST runtime envelope 和 tRPC resolver 行为不变。
- [x] 4.3 运行 admin-api 聚焦测试或 typecheck，确认现有 adapter 调用点仍能通过类型检查。

## 5. 验证

- [x] 5.1 运行 `openspec validate fix-authz-envelope-contract --strict`。
- [x] 5.2 运行 `pnpm --filter @iam/api-core test` 或覆盖 response helper 的聚焦测试命令。
- [x] 5.3 运行 `pnpm --filter @iam/api test` 或覆盖 auth route/handler 的聚焦测试命令。
- [x] 5.4 运行 `pnpm --filter @iam/api typecheck`。
- [x] 5.5 运行 `pnpm --filter @iam/admin-api typecheck`。
