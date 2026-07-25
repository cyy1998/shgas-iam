# 06 — 迁移组织与岗位写路径

**What to build:** 让组织和岗位领域写入只提交对应 source change，由事务绑定失效模块决定受影响用户、reason 和提交后投递。

**Blocked by:** 03 — 完成范围型变化解析与应用 composition

**Status:** resolved

- [x] 组织更新和删除记录 organization change，并覆盖所有受影响用户。
- [x] 岗位更新和删除记录 position change，并覆盖所有受影响用户。
- [x] 领域写入完成后、同一 UnitOfWork transaction 内调用 `recordChanges`。
- [x] 调用方不再导入或构造 User Profile scope、dirty reason、after-commit port 或 queue metadata。
- [x] 相关调用方测试只断言领域 change 和既有领域结果。
- [x] 这些写路径中不再存在旧 marker 调用。
