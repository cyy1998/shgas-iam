---
status: accepted
---

# 采用原生 Sandcastle SDK 构建单目录 AFK 编排

在纯 Linux 运行面（[ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md)）下，仓库需要一套轻量、易维护的无人值守编码编排器：自动接手已批准的 GitHub Spec 及子票，在隔离容器中并行实施、双轴评审并修复验证，最终推送特性分支并创建 Pull Request 等待人工审阅合并。

决定直接使用上游未打补丁的 `@ai-hero/sandcastle`（`0.14.0` 及以上稳定版）与原生 `docker()` 沙箱，将 AFK 编排全部收拢在 `.sandcastle/` 目录内，以 **Git 与 GitHub 作为仅有的两个持久事实来源**。

> _Contradicts [ADR-0004](0004-adopt-upstream-first-matt-skills.md) (`采用上游工作流与仓库薄适配`) — 取代其中 AFK 以 GitHub Projects `Status` 同步进度、启动前要求调用分支与远端完全对齐以及跨 Spec 依赖核验 PR `mergeCommit` 的条款；改用 `needs-attention` 标签与暂停评论、`origin/<base>` 与 `merge-base` 动态基线，以及以 `CLOSED` 判定外部前置完成。_

本决定同时结束 [ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md) 中过渡保留的 Sandcastle 补丁条款，并在 [ADR-0060](0060-unify-test-architecture-sandbox-and-ci-gate.md#收集分层与根工具链) 根工具链默认一次性验证的前提下，为 `.sandcastle/__tests__/boundaries.test.ts` 保留窄范围常驻边界单测。

## 核心架构与取舍

- **单目录分层**。编排代码按“流程编排（`afk.ts`）+ 仓库无关的 GitHub/Git 模块（`github.ts`、`git.ts`）+ 本仓会话与 CLI 装配（`session.ts`、`run.mts`、`smoke.mts`）”组织在 `.sandcastle/` 内（各文件职责见[AFK 运维手册](../../.sandcastle/README.md)）。相比抽成独立 workspace package，单目录免去了额外的构建步骤、贴近上游布局，且流程与 Git/GitHub 模块不依赖仓库业务代码。
- **无特权单容器与安全边界**。可写沙箱采用 [ADR-0060](0060-unify-test-architecture-sandbox-and-ci-gate.md#方案-x单容器预装四件套与非-root-启动) 的方案 X 单容器，在 `onSandboxReady` 完成离线 pnpm store 依赖安装与非 root 测试服务启动；同时挂载 `.sandcastle/cache/turbo`，经 `GIT_CONFIG_VALUE_0=.husky` 复用 `.husky/pre-commit`。关键隔离边界如下：
  - 仅非强制推送精确 `<finalSha>:refs/heads/<specBranch>` 并创建或复用 PR，禁止推送 `main` 或基线分支；启动前校验远端 push/fetch URL 全部指向 `github.com/<repo>`。
  - GitHub 写凭据仅保留在宿主 `gh auth login`，启动沙箱前检查仓库根与目标工作树的 `.sandcastle/.env`（拒绝声明含空值在内的 `GH_TOKEN`/`GITHUB_TOKEN`）与 `.git/config`。
  - 只读双轴评审由 `createSession({ worktree, readonly: true })` 构造独立的只读沙箱，工作树与 `.git` 均以只读挂载，仅挂载单向只读认证文件，不挂 `pnpm-store` 与 Turbo 缓存。
  - Codex 显式关闭 `captureSessions`，同时支持 `CODEX_API_KEY` 与 `~/.codex/auth.json`；后者单向只读复制进容器、退出即删且不回写宿主，token 过期时由维护者在宿主重新登录。
- **宿主独占工作树与票级并行**。宿主通过 `git worktree` 统一管理 Spec 与子票工作树，SDK 始终使用 `branchStrategy: { type: "head" }`，避免双侧管理冲突。启动时执行 `git fetch <remote> <baseBranch>`，不读写也不改动本地当前 checkout，以 `git merge-base` 动态确定评审与已集成票基线。
- **串行合并与按需 Merger**。就绪子票并行实施并只运行受影响范围的聚焦验证；主循环串行执行 `git merge --no-ff <ticketTip>` 并写入 `Sandcastle-Ticket: #<N>` trailer。仅遇到真实合并冲突时中止合并，在 Spec 工作树中启动至多 1 次 Merger Agent（`.sandcastle/prompts/merge.md`）解冲突、重跑聚焦验证并提交，随后核验 `--first-parent --merges` 历史中的合并提交与 trailer（兼容合并后的小修提交）。相比纯串行单沙箱，代价是维护票级工作树与按需 Merger，换取独立切片的并行吞吐与基于 Git 合并历史的断点恢复。
- **GitHub 原生元数据**。流程固定使用 `type:spec`、`type:ticket`、`ready-for-agent`、`agent:light`、`agent:deep`、`needs-attention` 标签与原生 `subIssues`/`blockedBy`/`linkedBranches`（经有界懒加载 GraphQL 读取并检测分页溢出）；集成分支取自 `linkedBranches`，未关联时默认 `sandcastle/spec-<N>`。
- **推前评审与轻量门禁**。全部 `OPEN` 子票集成后，并发运行双轴只读评审并执行一次可写 `repair-and-verify`。权威验证已交由远端 CI，推 PR 前本地门禁收敛为 `pnpm check`，随后按固定顺序推送精确 SHA 并幂等复用或创建 PR（补齐 `Closes #<N>`）。
- **远端 `ci-gate` 闭环**。
  - 传入 `--draft` 时，推完 Draft PR 即摘除 `ready-for-agent`、清理工作树并交付人工，不占用运行锁等待转 Ready。
  - 正常 Ready PR 暂留 `specWorktree` 与 `ready-for-agent`，按 `check_run.head_sha === finalSha && name === 'ci-gate'` 轮询并持续核验授权与 PR 状态。失败且未达修红上限时，拉取绑定当前 run 的脱敏尾部日志唤醒 `repair` 沙箱修复并重推新 `finalSha`；达到上限、超时或遇到环境/冲突阻塞时保留现场、打 `needs-attention` 并评论原因。
  - 未绿灯前若进程中断，重启后可依据“全票已集成且 Open PR 已存在”直接续接当前 `headSha`。确认 `ci-gate` 通过后摘除子票与父 Spec 的 `ready-for-agent` 并清理 `specWorktree`；过期分支交由 GitHub Branch Protection（`Require branches to be up to date`）拦截。轮询间隔、超时与重试上限等运行参数见[Sandcastle AFK 工作流](../agents/sandcastle-afk.md)。
- **外部互斥**。根脚本经 `flock -n .sandcastle/runner.lock` 保证单实例运行；容器退出后临时进程随单容器回收，无需跨进程宿主容器清理。

## 验证边界

- **窄范围常驻单测与真实冒烟**。`pnpm test:unit:sandcastle`（纳入 `pnpm test:unit` 与 `pnpm verify`）通过 [`.sandcastle/__tests__/boundaries.test.ts`](../../.sandcastle/__tests__/boundaries.test.ts) 守卫协议、安全隔离与 `ci-gate` 状态机边界；无特权单容器的端到端行为由真实 Docker `pnpm sandcastle:smoke` 验证。

[纯 Linux 运行面](0058-standardize-development-and-runtime-tooling-on-linux.md) · [统一测试与 CI 架构](0060-unify-test-architecture-sandbox-and-ci-gate.md) · [上游优先技能与 AFK 工作流](0004-adopt-upstream-first-matt-skills.md) · [Sandcastle AFK 工作流](../agents/sandcastle-afk.md)
