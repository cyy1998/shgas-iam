# AI 开发工作流 v2

**Status:** approved

## 问题陈述

仓库已有 conversation → spec → tickets → implementation/review 的 AI 开发流程，但分支创建、阶段产物提交、实现候选提交、最终合并和恢复执行的时机仍散落在自然语言规则中。通用 skills 与仓库规则之间还存在顺序冲突：实现 skill 可以被理解为先评审后提交，而双轴评审只能可靠审查已经提交的范围；spec 和 tickets skills 也可能过早把产物标为可实施，或在缺少独立授权时继续进入实现。

这些不确定性使 agent 即使遵循大方向，仍可能直接在目标分支工作、漏掉 ticket 状态转换、用过期验证申请合并、忘记回填最终提交、把 tracker 元数据混入实现提交，或在上下文恢复后错误继承旧授权。现有仓库没有 workflow checker、CI workflow 或通用 pre-commit hook，因此增加更多说明文字本身不能可靠阻止遗漏。

## 解决方案

建立版本化的 AI Development Workflow v2：用一套有稳定 Gate ID 的状态机统一本仓库的分支、授权、提交、验证、评审、合并和恢复语义；用每个 feature 的持久 delivery ledger 保存跨上下文状态；用只读 workflow checker、轻量 Husky pre-commit hook 和根 lint 及时发现格式缺失或错误的记录文档；并对相关 skills 做最小兼容性调整，使通用方法服从仓库级生命周期，而不复制仓库细节。Checker 不承担 Git 历史重放或证据来源证明，gate 的真实性仍由实际执行与双轴评审负责。

标准功能继续使用 spec 与 tracer-bullet tickets；低风险快速路径仍可省略二者，但必须保留轻量 delivery ledger、明确验收范围和同等的分支、评审、验证与合并门禁。历史 tracker 记录保持原样，只有新建或显式 adoption 的 feature 使用 v2 强校验。

## 用户故事

1. 作为维护者，我希望所有受版本控制的写入都发生在功能分支，以免 agent 意外直接在目标分支开发。
2. 作为维护者，我希望只读调查无需创建分支，以免无害的诊断制造多余仓库状态。
3. 作为 agent，我希望分支创建触发点有明确定义，以免在设计、规格、拆票或实现阶段猜测何时建分支。
4. 作为 agent，我希望记录目标分支及其起始 SHA，以便确定性地检测后续目标漂移。
5. 作为维护者，我希望设计、规格、ticket、实现、评审和交付都表示为显式状态，以免隐含转换被误认为授权。
6. 作为维护者，我希望每个人工检查点都收到可直接决策的 brief，以便快速且有范围地批准。
7. 作为维护者，我希望 `to-tickets`、`implement`、merge、push 和远端清理保持独立授权边界，以免一个阶段的批准静默授权另一个阶段。
8. 作为 agent，我希望实施授权在同一任务的上下文压缩和自动 continuation 中持续有效，以便无需反复询问即可完成获批 ticket 集合。
9. 作为维护者，我希望实施授权在新任务、handoff、范围扩大或分支变化时失效，以免 ledger 成为永久权限令牌。
10. 作为 agent，我希望拥有持久 delivery ledger，以便中断后根据 Git 和 tracker 证据重建当前状态。
11. 作为维护者，我希望快速改动仍保留轻量交付记录，以免省略 spec 和 tickets 时也省略可追溯性。
12. 作为 agent，我希望阶段产物在固定边界提交，以便 ADR、spec、tickets 和实现证据在下一阶段前可恢复。
13. 作为维护者，我希望当前阶段授权覆盖本地 checkpoint commits，以免 agent 在每个安全本地提交前重复询问。
14. 作为评审者，我希望代码评审检查已提交的候选范围，以免评审 diff 遗漏未暂存工作。
15. 作为 agent，我希望每张 ticket 的 fixed point 由调用 workflow 提供，以免自动推进时再次向用户询问评审基线。
16. 作为维护者，我希望功能分支允许多个临时候选或修复提交，以便不改写历史也能处理评审发现。
17. 作为维护者，我希望目标分支永久历史只保留一个 focused squash 交付提交及其 tracker 元数据提交，以免临时恢复提交污染长期历史。
18. 作为 agent，我希望 ticket claim 和 resolution 元数据与实现提交隔离，以便提交意图可被机器检查。
19. 作为维护者，我希望后续验证发现缺陷时重新打开已解决 ticket，以免修复发生在 tracker 生命周期之外。
20. 作为 agent，我希望已批准 spec 内但不属于既有 ticket 的 finding 有 remediation ticket 路径，以便集成修复保持可追溯。
21. 作为维护者，我希望改变范围、行为或架构的 finding 返回到 amendment 审批，以免评审静默扩大功能。
22. 作为 agent，我希望目标漂移通过合入功能分支处理而不自动 rebase，以免记录的 ticket bases 和提交证据被改写。
23. 作为维护者，我希望验证要求从显式变更类型矩阵中选择，以便依赖、数据库、前端、Gateway、文档和普通代码变更获得正确检查。
24. 作为评审者，我希望验证和评审证据绑定到 content HEAD，以便后续代码变化自动使旧证据失效。
25. 作为 agent，我希望纯 tracker 证据提交与内容变更明确区分，以免记录成功检查造成无限重验循环。
26. 作为维护者，我希望每个被跳过的必需检查都表示为显式 waiver，以免外部服务限制从 merge brief 中消失。
27. 作为维护者，我希望仅在通过完整 merge-ready gate 后请求 merge 批准，以免被要求批准不完整分支。
28. 作为维护者，我希望一次 merge 批准覆盖完整本地 squash、SHA 回填、元数据验证和本地清理事务，以免不必要的检查点留下半交付状态。
29. 作为维护者，我希望 push 和远端分支删除单独授权，以免本地交付暗含外部变更。
30. 作为 agent，我希望 merge brief 后目标 tip 变化会使批准失效，以免合入维护者未评审的树。
31. 作为 agent，我希望交付失败时保留功能分支并报告恢复点，以免部分 merge 触发破坏性清理。
32. 作为维护者，我希望拥有确定性的 workflow checker，以免 ledger、spec 与 ticket 的必需格式、字段或章节缺失只能依赖人工发现。
33. 作为维护者，我希望 checker 保持只读，以免验证命令创建分支、改写证据、提交或合并。
34. 作为开发者，我希望获得快速 pre-commit 防护，以便格式不完整的 workflow 记录在进入本地历史前失败，同时不在每个 checkpoint 运行完整 monorepo 套件。
35. 作为维护者，我希望目标分支只读、提交分类和阶段授权继续由 workflow 与评审负责，而不是让格式 checker 通过复杂历史推断代替这些责任。
36. 作为维护者，我希望保留显式人工绕过方式，以便本地 hook 是 guardrail 而非无法恢复的锁。
37. 作为 CI 或干净环境执行者，我希望根 lint 包含记录格式校验，以免绕过或未安装 hook 后失去结构检查。
38. 作为维护者，我希望既有 tracker 记录适用 legacy 豁免，以免采用更强规则时伪造证据或改写历史交付语义。
39. 作为恢复 legacy 工作的 agent，我希望有显式 adoption 流程，以便在按 v2 继续前暴露缺失的历史证据。
40. 作为 skill 维护者，我希望 spec、拆票、实现和评审 skills 与仓库状态机对齐，以免通用指令绕过本地授权或顺序规则。
41. 作为维护者，我希望 agent 生成的文档统一使用自然、地道的中文，以便仓库中的规格、tickets、交付记录和决策材料保持一致且易读。

## 实现决策

### 权威来源与流程变体

- 仓库 Engineering workflow 继续作为分支、授权、提交、验证、评审、merge 和清理规则的唯一事实来源。Skills 保留通用方法，并明确把仓库特有的生命周期决策交给该文档。
- 标准工作沿用设计 → draft spec → approved tickets → implementation → delivery 路径。
- 只有范围、验收标准、风险和验证均能在一个上下文内完成，且不需要新架构决策或协调时，快速工作才可以省略 spec 和 tickets。它仍需创建 quick delivery ledger，并经过相同的分支、候选评审、功能、merge 和 push gates。
- 纯只读调查处于会修改仓库的状态机之外。调查转为实现时，agent 在首次受版本控制写入前执行分支 preflight。

### 规范状态机

| Gate | 状态 | 必需结果 |
|---|---|---|
| `G0 Intake` | 只读调查 | 已理解范围、目标和 workflow 变体；没有修改受版本控制文件。 |
| `G1 Branch Ready` | 功能分支已初始化 | preflight 干净，目标分支和 SHA 已固定，正确命名的分支处于活动状态，v2 delivery ledger 已形成 checkpoint。 |
| `G2 Spec Ready` | draft spec 已持久化 | 测试接缝已确认，draft spec 已验证并提交；不暗含可实施状态。 |
| `G3 Tickets Ready` | 已批准实施基线 | 拆票方案已批准，tickets 已发布，spec 已标为 approved，全部产物已提交；workflow 停止等待实施授权。 |
| `G4 Implementing` | 已授权 ticket frontier | 当前任务的授权与范围已记录；ticket loop 可在范围内自动推进。 |
| `T1 Ticket Claimed` | ticket 所有权已形成 checkpoint | blockers 已解决，ticket 通过隔离的 tracker commit 标为 claimed，ticket base 已固定。 |
| `T2 Candidate Validated` | 可评审实现范围 | 验收工作仅在聚焦验证后提交；工作区干净。 |
| `T3 Ticket Reviewed` | 双轴 findings 已清零 | 已评审从 ticket base 到 HEAD 的完整提交范围；修复已按需提交、重验和重审。 |
| `T4 Ticket Resolved` | ticket 证据已形成 checkpoint | 验收项已勾选，resolution 和证据已记录在隔离的 tracker commit 中。 |
| `G5 Feature Verified` | 集成内容已证明 | 最新目标已集成，变更类型验证矩阵在 content HEAD 通过，最终双轴评审清零。 |
| `G6 Merge Ready` | 维护者决策检查点 | 分支干净，目标 tip 已固定，merge brief 和证据已记录；workflow 停止等待显式 merge 批准。 |
| `G7 Delivered` | 本地交付完成 | squash 交付提交、最终 SHA 回填元数据提交、最终检查和本地功能分支删除均已完成。 |

- 标准工作经过全部功能级 gates。快速工作在 ledger 记录获批范围和验收标准后从 `G1` 进入 `G4`；该 ledger 同时作为 Spec 评审来源。
- 状态转换采用失败关闭原则。证据缺失、矛盾或过期时，workflow 保持在上一个有效状态。

### 分支与目标漂移

- 除显式获批的本地交付事务外，目标分支对 agent 只读。
- 在范围和目标明确后、首次受版本控制写入前创建功能分支。标准分支使用仓库 feature 前缀，快速分支使用 quick 前缀。
- 初始 preflight 要求工作区干净、当前目标分支符合预期、目标 SHA 可解析，且不存在冲突的分支或 ledger。遇到未知或无关的本地改动时停止转换并提供 brief，不移动、覆盖或吸收这些改动。
- 一个功能通常只使用一个分支。额外 worktrees 或分支必须来自显式的并行实施决策。
- 功能级验证前比较目标 tip 与已固定的 target base。若发生漂移，将目标分支合入功能分支，以保留临时 commit 身份；默认不自动 rebase 或改写历史。
- 无冲突的目标集成属于已授权实施范围。机械冲突遵循仓库冲突解决流程；需要产品、架构或范围决策的冲突必须停止并等待人工决定。

### Delivery ledger 与兼容性

- 每个 v2 feature 拥有一个纳入版本控制的 Markdown delivery ledger，其严格顶层字段记录 workflow 版本、feature slug 与类型、状态、功能/目标分支、target base、实施授权范围、当前 ticket、content/verified/reviewed heads、merge target tip 和最终 squash commit。
- Ledger 正文包含阶段证据、授权摘要、验证结果、评审结果、waivers、重开/修复记录以及 merge/delivery briefs。它链接 tickets，不复制其验收标准。
- 授权记录说明批准内容，但不成为永久可转移权限。在同一 Codex 任务内，实施授权对已声明范围跨上下文压缩和自动 continuation 持续有效。新任务、独立 handoff、范围扩大、分支变化或无法调和的 Git/ledger 不一致都需要 resume brief 和重新确认。
- 没有 v2 ledger 的 legacy features 继续作为有效历史记录，且不会使全局检查失败。恢复未完成的 legacy 工作前，必须创建显式 adoption 记录，重建可证明状态、列出缺失证据并取得维护者确认。

### 阶段与 ticket 提交

- 进入某阶段即授权在该阶段 gates 通过后创建必要的本地 checkpoint commits；它不授权下一阶段、merge、push 或远端清理。
- 设计阶段达成共同理解时，为稳定设计决策和领域文档创建 checkpoint。
- Draft spec 在 `G2` 提交；发布获批 ticket 集合并把 spec 提升为 approved 的变更在 `G3` 一起提交。
- 编辑实现文件前先提交 ticket claim 状态；产生的 HEAD 成为 ticket base。
- 完成验收工作和聚焦验证后，agent 在调用已提交范围评审前创建候选实现提交。
- 评审 findings 在相关验证通过后产生额外 focused remediation commits。临时历史不自动 amend 或 rebase。
- 评审清零后，把 ticket 验收和 resolution 证据作为 tracker-only 元数据单独提交。
- Conventional Commit 消息保持聚焦，并使用仓库规定的描述语言。

### 评审、重开与修复

- Ticket review 使用 workflow 提供的 ticket base 比较已提交 ticket 范围，并把 ticket 与 approved spec 同时作为需求来源。
- Feature review 把完整集成功能与已固定 target tip 比较。快速工作以 delivery scope 和验收标准作为 Spec 来源，不跳过该轴。
- 后续 finding 若属于已 resolved ticket，则追加带日期的 reopen 记录，把状态改回 claimed，为状态创建 checkpoint，修复并重新评审新的 remediation range，最后记录新的 resolution。
- Approved spec 内但既有 tickets 外的 finding，在当前授权内创建连续编号的 review-remediation ticket。改变范围、行为或架构的 finding 必须先获得 spec amendment 批准。
- 任何内容修复都会使 feature validation、feature review 和此前发出的 merge brief 失效。

### 验证与证据新鲜度

- 实施授权根据受影响 workspaces 和变更类型创建 Validation Plan。Ticket gates 运行聚焦行为测试、受影响 lint/typecheck 和适用专项检查。
- 标准代码功能在 feature gate 运行全仓 lint、typecheck、tests、build、空白检查和 workflow check。
- 文档变更追加文档检查；依赖或安装变更追加 frozen-lockfile 安装；数据库变更追加 schema 和适用的真实 PostgreSQL 检查；前端关键流程追加相关端到端检查；Gateway 变更追加 manifest validation。
- 仅涉及文档或 agent 的快速改动可以省略完整代码套件，但仍需运行文档、workflow 和空白检查。
- 验证与评审证据记录精确 content HEAD。目标集成、实现修复或任何其他内容变化都会使旧证据失效。
- 规定的 tracker-only 证据提交可以跟在已验证 content HEAD 之后而无需重新运行完整代码套件，但只能修改允许的 tracker/ledger 文件，并重新运行 workflow/document checks。该例外避免记录证据造成无限验证循环。
- 必需命令不得静默跳过。无法运行的外部检查会阻塞 gate，除非维护者显式批准 waiver；waiver 必须记录并在 merge brief 中突出显示。

### Merge 与外部变更

- 只有所有 tickets 均 resolved、工作区干净、目标集成最新、验证矩阵通过、最终评审清零且 merge-ready ledger checkpoint 有效时，才可请求 merge。
- Merge brief 展示功能与目标分支、固定 SHAs、交付行为、commit range、验证与评审证据、waivers/risks 和精确本地事务。
- 一次显式 merge 批准覆盖重新检查 target tip、切换目标分支、squash merge、创建 focused delivery commit、回填最终 SHA、创建 tracker-only 元数据提交、检查残留 pending、重新运行 workflow/document checks 以及删除本地功能分支。
- Brief 后 target tip 变化会使批准失效，必须重新执行集成、验证、评审并生成 brief。
- 任何交付失败都保留功能分支、停止破坏性清理，并报告最后完成的动作和恢复点。
- Push 和远端分支删除继续作为独立外部授权。

### Workflow checker 与 Git guardrails

- 只读 workflow checker 提供全局与单 feature 的记录格式校验；它绝不修改文件、分支、commits 或 merge 状态。
- Checker 校验 v2 feature 的必需文件、中文标题、章节、字段唯一性与顺序、枚举、表格、列表、SHA 字面格式，以及当前文档集内可直接判断的 slug、ticket 编号和 blocker 引用。
- 全局校验检查每个 v2 feature，同时报告但不因未 adoption 的 legacy features 失败；该校验接入根 lint。
- Checker 不读取或重放 Git 历史，不验证 SHA 可解析性、提交祖先关系、分支与工作区状态、staged diff 分类、状态转换历史、证据新鲜度、命令执行结果、聊天授权或评审真实性。
- 格式检查通过只表示记录文档完整且符合约定，不能单独证明 `G1–G7` 或 `T1–T4` 已通过。目标分支只读、content/tracker-only 分类和 gate 判定继续由 workflow、agent preflight、实际验证与双轴评审负责。
- Pre-commit 只运行 staged whitespace 检查和全局记录格式检查，不根据当前分支或提交历史实施额外策略。
- 维护者保留显式 `--no-verify` 逃生口。Bypass 是例外人工操作，不是 agent 常规路径。
- 纳入版本控制的 Husky hook 保持快速。完整 lint、typecheck、tests 和 build 保留在 ticket/feature gates。

### Skill 对齐

- Spec skill 发布 draft spec 后停止；ticket 获批前不得把 feature 标记为 implementation-ready。
- Ticketing skill 发布获批拆分、提升 spec baseline 并为产物创建 checkpoint，随后以 implementation brief 停止；没有仓库独立授权时绝不调用 implementation。
- Implementation skill 把验证频率和提交时机交给仓库 workflow，在评审前创建已验证且已提交的 candidate，并使用 orchestration workflow 提供的 ticket/feature ranges。
- Review skill 接受用户或调用 workflow 提供的 fixed point，同时继续要求该引用可解析且 committed diff 非空。
- TDD 与 domain-modeling 行为保持不变；外层 workflow 确保这些 skills 写入产物前分支已经存在。

### 文档语言

- Agent 新建或实质修改的 Markdown 文档默认使用自然、地道的中文，包括规格、tickets、ADR、delivery ledger 正文、验证记录、review/merge brief 和维护说明。
- 代码标识符、命令、文件路径、API/skill 名称、Gate ID、机器可解析字段名以及引用的源文本保持原语言，避免破坏执行契约或失真翻译。
- 本约定不要求批量翻译既有历史文档；实际触及 legacy 文档时，只把新增或重写的叙述统一为中文。
- 仓库级 workflow 是语言规则的权威来源；相关文档生成 skills 必须遵守项目语言，而不能机械复制其通用英文模板。
- Workflow checker 只校验 v2 产物的规范中文标题和必需结构，不尝试用语言检测算法判断所有自由文本；剩余语言一致性由 Standards 评审检查。

## 测试决策

- 主要测试接缝是 workflow checker 命令行接口，并在临时目录中构造记录文档树。测试观察退出状态和简洁诊断，不要求创建真实 Git 历史。
- Fixtures 覆盖有效与无效的 standard/quick records、legacy 豁免与 adoption、字段缺失或重复、非法枚举与 SHA 字面值、章节和表格缺失、ticket 编号与 blocker 静态引用，以及只读保证。
- Husky 文件保持为薄集成，只检查其 committed command wiring，不重复 checker 行为用例。
- 专用 workflow test 命令运行 CLI suite，并接入仓库根 test 命令，使 feature-level validation 无法遗漏它。
- 仓库既有实践倾向于在公开接缝执行行为检查，并使用仓库 runtime 运行根 scripts。本功能沿用该实践，不把 Markdown parser 内部实现作为主要测试 API。
- 文档检查、workflow 结构检查、staged whitespace 检查和双轴评审覆盖无法通过 CLI seam 有意义执行的 workflow 文档和 skill 指令变更。

## 范围之外

- 在当前没有托管 CI provider 的情况下新增或选择一个 provider。
- 自动 push commits、创建 pull requests、删除远端分支或修改远端 branch-protection 设置。
- 为已完成的 legacy tracker 记录改写或伪造证据。
- 用外部 tracker 替换本地 Markdown issue tracker。
- 构建会自动创建分支、编辑 ledgers、提交、rebase 或 merge 的可变 workflow runner。
- 通过 Git 历史重放证明记录来源，或验证 SHA 祖先关系、命令执行、聊天授权、评审真实性和 gate 转换真实性。
- 让 checker 根据 diff 推导 `Change-Types`、`Affected-Workspaces`、content/tracker-only 分类或证据新鲜度。
- 使用 checker 阻止目标分支直接提交；目标分支只读仍是 workflow 和 agent preflight 规则。
- 在 pre-commit 中运行完整 monorepo test/build suite。
- 对全部 staged files 应用单一 formatter，或改变仓库既有 formatter 边界。
- 改变 TDD 测试理念、领域术语、应用架构或生产 IAM 行为。

## Amendments

### 2026-07-19 — A-01：收窄 workflow checker 的责任

- 维护者明确要求本次 checker 只保证记录文档格式完整正确，不保证所有信息来源可追溯还原。
- Ticket 03–06 的 checker 与 hook 范围改为静态文档格式校验；删除 gate 历史重放、Git provenance、diff 分类、证据真实性和目标分支策略检查要求。
- Workflow 本身的状态机、授权、验证、评审与交付责任保持不变，由 agent 执行、实际命令结果和双轴评审确认，checker 通过不能替代 gate 通过。
- Ticket 03 尚未 claim，本 amendment 在重新实施 checker 前生效。

## 补充说明

- 本 workflow 有意把 Git commits 用作一次性功能历史上的可恢复 checkpoints，并把最终 squash commit 作为永久交付身份。
- Delivery ledger 是证据与可恢复状态，不是人工授权确已发生的证明；决策 checkpoints 仍是显式对话动作。
- Checker 应输出简短且可执行的中文失败信息，包含文件位置、观测格式、预期结构和下一安全动作。
- v2 首次实现应在可行范围内使用自己的 feature ledger，同时明确记录 bootstrap 限制，而不是伪造当时尚不存在的检查。
