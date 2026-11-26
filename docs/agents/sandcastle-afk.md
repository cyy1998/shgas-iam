# Sandcastle AFK 工作流

本页定义 Sandcastle AFK 的交接门禁、`.sandcastle/` 极简编排结构、分支工作区、按需 Merger、评审与验证契约及有序幂等 PR 交付流程，只在准备交接 AFK、运行 AFK 或排障回流时读取。
宿主环境搭建、启动参数与执行器资源恢复见[AFK 运维与启动手册](../../.sandcastle/README.md#启动与诊断)，架构取舍见 [ADR-0059](../adr/0059-converge-sandcastle-afk-on-minimal-extractable-core.md)。

维护者运行 `pnpm sandcastle` 或明确要求启动该路径，即授权本次运行处理全仓 `ready-for-agent` backlog（或 `--spec <N>` 指定的单个 Spec）、
推送 Spec 集成分支到远端、创建或更新 Pull Request、在失败时为 Spec 添加 `needs-attention` 标签与原因评论，并在交付完成后移除关联议题的 `ready-for-agent` 标签；
不包含合入目标分支、关闭 issues 或部署。配置或检查执行器本身不等于启动它。

## `.sandcastle/` 极简编排结构

AFK 编排统一收拢在 `.sandcastle/`，保持“纯编排逻辑 + 本仓装配”的自然边界而不额外建包外壳：

- **纯流程编排核心**（[`.sandcastle/afk.ts`](../../.sandcastle/afk.ts)）：无模块级可变全局状态，仅依赖 `node:*` 与 `@ai-hero/sandcastle`，导出 `runAfk`、`checkAfk`、`readonlySandbox`、`listReadySpecNumbers`、`readSpec` 等编排原语。
- **本仓装配与入口**（[`.sandcastle/session.ts`](../../.sandcastle/session.ts)、[`.sandcastle/run.mts`](../../.sandcastle/run.mts)、[`.sandcastle/smoke.mts`](../../.sandcastle/smoke.mts)）：注入 `cyy1998/shgas-iam`、6 个 Codex 角色槽位（读自 `.codex/agents/*.toml`）、原生 `docker()` 沙箱工厂（含单向只读 `auth.json`、离线 pnpm store、Turbo 跨次缓存、`.sandcastle/hooks/` 与 `docker inspect` 测试资源清理）及唯一一套 [`.sandcastle/prompts/`](../../.sandcastle/prompts/)；启动命令由外层 `flock -n .sandcastle/runner.lock` 保证单实例互斥。

## 设计与执行交接

在 T3 Code 完成分析设计、准备为 Spec 与 tickets 标记 `ready-for-agent` 并交接给 Sandcastle AFK 前，按顺序完成以下门禁与分支准备：

1. **`ready-for-agent` 轻量门禁** 标记 `ready-for-agent` 前，由当前主会话启动一个**同引擎的新鲜只读 subagent**
   （Antigravity 用原生 `research`，Codex 用原生 `code_researcher`）独立核查四项：
   - 每张 ticket 的验收条件客观可测，且已明确测试 seam、所需验证层级（Unit / Integration / E2E / Gateway）与设计期实施档位标签（`agent:light` / `agent:deep`，缺省为 standard，严禁同时打两个档位标签）；
   - GitHub 原生父子关系（`--parent`）与阻塞边（`--blocked-by`）完整、无环且覆盖全部前置依赖；
   - 阻塞实现的 `ADR`、`GLOSSARY.md` 与设计决策均已提交到候选集成分支；
   - 候选集成分支满足下方 `linkedBranches` 与 worktree 契约。
2. **AFK 候选集成分支契约**：
   - **原生 `linkedBranches` 关联**：若设计阶段需要携带 ADR / 设计产物分支，在创建 Spec 后通过 `gh issue develop <spec> --name feat/<slug>` 将分支原生关联到 Spec 的 Development 栏（若曾在本地切出提交设计产物，交接前先切回其他分支或移除外部 worktree；AFK 通过 GraphQL `linkedBranches` 读取，不解析正文；未关联时自动默认 `sandcastle/spec-<N>`；关联多个分支或与基线分支同名时报错暂停）。
   - **不要求本地 checkout 对齐或工作区干净**：runner 启动时直接 `git fetch <remote> <baseBranch>`，不读取也不校验本地当前所在分支或工作树状态；维护者可停留在任意分支继续交互开发。
   - **避免外部 worktree 占用集成分支**：若设计阶段曾在独立 worktree 中检出该候选集成分支，交接前先移除该外部 worktree（保留本地分支 ref），避免 runner 拒绝接管已被外部检出的分支。
3. **AFK 异常回流（`needs-attention`）** Sandcastle 因分支冲突、票失败、验证未通过或交付异常暂停时，会给 Spec 添加 `needs-attention` 标签并评论具体阶段与原因，同时保留本地工作树与分支。切回 T3 Code 处理：
   - 读取对应 Spec 的暂停评论、集成分支 `git log --first-parent` 合并历史与本地工作树现场；
   - 复杂问题交给 `deep_researcher` 定位根因（见[代码调查与双引擎编排](code-investigation.md)）；
   - 修复阻塞点并移除 Spec 的 `needs-attention` 后重新运行 `pnpm sandcastle` 续跑，或经用户确认在 T3 单会话完成收口并走[完成与 PR 交付](workflow.md#完成与-pr-交付)。

## 分支与工作区

AFK 启动时通过 `git fetch <remote> <baseBranch>`（默认 `origin` / `main`，可由 `SANDCASTLE_GIT_REMOTE`、`SANDCASTLE_BASE_BRANCH` 覆盖）获取最新远端基线作为新 Spec 分支起点，并保持本地目标分支与当前 checkout **全程不读取、不修改**。双轴评审与已集成票扫描的基线始终由 `git merge-base <specBranch> <remote>/<baseBranch>` 动态推导；运行期间远端 `main` 前进不会导致交付失败、恢复卡死或评审全量重跑，潜在合入冲突交由 GitHub PR 处理。

宿主统一拥有所有 worktree 生命周期（SDK 始终运行在 `branchStrategy: { type: "head" }`，消除双重管理冲突）：在 `.sandcastle/worktrees/spec-<N>` 维护 Spec 持久工作树，在 `.sandcastle/worktrees/ticket-<N>` 维护每张在途票的独立工作树（票分支 `sandcastle/ticket-<N>`）。若 Spec 关联了 `linkedBranches` 且本地尚未检出该分支，宿主自动从 `origin/<branch>` 拉取创建。遇外部 checkout 占用目标分支时立即停止并保留现场。

安全边界的诚实定位是**工具链固定、GitHub 写凭据隔离与不污染本地 `main`**（可写阶段挂载 `docker.sock` 与 `network: "host"` 以支持真实容器集成测试）：

- 每次启动沙箱前检查仓库根与目标工作树的 `.sandcastle/.env`（拒绝声明 `GH_TOKEN` / `GITHUB_TOKEN` 含空值）以及 `.git/config`（拒绝内嵌凭据与 HTTP Authorization header）；
- 启动前校验远端 `git remote get-url --push --all <remote>` 全部精确指向 `github.com/<repo>`；
- 只读双轴评审使用 `readonlySandbox()` 将工作树与 `.git` 设为只读，仅挂单向只读 `auth.json`，不挂 `docker.sock`、`pnpm-store`、Turbo 缓存与 Docker registry，不启用可写 hooks；
- 容器内模型会话始终禁止推送远端分支、创建 PR、修改 GitHub 议题或部署。

## 批量实施与按需 Merger

本仓为 6 个核心角色槽位绑定原生 Codex `AgentProvider`（`light`、`standard`、`deep`、`reviewStandards`、`reviewSpec`、`repair`，其中 `repair` 固定复用 `implementer_deep`）。宿主直接驱动确定性任务图，**不使用 LLM Planner、Explorer、GitHub Projects 看板或 assignee 认领**。

1. **有界懒加载 GraphQL**。宿主先执行 `issues(first: 50, states: OPEN, labels: ["type:spec", "ready-for-agent"])` 过滤掉历史非就绪 Spec 与带 `needs-attention` 的 Spec，按编号升序逐条懒加载单个 Spec 的正文、评论、`linkedBranches`、`subIssues` 与 `blockedBy`（任一分页连接 `hasNextPage` 为 true 即报错，规避 GitHub 50 万节点上限）。
2. **前沿计算与档位路由**。就绪子票须满足 `OPEN ∧ ready-for-agent ∧ !needs-attention ∧ 未集成 ∧ 阻塞已满足`（Spec 内前置看 Git 合并提交 `Sandcastle-Ticket: #<N>` trailer，Spec 外前置直接信任 GitHub `CLOSED`）。每张票档位由设计期标签确定：`agent:light` → `light`、`agent:deep` → `deep`、缺省 → `standard`（同时存在两标签时报错暂停）。复用已有票分支前，宿主核验其已包含所有已集成内部前置的合并提交。
3. **宿主注入上下文与并行实施**。所有阶段使用原生 `promptFile` + `promptArgs`，由宿主直接将父 Spec、ticket、评论与角色指令注入 [`.sandcastle/prompts/`](../../.sandcastle/prompts/)，沙箱无需访问 GitHub API。宿主按 `maxParallel`（默认 `4`）并行派发就绪票；派发每张新票前读取一次 Spec 标签作为软停止开关。
4. **单循环串行合并与按需 Merger**。每完成一张票（工作树干净、输出 `<promise>COMPLETE</promise>` 且包含派发基线），宿主在主循环内串行尝试 `git merge --no-ff` 并写入 `Sandcastle-Ticket: #<N>` trailer：
   - **无冲突快速路径**：直接合入 Spec 分支，随即清理该票工作树并以 CAS 方式删除本地 `sandcastle/ticket-<N>` 分支；
   - **真实冲突按需 Merger**：宿主先 `git merge --abort`，参照 `$implement-spec` 直接在 Spec 持久工作树启动最多 **1 次 Merger Agent**（`.sandcastle/prompts/merge.md`，使用 `standard` 角色），执行 `git merge --no-ff sandcastle/ticket-<N>`、解冲突、重跑受影响验证并提交。宿主校验工作树干净、合并提交同时包含合并前 Spec tip 与票 tip 并确保 `Sandcastle-Ticket: #<N>` trailer 存在，随后清理票工作树与票分支。
   - **失败隔离**：单票或 Merger 失败时不强杀其他在途独立票，待在途票收尾并合入有效进度后再暂停 Spec；每轮无在途票时会重新读取一次 Spec，自动纳入运行中新增的 `ready-for-agent` 子票。

## 双轴只读评审与集中修复

当 Spec 全部 `ready-for-agent` 子票均已集成且 Spec 工作树干净后，宿主计算 `reviewBase = git merge-base <specBranch> <remote>/<baseBranch>` 与 `candidateSha = git rev-parse HEAD`：

1. **独立只读并发双轴评审**。通过 `Promise.all` 在 Spec 工作树上并发启动 2 个独立只读容器，分别执行 `review-standards.md` 与 `review-spec.md`（遵循 [`code-review` skill](../../.agents/skills/code-review/SKILL.md) 对应轴要求）。两轴均需输出 `<promise>COMPLETE</promise>` 且评审期间 `HEAD` 保持不变。不保留本地 `review-cache.json`。
2. **单次集中修复、最终验证与 `$pr` 正文起草**。宿主固定使用 `repair`（`implementer_deep`）角色在 Spec 工作树运行单次 `repair-and-verify.md`，注入双轴评审报告、父 Spec 与全部已集成 tickets，集中处理全部 findings、提交修复并按[验证节奏](#验证节奏)完成最终验证。全部必需检查通过且工作树干净后，按 [`.agents/skills/pr/SKILL.md`](../../.agents/skills/pr/SKILL.md) 与 [`GLOSSARY.md`](../../GLOSSARY.md) 在 `<pr-body>...</pr-body>` 中输出 PR 正文草稿，并以 `<promise>COMPLETE</promise>` 结束。
3. **宿主核验与回退正文**。宿主核对工作树干净且 `finalSha` 包含 `candidateSha`。缺少 `<pr-body>` 时使用宿主确定性回退正文，并保证正文包含 Spec 及全部已集成 tickets 的逐行 `Closes #<number>`。

## Spec 交付与清理

恢复只依赖 Git 与 GitHub，**零本地状态文件**：已集成票集合始终从 `<mergeBase>..<specBranch>` 的 `--first-parent --merges` 提交与 `Sandcastle-Ticket: #<N>` trailer 推导，不存在“发现已有 Open PR 直接跳过评审验证”的快路径。

修复与验证通过后，宿主先复核 Spec 仍为 `OPEN`、带 `ready-for-agent` 且无 `needs-attention`，再按固定顺序交付：

1. **非强制推送 Spec 集成分支**。执行 `git push -u <remote> <specBranch>` 并通过 `git ls-remote --heads` 核验远端 SHA 精确等于 `finalSha`。
2. **幂等复用或创建 PR**。若 `<specBranch> -> <baseBranch>` 已存在 Open PR，检查并补齐缺失的 `Closes #<number>` 后复用；否则创建 Ready for Review PR（`--draft` / `SANDCASTLE_PR_DRAFT` 时为 Draft）。
3. **移除已集成子票的 `ready-for-agent`**。issues 保持 open，待维护者在 GitHub 合并 PR 时自动关票。
4. **清理 Spec 工作树**。非强制移除 `.sandcastle/worktrees/spec-<N>`，**保留本地 Spec 分支 ref** 供维护者本地验收。
5. **最后移除父 Spec 的 `ready-for-agent`**。前四步全部成功后才将父 Spec 移出队列。

任意步骤抛错时，宿主保留现场、给 Spec 添加 `needs-attention` 标签并评论失败原因。

## 验证节奏

通用的聚焦验证、提交 Hook、修复后的结果复用和基线失败处理按[工作流补充](workflow.md#验证节奏)执行。

- **票级实施与按需 Merger** 票级实施（以及冲突触发的按需 Merger 会话）运行完整受影响范围的行为测试、typecheck、适用文档检查与 `git diff --check`。
- **Spec 最终验证** 最终集中修复者以动态计算的固定 `reviewBase`（`merge-base`）为合入目标，按[验证节奏](workflow.md#验证节奏)为整个 Spec 的最终候选选择基础门禁：纯文档差异运行 `pnpm verify:docs --base <review-base-sha>`，其余改动运行 `pnpm verify` 并按父 Spec 与全部 tickets 的风险、验收和已确认测试决策补齐所需 Integration、E2E、Gateway 检查（重复覆盖按范围去重；各票分支结果不替代最终组合验证）。
- **Container Smoke 门禁** 集中修复提交后，在候选工作树执行 `pnpm verify:container-smoke --base <review-base-sha>`。按[命令入口](../engineering/commands.md#container-smoke)的路径与生产镜像闭包规则判定命中时，串行追加一次 `pnpm test:e2e:container-smoke`；同一最终候选已通过 `pnpm verify:release` 时复用其中结果。
- **E2E Runtime 门禁** 集中修复提交后，在候选工作树执行 `pnpm verify:e2e-runtime --base <review-base-sha>`，按[命令入口](../engineering/commands.md#full-system-e2e)的路径规则按需运行编排器 Integration；同一最终候选已通过 `pnpm verify:release` 时复用对应结果。
- 后续修复重跑失效检查，仍有效的通过证据可复用。交接记录实际命令、结果、对应候选与未执行项；必需检查失败或未执行、findings 尚未解决时保持未完成，不输出 `<promise>COMPLETE</promise>`。
