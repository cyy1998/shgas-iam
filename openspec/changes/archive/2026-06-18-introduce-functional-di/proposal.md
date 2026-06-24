## Why

当前两个后端 app 的 route、middleware、service、repository 和基础设施 client 通过 ES module 全局导入互相绑定，业务单测必须在 import 被测模块前使用大量 `mock.module` 替换依赖。这个模式让测试顺序脆弱、fake 难复用，也使模块边界和事务副作用不够清晰。

## What Changes

- **BREAKING** 后端业务模块、route module 和 middleware module 不再导出已绑定生产 singleton；改为导出函数工厂和类型，由 app composition root 显式装配。
- 为 `apps/api` 与 `apps/admin-api` 引入分层 composition root，负责创建 runtime deps、repository、tx-bound ports、service facade、route factory 和 middleware factory 实例。
- service 层改为消费方显式 Port，测试通过注入 fake port 覆盖依赖；枚举、DTO、Zod schema、error class 和纯 helper 继续静态导入，不作为依赖注入对象。
- 引入 `UnitOfWork`、tx-bound ports 和 best-effort `afterCommit` 队列；事务内只访问 tx-bound DB port 和审计 writer，Redis/cache/OIDC/SMS 等不可回滚副作用通过 `afterCommit` 或事务外 root port 执行。
- repository 改为 `createXRepository(db)` 形式绑定 root 或 transaction `DbClient`，业务调用不再显式传递 `tx`。
- audit event helper 改为纯 payload builder；审计写入通过注入的 root/tx `AuditLogWriterPort` 完成。
- integration client 改为 adapter factory，并通过业务语义 Port 暴露给 service；生产实例只在 composition root 中创建。
- 配置、hash/random/clock 等测试敏感 runtime 能力通过最小 config slice 或 runtime Port 注入。
- 新增后端架构测试，防止业务层重新静态导入 app-local service/repository/db/redis/logger 生产依赖。
- 同步迁移后端业务、handler、adapter 和 middleware 测试，使用 DI fake 替代 app-local `mock.module`。

## Capabilities

### New Capabilities
- `backend-functional-di`: 覆盖后端函数工厂式依赖注入、消费方 Port、composition root、UnitOfWork/afterCommit、fake 注入测试和架构护栏。

### Modified Capabilities
- `backend-structure-conventions`: 更新后端入口、route、middleware 和 service/repository 装配约定，使其符合函数工厂 DI。
- `audit-logging`: 更新业务 audit helper 约定，从直接写入审计日志改为纯构建审计事件 payload，并通过注入的 audit writer 写入。

## Impact

- 影响 `apps/api/src` 与 `apps/admin-api/src` 中的 app assembly、route index、handler/adapter、middleware、service、repository、integration client 和相关测试。
- 影响 app-local 测试工具结构，新增局部 fake builder 与 app 级基础设施 fake。
- 不改变 REST path、OpenAPI route definition、tRPC router shape、数据库 schema、业务 DTO、响应 envelope 或外部 API 行为。
- 需要运行两个后端及受影响共享包的 typecheck、lint、测试和新增架构测试。
