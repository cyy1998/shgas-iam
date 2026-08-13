# 04 — 手动维护可选 Primary Employment

**What to build:** 管理员可以明确设置或取消一个用户的主任职，系统只保证零或一条 Open Primary Employment，不自动选择、补位或根据任职状态猜测主任职。

**Blocked by:** 03 — 不可逆结束 Employment 并退役通用状态与删除入口

**Status:** resolved

- [x] 管理员可以把一条 Enable 或 Pause Employment 设置为 Primary。
- [x] 设置 Primary 在同一 UnitOfWork 中清除该用户其他 Open Employment 的 Primary，再设置目标记录。
- [x] 管理员可以取消当前 Primary，使用户合法地拥有零条 Primary Employment。
- [x] Ended Employment 与 Legacy Employment Tombstone 不能被设置为 Primary，也不参与当前 Primary 基数；既有墓碑字段保持原样而不被本次任务改写。
- [x] 对已达到目标 Primary 状态的重复命令保持幂等，不重复写变更审计或 User Profile Dirty。
- [x] 系统不因创建、暂停、恢复、结束其他任职或只剩一条 Open Employment 而自动选择替代主任职。
- [x] Admin API 使用明确的设置/取消意图，页面展示零或一条主任职并允许对 Pause Employment 操作。
- [x] Primary 变更、专用审计和 User Profile Dirty 原子完成，不撤销 Session。
- [x] 基数只由当前应用事务中的顺序检查保证；不新增数据库 constraint、锁或并发重试。
- [x] Application Component Integration 与 Admin 页面测试覆盖零/一基数、原子替换、取消、Pause 目标、Ended/墓碑拒绝、幂等和失败回滚。
