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

- `openid`：返回来自 `user.oidcSubject` 的稳定 opaque `sub`。
- `profile`：返回 `name` 和 `preferred_username`。
- `phone`：存在手机号时返回 `phone_number`。
- `iam:authorization`：在 JSON UserInfo 中返回授权快照；该 claim 永远不会进入 ID Token。

`iam:authorization` 包含全部有效任职。每条任职仅包含组织业务编码、名称、类型、从根到叶的组织路径、
职位编码与名称，以及当前 client 对应的角色和权限。角色与权限会去重并稳定排序。响应不会包含数据库 ID、
密码、custom SSO 字段、状态字段、软删除字段或时间戳。

UserInfo 只有在确认 token、用户、client、OIDC 配置版本和绑定的 global session 仍然有效后，才会读取
签发时保存在 Redis 中的快照。

## CORS

Discovery 和 JWKS 允许跨域读取。Token CORS 只对 public client 开放，并要求请求 Origin 与该 client
已注册 redirect URI 的 Origin 精确匹配。Confidential client 不开放 Token endpoint CORS。UserInfo 的
Origin 必须与 token 所属 client 的某个已注册 redirect URI Origin 匹配。IAM 外层不会为任何端点返回
通配符 CORS。

## 退出登录

使用 Discovery 返回的 `end_session_endpoint`。包含 `post_logout_redirect_uri` 的请求必须同时携带有效的
`id_token_hint`，且 URI 必须与 client 注册信息精确匹配。可选的 `state` 会原样返回。未提供 hint 时，
退出操作可以清理当前 global session，但只会返回 Provider 的安全默认页面。

用户确认退出后，系统会删除共享 global session、关联的 custom SSO local session、Provider session/grant，
以及通过 global session 反向索引到的 OIDC Access Token。
