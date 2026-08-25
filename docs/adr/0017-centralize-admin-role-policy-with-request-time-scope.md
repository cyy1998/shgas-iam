---
status: accepted
---

# 集中 Admin 角色策略并采用请求时组织范围

IAM Admin 由服务端拥有集中式 Admin Authorization Policy，把当前 Effective Role 映射为模块、动作和数据范围能力：`iam:admin` 授予完整管理能力，绑定 `iam-admin` Client 的普通角色 `iam:hr-admin` 授予以角色承载任职一级根组织并集为边界的 HR 管理能力，多角色能力取并集。策略直接读取 PostgreSQL 当前角色、任职与组织事实，不使用异步 User Profile 或 Redis 授权快照；前端 `allowedActions` 只镜像服务端决定，每个 mutation 仍由服务端校验。本次不把 `role_privilege` 提升为 Admin 授权来源，也不引入内置角色或自动角色 provisioning。

授权一致性采用低并发 Admin 的请求时观察边界，不为授权检查之后并发发生的角色撤销、任职变化或目标范围变化增加事务锁、隔离级别或重试协议。因此已经通过授权检查的请求可能在并发撤权之后完成提交，后续请求才观察新范围；该边界不得描述为 commit-time linearizable、serializable 或强一致撤权。若出现并发 writer、外部任职 Authority 或实际越权窗口证据，必须重新决策所有相关 writer 共同遵守的 transaction-bound authorization 与锁定协议，不能用缓存或只在现有 middleware 增加一次检查来声称消除了竞态。
