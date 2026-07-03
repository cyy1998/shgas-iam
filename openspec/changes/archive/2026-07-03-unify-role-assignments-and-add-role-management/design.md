## Context

当前角色本体保存在 `role` 表，权限关联保存在 `role_privilege`，角色分配分别保存在 `employment_role`、`organization_role` 和 `position_role`。`apps/api`、`apps/admin-api`、`apps/oidc-provider` 和 `@iam/user-profile-read-model` 都直接读取三张角色分配表来聚合任职角色。

admin 前端目前可以管理用户、组织、岗位、任职和应用，但没有角色管理入口。角色分配也没有统一管理界面，导致授权模型可读性和可维护性都偏弱。

## Goals / Non-Goals

**Goals:**

- 用 `role_assignment` 统一表达现有组织、岗位和任职三类角色分配。
- 保持现有授权语义：角色只通过 active role 生效，组织分配可选择是否作用下级组织，同一任职聚合结果按 role 去重。
- 新增 admin 角色管理 REST、tRPC 和前端页面，支持角色本体和角色分配管理。
- 角色分配变更后标记受影响 user-profile dirty，使异步画像和 OIDC/授权读取最终一致。
- 提供迁移和回归测试，证明旧三表数据迁移后核心角色解析结果一致。

**Non-Goals:**

- 不新增 user 直接角色。
- 不修改 `role_privilege` 结构，不提供角色权限绑定 UI 或 API。
- 不引入细粒度 operation privilege 鉴权；admin 管理入口仍沿用现有 `isAdmin` 访问控制。
- 不在组织、岗位、任职页面增加反向角色绑定入口。
- 不在分配列表 v1 中统计实时影响人数。

## Decisions

### 1. 使用 `role_assignment` 统一三类角色分配

`role_assignment` 保存独立 `id`、`role_id`、`target_type`、`target_id`、`include_descendants`、`create_time` 和 `update_time`。`target_type` 使用字符串枚举：`organization`、`position`、`employment`。

理由：三张分表导致查询和迁移成本分散，统一表能让 role scope、admin 分配管理和授权解析共享同一模型。独立 `id` 让前端 rowKey、删除接口和审计 details 更直接。

替代方案是继续保留三表并在服务层封装统一 repository。该方案减少迁移风险，但会让旧模型长期存在，OIDC、read model 和 admin-api 仍需要维护兼容分支。

### 2. 用唯一约束保留“不重复分配”语义

统一表 SHALL 使用 `unique(role_id, target_type, target_id)` 防止同一角色重复分配到同一目标。重复创建分配时返回业务冲突错误；组织分配的 `include_descendants` 修改走单独更新操作。

理由：这延续旧三张 join table 复合主键的约束，同时避免把修改作用范围伪装成重复创建。

### 3. `include_descendants` 只对组织分配有业务意义

数据库层不加 check 约束。应用层 schema/service 负责保证：

- `organization` 分配默认 `includeDescendants=true`，允许 true/false。
- `position` 和 `employment` 分配必须写入或解释为 `false`，API 不允许传入 true。

理由：尊重当前项目 core schema 少用数据库约束的风格，但仍在应用边界避免无意义数据。

### 4. 角色本体保留现有应用归属和状态语义

角色继续归属 `client_id`，创建角色时要求 client 存在且未软删除，但不要求 client 启用。`role_code` 和所属应用创建后不可修改；`role_name`、`description` 和 `status` 可以修改。`RoleStatus.Enable` 才参与授权聚合，`Pause` 和 `Disable` 不生效。

删除角色沿用 `role.is_delete` 软删除。有 `role_assignment` 记录时阻止删除；本次不因 `role_privilege` 记录阻止删除。

理由：`role_code` 是对外授权标识，所属应用参与 OIDC 角色过滤，二者修改会改变下游应用看到的授权语义。软删除保留历史排查能力。

### 5. 更新所有角色读取面到统一表

需要更新：

- `apps/api` 和 `apps/admin-api` 的 employment role repository。
- `apps/oidc-provider` 的 authorization claim repository。
- `@iam/user-profile-read-model` 的 builder 和 scope repository。

角色解析语义保持：

- 岗位分配匹配 `role_assignment.target_type=position` 且 `target_id=employment.pos_id`。
- 任职直接分配匹配 `target_type=employment` 且 `target_id=employment.id`。
- 组织本级分配匹配 `target_type=organization` 且 `target_id=employment.org_id`。
- 组织下级分配匹配 `target_type=organization`、`include_descendants=true` 且 `target_id` 是 employment 组织的 ancestor。
- 结果按 `employmentId + roleId` 去重。

### 6. admin-api 新增角色管理模块

新增 app-local role service/repository/adapter/routes/trpc，延续现有 admin-api pattern：operation factory 同时输出 REST handler 和 tRPC procedure，service 通过 UnitOfWork 写审计和 user-profile dirty。

核心接口：

- `search`：按 `roleCode`/`roleName` 模糊搜索，按 client 和 status 精确筛选，返回分页和 assignment count。
- `detail`：按 `roleCode` 查询角色本体和所属 client 摘要。
- `create`、`update`、`updateStatus`、`delete`。
- `assignments.search`：分页查询角色分配，支持 target type、文本和 includeDescendants 筛选。
- `assignments.create`：通过业务输入创建组织、岗位或任职分配。
- `assignments.updateScope`：仅修改组织分配的 `includeDescendants`。
- `assignments.delete`：物理删除分配。

新增分配时，目标必须存在、未软删除且处于启用状态。角色本身可以处于 Pause 或 Disable，以支持先配置后启用。

### 7. 分配变更写审计并标记画像 dirty

角色本体 mutation 和角色分配 mutation 的审计主 target 均为 `role`。分配对象的 code/name/user 摘要写入 details，便于在角色详情日志中完整追踪。

角色分配新增、删除和组织作用范围变更都必须在事务内用 `UserProfileDirtyReason.RoleUpdated` 标记受影响 scope：

- 组织分配使用 `UserProfileScopeType.OrganizationId`。
- 岗位分配使用 `UserProfileScopeType.PositionId`。
- 任职分配使用 `UserProfileScopeType.EmploymentId`。

删除或修改前必须保留足够的 target 信息，避免关系删除后无法展开受影响用户。

### 8. admin 前端新增 `/roles`

在应用管理附近新增“角色管理”一级菜单。页面使用现有 Umi Max + Ant Design Pro Components 模式：

- 列表：角色编码、角色名称、所属应用、状态、分配数、创建时间、操作。
- 搜索：`roleCode`/`roleName` 模糊搜索，client/status 筛选。
- 详情抽屉：基本信息、分配对象、操作日志。
- 分配对象 tab：分页表格展示类型、对象、作用范围、创建时间和操作；支持新增分配、删除分配、修改组织作用范围。

## Risks / Trade-offs

- 迁移影响面宽，多个应用直接依赖旧三表。→ 用聚合查询单测和迁移校验覆盖 API、admin-api、OIDC provider 与 user-profile read model。
- 删除旧表后回滚成本高。→ 实施前保留迁移脚本清晰记录 backfill 映射；上线前在测试环境验证迁移计数和关键查询一致性。
- `role_assignment` 是多态关联，数据库无法用普通外键约束 target。→ service 创建时校验目标存在、未删除、启用；查询时按 target type 显式 join。
- 不在 DB 层限制 `include_descendants` 可能留下手工脏数据。→ DTO/service 禁止写入，测试覆盖非组织 target 的输入拒绝。
- 分配删除后如果未提前捕获 target scope，可能漏标 dirty。→ service 删除流程先读 assignment 和目标摘要，再删除并标记 scope dirty。

## Migration Plan

1. 在 `packages/contracts` 增加 `RoleAssignmentTargetType` 和 role status label helpers。
2. 在 `packages/db` 增加 `role_assignment` schema、relations、导出和 migration。
3. migration 从旧三表 backfill：
   - `employment_role(employment_id, role_id)` → `target_type='employment'`。
   - `position_role(position_id, role_id)` → `target_type='position'`。
   - `organization_role(organization_id, role_id, is_all_sub)` → `target_type='organization'` 和 `include_descendants=is_all_sub`。
4. 更新所有运行时代码读取 `role_assignment`。
5. 移除旧三张表的 schema/relations/runtime imports，并让迁移最终删除旧表。
6. 增加迁移校验和角色聚合回归测试。
7. 增加 admin-api role module 和 admin `/roles` 页面。

Rollback 策略：如果在删除旧表前发现问题，可以回滚代码到旧查询并保留旧表；如果已执行删除旧表的迁移，回滚需要用 `role_assignment` 按 target type 反向重建旧三表数据。

## Open Questions

暂无。当前已确认不做 user 直接角色、不做权限绑定管理、DB 层不加 `include_descendants` check。
