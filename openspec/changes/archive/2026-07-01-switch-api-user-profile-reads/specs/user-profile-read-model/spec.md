## MODIFIED Requirements

### Requirement: Profile query service
系统 SHALL 在 `apps/api` 提供并接入 `UserProfileQueryService`，作为 API 用户详情、用户搜索和 internal DSL 搜索的 profile 读取来源。

#### Scenario: Query detail by identity
- **WHEN** 调用方按 userId、username、mobile 或 wxId 查询 profile
- **THEN** query service SHALL 返回当前 schema version 的 `UserDetailDto`
- **AND** 如果 profile 缺失，query service SHALL 返回未找到错误而不是 fallback 到源表
- **AND** 响应 SHALL NOT 暴露 `profile_schema_version`、`rebuilt_at` 或 dirty/worker 状态

#### Scenario: Legacy search preserves nested employment semantics
- **WHEN** query service 使用旧 `UserQueryDto` 搜索用户
- **THEN** 系统 SHALL 将 employment 条件编译为同一个 employment 元素内满足条件的 nested 查询语义
- **AND** 系统 SHALL 只返回当前 schema version 且 `search_visible=true` 的 profile

#### Scenario: DSL requires explicit nested employment
- **WHEN** filter DSL 查询引用 employment 字段
- **THEN** DSL MUST 使用显式 nested employment 表达式
- **AND** 非 nested 上下文引用 employment 字段 SHALL 校验失败

#### Scenario: Internal DSL search is bounded
- **WHEN** internal API 调用 profile DSL 搜索并提供 `limit`
- **THEN** 系统 SHALL 拒绝超过 API user-profile DSL 最大限制的请求
- **AND** 未提供 `limit` 时系统 SHALL 使用服务端默认限制
- **AND** DSL 搜索 SHALL NOT 暴露给 public 或 open API
