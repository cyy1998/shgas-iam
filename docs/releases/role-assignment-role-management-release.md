# 角色分配统一与角色管理发布手册

Type: runbook
Status: Current
Last verified: 2026-07-03
Next review: 2026-10-31

## 适用范围

本手册用于发布统一 `role_assignment` 表、角色授权聚合和 admin `/roles` 角色管理页面。事实来源包括
`openspec/specs/authorization-model/spec.md`、`openspec/specs/admin-role-management/spec.md`、
`openspec/specs/user-profile-read-model/spec.md`、`packages/db/src/schema/core/role-assignments.ts`、
`apps/admin-api/src/services/role/role.service.ts` 和 `apps/admin/src/pages/roles/`。

该发布会把旧 `employment_role`、`organization_role`、`position_role` 三表分配语义迁移到统一
`role_assignment`，并让 API、admin-api、OIDC claims 和 user-profile read model 从统一表读取角色。

## 发布前置条件

- 已审查 `role_assignment` migration：创建新表、从旧三表 backfill、保留 `organization_role.is_all_sub`
  到 `include_descendants`，再删除旧三张分配表。
- 已确认备份或可恢复快照覆盖旧三表、`role`、`role_privilege`、`organization_closure` 和相关用户数据。
- 已确认 `@iam/api`、`@iam/admin-api`、`@iam/oidc-provider`、`@iam/admin`、
  `@iam/user-profile-read-model` 和 `@iam/worker` 来自同一兼容版本。
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

- API/admin-api 角色聚合：选择一个包含岗位、组织和任职直接角色的测试用户，确认用户详情、用户搜索和授权解析只来自
  `role_assignment`，且同一 role 多来源命中时只保留一个 role code。
- OIDC claims：使用启用 OIDC 的测试 client 完成 authorize/token/UserInfo，确认角色与权限 claims 与同一用户的
  admin/API 视角一致。
- Admin API：调用 `/admin/roles` 搜索、详情、创建、更新、状态变更、删除和分配管理路由；删除仍存在
  `role_assignment` 的角色应被拒绝。
- Admin UI：打开 `/roles` 页面，完成角色列表、详情抽屉、创建 organization/position/employment 分配、修改组织
  `includeDescendants`、删除分配和状态展示 smoke。
- User-profile dirty：创建、删除或修改角色分配后，确认事务内写入 `user_profile_dirty`，reason 为
  `UserProfileDirtyReason.RoleUpdated`，并在提交后唤醒 worker。
- Worker 日志：确认受影响 scope 展开后日志包含 `userId`、`dirtyVersion`、`jobId` 和 `jobName`。

## 证据留存

记录以下摘要即可，不要保存完整个人资料或权限清单：

| 证据 | 摘要 |
|---|---|
| migration | 新表创建、旧三表 backfill 数量、旧表删除确认。 |
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
