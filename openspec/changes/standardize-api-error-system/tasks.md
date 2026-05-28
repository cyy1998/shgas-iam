## 1. Error Contract Foundation

- [x] 1.1 决定错误响应字段策略：错误响应直接返回字符串 `code`，不保留 `legacyCode` 或旧数字兼容字段，并更新 design 中的 Open Questions 结论
- [x] 1.2 在 `packages/contracts` 中新增字符串业务错误码定义，移除旧数字 `ServiceStatusCode` 出口
- [x] 1.3 扩展 `CustomError`，支持字符串业务 code、HTTP status 和默认 message
- [x] 1.4 调整 Hono `errorHandler`，统一从 `CustomError` 读取业务 code、message 和 HTTP status
- [x] 1.5 调整 `packages/api-core/src/trpc` 和 `apps/admin-api/src/trpc` 的错误格式化与映射，移除基于数字 HTTP code 的业务判断

## 2. Authorization Error Unification

- [x] 2.1 将 `AuthzError` 改为继承 `CustomError`，并保留 HTTP status 字段
- [x] 2.2 更新 `AuthzUnauthorizedError`、`AuthzForbiddenError`、维护错误的字符串业务 code 和 HTTP status
- [x] 2.3 新增正确拼写的 `AuthzMaintenanceError`，保留 `AuthzMaintaincingError` 兼容导出
- [x] 2.4 更新授权中间件、认证服务和 SSO handlers 中的授权错误导入与断言

## 3. Centralized Named Errors

- [x] 3.1 在 `packages/api-core/src/errors/` 新增登录与认证错误：`InvalidLoginCredentialError`、`LoginFailedError`、`InvalidVerificationCodeError`
- [x] 3.2 迁移 `HumanVerificationRequiredError` 到 `api-core/errors`，并新增 `InvalidHumanVerificationSiteError`
- [x] 3.3 新增组织错误：`OrganizationNotFoundError`、`OrganizationAlreadyExistsError`、`OrganizationCodeExistsError`
- [x] 3.4 新增岗位错误：`PositionNotFoundError`、`PositionCodeExistsError`
- [x] 3.5 新增任职错误：`EmploymentAlreadyExistsError`，并为现有任职错误补齐字符串 code 和 HTTP status
- [x] 3.6 新增用户错误：`UsernameAlreadyExistsError`、`InvalidMobileError`、`MobileAlreadyExistsError`、`WeakPasswordError`、`InvalidOldPasswordError`
- [x] 3.7 新增 client 与 SSO 错误：`ClientNotFoundError`、`ClientCodeExistsError`、`InvalidSsoClientError`、`InvalidRedirectUriError`、`InvalidAuthCodeError`
- [x] 3.8 新增权限委托错误：`PrivilegeDelegationNotFoundError`、`PrivilegeDelegationEndedError`、`PrivilegeNotFoundError`、`PrivilegeAlreadyDelegatedError`
- [x] 3.9 新增外部集成错误：`OrcasLoginFailedError`
- [x] 3.10 更新 `packages/api-core/src/errors/index.ts`，统一导出新增错误类

## 4. Backend Usage Migration

- [x] 4.1 保留 `packages/contracts` 的 `LoginCredentialError`，在 `apps/api/src/routes/auth/login-credential.service.ts` 中转换为 `InvalidLoginCredentialError`
- [x] 4.2 替换 `apps/api` 登录、SSO、open、人机校验、mobile、user、organization、privilege delegation 中稳定业务失败的裸 `CustomError`
- [x] 4.3 替换 `apps/admin-api` organization、position、employment、client、user services 中稳定业务失败的裸 `CustomError`
- [x] 4.4 审查剩余裸 `CustomError`，为保留项记录原因或补充后续任务
- [x] 4.5 确认启动期配置错误、前端 `ServiceError`、`contracts` 底层解析错误不被错误迁移误收敛

保留的裸 `CustomError`：`api-core` auth middleware 非法请求、URL 工具解析错误、`apps/api` 内部供应商注册/基础信息缺失、open 重置密码输入边界、短信供应商失败、权限仓储参数缺失、用户同密码与特殊查询参数限制、admin employment ancestor 范围校验。这些不是本次前端分支依赖的稳定业务码，后续可按产品语义再拆具名错误。

## 5. Frontend Compatibility

- [x] 5.1 更新 `apps/sso/src/utils/request.ts`，使用新的字符串错误码分支
- [x] 5.2 更新 `apps/admin/src/utils/request.ts`，使用新的字符串错误码分支
- [x] 5.3 更新 SSO 登录、重置密码、用户信息页面中对未登录、人机校验和维护状态的错误分支判断
- [x] 5.4 确认前端展示文案仍优先使用后端 message，并避免把 HTTP status 当作业务错误原因

## 6. Tests and Verification

- [x] 6.1 更新 `packages/api-core` error handler 和 tRPC 错误映射测试
- [x] 6.2 更新 `apps/api` 登录凭证、人机校验、认证授权和 SSO 相关测试
- [x] 6.3 更新 `apps/admin-api` organization、position、employment、client、user service 测试中对错误类型和 code 的断言
- [x] 6.4 运行 `pnpm --filter @iam/contracts typecheck`
- [x] 6.5 运行 `pnpm --filter @iam/api-core test` 和 `pnpm --filter @iam/api-core typecheck`
- [x] 6.6 运行 `pnpm --filter @iam/api test` 和 `pnpm --filter @iam/api typecheck`
- [x] 6.7 运行 `pnpm --filter @iam/admin-api test` 和 `pnpm --filter @iam/admin-api typecheck`
- [x] 6.8 运行 `pnpm --filter @iam/sso typecheck` 和 `pnpm --filter @iam/admin typecheck`
