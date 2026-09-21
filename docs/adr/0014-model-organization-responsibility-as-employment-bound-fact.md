---
status: accepted
---

# 将 Organization Responsibility 建模为任职绑定的非授权事实

Organization Responsibility Assignment 由 Employment 持有，可指向组织树任意位置的 target Organization。
它有自己的身份和生命周期，是档案事实，不是任职属性，也不产生 Role、Privilege 或授权决定。
Type Catalog 由 IAM 代码拥有，采用只增不减、没有运行时生命周期的封闭词汇。

## 理由与代价

Admin 拥有 Assignment 命令及其与父生命周期的事务协调；独立解析包拥有 Effective 正向解析和跨树 holder 反向解析。
这样 Profile 失效能同时覆盖任职组织与责任目标，不让各协议重建不同的责任事实。各消费方使用同一当前发布模型，
不保留多代在线混读。

选中业务行、相应生命周期变化、审计及 Dirty 登记在同一 UnitOfWork 提交。数据库 Open 唯一约束强保证 Type cardinality；
现存目标按 [ADR-0025](0025-align-admin-mutation-results-with-committed-facts.md) 锁定。这些保证不能扩张到所有跨表
parent-vs-assignment 或 Resume-vs-Pause predicate：它们仍有乐观并发边界。

读取遇到完整性异常整体失败关闭，修复必须走正式且带审计的业务入口。写入规模、外部 Authority 或运行证据使现有边界
不可接受时，再决定统一的 SERIALIZABLE 加有限重试或显式锁协议；不由某个调用方自行补锁并宣称全局保证。

## 当前契约与历史

模型词汇见[CONTEXT](../../CONTEXT.md)，解析与写入归属见
[后端架构](../architecture/backend-architecture.md#organization-responsibility-解析)。
HR 管理范围由 [ADR-0017](0017-centralize-admin-role-policy-with-request-time-scope.md) 决定，
功能见[HR 管理契约](../features/organization-responsibility/hr-admin-management-design.md)。

历史来源：[ADR-0014 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0014-model-organization-responsibility-as-employment-bound-fact.md)。原始决定与后续修订按各版本追溯。
