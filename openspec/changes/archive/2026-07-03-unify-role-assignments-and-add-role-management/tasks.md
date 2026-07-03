## 1. Contracts and Database Model

- [x] 1.1 在 `packages/contracts` 增加 `RoleAssignmentTargetType` 字符串枚举，并为 `RoleStatus` 补充 label/options helper 与测试。
- [x] 1.2 在 `packages/db/src/schema/core` 新增 `role_assignments` Drizzle schema，包含独立 id、roleId、targetType、targetId、includeDescendants、createTime、updateTime 和 `(roleId, targetType, targetId)` 唯一约束。
- [x] 1.3 更新 `packages/db` schema、relations、domain index 和 top-level exports，移除运行时代码对 `employmentRoles`、`organizationRoles`、`positionRoles` 的 schema/relations 依赖。
- [x] 1.4 生成并审查数据库 migration：创建 `role_assignment`，从三张旧表 backfill 数据，保留 `organization_role.is_all_sub` 到 `include_descendants`，再删除旧三张分配表。
- [x] 1.5 增加迁移或 schema 测试，校验 backfill 计数、组织作用范围映射和唯一约束行为。

## 2. Authorization Read Paths

- [x] 2.1 更新 `apps/api` role repository，使 `getRolesByEmploymentId` 从 `role_assignment` 解析岗位、组织和任职直接角色。
- [x] 2.2 更新 `apps/admin-api` role repository，使用户详情和任职详情聚合角色时使用统一分配表。
- [x] 2.3 更新 `apps/oidc-provider` authorization repository，使 OIDC claims 从 `role_assignment` 聚合角色并保持 client 过滤语义。
- [x] 2.4 更新 `@iam/user-profile-read-model` builder，使 profile detail/search_doc 角色来源切换为 `role_assignment` 并按 employmentId+roleId 去重。
- [x] 2.5 更新 `@iam/user-profile-read-model` scope repository，使 RoleId 和 PrivilegeId scope expansion 通过统一分配表反向展开用户。
- [x] 2.6 增加授权聚合回归测试，覆盖岗位、组织本级、组织下级、任职直接、多来源去重和 inactive role 过滤。

## 3. Admin API Role Management

- [x] 3.1 在 `packages/domain` 增加 role DTO、mapper 和业务错误，覆盖角色不存在、角色编码重复、角色仍存在分配、分配重复和非法分配作用范围。
- [x] 3.2 扩展 admin-api role repository，支持角色搜索、详情、创建、更新、状态变更、软删除、分配分页、分配创建、分配作用范围更新、分配删除和分配计数。
- [x] 3.3 新增 admin-api role service，落实 roleCode/client 不可变、删除前检查分配、目标启用校验、重复分配冲突、非组织 includeDescendants 拒绝、审计写入和 user-profile dirty 标记。
- [x] 3.4 新增 role audit event helper，确保角色本体和角色分配 mutation 的审计 target 为 role，分配目标摘要写入 details。
- [x] 3.5 新增 role route schemas、adapter、REST routes、tRPC router，并接入 admin-api composition、admin router 和 app routes。
- [x] 3.6 增加 admin-api role service/adapter 单元测试，覆盖角色 CRUD 约束、分配 CRUD 约束、审计 payload 和 dirty marker 调用。

## 4. Admin Frontend Role Management

- [x] 4.1 在 `apps/admin` 新增 role service wrapper，基于 `AppRouter` 推导 role 输入输出类型。
- [x] 4.2 在 Umi 路由配置中新增 `/roles` “角色管理”菜单，放在应用管理附近并沿用 `isAdmin` access。
- [x] 4.3 实现角色管理列表页，支持角色编码/名称搜索、应用筛选、状态筛选、角色创建、编辑、状态切换和删除。
- [x] 4.4 实现角色详情抽屉，展示基本信息、分配对象 tab 和操作日志 tab。
- [x] 4.5 实现分配对象 tab，支持分页筛选、新增组织/岗位/任职分配、删除分配和修改组织作用范围。
- [x] 4.6 扩展 `StatusTag` 或角色页面状态展示，使 `RoleStatus` 在 admin 前端显示一致。

## 5. Verification

- [x] 5.1 运行 `pnpm --filter @iam/contracts test typecheck` 或等价窄检查。
- [x] 5.2 运行 `pnpm --filter @iam/db db:generate` / `db:check`，并审查生成 migration。
- [x] 5.3 运行受影响后端测试和类型检查：`@iam/api`、`@iam/admin-api`、`@iam/oidc-provider`、`@iam/user-profile-read-model`。
- [x] 5.4 运行 `pnpm --filter @iam/admin typecheck`，并在需要时运行 admin 前端相关测试。
- [x] 5.5 运行 `openspec status --change "unify-role-assignments-and-add-role-management"`，确认 artifacts 和任务状态可追踪。
