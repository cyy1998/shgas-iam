# 03 — 发布版本化 Subject Facts

**What to build:** 将主体档案和授权事实发布为按 Dirty Version 管理的权威 User Profile 行及 Subject 级 Redis record，为所有协议提供可验证、可恢复且不会被旧 worker 覆盖的事实来源。

**Blocked by:** 01, 02

**Status:** resolved

- [x] `user_profile` 的目标模型固定为 `user_id`、`subject_identifier`、`username`、`name`、`mobile`、`wx_id`、`status`、`is_delete`、`search_visible`、`profile_schema_version`、`source_dirty_version`、`detail`、`search_doc`、`subject_facts`、`rebuilt_at`、`create_time`、`update_time` 十七列。
- [x] staged migration 为 User Profile 增加后续全量回填所需的新列和基础约束；已发布行具有非空 UUID Subject Identifier、正数 source Dirty Version 及通过版本化 schema 校验的 Subject Facts。
- [x] `detail` 与 `search_doc` 继续服务既有用户详情和搜索消费者；本功能不删除它们，也不允许 SSO 或 Subject Facts Reader 将 `detail` 当作 fallback。
- [x] Subject Facts 只保存当前有效任职的组织/岗位语义，以及按不可变 `clientCode` 分组的 Effective Roles 和 privileges；不保存顶层聚合、数据库 ID、状态、时间、描述、账号可用性或其他用户详情。
- [x] 无角色的有效任职仍被发布且 `clientAuthorizations` 为空；只有存在 Effective Role 的 client 才形成授权项，所有集合具有确定性顺序。
- [x] Worker 可在事务外构建绑定目标 Dirty Version 的候选 Profile，但发布事务必须锁定 Dirty row 并重新确认用户、版本与 `processing` 状态。
- [x] 完整 Profile upsert、`source_dirty_version` 更新和同版本 Dirty `processed` 在同一 PostgreSQL 事务提交或回滚；状态或版本不匹配时丢弃 stale candidate。
- [x] Profile 持久化拒绝低于现有来源版本的写入，证明乱序或重复 worker 不会让 PostgreSQL 事实版本倒退。
- [x] PostgreSQL 成功提交后，以 `sourceDirtyVersion` compare-and-set 发布每个 Subject 唯一的一份 Redis record；record 含 schema/version、发布时间、Subject Identifier、username/name/phone 和 Subject Facts，不含 user×client 投影或账号可用性。
- [x] Redis 发布失败不回滚已提交的 PostgreSQL 数据，并可由 read-through 或 repair 恢复；旧 worker 和旧 read-through 不能覆盖新缓存。
- [x] 真实 PostgreSQL contract tests 证明行锁重验、原子提交/回滚、stale candidate 拒绝和版本单调；隔离 Redis namespace 的 contract tests 证明 compare-and-set 并发语义且不清空共享 Redis。
