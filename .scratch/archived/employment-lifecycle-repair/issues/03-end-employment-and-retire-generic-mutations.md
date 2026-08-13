# 03 — 不可逆结束 Employment 并退役通用状态与删除入口

**What to build:** 管理员可以明确结束 Enable 或 Pause Employment 并保留可信历史；系统不再允许通用状态修改、恢复已结束任职、软删除任职或编辑生命周期时间。

**Blocked by:** 02 — 通过显式命令暂停与恢复 Open Employment

**Status:** resolved

- [x] Enable 与 Pause Employment 可以通过显式 End 命令进入 Ended。
- [x] End 使用一次注入的事务时刻写入不可变 `endTime`，保留原 `startTime`，并清除 Primary。
- [x] 对已经 Ended 的 End 返回幂等成功，不改写 `endTime`，也不重复写状态变更审计或 User Profile Dirty。
- [x] Ended Employment 不允许 Resume、编辑 description、调整 Primary、再次转岗或删除；返聘必须创建新 Employment。
- [x] Admin REST/tRPC 契约和页面移除通用 status update 与 Employment delete，不保留长期兼容 alias。
- [x] Employment 编辑契约只保留 Open Employment 的非生命周期字段，不再接受 `startTime`、`endTime`、status 或删除标记。
- [x] Admin 页面为 Enable/Pause 提供 End，为 Ended 提供只读详情；删除按钮、任意状态选择器和可编辑起止时间全部消失。
- [x] 正式写路径不再产生新的 `isDelete=true` Employment；既有 Legacy Employment Tombstone 保持原样并继续从正常任职读取中排除。
- [x] End、专用审计和 User Profile Dirty 在同一 UnitOfWork 内原子完成，且不触发 Session 撤销。
- [x] Application 与 Adapter contract tests 覆盖终态、幂等、不可编辑、旧入口退役、稳定错误和事务回滚；Admin 页面测试覆盖合法动作矩阵。
