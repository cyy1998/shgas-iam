# 06 — 用 Open Employment 守卫 Position、Organization 与 User 生命周期

**What to build:** 管理员停用或删除岗位、组织与用户时，系统根据统一的 Open Employment 语义阻止会破坏任职完整性的操作，同时允许只有已结束历史或旧墓碑的对象正常处理。

**Blocked by:** 03 — 不可逆结束 Employment 并退役通用状态与删除入口

**Status:** resolved

- [x] Position 存在任意关联 Enable 或 Pause Employment 时，停用和软删除都返回稳定业务冲突。
- [x] Organization 在现有组织层级规则覆盖的范围内存在任意 Enable 或 Pause Employment 时，停用和软删除都返回稳定业务冲突。
- [x] User 存在任意 Enable 或 Pause Employment 时，软删除返回稳定业务冲突。
- [x] Ended Employment 与 Legacy Employment Tombstone 不阻止 Position、Organization 或 User 生命周期操作。
- [x] 普通 User Disable 不暂停、结束、删除或改写 Employment。
- [x] 父对象重新启用不修改任何 Employment 状态，也不产生隐式恢复。
- [x] Open Employment 查询与计数统一包含 Enable/Pause 并排除 Ended/墓碑，相关 repository 窄测试证明该口径。
- [x] 现有 Admin 页面能够显示稳定冲突结果，不通过级联修改 Employment 来让操作成功。
- [x] 不新增数据库锁、约束、隔离级别或并发重试；已知 TOCTOU 风险保持为 spec 记录的范围限制。
- [x] Position、Organization 与 User 的最高层 Application Component Integration 测试覆盖 Enable、Pause、Ended、墓碑及父对象重新启用行为。
