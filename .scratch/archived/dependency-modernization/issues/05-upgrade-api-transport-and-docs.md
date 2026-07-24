# 05 — 升级 API transport 与文档依赖

**What to build:** 让 REST、OpenAPI、tRPC 和 API reference 在目标 Hono 生态版本上保持现有 contract，使 API、Admin API、worker 和共享 packages 能在不改变调用方协议的情况下使用当前依赖。

**Blocked by:** 04 — 采用稳定 TypeScript 7 双轨工具链.

**Status:** resolved

- [x] 所有直接 Hono 依赖统一到 4.12.30，`@hono/zod-openapi` 统一到 1.5.1。
- [x] `@trpc/client` 与 `@trpc/server` 统一到 11.18.0，Admin 与 Admin API 的端到端类型契约继续成立。
- [x] `@scalar/hono-api-reference` 统一到 0.11.11，并完成 0.x API 差异所需的最小兼容迁移。
- [x] API 与 Admin API 的 route、OpenAPI schema、错误 envelope 和 tRPC 行为测试通过，外部 HTTP/tRPC contract 没有变化。
- [x] API reference 的 HTTP smoke 证明页面与 schema 资源可访问，不以模块可导入替代真实 route 验证。
- [x] worker 和共享 Hono consumers 继续启动或通过对应入口 smoke，没有保留同名直接依赖的旧版本。
- [x] 所有受影响 workspaces 的测试、lint、typecheck 和 build 通过；frozen-lockfile 安装和 diff check 通过。

## Resolution evidence

- Final squash commit: `fbfe426807fc576ade42e554b734b1b47c572cf8`.
- 实现提交：`c3d5d3e5b291084505bcc6b9c4f45697090aa0da`。
- 新增 API 与 Admin API 的真实 HTTP smoke，覆盖 Scalar 页面、OpenAPI 3.1 schema 和本地浏览器 bundle；worker dashboard/health HTTP smoke 通过。
- `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build`、受影响 workspace 测试以及 `pnpm install --frozen-lockfile` 全部通过；`git diff --check` 无错误。
- 直接依赖审计确认 Hono 4.12.30、`@hono/zod-openapi` 1.5.1、tRPC 11.18.0、Scalar 0.11.11；锁文件中的 Hono 4.12.23 仅由 `@utoo/pack` 传递引入。
- Standards 与 Spec 双轴评审均为 zero findings。
