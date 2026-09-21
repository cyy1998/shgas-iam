---
status: accepted
---

# 直接权限委托的失败关闭解析与写入协调

Internal Client 需要在同一当前观察点取得各 User 的直接 Delegatee。读取不能从未对齐的记录集合猜测结果；写入也不能
依赖尚不存在的委托行锁裁决时间重叠。本页合并解析与后续写入治理的决定，两者共同维护“每个观察点最多一条当前委托”。

## 直接解析与公开边界

`POST /internal/delegations/resolve` 在同一服务端时刻和数据库快照中解析，保持输入顺序返回
`{ username, delegateeUsername }`。不递归委托链、不重验委托人当前是否拥有该 Privilege，双向直接委托可以分别解析。

- 必填 `usernames/orgCode/privilegeCode`；username 精确、唯一且为 1–100 项。格式或预算错误整体返回
  `422 COMMON.VALIDATION_FAILED`；任一输入不存在或已删除整体返回 `404 PRIVILEGE.DELEGATION_RESOLUTION_INPUT_NOT_FOUND`。
- null 仅表示已识别 User 没有当前委托。输入 User/Organization/Privilege 的 Pause 或 Disable 不妨碍识别；
  委托自身必须未删除、为 Enable 且观察点位于闭区间 `[startTime, endTime]`。组织范围为请求组织或其祖先。
- 任一用户匹配多条记录，即使 Delegatee 相同，或记录自委托、引用缺失/已删除对象，均属完整性异常。
  异常、数据库不可用和超时统一为脱敏 `503 PRIVILEGE.DELEGATION_RESOLUTION_UNAVAILABLE`，不选 winner、折叠或返回部分结果。
- 全部合法且 Enable 的 Internal Client 共享能力；app-local resolver 不缓存或自动重试，保留 2 秒 statement timeout
  与 5 秒 handler budget。旧 `/internal/users/search-with-delegation` 不由本决定删除或改变响应。

## 按委托人协调写入

创建与更新在同一事务中先锁委托人 User，再重读目标与权限绑定、检查完整候选及冲突、写业务事实和成功审计。
更新锁前只定位不可变的委托人 ID，不能根据旧状态继续写。选择现存 User 协调，避免“没有委托行就无锁可取”的空槽竞态。

同一委托人所有写入串行化，但只有权限集合、闭区间时间和组织覆盖范围三者相交才业务互斥。
Pause 仍占用期间，端点相接算相交；同组织或祖先/下级覆盖冲突，不相交范围可并存。
同受托人不豁免冲突，不设祖先覆盖优先级。完整记录更新排除自身，结束后只允许纯重复结束，不重写业务行，但仍记录
`changed:false` 的意图审计。

创建保留 Enable 引用预检；更新协调锁要求委托人存在且未删除，不要求仍 Enable。接受同委托人不相关写入也串行化的成本，
但不声称加强其他引用对象生命周期。未来入口必须复用同一顺序；写侧增强不能删除读侧对历史及新增异常的防守。

## 当前契约与历史

Internal 创建仍返回详情、更新仍返回 boolean，未采用 Admin 的 changed/result，也不登记 Profile dirty。
事务与接线见[后端架构](../architecture/backend-architecture.md#admin-同对象写入规范)；Admin 通用锁范围由
[ADR-0025](0025-align-admin-mutation-results-with-committed-facts.md) 独立拥有。

历史来源：[ADR-0020 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0020-provide-fail-closed-privilege-delegation-resolution.md)、[ADR-0026 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0026-serialize-privilege-delegation-writes-by-delegator.md)。原始决定与后续修订按各版本追溯。
