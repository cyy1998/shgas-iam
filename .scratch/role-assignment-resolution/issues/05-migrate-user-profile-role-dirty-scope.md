# 05 — 迁移 User Profile 反向 dirty scope

**What to build:** 让角色和权限变更通过共享 resolver 展开需要重建档案的保守用户集合，使角色已经停用或相关目标已经失效后仍不会漏掉残留旧授权的用户，同时保持其他 dirty scope 行为不变。

**Blocked by:** 04 — 迁移 User Profile 正向角色构建

**Status:** claimed

- [ ] User Profile scope repository 消费 worker module 已创建的 resolver；API 与 admin composition 也为其各自的 scope repository 注入同一模块接口。
- [ ] Role scope 直接批量调用反向解析；Privilege ID 与 Privilege Code scope 取得关联角色后复用同一反向操作。
- [ ] 反向展开只要求任职启用且未删除，不因角色、岗位或组织已经停用而漏掉用户。
- [ ] Organization、Position、Employment、User 和 All Users 等其他 scope 的可观察行为保持不变。
- [ ] 本地角色到用户的三来源查询与去重实现被删除，不保留旧 helper 或兼容层。
- [ ] scope 与 worker 测试覆盖 Role/Privilege 协作、保守影响集、去重结果和其他 scope 回归，但不复制共享模块规则矩阵。
- [ ] API、admin-api、worker 和 user-profile-read-model 的受影响测试、lint、typecheck 以及共享模块显式 PostgreSQL 测试通过并记录证据。
