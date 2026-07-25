# 05 — 迁移用户与任职写路径

**What to build:** 让所有用户和任职领域写入只记录 user/employment change，使供应商注册与用户离职等复合流程一次表达完整领域变化，同时保持其他提交后行为不变。

**Blocked by:** 03 — 完成范围型变化解析与应用 composition

**Status:** resolved

- [x] 用户创建、更新、删除、暂停和绑定手机均记录 user change，不再选择 scope、reason、callback 或 trace metadata。
- [x] 任职创建、更新、删除、调动、主任职变化和供应商任职均记录 employment change。
- [x] 新供应商用户在同一次 `recordChanges` 调用中同时记录 user 与 employment change，并只产生一份合并后的用户 dirty fact。
- [x] 已有供应商用户新增任职时只记录 employment change。
- [x] User Resignation 在同一次调用中记录 user 与 employment change。
- [x] User Resignation 的 session revocation 继续使用通用 `tx.afterCommit`，不被迁入 User Profile 模块。
- [x] 相关调用方测试只断言提交的领域 change，不再断言 projection scope、reason、`afterCommit` 或 observability metadata。
- [x] 这些写路径中不再存在旧 marker 调用。
