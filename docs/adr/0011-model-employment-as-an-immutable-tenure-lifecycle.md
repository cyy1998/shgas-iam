---
status: accepted
---

# 将 Employment 建模为不可重开的任职期生命周期

Employment 只表示用户以某个 Position 在某个 Organization 下的一次任职期事实，而不是可以反复启停和删除的关系槽位。
当前 IAM Admin 只通过明确的 Create、Pause、Resume、End 和 Transfer 命令改变它：Pause 可在同一任职上恢复，End 不可逆，
返聘、重新任职与转岗创建新 Employment；当前 Admin 的任职边界使用一次注入的事务时刻，不允许调用方预约、回填或改写。

Enable 与 Pause 都属于 Open Employment。Open Employment 必须引用已启用且未软删除的 Position 和 Organization；父对象
停用或软删除、User 软删除、同组合重复 Open Employment 和多个 Primary Employment 由 Employment 写入 Module 在现有
UnitOfWork 内阻断。Position/Organization 有效性是 Employment Integrity，不是下游用来静默隐藏或恢复任职的运行时开关；
User Profile/Subject Facts 发布前保留最后一道 fail-closed 守卫，已发布投影的消费者不再现场联表重查父对象。

Effective Employment 仅表示当前时刻位于 `[startTime, endTime)` 且状态为 Enable 的非墓碑 Employment。Role Assignment
Resolution 继续拥有角色分配目标、角色状态、组织闭包、client 范围、去重和排序，但其正向解析不再把 Employment 的 Position
或所属 Organization 状态当作静默过滤条件；本决定因此只取代 ADR-0002 中该项父对象过滤口径，其余正向与反向解析契约保持有效。

## Consequences

- 普通 Employment 变化只令 User Profile 失效，不撤销 Session 或修改 Token TTL；User Disable 与 User Resignation 的
  Subject Access 和 Session 撤销安全语义保持不变。
- 当前所有 Employment 的 Authority 隐含为 IAM。未来受信任外部 Authority 可以引入自己的权威业务时间和来源元数据，但不得
  通过 last-writer-wins 覆盖同一 Employment；本次不提前实现该集成或 schema。
- 历史 `isDelete=true` 记录保留为 Legacy Employment Tombstone，不推断 Employment End，也不再由正式写路径创建。
- 当前低并发 Admin 接受应用事务中的顺序检查，不新增数据库约束、锁或重试；切换前以只读审计阻断既有非墓碑异常，已知并发竞态
  留待写入规模或外部 Authority 发生变化时重新评估。
