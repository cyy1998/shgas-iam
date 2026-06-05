## Why

`apps/api` 和 `apps/admin-api` 已经共享 Bun + Hono + `@iam/api-core` 的后端基础，但入口、基础设施、middleware 和 route 命名规则存在局部不一致，导致新增后端代码时需要靠记忆判断应该放在哪里。现在先统一低风险结构约定，可以减少维护噪音，并为后续更深层的领域抽象收敛留下清晰边界。

## What Changes

- 统一两个后端的 logger 放置方式：app 入口只装配 logger，logger singleton 放在 app-local `src/lib/logger/index.ts`。
- 统一 admin 认证 middleware 的结构：tier `_middleware.ts` 只负责装配，认证 handler 定义迁移到 app-local `src/middlewares/authentication.handler.ts`。
- 统一后端入口、配置文件和 lint 配置风格，包括 `src/index.ts` 中 env 命名、`tsconfig.json` 的 `"types": ["bun"]` 与 `exclude: ["scripts"]`、`eslint.config.js` 的 `scripts/**` ignore。
- 统一 route 文件命名规则：REST-only route 使用 `*.handlers.ts`，REST + tRPC 共享 operation 使用 `*.adapter.ts` 和 `*.trpc.ts`，route type 文件统一为 `*.type.ts`。
- 清理或明确低价值占位目录与陈旧注释，避免结构约定被空目录或历史注释干扰。
- 不合并 `apps/api` 与 `apps/admin-api` 的业务 service/repository，不改变 API、tRPC、认证、审计或数据库行为。

## Capabilities

### New Capabilities
- `backend-structure-conventions`: 约束后端 app 的入口装配、基础设施 singleton、middleware 摆放、配置文件一致性和 route 命名规则。

### Modified Capabilities

## Impact

- 影响代码结构：`apps/api/src`、`apps/admin-api/src`、两个后端的 `tsconfig.json` 和 `eslint.config.js`。
- 影响 OpenSpec/docs：新增后端结构约定 spec，后续实现可同步更新 `AGENTS.md` 或附近项目文档中的约定。
- 不引入新的运行时依赖，不修改数据库 schema，不改变公开 REST/tRPC contract。
