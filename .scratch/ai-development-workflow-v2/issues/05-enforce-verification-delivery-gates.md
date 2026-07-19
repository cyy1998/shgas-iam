# 05 — 校验验证与交付记录格式

**What to build:** 扩展 workflow checker，校验 Validation Plan、阶段/验证/评审记录、waiver、merge brief、delivery receipt 与最终 SHA 的当前文档格式完整性，不判断证据来源、新鲜度或本地交付事务是否真实发生。

**Blocked by:** 03

**Status:** resolved

- [x] `Validation Plan` 的固定表头、唯一 scope 行、枚举单元格和 `<br>` 命令列表完整正确；checker 不根据 diff 推导应有命令。
- [x] `阶段证据`、`验证记录`、`评审记录`、`授权记录`、`Waivers`、`重开与修复`、`Merge brief` 与 `Delivery receipt` 章节恰好存在并使用允许的空状态或记录形状。
- [x] 阶段、ticket、验证和评审记录出现时，必需的 Gate ID、ticket 编号、命令文本、SHA 字面值与结果字段格式完整。
- [x] Waiver 记录出现时包含日期、命令、原因、范围、风险和批准者；checker 不证明批准者身份或命令无法运行。
- [x] Merge brief 出现时包含约定字段和列表结构；checker 不比较目标分支 tip、不解析 commit range，也不判断批准是否仍新鲜。
- [x] Delivery receipt 与 delivered 状态出现时，ledger 和 ticket 中的 final SHA 使用完整字面格式，当前文档不得残留格式上不允许的 `pending`。
- [x] 当前文档明确要求相等的字段可做字面值比较，但 checker 不验证 SHA 对象、祖先关系、squash 拓扑、分支删除或 tracker-only 提交。
- [x] 失败诊断只陈述记录格式问题和修复位置，不声称由此证明或否定真实 gate、验证、评审或交付结果。
- [x] CLI tests 覆盖缺失/重复章节、Validation Plan 表格、证据与 waiver 形状、merge brief、delivery receipt、final SHA 和 `pending` 格式规则。
- [x] 测试明确证明 checker 在没有 `.git` 目录或不可解析 SHA 的文档树中仍能完成格式校验。

## Resolution

- Ticket base: `dfdfff33ba050be4f42556c5204b6f0c363e2ecf`
- Reviewed content head: `f8d5cbfce47dc0baff32e9ca8ab6ad66e806eae8`
- Candidate commits: `70b77e86cf76773745485b2f3749c1cec091c818`, `f8d5cbfce47dc0baff32e9ca8ab6ad66e806eae8`
- Final squash commit: `pending`
- Validation:
  - `pnpm test:workflow` — passed，98 个 CLI tests、507 个 expectations
  - `pnpm lint` — passed，仅有仓库既有 warning
  - `pnpm typecheck` — passed，14 个 workspace tasks
  - `pnpm check:docs` — passed，共检查 28 篇索引文档
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
