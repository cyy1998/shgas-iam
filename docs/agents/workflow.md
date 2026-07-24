# AI 开发工作流 v2

本文件是本仓库 AI 开发生命周期的唯一事实来源。Skills 提供通用方法；本文件决定仓库内的分支、tracker、授权、提交、验证、评审、合并和恢复语义。发生冲突时，以本文件为准，不把这些规则复制到各个 skill。

`openspec/` 已冻结为只读历史材料，不是新工作的入口或当前规格来源。

## 核心不变量

1. 除维护者显式批准的本地交付事务外，目标分支对 agent 只读。
2. 只读调查不创建分支；一旦确定要产生首次受版本控制写入，必须先创建功能分支。
3. 一个 feature 默认只有一个功能分支和一份持久 delivery ledger。
4. 阶段就绪不是下一阶段授权。`to-tickets`、`implement`、merge、push 和远端分支删除分别授权，互不继承。
5. 每张 ticket 都经过 claim checkpoint、已验证 candidate commit、双轴评审和 resolution checkpoint，不允许靠聊天记忆省略状态转换。
6. 验证和评审绑定精确 content HEAD；内容发生变化后旧证据立即过期。
7. 目标分支只保留最终 squash 交付提交及其后的 tracker 元数据提交。功能分支上的候选和修复提交是可恢复的临时历史。
8. Delivery ledger 是状态和证据，不是可跨任务转移的永久授权令牌。

## 入口选择

| 工作状态 | 使用入口 |
|---|---|
| 想法、边界或术语尚未稳定 | `grill-with-docs` |
| 共识已经形成，需要持久规格 | `to-spec` |
| 规格已获确认，且维护者确认进入拆票 | `to-tickets` |
| 已有无阻塞 ticket，且维护者确认实施范围 | `implement`；能在约定测试接缝测试先行时使用 TDD |
| 需要判断已提交范围是否同时符合仓库规范与原始规格 | `code-review` |
| 目标明确、低风险、可在一个上下文内完成 | 维护者确认范围后进入 `implement` 快速路径 |

## 状态机

状态转换失败时保持在上一个有效状态。证据缺失、相互矛盾或已经过期都视为失败，不得推断通过。

| Gate | 状态 | 进入条件与必需证据 | 通过后的自动动作 | 人工 checkpoint |
|---|---|---|---|---|
| `G0 Intake` | 调查中 | 已识别目标、范围、目标分支和工作类型；仍未产生受版本控制写入 | 继续只读调查，或在首次写入前进入 `G1` | 需求本身不清楚时等待维护者决策 |
| `G1 Branch Ready` | 分支就绪 | 工作区干净；目标分支及 `Target-Base` 可解析；已创建并切换到 `codex/<feature-slug>` 或 `codex/quick-<slug>`；delivery ledger 已初始化 | 在功能分支创建阶段产物 | 发现未知改动、冲突分支或 ledger/Git 不一致时停止并报告 |
| `G2 Spec Ready` | 规格就绪 | 标准路径的 draft spec 已提交，问题、范围、验收与测试接缝明确 | 输出拆票 brief 后停止 | 维护者显式授权 `to-tickets` |
| `G3 Tickets Ready` | 票据就绪 | 拆票方案已批准；spec 为 `approved`；tracer-bullet tickets 已发布并提交；阻塞关系有效 | 输出 implementation brief 后停止 | 维护者显式授权声明范围内的 `implement` |
| `G4 Implementing` | 实施中 | 实施授权在当前任务和分支有效；Validation Plan 已确定 | 按依赖顺序循环 `T1`–`T4` | 范围、分支、任务或无法调和的状态发生变化时重新确认 |
| `T1 Ticket Claimed` | ticket 已认领 | blockers 全部 `resolved`；ticket 标为 `claimed` 并完成 tracker-only checkpoint；该提交 HEAD 固定为 ticket base | 修改该 ticket 范围内的内容 | 无；处于已授权实施范围内自动推进 |
| `T2 Candidate Validated` | 候选已验证 | 验收工作完成；ticket Validation Plan 通过；已创建 focused candidate commit；工作区干净 | 以 ticket base 为 fixed point 调用双轴评审 | 必需检查不能运行且需要 waiver 时等待维护者批准 |
| `T3 Ticket Reviewed` | ticket 已评审 | Standards 与 Spec 两轴检查 `ticket-base...HEAD`；无未解决 finding；评审 HEAD 等于当前 content HEAD | 进入 resolution；若有 finding，验证后追加 focused 修复提交并重审完整范围 | finding 改变范围、行为或架构时先批准 spec amendment |
| `T4 Ticket Resolved` | ticket 已解决 | 验收项已勾选；状态为 `resolved`；Resolution 记录基线、验证、评审、content HEAD 和 `Final squash commit: pending`；完成独立 tracker-only checkpoint | 自动认领依赖前沿的下一张已授权 ticket；全部完成后执行 `G5` 验证与最终评审 | 无 |
| `G5 Feature Verified` | 功能已验证 | 所有 tickets 已 `resolved`；目标 tip 已集成；工作区干净；feature Validation Plan 绑定当前 content HEAD 且全部通过；最终 Standards 与 Spec 双轴评审清零 | 创建 `feature-verified` tracker checkpoint，然后准备 `G6` merge brief | waiver、finding 或语义冲突需要维护者决定 |
| `G6 Merge Ready` | 等待交付 | 最终评审清零；reviewed/verified/content HEAD 一致；目标 tip 未变化；ledger 无不完整记录；merge-ready checkpoint 已提交 | 输出包含精确本地事务的 merge brief 并停止 | 维护者显式批准 merge；目标 tip 变化会使批准失效 |
| `G7 Delivered` | 本地交付完成 | squash 交付提交、最终 SHA 回填、tracker 元数据提交、最终结构检查和本地功能分支删除全部完成 | 报告本地交付结果 | push 与远端分支删除分别取得新授权 |

标准路径依次经过 `G0`–`G7`。快速路径在 ledger 中记录范围和验收标准后，从 `G1` 进入 `G4`；它没有 tickets 时，以 delivery scope 代替 ticket 循环，但仍必须满足 candidate、验证、双轴评审和 merge gates。

## 授权边界

- 用户直接要求拆票或实现，可视为对应阶段的显式授权；否则 agent 必须先说明阶段及范围并等待确认。
- `to-tickets` 授权只允许拟定并发布获批 tickets，不授权实施。`implement` 授权只覆盖声明的 tickets 或快速改动范围，不授权 merge。
- 已授权阶段内，通过 gate 后创建必要的本地 checkpoint commit 属于自动动作，无需逐次询问。
- 实施授权在同一个 Codex 任务内跨上下文压缩和自动 continuation 持续有效；在范围内切换 ticket 不重新询问。
- 新任务、独立 handoff、实施范围扩大、功能分支变化或 Git 与 ledger 无法调和时，旧实施授权失效。Agent 必须给出 resume brief，列明已证明状态、缺失证据和下一动作，并取得确认。
- Merge 授权只覆盖 merge brief 中列出的本地交付事务。Push、创建 PR、远端分支删除或其他外部变更都需要独立授权。
- Ledger 可以记录授权内容和日期，但不能单独证明当前会话仍获授权。

## 分支与工作区

### 创建时机

只读调查、解释、评审和诊断无需创建分支。范围和目标明确后，如果下一步将新增、修改、删除或生成受版本控制文件，则在第一次写入前执行：

1. 确认目标分支、目标 SHA 和工作区状态。
2. 未知或无关的本地改动必须原样保留；不得移动、覆盖、暂存或吸收。无法安全隔离时停止并报告。
3. 标准功能创建 `codex/<feature-slug>`；快速改动创建 `codex/quick-<slug>`。
4. 初始化 `.scratch/<feature-slug>/delivery.md` 并记录 `Target-Base`。

一个 feature 默认在同一功能分支完成设计、规格、拆票、实现和验证。只有维护者明确选择并行实施时，才允许额外分支或 worktree。

### 目标漂移

在 feature 验证前和 merge brief 发出前，比较目标分支 tip 与 ledger 中的 `Target-Base` 或最近 `Merge-Target-Tip`：

- 未漂移：继续验证。
- 已漂移且可无冲突集成：在已授权实施范围内把目标分支 merge 到功能分支，更新 content HEAD，重新执行 feature 验证和最终评审。
- 出现机械冲突：使用仓库冲突解决流程；不得 rebase、amend 或改写已有 ticket 证据。
- 冲突需要产品、架构或范围决策：停止并请求维护者决定。

目标分支 tip 在 merge brief 后发生任何变化，都会使 merge-ready 状态和既有 merge 授权失效。

## 阶段与提交边界

所有自动提交都使用 focused Conventional Commit，description 默认使用中文。

| 时机 | 提交形状 |
|---|---|
| 稳定设计决策完成 | 只包含本阶段形成的设计、ADR、领域或 ledger 产物 |
| `G2` | draft spec 与对应 ledger 证据；随后立即执行 content-head sync |
| `G3` | approved spec、已批准 ticket 集合与对应 ledger 证据；随后立即执行 content-head sync |
| `T1` | 只包含 ticket claim 和 ledger 状态；提交后的 HEAD 是 ticket base |
| `T2` | 一个 focused candidate content commit；必须先验证、后提交、立即执行 content-head sync、再评审 |
| 评审修复 | 每组相关 finding 在针对性验证后创建额外 focused content commit，随后立即执行 content-head sync；不自动 amend/rebase |
| `T4` | 只包含 ticket 状态、验收勾选、Resolution 和 ledger 证据 |
| `G6` | 只包含 merge-ready ledger/tracker 证据 |
| `G7` | 目标分支上的一个 squash 交付提交，随后一个最终 SHA 回填 tracker-only 提交 |

`code-review` 只能评审 committed range，因此 ticket candidate commit 必须位于评审之前。评审发现修复后，重新评审固定 ticket base 到新 HEAD 的完整范围。

### Content commit 与 tracker-only commit

- Content commit 会改变实现、测试、配置、依赖、文档、spec、ticket 意图或其他交付行为，并更新 `Content-Head`。
- Tracker-only commit 只能修改本 feature 的 `delivery.md` 与 ticket 文件中的状态、验收勾选、Resolution、Reopen、验证/评审/授权证据和最终 SHA；不得改变 spec、验收语义或实现内容。
- 新建/重写 spec、发布/改写 ticket 意图、amendment 和 remediation ticket 都是 content change，不适用 tracker-only 新鲜度例外。
- Tracker-only commit 不改变 `Content-Head`；它必须重新运行 `pnpm check:workflow`、适用的 `pnpm check:docs` 和 `git diff --check`。

### Content HEAD 自引用与同步

Git commit 不能在自己的内容中记录尚未生成的 SHA。为避免用浮动 `HEAD` 或猜测值破坏证据，任何 content commit 都采用确定的两步转换：

1. 执行 workflow 的 agent 根据 staged diff 确认即将产生的是 content transition；此时 ledger 可以仍指向前一个 `Content-Head`。
2. Content commit 成功后，下一动作必须是只修改 ledger 证据的 content-head sync checkpoint，把 `Content-Head` 更新为刚产生的完整 SHA。

同步完成前不算到达 `G2`、`G3`、`T2`、`T3`、`G5` 或 `G6`，不得开始评审、claim 下一票或执行其他内容写入。所有 tickets 完成后，目标集成、feature validation 与最终双轴评审仍在 `implementing` 状态内执行；只有最终评审清零后才记录 `feature-verified` 与 `G5` checkpoint。该顺序由执行 workflow 的 agent 与后续 Standards/Spec 评审负责；结构 checker 只检查 `Content-Head` 字段的记录格式，不通过 Git 历史推断它是否为最新 content commit。Sync commit 属于 tracker-only 新鲜度例外，不改变刚记录的 content HEAD。

## Ticket 生命周期

规范 ticket 生命周期是 `ready-for-agent → claimed → resolved`。只有 blockers 全部 `resolved` 的 ticket 才能 claim。

每张 ticket 严格执行：

1. 先把 ticket 标为 `claimed`，更新 ledger，并立即创建 tracker-only claim checkpoint。
2. 把 claim checkpoint 的 HEAD 固定为 ticket base。
3. 实现验收项，运行聚焦验证，创建 candidate content commit。
4. 使用 workflow 提供的 ticket base 评审 `ticket-base...HEAD` 的 Standards 与 Spec 两轴。
5. 对 finding 运行相关检查，创建 focused 修复提交，再评审同一完整范围；不得静默改写候选历史。
6. 评审清零后勾选验收项、写入 Resolution、标记 `resolved`，创建独立 tracker-only resolution checkpoint。
7. 自动进入已授权范围内的下一张无阻塞 ticket。

### 重开与 remediation

- Finding 属于已 `resolved` ticket：在原 ticket 追加带 ISO 日期的 `Reopen` 记录，状态改回 `claimed`，创建 tracker-only checkpoint；该 checkpoint HEAD 是 remediation base。修复、验证、评审和 resolution 流程重新执行。
- Finding 在 approved spec 内但不属于现有 ticket：创建下一个连续编号的 remediation ticket，记录来源和 blockers；它属于当前已批准实施范围时可自动推进。
- Finding 改变范围、行为或架构：停止实施，先获得 spec amendment 的人工确认，再更新 spec 和受影响 tickets。
- 任何内容修复都会使 feature 验证、最终评审和 merge brief 失效。

## 验证矩阵与新鲜度

实施开始时由 agent 根据变更路径推导 `Change-Types` 和 `Affected-Workspaces`，并在 ledger 的 `Validation Plan` 中声明 ticket/feature 所需命令。Checker 只校验这些字段和表格使用受支持的枚举、分隔方式与必需单元格，不根据 committed diff 反向推导或证明声明来源。

路径按以下优先级分类；一条路径可以命中多个类型：

| 路径或内容触发器 | `Change-Types` 值 |
|---|---|
| `docs/**`、`AGENTS.md`、其他受索引 Markdown | `docs` |
| `.agents/**`、`.codex/**`、`.scratch/**`、`.husky/**`、workflow checker 与 agent 配置 | `agent-config` |
| `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` 或安装脚本 | `dependencies` |
| `packages/db/**`、Drizzle schema/migration/config | `database` |
| `apps/admin/**`、`apps/sso/**` | `frontend` |
| `gateway/**` | `gateway` |
| 其余生产代码、测试、构建或运行配置 | `code` |

`Affected-Workspaces` 使用 pnpm package name（例如 `@iam/api`）；只影响根工具链时使用 `root`，纯 tracker evidence 使用 `none`。Agent 根据 workspace manifest 和路径确定名称，不能识别的路径归入 `root`，不得静默忽略；checker 不从仓库 diff 重新计算该集合。

命令不存在或环境不满足时不得静默跳过：要么修复可运行条件，要么把 gate 保持为失败；只有维护者显式批准的 waiver 才能继续，且必须记录日期、命令、原因、范围、风险和批准者，并在 merge brief 中突出显示。

### Ticket 级

每张 ticket 至少运行：

- 与验收行为直接相关的聚焦测试；
- 受影响 package 的 lint 与 typecheck；
- 下表中适用的专项检查；
- `git diff --check`。

纯文档 ticket 至少运行 `pnpm check:docs`、`pnpm check:workflow`（命令可用后）和 `git diff --check`。

### Feature 级

Feature/merge candidate 的环境无关基线是正式入口 `pnpm verify`。它按 static、typecheck、test、smoke、build
顺序 fail-fast；static 阶段包含 lint、文档索引、env naming 和全局 workflow 记录格式 guard。不要用手工挑选的等价命令
替代该入口，也不要把外部资源检查塞进环境无关基线。

| 变更类型 | Feature 必需检查 |
|---|---|
| 标准代码功能 | `pnpm verify`、`pnpm check:workflow`、`git diff --check` |
| `docs` | 在适用基础矩阵上增加 `pnpm check:docs` |
| `agent-config` | 增加 `pnpm check:workflow`；涉及 Markdown 时同时增加 `pnpm check:docs` |
| `dependencies` | 在适用基础矩阵上增加 `pnpm install --frozen-lockfile` |
| `database` | 增加 `pnpm --filter @iam/db db:check`；若 diff 命中 `packages/role-assignment-resolution/**`，再增加 `pnpm --filter @iam/role-assignment-resolution test:postgres` |
| `frontend` | 对每个受影响的 `@iam/admin` 或 `@iam/sso` 增加 `pnpm --filter <workspace> e2e` |
| `gateway` | 增加 `pnpm gateway:apisix:validate -- <已声明环境参数>`；环境参数必须原样记录在 Validation Plan |
| 仅文档或 agent 配置的快速改动 | 可以省略 `pnpm verify`，但仍需 `pnpm check:docs`、`pnpm check:workflow` 和 `git diff --check` |

Ticket 行必须列出至少一个直接覆盖验收行为的聚焦测试；只有 `Change-Types` 完全由 `docs`、`agent-config` 组成时，才可用 `pnpm check:docs`/`pnpm check:workflow` 代替行为测试。Feature 行必须包含由上表计算出的命令全集。外部 PostgreSQL、前端浏览器或 Gateway 环境缺失时，仍保留命令并按失败或 waiver 记录，不能从计划中删除。

`pnpm verify` 不包含 PostgreSQL、浏览器 E2E 或 Gateway 验证。命中 `database`、`frontend` 或 `gateway` 时，必须在
同一 Content-Head 上完成表中的附加命令；环境无关基线通过不能替代这些结果。

验证记录必须包含命令、结果和被验证的完整 `Content-Head`。评审记录必须包含 fixed point、reviewed HEAD 和两轴结果。只有以下条件同时成立时证据才新鲜：

- `Verified-Content-Head = Content-Head`；
- `Reviewed-Content-Head = Content-Head`；
- 最终评审所用 target tip 等于当前目标分支 tip；
- 证据之后没有新的 content change。

纯 tracker-only 证据提交可以位于已验证 content HEAD 之后，不触发完整代码套件重跑，但必须符合文件和内容边界并重跑 workflow/document/whitespace 检查。

以上新鲜度、命令执行和 SHA 关系是 workflow gate 与评审责任。结构 checker 只检查记录文档是否包含相应字段、章节和值格式，可以比较当前文档中明确要求相等的字面值，但不解析 Git 对象、不遍历提交历史，也不证明命令、授权或评审实际发生。

## 双轴评审

- Standards 轴检查 `AGENTS.md`、Current 架构/开发文档、仓库风格和适用 skill 约束。
- Spec 轴检查 approved spec 与当前 ticket；快速路径检查 delivery ledger 中的范围和验收标准。
- Ticket 评审范围是 `ticket-base...HEAD`。Feature 评审范围是固定目标 tip 到当前功能 HEAD。
- Fixed point 由用户或调用 workflow 提供，必须可解析；committed diff 必须非空。
- 两轴任一存在未解决 finding，都不能进入 `T4` 或 `G6`。

## Merge-ready 与本地交付事务

只有以下条件全部成立，才能进入 `G6` 并请求 merge：

- 所有 tickets 为 `resolved`，或快速路径验收项全部完成；
- 工作区干净，且没有 merge/rebase/cherry-pick 等未完成 Git 操作；
- 目标分支已集成到功能分支，固定 target tip 仍是当前 tip；
- Validation Plan 全部通过，`Verified-Content-Head` 新鲜；
- 最终双轴评审清零，`Reviewed-Content-Head` 新鲜；
- 所有必需字段、resolution、reopen/remediation 和 waiver 记录完整；
- `Final-Squash-Commit` 仍为 `pending`。

Merge brief 必须列出：功能/目标分支、`Target-Base`、当前 target tip、content/verified/reviewed HEAD、交付行为摘要、commit range、验证结果、评审结果、waivers/风险，以及将执行的精确本地事务。

维护者对该 brief 的一次显式批准只覆盖下列有序事务：

1. 再次检查目标 tip；若变化立即停止，回到功能分支重新集成、验证、评审并生成新 brief。
2. 切换目标分支，执行 `git merge --squash`，创建一个 focused delivery commit。
3. 将最终 squash SHA 回填到 ledger 和所有 ticket Resolution，创建 tracker-only 元数据提交。
4. 确认不存在残留 `pending`，运行 workflow/document/whitespace 检查。
5. 所有步骤成功后删除本地功能分支。

任一步失败都必须停止后续破坏性动作，保留或恢复功能分支可达性，并报告最后成功动作、当前分支、相关 SHA 和下一安全恢复步骤。不得因 merge 授权自动 push 或删除远端分支。

## Workflow checker 与轻量 Git guardrails

`pnpm check:workflow` 的责任仅限于 v2 记录文档的格式完整性与静态一致性：

- 发现当前 `.scratch/` 中的 v2 feature，并区分未 adoption 的 legacy 记录；
- 校验必需文件、标题、章节、字段唯一性与顺序、枚举、列表、表格和 SHA 字面格式；
- 校验当前文档集内可直接判断的静态引用，例如 feature slug、ticket 编号和 blocker 文件是否存在；
- 输出简短中文诊断并保持只读。

Checker 不检查当前分支或工作区，不分类 staged/committed diff，不重放 ticket 状态转换或 checkpoint 历史，不验证 SHA 可解析性、祖先关系、证据新鲜度、命令执行结果、聊天授权或评审真实性。Checker 通过只表示记录文档格式完整正确，不能单独证明任一 workflow gate 已通过；这些结论仍由执行 workflow 的 agent、实际命令结果与 Standards/Spec 评审共同负责。

纳入版本控制的 Husky pre-commit 只执行以下两项 guard：

```bash
git diff --cached --check
bun scripts/check-workflow.ts
```

Hook 在临时目录导出 index 中的 checker 与 `.scratch/`，并在该 staged 快照内直接运行无第三方依赖的 checker；因此部分暂存时校验对象与实际提交内容一致，不触发依赖安装，临时快照在退出时删除。Hook 不运行完整 test/typecheck/build，也不对全部 staged files 强制单一 formatter。无参数 `pnpm check:workflow` 提供相同的全局记录格式检查并接入根 `pnpm lint`。它不承担目标分支写保护、提交分类或 gate 判定；这些边界继续由本 workflow、agent preflight 和评审约束。维护者可显式使用 `--no-verify` 作为应急逃生口，agent 不得把它作为常规路径。

Workflow checker 必须只读，不得创建分支、修改文件、暂存、提交、merge 或修复 ledger。

## 标准路径与快速路径

### 标准功能

1. `grill-with-docs` 澄清问题；稳定领域语言写入 `CONTEXT.md`，长期架构决策写入 ADR。
2. `to-spec` 生成并提交 draft spec，进入 `G2` 后停止。
3. 维护者授权 `to-tickets` 后拟定拆票；方案获批后发布 tickets、把 spec 标为 approved、提交 `G3` checkpoint，然后停止。
4. 维护者授权 ticket 范围后进入 `implement`，按依赖顺序自动执行 `T1`–`T4`。
5. 所有 tickets 完成后执行 `G5` 验证与最终双轴评审，满足 `G6` 后输出 merge brief 并停止。
6. Merge 获批后执行一次本地交付事务。Push 和远端清理继续等待独立授权。

### 快速改动

只有目标、验收、风险和验证均明确，可在一个上下文内完成，且不需要新架构决策或跨团队协调时才能使用。快速路径可以省略 spec 和 tickets，但必须：

- 创建 `codex/quick-<slug>` 和轻量 delivery ledger；
- 在 ledger 中记录已批准范围、验收标准和 Validation Plan；
- 取得 `implement` 授权；
- 创建已验证 candidate commit，完成 Standards 与 delivery scope 两轴评审；
- 满足 feature、merge、push 的同等门禁。

发现范围扩大、风险升高或需求有歧义时立即停止，转为标准路径；不得以“quick”为由跳过分支、验证、评审或授权。

## Legacy 与 adoption

- 没有 `Workflow-Version: 2` ledger 的既有 `.scratch` feature 属于 legacy；全局 checker 可以报告它，但不得因此失败。
- 不批量翻译、改写或回填 legacy 的 `Commit:`、merge、验证或授权历史。
- 恢复未完成 legacy 工作前，创建显式 adoption ledger，记录可由 Git 证明的状态、未知或缺失证据、目标/功能分支、adoption content HEAD 和拟继续范围。
- Adoption 需要维护者确认；确认后按 v2 从能够证明的最后 gate 继续，不能伪造之前的证据。

## 文档语言

Agent 新建或实质修改的 Markdown 文档正文统一使用自然、地道的中文，包括 spec、tickets、ADR、delivery ledger、验证记录、review/merge brief 和维护说明。

代码标识符、命令、文件路径、API/skill 名称、Gate ID、机器可解析字段名和引用的源文本保持原语言。该规则不要求批量翻译历史文档；触及 legacy 文档时只统一新增或重写的叙述。Checker 校验 v2 产物的规范标题和结构，不使用自然语言检测算法判断全部自由文本；语言一致性由 Standards 评审补充检查。

## 当前事实与历史材料

当前行为由代码、可执行测试和文档索引中标记为 `Current` 的文档共同定义。`CONTEXT.md` 维护稳定领域语言，ADR 维护长期决策。

`openspec/` 保留原路径，仅用于追溯历史需求和设计线索。使用其中信息前必须对照当前代码、测试和 Current 文档验证；除维护者明确要求历史修正外，不得新增、修改、同步或归档其中产物。
