---
status: accepted
---

# 直接 Client 委托的失败关闭解析与写入协调

Client Delegation 以单个 Client 表达组织范围和期间内的直接代办关系。2026-10-20 修订以单 Client 替换旧权限集合，
让 Admin、SSO 与 Internal 共享同一模型。委托独立于角色、登录身份和目录发布，实际业务操作权限由接入应用判断。
[应用委托规则](../features/client-delegation.md) · [接入指南](../guides/delegation.md) · [实施与验收 Spec #264](https://github.com/cyy1998/shgas-iam/issues/264)

## 直接解析与公开边界

认证身份固定 Internal Client，同一观察时点与数据库快照解析直接代办人。组织范围按当前子树计算，
使新增后代自动纳入，代价是组织变化可改变既有委托的适用范围。
选择直接解析，避免递归委托链与角色推导扩大范围。只有输入已识别且无当前委托时才返回空代办人。
重复匹配、自委托、损坏引用或依赖故障使整次查询失败，避免任意选定结果或以部分成功掩盖完整性异常。
需要先筛选用户的调用方独立执行目录搜索，再提交显式用户名解析。

## 按委托人协调写入

各入口复用 `@iam/delegation`，按现存委托人 User 加锁。更新在锁前只定位不可变委托人，锁后重读目标和调用范围，
再检查冲突、写入并审计。选择现存 User 作为协调点，以覆盖尚无委托行的空槽。
接受同一委托人无关写入也串行化的成本；业务冲突仍按同一 Client、相交期间与覆盖组织判断。
保留显式冲突，拒绝最近祖先、下级覆盖或同受托人折叠。
[装配与事务](../../packages/delegation/README.md#装配与事务)

## 引用历史与单代切换

未结束的委托引用阻止删除双方 User、Client 或选定 Organization。结束后按既有门禁软删除，历史使用保留的当前名称与删除状态。
这延续 [ADR-0039](0039-tighten-admin-reference-integrity-and-preserve-history.md) 的显式删除顺序，接受跨对象预检的乐观边界。
Admin 通用事务与写入结果由 [ADR-0025](0025-align-admin-mutation-results-with-committed-facts.md) 维护。

旧 Privilege 没有唯一 Client 归属，自动转换可能扩大代办范围。选择一次迁移移除旧委托，从空记录开始，
保留审计与非目标业务数据，接受用户重建委托、调用方配对升级以及失去应用内权限粒度的成本。
[旧来源迁移](../releases/README.md#一次性迁移与旧版本)

历史来源：[ADR-0020 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0020-provide-fail-closed-privilege-delegation-resolution.md)、[ADR-0026 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0026-serialize-privilege-delegation-writes-by-delegator.md)。原始决定与后续修订按各版本追溯。

固定历史版本：[整理前 ADR-0020](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0020-provide-fail-closed-privilege-delegation-resolution.md)。
