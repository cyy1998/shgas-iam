# 01 — 统一 pnpm 11.14 与 Turbo 2.10

**What to build:** 让开发者、CI 和容器都使用同一个 pnpm 11.14.0，并让 Turbo 2.10.5 在该 package-manager 基线上继续可靠地编排全仓任务；建立升级前可复现的安装与验证基线，后续所有依赖 tickets 都从这里开始。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] 根 package-manager 声明、全部容器安装入口、开发说明和技术栈记录统一固定 pnpm 11.14.0，不再出现受版本控制的 pnpm 11.5.0 pin。
- [x] Turbo 更新到 2.10.5，现有 task graph、缓存输入输出和 workspace scripts 的可观察行为保持不变。
- [x] Node 运行时继续为 24.x，Bun pin 保持现状；本 ticket 不借 package-manager 更新扩大运行时迁移范围。
- [x] pnpm 11.14.0 能完成普通安装和 frozen-lockfile 安装，并能从根目录正确发现和过滤全部 workspaces。
- [x] 容器中的 Corepack/pnpm 安装路径至少通过目标 Node 24 环境的实际解析 smoke，证明得到的 pnpm 版本为 11.14.0。
- [x] 全仓 lint、typecheck、test 和 build 的升级前基线被执行并记录；任何既有失败与本 ticket 引入的失败已明确区分。
- [x] 锁文件只包含 pnpm/Turbo 基线及 pnpm 重新解析出的传递依赖更新，没有提前混入后续 ticket 的直接依赖目标。
- [x] 文档检查和 diff check 通过。

## Resolution

- Final squash commit: `pending`
- Reviewed implementation commit: `5d1f4c078c7810b0b47bc2877b78b9dbfbdfd686`
- Validation:
  - `pnpm install --frozen-lockfile` — passed before the upgrade with pnpm 11.5.0 and after the upgrade with pnpm 11.14.0.
  - `pnpm install` — passed with pnpm 11.14.0; a repeat normal install left `pnpm-lock.yaml` unchanged.
  - `pnpm --version` / `pnpm exec turbo --version` — resolved 11.14.0 / 2.10.5.
  - `pnpm -r list --depth -1 --json` / `pnpm --filter @iam/admin list --depth -1 --json` — discovered all 15 workspace projects and filtered Admin to one project.
  - Node 24 container Corepack smoke — `docker.xuanyuan.run/node:24.18.0-alpine` resolved Node v24.18.0 and pnpm 11.14.0.
  - `pnpm lint` — passed before and after the upgrade; the post-upgrade run executed all 14 tasks with Turbo 2.10.5 and no cache hits.
  - `pnpm typecheck` — passed before and after the upgrade; the post-upgrade run executed all 14 tasks with Turbo 2.10.5 and no cache hits.
  - `pnpm test` — passed before and after the upgrade; the post-upgrade run executed all 14 tasks with Turbo 2.10.5 and no cache hits.
  - `pnpm build` — passed before and after the upgrade; the post-upgrade run rebuilt Admin and SSO with Turbo 2.10.5 and no cache hits.
  - `pnpm check:docs` — passed (`28 docs indexed`).
  - `git diff --check` — passed.
- Review: Standards and Spec review passed with no unresolved findings. Standards recorded one non-blocking duplication/shotgun-surgery judgement for the six required Docker pins; centralizing the existing container base-stage structure is outside this ticket.
