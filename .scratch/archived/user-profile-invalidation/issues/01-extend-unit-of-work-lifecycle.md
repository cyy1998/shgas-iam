# 01 — 扩展 UnitOfWork transaction lifecycle

**What to build:** 让 transaction-port composition 在事务开始时取得与 transaction callback 相同的 `afterCommit` registration port 和当前 observability，同时保持其他领域继续通过 `tx.afterCommit` 登记提交后行为。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Transaction-port factory 在创建事务端口时能够取得 `{ afterCommit, observability }` lifecycle。
- [x] Factory lifecycle 与 transaction callback 暴露的是同一个 after-commit registration port。
- [x] 成功提交后，factory 创建的端口与 callback 登记的任务按注册顺序执行。
- [x] 事务回滚时不执行任何已登记的 after-commit 任务。
- [x] 现有依赖 `tx.afterCommit` 的调用方无需改变行为。
- [x] UnitOfWork 契约测试覆盖 lifecycle 注入、成功提交和回滚路径。
