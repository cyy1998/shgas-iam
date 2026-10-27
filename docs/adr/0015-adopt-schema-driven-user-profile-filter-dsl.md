---
status: accepted
---

# 由公开文档结构驱动 Internal Filter DSL

User Search 与 Organization Search 以各自当前已发布 Document 为结果根。公开 schema 是合法路径与通用操作符的机器事实来源，不维护平行字段白名单；内部存储字段不自动公开。
[ADR-0046](0046-unify-user-and-organization-read-documents.md) 已修订原固定 User Profile Base 响应和跨副本一致性取舍：搜索与 Internal 精确详情返回同版本、同 Client 上下文下的完整公开文档。

## 理由与代价

逐字段扩充封闭条件集合会让 schema、校验与编译器反复同步。类型驱动结构让新增公开可比较字段成为有意的数据暴露决定；它不允许任意 JSON path。
用户角色的过滤及返回同时绑定认证 Client，全部组合和否定条件只解释该 Client 可见的角色，不能先过滤全局角色再裁剪响应。

集合条件保持同元素作用域，未删除的 Enable、Pause、Disable 对象均可查询，状态由调用方显式筛选。Client Delegation 独立于文档，在查询后另行组合。
严格二值过滤、结构预算、超时和 500 项结果上限限制成本；非法或超限整体拒绝，不返回截断或部分成功。本能力不扩张为通用实体、任意投影或历史查询。

采用单代发布，调用方不选 schema，运行时不双读、逐对象回退或混合代际。接受维护窗口全量恢复与完整门禁的成本，避免并行发布通道；入队不表示发布完成。任职命令按业务时间边界登记变化，不另加预约时间调度器。

## 响应与一致性修订

原方案从同一 Profile 行的类型化列返回固定五字段摘要，隔离摘要读取对完整详情的依赖，但允许筛选事实与响应副本不一致。
ADR-0046 选择一份规范业务 document，并从参与匹配的同版本事实生成完整公开响应；接受更大响应与调用方硬切换成本，消除平行摘要、搜索和详情副本维护。
损坏命中文档整体失败；目录详情不回源拼装另一份事实。Admin 继续拥有管理专属模型。

调用、预算与失败处理见[搜索接入](../guides/search.md)，恢复见[数据维护](../releases/data-maintenance.md)。
原方案与理由保存在 [ADR-0015 固定原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0015-adopt-schema-driven-user-profile-filter-dsl.md)及 [ADR-0019 固定原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0019-return-user-profile-base-from-internal-filter-dsl.md)。
