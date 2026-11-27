# Sandcastle AFK 工作流

本页定义 Sandcastle AFK 的交接门禁、目录分工、分支与方案 X 无特权安全契约、并行实施与按需 Merger、双轴评审验证、PR 交付及远端 `ci-gate` 自动修红闭环，在准备交接 AFK、运行 AFK 或排障回流时读取。
宿主搭建、启动参数与故障恢复见[AFK 运维与启动手册](../../.sandcastle/README.md#启动与诊断)，架构决策见 [ADR-0059](../adr/0059-adopt-native-sandcastle-afk-orchestration.md) 与 [ADR-0060](../adr/0060-unify-test-architecture-sandbox-and-ci-gate.md)。

维护者运行 `pnpm sandcastle` 或明确要求启动该路径，即授权本次运行处理 `ready-for-agent` backlog（或 `--spec <N>` 指定的单个 Spec）、推送 Spec 集成分支到远端、创建或更新 Pull Request、对 Ready PR 轮询远端 `ci-gate` 并在失败时执行限次自动修红与重推、在异常暂停时为 Spec 添加 `needs-attention` 标签与原因评论，并在交付完成后移除关联议题的 `ready-for-agent` 标签；不包含合入目标分支、关闭 issues 或部署。

## `.sandcastle/` 编排结构

- [`.sandcastle/afk.ts`](../../.sandcastle/afk.ts)：流程编排核心，负责任务图调度、并行实施、按需 Merger、双轴只读评审、集中修复、PR 交付、远端 `ci-gate` 等绿、限次自动修红与断线续接。
- [`.sandcastle/github.ts`](../../.sandcastle/github.ts)：GitHub 接口层，封装有界懒加载 GraphQL、Spec/Ticket 准入判定、`linkedBranches` 分支解析、暂停标注、幂等 PR 复用与状态读取、`check-runs` / `actions/runs` 查询、失败日志脱敏截断及标签移除。
- [`.sandcastle/git.ts`](../../.sandcastle/git.ts)：Git 与宿主安全辅助层，封装命令执行、凭据预检、远端 URL 校验、worktree 生命周期、已集成票推导与合并提交核验。
- [`.sandcastle/session.ts`](../../.sandcastle/session.ts)：本仓装配层，从 `.codex/agents/*.toml` 加载 6 个 Codex 角色槽位（显式 `captureSessions: false`），提供单向只读 `auth.json` / `CODEX_API_KEY` 认证与自洽的 `createSession({ worktree, readonly, runId })` 方案 X 无特权单容器 Docker 会话（零 `docker.sock`、零 `--network=host`、无宿主测试容器注册表；可写阶段注入专用测试端点，挂载宿主离线 pnpm store 与 `.sandcastle/cache/turbo`，经 `GIT_CONFIG_VALUE_0=.husky` 复用 `.husky/pre-commit` 并用单行 `onSandboxReady` 安装依赖）。
- [`.sandcastle/run.mts`](../../.sandcastle/run.mts) 与 [`.sandcastle/smoke.mts`](../../.sandcastle/smoke.mts)：CLI 入口与方案 X 真实 Docker 冒烟脚本；根命令 `pnpm sandcastle` 通过 `flock -n .sandcastle/runner.lock` 保证单实例互斥。
- [`.sandcastle/prompts/`](../../.sandcastle/prompts/)：6 阶段 Prompt 模板（`implement`、`merge`、`review-standards`、`review-spec`、`repair-and-verify`、`repair-ci`）。

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

安全边界采用**方案 X 无特权单容器、工具链固定、GitHub 写凭据隔离与不污染本地 `main`**：

- **零 `docker.sock`、零 `--network=host`、零 Docker CLI**：可写与只读沙箱均不挂载宿主机 `/var/run/docker.sock`、不开启 `--network=host`、不传入额外宿主机 group；`.sandcastle/Dockerfile` 在单容器内精准预装 PostgreSQL 18.4、Redis 8.8.0、etcd 3.5.11 与 Apache APISIX 3.16.0 且不启常驻服务，可写阶段由 `onSandboxReady` 启动非 root 测试服务并注入专用端点；
- 每次启动沙箱前检查仓库根与目标工作树的 `.sandcastle/.env`（拒绝 `GH_TOKEN` / `GITHUB_TOKEN` 含空值）与 `.git/config`（拒绝内嵌凭据或 HTTP Authorization header）；
- 启动前校验远端 push/fetch URL 全部精确指向 `github.com/<repo>`；
- 只读双轴评审由 `createSession({ worktree, readonly: true })` 直接将工作树与 `.git` 在内的全部挂载设为只读，仅挂单向只读模型凭据，不挂 `pnpm-store`、Turbo 缓存，也不注入专用测试端点；
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

全部 `OPEN` 子票集成完毕且 Spec 工作树干净后，宿主复用 `mergeBase` 并记录 `candidateSha = git rev-parse HEAD`（若为非 `--draft` 续跑且全部子票此前已集成、同仓库已存在非 Draft Open PR 且远端 SHA 匹配当前 `HEAD`，则跳过重复评审，直接续接下方远端 `ci-gate` 闭环）：

1. **独立只读并发双轴评审**：通过 `Promise.allSettled` 在 Spec 工作树上并发启动 2 个独立只读容器，分别执行 `review-standards.md` 与 `review-spec.md`（遵循 [`code-review` skill](../../.agents/skills/code-review/SKILL.md) 对应轴要求）。两轴均须输出独立行 `<promise>COMPLETE</promise>` 且评审期间 `HEAD` 不变。
2. **集中修复、推前轻量验证与 PR 正文起草**：宿主以 `repair` 角色在 Spec 工作树运行单次 `repair-and-verify.md`，注入双轴评审报告、父 Spec 与已集成 tickets，集中处理 findings、提交修复并完成推前轻量验证（`pnpm check` + 受影响范围定向 Unit / Integration + `git diff --check`，不在沙箱内运行 `pnpm test:e2e`），在 `<pr-body>...</pr-body>` 中按 [`.agents/skills/pr/SKILL.md`](../../.agents/skills/pr/SKILL.md) 与 [`GLOSSARY.md`](../../GLOSSARY.md) 输出 PR 正文草稿。
3. **宿主核验与回退正文**：核对工作树干净且 `finalSha` 包含 `candidateSha`；取输出中最后一次闭合的 `<pr-body>...</pr-body>`，缺失时生成确定性回退正文，并确保包含父 Spec 及全部已集成 tickets 的逐行 `Closes #<number>`。

## Spec 交付与清理

恢复只依赖 Git 与 GitHub：已集成票集合始终从 `<mergeBase>..<specBranch>` 的 `--first-parent --merges` 提交与 `Sandcastle-Ticket: #<N>` trailer 推导。

修复验证完成后，宿主复核 Spec 仍为 `OPEN`、带 `type:spec` 与 `ready-for-agent` 且无 `needs-attention`，按固定顺序推送并建立或复用 PR：

1. **非强制推送精确候选**：执行 `git push -u <remote> <finalSha>:refs/heads/<specBranch>`，并经 `git ls-remote --heads` 核验远端 SHA 精确等于 `finalSha`。
2. **幂等复用或创建 PR**：在远端 SHA 核验通过后，若同仓库 `<specBranch> -> <baseBranch>` 已存在 Open PR，补齐缺失的 `Closes #<number>` 后复用；否则创建 Ready for Review PR（`--draft` / `SANDCASTLE_PR_DRAFT` 时为 Draft）。

随后按 PR 类型分两条收口路径：

- **`--draft` / `SANDCASTLE_PR_DRAFT` 立即交付**：推完 Draft PR 后直接依次移除已集成子票的 `ready-for-agent` → 非强制清理 `.sandcastle/worktrees/spec-<N>`（保留本地 Spec 分支 ref）→ 移除父 Spec 的 `ready-for-agent`，不占用 `flock` 挂等转 Ready 或远端 CI。
- **Ready PR 远端 `ci-gate` 等绿与限次自动修红闭环（Option-1）**：暂留 `specWorktree` 与 `ready-for-agent`，按 **`check_run.head_sha === finalSha && name === 'ci-gate'`** 轮询（默认每 30 秒轮询一次、单次推送总超时 45 分钟、workflow 启动出现超时 5 分钟，每轮核验 Spec 授权且 PR 仍为非 Draft `OPEN`）：
  1. **等绿交付**：确认目标 `head_sha` 的最新 `ci-gate` 结论为 `success` 后，依次移除已集成子票的 `ready-for-agent` → 非强制清理 `.sandcastle/worktrees/spec-<N>`（保留本地 Spec 分支 ref）→ 最后移除父 Spec 的 `ready-for-agent`（issues 保持 open，待 GitHub 合并 PR 时自动关票）。过期分支由 `main` Branch Protection（`Require branches to be up to date`）拦截。
  2. **限次自动修红**：当 `ci-gate` 完成但非 `success` 且尚未达到上限（默认最多 2 次，可由 `SANDCASTLE_CI_MAX_REPAIRS` 覆盖）时，宿主拉取绑定当前 `head_sha` 的失败 workflow 日志（清理 ANSI 控制符、对私钥/Token/Authorization/Cookie/URL 密码/密钥字段脱敏，并截断至约尾部 200 行 / 32KB；若日志不可用则回退为失败 Job/Step 摘要），在 `specWorktree` 唤醒 `repair` 角色运行 [`.sandcastle/prompts/repair-ci.md`](../../.sandcastle/prompts/repair-ci.md) 修复根因并在原失败提交之上创建严格前进的新提交（保持工作树干净，不 amend/rebase）。宿主复核授权与 PR 状态后非强制推送新 `finalSha`、核验远端 ref 并重置本轮等待计时。
  3. **断线重启续接**：未绿灯前进程被中断或修复外部因素后重启 `pnpm sandcastle`，只要全部子票已集成、同仓库已存在非 Draft Open PR 且远端分支 SHA 与本地 `HEAD` 一致，即自动补齐 `Closes #<N>` 并直接续接当前 `head_sha` 的 `ci-gate` 闭环，无需重跑双轴评审。
  4. **暂停与软停止**：超过自动修红上限、等待或启动超时、修红未产生前进提交、或 PR 在等待期间被关闭/转为 Draft 时，宿主保留现场与 `specWorktree`、给 Spec 添加 `needs-attention` 标签并评论失败原因；等待期间若 Spec 被移除 `ready-for-agent` 或人工加上 `needs-attention`，runner 软停止退出。

## 验证节奏

通用的聚焦验证、提交 Hook、结果复用与基线失败处理见[工作流补充](workflow.md#验证节奏)。

- **票级并行实施与按需 Merger**：只运行受影响范围的聚焦测试（相关 workspace 的 Unit、typecheck、适用文档检查、受影响包的定向 Integration `pnpm test:integration -- --workspace <pkg>` / `--file <path>` 与 `git diff --check`；容器内使用就绪钩子准备的测试端点）；禁止在并行票阶段运行全仓 `pnpm verify`、全量 Integration 或 `pnpm test:e2e`。
- **Spec 推前轻量验证（`repair-and-verify`）**：单实例串行的集中修复者在最终干净候选上运行 `pnpm check`（7 步静态与契约检查）、本阶段评审修复涉及的定向 Unit 与定向 Integration，以及 `git diff --check`；不在无特权沙箱内运行 `pnpm test:e2e`。
- **远端权威验证与自动修红（`ci-gate` / `repair-ci`）**：全量 `fast`、`integration`与生产容器 `e2e`（9 specs）或纯文档 `doc-check` 由推送后的 [GitHub Actions CI](../engineering/commands.md#github-actions-ci) 统一裁判；触发 `repair-ci` 自动修红时，在沙箱内结合脱敏失败日志最小化修复，提交前运行 `pnpm check`、失败范围的定向 Unit/Integration（构建失败时同时运行 `pnpm build`）与 `git diff --check`。
- 后续修复重跑失效检查，仍有效的通过证据可复用；必需检查未通过或 findings 未解决时不得输出 `<promise>COMPLETE</promise>`。
