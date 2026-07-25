# 03 — 完成范围型变化解析与应用 composition

**What to build:** 让业务调用方可以用 organization、position、role 或 role-assignment change 描述变化，由 User Profile 模块在当前 transaction 中解析所有受影响用户，并让 API 与 Admin API 的 transaction ports 可取得完整的新失效 seam。

**Blocked by:** 02 — 建立事务绑定的直接用户失效内核

**Status:** resolved

- [x] Organization、position 与 role change 分别解析受影响用户并写入对应 canonical reason。
- [x] Role-assignment 的 Organization、Position 与 Employment target 都能解析受影响用户；删除后可使用删除前保存的 target。
- [x] Role 反向解析继续遵循现有 ADR 的保守语义，不因角色、岗位或组织状态更新顺序漏掉用户。
- [x] 多个 change 或多个 target 命中同一用户时只写一次 dirty fact，并合并、去重和 canonicalize reasons。
- [x] 没有受影响用户的范围型变化成功 no-op。
- [x] 受影响用户解析与 dirty persistence 使用同一个 transaction；任一步失败都会使 transaction 失败。
- [x] API 与 Admin API 的 transaction composition 使用当前 transaction、lifecycle、clock 和 rebuild queue adapter 创建完整失效模块。
- [x] 扩展阶段保留旧 marker 供尚未迁移的调用方使用，现有业务行为保持通过。
