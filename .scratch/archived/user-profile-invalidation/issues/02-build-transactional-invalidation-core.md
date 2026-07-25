# 02 — 建立事务绑定的直接用户失效内核

**What to build:** 在旧 marker 仍可工作的扩展阶段，提供事务绑定的 `UserProfileInvalidation.recordChanges`，让 user 与 employment 变化能够在源事务中持久化唯一 dirty fact，并在提交后以现有 rebuild wire contract 批量唤醒最新版本。

**Blocked by:** 01 — 扩展 UnitOfWork transaction lifecycle

**Status:** resolved

- [x] 新业务 seam 只暴露返回 `Promise<void>` 的 `recordChanges`，调用方看不到 dirty count、version、job ID 或内部 repository。
- [x] User 与 employment change 分别产生 canonical User、Employment reason；同一用户的重复 change 去重并按固定 reason 顺序持久化。
- [x] 空 change、非法直接 user ID 或无合法用户时不写 dirty fact，也不登记 after-commit callback。
- [x] 一次调用对每个用户只推进一次 `dirtyVersion`，用户按稳定顺序处理。
- [x] 同一 transaction 多次调用只登记一个 callback，且每个用户只入队该 transaction 中最后产生的版本。
- [x] Dirty 时间和 rebuild 请求时间来自注入 clock；request ID 与 trace ID 来自 transaction observability。
- [x] Scope-independent dirty workflow 可同时支持事务提交后投递和 worker 的立即投递，而不向业务接口泄漏 delivery 细节。
- [x] Dirty persistence 失败使源事务失败；提交后的 BullMQ 失败保持 best-effort，不把已提交事务改为回滚。
- [x] Rebuild payload 和 deterministic `userId + dirtyVersion` job ID 与现有协议完全兼容。
