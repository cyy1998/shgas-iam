## 1. 共享 producer 基础设施

- [x] 1.1 将 user-profile job producer 从 `@api` 私有模块抽到共享可复用模块，确保 `apps/admin-api` 不需要 import `@api/*`。
- [x] 1.2 提供 user-profile dirty marker port/helper，支持 `markUsersDirty`、`markScopeDirty`、reason merge、deterministic jobId 和 afterCommit wake-up 注册。
- [x] 1.3 为 dirty repository 增加 bulk upsert 能力，用于在事务内批量持久化 user dirty rows。
- [x] 1.4 为 scope repository/dirty marker 增加事务内解析 organization、position、employment、userIds 等 scope 到 userIds 的能力。
- [x] 1.5 扩展 repair 逻辑，扫描 stale pending dirty rows 并重新 enqueue rebuild jobs。
- [x] 1.6 在 `apps/api` 和 `apps/admin-api` composition 中装配 user-profile dirty repository、scope repository、job queue producer 和 dirty marker ports。
- [x] 1.7 增加或更新架构测试，阻止 `apps/admin-api` import `@api` 私有 user-profile producer 模块。

## 2. apps/api 写路径接入

- [x] 2.1 在自助 `setMobile` 成功事务内标记当前 userId dirty，并在 commit 后 best-effort enqueue rebuild job。
- [x] 2.2 在 internal 供应商联系人注册中，创建新用户/任职或为已有用户新增任职时标记目标用户 dirty。
- [x] 2.3 在 internal 供应商联系人注册中，已有用户且相同 active employment 已存在时不创建新的 dirty 记录。
- [x] 2.4 在 API internal organization update 路径中，对 profile-relevant 组织变更持久化 descendant users dirty，并 afterCommit 唤醒 worker。
- [x] 2.5 确认 password change、reset password、验证码消费和权限委托写操作不会因为非 profile 字段变化产生 dirty。

## 3. apps/admin-api 写路径接入

- [x] 3.1 在管理端用户创建、资料更新、状态变更和删除事务内标记对应用户 dirty，重置密码不标记 dirty。
- [x] 3.2 在管理端任职创建、更新、状态变更、删除、转岗、设主岗和离职事务内标记受影响用户 dirty。
- [x] 3.3 在管理端组织更新、状态变更和删除事务内解析组织 descendant users 并标记 dirty；创建空组织不要求 dirty。
- [x] 3.4 在管理端岗位更新、状态变更和删除事务内解析岗位 active employment users 并标记 dirty；创建空岗位不要求 dirty。
- [x] 3.5 保持现有 session revoke、audit log 和业务响应语义，profile enqueue failure 仅记录为 best-effort afterCommit failure。

## 4. 测试覆盖

- [x] 4.1 为共享 job producer/dirty marker 增加单元测试，覆盖 payload 校验、jobId、reason merge、afterCommit enqueue failure 和 no rollback 语义。
- [x] 4.2 为 dirty repository 和 repair 增加单元测试，覆盖 bulk upsert、stale pending 扫描和 pending rebuild 重新 enqueue。
- [x] 4.3 更新 `apps/api` 用户、自助、internal user 和 organization 服务/handler 测试，断言正确 dirty 标记和不应标记的路径。
- [x] 4.4 更新 `apps/admin-api` user、employment、organization、position 服务测试，断言事务内 dirty 与 afterCommit wake-up 注册。
- [x] 4.5 更新 composition/architecture 测试，覆盖 admin-api producer wiring 和禁止 `@api` 私有 import。

## 5. 验证

- [x] 5.1 运行 `pnpm --filter @iam/jobs test` 和相关共享 package typecheck。
- [x] 5.2 运行 `pnpm --filter @iam/api test` 与 `pnpm --filter @iam/api typecheck`。
- [x] 5.3 运行 `pnpm --filter @iam/admin-api test` 与 `pnpm --filter @iam/admin-api typecheck`。
- [x] 5.4 运行 `openspec validate wire-profile-dirty-producers --strict`。
