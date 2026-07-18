# 04 — 迁移 User Profile 正向角色构建

**What to build:** 让 User Profile 构建通过共享 resolver 批量取得 Effective Role，使持久化档案与 admin/OIDC 采用同一严格角色语义，同时保留现有任职、组织、岗位、权限和档案 schema。

**Blocked by:** 01 — 建立角色分配解析模块

**Status:** claimed

- [ ] User Profile worker module 作为 package composition root 创建一次 resolver，并将其注入档案构建数据访问能力。
- [ ] 每个构建批次通过一个批量 resolver 调用取得全部任职的 Effective Role，不传 client 范围。
- [ ] resolver 结果被映射为现有角色行并继续驱动 privilege 加载，User Profile schema 和持久化格式保持不变。
- [ ] User Profile 本地任职、岗位、组织 assignment 正向查询、状态过滤、去重 helper 及不再需要的 imports 被删除。
- [ ] 构建器测试继续覆盖档案、任职、角色与权限可观察结果，但不复制共享模块的 SQL 或规则矩阵。
- [ ] user-profile-read-model 与 worker 的聚焦测试、lint、typecheck 以及共享模块显式 PostgreSQL 测试通过并记录证据。
