## Context

`add-user-profile-read-model` 已经引入 `user_profile`、`user_profile_dirty`、profile builder、worker/backfill 和 `UserProfileQueryService`，但现有 `apps/api` 路由仍通过 `UserService` 聚合源表读取用户详情与搜索结果。后续搜索需要支持类似 ES 的 DSL 查询，因此本 change 只切换 API 读路径，不再扩展 profile 表结构或 dirty producer。

关键约束：

- 用户资料展示和搜索允许返回旧 profile 数据。
- 认证授权边界必须更快失效，不能因为 profile 旧而放行已禁用、删除、撤销或 client 不可用的请求。
- reset password、password check、mobile verification、set mobile、supplier registration 等敏感校验或写操作仍使用 live 源表。
- `user_profile` 缺失或 schema version 不匹配时不 fallback 到源表。

## Goals / Non-Goals

**Goals:**

- 将 `apps/api` 的 user detail 和 user search 读取来源切到 `UserProfileQueryService`。
- 让 public authentication middleware、custom SSO local session、`/auth/authz` 返回的用户详情/摘要来自 profile，同时先完成 live session/user/client 校验。
- 精简 `apps/api` user live repository/port 依赖面，使源表 repository 只服务认证边界、敏感校验和写操作。
- 新增 internal-only DSL 搜索接口，并对 limit 和 nested employment 语义做显式限制。
- 保持旧 `UserQueryDto` 接口响应和过滤语义兼容。
- 为切换路径补齐服务、handler、adapter 单元测试。

**Non-Goals:**

- 不切换 `apps/admin-api`、`apps/admin` 或 `apps/sso`。
- 不新增 profile 表字段、索引或 migration。
- 不在本 change 写入源表变更的 dirty producer；该部分由后续 `wire-profile-dirty-producers` 处理。
- 不开放 public DSL 搜索。
- 不改变旧用户搜索接口的外部入参语义。

## Decisions

### 1. `UserService` 继续作为 API facade，但读写依赖分离

`UserService` 对外保留现有 `getUserDetailById/getUserDetailByUsername/getUserDetailByMobile/getUserDetailByWxId/searchUsers/searchUsersWithPrivilegeDelegation` 方法，内部将详情和搜索委托给 `UserProfileQueryService`。

同时增加或暴露 live user 校验方法，供登录、reset password、custom SSO authz 和 public authentication 使用。典型调用顺序是先 live 校验用户仍启用且未删除，再读取 profile detail 作为返回数据。

切换完成后，API user live repository 不应再承担用户详情聚合或用户目录搜索职责。`searchUsers` 这类 profile 已替代的源表读方法应从 `UserServiceDeps`、权限委托 helper deps、composition wiring 和测试 fake 中移除；保留的 live 方法应以 identity lookup、availability check、password/mobile 校验和写操作为主。

备选方案是路由层直接注入 `UserProfileQueryService`，但这会让 profile 读取、live 边界和旧 service 行为分散到多个 handler。保留 facade 能减少 API 层改动面，也更容易测试。

### 2. custom SSO payload 不再作为用户资料权威来源

Session Kernel 仍负责 PrincipalSession、ClientBinding、IssuedCredential、tombstone 和 payload metadata 的一致性。local session payload 可以保留协议私有字段和兼容快照，但 `resolveLocalSessionUser`、`resolvePrincipalSessionUser` 和 `authorizeLocalSession` 必须在 live 校验通过后读取 profile detail。

profile 缺失或 schema 不匹配时，请求失败但不能仅因此撤销该用户全部 session；只有 live user/client/session 明确不可用时才撤销或 lazy revoke。

备选方案是让 local session payload 始终刷新为最新 profile。该方案会把 display 数据同步写回 Redis，增加额外一致性问题，并且不能替代 live auth boundary。

### 3. reset password 和登录 eligibility 继续使用 live 源表

`openService.resolveResetPasswordMobile` 不能复用切到 profile 后的 `getUserDetailByUsername`，需要使用 live user lookup 获取当前手机号。密码登录可用 profile detail 作为审计和 session 快照来源，但密码校验、用户启停/删除判断必须来自源表。

这样允许 `/public/user-info` 展示旧手机号，但不会允许旧手机号参与找回密码或登录资格判断。

### 4. DSL 只在 internal API 暴露，并限制查询形状

新增 `/internal/users/search-dsl`，请求包含 `filter` 和可选 `limit`。`filter` 使用既有 `UserProfileFilterDslSchema`，employment 字段必须位于 `{ nested: "employments" }` 内；`limit` 默认由服务端决定，上限由 `env.userProfile.dslMaxLimit` 控制。

旧 `/public/users/search` 和 `/internal/users/search` 仍接收 `UserQueryDto`，由 profile repository 编译为 nested employment 查询，不改变客户端行为。

### 5. 不暴露 profile 元数据

API 响应仍返回 `UserDetailDto` 或 `UserDto`。`profile_schema_version`、`rebuilt_at`、dirty status 和 worker state 只用于内部构建、观测和排障，不进入 public/open/internal 用户资料响应。

## Risks / Trade-offs

- [Risk] 切换后 profile 缺失会导致用户详情或 authz 失败。→ Mitigation: 上线前执行 backfill，并在实现中保持错误可观测；不做源表 fallback，避免掩盖读模型缺口。
- [Risk] dirty producer 尚未接入期间，源表变化不会自动刷新 profile。→ Mitigation: 本 change 明确接受旧 profile；生产切换应依赖初始 backfill 和后续 producer change。
- [Risk] authz 读取 profile 失败时如果误判为用户禁用，会错误撤销 session。→ Mitigation: live user unavailable 与 profile missing 使用不同错误路径，只有前者触发用户级 session revoke。
- [Risk] DSL 过宽会造成慢查询或大响应。→ Mitigation: internal-only、limit 上限、Zod 校验、employment nested 限制，并复用 `search_visible/profile_schema_version/search_doc` 索引条件。
- [Risk] 旧 search 和 DSL nested 语义混淆。→ Mitigation: 旧接口继续由 compiler 生成 nested 查询；DSL 中 employment 字段非 nested 直接校验失败。

## Migration Plan

1. 确认 `user_profile` schema、worker 和 backfill 已部署并完成至少一次目标用户范围 backfill。
2. 部署本 change，`apps/api` 读路径开始使用 profile。
3. 观察 user-info、search、authz、local session resolve 的 profile lookup 错误率和未找到错误。
4. 如需回滚，回滚 `apps/api` 到切换前版本；数据库 profile 表和 worker 可保留，不影响源表读路径。

## Open Questions

- 无。后续 freshness producer 和更完整 DSL 表达式扩展由独立 change 继续推进。
