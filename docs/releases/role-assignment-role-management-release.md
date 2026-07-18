# 角色分配统一与角色管理发布手册

Type: runbook
Status: Current
Last verified: 2026-07-18
Next review: 2026-10-31

## 适用范围

本手册用于发布统一 `role_assignment` 表、角色授权聚合和 admin `/roles` 角色管理页面。事实来源包括
`packages/db/src/schema/core/role-assignments.ts`、`apps/admin-api/src/services/role/role.service.ts`、
`apps/admin/src/pages/roles/`、`packages/role-assignment-resolution/test-postgres/role-assignment-resolver.postgres.test.ts`、
`apps/oidc-provider/src/__tests__/authorization.repository.test.ts`，以及 User Profile 的 build/scope repository 测试。

该发布会把旧 `employment_role`、`organization_role`、`position_role` 三表分配语义迁移到统一
`role_assignment`。当前运行时由 `@iam/role-assignment-resolution` 统一解析严格 Effective Role 和保守 dirty scope：
admin-api、OIDC 和 user-profile read model 消费该 seam，API 用户详情读取 user-profile 投影。API 与 Admin 的
transaction composition 都为 scope repository 绑定 transaction resolver。当前 Admin 角色本体变更通过 `RoleId` scope
调用反向 resolver；assignment 变更仍映射为对应的 Organization、Position 或 Employment scope，由 User Profile scope
repository 展开。只有 Admin 角色管理 repository 直接拥有 assignment CRUD。

## 发布前置条件

- 已审查 `role_assignment` migration：创建新表、从旧三表 backfill、保留 `organization_role.is_all_sub`
  到 `include_descendants`，再删除旧三张分配表。
- 已确认备份或可恢复快照覆盖旧三表、`role`、`role_privilege`、`organization_closure` 和相关用户数据。
- 已确认 `@iam/api`、`@iam/admin-api`、`@iam/oidc-provider`、`@iam/admin`、
  `@iam/role-assignment-resolution`、`@iam/user-profile-read-model` 和 `@iam/worker` 来自同一兼容版本。
- 已使用专用非系统测试库运行 resolver 的显式 PostgreSQL 接口测试；测试 harness 不自行启动或管理 Docker 容器。
- 已准备 user-profile worker repair/backfill 操作窗口，用于补救角色变更后的 dirty 唤醒。
- 管理端 smoke 账号具备访问 `/roles` 的 admin 权限。

## 发布顺序

1. 停止会写角色分配的管理端操作入口，避免 migration 期间旧三表继续写入。
2. 应用数据库 migration，确认 `role_assignment` 存在唯一约束 `(role_id, target_type, target_id)`。
3. 核对 backfill 数量：
   - `targetType=employment` 覆盖旧 `employment_role`。
   - `targetType=position` 覆盖旧 `position_role`。
   - `targetType=organization` 覆盖旧 `organization_role`，并保留 `includeDescendants` 语义。
4. 部署 backend、OIDC provider、worker 和 admin 前端。
5. 恢复管理端角色分配写流量。
6. 如发布期间存在 enqueue 失败或 user-profile backlog，运行：

```bash
pnpm --filter @iam/worker user-profile:repair
```

## 一致性 smoke

- API/admin-api 角色聚合：选择一个包含岗位、组织和任职直接角色的测试用户，确认 API 的 User Profile 与 admin 用户/
  任职详情一致，且同一 role 多来源命中时只保留一个 role code。
- OIDC claims：使用启用 OIDC 的测试 client 完成 authorize/token/UserInfo，确认角色与权限 claims 与同一用户的
  admin/API 视角一致，并且不包含其他 client 的角色。
- Admin API：调用 `/admin/roles` 搜索、详情、创建、更新、状态变更、删除和分配管理路由；删除仍存在
  `role_assignment` 的角色应被拒绝。
- Admin UI：打开 `/roles` 页面，完成角色列表、详情抽屉、创建 organization/position/employment 分配、修改组织
  `includeDescendants`、删除分配和状态展示 smoke。
- User-profile dirty：创建、删除或修改角色分配后，确认事务内写入 `user_profile_dirty`，reason 为
  `UserProfileDirtyReason.RoleUpdated`，并在提交后唤醒 worker；停用角色、岗位或组织后仍应覆盖此前可能持有旧授权的
  活跃任职用户。
- Worker 日志：确认受影响 scope 展开后日志包含 `userId`、`dirtyVersion`、`jobId` 和 `jobName`。

## 证据留存

记录以下摘要即可，不要保存完整个人资料或权限清单：

| 证据 | 摘要 |
|---|---|
| migration | 新表创建、旧三表 backfill 数量、旧表删除确认。 |
| resolver | 专用测试库标识、显式 `test:postgres` 结果及严格正向/保守反向矩阵摘要。 |
| API/admin-api | 用户角色聚合一致性、`/admin/roles` 路由 smoke 状态。 |
| admin UI | `/roles` 页面截图或操作结果摘要，避免包含敏感用户资料。 |
| user-profile | dirty 行 reason、repair/backfill enqueue count、worker 完成日志。 |
| OIDC | 测试 client、scope、UserInfo/claims 摘要和 requestId/traceId。 |

## 回滚边界

- migration 删除旧三表后，数据库回滚需要恢复备份或从 `role_assignment` 反向重建旧三表；不要在未验证数据完整性时只回滚代码。
- 如果只发现 admin UI 问题，可临时关闭 `/roles` 页面入口，保留 backend 和 migration。
- 如果角色聚合错误影响登录或授权，先停止角色分配写操作和相关 client 流量，再回滚到已验证的数据库快照与应用版本。
- user-profile dirty enqueue 失败不要求数据库回滚；修复依赖后运行 `user-profile:repair`。
- 回滚完成后必须重新执行角色聚合、admin `/roles`、OIDC claims 和 user-profile dirty smoke。
