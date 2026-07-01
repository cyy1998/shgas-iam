## Why

`user_profile` 读模型已经提供用户详情和搜索文档，但 `apps/api` 现有 user-info、用户搜索和 custom SSO 用户摘要仍走源表聚合，读路径复杂且难以承载后续 DSL 检索。现在需要把 API 层用户资料读取切到 CQRS read model，同时保留认证边界的快速失效能力。

## What Changes

- 将 `apps/api` 的用户详情查询、public/internal 用户搜索和 custom SSO 用户摘要读取切换为 `UserProfileQueryService`。
- 保留用户启停、软删除、会话撤销、client 状态、密码验证、手机号验证码和写操作的源表/实时校验路径；允许 profile 返回旧数据，但认证授权结果必须由 live boundary 决定。
- 精简 `apps/api` 中 user 相关 live repository/port 依赖：profile 已承接的用户详情聚合和搜索不再依赖源表 repository，live repository 只保留认证边界、敏感校验和写操作所需方法。
- 为 `apps/api` 增加内部 DSL 用户搜索入口，限制为 internal API 使用，并要求 employment 条件必须显式 nested。
- 保持旧 `UserQueryDto` 接口行为兼容，旧搜索入参继续编译为同一 employment 元素内匹配的语义。
- 当 profile 缺失、schema version 不匹配或不可见时，API 读路径不 fallback 到源表，按未找到或未登录语义处理。
- 不向 public/open/internal 响应暴露 `profile_schema_version`、`rebuilt_at` 或 worker 状态。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `user-profile-read-model`: 将已存在的 query service 从“待后续接入”改为 `apps/api` 用户资料读路径的实际读取来源，并定义 internal DSL 搜索限制。
- `directory-and-self-service`: public/open/internal 用户详情与用户搜索读取改为 profile；手机号、密码、供应商注册等写操作和敏感校验继续使用源表，并精简 API live user repository 依赖面。
- `authentication-sessions`: custom SSO 局部会话和网关鉴权继续实时校验会话、用户和 client 状态，但返回给客户端的用户摘要/详情从 profile 读取，不再把 Redis payload 快照作为用户资料权威来源。
- `privilege-delegation`: `/internal/users/search-with-delegation` 的用户列表改用 profile 搜索，权限委托查询仍使用 live delegation 数据。
- `app-env-contracts`: API env 增加 user-profile DSL 检索限制配置，保持 `IAM_API_*` 前缀和集中解析边界。

## Impact

- Affected code: `apps/api/src/services/user`、`apps/api/src/services/user/user.repository.ts`、`apps/api/src/routes/public`、`apps/api/src/routes/open`、`apps/api/src/routes/internal`、`apps/api/src/routes/auth`、`apps/api/src/composition`、`apps/api/src/env.ts`。
- Affected packages: `packages/domain` 或 `apps/api` 中的 DSL DTO/schema、`packages/db` 只消费既有 `user_profile` schema，不新增表。
- Affected APIs: `/public/user-info`、`/open/users/userInfo`、public/internal 用户搜索、`/internal/users/search-with-delegation`、`/auth/authz`、`/sso/token`，新增 internal-only DSL 搜索接口。
- Operational impact: profile 异步更新期间 API 可返回旧展示数据；账号禁用、删除、会话撤销和 client 维护状态仍需快速生效。
