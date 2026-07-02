# position-management Specification

## Purpose
描述当前管理端岗位主数据能力，包括岗位搜索、详情、创建、更新、状态变更和软删除约束。该 baseline 只记录已有 admin-api 行为，不声明岗位权限分配的管理能力。
## Requirements
### Requirement: 管理端暴露岗位管理操作
系统 SHALL 通过管理端 REST 和 tRPC 暴露岗位搜索、详情、创建、更新、状态变更和删除操作。

#### Scenario: REST 岗位接口可用
- **WHEN** 调用 `/admin/positions` 下的搜索、详情、创建、更新、状态变更或删除路由
- **THEN** 系统 SHALL 校验请求输入并调用对应 position operation

#### Scenario: tRPC 岗位接口可用
- **WHEN** 管理后台通过 `admin.position` tRPC router 调用岗位操作
- **THEN** 系统 SHALL 复用与 REST 路由一致的 position operation

### Requirement: 搜索和查询岗位
系统 SHALL 从未软删除岗位中查询列表和详情。

#### Scenario: 模糊搜索岗位
- **WHEN** 管理端提交岗位分页查询条件并包含 text
- **THEN** 系统 SHALL 在未软删除岗位中按 `posName` 或 `posCode` 模糊匹配 text
- **AND** 系统 SHALL 将岗位关联的 employments 一并加载用于 VO 映射

#### Scenario: 搜索结果分页
- **WHEN** 岗位搜索返回结果
- **THEN** 系统 SHALL 将岗位 VO 结果按请求分页信息包装返回

#### Scenario: 查询岗位详情
- **WHEN** 管理端按 posCode 查询到未软删除岗位
- **THEN** 系统 SHALL 返回岗位 DTO

#### Scenario: 岗位不存在
- **WHEN** 管理端按 posCode 查询不到未软删除岗位
- **THEN** 系统 SHALL 拒绝请求并报告岗位不存在

### Requirement: 创建岗位
系统 SHALL 在创建岗位时拒绝任何已存在 posCode 的记录。

#### Scenario: 创建重复岗位编码
- **WHEN** 创建岗位请求的 posCode 匹配任意已有岗位记录，包括已软删除记录
- **THEN** 系统 SHALL 拒绝创建并报告重复岗位 code

#### Scenario: 创建新岗位
- **WHEN** 创建岗位请求通过输入校验且 posCode 未存在
- **THEN** 系统 SHALL 插入岗位记录
- **AND** 响应 SHALL 返回 true

### Requirement: 更新岗位与状态
系统 SHALL 在更新岗位或岗位状态前确认目标岗位未软删除，并在重命名 posCode 时防止与任意已有岗位编码冲突。

#### Scenario: 更新不存在岗位
- **WHEN** 管理端更新或变更状态的 posCode 无法匹配未软删除岗位
- **THEN** 系统 SHALL 拒绝请求并报告岗位不存在

#### Scenario: 重命名为已存在岗位编码
- **WHEN** 更新请求包含新的 posCode，且该 posCode 匹配任意已有岗位记录
- **THEN** 系统 SHALL 拒绝请求并报告岗位编码已存在

#### Scenario: 更新岗位字段
- **WHEN** 管理端更新请求通过输入校验且目标岗位存在
- **THEN** 系统 SHALL 更新请求包含的岗位字段

#### Scenario: 更新岗位状态
- **WHEN** 管理端状态变更请求通过输入校验且目标岗位存在
- **THEN** 系统 SHALL 将请求中的 `PositionStatus` 写入该岗位记录

### Requirement: 删除岗位受任职约束
系统 SHALL 仅在岗位不存在未软删除 employment 时软删除岗位。

#### Scenario: 存在任职时拒绝删除
- **WHEN** 待删除岗位关联至少一个未软删除 employment
- **THEN** 系统 SHALL 拒绝删除并报告岗位下存在雇佣关系

#### Scenario: 满足删除约束时软删除
- **WHEN** 待删除岗位存在且没有未软删除 employment
- **THEN** 系统 SHALL 将该岗位 `isDelete` 更新为 `true`
- **AND** 响应 SHALL 返回 true

### Requirement: Position domain errors use centralized API errors
Position management SHALL use centralized named errors for stable position failure cases.

#### Scenario: Position does not exist
- **WHEN** a position operation targets a missing position
- **THEN** the backend SHALL throw a centralized position not found error

#### Scenario: Position code already exists
- **WHEN** creating or renaming a position would duplicate a position code
- **THEN** the backend SHALL throw a centralized position code exists error

#### Scenario: Position cannot be deleted
- **WHEN** a position has active employment relationships
- **THEN** the backend SHALL throw the centralized position has employment error

### Requirement: 管理端岗位写操作标记 profile dirty
管理端岗位写操作 SHALL 标记受影响用户 profile dirty，使 profile 中的 position summary 和搜索文档最终收敛。

#### Scenario: 更新岗位属性标记 users dirty
- **WHEN** 管理端成功更新岗位编码、名称、状态、描述或其它 profile-relevant 字段
- **THEN** 系统 SHALL 在同一事务内解析该岗位 active employments 的用户
- **AND** 系统 SHALL 标记这些用户 profile dirty
- **AND** dirty reason SHALL include `PositionUpdated`

#### Scenario: 删除岗位标记 affected users dirty when present
- **WHEN** 管理端成功软删除岗位
- **THEN** 系统 SHALL 在同一事务内解析该岗位下受影响用户
- **AND** 如果存在受影响用户，系统 SHALL 标记这些用户 profile dirty
- **AND** 如果删除约束保证没有受影响用户，系统 SHALL NOT 创建无目标 dirty 记录

#### Scenario: 创建空岗位不要求 dirty
- **WHEN** 管理端创建尚无任职用户的新岗位
- **THEN** 系统 SHALL NOT 要求为该岗位创建 user profile dirty 记录
- **AND** 后续使用该岗位创建任职 SHALL 由任职写路径标记用户 dirty

#### Scenario: 岗位 scope wake-up is best-effort
- **WHEN** 岗位写事务提交并已持久化受影响用户 dirty
- **THEN** 系统 SHALL best-effort enqueue position scope expansion or rebuild wake-up
- **AND** enqueue failure SHALL NOT remove the persisted dirty rows

## Open Questions
- 删除岗位的计数函数不按 employment status 过滤，只按 `isDelete=false` 过滤；暂停或结束的未软删除 employment 也会阻止删除，这是当前行为，是否符合目标语义需要确认。
- 创建岗位会拒绝已软删除岗位的 posCode 复用；这可能是保守设计，也可能是历史残留。
- 搜索岗位加载所有 employments 后由 VO mapper 计算 memberNumber，是否需要只统计 active employment 未在本轮确认。

## Evidence Review
- 管理端暴露岗位管理操作: 证据 `apps/admin-api/src/routes/admin/position/position.adapter.ts`, `position.index.ts`, `position.routes.ts`, `position.trpc.ts`。状态: 有代码证据。
- 搜索和查询岗位: 证据 `apps/admin-api/src/services/position/position.repository.ts`, `apps/admin-api/src/services/position/position.service.ts`, `apps/admin-api/src/routes/admin/position/position.schema.ts`。状态: 有代码证据。
- 创建岗位: 证据 `apps/admin-api/src/services/position/position.service.ts`, `apps/admin-api/src/services/position/position.repository.ts`, `packages/db/src/schema/core/positions.ts`。状态: 有代码证据。
- 更新岗位与状态: 证据 `apps/admin-api/src/services/position/position.service.ts`, `apps/admin-api/src/services/position/position.repository.ts`, `apps/admin-api/src/services/position/__tests__/position.service.test.ts`, `packages/contracts/src/enums/position.status.ts`。状态: 有代码和测试证据，测试覆盖重命名冲突。
- 删除岗位受任职约束: 证据 `apps/admin-api/src/services/position/position.service.ts`, `apps/admin-api/src/services/position/position.repository.ts`, `packages/db/src/schema/core/employments.ts`。状态: 有代码证据；employment status 语义需人工确认。
