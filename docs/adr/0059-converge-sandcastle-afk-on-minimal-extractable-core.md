---
status: accepted
---

# 收敛 Sandcastle AFK 至原生 SDK 与极简纯流程编排

在 [ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md) 将开发、测试与 AFK 编排运行面统一收敛为纯 Linux 后，围绕 `@ai-hero/sandcastle@0.12.0` 与跨平台兼容堆叠的第三方编译产物补丁、匿名卷/命名卷管理、`remount` 循环与中文评论反序列化状态机已失去存在前提；而后续尝试构建的“配置框架 + LLM Planner + 本地状态机”以及拆散为多层包外壳与 3,200+ 行重型校验/mock 测试的实现，也证明**把单人本地容器当成对抗性强隔离沙箱并提前构建跨仓框架**会引入大量人为复杂性。

决定将 `@ai-hero/sandcastle` 升级至 `0.14.0`（或更高稳定版）、**彻底移除第三方补丁包并保留无补丁原生 `docker()` 沙箱**，并将 AFK 编排直接收敛为**收拢在 `.sandcastle/` 内的极简纯流程编排**（单文件零仓库耦合编排器 `.sandcastle/afk.ts` + 本仓装配 `.sandcastle/session.ts` + 极薄 CLI `.sandcastle/run.mts`），仅保留 Git 与 GitHub 两处持久事实，删除提前抽象的 `scripts/sandcastle/` 包外壳、专属架构守卫特例与重型流程模拟单测。

> _Contradicts [ADR-0004](0004-adopt-upstream-first-matt-skills.md) (`采用上游工作流与仓库薄适配`) — 取代其中 AFK 以 GitHub Projects `Status` 列同步看板进度、启动前要求调用分支与远端零偏差对齐以及跨 Spec 依赖核验 PR `mergeCommit` / 历史 squash 的条款；改用 `needs-attention` 标签加暂停评论、`origin/<base>` 与 `merge-base` 动态基线，以及直接信任外部阻塞票 `CLOSED`。_

本决定同时修订 [ADR-0058](0058-standardize-development-and-runtime-tooling-on-linux.md) 中临时保留 `patches/@ai-hero__sandcastle@0.12.0.patch` 与 `workspace-dependencies.mts` 的过渡条款，并在 [ADR-0009](0009-adopt-canonical-test-collections.md#收集检查与-root-工具链)“根工具链不建常驻单测集合”的条款下仅保留**窄范围边界回归单测**（禁止重型流程模拟测试套件）。

## 原生 `docker()` 零补丁运行时与诚实安全边界

- **彻底移除 `patches/` 补丁包与卷重建机制**。升级至 `@ai-hero/sandcastle@0.14.0` 后，Codex `turn.failed` 流错误解析、`sandboxId` 暴露与 `.git` 控制路径只读保护（`protectGitControlFiles`）由上游原生提供。纯 Linux 下通过原生 `docker({ mounts, groups, network: "host" })` 挂载 `/var/run/docker.sock`、宿主 `~/.pnpm-store`（离线缓存，配合 `--prefer-offline`）与 `.sandcastle/cache/turbo`（跨次复用 Turbo 缓存）；彻底删除 `workspace-dependencies.mts`、卷追踪与 `remount` 循环，保留 `.sandcastle/Dockerfile` 固定 Agent 侧运行时与浏览器版本。
- **诚实界定 DooD 边界与两条硬底线**。可写阶段为了按本仓测试策略运行真实 PostgreSQL / Redis / APISIX Integration 与 E2E 测试，继续挂载宿主 `docker.sock` 与 `network: "host"`；其隔离目标是**工具链固定、GitHub 写凭据隔离与不污染本地 `main`**，而非多租户对抗恶意容器隔离。真正不可妥协的两条底线是：
  1. **永远只非强制推送特性分支并建 PR，绝不自动合入 `main`**（且启动前校验远端 `--push --all` URL 全部精确指向 `github.com/<repo>`）；
  2. **GitHub 写凭据只留宿主 `gh auth login`**（每次启动沙箱前检查仓库根与目标工作树的 `.sandcastle/.env`，拒绝声明 `GH_TOKEN` / `GITHUB_TOKEN` 含空值，同时拒绝 `.git/config` 内嵌凭据或 HTTP Authorization header）。
- **只读双轴评审与单向认证**。只读双轴评审阶段由 `readonlySandbox()` 将工作树与 `.git` 挂载统一置为 `readonly: true`，且不挂载 `docker.sock`、`pnpm-store`、Turbo 缓存与 Docker registry，不启用 `groups`、`network: "host"` 与可写 hooks。同时支持 `CODEX_API_KEY` 与本机 `~/.codex/auth.json` 两种 Codex 认证方式；`auth.json` 改为**单向只读复制到临时目录**，彻底删除宿主写回与并发写回锁（token 过期时维护者在宿主重新登录即可）。
- **外部内核排他锁与精确停机清理**。由外层 `flock -n .sandcastle/runner.lock` 保证单实例互斥。可写阶段挂载独立 `.sandcastle/resources/run-*/registry.jsonl`，清理前以 **`docker inspect <sandboxId>`** 精确确认容器已停止/移除（状态未知或仍在运行时保留 registry），确认停机后再按 registry 回收测试资源并删除空目录。

## `.sandcastle/` 单目录收拢与纯流程编排

- **收拢至 `.sandcastle/`，去框架化与去过早拆包**。删除 `scripts/sandcastle/` 目录及 `scripts/architecture-guard.ts` 中的 `sandcastle-core-dependency-boundary` 特例规则，所有 AFK 代码对标上游布局收拢在 `.sandcastle/`：
  - [`.sandcastle/afk.ts`](../../.sandcastle/afk.ts)：纯流程编排核心，仅依赖 `node:*` 与 `@ai-hero/sandcastle`、零仓库耦合，未来如确需抽成跨仓工具可直接单文件迁出；
  - [`.sandcastle/session.ts`](../../.sandcastle/session.ts)：本仓沙箱与角色装配（读取 `.codex/agents/*.toml`、单向 `auth.json`、Docker 挂载与 `docker inspect` 测试资源回收）；
  - [`.sandcastle/run.mts`](../../.sandcastle/run.mts) 与 [`.sandcastle/smoke.mts`](../../.sandcastle/smoke.mts)：极薄 CLI 入口与真实 Docker 冒烟（均单向复用 `session.ts` 与 `afk.ts`，无循环导入）；
  - [`.sandcastle/prompts/`](../../.sandcastle/prompts/)：本仓唯一一套 5 阶段模板（`implement`、`merge`、`review-standards`、`review-spec`、`repair-and-verify`），删除重复核心副本。
- **固定标签与原生 `linkedBranches` 元数据**。固定使用 `type:spec`、`type:ticket`、`ready-for-agent`、`agent:light`、`agent:deep`、`needs-attention`，不引入 LLM Planner、Explorer、GitHub Projects 看板或 assignee 认领。集成分支不再解析 Spec 正文，改用 GitHub 原生 `Issue.linkedBranches`（经 `gh issue develop` 关联，未关联时默认 `sandcastle/spec-<N>`，关联多个或与基线同名时报错暂停），彻底消除正文格式约定、Label 50 字符限制与全仓分支冲突扫描。

## 宿主独占工作树、按需 Merger 与零本地状态恢复

- **以 `origin/<base>` 与 `merge-base` 取代冻结调用分支**。启动时 `git fetch <remote> <baseBranch>`，全程不读取也不修改本地当前 checkout 与目标分支；评审与已集成票基线均由 `git merge-base <specBranch> <remote>/<baseBranch>` 动态推导。
- **有界懒加载 GraphQL**。先以 `issues(first: 50, states: OPEN, labels: ["type:spec", "ready-for-agent"])` 精确列出就绪 Spec 编号（跳过 `needs-attention`，不再预拉历史非就绪 Spec），再按编号懒加载单条 Spec 及其 `linkedBranches`、`subIssues`、`comments` 与 `blockedBy`（任一连接 `hasNextPage` 溢出即报错）。
- **宿主独占 worktree + 票级并行 + 按需 Merger Agent**。宿主统一管理 Spec 与 ticket 工作树生命周期（SDK 始终运行在 `branchStrategy: { type: "head" }`，彻底消除双重 worktree 管理冲突）。按 `maxParallel`（默认 `4`）并行派发无阻塞 `ready-for-agent` 子票（外部前置信任 `CLOSED`；派发新票前软检查 Spec 标签；复用已有票分支时核验全部已集成内部前置可见性）。单循环内每完成一张票即尝试宿主零冲突快速 `git merge --no-ff`（写 `Sandcastle-Ticket: #<N>` trailer）；**仅在真正冲突时**先 `git merge --abort`，参照 `$implement-spec` 直接在 Spec 工作树启动最多 **1 次 Merger Agent**（`merge.md`）解冲突、重跑受影响验证并提交（宿主核验双亲祖先与合并提交并确保 trailer 存在）。单票或 Merger 失败时不强杀其他在途独立票，待有效进度合入后给 Spec 添加 `needs-attention` 与暂停评论。
- **无缓存双轴只读评审、集中修复与有序幂等交付**。每轮无在途票时重新读取 Spec 以纳入运行中新增的 `ready-for-agent` 子票；全部完成后并发执行 2 个独立只读评审容器（`review-standards` + `review-spec`），再在 Spec 工作树运行单次可写 `repair-and-verify` 产出 `<pr-body>`（缺失时走宿主确定性回退模板）。**彻底删除 `review-cache.json` 与“发现已有 Open PR 跳过验证”的快路径**。交付前复核 Spec 仍获授权，随后按固定顺序执行：**非强制 `git push` 并核验远端 SHA → 复用已有 Open PR（并补齐缺失的 `Closes #<N>`）或创建新 PR → 移除子票 `ready-for-agent` → 清理 Spec 工作树（保留本地 Spec 分支 ref）→ 最后移除 Spec `ready-for-agent`**。

## 测试收敛与文档影响

- **窄范围常驻边界单测 + 真实 Docker Smoke**。`pnpm test:unit:sandcastle`（纳入 `pnpm test:unit` 与 `pnpm verify`）仅保留 `.sandcastle/__tests__/boundaries.test.ts` 聚焦覆盖 4 类真实高风险边界（GraphQL `ready-for-agent` 过滤 / 分页溢出 / `linkedBranches`、`.env` 与 `.git/config` 凭据预检 / `--push --all` / 精确 Git ref、`docker inspect` 停机核验与 registry 保留、单向只读 `auth.json` 与只读评审挂载隔离），禁止堆叠重型流程 mock 单测；端到端容器行为统一由真实 Docker `pnpm sandcastle:smoke` 验证。
- **文档与词表范围**。同步更新 [Sandcastle AFK 工作流](../agents/sandcastle-afk.md)、[GitHub 议题跟踪](../agents/issue-tracker.md)、[AFK 运维手册](../../.sandcastle/README.md)、[测试与验证](../engineering/testing.md)、[仓库地图](../engineering/repository-map.md) 与 [文档索引](../index.md)；本决策属于工程工具链编排，不涉及 IAM 业务领域概念，不修改 `GLOSSARY.md`。

[纯 Linux 运行面](0058-standardize-development-and-runtime-tooling-on-linux.md) · [测试集合规范](0009-adopt-canonical-test-collections.md) · [上游优先技能与 AFK 工作流](0004-adopt-upstream-first-matt-skills.md)
