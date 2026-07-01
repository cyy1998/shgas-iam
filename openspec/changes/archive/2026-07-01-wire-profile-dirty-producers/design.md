## Context

当前 `user_profile` 读模型已经包含 dirty 表、worker、scope expansion、backfill/repair 和 BullMQ job contract。`apps/api` 已经开始从 profile 读取用户详情与搜索；如果源表写操作不打脏，profile 会停留在 backfill 时刻，旧数据不会自动收敛。

本 change 的核心是把现有写模型和 profile rebuild 管道连接起来：

- 写事务负责持久化 dirty 事实。
- afterCommit 负责 best-effort 唤醒 BullMQ。
- `apps/api` worker 负责消费并重建。
- `apps/admin-api` 可以生产 user-profile jobs，但不能依赖 `@api` 私有模块。

## Goals / Non-Goals

**Goals:**

- 在 `apps/api` 与 `apps/admin-api` 的 profile-relevant 写路径中标记受影响用户 dirty。
- 对单用户变更使用 user-level dirty；对组织/岗位等扇出变更先持久化展开后的用户 dirty，再 enqueue scope expansion 或 rebuild wake-up。
- 复用 `@iam/contracts` 的 job payload 和 `@iam/jobs` 的 BullMQ queue helper，让 admin-api 不导入 API 私有 producer。
- 让 afterCommit enqueue 失败保持可恢复：业务事务不回滚，dirty row 保留，repair 能重新唤醒 pending/failed/stale dirty。
- 保持 profile 可旧，但确保源表变化最终会触发 profile rebuild。

**Non-Goals:**

- 不新增 profile 表结构或 `user_profile_dirty_scope` 之类的新表。
- 不新增角色/权限管理写接口；仅覆盖当前仓库已有会影响 profile 的写路径。
- 不把 user-profile worker 移到 admin-api；worker 仍由 `apps/api` 独立进程运行。
- 不改变 public/open/internal/admin API 的响应契约。
- 不要求 profile 与源表强一致。

## Decisions

### 1. 事务内写 dirty，afterCommit 只做唤醒

所有 producer 都必须在业务事务内写入 `user_profile_dirty`。afterCommit 仅 enqueue BullMQ job；enqueue 失败记录日志但不回滚业务事务。

备选方案是只在 afterCommit enqueue scope job，由 worker 再展开并写 dirty。这个方案一旦 enqueue 失败就没有持久事实，和“dirty 表是真相来源”的约束冲突。

### 2. 扇出变更在事务内展开到 user dirty

组织、岗位等 scope-level 变更会通过 scope repository 在同一事务内解析受影响 userIds，并 bulk upsert dirty rows。commit 后可以 enqueue scope expansion job 或逐个 rebuild job 来唤醒 worker；无论唤醒是否成功，受影响用户 dirty 都已持久化。

这样会让组织/岗位大范围变更的事务稍重，但避免新增 scope dirty 表，也避免把 BullMQ 当事实来源。后续如果规模压力变大，再独立设计 `user_profile_dirty_scope`。

### 3. 提取共享 producer 边界，避免 admin-api 依赖 @api

`apps/api` 现有 `createUserProfileJobProducer` 和 dirty repository 不能直接被 admin-api import。实现时应将可共享的 job producer/dirty marker port/helper 放到共享 workspace package，或在两个 app 内用同一 port 形状各自装配；无论采用哪种代码组织，admin-api 只允许依赖 `@iam/contracts`、`@iam/jobs`、`@iam/db` 和共享非 app-private 模块。

服务层只消费语义端口，例如 `markUsersDirty`、`markScopeDirty`、`buildRebuildJobId`、`enqueueRebuildJob`、`enqueueScopeExpansionJob`，不直接操作 BullMQ Queue。

### 4. 覆盖 profile-relevant 写路径，避免无意义 dirty

需要打脏的写路径是会进入 `UserDetailDto` 或 `search_doc` 的字段变化：

- 用户基本字段、状态、删除、手机号、wxId、userType。
- 任职的创建、软删、状态、组织/岗位、主岗、开始/结束时间。
- 组织编码、名称、类型、父子路径、删除等会改变 organization context 或 search path 的字段。
- 岗位编码、名称、状态、删除。

密码重置、验证码消费、权限委托创建/更新不进入 profile 文档，不作为本 change 的 dirty 触发源。

### 5. Repair 覆盖 pending dirty

现有 repair 关注 failed 或 stale processing。producer 接入后，afterCommit enqueue 失败会留下 pending dirty，因此 repair 需要能扫描超过阈值仍 pending 的 dirty rows 并重新 enqueue rebuild jobs。

## Risks / Trade-offs

- [Risk] 组织/岗位大范围变更在事务内展开 userIds 可能增加事务耗时。→ Mitigation: 使用 set-based query/bulk upsert，后续规模压力再引入 scope dirty 表。
- [Risk] afterCommit enqueue 失败导致 profile 不及时刷新。→ Mitigation: dirty row 已持久化，repair 扫描 pending/failed/stale 并重新 enqueue。
- [Risk] 重复 producer 或 worker expansion 导致重复 dirty/job。→ Mitigation: `user_profile_dirty.user_id` 唯一合并 reason codes，jobId 使用确定性去重。
- [Risk] admin-api 引入 API 私有模块形成反向依赖。→ Mitigation: 通过共享 contracts/jobs/ports 组织代码，并增加架构测试或 import guard 覆盖。
- [Risk] 漏掉某个写路径造成局部 profile 长期陈旧。→ Mitigation: 为每个服务写操作补单元测试，断言事务内 dirty 与 afterCommit enqueue。

## Migration Plan

1. 部署代码前确保 `user_profile_dirty` 和 worker 已存在，并至少完成一次 backfill。
2. 部署 producer change 后，新的写操作会开始持久化 dirty 并唤醒 worker。
3. 观察 producer afterCommit 失败日志、dirty pending 数量和 worker rebuild 成功率。
4. 如需回滚，可回滚 producer 代码；已存在的 dirty rows 可继续由 worker/repair 处理，不影响业务写模型。

## Open Questions

- 无。角色/权限管理写接口若未来出现，应在对应 change 中接入 role/privilege scope dirty producer。
