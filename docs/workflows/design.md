# 设计流程

本流程说明什么时候需要设计、设计产物应该写到哪里，以及如何让设计对 Codex 和维护者都可读。仓库入口仍是
[AGENTS.md](../../AGENTS.md)，当前文档清单见 [docs/index.md](../index.md)。

## 何时需要设计

需要设计记录的场景：

- 新增或改变用户可见行为、API contract、权限、安全边界、审计语义、队列语义、OIDC/SSO/session 行为。
- 修改共享包、Drizzle schema、OpenSpec specs、gateway manifest 规则、跨 app DTO 或 tRPC contract。
- 变更有多个可行方案，涉及迁移、回滚、兼容、性能或可观测性取舍。
- 一次任务会拆成多个实现步骤，或者需要在后续会话中继续。

可以不写完整设计的场景：

- 纯文案、注释、索引、格式、明显 typo 或低风险配置微调。
- 单文件 bug fix，已有测试或失败信号能直接说明问题与验收标准。
- `$quick-change` 范围内的小改；仍应在最终说明中记录验证结果。

## 流程状态机

设计前后的状态流为：Idea -> Explore -> Clarify -> Design -> OpenSpec -> Implement -> Verify -> Archive。不是每个状态都必须产生文档，但每次跳过状态都必须满足对应跳过条件。

- Idea：只有初始想法、问题报告或改动请求。若目标行为、影响范围和正确性标准还不能说清楚，不能直接进入 Design 或 OpenSpec。
- Explore：使用 `$openspec-explore` 发散调查、比较方案或摸清影响面；当问题空间、候选方向、主要未知项和是否触发 OpenSpec 已经清楚时，可退出。
- Clarify：使用 `$grill-with-docs` 收敛需求边界、领域术语和关键取舍；当用户意图、术语、非目标和必须成立的验收条件清楚时，可退出。
- Design：沉淀 what、why、范围、取舍、风险和正确性标准；不写具体验证命令。
- OpenSpec：当命中 OpenSpec 触发条件时，使用 `$openspec-propose` 正式沉淀 proposal/design/spec/tasks；未命中时可走普通任务清单或 Quick Change。
- Implement：按 [development.md](development.md) 改代码、文档或 artifacts。
- Verify：按 [testing.md](testing.md) 证明正确性。
- Archive：仅在 OpenSpec change 完成、验证通过且用户明确要求归档时进入。

进入 OpenSpec 前必须满足：目标行为清楚；范围和非目标清楚；受影响契约、数据、权限、安全、审计、队列、session/OIDC/SSO 或发布边界已识别；至少有一条可验证的正确性标准；未解决问题已记录为开放问题或任务。

允许跳过 `$openspec-explore` 的条件：需求已经具体、影响面可从仓库事实直接判断、没有多个候选方向需要比较。

允许跳过 `$grill-with-docs` 的条件：需求边界、领域术语、关键取舍、非目标和正确性标准都能从用户请求、代码、OpenSpec、docs 或既有测试中明确推断。只要其中任一项不清楚，就先进入 Clarify；不要靠猜测直接写 Design 或 OpenSpec。

## 探索模式

当需求仍处于想法、问题空间、方案比较或影响面调查阶段，且还不适合直接写 OpenSpec artifacts 时，可以先使用
`$openspec-explore`。Explore 用于思考、调查和对齐方向，不用于实现；它可以读取代码、OpenSpec、docs 和测试，帮助识别现状、
候选方案、隐藏复杂度、风险、未知问题以及是否需要进入 OpenSpec。

`$openspec-explore` 是可选前置探索入口，不替代正式设计澄清或 OpenSpec 产物。探索过程中形成明确需求、范围变化或设计决策时，
应先由用户确认，再沉淀到 proposal、design、spec、tasks、ADR 或相关 docs；不要在探索模式中自动实现代码。

## 设计澄清

当需求边界、领域术语或关键取舍尚未清楚时，先使用 `$grill-with-docs` 做一轮一问一答的设计澄清，再进入
OpenSpec 或普通设计写作。`$grill-with-docs` 是前置澄清流程，不替代正式设计产物。

澄清过程中应优先让 Codex 查阅代码、OpenSpec、既有文档和测试来回答可自证的问题；只有代码库无法判断的设计意图、
产品取舍或领域语言才交给用户确认。每次只问一个问题，并在问题中给出推荐答案。

`$grill-with-docs` 可通过 `$domain-modeling` 将已确认的领域术语即时写入根目录 `CONTEXT.md`，并把少数难回退、
非显然且存在真实取舍的决策写入 `docs/adr/`。不要预先创建空的 `CONTEXT.md` 或 ADR；只在术语或决策真正确定时懒创建。
`CONTEXT.md` 只记录领域词汇和应避免的同义词，不记录实现方案；ADR 记录长期架构原因，不承担任务清单或验收标准。

使用 `$grill-with-docs` 后，正式能力、契约、迁移或跨模块生命周期仍应继续沉淀到 OpenSpec proposal/design/spec/tasks。
ADR 说明为什么长期采用某个架构选择，OpenSpec 说明本次变更要实现什么、如何验收和如何落地。

## 设计入口

- 小型非 OpenSpec 改动：在对话中给出短计划即可，必要时更新相邻 README 或 `docs/`。
- 中等复杂度改动：先写任务清单，必要时在 `docs/` 增加说明或 runbook。
- 涉及正式能力、契约、迁移或跨模块生命周期的改动：使用 OpenSpec proposal/design/spec/tasks。
- 大型功能拆分：用 umbrella change 或 feature 文档记录子 change 列表、依赖顺序、集成验收标准。

入口优先级为：OpenSpec 触发条件 > 普通设计或任务清单 > Quick Change 短计划 > 仅在最终说明中记录。判断依据是行为、契约和风险，而不是 diff 大小。只要改动影响正式能力、跨模块契约、schema、安全/权限/session/审计/队列语义、迁移、回滚、发布或跨模块生命周期，即使实现很小，也应进入 OpenSpec；只有未触发 OpenSpec 且低风险的小改，才使用 Quick Change 短计划。

## 设计内容

设计文档应优先回答这些问题：

- 问题和目标：为什么需要改，成功后用户或系统能得到什么。
- 范围和非目标：哪些模块会变，哪些明确不变。
- 当前证据：相关代码路径、OpenSpec specs、docs、测试或运行信号。
- 方案和取舍：列出采纳方案，必要时记录备选方案和不采用原因。
- 数据和契约：DTO、schema、API、事件、日志字段、队列任务、Redis key、数据库迁移。
- 风险和回滚：兼容性、迁移窗口、部分失败、数据修复、回滚前提。
- 正确性标准：哪些用户或系统行为、契约、边界条件、风险和证据必须成立，才算本次变更完成。

## 编写原则

- 使用具体文件路径和稳定术语，避免只写“相关模块”“某接口”。
- 把 Given/When/Then、SHALL/MUST 和验收条件写成可验证文本；不要在设计中复制验证矩阵或命令清单。
- 让当前事实落在仓库内：重要 Slack/口头决策应沉淀到 OpenSpec、`docs/` 或相邻 README。
- 设计只描述需要实现的行为和关键取舍；实现细节放到 tasks 或代码评审中。
- 当实现改变了设计假设，更新设计或记录偏离原因，不让旧设计继续伪装成当前事实。

## 与文档索引的关系

- 新增 `docs/**/*.md` 后必须更新 [docs/index.md](../index.md)。
- 当前可作为依据的文档标记为 `Current`，历史快照标记为 `Historical`，已知过期内容标记为 `Stale`。
- 涉及发布、回滚、验证证据或运维操作的设计结果，应同步到 `docs/releases/` 或对应 feature 文档。
- 文档变更的索引覆盖、新鲜度和本地 Markdown 链接验证方式由 [testing.md](testing.md) 统一定义。
