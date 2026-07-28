# 05 — 把 transaction-bound invalidation 留在行为契约

**What to build:** 审计并在现有公开 interface 可观察时补齐 `UserProfileInvalidation` 与 UnitOfWork behavior/contract tests，让 transaction-bound invalidation 继续由行为契约、typecheck 和 process smoke 覆盖，而不是新增 semantic AST 规则。

**Blocked by:** 01 — 建立根级 Architecture Guard 并守住 consumer-owned port

**Status:** resolved

**Owner:** `/root/ticket_05_implementation`

- [x] 审计现有 `UserProfileInvalidation` public interface tests 对 source change 映射、dirty persistence、去重/version 与单次 after-commit wake-up 的覆盖；仅在现有 interface 可观察且确有缺口时补 case。
- [x] 审计现有 UnitOfWork public interface tests 对 transaction-port factory/callback 共享 lifecycle、rollback、observability 与 best-effort after-commit 行为的覆盖；仅在现有 interface 可观察且确有缺口时补 case。
- [x] API/Admin typecheck 与相关 process smoke 继续覆盖 production composition 的类型连接、真实 wiring 和 readiness。
- [x] 当前 composition 使用当前 `db: tx` 与 lifecycle 的具体 source expression 继续作为 code review 与 Current architecture fact，不新增 `transaction-bound-invalidation` rule。
- [x] 不解析 callback、variable binding、call arguments、factory shape、control/data flow，也不为 arrow/helper/shorthand/indirect return 等实现语法建立 fixture。
- [x] 不为了测试暴露 production-only seam；若事实无法从现有 interface 观察，不创建 scanner，也不创建映射 implementation 细节的浅 interface。
- [x] 根规则目录仍不包含 transaction semantic AST rule；相关 public behavior/contract tests、API/Admin typecheck/process smoke、`pnpm check:architecture` 和 `git diff --check` 通过。
