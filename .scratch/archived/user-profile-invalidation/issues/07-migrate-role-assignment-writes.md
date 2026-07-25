# 07 — 迁移角色与角色分配写路径

**What to build:** 让角色状态和角色分配变更以 role 或 role-assignment change 驱动 User Profile 重建，并在修改或删除分配时完整覆盖原 target 与新 target。

**Blocked by:** 03 — 完成范围型变化解析与应用 composition

**Status:** resolved

- [x] 角色状态变化记录 role change，并使用保守反向解析覆盖可能保留旧授权的用户。
- [x] 角色分配创建记录其领域 target 的 role-assignment change。
- [x] 角色分配范围修改记录所有可能受影响的原 target 与新 target。
- [x] 角色分配删除使用删除前保存的 target 记录 change。
- [x] App-local assignment-to-scope 映射被移除，调用方不再接触 User Profile scope 或 reason。
- [x] 相关调用方测试只断言 role/role-assignment change 和既有领域结果。
- [x] 这些写路径中不再存在旧 marker 调用。
