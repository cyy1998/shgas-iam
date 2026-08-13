# 02 — 通过显式命令暂停与恢复 Open Employment

**What to build:** 管理员使用明确的 Pause 和 Resume 操作临时停止或恢复同一次任职，系统保持任职期与主任职事实不变，并阻止恢复到无效父对象或重复任职关系中。

**Blocked by:** 01 — 建立 Employment Lifecycle Interface 并即时创建任职

**Status:** resolved

- [x] Enable Employment 可以通过显式 Pause 命令进入 Pause，且不修改 `startTime`、`endTime` 或 Primary。
- [x] Pause Employment 可以通过显式 Resume 命令进入 Enable，且不修改原 `startTime`、`endTime` 或 Primary。
- [x] Resume 写入前重新验证 Position、Organization、岗位组织范围和同组合 Open Employment 唯一性。
- [x] 对已经 Pause 的 Pause 和已经 Enable 的 Resume 返回幂等成功，不重复写状态、状态变更审计或 User Profile Dirty。
- [x] 非法来源状态返回稳定业务冲突，不通过任意 status 值绕过状态机。
- [x] Admin API 暴露明确 Pause/Resume 操作，Admin 页面按当前状态显示对应动作，不再用通用状态选择器执行这两个行为。
- [x] 成功状态变化、专用审计和 User Profile Dirty 登记在同一 UnitOfWork 内完成，失败全部回滚。
- [x] Pause/Resume 不撤销 Principal Session、OIDC 或 Custom SSO artifact，也不修改 TTL。
- [x] Application Component Integration 测试覆盖全部允许/拒绝迁移、幂等、父对象复核、Open 冲突、Primary 保留、事务失败和无 Session 撤销。
- [x] Admin 页面测试证明 Enable 只呈现 Pause、Pause 只呈现 Resume，并正确刷新可见状态。
