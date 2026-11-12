---
status: accepted
---

# 统一用户与组织的文档模型和搜索契约

用户与组织各自以一份已发布 Document 提供 Internal 搜索和详情。User Document 同时提供 Subject Facts 的持久来源。
统一前，用户筛选、摘要、详情与 Facts 分别持有事实，可能在同一次读取中给出不同结论。
选择从同版本内部 Document 派生各个公开视图，接受响应契约切换与协调升级的成本。
原决定见 [Spec #283](https://github.com/cyy1998/shgas-iam/issues/283)，搜索结果控制修订见 [Spec #310](https://github.com/cyy1998/shgas-iam/issues/310)。

## 事实来源与发布边界

- 组织关系与生命周期仍由源表拥有。将完整路径放入可重建的 Organization Document，可以避免查询时反复组装层级，
  代价是增加存储和传输体积。这是设计意图，实际性能需独立验证。
- 详情和搜索从同一发布版本生成公开内容，接受新建暂不可见、删除延迟退出和不同组织版本并存。合法旧文档可继续服务。
  按对象异步发布使祖先变更无需在源事务内同步重建整棵树。两类目录共用更新核心，各自发布和恢复。
  回源拼装详情会重现副本间的不一致，目录是否可见只以已发布事实判断。
- PostgreSQL 保存规范业务文档，Redis Facts 是同版本派生缓存。删除采用版本化墓碑，以免迟到任务重新写回已删除事实。
  用户发布还承担 Facts 与 Subject Access 恢复责任。Admin 管理模型、登录和账号恢复继续由各自权威来源负责。
- 源事务持久登记变化，提交后再展开受影响对象。只在源事务里展开可能漏掉并发新增的关联（见 [#239](https://github.com/cyy1998/shgas-iam/issues/239)），
  删除或结束的旧关联也可能在展开时消失，因此消息保留必要的变更前目标。两阶段持久状态用于恢复，队列负责唤醒。
  采用这一方案的代价是多维护一类可靠处理记录。

[文档发布与恢复](../../packages/documents/README.md#共享发布与恢复) · [Subject Facts 披露决定](0032-consume-published-subject-facts-for-authorization.md)

## 搜索与可见范围

- 服务间用户与组织搜索收口为 Internal Filter DSL。旧 Public 搜索和 Internal 非 DSL 入口采用一次切换，
  接受旧调用方升级的成本，免于长期兼容和转发。Admin 搜索与 Internal 详情继续提供，委托仍独立解析。
  从搜索结果再查委托时，两次调用各自观察事实。[旧入口退役记录](0043-retire-public-and-legacy-internal-directory-search.md)
- 公开 schema 驱动合法路径和操作符。逐字段白名单会与 schema、校验和编译器重复维护。
  新增可比较公开字段也是数据暴露决定，内部字段与任意 JSON path 保持在公开语言之外。
- 过滤、计数与响应使用同一认证 Client 可见的角色集合，包括本应用有效角色和有效全局角色。
  组合角色先展开，再按结果角色的归属披露。过滤复用同元素作用域，响应裁剪保留文档结构。
  [全局角色](0048-model-global-roles-without-client-ownership.md) · [组合角色](0049-compose-roles-across-clients.md)
- 2026-10-27 的修订将主体基本字段提升至 Document 根，降低返回和过滤路径的嵌套层级。
  子树匹配统一使用完整路径上的通用集合条件，减少专用操作符。改写会消耗更多表达式预算。
  当时上一候选尚未部署，因此沿用同一 schema 版本直接调整，免于维护未发布的中间结构。
- 2026-11-03 的修订采用可选页码分页和精确总数，以支持业务列表直接跳页。
  每页和总数使用同一数据库快照，各页独立读取，接受翻页时的重复或漏看。
  字段选择独立于匹配条件，在本次返回文档完成校验后执行。精确计数和深页仍受期限约束，失败整体返回。

[查询参数、默认字段与失败处理](../guides/search.md) · [目录查询实现](../../packages/documents/README.md#internal-搜索与详情)

## 恢复与切换

2026-11-02 的修订将自动 repair 交给对应 consumer 的 Worker，降低漏配外部调度导致待处理工作长期积压的风险。
独立进程和连接增加启动成本，换取清晰的取消与清理边界。人工入口与 Worker 复用同一维护能力，
清理失败停止后续该类轮次，多实例依靠持久领取和版本仲裁。[Ops 与 Worker 分工](0047-separate-operations-cli-from-worker.md)

不兼容布局采用维护窗口内的单代切换，全量重建并独立核验后开放匹配版本的应用和调用方。
这接受协调升级成本，避免并行发布、双读和逐对象回退。有效登录态与凭据沿用原生命周期。
候选验收由对应 Spec 记录，现场切换按匹配来源的运维流程执行。

[Worker 周期 repair](../../apps/worker/README.md#周期-repair) · [数据维护与硬切换](../releases/data-maintenance.md#统一-document-硬切换)

历史来源：[ADR-0015 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0015-adopt-schema-driven-user-profile-filter-dsl.md)、[ADR-0019 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0019-return-user-profile-base-from-internal-filter-dsl.md)、[ADR-0042 原文](https://github.com/cyy1998/shgas-iam/blob/95dc4871c62e36b63b26a3f71c5670ae449c79e2/docs/adr/0042-search-organizations-with-published-documents.md)、
[合并前 ADR-0015](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0015-adopt-schema-driven-user-profile-filter-dsl.md)、[合并前 ADR-0042](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0042-search-organizations-with-published-documents.md)、[整理前 ADR-0046](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0046-unify-user-and-organization-read-documents.md)。
