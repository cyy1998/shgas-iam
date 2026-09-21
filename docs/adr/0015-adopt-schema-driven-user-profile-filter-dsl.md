---
status: accepted
---

# 由 Search Document 驱动搜索并返回固定摘要

User Profile Search 以未删除的当前 Profile 为唯一结果根，关联对象只建立筛选作用域。Search Document 的公开类型结构
是合法路径与通用操作符的唯一机器事实来源，不再维护平行字段白名单。本页同时纳入固定 User Profile Base 响应的后续决定。

## 理由与代价

逐字段扩充封闭条件集合会让 schema、校验和编译器反复同步。采用类型驱动后，每个新增公开可比较字段都会向全部有效
Internal Client 开放搜索，必须把结构变更视为有意的数据暴露决定；不提供按 Client 裁剪或任意 JSON path。

查询只读已发布 Search Document；集合条件保持同元素作用域，包含未删除的 Pause/Disable 用户，不自动替调用方筛掉状态。
Privilege Delegation 仍在搜索后独立组合，不进入档案。严格二值过滤、结构预算、超时和 500 条上限约束成本，超限整体拒绝，
不截断为看似完整的部分结果；本能力不扩张为通用实体查询、投影或历史查询。

全局 Profile 采用单代发布，调用方不选版本，运行时不双读、逐用户回退或混合结果。接受全量恢复窗口与完整门禁的成本，
避免并行代际和第二套发布通道；入队不是发布完成。IAM 任职命令已在业务时间边界登记失效，因此不另加预约时间调度器。

## 固定摘要与一致性边界

Internal Filter DSL 固定返回 `UserProfileBase`：username、name、mobile、wxId、subjectIdentifier，缺失的 mobile/wxId
仍为 null。过滤结构不决定响应形状，全部有效 Internal Client 可以批量读取 Subject Identifier；不顺带改变 legacy search、
Detail 或 Delegation search 的响应。

匹配行的 Search Document 仍严格校验；摘要从同一 Profile 行的类型化列组装，不读取或校验未返回的 Detail，也不比较
类型化列与 Search Document 中的重复值。接受损坏时“返回摘要可能不满足刚执行的筛选条件”的风险，以隔离摘要对未返回
Detail 和跨副本一致性门禁的依赖。Detail 单独损坏不阻断摘要，Search Document 损坏仍整批失败。

## 当前契约与历史

操作符、适配器差异、排序、预算和错误见[Filter DSL 契约](../features/user-profile-search/filter-dsl.md)，
单代重建与双重完整校验见[Profile 维护](../releases/user-profile-maintenance.md)。

历史来源：[ADR-0015 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0015-adopt-schema-driven-user-profile-filter-dsl.md)、[ADR-0019 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0019-return-user-profile-base-from-internal-filter-dsl.md)。原始决定与后续修订按各版本追溯。
