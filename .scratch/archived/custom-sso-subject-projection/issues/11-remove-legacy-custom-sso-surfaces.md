# 11 — 移除 Legacy Custom SSO Surface

**What to build:** 在新配置、Grant、Credential、Session 和投影链路就绪后一次性删除旧 Custom SSO 配置与宽数据出口，不留下运行时兼容字段、双读或旧兑换协议。

**Blocked by:** 06, 07, 08, 10

**Status:** resolved

- [x] 删除通用 `extAttributes` 中的 `managementLevel`、`requireOrcas`、`validRedirectUrls`、`userExcluding`、`callbackEndpoint`、`logoutEndpoint` Custom SSO 语义及其 runtime reader/writer。
- [x] 通用 Client create/update/schema 明确拒绝四个 Custom SSO managed fields 和已删除 legacy Custom SSO attributes；Custom SSO 只能通过五个专用 Admin intent 管理。
- [x] 删除旧 Custom SSO grant、binding、credential 与 Local Session 的宽 User Detail/Principal Snapshot payload 及 legacy normalization，不保留空壳、兼容 alias、双写或 fallback。
- [x] `/sso/token` 的 GET、query Secret、旧 request shape、浏览器 CORS 与旧 `userInfo` response 全部移除；唯一外部兑换契约是 POST、Basic、form 与 `subject` V1。
- [x] `/public/user-info` 和 `/auth/authz` 不再读取 session 内宽用户详情、Legacy `detail` 或旧 client 配置；缺失 Subject Facts 时只返回既定未就绪错误。
- [x] Admin list/detail、audit、OpenAPI 与前端不再暴露 legacy mode、旧字段或兼容展示，已有管理入口只呈现新 Custom SSO state/mode/config。
- [x] 删除所有默认宽权限、未知 Claims 容错、source-table join 补救和旧字段 lazy migration；未知或未迁移状态一律 fail closed。
- [x] `user_profile.detail`、`search_doc` 及其既有非 SSO 消费者继续保留，本 ticket 不把它们误判为兼容字段删除。
- [x] Query Session Token 的接收、传递、日志和响应头行为保持原样；ORCAS 专用 transport、Cookie、query、endpoint 与外部 session 语义保持原样。
- [x] `/public/user-info` 之外的其他 legacy `/public/*` 外部契约不改变；需要账号数据的 handler 继续使用显式 resolver。
- [x] API/schema/serialization 回归证明新响应中不存在 `id`、`userInfo`、User Detail、跨 client 授权或 legacy config；仓库搜索和架构守卫证明生产 composition 不再引用被删除 surface。
