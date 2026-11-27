---
status: accepted
---

# 采用原生 Sandcastle SDK 构建单目录 AFK 编排

本仓库在纯 Linux 运行面（[ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md)）下需要一套轻量、可维护的无人值守编码编排器：自动接手维护者批准的 GitHub Spec 及子票，在隔离容器中并行实施、集中双轴评审、修复验证，最终推送特性分支并创建 Pull Request 等待人工审阅合并。

决定基于零补丁的 `@ai-hero/sandcastle@0.14.0`（或更高稳定版）与原生 `docker()` 沙箱，将 AFK 编排统一收拢在 `.sandcastle/` 目录内，以 **Git 与 GitHub 作为唯二持久事实来源**，按“流程编排（`.sandcastle/afk.ts`）+ GitHub/Git 基础模块（`github.ts`、`git.ts`）+ 本仓装配（`session.ts`、`run.mts`、`smoke.mts`）”组织实现。

> _Contradicts [ADR-0004](0004-adopt-upstream-first-matt-skills.md) (`采用上游工作流与仓库薄适配`) — 取代其中 AFK 以 GitHub Projects `Status` 同步进度、启动前要求调用分支与远端零偏差对齐以及跨 Spec 依赖核验 PR `mergeCommit` 的条款；改用 `needs-attention` 标签与暂停评论、`origin/<base>` 与 `merge-base` 动态基线，以及以 `CLOSED` 判定外部前置完成。_

本决定同步结束 [ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md) 中过渡保留的 Sandcastle 补丁条款，并在 [ADR-0060](0060-unify-test-architecture-sandbox-and-ci-gate.md#收集分层与根工具链)“根工具链通常采用一次性验证”的前提下，为 `.sandcastle/__tests__/boundaries.test.ts` 保留窄范围常驻边界单测。

## 核心架构与取舍

- **单目录自然分层**。全部 AFK 代码统一放在 `.sandcastle/`：[`afk.ts`](../../.sandcastle/afk.ts) 负责任务图推进、阶段调度、合并协调、评审、PR 交付及远端 `ci-gate` 等绿与限次修红；[`github.ts`](../../.sandcastle/github.ts) 封装有界懒加载 GraphQL、分支解析、暂停标注、幂等 PR 复用、`check-runs` 与失败日志读取及标签更新；[`git.ts`](../../.sandcastle/git.ts) 封装命令执行、凭据预检、远端校验、worktree 生命周期与合并提交核验；[`session.ts`](../../.sandcastle/session.ts) 负责本仓 Codex 角色加载（显式 `captureSessions: false`）、认证挂载与自洽的只读/可写无特权 Docker 会话装配；[`run.mts`](../../.sandcastle/run.mts) 与 [`smoke.mts`](../../.sandcastle/smoke.mts) 分别提供 CLI 入口与真实 Docker 冒烟。相比抽成独立 workspace package，单目录零构建链路、贴近上游布局，且流程与 Git/GitHub 模块保持零仓库依赖。
- **方案 X 无特权单容器与严格安全边界（已按 [ADR-0060](0060-unify-test-architecture-sandbox-and-ci-gate.md#方案-x单容器预装四件套与非-root-启动) 修订）**。可写阶段不再挂载 `/var/run/docker.sock`、不使用 `network: "host"`、不再维护宿主机 `.sandcastle/resources/run-*/registry.jsonl` 跨进程兄弟容器回收，改为在单容器开发镜像内预装精确版本 PostgreSQL / Redis / etcd / APISIX ，可写沙箱就绪时启动非 root 测试服务并注入专用端点；同时继续挂载宿主离线 pnpm store（单行 `onSandboxReady` 离线安装）与 `.sandcastle/cache/turbo`，经 `GIT_CONFIG_VALUE_0=.husky` 复用 `.husky/pre-commit`：
  - 永远只非强制推送精确 `<finalSha>:refs/heads/<specBranch>` 并建 PR，始终禁止推送 `main` 或基线分支，启动前校验远端 push/fetch URL 全部指向 `github.com/<repo>`；
  - GitHub 写凭据仅留宿主 `gh auth login`，启动沙箱前检查仓库根与目标工作树的 `.sandcastle/.env`（拒绝声明 `GH_TOKEN` / `GITHUB_TOKEN` 含空值）与 `.git/config`；
  - 只读双轴评审由 `createSession({ worktree, readonly: true })` 直接构造自洽只读沙箱，将全部挂载（含工作树与 `.git`）置为只读，仅挂单向只读认证文件，不挂 `pnpm-store` 与 Turbo 缓存；
  - Codex 显式关闭 `captureSessions`，同时支持 `CODEX_API_KEY` 与 `~/.codex/auth.json`（后者单向只读复制进容器，退出即删，不回写宿主文件；token 过期时由维护者在宿主重新登录）。
- **宿主独占工作树、票级并行与按需 Merger**。宿主通过 `git worktree` 统一管理 Spec 与子票工作树，SDK 始终以 `branchStrategy: { type: "head" }` 运行，避免双侧管理冲突。启动时 `git fetch <remote> <baseBranch>`，全程不读取也不改动本地当前 checkout，动态以 `git merge-base` 作为评审与已集成票基线。就绪子票按 `maxParallel`（默认 `4`）并发实施并只运行受影响范围的聚焦验证；主循环串行执行 `git merge --no-ff <ticketTip>` 并写入 `Sandcastle-Ticket: #<N>` trailer，仅遇真实合并冲突时中止合并并在 Spec 工作树启动最多 1 次 Merger Agent（`.sandcastle/prompts/merge.md`）解冲突、重跑聚焦验证并提交（核验 `--first-parent --merges` 历史中的合并提交与 trailer，兼容合并后的小修提交）。相比纯串行单沙箱，代价是保留票级工作树与按需 Merger，但换取独立切片的并发吞吐与基于 Git 合并历史的零状态断点恢复。
- **GitHub 原生元数据、轻推前门禁与极简远端 `ci-gate` 闭环**。固定采用 `type:spec`、`type:ticket`、`ready-for-agent`、`agent:light`、`agent:deep`、`needs-attention` 标签与原生 `subIssues` / `blockedBy` / `linkedBranches`（有界懒加载 GraphQL，检测分页溢出）。集成分支由 `linkedBranches`（经 `gh issue develop` 关联）确定，未关联时默认 `sandcastle/spec-<N>`。全部 `OPEN` 子票集成完成后，并发执行双轴只读评审与单次可写 `repair-and-verify`（权威验证已交由 GitHub Actions CI，推 PR 前本地门禁收敛为轻量 `pnpm check`），按固定顺序非强制推送精确 SHA 并幂等复用或创建 PR（补齐 `Closes #<N>`）：
  - 传入 `--draft` 时推完 Draft PR 即摘除 `ready-for-agent`、清理工作树并交付给人类，不占用 `flock` 挂等转 Ready；
  - 正常 Ready PR 暂留 `specWorktree` 与 `ready-for-agent`，按 **`check_run.head_sha === finalSha && name === 'ci-gate'`** 轮询（默认间隔 30s、单轮总超时 45min），持续核验授权与 PR 状态；`ci-gate` 失败且未超上限（默认 2 次）时拉取绑定当前 run 的脱敏失败尾部日志（约 200 行）唤醒 `repair` 沙箱修复并重推新 `finalSha`；超过上限、超时或环境/冲突阻塞时保留现场、打 `needs-attention` 并评论原因；未绿灯前进程中断后重启可凭“全票已集成 + Open PR 已存在”天然续接当前 `headSha`；确认 `ci-gate` 绿灯后正式摘除子票与父 Spec 的 `ready-for-agent` 并清理 `specWorktree`；过期分支统一由 GitHub Branch Protection（`Require branches to be up to date`）拦截。
- **外部互斥**。根脚本通过 `flock -n .sandcastle/runner.lock` 保证单实例互斥；容器退出后临时进程随单容器自动消亡，无需跨进程宿主 Docker 清理。

## 验证与文档影响

- **窄范围常驻单测与真实冒烟**。`pnpm test:unit:sandcastle`（纳入 `pnpm test:unit` 与 `pnpm verify`）通过 [`.sandcastle/__tests__/boundaries.test.ts`](../../.sandcastle/__tests__/boundaries.test.ts) 守卫核心边界（GraphQL 过滤与分页溢出、`linkedBranches`、Spec 完整范围判据、凭据预检、远端 URL 与精确 Git ref、只读与无 `docker.sock` 挂载隔离、远端 `ci-gate` `head_sha` 轮询/修红上限/脱敏日志/断线续接）；端到端单容器无特权行为由真实 Docker `pnpm sandcastle:smoke` 验证。
- **文档与词表范围**。同步维护 [Sandcastle AFK 工作流](../agents/sandcastle-afk.md)、[GitHub 议题跟踪](../agents/issue-tracker.md)、[AFK 运维手册](../../.sandcastle/README.md)、[测试与验证](../engineering/testing.md) 与 [仓库地图](../engineering/repository-map.md)；本决策属工程编排基础设施，不涉及 IAM 业务领域概念，不修改 `GLOSSARY.md`。

[纯 Linux 运行面](0058-standardize-development-and-runtime-tooling-on-linux.md) · [统一测试与 CI 架构](0060-unify-test-architecture-sandbox-and-ci-gate.md) · [上游优先技能与 AFK 工作流](0004-adopt-upstream-first-matt-skills.md)
