## 1. Error Type Foundation

- [x] 1.1 新增 `packages/api-core/src/errors/BadRequestError.ts`，继承 `CustomError` 并固定 `ApiErrorCode.BadRequest` 与 HTTP `400`。
- [x] 1.2 从 `packages/api-core/src/errors/index.ts` 导出 `BadRequestError`。
- [x] 1.3 为 `BadRequestError` 增加单元测试，覆盖默认 message、自定义 message、`code` 和 `httpStatus`。

## 2. Call Site Migration

- [x] 2.1 将缺少 `Client` header 等 API infrastructure 请求前置条件迁移为 `BadRequestError`。
- [x] 2.2 将 open 重置密码输入边界、用户查询参数数量限制、权限委托必要参数缺失等非领域特定客户端错误迁移为 `BadRequestError`。
- [x] 2.3 审查 admin employment 祖先组织约束、用户密码前置条件等稳定业务语义；复用或新增对应 domain error，避免使用裸 `CustomError`。
- [x] 2.4 明确保留真实内部失败的裸 `CustomError` 或后续内部错误类型候选，不将其降级为 4xx。

## 3. Tests

- [x] 3.1 更新 REST error handler 测试，覆盖 `BadRequestError` 返回 `400 COMMON.BAD_REQUEST` 并记录 handled 4xx。
- [x] 3.2 更新 tRPC 错误映射测试，覆盖 `BadRequestError` 映射为 `BAD_REQUEST` 且 formatter 暴露 `serviceCode/serviceMessage/httpStatus`。
- [x] 3.3 更新被迁移调用点的服务、中间件或 route 测试，确认客户端非法请求不再返回 `500 COMMON.INTERNAL_ERROR`。
- [x] 3.4 保留或新增内部失败测试，确认 session、短信供应商等真实内部失败仍返回 `COMMON.INTERNAL_ERROR`。

## 4. Verification

- [x] 4.1 运行 `pnpm --filter @iam/api-core test`。
- [x] 4.2 运行 `pnpm --filter @iam/api-core typecheck`。
- [x] 4.3 运行 `pnpm --filter @iam/api test` 和 `pnpm --filter @iam/api typecheck`。
- [x] 4.4 运行 `pnpm --filter @iam/admin-api test` 和 `pnpm --filter @iam/admin-api typecheck`。
- [x] 4.5 运行 `openspec status --change "add-named-client-request-errors"` 并确认 artifacts apply-ready。
