## Context

IAM 当前已经具备统一登录、`global_session` 全局会话、自定义 `/sso` 授权码和面向业务系统的局部会话能力。现有 `/sso` 适合已经接入的内部系统，但它的 `/sso/authorize`、`/sso/token`、`local_<client>_session`、`validRedirectUrls` 和 query 形态不满足标准 OIDC/OAuth2 客户端预期。

OIDC 不是简单新增几个 endpoint 名字。它需要标准 Discovery、JWKS、Authorization Code Flow、PKCE、Token Endpoint、ID Token、UserInfo、client authentication、redirect URI 精确匹配和 token/key 生命周期治理。为避免把这些协议复杂度混入现有 public API，本变更把 OIDC 作为新的标准协议出口。

## Goals / Non-Goals

**Goals:**

- 让 IAM 可以作为标准 OIDC Provider 被通用 OIDC/OAuth2 client、网关和业务系统接入。
- 保留现有 `/auth` 登录、Cap 风控、登录失败计数、全局会话、审计和自定义 `/sso` 流程。
- 第一版支持 Authorization Code Flow + PKCE，并提供 Discovery、JWKS、Token、UserInfo 和基础 end session。
- 为 OIDC client 建立独立注册表，避免复用现有 custom SSO client 的明文 `clientSecret` 和前缀 redirect 语义。
- 通过管理端维护 OIDC client，并支持 secret 只显示一次、后续轮换。

**Non-Goals:**

- 不把现有 `/sso/token` 改造成 OAuth token endpoint。
- 不迁移或强制替换已有 custom SSO client。
- 第一版不支持 implicit flow、password grant、device flow、dynamic client registration、PAR/JAR/FAPI、refresh token/offline_access。
- 第一版不实现复杂 consent/授权页；内部可信 client 可按配置跳过 consent，外部 client 的 consent 另行设计。

## Decisions

### 1. 使用独立 `apps/oidc-provider` 微服务

OIDC Provider SHALL 作为新的 workspace app 存在，建议使用 Node runtime 承载成熟 OIDC Provider 库，并通过 Redis/PostgreSQL 与 IAM 共享必要状态。外部访问建议挂载在同一站点 origin 的 `/oidc` 路径，或使用受控 cookie domain，使 provider 能读取现有 `global_session` cookie。

备选方案：

- 在 `apps/api` 里手写 `/oidc/*`：实现量较小的表象很诱人，但协议状态机、安全边界和 conformance 风险高，不采用。
- 在 Bun/Hono 进程内嵌 Node OIDC 库：部署简单，但运行时兼容性不确定，且会扩大 `apps/api` 责任边界，不作为第一选择。

### 2. OIDC 复用现有登录，不复制密码认证

OIDC authorize 收到请求后 SHALL 校验 OIDC client、redirect URI、response type、scope、state、nonce 与 PKCE 参数。若浏览器没有有效 `global_session`，provider SHALL 将用户重定向到现有 SSO portal 登录页，并携带受控 `returnTo`。登录成功后，SSO portal SHALL 直接返回 provider 继续 OIDC authorize。

这样可以复用现有 `/auth/login/password` 和 `/auth/login/mobile` 的加密 credential、Cap、人机校验、失败计数、临时限制、cookie 写入和审计。Provider 不处理用户名密码，也不持有登录凭证明文。

`returnTo` 必须受控，避免把登录页变成 open redirect。建议 provider 生成短期登录回跳 nonce 或签名 return token；SSO portal 只接受匹配 OIDC provider origin 或有效签名的回跳目标。

### 3. OIDC client 使用独立注册表

OIDC client SHALL 使用独立数据模型，而不是复用现有 `client.extAttributes.validRedirectUrls`。原因：

- OIDC/OAuth2 要求 redirect URI 精确匹配，现有 custom SSO 使用前缀匹配。
- OIDC client secret 不应明文存储或作为 Redis key。
- OIDC client 需要标准字段：`client_id`、`redirect_uris`、`post_logout_redirect_uris`、`grant_types`、`response_types`、`scope`、`token_endpoint_auth_method`、`status`、`secret_hash`。
- 旧 client 还承载 Gateway/Independent/ORCAS 等 custom SSO 行为，混用会让迁移和安全治理变浑。

管理端可以复用现有 client 管理页面的交互模式，但后端 API、schema 和服务应是 OIDC 专用模块。

### 4. Provider 状态使用 Redis，配置和密钥使用 PostgreSQL

OIDC authorization code、interaction、access token 和短期 grant 状态 SHALL 存储在 Redis，并使用 provider model TTL 自动过期。OIDC client、redirect URI、scope 策略、secret hash、签名 key metadata 和 subject 映射 SHALL 存储在 PostgreSQL。

第一版不启用 refresh token/offline_access，因此不需要长期 token 存储。若未来启用 refresh token，应新增持久化 token 表、撤销状态、轮换规则和审计需求。

### 5. ID Token 使用稳定不透明 subject

`sub` SHALL 是 OIDC 专用稳定不透明标识，不直接暴露数据库用户 ID、username、手机号或员工号。建议新增 `oidc_subjects` 映射表，为每个 IAM user 生成 UUID/ULID subject，并保证同一 issuer 下长期稳定。

默认 claims：

- `openid`: `sub`
- `profile`: `name`、`preferred_username`
- `phone`: `phone_number`，仅在 client 允许并请求该 scope 时返回

角色、组织、岗位等企业 claim 不进入第一版默认标准 scope。需要时通过 client claim policy 单独配置。

### 6. Signing keys 和 JWKS 支持轮换

Provider SHALL 使用非对称签名密钥签发 ID Token。JWKS endpoint SHALL 只公开 public key，并保留至少一个上一代 signing key，直到其签发 token 全部过期。私钥 material SHALL 来自安全配置或加密存储，不能写入日志、前端或普通 API 响应。

### 7. 退出与现有全局会话清理保持一致

OIDC end session SHALL 校验 `id_token_hint` 或当前 `global_session`，清理 IAM 全局会话，并复用现有“删除全局会话及其局部会话”的语义。`post_logout_redirect_uri` 必须精确匹配 OIDC client 配置；未匹配时 SHALL 返回错误或落到默认登录页，不执行任意跳转。

## Risks / Trade-offs

- [Risk] Provider 与 API 分成两个服务后，cookie domain、反向代理路径和 issuer URL 容易配置不一致 → Mitigation: 明确要求生产 issuer、外部 origin 和 provider 路径由同一配置驱动，并增加 Discovery smoke test。
- [Risk] SSO portal `returnTo` 引入 open redirect 风险 → Mitigation: 使用短期 return nonce 或签名 token，并校验 OIDC provider allowed origin。
- [Risk] 成熟 OIDC Provider 库仍需要可信 adapter/client 配置，配置错误会造成安全缺陷 → Mitigation: 用测试覆盖 redirect exact match、PKCE、client auth、code replay 和 disabled client。
- [Risk] OIDC token claims 与现有用户快照可能不同步 → Mitigation: Token 签发时读取有效 session，UserInfo 通过 subject 解析当前用户详情，并在禁用/删除用户时拒绝返回有效身份。
- [Risk] 独立 OIDC client 注册表会带来管理端重复概念 → Mitigation: 页面文案区分“自定义 SSO client”和“OIDC client”，并在后续迁移稳定后再考虑统一展示。

## Migration Plan

1. 新增 OIDC 数据模型、配置和 `apps/oidc-provider`，默认不注册生产 OIDC client。
2. 部署 provider 到开发/测试环境，完成 Discovery、JWKS、authorize/token/userinfo 的最小 smoke test。
3. 扩展 SSO portal 的 OIDC `returnTo` 登录回跳，验证未登录 authorize 能借用现有登录页。
4. 扩展 admin-api/admin 的 OIDC client 管理能力，创建一个测试 confidential client 和一个 PKCE public client。
5. 使用标准 OIDC client 库完成端到端联调，再逐步开放给业务系统。
6. 回滚时禁用 provider 路由或移除反向代理入口，保留数据库表和已注册 client 记录，不影响现有 `/sso`。

## Open Questions

- 生产 OIDC issuer 使用 `{IAM_ORIGIN}/oidc` 还是独立域名 `https://oidc.example.com`？
- 第一版是否需要 consent 页面，还是仅允许管理员注册的可信 client 免 consent？
- 企业角色、组织、岗位 claims 是否需要进入第一版，还是放到后续 `claims policy` 变更？
- Provider runtime 是否固定为 Node LTS，并在 Docker/turbo 中与 Bun backend 并行维护？
