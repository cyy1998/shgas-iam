# 01 — 建立 Employment Lifecycle Interface 并即时创建任职

**What to build:** 管理员通过统一的 Employment Lifecycle Interface 创建立即生效的一次任职；系统拥有开始时间、状态和完整性规则，Admin 调用方不再提供任职期边界或任意状态。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Create 通过 Employment Lifecycle Module 的公开 Interface 完成，route、页面和 repository 不各自决定生命周期规则。
- [x] 新 Employment 使用一次注入的事务时刻作为 `startTime`，状态为 Enable，`endTime` 为空。
- [x] Admin 创建契约和表单不再接收或显示 `startTime`、`endTime` 与 status。
- [x] 创建前验证 User、Position、Organization 存在，Position/Organization 已启用且未软删除，并满足既有岗位组织范围规则。
- [x] 重复检查把 Enable 与 Pause 都视为 Open Employment；Ended 历史和 Legacy Employment Tombstone 不产生冲突。
- [x] 创建仍允许管理员明确选择是否为 Primary；未选择时为 false，系统不自动推断主任职。
- [x] Employment 写入、创建审计和 User Profile Dirty 登记在同一 UnitOfWork 中原子完成，失败不留下部分结果。
- [x] 普通创建不触发 Session 撤销，也不改变任何 Session/Token TTL。
- [x] 不新增或删除 Employment schema、状态数值、索引、数据库约束或未来 HR 来源字段。
- [x] 最高层 Application Component Integration 测试覆盖成功、父对象无效、范围不兼容、重复 Open、事务失败和统一时间；Admin 页面测试覆盖即时创建体验。
