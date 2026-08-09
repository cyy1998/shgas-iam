# 01 — 收口 Custom SSO Subject Projection 交付不变量

**What to build:** 让 Independent `/sso/token` 与 `/public/user-info` 通过同一个经过 Subject equality 和 strict Wire schema 校验的 Custom SSO V1 交付 Interface，使错误 Projection 在任何 Credential 或 Grant 副作用前失败，同时保留既定的 Client 配置竞态防护、错误分类、Grant lease、Gateway Subject Header 和 OIDC 隔离语义。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 完整 Custom SSO V1 Projection 只能通过一个普通公开函数 resolve、核对 expected Subject、执行 mapping 并通过 strict schema parse；不新增 factory、port、composition adapter 或可跳过校验的开关。
- [x] Resolve input 中的 Subject Identifier 同时作为 expected Subject；返回另一个格式合法的 UUID 时，函数抛出 reason 为 `subject_mismatch` 的专用内部错误。
- [x] Mapper failure 或 mapper 可接受但 strict schema 拒绝的运行时值统一抛出 reason 为 `invalid_wire` 的专用内部错误。
- [x] 专用内部错误不包含 Subject Identifier、claims、Projection、Wire、Zod issues 或原始 cause，也不注入 logger 或新增公开 API error code。
- [x] Client Subject Projection Service 在 resolve 阶段产生的 Subject Projection Not Ready、Subject Access unavailable 和其他既有错误原样传播，现有 `503`、`Retry-After` 与 retryable Grant release 语义不变。
- [x] 原始 Custom SSO V1 mapper 不再属于 package 公开 Interface；schema、Wire 类型和 placeholder preview 能力继续可用且保持既有输出规则。
- [x] Independent Grant redemption 在 Credential issuance、Credential post-validation、Grant consume、成功审计和 consumed artifact cleanup 前取得经过共享 Interface 验证的 Wire。
- [x] Subject mismatch 与 invalid Wire 均返回不暴露细节的内部 `500`，且不会创建或撤销 Credential、consume Grant、记录成功审计或执行 consumed artifact cleanup。
- [x] 不变量失败不主动 release Grant；当前 lease 有效期间第二个 attempt 不能接管，lease 到期且原始 Grant 未过期时可以新 attempt 重试，原始 expiry 不延长。
- [x] `/public/user-info` 使用同一个完整 V1 交付 Interface，并在 Interface 返回后、响应交付前再次复核当前 Client/config version；配置变化时构建结果被丢弃。
- [x] Gateway Subject Header 继续使用独立最小 Wire、Subject equality 与 Base64 路径，不新增 phone、employment 或 authorization；OIDC Claims Snapshot 与协议生命周期不变。
- [x] Token HTTP handler 继续校验包含 `sid`、`ttl` 和 `subject` 的完整响应，成功响应 JSON 与现有 HTTP Contract 不变。
- [x] Package unit tests 通过公开 Interface 覆盖成功、合法 UUID mismatch、invalid Wire、mapper failure、敏感错误字段缺失和 resolve 错误原样传播。
- [x] API component integration 通过现有 Grant redemption seam 证明两类不变量失败都发生在副作用前，并固定 non-retryable lease 接管行为；不增加 production test hook 或 Full-system E2E。
- [x] `/public/user-info`、Gateway Subject Header、retryable Projection failure 和成功 Independent exchange 的相邻回归测试继续通过。
- [x] Current backend architecture、Custom SSO Subject Projection 设计和文档索引记录共享 Interface、副作用顺序、内部错误、Grant lease、Client 二次复核及测试 seam；不新增 ADR、领域术语或修改冻结历史。
- [x] 受影响 workspace 的 unit/integration、lint、typecheck，以及 architecture、docs 和 whitespace 聚焦验证全部通过；无法运行的检查被明确报告而不伪造结果。
