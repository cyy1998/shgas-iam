# 05 — 原子完成 Employment Transfer

**What to build:** 管理员通过一个 Transfer 操作在同一时刻结束旧任职并创建新的立即生效任职，明确决定新任职是否为主任职，不继承旧任职的暂停或主任职状态。

**Blocked by:** 03 — 不可逆结束 Employment 并退役通用状态与删除入口；04 — 手动维护可选 Primary Employment

**Status:** resolved

- [x] Enable 与 Pause Employment 都可以作为 Transfer 来源，Ended 与 Legacy Employment Tombstone 被拒绝。
- [x] Transfer 从注入的 Clock 读取一次时刻，并把它同时写为旧 Employment 的 `endTime` 和新 Employment 的 `startTime`。
- [x] 旧 Employment 进入 Ended 并清除 Primary；新 Employment 使用新 ID、状态 Enable、`endTime` 为空。
- [x] Transfer 必须显式接收 `isPrimary: true | false`，Admin 页面在管理员明确选择前不能提交，也不从旧记录提供默认值。
- [x] `isPrimary=true` 时原子替换该用户其他 Open Primary；`false` 时不自动选择任何替代主任职。
- [x] Transfer 不接受调用方提供的 `startTime`、`endTime` 或新状态，也不继承旧 Pause 状态。
- [x] 创建新任职前验证目标 Position/Organization 状态、岗位组织范围、同组合 Open 唯一性和 User 有效引用。
- [x] 旧任职结束、新任职创建、Primary 调整、Transfer 审计和 User Profile Dirty 在同一 UnitOfWork 中完成，任一步失败全部回滚。
- [x] Transfer 不创建 Organization Responsibility 占位联动，也不撤销 Session 或修改 TTL。
- [x] Application Component Integration 与 Admin 页面测试覆盖两个来源状态、统一时间、显式 Primary、目标完整性、重复 Open、失败回滚和无状态继承。
