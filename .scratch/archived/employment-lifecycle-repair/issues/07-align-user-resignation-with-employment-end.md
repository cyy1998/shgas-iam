# 07 — 统一 User Resignation 的 Employment End 时间语义

**What to build:** 管理员执行 User Resignation 时，系统以同一个权威时刻结束全部 Open Employment 并禁用账号，同时保持既有 Subject Access 与 Session 撤销安全行为。

**Blocked by:** 03 — 不可逆结束 Employment 并退役通用状态与删除入口

**Status:** resolved

- [x] User Resignation 结束目标用户全部非墓碑 Enable 与 Pause Employment，Ended 和墓碑保持不变。
- [x] 一次离职只从注入的 Clock 读取一个时刻，并将其用于本次所有新形成的 Employment End。
- [x] repository 不再自行读取系统时间决定离职业务边界。
- [x] 结束任职时清除 Primary；重复离职不改写既有 `endTime` 或重新结束历史记录。
- [x] 全部 Employment End、User Disable、离职审计和 User Profile Dirty 在现有 Subject Access 保护的同一数据库事务中完成。
- [x] 任一事务内失败都回滚离职结果，且不会提前撤销 Session。
- [x] 事务成功后保留现有全量 Session 撤销、`user_disabled` 原因、失败 best-effort 和重复离职再次尝试撤销的语义。
- [x] 现有离职 REST/tRPC 与 Admin 页面调用体验保持兼容，不引入新的时间输入。
- [x] User Resignation use-case Component Integration 测试覆盖统一时间、Enable/Pause 批量结束、重复离职、事务失败、Subject Access 和 Session 撤销回归。
- [x] 普通 Employment Pause/Resume/End 的无 Session 撤销测试继续通过，证明账号安全边界没有扩散到日常任职变化。
