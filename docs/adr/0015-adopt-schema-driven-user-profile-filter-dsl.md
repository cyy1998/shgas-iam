---
status: accepted
---

# 采用由 Search Document 结构驱动的 User Profile Filter DSL

> Internal Filter DSL 的响应形状已由 [ADR-0019](0019-return-user-profile-base-from-internal-filter-dsl.md) 修订为 `UserProfileBase`；本文其余决定保持有效。

User Search 以未删除的当前 User Profile 为唯一结果根，关联对象只建立筛选作用域，不改变返回实体。现有只暴露 Organization Responsibility 叶条件的 DSL 把已发布 Search Document 中的用户、普通任职、组织、岗位、角色和权限事实排除在外，形成了没有领域依据的能力断层；继续逐字段扩充封闭 union 又会让 Search Document、运行时校验和查询编译器反复维护平行白名单。

因此采用由 User Profile Search Document 公开类型结构驱动的 Filter DSL。普通标量自动支持 `eq`/`in`，标量数组自动支持 `containsAny`/`containsAll`，对象集合通过带 `where` 的 `exists` 建立同元素作用域，标记为 Organization 的引用额外支持 `withinSubtreeOf`。布尔组合只使用 `and`、`or`、`not`，硬切换后不解释旧 `all`/`any`。公开类型结构是合法路径和通用操作符的唯一机器事实来源；规则文档只提供人类可读说明，不另建字段白名单，也不要求文档与 schema 的自动一致性测试。

搜索只读取已发布 Search Document。结果根包含所有未删除用户，不隐式排除 Pause 或 Disable；关联任职只包含 Effective Employment。所有有效 Internal Client 共享同一 DSL 能力，不按 client 裁剪字段。Public `/search` 不直接开放 DSL，但与 Internal 使用相同用户集合和执行语义。Privilege Delegation 不进入 Search Document 或 DSL，`/search-with-delegation` 继续在基础搜索之后独立组合实时 delegation 结果。Internal Filter DSL 的当前固定响应由 ADR-0019 定义。

Search Document 结构变化把全局 `profileSchemaVersion` 从 v2 提升到 v3，不另设 `searchDocVersion`，也不为 v2/v3 引入并行存储代际。切换在维护窗口内完成：停止相关 User Profile 业务读取、源事实写入和旧 v2 Worker，由固定的 v3 Worker 复用既有 dirty/job/publication 与 `user-profile:backfill` 工作流原地重建全部 Profile；等待全部 job 和 dirty 状态收敛并通过完整 PostgreSQL、Redis/Subject Facts 数据门禁后，统一恢复所有入口并只读取 v3。调用方不能选版本，运行时不做双读、逐用户回退或混合结果。Internal `/search` 作为 deprecated 参数适配器保留到调用方另行迁移并批准删除；Public `/search` 保持正式 Public 契约，只把请求转换到统一引擎。

## Consequences

- Search Document 的公开结构同时成为 API 能力边界。新增公开可比较字段会自动向所有有效 Internal Client 开放搜索，因此字段进入该结构必须被视为有意的契约与数据暴露决策。
- numeric ID、任职期间和派生索引字段不属于公开搜索结构。Organization Path 使用语义节点和 `distanceToTarget`，`withinSubtreeOf` 只是路径存在条件的简写；Internal Filter DSL 是否返回某个字段由其固定响应契约决定，不由过滤路径推导。
- DSL 使用严格、精确、二值的过滤语义，不承担模糊搜索、范围搜索、null/empty/missing 查询、排序、分页、投影或通用实体查询。固定结构预算、超时和 500 条结果上限限制通用编译器的查询成本，任何超限都不截断返回。
- Internal 与 Public 都能看到未删除的 Pause/Disable 用户；需要只搜索 Enable 用户的调用方必须显式提供 status 条件。这是统一语义带来的有意行为变化。
- 单代原地切换不增加 generation 存储、active-generation selector、shadow publication 或第二套 v3 backfill 数据通道；现有 `user-profile:backfill` 只负责把全部 User 标记 dirty 并投递 rebuild job，因此“已入队”不是完成证据，必须等待处理收敛并运行全量门禁。重建或门禁失败时所有依赖 User Profile v3 的入口保持关闭，不能以部分 Profile 恢复服务。Detail 与 Subject Facts 即使外形未变也随同一次全局 v3 硬切换前进。
- v3 文档继续使用现有 JSONB 与 `profile_schema_version` 存储；本决策不为版本切换本身要求数据库 schema migration 或预选新索引。实现若因真实物理结构或 query-plan 证据需要 migration，仍按普通数据库变更单独验证。
- Employment Authority 不预约未来开始或结束：创建与结束命令在同一事务时刻写入生命周期和 Profile invalidation，所以本决策不增加时间边界调度器。时间谓词仍作为完整性防御。
