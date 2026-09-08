---
status: accepted
---

# 使 Admin 写入结果与实际业务变化一致

[Issue #29](https://github.com/cyy1998/shgas-iam/issues/29) 的审查促成本决定。维护者于 2026-09-07 接受的目标已由 [Spec #95](https://github.com/cyy1998/shgas-iam/issues/95) 的 #96–108 领域切片实施，覆盖全部现存 Admin 业务 mutation、REST/实际 legacy/tRPC 及页面；[#110](https://github.com/cyy1998/shgas-iam/issues/110) 收缩旧内部 CAS/fallback 并整合既有三条系统旅程。逐命令、42 条故事与验证归属见[最终契约核对](../features/admin/admin-mutation-contract.md)，外部消费者和环境切换见[协调清单](../releases/admin-mutation-contract-cutover.md)。代码实现状态不代表最终聚合已通过或环境已部署，固定候选的实际结果由议题保存。

## 统一的同对象写入方案

Admin 对已存在 PostgreSQL 业务对象的写入统一采用事务内行锁：在同一个 UnitOfWork 中使用 `SELECT ... FOR UPDATE` 取得当前目标，随后检查生命周期前提、计算实际业务变化、执行写入并登记相应审计和 Profile dirty，锁持有至事务结束。后续新增或修改的同类写入口必须采用这一方案，现有 Organization Responsibility Assignment 的 CAS 写入也迁移到该方案，不再按领域并列保留两套同对象并发策略。

本规范限定于 Admin PostgreSQL 业务写入，不替代 Redis Session 原子操作、Runtime Snapshot 或 Profile publication 的既有 CAS。它不引入全局锁、更高事务隔离或自动重试；跨对象、跨表的完整性检查继续保留既有乐观边界。

锁定范围是命令拟修改的现存业务目标及级联选中行；只读父对象继续普通预检，不把所有读取方法改成锁定读取。多行写入必须统一安排取锁顺序，防止父子反向或同表多行反向加锁。创建尚不存在的对象时，保留数据库唯一约束作为重复写入的最终裁决，并将已知唯一冲突映射为 `409`；不能把对不存在行的查询误称为锁住了空槽。对现存选中行加锁不自动阻止后来新增的记录，也不提升跨记录 Primary 或跨表 parent predicate 的保证。

普通资料编辑本次不增加页面版本检查；后保存者仍可覆盖其明确提交的资料字段。命令所需的生命周期、Secret 等关联状态必须来自事务内锁定的当前事实，不能从陈旧页面或事务外快照回填。

## 公共机制与领域职责

Admin 应用层由一个公共模块统一事务、锁定流程和 `{ changed, result }` 业务结果，复用现有 UnitOfWork 与提交后任务机制。Repository 提供锁定读取及明确的写入结果；合法转换、业务值比较和审计内容仍由各领域拥有，公共模块不猜测业务语义。

数据库基础层只提取结构化错误信息，包括 Drizzle `cause` 中的 SQLSTATE 与 constraint name。领域 repository 将已知约束映射为稳定业务冲突；未知约束继续作为内部错误，不依赖错误文本猜测，也不将所有 `23505` 无条件转为同一种领域错误。

## 变化、无变化与失败结果

合法无变化结果与真实业务变化分开表达。安全命令保留操作意图审计，并明确 `changed:false`；普通资料编辑无变化时不新增变更成功审计，也不登记 Profile dirty。Client 已约定的 required Runtime Snapshot invalidation 继续保留，不因业务无变化而统一跳过。

状态与生命周期、主任职设置、授权关系、协议配置、凭据及会话操作统一属于保留意图审计的命令；合法 no-op 也记录 `changed:false`。名称、说明、联系方式等普通资料编辑只在真实变化时记录审计。Full Admin 与 HR 的 User Resignation 已遵循相同分类：合法重复离职返回 `{ changed:false, result:null }` 并保留意图审计，不登记 Profile dirty、不改写既有结束时间，仍保留 Subject Access 与 Session 撤销重试。离职在 pre-block 后、源事务前准备 opaque Session 撤销计划，原始捕获合法已存在 Session 代际，提交后与 callback 前代合并并按代际集合精确撤销；重试可重新捕获遗留旧代，晚到撤销保留重新启用后的新代。准备失败仅作 bestEffort 诊断并退回 callback 前代撤销，本次未捕获的更早代留待后续重试。捕获不调用访问校验或 cleanup，也不是全局快照；捕获后才落库的更早代极迟在途 Session 由后续重试或访问校验处理，既有 tombstone 派生清理责任不变。离职锁齐选中任职与责任后重验 HR 资格，业务事实、审计及 dirty 在同一事务提交；这不提升请求时 scope 或跨表、phantom、Primary 的既有保证。

OIDC 与 Custom SSO 配置按规范化后的业务值比较；重复提交相同配置属于无变化，不推进协议版本、不撤销会话，仍执行 required Runtime Snapshot invalidation。显式 Secret 轮换始终属于新变化，即使请求参数相同也不能当成重复配置保存。

当系统明确知道数据库已提交、后续传播却失败时，向调用方提供稳定的专用错误语义，表达业务已生效、需要刷新确认或修复，不能伪装成事务回滚，也不能据此自动重放业务写入。

| 场景 | 已确认的目标结果 |
|---|---|
| 普通资料更新没有提交任何有效字段 | `400` 参数错误 |
| 有效资料字段全部与当前值相同 | 成功，`changed:false` |
| 普通 CRUD 对象不存在，包括重复删除 | `404` |
| 生命周期已经达到请求目标，例如重复 End | 成功，`changed:false` |
| 对象存在，但目标转换不合法，例如 Resume 已结束任职 | `409` |

上述状态结果不得越过授权边界向无权限调用方透露对象事实。原 CAS miss 后重读仍未达到目标的情况按 `409` 理解；统一行锁方案下应直接根据锁定后的当前状态判断，不为保留该错误分支继续引入 CAS。

软删除不释放用户名或组织编码等现有全表唯一标识的占用，本次修正冲突表达，不改变标识复用规则。Organization 只允许以 Enable 创建；省略初始状态使用 Enable，显式 Pause 或 Disable 输入应被拒绝，不得静默改写为 Enable。

## 对外结果与提交后恢复

所有 Admin mutation 的成功业务结果统一为 `{ changed, result }`：没有资源返回的命令使用 `result:null`，创建返回新对象，Secret 操作的 `result` 保留对象与一次性 Secret。REST 保留现有外层 response envelope，tRPC 直接返回上述业务结果，不复制第二份 transport envelope。页面应明确区分已修改与无需修改。

REST、实际挂载的 legacy 路由及 tRPC 与 Admin 前端采用协调切换，不长期维护两套结果契约。外部 REST 调用者是否存在仍未确认，切换前必须完成调用方核验与协调，不能根据仓库内消费者使用 tRPC 就假定外部 REST 无人使用。

普通 mutation 返回明确的已提交后失败时，页面自动重新读取详情，但不自动重发写请求；展示已生效事实并保留后续处理仍需修复的提示。详情刷新成功不能证明 Runtime 传播已恢复，不得因此自动清除该提示。

Secret 轮换已提交、但提交后传播失败使一次性 Secret 未交付时，页面提示“轮换已生效，新 Secret 出现错误”。恢复流程为先修复传播，再由管理员主动重新轮换，不自动重试原请求，也不为补领而持久化明文 Secret。该场景不能仅按普通详情刷新处理，调用方可能需要重新配置凭据。

## Consequences

- 本决定局部修订 [ADR-0011](0011-model-employment-as-an-immutable-tenure-lifecycle.md) 对同一 Employment 状态写入的弱保证；跨表父对象完整性、跨记录 Primary 等保证不因本决定自动提升。[ADR-0014](0014-model-organization-responsibility-as-employment-bound-fact.md) 的跨表乐观边界及 [ADR-0017](0017-centralize-admin-role-policy-with-request-time-scope.md) 的请求时授权边界保持有效。
- 本决定调整 [ADR-0021](0021-bind-protocol-runtime-cache-consistency-to-snapshot-acquisition.md) 和 [ADR-0022](0022-adopt-snapshot-consistency-for-client-traffic-gate.md) 的提交后传播失败对外表达，不改变 Snapshot acquisition、传播失败窗口或显式 repair 的恢复责任。
- 同对象行锁是后续同类 Admin 写入的统一架构规范，而非仅修复 OIDC 或 Role 的局部技巧；公共入口与跨表取锁次序已落实并记录于最终契约核对；不保留仅用于分批迁移的旧同行 CAS。
- 不把 SQL affected count 等同于业务变化，也不把所有审计都解释为变更记录。具体命令需明确可观察的变化、合法无变化与失败结果，不能由统一 helper 猜测业务含义。
- 同类审查发现均纳入后续治理；相邻 Internal Privilege Delegation 写入单独切片，其委托人协调锁与原子审计由 [ADR-0026](0026-serialize-privilege-delegation-writes-by-delegator.md) 拥有，不混入 Admin 通用事务重构。
