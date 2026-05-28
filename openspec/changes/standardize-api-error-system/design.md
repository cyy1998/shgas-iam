## Context

后端目前存在两套运行时错误模型：`CustomError` 负责响应 envelope 的 `code/message`，`AuthzError` 直接继承 `Error` 并额外维护 `httpCode`。Hono error handler 同时识别这两套模型，tRPC 只对 `CustomError` 做格式化和映射，导致授权错误、业务错误和接口传输状态之间的关系不够稳定。

业务代码中还有大量直接 `throw new CustomError(...)` 的场景，错误名称、错误码和 HTTP status 缺乏统一来源。`HumanVerificationRequiredError` 已经是独立错误类但定义在 `apps/api` 内；`LoginCredentialError` 定义在 `packages/contracts`，它是加解密/解析层异常，不适合承载 API 响应语义。

当前 `ServiceStatusCode` 使用数字值，同时包含 `200/401/403/404`、`4281/4031/4001` 和 `99999`，混合了 HTTP status、业务错误码和兼容分支码。后续需要将业务错误码改为字符串，并保留可控兼容路径。

## Goals / Non-Goals

**Goals:**

- 统一后端 API 运行时错误基类，使授权错误、业务错误、人机校验错误和领域错误都能被 Hono 与 tRPC 一致识别。
- 将可复用业务错误集中到 `packages/api-core/src/errors/`，减少 app 内散落错误定义和裸 `CustomError`。
- 将业务错误码改为字符串错误码，并与 HTTP status 分离。
- 保留 `LoginCredentialError` 在 `packages/contracts`，由 API 层转换为 `InvalidLoginCredentialError`。
- 提供兼容迁移路径，避免前端一次性被字符串错误码切断。

**Non-Goals:**

- 不改变 `packages/contracts` 中登录凭证的加解密算法。
- 不把前端 `ServiceError` 纳入后端 `api-core/errors`。
- 不把启动期配置错误、底层 `RangeError`、测试辅助错误统一成业务错误。
- 不在本变更中重写所有业务服务逻辑或调整数据库 schema。

## Decisions

### Decision: `AuthzError` 继承 `CustomError`

`AuthzError` SHALL 继承 `CustomError`，并保留 `httpStatus` 字段。授权错误是 API 运行时错误的一种，应该进入统一错误处理链；HTTP 401/403 和业务 code 的区别由 `httpStatus` 与字符串 `code` 分别表达。

替代方案是继续保留 `AuthzError extends Error`，但这会让 Hono 与 tRPC 继续维护两套识别逻辑，并让授权错误无法自然获得 `CustomError` 的响应字段。

### Decision: `CustomError` 表达业务错误码和 HTTP status

`CustomError` SHALL 以字符串 `code` 表达业务错误原因，以 `httpStatus` 表达传输层状态。默认 HTTP status 可以保持兼容策略，但具名错误类 MUST 显式声明对应状态。

响应 envelope 的业务 `code` 不再被当作 HTTP status 使用。tRPC 映射也不再通过 `err.code === 404` 这种数字比较判断错误类别。

### Decision: 字符串错误码采用命名空间格式

新错误码 SHALL 使用稳定字符串，例如：

- `COMMON.INTERNAL_ERROR`
- `AUTH.UNAUTHORIZED`
- `AUTH.FORBIDDEN`
- `AUTH.MAINTENANCE`
- `LOGIN.INVALID_CREDENTIAL`
- `LOGIN.HUMAN_VERIFICATION_REQUIRED`
- `USER.NOT_FOUND`
- `ORG.NOT_FOUND`
- `POSITION.NOT_FOUND`
- `EMPLOYMENT.NOT_EDITABLE`
- `CLIENT.NOT_FOUND`
- `SSO.INVALID_REDIRECT_URI`
- `PRIVILEGE.DELEGATION_NOT_FOUND`

字符串码比数字分段更容易读、查找和审查，也能避免 `404` 同时代表 HTTP status 和业务错误的歧义。

### Decision: 保留兼容字段或兼容映射

迁移期 SHALL 保留旧数字 code 的兼容能力。可以采用以下任一实现方式：

- 在错误类中维护 `legacyCode`，响应 envelope 同时返回 `code` 和 `legacyCode`。
- 在响应构造层对指定字符串 code 映射旧数字 code，并由前端逐步迁移。

实现时应优先选择最小破坏路径；完成前端迁移后再移除旧数字分支。

### Decision: `LoginCredentialError` 仍在 `contracts`

`LoginCredentialError` SHALL 继续作为底层凭证解析错误定义在 `packages/contracts`，且不依赖 `api-core`。API 层捕获该错误后 SHALL 转换为 `InvalidLoginCredentialError extends CustomError`。

这样可以避免 `contracts -> api-core -> contracts` 的循环依赖，并保持 `contracts` 的纯协议/算法边界。

### Decision: 具名错误优先，裸 `CustomError` 收敛

可识别、可复用、会影响前端分支或测试断言的错误 SHALL 定义为具名错误类。裸 `CustomError` 仅保留给临时未分类错误、边界包装错误或确实没有复用价值的通用失败。

## Risks / Trade-offs

- [Risk] 字符串错误码会影响前端对 `body.code` 的判断 → 通过兼容字段或映射分阶段迁移，并先覆盖未登录、维护、人机校验等关键分支。
- [Risk] 一次性新增过多错误类会产生命名不一致 → 先按现有域分组，集中从 `api-core/errors/index.ts` 导出，并在任务中列出优先级。
- [Risk] Hono 与 tRPC 响应形状不一致 → 统一通过 `CustomError` 的 `code/message/httpStatus` 映射，并补充两侧测试。
- [Risk] `ServiceStatusCode` 当前被前后端共同使用 → 新增字符串错误码时保留旧枚举或兼容别名，待前端迁移完成再清理。
- [Risk] `AuthzMaintaincingError` 拼写修正可能影响导入路径 → 新增正确拼写 `AuthzMaintenanceError`，保留旧导出作为兼容别名。

## Migration Plan

1. 扩展错误基础类型：让 `CustomError` 支持字符串 `code`、`httpStatus` 和兼容旧 code 的能力。
2. 调整 `AuthzError` 继承关系，并更新 Hono/tRPC 的错误映射。
3. 新增第一批集中错误类，优先覆盖登录、授权、人机校验、client/SSO、组织、岗位、任职、用户和权限委托。
4. 将 `LoginCredentialError` 在 API 层转换为 `InvalidLoginCredentialError`。
5. 替换高频裸 `CustomError` 使用点，保留低价值通用失败作为后续清理候选。
6. 更新前端请求层对未登录、维护、人机校验等 code 的兼容判断。
7. 补充后端单元测试和前端类型检查，确认兼容期响应仍可被现有流程处理。

## Open Questions

- 已决定：兼容期响应 envelope 使用 `{ code: string, legacyCode?: number }`。成功响应继续返回旧 `ServiceStatusCode.Success`，错误响应的 `code` 迁移为字符串业务码，`legacyCode` 提供旧数字分支兼容。
- 旧数字 `ServiceStatusCode` 暂作为兼容出口保留，迁移窗口到前端与外部调用方全部切换到字符串业务码后再单独清理。
- 先保持 `packages/api-core/src/errors` 单层文件结构，降低本次迁移冲突与导入 churn；后续若错误类继续增长，再按 domain 拆分。
