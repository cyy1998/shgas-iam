# 04 — 让 worker maintenance 复用统一 dirty workflow

**What to build:** 让 backfill 和 repair 通过与在线失效相同的 dirty、version、payload 和 bulk delivery 规则工作，同时把 rebuild processor 收缩为稳定档案重建状态机。

**Blocked by:** 02 — 建立事务绑定的直接用户失效内核

**Status:** resolved

- [x] Backfill 按现有批量配置分页扫描全部用户，每批使用 Backfill reason 推进一次版本并立即 bulk enqueue。
- [x] Backfill 正确处理空库、完整批次、最后不足一批和跨页去重，并返回准确的 enqueue 总数。
- [x] Repair 覆盖 failed、stale pending 和 stale processing dirty row，并保持非 stale processing row 不变。
- [x] Repair 重投 dirty row 当前版本，绝不调用 mark-dirty 或推进 `dirtyVersion`。
- [x] Stale processing reset 使用现有并发保护；reset 失败的 row 不被错误重投。
- [x] Backfill 与 repair 生成的 rebuild payload 和 job ID 与在线失效完全兼容。
- [x] Rebuild processor 的公开职责只包含 claim、build、upsert/delete、processed、failed 和 stale 处理。
- [x] 旧 scope-expansion consumer 在协议退役 ticket 前通过隔离的兼容路径继续工作。
