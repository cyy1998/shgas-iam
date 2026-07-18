# 06 — 升级 Redis、队列与 Bull Board

**What to build:** 让 Redis adapters、queue producers/processors 和 Bull Board dashboard 在目标依赖版本上继续处理相同任务与状态，使后台任务和运维入口在升级后保持可用。

**Blocked by:** 05 — 升级 API transport 与文档依赖.

**Status:** resolved

- [x] 所有直接 ioredis 依赖统一到 5.11.1，BullMQ 更新到 5.80.6，`@bull-board/api` 与 `@bull-board/hono` 更新到 8.1.2。
- [x] queue producer、processor、retry/failure 和 Redis adapter 的现有行为测试通过，job payload、queue 名称和处理语义没有变化。
- [x] Bull Board 的 Hono 集成与 dashboard route 通过实际 HTTP/入口 smoke，不以依赖安装成功替代运行验证。
- [x] OIDC、API、Admin API、worker、API core 与 jobs 等 Redis consumers 均解析目标 ioredis 版本并通过受影响测试。
- [x] 仅针对旧 Bull Board 8.0.2 的 release-age 例外被删除；如目标版本仍确需例外，理由和精确目标已重新记录。
- [x] 受影响 workspaces 的测试、lint、typecheck 和 build 通过；frozen-lockfile 安装和 diff check 通过。

## Resolution evidence

- 实现提交：`8140a78b5c694387fd6eb07869fa0d33cc2f7e16`。
- 直接依赖审计确认 ioredis 5.11.1、BullMQ 5.80.6、Bull Board API/Hono/UI 8.1.2；重新解析传递依赖后安装包净减少 5 个。
- 新增通过 Basic Auth 后获取 Bull Board HTML 的真实 Hono HTTP smoke；既有 queue producer/worker、retry 默认值、Redis adapter 与 OIDC 测试全部通过。
- `pnpm test`、`pnpm build`、7 个受影响 workspace 的 lint/typecheck/test、`pnpm install --frozen-lockfile` 和 `git diff --check` 全部通过。
- 删除 Bull Board 8.0.2 的三条 release-age 例外；目标版本无需新例外。
- Standards 初审的测试夹具重复判断项已修复，最终 Standards 与 Spec 复审均为 zero findings。
