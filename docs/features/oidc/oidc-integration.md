# 内部 OIDC 接入指南

API 的默认 HTTP 与 `@iam/oidc` 提供下述契约；旧 Provider app 已退役。环境尚未切换，发布按[统一维护手册](../../releases/unified-session-maintenance.md)。

## 端点

Issuer 是以 `/oidc` 结尾且不可随意变更的外部 URL，例如 `https://iam.example.com/oidc`。
客户端必须通过以下地址发现端点：

```text
GET {issuer}/.well-known/openid-configuration
```

第一版支持 Authorization Code Flow、public subject、RS256 ID Token、opaque Access Token、JSON UserInfo、
PKCE S256 和 RP-Initiated Logout。不支持 refresh token、consent 页面、pairwise subject、动态客户端注册、
独立的 OIDC-only client 记录或在线签名密钥管理。

## 客户端类型

- Public client 使用 `token_endpoint_auth_method=none` 和 PKCE S256。
- Confidential client 同时使用 `client_secret_basic` 和 PKCE S256；当前 Secret 通过授权的生成/轮换或超级管理员审计重读交付。
- `client_id` 使用不可变的 IAM `clientCode`。
- 管理员在现有 IAM client 记录上配置并启用 OIDC，不单独创建 OIDC client。

每个授权请求都必须包含非空 `state`、`code_challenge` 和 `code_challenge_method=S256`；Code Flow 的 `nonce` 可省略，提供时绑定并回传。
Token 请求必须包含原始 `redirect_uri`、authorization code 和匹配的 `code_verifier`。Authorization code
只能使用一次。

Confidential Basic 认证按 Client 与 IP 统计失败，首次失败开始 60 秒固定窗口，达到 5 次后正确 Secret 也暂时拒绝；
成功兑换清除该 Client/IP 的失败计数。这个认证门槛拒绝时不消费 Code、不撤销会话。
`IAM_API_OIDC_TRUST_PROXY` 默认 `true`，沿用受信代理部署的 `X-Forwarded-For` 首项；设为 `false` 或没有该头时使用连接地址，
不以 `X-Real-IP` 或 `CF-Connecting-IP` 替代。门户入口使用 `IAM_API_LOGIN_ENDPOINT`，仅接受安全根相对路径并保留当前 IAM 入口；旧绝对 URL 配置必须显式迁移。
旧候选的 `IAM_API_OIDC_SSO_LOGIN_PATH` 已删除，不再保留两个不一致的登录入口配置。

登录导航拒绝绝对 URL、协议相对 URL、反斜杠、控制字符及可改变 authority 的歧义路径。IAM 登录、续接、退出确认与默认
退出成功页使用根相对导航；Portal 取得完整发现端点后先校验它属于当前入口，再构造相对授权/退出导航。Discovery 与
Custom 配置发现仍返回完整协议地址；登记的业务回调与 Custom `callbackEndpoint` 保持完整配置，包括明确配置的跨入口 IAM 托管回调。

## Redirect URI

注册的 redirect URI 和 post-logout redirect URI 必须是绝对 HTTP 或 HTTPS URL。允许 query string，禁止
fragment、通配符和模板变量。匹配时使用完整原始字符串，不规范化 host 大小写、默认端口、路径、query
参数顺序、百分号编码或末尾斜杠。

受控内部网络可以配置生产 HTTP redirect URI，但 authorization code 和浏览器状态可能被传输链路截获，
因此应优先使用 HTTPS。任何 HTTP 例外都必须经过明确的网络安全评审。

## Scope 与 Claim

支持以下 scope：

- `openid`：返回 IAM 协议中性 Subject Identifier 的稳定 opaque `sub`；既有 UUID 原值不变。
- `profile`：返回 `name` 和 `preferred_username`，不隐含任职。
- `phone`：存在手机号时返回 `phone_number`。
- `iam:employments`：只在 JSON UserInfo 中返回当前有效任职；该 claim 永远不会进入 ID Token。
- `iam:authorization`：在 JSON UserInfo 中返回取得的已发布授权事实；该 claim 永远不会进入 ID Token。

`iam:employments` 与 `iam:authorization` 的每条任职都包含 `isPrimary`、组织业务编码、名称、类型、从根到叶的
组织路径，以及职位编码与名称。`iam:authorization` 还只包含当前 client 对应的角色和权限；角色与权限会去重并
稳定排序。OIDC wire 继续使用 `orgCode`、`orgName`、`orgType`、`fullOrgPath`、`posCode` 和 `posName`，不会并行
输出 Custom SSO wire 字段。响应不会包含数据库 ID、密码、状态字段、软删除字段或时间戳。

Code 保存原授权 redirect/scope/nonce 等事实。Token Endpoint 不重新审核首次已接受的 redirect/scope 允许范围；
适用 Client 认证和原 ClientSession 定位通过后，Code 一次消费，PKCE 等后续失败不会恢复 Code，并有界尝试终止原实例。
恢复方式是使用有效根重新授权。新请求仍须通过当前 Client 协议/启用/状态及 Subject Access。

UserInfo 验证 Token、UserSession 和 ClientSession，并按 Client 当前披露范围读取已发布 Subject Facts；
配置披露更新也适用于旧 Token。Facts 允许落后于源事实，故不承诺撤权即时传播；合法事实不可得时返回暂态失败。
已签发 ID Token 内容固定，不含 `iam:authorization` 或 `iam:employments`。在线不再保存 Claims Snapshot。

## CORS

Discovery 和 JWKS 允许跨域读取。Token CORS 只对 public client 开放，并要求请求 Origin 与该 client
已注册 redirect URI 的 Origin 精确匹配。Confidential client 不开放 Token endpoint CORS。UserInfo 的
Origin 必须与 token 所属 client 的某个已注册 redirect URI Origin 匹配。IAM 外层不会为任何端点返回
通配符 CORS。

## Client Maintenance

Maintenance/SSO 停用是可恢复的流量限制，不消费 Code、不续期或自动撤销关系；维护时可准备配置和 Secret。
普通配置、启停、协议选择和 Secret 轮换不推进 epoch。切回相同协议后，原期限内且未显式撤销的访问可能恢复。
Discovery、JWKS 和 `{issuer}/health` 不依赖 Client Snapshot，退出与显式会话撤销不被维护阻断。
依赖故障返回 `temporarily_unavailable`，不能当作永久登出；ID Token 离开 IAM 后仍可被 RP 离线验证到原期限。

## 退出登录

使用 Discovery 的 `end_session_endpoint`。Post-logout redirect 必须配合合法 `id_token_hint` 并精确匹配登记 URI；
可选 state 原样返回。未提供 hint 时只使用安全默认落点。
确认界面绑定一次确认状态；取消只消费确认状态，保留根 Cookie、UserSession、ClientSession 和 Token。
确认操作终止处理本次请求时的根，并清除根 Cookie；Token 后续在线使用因根或关系终止而拒绝。
确认不冻结展示页面时的旧根，也不提供额外多标签页保护；第三方自行建立的本地会话仍由其负责。
