## Why

当前角色分配由 `employment_role`、`organization_role`、`position_role` 三张表分别表达，授权解析、OIDC claims 和 user-profile read model 需要在多处重复三套查询逻辑。统一为 `role_assignment` 可以减少分支模型，并为 admin 前端提供一个清晰的角色管理入口。

## What Changes

- **BREAKING**: 数据模型将用 `role_assignment` 替代 `employment_role`、`organization_role` 和 `position_role`；旧三张分配表不再作为运行时 schema 暴露。
- 新增 `role_assignment` 统一表，用 `target_type` 区分 `organization`、`position`、`employment` 三类目标，用 `target_id` 保存对应目标主键。
- 保留组织角色分配的下级组织语义，将旧 `organization_role.is_all_sub` 迁移为 `role_assignment.include_descendants`。
- 更新 API、admin-api、OIDC provider 和 user-profile read model 的角色聚合逻辑，使其从统一分配表解析角色。
- 新增 admin 角色管理能力：角色列表、详情、创建、编辑、状态变更、删除，以及角色分配的分页查看、新增、删除和组织作用范围修改。
- 本次不引入用户直接角色，不修改 `role_privilege` 结构，不提供角色权限绑定管理。

## Capabilities

### New Capabilities

- `admin-role-management`: 管理端角色本体和角色分配的 REST、tRPC 与 admin 前端管理能力。

### Modified Capabilities

- `authorization-model`: 将岗位、组织、任职角色来源从三张分配表改为统一 `role_assignment` 表，并保持现有授权聚合语义。
- `user-profile-read-model`: 将 role scope expansion 和 profile builder 的角色来源改为统一 `role_assignment`，并要求角色分配变更触发受影响用户画像重建。

## Impact

- 数据库：`packages/db` schema、relations、migration 和迁移校验。
- 后端：`apps/api`、`apps/admin-api`、`apps/oidc-provider`、`packages/user-profile-read-model` 的角色解析与 scope 展开查询。
- 管理端 API：新增 admin role REST routes、tRPC router、service、repository、audit event helper 和相关 domain errors/DTO。
- 管理端前端：`apps/admin` 新增 `/roles` 页面、菜单、服务封装、角色详情抽屉和分配管理交互。
- 验证：需要覆盖迁移 backfill、核心角色解析一致性、dirty marker、admin role service/router，以及 admin/admin-api 类型检查。
