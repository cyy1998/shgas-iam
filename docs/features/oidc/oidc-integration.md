# 内部 OIDC 接入指南

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
- Confidential client 同时使用 `client_secret_basic` 和 PKCE S256；生成的 secret 只展示一次。
- `client_id` 使用不可变的 IAM `clientCode`。
- 管理员在现有 IAM client 记录上配置并启用 OIDC，不单独创建 OIDC client。

每个授权请求都必须包含 `state`、`nonce`、`code_challenge` 和 `code_challenge_method=S256`。
Token 请求必须包含原始 `redirect_uri`、authorization code 和匹配的 `code_verifier`。Authorization code
只能使用一次。

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
- `iam:authorization`：在 JSON UserInfo 中返回授权快照；该 claim 永远不会进入 ID Token。

`iam:employments` 与 `iam:authorization` 的每条任职都包含 `isPrimary`、组织业务编码、名称、类型、从根到叶的
组织路径，以及职位编码与名称。`iam:authorization` 还只包含当前 client 对应的角色和权限；角色与权限会去重并
稳定排序。OIDC wire 继续使用 `orgCode`、`orgName`、`orgType`、`fullOrgPath`、`posCode` 和 `posName`，不会并行
输出 Custom SSO wire 字段。响应不会包含数据库 ID、密码、状态字段、软删除字段或时间戳。

授权完成后、Authorization Code 持久化前，Provider 会把实际授权 scope 映射为 Subject Claim Selection，并固化
独立的 OIDC Claims Snapshot。Snapshot 绑定 Subject Identifier、client、实际 scope、OIDC config version、Provider
Session 与 Principal Session。选择 `iam:authorization` 时也采用取得的已发布主体事实，允许权限落后于源事实，
不执行请求时新鲜度检查。无法取得合法投影时返回标准 `temporarily_unavailable`，且不会签发 Code。

Token Endpoint 只把 Code 中的 Snapshot 转移到 Access Token，不重新读取 Profile 或重新计算 Selection。UserInfo
在确认 token、client、OIDC 配置版本和绑定 session 仍然有效后，只重放 Access Token Snapshot。因此授权完成后的
档案或权限变化不会混入该 token 的 UserInfo；新 Facts 发布且被读取后，变化才进入新授权的 Snapshot，
不保证撤权立即传播或在固定期限内传播。OIDC 与 Custom SSO
只共享 Subject Identifier、Selection、Projection 和 Facts，不共享配置、Secret、wire、Snapshot、artifact 或 session。

## CORS

Discovery 和 JWKS 允许跨域读取。Token CORS 只对 public client 开放，并要求请求 Origin 与该 client
已注册 redirect URI 的 Origin 精确匹配。Confidential client 不开放 Token endpoint CORS。UserInfo 的
Origin 必须与 token 所属 client 的某个已注册 redirect URI Origin 匹配。IAM 外层不会为任何端点返回
通配符 CORS。

## Client Maintenance

Client Maintenance 是可逆的在线协议流量暂停，不改变 OIDC 的配置或启用意图。管理员可以在维护中配置、启用、禁用、删除
OIDC 或轮换 confidential client secret；恢复正常后，仍启用且未发生真实协议 mutation 的配置自动恢复在线可用。

Maintenance 中的 authorize、interaction/resume、token 与 UserInfo 返回标准 `temporarily_unavailable`，其中在线 bearer
使用返回 HTTP 503，不应被当作 `invalid_token` 或永久登出。暂态阻断不消费 Code、删除 Token/Session、清除 Cookie 或暂停 TTL；
恢复后只有仍未过期且配置版本未变化的对象继续有效。真实 OIDC 配置、启停、删除或 secret rotation 仍推进
`oidcConfigVersion` 并永久淘汰旧对象；进入 Client Disable 或软删除则使两个协议永久失效。

Discovery、JWKS 与 `{issuer}/health` 不读取 client-scoped Traffic Gate，维护中继续可用。RP-Initiated Logout 不被 Maintenance
阻断，并继续永久终止访问。当前未启用公开 OIDC Token Revocation endpoint；本文中的协议 revocation 指 Admin Client/OIDC
生命周期 mutation 触发的 Session Kernel 永久撤销，它同样可在 Maintenance 中执行。已离开 IAM 的 ID Token 可由 client 离线验证至
原始过期时间。

## 退出登录

使用 Discovery 返回的 `end_session_endpoint`。包含 `post_logout_redirect_uri` 的请求必须同时携带有效的
`id_token_hint`，且 URI 必须与 client 注册信息精确匹配。可选的 `state` 会原样返回。未提供 hint 时，
退出操作可以清理当前 global session，但只会返回 Provider 的安全默认页面。

用户确认退出后，系统会删除共享 global session、关联的 custom SSO local session、Provider session/grant，
以及通过 global session 反向索引到的 OIDC Access Token。
