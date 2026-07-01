## Why

`user_profile` 已经具备 dirty 表、BullMQ worker 和查询切换能力，但源表写操作还没有系统性标记 profile dirty。需要把用户、任职、组织、岗位等会影响 API profile 的写路径接入 dirty producer，让 read model 能在允许旧数据的前提下持续收敛。

## What Changes

- 在 `apps/api` 和 `apps/admin-api` 的相关写事务中写入 `user_profile_dirty`，并在 commit 后 best-effort enqueue user-profile rebuild 或 scope expansion job。
- 覆盖 profile-relevant 写路径：用户基本资料/状态/删除、手机号绑定、供应商联系人注册、任职创建/更新/状态/删除/转岗/主岗/离职、组织属性/编码/删除、岗位属性/编码/状态/删除。
- 按影响范围选择 producer：已知单个用户使用 user-level dirty/rebuild；组织、岗位等影响多用户的写操作使用 scope expansion；能在事务内得到目标用户集合的操作可直接标记 userIds。
- 保持 `user_profile_dirty` 作为重建真相来源；BullMQ job 仅作为唤醒器，enqueue 失败不得回滚已提交的业务事务。
- 让 `apps/admin-api` 作为 user-profile job producer 只依赖共享 contracts/jobs 和共享 dirty producer port，不导入 `@api` 私有模块。
- 不新增 profile 表结构、worker 消费语义或 public API 行为。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `user-profile-read-model`: 增加源表写操作 dirty producer 契约，定义事务内 dirty 标记、afterCommit enqueue、失败语义和范围选择。
- `admin-user-management`: 管理端用户创建、更新、状态变更和删除后标记对应用户 profile dirty。
- `employment-management`: 管理端任职生命周期变更后标记受影响用户 profile dirty。
- `organization-management`: 管理端组织属性、编码或删除变更后按组织 scope 扩散受影响用户。
- `position-management`: 管理端岗位属性、编码、状态或删除变更后按岗位 scope 扩散受影响用户。
- `directory-and-self-service`: API 自助手机号绑定、内部供应商组织/联系人注册等写路径标记受影响 profile dirty。

## Impact

- Affected code: `apps/api/src/services/user`、`apps/api/src/routes/internal/user`、`apps/api/src/services/organization`、`apps/admin-api/src/services/user`、`apps/admin-api/src/services/employment`、`apps/admin-api/src/services/organization`、`apps/admin-api/src/services/position`、两端 composition、tx/repositories 和测试 fake。
- Affected packages: 可能需要在共享 package 中放置 user-profile dirty producer port/helper，继续复用 `@iam/contracts` job contract、`@iam/jobs` queue helper 和 `@iam/db` schema。
- Runtime impact: 业务写事务成功后 profile 可能短暂陈旧；dirty row 持久化后即使 enqueue 失败也可由 repair/backfill 恢复。job enqueue 是 best-effort 唤醒，不改变主业务响应契约。
