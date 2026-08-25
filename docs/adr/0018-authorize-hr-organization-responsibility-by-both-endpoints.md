---
status: accepted
---

# 以责任任命双端范围授权 HR 组织责任管理

IAM Admin 对有效 `iam:hr-admin` 开放 Organization Responsibility Type Catalog、Assignment 查询、创建以及 Pause、Resume、End 生命周期命令，并复用完整管理员已有的 REST/tRPC operations、页面和业务规则。HR 只能读取或改变 holder Employment 所属 Organization 与 target Organization **同时**位于其请求时 HR Administration Scope 的 Assignment；两端可以位于不同的 Scope Root，任一端越界都不得因另一端而扩权。Ended 历史继续按当前范围判断，不保存创建时授权快照。

本决策扩展 [ADR-0017](0017-centralize-admin-role-policy-with-request-time-scope.md) 的集中式 full/scoped Admin Authorization Policy，并保留其请求时一致性与并发撤权窗口；它不改变 [ADR-0014](0014-model-organization-responsibility-as-employment-bound-fact.md) 的 Assignment Authority、cardinality、生命周期、事务或低并发乐观边界。唯一写入口仍是 IAM Admin 命令面，部署后全部有效 `iam:hr-admin` 立即获得该能力，不增加 feature flag、角色变体或数据库迁移。

## Considered Options

- 只按 target 授权会允许 HR 任命或管理范围外 holder，并把 Assignment 变成读取范围外 Employment 事实的入口。
- 只按 holder 授权会允许 HR 改变范围外 target 的责任安排。
- 任一端入范围即允许会把跨树 Assignment 变成授权桥。
- 要求两端属于同一个 Scope Root 会不必要地禁止管理员在自己同时管理的多个根之间任命。

## Consequences

- 查询必须在分页前同时约束 holder 与 target，详情和 mutation 对越界 Assignment 隐藏存在性；创建及生命周期命令在事务内加载两端事实并重新校验。
- Assignment 响应提供服务端拥有的 `allowedActions`，前端只镜像决定，mutation 不信任客户端返回的 capability。
- 范围外 Assignment 仍可占用 target 的 cardinality 槽位或阻止 Organization 生命周期；HR 只获得不泄露 Assignment ID、holder 或路径的稳定阻塞说明，并联系完整管理员处理。
- HR 获得独立页面及 User、Employment、Organization 详情中的责任入口，但不获得 Audit 模块或 Assignment 操作日志读取能力；自操作不享有特殊放行或禁止。
