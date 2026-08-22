---
status: accepted
---

# 将 Organization Responsibility 建模为任职绑定的非授权事实

Organization Responsibility Type Catalog 由 IAM 代码独占，是只增不减、没有运行时生命周期的封闭枚举；Assignment 以 Employment 为 holder，并可把该任职绑定到组织树中任意位置的 target Organization。Assignment 是需要保留身份与生命周期的档案事实，不是 Employment 属性，也不产生 Role Assignment、Effective Role、Privilege 或授权决定。

Admin API 拥有 Assignment 命令、管理查询及其与 Employment、Organization、User 生命周期的事务协调；独立的 `@iam/organization-responsibility-resolution` module 拥有跨 runtime 的 Effective 正向解析和 holder 反向解析，使 User Profile invalidation 能同时覆盖 Employment 组织关系与跨树责任目标。User Profile、Subject Facts、Internal DSL、Custom SSO 和 OIDC 只消费同一 canonical Effective snapshot，并通过一次全局 V2 hard cutover 切换，运行时不兼容 V1/V2 混读。

## Consequences

- 同一 UnitOfWork 内实际选中的 Assignment、父生命周期变化、审计和 Dirty 登记原子提交；数据库 Open 唯一约束强保证 Type cardinality，并把 constraint race 映射为稳定业务冲突。
- 写入继续采用低并发 Admin 的顺序预检，不增加锁、更高隔离级别或自动重试。因此跨表 parent-vs-assignment 与 Resume-vs-Pause predicate 只具乐观保证，不宣称 linearizable 或 serializable；竞态形成的不一致属于 Organization Responsibility Integrity Violation，全部读取 fail closed，修复只能经过正式、带审计的业务入口。
- 当写入规模、外部 Authority 或运行证据使这一并发边界不可接受时，必须重新决策统一的 `SERIALIZABLE` 加有限重试或显式锁协议，不能把现有预检误解为强不变量。
