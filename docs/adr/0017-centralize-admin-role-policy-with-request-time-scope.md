---
status: accepted
---

# 集中 Admin 授权并校验 HR 双端范围

Admin Authorization Policy 在服务端把当前 Effective Role 映射为动作和数据范围：`iam:admin` 拥有完整管理能力，
绑定 `iam-admin` Client 的 `iam:hr-admin` 按角色承载任职的一级根组织并集取得 HR 范围，多角色能力取并集。
本页合并请求时授权和组织责任双端范围的决定。

## 权威与观察时点

策略直接读取 PostgreSQL 当前角色、任职和组织事实，不把异步 Profile、Redis 授权快照、`role_privilege` 或前端
`allowedActions` 当作授权源，也不引入内置角色与自动 provisioning。每次 mutation 仍由服务端授权。

接受请求时观察后的并发撤权窗口：已通过检查的请求可能在撤权后提交，后续请求观察新范围。事务内重新检查具体目标，
也不等于全部相关 writer 已遵循提交时强一致授权协议。若并发 writer、外部 Authority 或运行证据使边界不可接受，
须重新决定统一 transaction-bound 授权与锁定方案；缓存或在 middleware 多查一次不能消除该竞态。

## HR 组织责任的双端边界

holder Employment 所属 Organization 与 target Organization 必须同时位于当前 HR 范围，两端可以跨越该管理员同时管理的
不同根。Ended 历史仍按当前范围判断，不保存创建时授权快照；这不改变 Assignment 的非授权事实性质与并发边界。

拒绝只按 target（会暴露并管理范围外 holder）、只按 holder（会改变范围外 target）或任一端通过（把跨树责任变成授权桥）。
也不要求同一个根，以免限制本已具备两端管理权的管理员。

查询在分页前过滤两端；详情与写入隐藏越界对象，命令在事务内读取两端并复查。越界责任仍可能占用 cardinality 或阻止
组织变更，但只返回安全的阻塞说明，不泄露 holder、路径或隐藏记录 ID。HR 不因此取得审计日志读取权，自操作没有特殊豁免。
前端能力仅镜像服务端事实。

## 当前契约与历史

领域模型见 [ADR-0014](0014-model-organization-responsibility-as-employment-bound-fact.md)，操作、错误与页面见
[HR 功能契约](../features/organization-responsibility/hr-admin-management-design.md)，授权接线见
[前端架构](../architecture/frontend-architecture.md#管理路由与权限)。

历史来源：[ADR-0017 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0017-centralize-admin-role-policy-with-request-time-scope.md)、[ADR-0018 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0018-authorize-hr-organization-responsibility-by-both-endpoints.md)。原始决定与后续修订按各版本追溯。
