# Docker pnpm store 共享缓存交付记录

Workflow-Version: 2
Feature-Slug: docker-pnpm-store-cache
Workflow-Kind: quick
Stage: delivered
Feature-Branch: codex/quick-docker-pnpm-store-cache
Target-Branch: main
Target-Base: f700cba85212523e3a60ae374e64f4d1e50e791f
Ticketing-Authorization: not-applicable
Implementation-Authorization: granted
Authorized-Implementation-Scope: 为所有应用 Dockerfile 的 pnpm 依赖操作增加共享 BuildKit store cache，信任已提交 lockfile，并移除后端 legacy deploy 的在线解析路径
Current-Ticket: none
Current-Ticket-Base: none
Change-Types: agent-config,code,dependencies,frontend
Affected-Workspaces: @iam/admin,@iam/admin-api,@iam/api,@iam/oidc-provider,@iam/sso,@iam/worker
Validation-Plan: declared
Content-Head: 1cbf028516194f08dd8e43a861e96259758df98b
Verified-Content-Head: 1cbf028516194f08dd8e43a861e96259758df98b
Reviewed-Content-Head: 1cbf028516194f08dd8e43a861e96259758df98b
Merge-Target-Tip: f700cba85212523e3a60ae374e64f4d1e50e791f
Final-Squash-Commit: 8d7cb10027c58d2d442f37fcf7eeb1f0d62a618a

## 范围与验收

- [x] 六个应用 Dockerfile 的 pnpm 安装阶段挂载同一个 BuildKit pnpm store cache。
- [x] 后端应用的 `pnpm deploy` 阶段复用同一个 BuildKit pnpm store cache。
- [x] 完整 `docker compose build` 成功完成。
- [x] 强制重跑 API deps stage 时复用 store 中的依赖，不重复下载已有包。
- [x] workspace 启用 `trustLockfile: true` 后，API deps 重跑跳过全 lockfile 供应链策略校验。
- [x] 四个后端 Dockerfile 使用命令级 injected workspace packages 和新版 `pnpm deploy`，不再传入 `--legacy`。
- [x] API builder 使用 dedicated deploy lockfile 完成离线 store 复用，不再进入 legacy 共享 lockfile 在线解析路径。

## Validation Plan

| Scope | Change-Types | Affected-Workspaces | Required-Commands |
|---|---|---|---|
| feature | agent-config,code,dependencies,frontend | @iam/admin,@iam/admin-api,@iam/api,@iam/oidc-provider,@iam/sso,@iam/worker | `pnpm install --frozen-lockfile`<br>`pnpm lint`<br>`pnpm typecheck`<br>`pnpm test`<br>`pnpm build`<br>`pnpm check:docs`<br>`pnpm check:workflow`<br>`pnpm --filter @iam/admin e2e`<br>`pnpm --filter @iam/sso e2e`<br>`docker compose -f docker/docker-compose-dev.yml build`<br>`docker buildx build --progress plain --target deps -f apps/api/Dockerfile .`<br>`docker buildx build --progress plain --target builder -f apps/api/Dockerfile .`<br>`git diff --check` |

## 阶段证据

- `G1 Branch Ready` — 已从 `main` 的固定基线创建快速改动分支，实施范围、验收条件与验证计划已声明。
- `G4 Implementing` — 已创建共享 BuildKit pnpm store cache 候选提交；Content-Head: `c00c109e0510bc2b6502e0708cd246617f8378e5`；完整 Compose 构建与依赖层失效后的 store 复用探针通过。
- `G4 Implementing` — 根据用户后续授权启用 `trustLockfile: true` 并创建扩展候选提交；Content-Head: `1be2f86a80366f1b7187a488c20cca6fe6fe238b`；API deps 重跑复用 84 个包、downloaded 0，install 从约 115 秒降至 2.4 秒且不再执行全 lockfile 策略校验。
- `G4 Implementing` — 四个后端镜像已切换到命令级 injected workspace packages 和 dedicated deploy；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；API builder deploy 复用 91 个包、downloaded 0，2.7 秒完成且无 legacy 警告。
- `G5 Feature Verified` — Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；完整验证矩阵通过，最终 Standards 与 Spec 双轴评审清零。
- `G6 Merge Ready` — target tip 仍为 `f700cba85212523e3a60ae374e64f4d1e50e791f`；content、verified 与 reviewed head 一致，等待维护者授权本地 squash 事务。

## 验证记录

- `docker compose -f docker/docker-compose-dev.yml build` — passed；Content-Head: `c00c109e0510bc2b6502e0708cd246617f8378e5`；7 个应用镜像全部构建成功。
- `docker buildx build --progress plain --build-arg NO_PROXY=cache-probe.invalid --target deps -f apps/api/Dockerfile .` — passed；Content-Head: `c00c109e0510bc2b6502e0708cd246617f8378e5`；API deps 层失效后复用 84 个包且 downloaded 0。
- `pnpm lint` — passed；Content-Head: `c00c109e0510bc2b6502e0708cd246617f8378e5`；14 个 workspace task 通过，仅报告既有 frontend warnings。
- `pnpm typecheck` — passed；Content-Head: `c00c109e0510bc2b6502e0708cd246617f8378e5`；设置 TURBO_CONCURRENCY=1 后 14 个 workspace task 通过。
- `pnpm test` — passed；Content-Head: `c00c109e0510bc2b6502e0708cd246617f8378e5`；14 个 workspace task 与 101 个 workflow checker tests 通过。
- `pnpm build` — passed；Content-Head: `c00c109e0510bc2b6502e0708cd246617f8378e5`；Admin 与 SSO 生产构建通过。
- `pnpm check:docs` — passed；Content-Head: `c00c109e0510bc2b6502e0708cd246617f8378e5`；28 篇文档索引检查通过。
- `pnpm check:workflow` — passed；Content-Head: `c00c109e0510bc2b6502e0708cd246617f8378e5`；4 个 v2 feature 与 4 个 legacy feature 格式检查通过。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `c00c109e0510bc2b6502e0708cd246617f8378e5`；Chromium 2 条用例通过。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `c00c109e0510bc2b6502e0708cd246617f8378e5`；Chromium 2 条用例通过。
- `git diff --check` — passed；Content-Head: `c00c109e0510bc2b6502e0708cd246617f8378e5`；未发现 whitespace error。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `1be2f86a80366f1b7187a488c20cca6fe6fe238b`；15 个 workspace 已是最新状态，284ms 完成且跳过重复 lockfile 策略校验。
- `docker buildx build --progress plain --build-arg NO_PROXY=cache-probe-trust-lockfile.invalid --target deps -f apps/api/Dockerfile .` — passed；Content-Head: `1be2f86a80366f1b7187a488c20cca6fe6fe238b`；API install 复用 84 个包、downloaded 0，2.4 秒完成且无供应链策略校验阶段。
- `docker buildx build --progress plain --target builder -f apps/api/Dockerfile .` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；dedicated deploy 复用 91 个包、downloaded 0，2.7 秒完成且无 legacy 警告。
- `pnpm install --frozen-lockfile` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；15 个 workspace 已是最新状态，252ms 完成。
- `pnpm lint` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；14 个 workspace task 通过，仅报告既有 frontend warnings。
- `pnpm typecheck` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；设置 TURBO_CONCURRENCY=1 后 14 个 workspace task 通过。
- `pnpm test` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；14 个 workspace task 与 101 个 workflow checker tests 通过。
- `pnpm build` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；Admin 与 SSO 生产构建通过。
- `pnpm check:docs` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；28 篇文档索引检查通过。
- `pnpm check:workflow` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；4 个 v2 feature 与 4 个 legacy feature 格式检查通过。
- `pnpm --filter @iam/admin e2e` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；Chromium 2 条用例通过。
- `pnpm --filter @iam/sso e2e` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；Chromium 2 条用例通过。
- `docker compose --progress plain -f docker/docker-compose-dev.yml build` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；7 个镜像全部构建成功，四个后端 dedicated deploy 均 downloaded 0 且无 legacy 警告。
- `docker buildx build --progress plain --target deps -f apps/api/Dockerfile .` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；API deps 与 Corepack 层均命中 Docker layer cache。
- `git diff --check` — passed；Content-Head: `1cbf028516194f08dd8e43a861e96259758df98b`；未发现 whitespace error。

## 评审记录

- Feature — fixed point: `f700cba85212523e3a60ae374e64f4d1e50e791f`；reviewed head: `b9a2a171bb6bd7ca439d84c206a8fe98c90e1249`；Standards: passed；Spec: passed；两轴最终评审均无 finding。

## 授权记录

- 2026-07-19 — 用户明确要求为所有 Dockerfile 增加共享 BuildKit pnpm store cache；未授权 merge、push 或远端分支操作。
- 2026-07-19 — 用户在确认供应链校验耗时来源后明确授权启用 `trustLockfile: true` 并重新验证；未授权 merge、push 或远端分支操作。
- 2026-07-19 — 用户明确要求移除 legacy deploy 的在线解析路径；授权 4 个后端镜像切换到 injected workspace packages 新 deploy 实现，仍未授权 merge、push 或远端分支操作。

## Waivers

- 无。

## 重开与修复

- 无。

## Merge brief

- Feature branch: `codex/quick-docker-pnpm-store-cache`
- Target branch: `main`
- Target base: `f700cba85212523e3a60ae374e64f4d1e50e791f`
- Target tip: `f700cba85212523e3a60ae374e64f4d1e50e791f`
- Content head: `1cbf028516194f08dd8e43a861e96259758df98b`
- Verified content head: `1cbf028516194f08dd8e43a861e96259758df98b`
- Reviewed content head: `1cbf028516194f08dd8e43a861e96259758df98b`
- Delivery summary: 六个应用 Dockerfile 共享 BuildKit pnpm v11 store cache，workspace 信任已提交 lockfile，四个后端使用命令级 injected workspace packages 和 dedicated deploy，移除 legacy 在线解析路径且不改变本地 workspace 默认语义。
- Commit range: `f700cba85212523e3a60ae374e64f4d1e50e791f...1cbf028516194f08dd8e43a861e96259758df98b`
- Validation: passed
- Review: passed
- Waivers and risks: `trustLockfile: true` 依赖仓库 lockfile 受信任；无 waiver。
- Local transaction:
  1. 再次确认 `main` tip 仍为 `f700cba85212523e3a60ae374e64f4d1e50e791f`，若变化则停止。
  2. 切换到 `main`，对 `codex/quick-docker-pnpm-store-cache` 执行 `git merge --squash`，创建一个 focused delivery commit。
  3. 将最终 squash SHA 回填到交付记录，创建 tracker-only 元数据提交。
  4. 运行 `pnpm check:workflow`、`pnpm check:docs` 与 `git diff --check`，确认最终字段已全部回填。
  5. 删除本地功能分支 `codex/quick-docker-pnpm-store-cache`。

## Delivery receipt

- Target branch: `main`
- Squash commit: `8d7cb10027c58d2d442f37fcf7eeb1f0d62a618a`
- Tracker metadata: planned
- Final checks:
  - `pnpm check:workflow` — passed
  - `pnpm check:docs` — passed
  - `git diff --check` — passed
- Local feature branch: deleted
