# Sandcastle AFK 工作流

本页定义 Sandcastle AFK 的交接门禁、目录分工、分支与工作区契约、并行实施与按需 Merger、双轴评审验证及 PR 交付流程，在准备交接 AFK、运行 AFK 或排障回流时读取。
宿主搭建、启动参数与故障恢复见[AFK 运维与启动手册](../../.sandcastle/README.md#启动与诊断)，架构决策见 [ADR-0059](../adr/0059-adopt-native-sandcastle-afk-orchestration.md)。

维护者运行 `pnpm sandcastle` 或明确要求启动该路径，即授权本次运行处理 `ready-for-agent` backlog（或 `--spec <N>` 指定的单个 Spec）、推送 Spec 集成分支到远端、创建或更新 Pull Request、在异常暂停时为 Spec 添加 `needs-attention` 标签与原因评论，并在交付完成后移除关联议题的 `ready-for-agent` 标签；不包含合入目标分支、关闭 issues 或部署。

## `.sandcastle/` 编排结构

- [`.sandcastle/afk.ts`](../../.sandcastle/afk.ts)：流程编排核心，负责任务图调度、并行实施、按需 Merger、双轴只读评审、集中修复验证与有序交付。
- [`.sandcastle/github.ts`](../../.sandcastle/github.ts)：GitHub 接口层，封装有界懒加载 GraphQL、Spec/Ticket 准入判定、`linkedBranches` 分支解析、暂停标注、幂等 PR 复用与标签移除。
- [`.sandcastle/git.ts`](../../.sandcastle/git.ts)：Git 与宿主安全辅助层，封装命令执行、凭据预检、远端 URL 校验、worktree 生命周期、已集成票推导与合并提交核验。
- [`.sandcastle/session.ts`](../../.sandcastle/session.ts)：本仓装配层，从 `.codex/agents/*.toml` 加载 6 个 Codex 角色槽位（显式 `captureSessions: false`），提供单向只读 `auth.json` / `CODEX_API_KEY` 认证、自洽的 `createSession({ worktree, readonly, runId })` 只读/可写 Docker 会话（可写阶段挂 `docker.sock`、离线 `~/.pnpm-store`、`.sandcastle/cache/turbo`、可选私有 registry，经 `GIT_CONFIG_VALUE_0=.husky` 复用 `.husky/pre-commit` 并用单行 `onSandboxReady` 安装依赖）与基于 `docker inspect <sandboxId>` 的测试资源回收。
- [`.sandcastle/run.mts`](../../.sandcastle/run.mts) 与 [`.sandcastle/smoke.mts`](../../.sandcastle/smoke.mts)：CLI 入口与真实 Docker 冒烟脚本；根命令 `pnpm sandcastle` 通过 `flock -n .sandcastle/runner.lock` 保证单实例互斥。
- [`.sandcastle/prompts/`](../../.sandcastle/prompts/)：5 阶段 Prompt 模板（`implement`、`merge`、`review-standards`、`review-spec`、`repair-and-verify`）。

## 设计与执行交接

在 T3 Code 完成分析设计、准备为 Spec 与 tickets 标记 `ready-for-agent` 并交接给 Sandcastle AFK 前，按顺序核对以下事项：

1. **`ready-for-agent` 轻量门禁**：标记 `ready-for-agent` 前，启动一个**同引擎的新鲜只读 subagent**（Antigravity 用原生 `research`，Codex 用原生 `code_researcher`）独立核查四项：
   - 每张 ticket 的验收条件客观可测，明确测试 seam、验证层级（Unit / Integration / E2E / Gateway）与实施档位标签（`agent:light` / `agent:deep`，缺省为 standard，两者互斥）；
   - GitHub 原生父子关系（`--parent`）与阻塞边（`--blocked-by`）完整、无环且覆盖全部前置依赖；
   - 阻塞实现的 `ADR`、`GLOSSARY.md` 与设计决策均已提交到候选集成分支；
   - 集成分支满足下方 `linkedBranches` 与工作树契约。
2. **候选集成分支契约**：
   - **原生 `linkedBranches` 关联**：若设计阶段已有包含 ADR / 设计文档的分支，在创建 Spec 后通过 `gh issue develop <spec> --name feat/<slug>` 将其原生关联到 Spec 的 Development 栏（若曾在本地切出该分支提交文档，交接前先切回其他分支或移除外部 worktree）。未关联时 AFK 默认使用 `sandcastle/spec-<N>`；关联多个分支，或分支为 `main` / 基线分支时报错暂停。
   - **独立于本地 checkout**：runner 启动时直接 `git fetch <remote> <baseBranch>`，全程不读取也不修改本地当前分支或工作区，维护者可留在任意分支继续开发。
3. **异常回流（`needs-attention`）**：Spec 暂停时，runner 会保留本地工作树与分支，给 Spec 添加 `needs-attention` 标签并评论失败阶段与原因。切回 T3 Code 后：
   - 阅读 Spec 暂停评论与集成分支 `git log --first-parent` 历史；
   - 复杂问题交给 `deep_researcher` 定位根因（见[代码调查与双引擎编排](code-investigation.md)）；
   - 解除阻塞并移除 `needs-attention` 后重新运行 `pnpm sandcastle` 续跑，或经用户确认在 T3 单会话完成收口并走[完成与 PR 交付](workflow.md#完成与-pr-交付)。

## 分支、工作区与安全边界

AFK 启动时拉取 `<remote>/<baseBranch>`（默认 `origin` / `main`，可由 `SANDCASTLE_GIT_REMOTE`、`SANDCASTLE_BASE_BRANCH` 覆盖）作为新 Spec 分支起点，评审与已集成票基线均由 `git merge-base <specBranch> <remote>/<baseBranch>` 动态推导。

宿主统一管理所有 worktree，SDK 始终运行在 `branchStrategy: { type: "head" }`：Spec 持久工作树位于 `.sandcastle/worktrees/spec-<N>`，各在途票工作树位于 `.sandcastle/worktrees/ticket-<N>`（票分支 `sandcastle/ticket-<N>`）。当 Spec 关联远端分支时，宿主以显式 refspec 拉取 `refs/heads/<specBranch>:refs/remotes/<remote>/<specBranch>`：本地无同名分支则直接从该远端 ref 建立跟踪分支；本地已存在同名分支则校验其已包含远端最新提交，否则立即报错提示先同步。

安全边界聚焦于**工具链固定、GitHub 写凭据隔离与不污染本地 `main`**（可写阶段挂载 `docker.sock` 与 `network: "host"` 以支持真实容器集成测试）：

- 每次启动沙箱前检查仓库根与目标工作树的 `.sandcastle/.env`（拒绝 `GH_TOKEN` / `GITHUB_TOKEN` 含空值）与 `.git/config`（拒绝内嵌凭据或 HTTP Authorization header）；
- 启动前校验远端 push/fetch URL 全部精确指向 `github.com/<repo>`；
- 只读双轴评审由 `createSession({ worktree, readonly: true })` 直接将工作树与 `.git` 在内的全部挂载设为只读，仅挂单向只读模型凭据，不挂 `docker.sock`、`pnpm-store`、Turbo 缓存与 Docker registry；
- 容器内 Agent 禁止推送远端分支、创建 PR、修改 GitHub 议题或部署。

## 批量实施与按需 Merger

宿主按固定角色槽位（`light`、`standard`、`deep`、`reviewStandards`、`reviewSpec`、`repair`，其中 `repair` 复用 `implementer_deep`）直接驱动确定性任务图：

1. **有界懒加载 GraphQL**：先查询带 `type:spec` 与 `ready-for-agent` 的 open Spec（跳过 `needs-attention`），再按编号升序懒加载单条 Spec 的正文、评论、`linkedBranches`、`subIssues` 与 `blockedBy`，任一分页连接溢出即报错；显式指定 `--spec <N>` 且该 Spec 未就绪时直接报错退出。
2. **前沿计算与档位路由**：就绪子票须满足 `OPEN ∧ type:ticket ∧ ready-for-agent ∧ !needs-attention ∧ 未集成 ∧ 阻塞已满足`（Spec 内前置看 Git 合并提交 `Sandcastle-Ticket: #<N>` trailer，Spec 外前置以 GitHub `CLOSED` 为准）。按 `agent:light` / `agent:deep` / 缺省 `standard` 路由模型档位；复用已有票分支前核验已集成的内部前置均在其祖先历史中。
3. **并行实施与宿主注入**：宿主按 `maxParallel`（默认 `4`）并行派发就绪票，经原生 `promptFile` + `promptArgs` 将父 Spec、ticket、评论与角色指令注入沙箱。每轮派发波次开始及空载重载 `readSpec` 后检查一次 Spec 标签，被移除 `ready-for-agent` 或标为 `needs-attention` 时软停止新派发。
4. **串行合并与按需 Merger**：单票完成（工作树干净、输出独立行 `<promise>COMPLETE</promise>` 且包含派发基线）后，宿主在主循环内串行尝试 `git merge --no-ff <ticketTip>` 并写入 `Sandcastle-Ticket: #<N>` trailer：
   - **无冲突路径**：核验双亲合并提交后直接合入 Spec 分支，随即清理票工作树并以 CAS 删除 `sandcastle/ticket-<N>`；
   - **真实冲突按需 Merger**：确认存在 `MERGE_HEAD` 与未合并文件后干净执行 `git merge --abort`，直接在 Spec 工作树启动最多 1 次 Merger Agent（`.sandcastle/prompts/merge.md`，`standard` 角色）完成 `git merge --no-ff --no-commit`、解冲突、重跑受影响范围的聚焦验证并提交。宿主在 `--first-parent --merges` 历史中核验合并提交与 `Sandcastle-Ticket: #<N>` trailer（兼容合并后的小修提交）后清理票工作树与票分支；
   - **失败与完整范围判定**：单票准备、执行或合并失败时等待其他在途独立票收尾并合入有效进度，再暂停 Spec。无在途票时重新读取 Spec 复核软停止并纳入运行中新增的就绪票；仅当 `done.size > 0` 且 Spec 下全部 `OPEN` `type:ticket` 子票均已集成时才进入评审，否则暂停并报告未完成子票。

## 双轴只读评审与集中修复

全部 `OPEN` 子票集成完毕且 Spec 工作树干净后，宿主复用 `mergeBase` 并记录 `candidateSha = git rev-parse HEAD`：

1. **独立只读并发双轴评审**：通过 `Promise.allSettled` 在 Spec 工作树上并发启动 2 个独立只读容器，分别执行 `review-standards.md` 与 `review-spec.md`（遵循 [`code-review` skill](../../.agents/skills/code-review/SKILL.md) 对应轴要求）。两轴均须输出独立行 `<promise>COMPLETE</promise>` 且评审期间 `HEAD` 不变。
2. **集中修复、最终验证与 PR 正文起草**：宿主以 `repair` 角色在 Spec 工作树运行单次 `repair-and-verify.md`，注入双轴评审报告、父 Spec 与已集成 tickets，集中处理 findings、提交修复并按[验证节奏](#验证节奏)完成最终验证，在 `<pr-body>...</pr-body>` 中按 [`.agents/skills/pr/SKILL.md`](../../.agents/skills/pr/SKILL.md) 与 [`GLOSSARY.md`](../../GLOSSARY.md) 输出 PR 正文草稿。
3. **宿主核验与回退正文**：核对工作树干净且 `finalSha` 包含 `candidateSha`；取输出中最后一次闭合的 `<pr-body>...</pr-body>`，缺失时生成确定性回退正文，并确保包含父 Spec 及全部已集成 tickets 的逐行 `Closes #<number>`。

## Spec 交付与清理

恢复只依赖 Git 与 GitHub：已集成票集合始终从 `<mergeBase>..<specBranch>` 的 `--first-parent --merges` 提交与 `Sandcastle-Ticket: #<N>` trailer 推导。

修复验证完成后，宿主复核 Spec 仍为 `OPEN`、带 `type:spec` 与 `ready-for-agent` 且无 `needs-attention`，再按固定顺序交付：

1. **非强制推送精确候选**：执行 `git push -u <remote> <finalSha>:refs/heads/<specBranch>`，并经 `git ls-remote --heads` 核验远端 SHA 精确等于 `finalSha`。
2. **幂等复用或创建 PR**：在远端 SHA 核验通过后，若同仓库 `<specBranch> -> <baseBranch>` 已存在 Open PR，补齐缺失的 `Closes #<number>` 后复用；否则创建 Ready for Review PR（`--draft` / `SANDCASTLE_PR_DRAFT` 时为 Draft）。
3. **移除已集成子票的 `ready-for-agent`**（issues 保持 open，待 GitHub 合并 PR 时自动关票）。
4. **清理 Spec 工作树**：非强制移除 `.sandcastle/worktrees/spec-<N>`，保留本地 Spec 分支 ref 供本地验收。
5. **最后移除父 Spec 的 `ready-for-agent`**。

任意步骤抛错时，宿主保留现场、给 Spec 添加 `needs-attention` 标签并评论失败原因。

## 验证节奏

通用的聚焦验证、提交 Hook、结果复用与基线失败处理见[工作流补充](workflow.md#验证节奏)。

- **票级并行实施与按需 Merger**：只运行受影响范围的聚焦测试（相关 workspace 的 Unit、typecheck、适用文档检查、受影响包的定向 Integration `pnpm test:integration -- <filter>` 与 `git diff --check`）；禁止在并行票阶段运行全仓 `pnpm verify`、全量 Integration 或全量 Full-system E2E。
- **Spec 最终验证**：单实例串行的集中修复者以 `mergeBase` 为合入目标，按[验证节奏](workflow.md#验证节奏)执行完整门禁：纯文档差异运行 `pnpm verify:docs --base <merge-base-sha>`，其余改动运行 `pnpm verify` 并按风险与验收补齐所需的 Integration、E2E、Gateway 检查。
- **Container Smoke 与 E2E Runtime 门禁**：修复提交后在候选工作树分别执行 `pnpm verify:container-smoke --base <merge-base-sha>` 与 `pnpm verify:e2e-runtime --base <merge-base-sha>`（同一最终候选已通过 `pnpm verify:release` 时复用对应结果）。
- 后续修复重跑失效检查，仍有效的通过证据可复用；必需检查未通过或 findings 未解决时不得输出 `<promise>COMPLETE</promise>`。
