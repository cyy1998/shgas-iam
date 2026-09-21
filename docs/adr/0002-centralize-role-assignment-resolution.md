---
status: accepted
---

# 以独立模块统一角色分配解析

Admin 与 User Profile 的构建、失效需要同一套 Effective Role 和受影响用户解析。由独立包
`@iam/role-assignment-resolution` 接收数据库能力，隐藏分配来源、组织闭包、去重与查询实现；调用方只拥有各自的结果映射。
OIDC 消费已发布 Subject Facts，不直接调用角色解析器。

## 理由与代价

不把授权语义放进基础设施包 `@iam/db`，不使纯 `@iam/domain` 依赖数据库，也不让 Admin 反向依赖 User Profile
投影实现。公开能力批量处理，查询次数不随输入 ID 数量增长，空输入不查库；不承诺具体 SQL 条数或写法。

正向解析返回当前有效角色；反向解析用于扩大 dirty scope，不能因 Role、Position 或 Organization 已停用而漏掉需要去除
旧授权的用户。接受保守范围带来的额外重建，不接受漏重建。正向可按 Client 限定，调用方不自行重建过滤规则。

任职的父对象完整性遵循 [ADR-0011](0011-model-employment-as-an-immutable-tenure-lifecycle.md)：不再把任职自身的
Position 或所属 Organization 状态当作下游静默过滤开关。角色分配目标和 Role 的有效性仍由解析器判断，不能把该修订
扩张为“所有岗位、组织都不检查”。用户自身状态由调用方负责。

## 当前契约与历史

接口和 composition 归属见[后端架构](../architecture/backend-architecture.md#角色分配解析)，共享能力边界见
[共享契约](../architecture/contracts-and-database.md#专用能力包契约)。

历史来源：[ADR-0002 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0002-centralize-role-assignment-resolution.md)、[ADR-0011 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0011-model-employment-as-an-immutable-tenure-lifecycle.md)。原始决定与后续修订按各版本追溯。
