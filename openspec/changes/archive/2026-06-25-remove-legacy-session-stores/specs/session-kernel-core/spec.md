## MODIFIED Requirements

### Requirement: Session Kernel Core 提供稳定公共模块
系统 SHALL 在 `@iam/api-core/session/kernel` 提供协议无关 Session Kernel Core。`@iam/api-core/session` SHALL NOT 继续作为 legacy Redis authority helper 的生产导出入口。

#### Scenario: Kernel 子模块可被后续 adapter 引用
- **WHEN** custom SSO、OIDC 或 admin revoke adapter 从 `@iam/api-core/session/kernel` 导入 Kernel 类型和工厂函数
- **THEN** package exports SHALL 提供 `./session/kernel` 子路径
- **AND** 子路径 SHALL 导出 Kernel public API

#### Scenario: legacy session helper 不再作为生产 API
- **WHEN** 生产代码需要创建、解析、续期或撤销 IAM 会话状态
- **THEN** 生产代码 SHALL 使用 `@iam/api-core/session/kernel` 或 app-local Session Kernel adapter
- **AND** 生产代码 SHALL NOT 从 `@iam/api-core/session` 导入 `createGlobalSession`、`readGlobalSession`、`writeLocalSession`、`readValidatedLocalSessionUser` 或 `removeGlobalSession`
- **AND** `@iam/api-core/session` 根子路径 SHALL 被移除、收窄为 Kernel-only 兼容入口，或以其他方式确保 legacy helper import 在 typecheck 中暴露

#### Scenario: Kernel 不依赖 app-local 运行时
- **WHEN** Kernel Core 编译
- **THEN** Kernel Core SHALL NOT import Hono、Koa、`@iam/db`、Drizzle schema、app-local service、route、middleware、audit writer 或协议库类型
- **AND** Kernel Core SHALL 通过依赖注入接收 Redis、clock、logger、validation hooks 和 cleanup adapters

## ADDED Requirements

### Requirement: api-core legacy auth helper 不得保留旧会话解析路径
`@iam/api-core/middlewares` SHALL 保留 internal client authentication 能力，但 SHALL NOT 继续提供读取 legacy Redis session envelope 的 public/admin authentication helper 作为生产路径。

#### Scenario: Internal client authentication 保持可用
- **WHEN** `apps/api` 或其他后端 app 需要校验 internal client secret
- **THEN** `verifyInternalClient` 和 `createInternalAuthenticationHandler` SHALL 保持可用
- **AND** 其行为 SHALL 继续校验 client 存在、未删除且状态启用

#### Scenario: public/admin legacy session middleware 被移除
- **WHEN** 生产代码需要 public 或 admin 用户会话鉴权
- **THEN** 生产代码 SHALL 使用 app-local Session Kernel-backed authentication handler
- **AND** `@iam/api-core/middlewares` SHALL NOT 提供会读取 `global_session:*` 或 `local_*_session:*` legacy Redis key 的 public/admin authentication helper
