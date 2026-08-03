# 07 — 交付版本化 Grant 与 Independent SSO

**What to build:** 以绑定实际 Redirect 与配置版本的可恢复 Grant 完成 Independent SSO，并通过后端专用、一次性兑换的 POST 协议只签发当前 client 允许看到的 Subject Projection。

**Blocked by:** 01, 04, 05, 06

**Status:** resolved

- [x] Redirect Pattern 无通配时精确匹配路径，只有显式 `/*` 匹配路径子树，`*.` 只匹配一级子域；scheme 与 port 必须精确一致。
- [x] 配置拒绝裸 `*`、公共后缀或 IP 通配、URL credentials、动态 query 与 fragment；Authorization 阶段校验并规范化实际 Redirect URI。
- [x] Grant 固化已验证的实际 Redirect URI，后续 callback 与 token exchange 必须逐字匹配该值，不再次应用 pattern。
- [x] V1 `state` 可选；提供时与 Grant 绑定并原样返回，IAM 不解释、不修改、不写普通日志，缺失时不生成默认值。
- [x] Authorization Grant 只保存 Subject Identifier、clientCode、mode、实际 Redirect URI、可选 state、config version、状态/租约与 expiry，不保存 User Detail 或 Client Subject Projection。
- [x] Grant 实现 `issued → redeeming → consumed`，redeeming 带随机 attempt ID 与短租约；只有成功签发 Independent Credential 后才 consumed，已消费 Grant 不能重放。
- [x] Subject Projection Not Ready 或其他可重试 503 会让同一 attempt 回到 issued 且不延长原 expiry；进程异常仅在租约到期后允许重试，竞争兑换具有确定性结果。
- [x] Independent token exchange 只接受 POST、HTTP Basic `clientCode:customSsoSecret` 与 form `code`/`redirect_uri`，不接受 GET、query Secret、JSON body 或浏览器 CORS。
- [x] Secret 验证只使用 Independent 专属 runtime credential record；Gateway、OIDC Secret 与通用 `clientSecret` 均不能通过该认证。
- [x] 成功响应只在 `data` 中返回 opaque `sid`、TTL 与 `subject` V1 投影，不返回 `userInfo`、数据库 ID 或宽用户详情。
- [x] Independent Credential 只保存最小 Principal Reference、client/mode/config version、生命周期及必要认证元数据，不内嵌 User Detail 或投影；每次使用都 fail closed 校验当前 config version、Client 状态与 Subject Access Barrier。
- [x] use-case、handler、OpenAPI 和 Redis contract tests 覆盖 Redirect/state 绑定、Basic/form 契约、Secret 脱敏、Grant lease 并发、503 恢复、一次性消费、client-scoped 投影及稳定错误响应。
