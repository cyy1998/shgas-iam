## 为什么

管理端任职生命周期是 IAM 的核心状态机，覆盖用户任职、组织和岗位引用、主岗互斥、调岗、状态流转和离职等关键规则。当前单元测试覆盖不足，难以及时发现这些服务层业务规则的回归，尤其是多数规则由 `employment.service.ts` 编排，而不是完全依赖数据库约束。

## 变更内容

- 为 `apps/admin-api/src/services/employment/employment.service.ts` 添加聚焦的 Bun 单元测试。
- 覆盖创建、更新、状态更新、软删除、调岗、设为主岗和用户离职等服务规则。
- Mock `@iam/db` transaction 和相关 repository，避免测试依赖真实数据库、Redis 或网络。
- 重点断言主岗互斥、调岗和离职流程中的 repository 调用参数和调用顺序。
- 本次变更不修改业务实现逻辑；如果测试揭示明确的现有 bug，先在变更材料中记录为需确认风险，再决定是否调整实现。

## 能力范围

### 新增能力

- 无。

### 修改能力

- `employment-management`: 为既有管理端任职生命周期服务行为补充验证覆盖要求，不改变运行时 API 或领域语义。

## 影响范围

- 受影响代码：`apps/admin-api/src/services/employment/__tests__/employment.service.test.ts`。
- 参考代码：`apps/admin-api/src/services/employment/employment.service.ts`，以及被 mock 的 employment、user、organization、position repository 模块。
- 验证命令：`bun test apps/admin-api/src/services/employment/__tests__/employment.service.test.ts` 和全量 `bun test`。
- 预期不涉及数据库 schema、migration、public API、tRPC contract、frontend、Redis 或网络变更。
