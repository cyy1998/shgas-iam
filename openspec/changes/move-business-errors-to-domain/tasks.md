## 1. Domain Error Structure

- [x] 1.1 在 `@iam/domain` 中新增业务错误基础结构，提供 `message`、`name`、`code`、`httpStatus` runtime shape，且不依赖 `@iam/api-core`
- [x] 1.2 为 `user`、`organization`、`position`、`employment`、`client`、`privilege` 子模块定义清晰跨 app 复用的业务错误类
- [x] 1.3 从各 domain 子模块 `index.ts` 和 `packages/domain/src/index.ts` 导出新增业务错误
- [x] 1.4 为 domain 业务错误补充 focused tests，验证默认 message、`ApiErrorCode`、`httpStatus` 和导出路径

## 2. API Error Handling Adaptation

- [x] 2.1 在 `@iam/api-core` 中增加结构化 API runtime error type guard，识别 `CustomError` 和 domain 业务错误
- [x] 2.2 更新 REST error handler，使 domain 业务错误返回现有 response envelope、business code、message 和 HTTP status
- [x] 2.3 更新 tRPC mapper/error formatter，使 domain 业务错误保持现有 `serviceCode`、`serviceMessage`、`httpStatus` 输出
- [x] 2.4 为 REST error handler 和 tRPC mapper 增加 focused tests，覆盖 `CustomError`、domain 业务错误和 unknown error

## 3. Migration

- [x] 3.1 将 `apps/api` 中稳定业务错误 import 全面迁移到对应 `@iam/domain/<domain>` 子模块
- [x] 3.2 将 `apps/admin-api` 中稳定业务错误 import 全面迁移到对应 `@iam/domain/<domain>` 子模块
- [x] 3.3 从 `@iam/api-core/errors` 移除已迁入 domain 的业务错误定义与导出
- [x] 3.4 复查 SSO、human verification、Orcas integration 等灰区错误，按 design 分类为 domain、api-core 或 app-local，并记录未迁移原因
- [x] 3.5 移除或减少被触达代码中的 generic `CustomError` 稳定业务失败用法，优先使用 named domain error

## 4. Verification

- [x] 4.1 运行 `pnpm --filter @iam/domain test` 和 `pnpm --filter @iam/domain typecheck`
- [x] 4.2 运行 `pnpm --filter @iam/api-core test` 和 `pnpm --filter @iam/api-core typecheck`
- [x] 4.3 运行 `pnpm --filter @iam/api test` 和 `pnpm --filter @iam/api typecheck`
- [x] 4.4 运行 `pnpm --filter @iam/admin-api test` 和 `pnpm --filter @iam/admin-api typecheck`
- [x] 4.5 扫描 `@iam/api-core/errors` 业务错误旧导入，确认已迁入 domain 的业务错误没有剩余旧 import 或兼容导出
