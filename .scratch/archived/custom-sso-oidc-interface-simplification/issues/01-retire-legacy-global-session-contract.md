# 01 — 退役 legacy Global Session contract

**What to build:** 完整删除已无生产消费者的 legacy Global Session resolver、shared envelope/version 与数据库 ID
account lookup，使维护者不再面对两套 session 模型；当前 `global_session` Cookie、Principal Session 解析、按 Subject
Identifier 的 account resolution 和 reauthentication 行为保持不变。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] legacy resolver 及其私有 envelope、user、store、reader 和旧数据库 ID lookup 被删除，生产 composition 不再声明或构造这些能力。
- [x] shared legacy Global Session envelope/version 不再从 contracts Interface 导出，且不保留 deprecated alias 或 compatibility re-export。
- [x] 当前 Cookie 解析、Principal Session lookup、按 Subject Identifier 的 account resolution 与 reauthentication policy 继续通过既有 observable tests。
- [x] 受影响的测试 doubles 不再实现 dead `findById`，workspace import 搜索和 typecheck 证明没有遗留仓内消费者。
- [x] 若 Current 文档仍把旧 envelope 描述为 runtime contract，同步改为明确的 cleanup-only 历史状态；不修改领域术语或新增 ADR。
- [x] 运行直接相关的 OIDC Provider、contracts 测试与 lint/typecheck，并通过 `git diff --check`；文档变化通过 `pnpm check:docs`。
