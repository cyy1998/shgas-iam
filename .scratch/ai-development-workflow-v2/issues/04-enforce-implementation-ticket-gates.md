# 04 — 校验 ticket 与生命周期记录格式

**What to build:** 扩展 workflow checker，完整校验 spec、ticket、Resolution、Reopen 与 remediation 的 Markdown 记录格式和当前文档静态引用，不判断这些生命周期事件是否能由 Git 历史追溯证明。

**Blocked by:** 03

**Status:** resolved

- [x] Standard feature 必须包含唯一 spec 和连续编号的 ticket 文件；spec 的标题、唯一 `Status` 字段与允许值按约定校验。
- [x] Ticket 标题编号、`What to build`、`Blocked by`、`Status`、验收 checkbox 和二级章节使用规范结构，必需字段不得缺失或重复。
- [x] `Blocked by` 只接受约定语法，并静态确认引用同 feature 中已存在、编号更小的 ticket；不读取 blocker 的 Git 历史。
- [x] `ready-for-agent`、`claimed` 与 `resolved` 对应的当前文档必需字段、checkbox 状态和 Resolution 是否存在按格式规则校验。
- [x] Resolution 的字段顺序、SHA 字面格式、candidate 列表、Validation 子列表和固定 Review 行完整正确。
- [x] Reopen 与 remediation 记录出现时，其标题、日期、必需字段、枚举和引用格式完整正确，旧记录不被 checker 用 Git 历史重放。
- [x] Markdown code fence 内的示例不被误判为机器字段、章节或验收 checkbox。
- [x] Checker 不验证 ticket base、candidate 或 reviewed SHA 可解析，不验证 range 非空、命令真实执行、评审真实发生或 tracker-only 提交分类。
- [x] 失败诊断指向具体 spec/ticket 和缺失或错误字段，不使用笼统的 gate 失败替代格式说明。
- [x] CLI tests 通过临时文档树覆盖字段缺失/重复、非法状态、畸形 checkbox、blocker 静态引用、Resolution、Reopen、remediation 和 code fence 边界。

## Resolution

- Ticket base: `fd89282109020884ef16ac436f336abe584e6026`
- Reviewed content head: `0838c37190450a17467048f1483e14a1bf1a6b88`
- Candidate commits: `fc50e8f52af11a44e0c2c1ca5408b11fc7a2e264`, `0838c37190450a17467048f1483e14a1bf1a6b88`
- Final squash commit: `pending`
- Validation:
  - `pnpm test:workflow` — passed，81 个 CLI tests、356 个 expectations
  - `pnpm lint` — passed，仅有仓库既有 warning
  - `pnpm typecheck` — passed，14 个 workspace tasks
  - `pnpm check:docs` — passed，共检查 28 篇索引文档
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
