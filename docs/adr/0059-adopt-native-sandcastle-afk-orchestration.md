---
status: accepted
---

# 采用原生 Sandcastle SDK 构建单目录 AFK 编排

本仓库在纯 Linux 运行面（[ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md)）下需要一套轻量、可维护的无人值守编码编排器：自动接手维护者批准的 GitHub Spec 及子票，在隔离容器中并行实施、集中双轴评审、修复验证，最终推送特性分支并创建 Pull Request 等待人工审阅合并。

决定基于零补丁的 `@ai-hero/sandcastle@0.14.0`（或更高稳定版）与原生 `docker()` 沙箱，将 AFK 编排统一收拢在 `.sandcastle/` 目录内，以 **Git 与 GitHub 作为唯二持久事实来源**，按“纯流程编排（`.sandcastle/afk.ts`）+ 本仓装配（`.sandcastle/session.ts`、`run.mts`、`smoke.mts`）”组织实现。

> _Contradicts [ADR-0004](0004-adopt-upstream-first-matt-skills.md) (`采用上游工作流与仓库薄适配`) — 取代其中 AFK 以 GitHub Projects `Status` 同步进度、启动前要求调用分支与远端零偏差对齐以及跨 Spec 依赖核验 PR `mergeCommit` 的条款；改用 `needs-attention` 标签与暂停评论、`origin/<base>` 与 `merge-base` 动态基线，以及以 `CLOSED` 判定外部前置完成。_

本决定同步结束 [ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md) 中过渡保留的 Sandcastle 补丁条款，并在 [ADR-0009](0009-adopt-canonical-test-collections.md#收集检查与-root-工具链)“根工具链通常采用一次性验证”的前提下，为 `.sandcastle/__tests__/boundaries.test.ts` 保留窄范围常驻边界单测。

## 核心架构与取舍

- **单目录自然分层**。全部 AFK 代码统一放在 `.sandcastle/`：[`afk.ts`](../../.sandcastle/afk.ts) 仅依赖 `node:*` 与 `@ai-hero/sandcastle`，承载任务图、工作树调度、合并、评审与交付主流程；[`session.ts`](../../.sandcastle/session.ts) 负责本仓 Codex 角色加载、认证挂载、Docker 参数与测试资源清理；[`run.mts`](../../.sandcastle/run.mts) 与 [`smoke.mts`](../../.sandcastle/smoke.mts) 分别提供 CLI 入口与真实 Docker 冒烟。相比抽成独立 workspace package，单目录零构建链路、更贴近上游布局，且 `afk.ts` 依然保持零仓库依赖。
- **原生 `docker()` 与诚实安全边界**。可写阶段使用原生 `docker({ mounts, groups, network: "host" })` 挂载 `/var/run/docker.sock`、宿主 `~/.pnpm-store`（配合 `--prefer-offline` 离线安装）与 `.sandcastle/cache/turbo`（跨次复用 Turbo 缓存），使沙箱能直接运行本仓真实 PostgreSQL / Redis / APISIX 集成与 E2E 测试。其边界定位是**工具链固定、GitHub 写凭据隔离与不污染本地 `main`**（而非多租户对抗恶意容器隔离）：
  - 永远只非强制推送精确 `<finalSha>:refs/heads/<specBranch>` 并建 PR，始终禁止推送 `main` 或基线分支，启动前校验远端 push/fetch URL 全部指向 `github.com/<repo>`；
  - GitHub 写凭据仅留宿主 `gh auth login`，启动沙箱前检查仓库根与目标工作树的 `.sandcastle/.env`（拒绝声明 `GH_TOKEN` / `GITHUB_TOKEN` 含空值）与 `.git/config`；
  - 只读双轴评审使用 `readonlySandbox()` 将工作树与 `.git` 置为只读，仅挂单向只读认证文件，不挂 `docker.sock`、`pnpm-store`、Turbo 缓存与 Docker registry；
  - Codex 同时支持 `CODEX_API_KEY` 与 `~/.codex/auth.json`（后者单向只读复制进容器，退出即删，不回写宿主文件；token 过期时由维护者在宿主重新登录）。
- **宿主独占工作树、票级并行与按需 Merger**。宿主通过 `git worktree` 统一管理 Spec 与子票工作树，SDK 始终以 `branchStrategy: { type: "head" }` 运行，避免双侧管理冲突。启动时 `git fetch <remote> <baseBranch>`，全程不读取也不改动本地当前 checkout，动态以 `git merge-base` 作为评审与已集成票基线。就绪子票按 `maxParallel`（默认 `4`）并发实施，在主循环内串行执行 `git merge --no-ff <ticketTip>` 并写入 `Sandcastle-Ticket: #<N>` trailer；仅遇真实合并冲突时中止合并，并在 Spec 工作树启动最多 1 次 Merger Agent（`.sandcastle/prompts/merge.md`）解冲突、重跑受影响验证并提交。相比纯串行单沙箱，代价是保留票级工作树与按需 Merger，但换取独立切片的并发吞吐与基于 Git 合并历史的零状态断点恢复。
- **GitHub 原生元数据与有序交付**。固定采用 `type:spec`、`type:ticket`、`ready-for-agent`、`agent:light`、`agent:deep`、`needs-attention` 标签与原生 `subIssues` / `blockedBy` / `linkedBranches`（有界懒加载 GraphQL，检测分页溢出）。集成分支由 `linkedBranches`（经 `gh issue develop` 关联）确定，未关联时默认 `sandcastle/spec-<N>`。全部 `OPEN` 子票集成完成后，并发执行双轴只读评审与单次可写 `repair-and-verify`，按“非强制推送 → 幂等复用或创建 PR（补齐 `Closes #<N>`）→ 移子票标签 → 清理 Spec 工作树 → 移父 Spec 标签”的固定顺序收尾；异常暂停时添加 `needs-attention` 与原因评论并保留现场。
- **外部互斥与资源回收**。根脚本通过 `flock -n .sandcastle/runner.lock` 保证单实例互斥；可写阶段挂载独立 `.sandcastle/resources/run-*/registry.jsonl`，清理前以 `docker inspect <sandboxId>` 确认容器明确处于停止或已移除状态，再按 registry 回收测试资源并删除空目录。

## 验证与文档影响

- **窄范围常驻单测与真实冒烟**。`pnpm test:unit:sandcastle`（纳入 `pnpm test:unit` 与 `pnpm verify`）通过 [`.sandcastle/__tests__/boundaries.test.ts`](../../.sandcastle/__tests__/boundaries.test.ts) 守卫核心边界（GraphQL 过滤与分页溢出、`linkedBranches`、Spec 完整范围判据、凭据预检、远端 URL 与精确 Git ref、只读挂载隔离与 `docker inspect` 停机校验）；端到端容器行为由真实 Docker `pnpm sandcastle:smoke` 验证。
- **文档与词表范围**。同步维护 [Sandcastle AFK 工作流](../agents/sandcastle-afk.md)、[GitHub 议题跟踪](../agents/issue-tracker.md)、[AFK 运维手册](../../.sandcastle/README.md)、[测试与验证](../engineering/testing.md) 与 [仓库地图](../engineering/repository-map.md)；本决策属工程编排基础设施，不涉及 IAM 业务领域概念，不修改 `GLOSSARY.md`。

[纯 Linux 运行面](0058-standardize-development-and-runtime-tooling-on-linux.md) · [测试集合规范](0009-adopt-canonical-test-collections.md) · [上游优先技能与 AFK 工作流](0004-adopt-upstream-first-matt-skills.md)
