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

## 设计内容

设计文档应优先回答这些问题：

- 问题和目标：为什么需要改，成功后用户或系统能得到什么。
- 范围和非目标：哪些模块会变，哪些明确不变。
- 当前证据：相关代码路径、OpenSpec specs、docs、测试或运行信号。
- 方案和取舍：列出采纳方案，必要时记录备选方案和不采用原因。
- 数据和契约：DTO、schema、API、事件、日志字段、队列任务、Redis key、数据库迁移。
- 风险和回滚：兼容性、迁移窗口、部分失败、数据修复、回滚前提。
- 验收方式：单元测试、类型检查、lint、schema command、smoke、日志/指标查询、截图或 trace。

## 编写原则

- 使用具体文件路径和稳定术语，避免只写“相关模块”“某接口”。
- 把 Given/When/Then、SHALL/MUST、验收命令写成可验证文本。
- 让当前事实落在仓库内：重要 Slack/口头决策应沉淀到 OpenSpec、`docs/` 或相邻 README。
- 设计只描述需要实现的行为和关键取舍；实现细节放到 tasks 或代码评审中。
- 当实现改变了设计假设，更新设计或记录偏离原因，不让旧设计继续伪装成当前事实。

## 与文档索引的关系

- 新增 `docs/**/*.md` 后必须更新 [docs/index.md](../index.md)。
- 当前可作为依据的文档标记为 `Current`，历史快照标记为 `Historical`，已知过期内容标记为 `Stale`。
- 涉及发布、回滚、smoke 或运维操作的设计结果，应同步到 `docs/releases/` 或对应 feature 文档。
- 运行 `pnpm check:docs` 验证索引覆盖、新鲜度和本地 Markdown 链接。
