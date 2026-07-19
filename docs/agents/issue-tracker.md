# 本地 Markdown 议题跟踪契约

本仓库使用纳入版本控制的 `.scratch/` Markdown 文件跟踪 specs、tickets 与交付证据。已完成 feature 保留在原路径，作为永久交付记录，不归档、不移动、不删除。

完整的分支、授权、验证、评审和 merge 规则见 [workflow.md](workflow.md)；本文只定义 tracker 的文件布局和机器可检查形状。

`pnpm check:workflow` 只负责检查本文件定义的记录格式：必需文件、标题、章节、字段、枚举、表格、列表、字面值格式以及当前文档集内可直接判断的静态引用。它不遍历 Git 历史，不证明 SHA 来源、命令执行、授权、评审、新鲜度或状态转换真实发生；格式检查通过不能替代 workflow gate 和双轴评审。

## 目录布局

每个 feature 使用一个目录：

```text
.scratch/<feature-slug>/
├── delivery.md
├── spec.md                         # 标准路径必需，快速路径可省略
└── issues/
    ├── 01-<slug>.md                # 标准路径一张票一个文件
    └── 02-<slug>.md
```

- Ticket 从 `01` 开始连续编号，不创建合并的 tickets 文件。
- `delivery.md` 是 v2 的持久状态和证据索引，不复制 spec 或 ticket 的验收正文。
- Spec 获批后留在原路径；小型澄清追加带 ISO 日期的 amendment，不静默改写已批准意图。
- 改变范围、行为或架构的发现必须先取得设计确认，再同时修改 spec 和受影响 tickets。

## Delivery ledger v2

新建标准 feature 和快速改动都必须拥有 `.scratch/<feature-slug>/delivery.md`。文件以中文标题开始，随后按以下固定顺序提供顶层字段；字段名和枚举值保持原语言，值不得省略：

```markdown
# <中文功能名>交付记录

Workflow-Version: 2
Feature-Slug: <feature-slug>
Workflow-Kind: standard | quick
Stage: intake | branch-ready | spec-ready | tickets-ready | implementing | feature-verified | merge-ready | delivered
Feature-Branch: codex/<feature-slug> | codex/quick-<slug>
Target-Branch: <branch>
Target-Base: <40-character SHA>
Ticketing-Authorization: pending | granted | not-applicable
Implementation-Authorization: pending | granted
Authorized-Implementation-Scope: <中文范围或 ticket 编号>
Current-Ticket: none | <NN-slug>
Current-Ticket-Base: none | claim-checkpoint | <40-character SHA>
Change-Types: none | <comma-separated code,docs,agent-config,dependencies,database,frontend,gateway>
Affected-Workspaces: none | root | <comma-separated pnpm package names>
Validation-Plan: pending | declared
Content-Head: pending | <40-character SHA>
Verified-Content-Head: pending | <40-character SHA>
Reviewed-Content-Head: pending | <40-character SHA>
Merge-Target-Tip: pending | <40-character SHA>
Final-Squash-Commit: pending | <40-character SHA>
```

字段语义：

- `Stage` 表示最后一个证据完整的功能级状态；ticket gate 记录在正文中，不扩展 `Stage` 枚举。
- `Target-Base` 是创建功能分支时固定的目标 SHA。
- `Authorized-Implementation-Scope` 必须足以判断某张 ticket、remediation 或快速改动是否仍在授权范围内。
- `Current-Ticket-Base: claim-checkpoint` 只允许出现在刚创建且尚未能自引用 SHA 的 claim commit 中；后续 ledger checkpoint 必须回填该 claim commit 的完整 SHA。
- `Change-Types` 与 `Affected-Workspaces` 是当前 feature committed diff 的并集，按 workflow 的路径规则推导；逗号分隔值按字母顺序、不得重复。
- `Validation-Plan: declared` 表示 ledger 已包含符合下述固定形状的 ticket/feature 命令计划，而不是表示命令已通过。
- `Content-Head` 是最近一个 content commit；tracker-only commit 不改变它。
- `Verified-Content-Head` 与 `Reviewed-Content-Head` 分别绑定最近一次有效的 feature 验证和最终评审。
- `Merge-Target-Tip` 是 feature 最终评审和 merge brief 使用的目标 tip。
- `Final-Squash-Commit` 在功能分支生命周期内保持 `pending`，交付后必须是目标分支上的最终 squash SHA。

Ledger 至少包含以下中文二级标题；没有记录时写明“无”，不得删除章节：

```markdown
## 范围与验收
## Validation Plan
## 阶段证据
## 验证记录
## 评审记录
## 授权记录
## Waivers
## 重开与修复
## Merge brief
## Delivery receipt
```

标准路径的范围与验收链接 approved spec 和 tickets；快速路径必须在本节直接写出已批准范围和验收清单。

`Validation Plan` 使用可机器解析的固定表格：

```markdown
## Validation Plan

| Scope | Change-Types | Affected-Workspaces | Required-Commands |
|---|---|---|---|
| ticket:01 | agent-config,docs | root | `pnpm check:docs`<br>`pnpm check:workflow`<br>`git diff --check` |
| feature | agent-config,docs | root | `pnpm check:docs`<br>`pnpm check:workflow`<br>`git diff --check` |
```

- `Scope` 只能是 `ticket:NN` 或 `feature`；快速路径只使用 `feature`。
- 每张已发布 ticket 必须恰有一行，且必须恰有一行 `feature`。
- 类型与 workspace 值遵循顶层字段的枚举、排序和路径推导规则；ticket 行是本票 diff，feature 行是全 feature diff 的并集。
- `Required-Commands` 使用 `<br>` 分隔完整命令，不写通配说明。聚焦测试、受影响 workspace 的 `lint`/`typecheck`、根 feature suite 和专项命令按 workflow 矩阵展开。
- Gateway 命令必须包含环境参数；依赖真实 PostgreSQL 或外部环境的命令仍列入计划，无法执行时通过 Waiver 记录而不是删除。

Checker 校验表格 scope、枚举、排序与 `<br>` 命令列表的当前文档形状，但不读取 diff 推导某行应包含哪些命令，也不证明命令实际执行。

Content commit 产生自身 SHA 后，必须立即创建 content-head sync tracker-only checkpoint。Sync 之前 ledger 暂时指向前一个 content HEAD，任何 gate 都不能据此通过；执行 workflow 的 agent 必须把 sync 作为下一动作。Checker 只检查字段格式，不从提交历史判断这一步是否紧随 content commit。

阶段证据使用稳定 Gate ID，例如：

```markdown
- `T2 Candidate Validated` — ticket 03；Content-Head: `<SHA>`；验证：`pnpm test:workflow`、`git diff --check`。
```

阶段、验证与评审记录使用以下静态形状；没有记录的章节只写 `- 无。`：

```markdown
- `G3 Tickets Ready` — <非空说明>
- `T2 Candidate Validated` — ticket NN；Content-Head: `<SHA>`；<非空说明>

- `<command>` — passed | failed | waived；Content-Head: `<SHA>`；<可选说明>

- Ticket NN | Feature — fixed point: `<SHA>`；reviewed head: `<SHA>`；Standards: passed | findings；Spec: passed | findings；<可选说明>
```

`T1`–`T4` 记录必须包含 ticket 编号，`T2`/`T3` 还必须包含至少一个完整 SHA 字面值。授权记录与 `重开与修复` 使用 `- YYYY-MM-DD — <非空说明>`；授权说明包含动作和范围，并明确未授权的后续阶段。它们是恢复记录，不替代当前任务中的人工确认。

Waiver 使用一行固定字段，批准者只记录字面身份，不由 checker 证明：

```markdown
- YYYY-MM-DD — Command: `<command>`；Reason: <原因>；Scope: <范围>；Risk: <风险>；Approved by: <批准者>
```

Checker 只校验这些记录的字段、枚举、日期与 SHA 字面格式，不验证命令实际执行、结果新鲜度、评审真实性或批准者身份。

## Spec 文件契约

Standard feature 的 `.scratch/<feature-slug>/spec.md` 使用以下最小外层结构：

```markdown
# <中文标题>

**Status:** draft | approved
```

中文一级标题必须位于文件首行；code fence 之外必须恰好出现一个 `**Status:**` 机器字段，且只接受 `draft` 或
`approved`。Checker 对 spec 的格式校验仅限于这两个要求；正文结构与内容质量由来源 spec、`to-spec` 流程和 Spec
评审负责，批准过程与状态转换历史也不由 checker 判断。Standard feature 必须存在该文件；quick feature 的权威范围与
验收位于 delivery ledger，checker 不要求也不禁止额外 spec 文件。

## Ticket 文件契约

实现 ticket 使用以下结构：

```markdown
# NN — <中文标题>

**What to build:** <中文交付行为>

**Blocked by:** None — can start immediately | NN, NN

**Status:** ready-for-agent | claimed | resolved

- [ ] <可观察验收标准>

## Resolution

- Ticket base: `<40-character SHA>`
- Reviewed content head: `<40-character SHA>`
- Candidate commits: `<SHA>`, `<SHA>`
- Final squash commit: `pending` | `<40-character SHA>`
- Validation:
  - `<command>` — passed
- Review: Standards and Spec review passed with no unresolved findings.
```

三个必需字段只在首个二级章节之前的 ticket header 中生效；Comments 中的同名历史文本不参与机器字段解析。字段名、status 和固定 review 结果保持原语言；标题、交付说明、验收项和解释使用中文。Checker 只对标题执行中文形状检查，其他语言一致性由 Standards 评审确认。`Blocked by` 中的编号必须指向同 feature 已存在且编号更小的 tickets。

## Ticket 生命周期

生命周期严格为：

1. `ready-for-agent`：规格完整；只有所有 blockers 都是 `resolved` 时才位于依赖前沿。
2. `claimed`：当前实施任务已拥有该 ticket。修改实现文件前必须把状态与 ledger 一起作为 tracker-only claim checkpoint 提交；该提交 HEAD 是 ticket base。
3. `resolved`：验收项全部勾选，ticket 验证和两轴评审通过，Resolution 完整，且已创建独立 tracker-only resolution checkpoint。

Resolution checkpoint 只能记录状态和证据，不得夹带实现或 spec 变更。功能分支上 `Final squash commit` 保持 `pending`；本地 squash 交付提交成功后，在目标分支把所有 tickets 和 ledger 一次性回填为最终 SHA，再创建一个 tracker-only 元数据提交。

### Claim 记录

Claim checkpoint 必须同时满足：

- ticket 从 `ready-for-agent` 改为 `claimed`；
- ledger 的 `Stage` 为 `implementing`，`Current-Ticket` 指向该票；
- ledger 的 `Current-Ticket-Base` 使用 `claim-checkpoint`；
- staged diff 只包含该 ticket 和 ledger 允许的状态/授权证据。

后续 checkpoint 根据 claim commit 回填完整 `Current-Ticket-Base`。评审必须始终使用该 SHA，不使用浮动分支名代替。

### Resolution 记录

Ticket 只有满足以下条件才能标记 `resolved`：

- 验收项全部为 `[x]`；
- `Ticket base`、`Reviewed content head` 与 `Candidate commits` 可解析，且 reviewed range 非空；
- Validation 列出实际运行的命令和结果；
- Standards 与 Spec 两轴均无未解决 finding；
- `Reviewed content head` 等于当时的 `Content-Head`；
- 功能分支上的 `Final squash commit` 仍是 `pending`。

这些条件中的 SHA 可解析性、range 非空、命令实际执行与评审真实性由 workflow 执行和双轴评审确认。Checker 只校验 Resolution 的字段、顺序、列表和 SHA 字面格式。

初次解决使用普通 `## Resolution`。每个 `## Reopen YYYY-MM-DD` 后必须先追加一个 `## Resolution YYYY-MM-DD`，才能再次 Reopen；当前状态为 `claimed` 时，最新生命周期章节必须是尚未解决的 Reopen。Resolution tracker-only commit 后，ledger 把 `Current-Ticket` 和 `Current-Ticket-Base` 复位为 `none`，或在下一次独立 claim checkpoint 指向下一张票。

## 重开与 review-remediation

已解决 ticket 出现归属于原验收范围的 finding 时，不得在 tracker 外直接修复。追加记录：

```markdown
## Reopen 2026-07-18

- Reason: <中文 finding 摘要>
- Previous reviewed content head: `<SHA>`
- Remediation base: `claim-checkpoint` | `<40-character SHA>`
- Status transition: resolved -> claimed
```

把 ticket 状态改回 `claimed`，与 ledger 一起提交 tracker-only reopen checkpoint；该提交 HEAD 是新的 remediation base。随后重新执行 candidate、验证、完整双轴评审和 Resolution。旧 Resolution 保留为历史证据，新 Resolution 追加带日期的小节，不覆盖旧记录。

Approved spec 内但现有 tickets 外的 finding，创建下一个连续编号 ticket。Review-remediation ticket 在 header 中增加唯一类型标记，并在唯一 Comments 章节记录非空 finding 来源：

```markdown
**Ticket kind:** review-remediation

## Comments

- Finding source: <finding 来源>
```

普通 ticket 不写 `Ticket kind`；当前只允许 `review-remediation` 类型。若 finding 改变范围、行为或架构，先获得 spec amendment 的人工确认；不得以 remediation ticket 静默扩展范围。Checker 校验上述显式记录形状，不从自然语言或 Git 历史猜测 ticket 类型。

## Tracker-only 允许边界

验证新鲜度例外仅适用于下列变化：

- `delivery.md` 的 stage、current ticket/base、head SHA、阶段/验证/评审/授权/waiver/merge/delivery 证据；
- 已存在 ticket 的 `Status`、验收 checkbox、Resolution、Reopen 和 Comments 中的执行证据；
- 本地交付后的 `Final squash commit` 回填。

下列变化属于 content change：新建或改写 spec、amendment、ticket 标题/范围/验收语义、新建普通或 remediation ticket，以及任何实现、测试、配置、依赖或 Current 文档变化。Tracker-only commit 混入 content change 必须失败。

上述 content/tracker-only 分类属于提交与评审规则；checker 不读取 diff 或重放提交历史来证明分类，只检查记录文档是否使用合法结构表达当前状态。

## Merge 与最终 SHA 回填

进入 `merge-ready` 后，`Merge brief` 使用固定字段和 1–5 连续编号的本地事务列表：

```markdown
- Feature branch: `<branch>`
- Target branch: `<branch>`
- Target base: `<SHA>`
- Target tip: `<SHA>`
- Content head: `<SHA>`
- Verified content head: `<SHA>`
- Reviewed content head: `<SHA>`
- Delivery summary: <非空说明>
- Commit range: `<SHA>...<SHA>`
- Validation: passed | passed-with-waivers
- Review: passed
- Waivers and risks: none | <非空说明>
- Local transaction:
  1. <步骤>
  2. <步骤>
  3. <步骤>
  4. <步骤>
  5. <步骤>
```

Brief 中的 branch、target base/tip 与三个 content head 必须和 ledger 顶层同名语义字段字面相等；三个 content head 在 `merge-ready`/`delivered` 状态也必须彼此相等。Checker 不解析 commit range、不读取目标分支 tip，也不判断 merge 批准是否新鲜。

Merge-ready 时所有 ticket Resolution 必须包含 `Final squash commit: pending`，且 ledger 不得声称已经 delivered。获批本地交付事务完成 squash commit 后：

1. 把 ledger 的 `Final-Squash-Commit` 更新为完整 SHA，并把 `Stage` 更新为 `delivered`。
2. 把每张 ticket 最新 Resolution 的 `Final squash commit: pending` 替换为同一个 SHA。
3. 在 `Delivery receipt` 记录目标分支、squash SHA、tracker 元数据提交计划和最终检查结果。
4. 确认 feature 目录不存在残留的最终 SHA `pending`。
5. 创建只包含 ledger/tickets 的 tracker-only 元数据提交。

`delivered` 状态的 `Delivery receipt` 使用以下结构：

```markdown
- Target branch: `<branch>`
- Squash commit: `<SHA>`
- Tracker metadata: planned | `<SHA>`
- Final checks:
  - `<command>` — passed
- Local feature branch: deleted
```

此时顶层 `Final-Squash-Commit`、receipt 的 `Squash commit` 与每张 ticket 最新 Resolution 的 `Final squash commit` 必须是同一个完整 SHA；非 `delivered` 状态的这些 final 字段保持 `pending`。该比较仅针对当前文档字面值，不证明 squash 拓扑、分支删除或 tracker metadata 提交真实发生。

失败时保留功能分支和所有已有记录，不删除恢复点，不把未完成事务标为 `delivered`。

Checker 可以校验 `Delivery receipt`、最终 SHA 字段和 `pending` 的允许格式，但不验证 squash commit 拓扑、分支删除、SHA 祖先关系或本地事务是否真实执行。

## Legacy 与 adoption

- 没有 `Workflow-Version: 2` ledger 的既有 feature 是 legacy。它仍是有效历史记录；全局 checker 可以报告但不得令检查失败。
- 不为 legacy 批量创建 ledger，不改写旧 `Commit:`、merge、验证或 Resolution 语义。
- 要恢复未完成 legacy feature，先创建 v2 adoption ledger，在 `重开与修复` 中列出 Git 可证明状态、缺失证据、目标/功能分支与拟继续范围。
- Adoption 经维护者确认后才生效；无法证明的历史 gate 记录为未知，不伪造通过证据。

## 文档语言

Agent 新建或实质修改的 tracker Markdown 正文使用自然中文。代码标识符、命令、路径、API/skill 名称、Gate ID、机器字段名、枚举值和引用原文保持原语言。历史 tracker 不因 v2 adoption 被批量翻译。

## Skill 操作映射

当 skill 要求“publish to the issue tracker”时，在 `.scratch/<feature-slug>/` 创建并纳入版本控制的对应文件。

当 skill 要求“fetch the relevant ticket”时，读取用户给出的 ticket 路径或编号，并同时读取同目录 `delivery.md`、approved spec 和 blockers。

## Wayfinding 兼容约定

`/wayfinder` 继续使用以下独立形状，不自动采用 implementation ticket 的完整 lifecycle：

- Map：`.scratch/<effort>/map.md`，保存 Notes、Decisions-so-far 与 Fog。
- Child ticket：`.scratch/<effort>/issues/NN-<slug>.md`，使用 `Type: research | prototype | grilling | task` 和 `Status: claimed | resolved`。
- `Blocked by: NN, NN` 表示依赖；依赖 ticket 全部 `resolved` 后才进入 frontier。
- Claim 时先写 `Status: claimed`；resolve 时追加 `## Answer`，写 `Status: resolved`，并在 map 的 Decisions-so-far 中追加摘要和链接。

Wayfinding 记录只有显式创建 v2 adoption ledger 后，才受本文的 feature delivery 强校验。
