## 背景

`apps/admin-api/src/services/employment/employment.service.ts` 包含管理端任职生命周期规则，包括创建任职、编辑有效任职、更新状态、软删除、调岗、设为主岗和用户离职。这些操作都在 `db.transaction` 中执行，并协调多个 repository，因此单元测试需要隔离 Drizzle、PostgreSQL、Redis 和网络依赖，只验证 service 层的业务编排。

最接近的现有测试模式是 `apps/admin-api/src/services/position/__tests__/position.service.test.ts`：它使用 `bun:test`、`mock.module`、repository mock，以及 mock 后的 `@iam/db` transaction callback。

## 目标 / 非目标

**目标：**

- 为管理端任职生命周期 service 业务规则补充聚焦的单元测试覆盖。
- Mock `@iam/db`，让每个 service transaction 都使用同一个测试 `tx` 对象执行。
- Mock employment、user、organization 和 position repository，并断言关键调用参数。
- 验证主岗互斥、调岗顺序、离职顺序、status/endTime 处理，以及 not-found/not-editable 失败分支。
- 对 Date 相关行为保持确定性：优先使用固定时间；不需要精确相等时断言值为 Date 实例。

**非目标：**

- 不连接真实数据库，也不测试 Drizzle query builder。
- 不改变 REST、tRPC、schema、migration、frontend、Redis 或网络行为。
- 不修改 service 实现逻辑，除非测试揭示明确现有 bug；任何这类行为变更都需要先确认风险。
- 不把本次变更扩展为 repository 集成测试或端到端 API 测试。

## 决策

- 对所有 service 依赖使用 `bun:test` 和 `mock.module`。
  - 理由：这与现有 admin-api 单元测试风格一致，并能保持测试快速、聚焦。
  - 备选方案：重构为依赖注入。拒绝原因：本次范围只补测试，重构 service wiring 会增加行为变更风险。

- 将 `@iam/db` transaction mock 为 `callback(tx)`，并在所有断言中复用稳定的 `tx` 对象。
  - 理由：service 规则依赖事务内 repository 调用，断言同一个 transaction 对象能证明事务上下文被正确传递。
  - 备选方案：在 callback 中直接使用 `{}`。拒绝原因：命名的稳定对象让调用参数断言更清晰。

- 在注册所有 `mock.module` 之后再 import `employment.service.ts`。
  - 理由：ESM module binding 在 import 时确定，必须先安装 mock 再导入被测 service。
  - 备选方案：每个测试重新 import。除非后续发现模块状态隔离问题，否则通过 `beforeEach` reset mock 已足够。

- 用户、组织、岗位和任职 fixture 只包含 service 逻辑实际使用的最小字段。
  - 理由：完整 DB 形状 fixture 会让测试噪声更高，也更脆弱。
  - 备选方案：使用完整 schema fixture。拒绝原因：被测 service 只基于少量字段分支，并把 id/status 等值继续传给 repository。

- Date 敏感路径使用确定性期望。
  - 理由：调岗和状态禁用会写入 `new Date()`，创建和调岗也可能消费传入的 `startTime`。
  - 备选方案：只断言 `expect.any(Date)`。在精确时间不重要时可以接受，但固定时间更利于验证顺序和缺省 startTime 行为。

## 风险 / 取舍

- Mock 路径可能与 service import alias 不一致 -> 通过运行聚焦 Bun 测试验证，并按 `employment.service.ts` 的实际 import specifier 调整 mock。
- 测试可能固化当前存疑行为，例如通过 `updateEmploymentStatus` 恢复已结束任职 -> 除非确认这是 bug，否则将其作为现有行为纳入测试。
- Repository mock 无法发现 repository 层 query 问题 -> 本次范围是 service 业务规则，暂不覆盖 Drizzle 集成风险。
- 全量 `bun test` 可能暴露其他包的既有失败 -> 单独记录这些失败，并保持本次变更聚焦新增 employment service 单元测试。
