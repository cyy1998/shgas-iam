---
status: accepted
---

# 按委托人串行化权限委托写入并原子记录审计

Internal Privilege Delegation 的创建和更新共同阻止自委托、时间冲突及结束后的业务字段变化。创建时目标委托行尚不存在，现有唯一约束不能裁决时间段冲突；原有事务提交后另写审计的流程也可能使业务已生效却缺少对应审计。维护者于 2026-09-07 接受以下决定，已由 [Ticket #109](https://github.com/cyy1998/shgas-iam/issues/109) 实施；整体范围见 [Spec #95](https://github.com/cyy1998/shgas-iam/issues/95)。

全部委托写入口在同一事务内先锁定委托人的 User 行，再重读目标委托、检查完整候选记录和冲突、写入业务事实与成功审计。创建与更新遵循相同的委托人锁顺序，不能依据取得协调锁之前的状态继续执行。该方案复用现有 PostgreSQL 行锁与 API transaction-bound audit writer。

更新的锁前读取仅定位不可变委托人 ID，取得 User 锁后再锁定并重读委托及权限绑定。创建保持既有 Enable 引用预检，更新协调锁只要求委托人存在且未删除，不要求其仍 Enable。重复结束不重写业务行，成功审计记录 `changed:false`；公开创建仍返回委托详情，更新仍返回 boolean，未引入 Admin 的统一结果协议。真实 PostgreSQL 测试联合公开写入口和现有 resolver 验证并存、冲突、独立事务竞争与审计失败回滚。

## 领域范围

- 同一委托人的两条未删除且未结束委托，只有在权限集合、闭区间时间及组织覆盖范围三者都相交时才冲突。组织范围包含指定 Organization 及其全部后代；同组织或祖先与下级组织范围冲突，互不包含的部门或独立组织树允许并存，不再采用全组织互斥。
- Pause 继续占用时间段；业务期间沿用闭区间，端点相接也属于时间相交。开始时间必须早于结束时间，禁止自委托。
- 更新针对合并后的完整记录重新检查，冲突查询排除当前委托自身。结束后不能修改业务字段；纯粹重复结束属于合法无变化。
- 不因受托人相同而豁免冲突，也不引入祖先与下级之间的覆盖优先级；现有读端仍要求每个观察点最多匹配一条 Current Privilege Delegation。

## Consequences

整体候选的命令、故事与测试归属见[最终契约核对](../features/admin/admin-mutation-contract.md)。本决定已落实到独立 API 写侧，
不因此采用 Admin 的 changed/result wire；代码与本地验证不代表环境已切换，部署责任见[协调清单](../releases/admin-mutation-contract-cutover.md)。

- 以委托人 User 行作为协调锁是该 Internal 领域明确的锁范围扩展，不改变 [ADR-0025](0025-align-admin-mutation-results-with-committed-facts.md) 的 Admin 通用锁范围。同一委托人的写入串行化，即使它们涉及不同权限或组织范围；是否允许并存由领域检查决定，不能把共用锁等同于业务互斥。
- 该锁不自动提升受托人、Organization、Privilege 等引用对象的生命周期保证，不引入跨领域级联修复。未来委托写入口必须复用相同协调入口和顺序。
- 本决定启动 [ADR-0020](0020-provide-fail-closed-privilege-delegation-resolution.md) 当时明确未处理的写侧治理；现有读端的范围覆盖、完整性异常失败关闭与不递归解析继续保留，不能因写侧加强而删除读端防守。
