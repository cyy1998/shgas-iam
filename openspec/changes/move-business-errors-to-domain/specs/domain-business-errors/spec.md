## ADDED Requirements

### Requirement: 稳定业务错误归属 domain
系统 SHALL 将稳定、跨 app 复用的业务错误类定义在对应 `@iam/domain/<domain>` 子模块中，并从该子模块导出。

#### Scenario: 跨 app 业务服务需要抛出领域错误
- **WHEN** `apps/api` 和 `apps/admin-api` 都需要表达同一个稳定业务失败，例如组织不存在或用户不存在
- **THEN** 对应错误类 SHALL 从 `@iam/domain/<domain>` 导入
- **AND** 对应错误类 SHALL NOT 以 `@iam/api-core/errors` 作为长期定义来源

#### Scenario: domain 子模块导出业务错误
- **WHEN** `packages/domain/src/<domain>/` 定义稳定业务错误类
- **THEN** 该 domain 子模块的 `index.ts` SHALL 导出这些错误类
- **AND** `packages/domain/src/index.ts` SHALL 继续聚合导出该 domain 子模块

### Requirement: domain 业务错误保持 API runtime error 结构
domain 业务错误 SHALL 提供可被 API error handler 和 tRPC mapper 识别的 runtime error 结构。

#### Scenario: domain 业务错误被抛出
- **WHEN** 后端 service 抛出 domain 业务错误
- **THEN** 该错误 SHALL 携带 `message`
- **AND** 该错误 SHALL 携带稳定 string `code`
- **AND** 该错误 SHALL 携带 numeric `httpStatus`
- **AND** 该错误 SHALL 携带可诊断的 `name`

#### Scenario: domain 错误选择业务码
- **WHEN** domain 业务错误需要表达客户端可分支处理的失败原因
- **THEN** 该错误 SHALL 使用 `@iam/contracts` 中已有或新增的 `ApiErrorCode`
- **AND** 该错误 SHALL NOT 在 domain 包中定义替代 error code 来源

### Requirement: domain 不依赖 api-core
`@iam/domain` SHALL NOT depend on `@iam/api-core` for business error base classes, HTTP constants, error handlers, or response helpers.

#### Scenario: 定义 domain 业务错误基类
- **WHEN** `@iam/domain` 需要复用业务错误结构
- **THEN** 该结构 SHALL 定义在 `@iam/domain` 内部或依赖 `@iam/contracts` 中的共享协议类型
- **AND** 该结构 SHALL NOT import `CustomError` from `@iam/api-core`

#### Scenario: api-core 处理 domain 业务错误
- **WHEN** `@iam/api-core` 需要序列化 domain 业务错误
- **THEN** `@iam/api-core` SHALL use a structural check or shared contract-level shape
- **AND** `@iam/api-core` SHALL NOT depend on concrete `@iam/domain/<domain>` error classes

### Requirement: 错误归属按语义范围分类
系统 SHALL 按错误语义范围决定错误定义位置，避免将 app-local 或 integration-local 错误提升为 domain 稳定语义。

#### Scenario: 错误属于横切 API 基础设施
- **WHEN** 错误表达 unauthorized、forbidden、maintenance、HTTP exception adaptation 或 response envelope behavior
- **THEN** 该错误或适配逻辑 SHALL remain in `@iam/api-core`

#### Scenario: 错误属于单个 app 或 integration
- **WHEN** 错误只属于单个 app route、单个 third-party integration 或临时边界转换
- **THEN** 该错误 SHALL remain near the owning app, route, service, or integration
- **AND** 该错误 SHALL NOT be moved to `@iam/domain` unless it becomes stable cross-app domain semantics

#### Scenario: 错误属于稳定业务领域
- **WHEN** 错误表达 user、organization、position、employment、client、privilege 等稳定业务领域规则
- **THEN** 该错误 SHALL be owned by the corresponding `@iam/domain/<domain>` module
