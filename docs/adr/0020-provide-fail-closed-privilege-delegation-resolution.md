---
status: accepted
---

# 直接 Client 委托的失败关闭解析与写入协调

Client Delegation 在指定组织范围和期间内为用户查找直接代办人。2026-10-20 的修订以单个 Client 替换原权限集合，
统一 Admin、SSO、Internal 的维护规则与调用范围。本页保存决定和取舍；完整接口、生命周期、页面及切换流程见
[Client 委托与管理契约](../features/delegation/client-delegation.md)，实施与验收见
[Spec #264](https://github.com/cyy1998/shgas-iam/issues/264)。

## 直接解析与公开边界

`POST /internal/delegations/resolve` 从认证身份确定 Client，在同一服务端观察时刻和数据库快照中按输入顺序返回
`{ username, delegateeUsername }`。不沿链递归，不验证双方是否拥有应用角色或权限；双向直接委托可以分别解析。

- 必填 `usernames/orgCode`；username 精确、唯一且为 1–100 项。非法格式、旧权限参数或额外 Client 输入整体返回
  `422 COMMON.VALIDATION_FAILED`；任一输入用户或组织不存在、已删除，整体返回
  `404 CLIENT_DELEGATION.RESOLUTION_INPUT_NOT_FOUND`。
- null 仅表示已识别 User 没有当前委托。输入用户和组织的 Pause、Disable 不妨碍识别；委托自身须为 Enable，
  观察点位于闭区间 `[startTime, endTime]`，请求组织属于所选组织当前子树。新后代自动纳入，不冻结组织树。
- 多条匹配即使 Delegatee 相同，或自委托、匹配记录引用缺失/已删除对象，均属完整性异常。
  异常、数据库不可用和超时统一为脱敏 `503 CLIENT_DELEGATION.RESOLUTION_UNAVAILABLE`，不选 winner、折叠或返回部分结果。
- Internal 四类能力全部保留，但创建、搜索、修改和解析都限定在认证 Client 内；越界 ID 不暴露其他 Client 的记录。
  resolver 不缓存或自动重试，保留 2 秒 statement timeout 和 5 秒 handler budget。
- 调用方可以先通过用户 DSL 筛选 username，再独立解析；委托不进入档案、Subject Facts 或角色权限投影，
  不登记 Profile dirty。旧搜索组合接口按 [ADR-0043](0043-retire-public-and-legacy-internal-directory-search.md) 退役。

## 按委托人协调写入

三类入口复用 `@iam/delegation` 的创建、修改、冲突、查询和选择器规则。创建先锁委托人 User；更新锁前仅定位不可变
委托人 ID，取得 User 锁后重读完整目标及调用范围，再检查候选、冲突、写入事实和成功审计。选择现存 User 协调，
避免“没有委托行就无锁可取”的空槽竞态；不同 runtime 的写入使用同一锁顺序。

同一委托人所有写入串行化，但只有同一 Client、相交闭区间和组织覆盖范围三者同时成立才业务互斥。
Pause 仍占位、端点相接算冲突、同受托人不豁免；同组织或祖先与下级互斥，不相交组织或不同 Client 可并存。
接受同委托人不相关写入也串行化的成本，不引入下级优先、最近祖先覆盖或重复折叠。

创建要求双方 User、Client 和所选 Organization 启用且未删除，禁止自委托；无需双方同部门或有应用角色，也无需受托人确认。
双方、Client、组织绑定创建后固定。未手动结束可修改期间和说明、暂停或恢复；自然到期可延期，Pause 延期仍暂停。
Disable 不可重开，仅允许纯重复结束并保留原事实。结束和到期记录继续可查，不提供委托删除。

## 管理分工与引用生命周期

Admin 仅 `iam:admin` 全局管理，HR 不增加委托能力。SSO 管理本人发起的委托、只读本人收到的委托。
Internal 可为用户代建、代管本 Client 的委托。身份和访问范围由后端认证上下文固定，不能以页面隐藏代替授权。
审计区分管理员、本人和实际 Internal Client。Internal 保留创建详情和更新 boolean，Admin 适配统一 mutation result。

委托只表达代办关系，不复制角色、权限或登录身份；业务系统负责操作授权。建立后双方用户或组织停用不自动结束或排除
关系；Client 停用阻止 Internal 认证，亦不隐式结束已有委托。

未结束的直接引用阻止双方 User、Client、所选 Organization 删除，包含暂停、未来和自然到期记录。
结束后按其他既有门禁合法软删除，历史仍读取保留的当前名称及删除状态，不做历史名称快照。
本决定扩展 [ADR-0039](0039-tighten-admin-reference-integrity-and-preserve-history.md) 的门禁对象，
继续接受跨对象预检的乐观边界，不宣称创建和删除的全局串行保证；写侧检查不替代读侧异常防守。

## 单模型切换的取舍

旧 Privilege 无唯一 Client 归属，自动映射可能扩大代办范围。因此拒绝自动转换、旧参数兼容和双模型混跑，
通过正式 migration 清理旧委托及权限绑定，新 Client 模型从空记录开始；统一审计和其他业务数据保留。
接受调用方同步改造、各端配对发布和用户重新建立委托的成本，以及失去同一应用内按权限分别委托的粒度。
本地 migration 与旅程证据不能代替目标环境停流、备份、切换核验和放流。

共享模块边界见[共享契约](../architecture/contracts-and-database.md)，事务与接线见
[后端架构](../architecture/backend-architecture.md#admin-同对象写入规范)；Admin 通用锁与写入结果由
[ADR-0025](0025-align-admin-mutation-results-with-committed-facts.md) 独立拥有。

历史来源：[ADR-0020 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0020-provide-fail-closed-privilege-delegation-resolution.md)、[ADR-0026 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0026-serialize-privilege-delegation-writes-by-delegator.md)。原始决定与后续修订按各版本追溯。
