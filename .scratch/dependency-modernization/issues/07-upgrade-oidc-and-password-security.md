# 07 — 升级 OIDC 与密码安全依赖

**What to build:** 让密码校验、密码更新和 OIDC provider 在当前安全依赖上保持既有认证语义，确保已有用户散列、登录交互、授权快照和 token 流程不会因 major 更新失效。

**Blocked by:** 06 — 升级 Redis、队列与 Bull Board.

**Status:** resolved

- [x] 所有直接 `bcrypt-ts` 依赖统一到 9.0.1，OIDC provider 更新到 9.9.1，tsx 更新到 4.23.1。
- [x] 认证行为测试覆盖已有密码散列验证、新散列 round-trip、错误密码拒绝和密码更新，不依赖库内部 helper 断言。
- [x] OIDC 的 interaction、session、Redis adapter、claim、client 范围和错误路径测试通过，外部 OIDC contract 与 token/claim 形状不变。
- [x] 所有使用 bcrypt 的 API、Admin API、OIDC 与共享认证逻辑都解析目标 major，没有旧 major 并存或临时 compatibility wrapper。
- [x] 运行时启动/入口 smoke 证明 tsx 与 OIDC provider 的 module loading、配置读取和服务启动保持有效。
- [x] 受影响 workspaces 的完整测试、lint、typecheck 和 build 通过；frozen-lockfile 安装和 diff check 通过。

## Resolution evidence

- 实现提交：`dc5ee87ca3bdb3635ee54a06885531c6ddf324c2`。
- 直接依赖审计确认 bcrypt-ts 9.0.1、oidc-provider 9.9.1、tsx 4.23.1，锁文件无旧目标版本。
- API 行为测试使用生产 runtime password-hasher 完成 bcrypt-ts 8 历史散列校验、错误密码拒绝、密码更新、新密码通过与旧密码失效；共享 bcrypt 新散列 round-trip 也通过。
- OIDC 21 个测试文件、80 条测试通过，覆盖 interaction、session、Redis adapter、claims、client 范围、token/error 路径。
- 新增子进程入口 smoke，真实执行 `node --import tsx src/index.ts`、解析环境、构建 composition、启动 HTTP server 并请求 discovery。
- `pnpm test`、`pnpm build`、受影响 workspace lint/typecheck/test、`pnpm install --frozen-lockfile` 和 `git diff --check` 全部通过。
- Spec 初审的两项缺口已修复，最终 Standards 与 Spec 复审均为 zero findings。
