## ADDED Requirements

### Requirement: UnitOfWork Carries Optional Observability Context
共享 UnitOfWork 基础设施 SHALL 支持可选 observability context，使 afterCommit 副作用失败日志可以继承发起 transaction 的 requestId 和 traceId，同时保持 UnitOfWork app-agnostic。

#### Scenario: Transaction accepts observability options
- **WHEN** service code 调用 `uow.transaction(...)` 并提供 observability context
- **THEN** shared UnitOfWork SHALL 接收 `requestId` 和 `traceId` 中可用字段
- **AND** transaction callback 接收的 tx-bound ports 和 `afterCommit` registration API SHALL 保持不变
- **AND** 未提供 observability options 的既有调用 SHALL 继续可用

#### Scenario: afterCommit failure log includes observability context
- **WHEN** required 或 best-effort afterCommit task 在 transaction commit 后抛出异常
- **THEN** UnitOfWork SHALL 通过注入 logger 输出失败日志
- **AND** 日志 SHALL 包含 afterCommit task name、mode、err、requestId 和 traceId
- **AND** 缺少 observability context 时 requestId 和 traceId SHALL 记录为 null

#### Scenario: Observability context remains app agnostic
- **WHEN** `api` 或 `admin-api` composition root 创建 production UnitOfWork
- **THEN** shared UnitOfWork SHALL 只依赖最小 `requestId`/`traceId` 结构
- **AND** shared UnitOfWork MUST NOT import Hono、app-local audit context、app-local logger singleton、repository 或 concrete DbClient 类型

#### Scenario: UnitOfWork test fake preserves observability logging
- **WHEN** service tests 使用 shared immediate UnitOfWork fake 并传入 observability context
- **THEN** fake SHALL 在执行 afterCommit tasks 时保留 requestId 和 traceId
- **AND** afterCommit failure assertion SHALL 能验证这些字段
