# 08 — 交付 Gateway Local Session 与公开投影

**What to build:** 将 Gateway 登录会话和共享认证上下文收敛为最小引用，并让 `/public/user-info` 与 `/auth/authz` 在请求时按当前 Client 配置生成受控投影，其中高频 authz cache-hit 路径不访问 PostgreSQL。

**Blocked by:** 01, 04, 05, 06, 07

**Status:** resolved

- [x] Gateway authorization/callback 成功后签发的 Local Session 只保存最小 Principal Reference、client/mode/config version、生命周期及可选 ORCAS reference，不保存 User Detail 或 Client Subject Projection。
- [x] Local Session 每次解析都校验当前全局 Client 状态、Custom SSO enabled/config version 与 Subject Access Barrier；版本或状态不一致时 fail closed 并按稳定错误语义处理 Cookie。
- [x] ORCAS 只在 Gateway 明确启用时存在于专用上下文、Cookie 和 endpoint；它不进入 Catalog、Subject Facts、投影、UserInfo 或 Gateway Subject Header。
- [x] 共享认证上下文只暴露 `subjectIdentifier`、`authenticatedClientCode` 与可选 `orcasId`；其他 legacy `/public/*` handler 如需账号字段必须显式调用自己的 resolver，外部契约不随本 ticket 改变。
- [x] `/public/user-info` 根据最小认证上下文和当前 Custom SSO config 生成 Selection，实时调用 Projection Module，成功 `data` 直接使用 Custom SSO V1 wire projection。
- [x] `/auth/authz` 只生成版本 1 的最小 JSON：Subject Identifier 必有，username/name 仅在 client 选择时出现，phone、employments、authorization、ORCAS 和数据库 ID 永远禁止。
- [x] `/auth/authz` 将同一 Base64 JSON 同时写入 response body 与 `X-User-Info`，不再从 session 或 User Detail 复制宽 payload。
- [x] `/auth/authz` 永不选择 `iam:authorization`；有效 Redis Facts cache hit 路径通过可计数 adapter 证明零 PostgreSQL 查询，只选 Subject Identifier 时同时为零 Facts read。
- [x] Barrier `disabled` 与不可用状态、Projection Not Ready、config version 失效分别遵循既定 401/503、Cookie 清理和 `Retry-After` 语义，不泄漏内部状态。
- [x] Query Session Token 的现有接收、传递、日志与响应头行为保持原样；ORCAS transport、Cookie、query、endpoint 和外部 session 语义也不在本 ticket 修改。
- [x] Gateway use-case、Session Kernel、handler、OpenAPI 与性能测试覆盖最小 artifact、实时 projection、header/body 一致、client 隔离、ORCAS 隔离、错误映射及 cache-hit 零数据库查询。
