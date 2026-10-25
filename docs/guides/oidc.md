# OIDC 接入指南

先完成 Client 配置，再使用同一 issuer 的 Discovery 端点完成授权、兑换和退出。
配置与凭据管理见[应用接入配置](../features/admin/client-sso-configuration.md)。

## 接入与端点

Issuer 是以 `/oidc` 结尾的完整 URL，例如 `https://iam.example.com/oidc`。
通过 `GET {issuer}/.well-known/openid-configuration` 发现 authorization、token、JWKS、UserInfo 和 end-session 端点。
内外入口可能使用不同 issuer。RP 须固定 issuer、使用其端点并校验响应；即使公钥和 sub 相同，两个 issuer 也须分别处理。
Discovery 缓存须按完整 issuer 区分。续接、Code、Access Token 和退出请求必须回到原 issuer。
错入口兑换 Code 可能终止共享应用会话，使正确入口的关联 Token 也失效；UserInfo、续接和退出的错入口拒绝不触发这类兑换撤销。

支持 Authorization Code Flow、public subject、RS256 ID Token、opaque Access Token、PKCE S256、
JSON UserInfo 和 RP-Initiated Logout。不提供 refresh token、consent、pairwise subject、动态注册或在线签名密钥管理。
Client 使用现有 IAM Client 记录，`client_id` 为不可变 clientCode。

| Client 类型  | Token 认证                                                                     |
| ------------ | ------------------------------------------------------------------------------ |
| Public       | `token_endpoint_auth_method=none`，强制 S256。                                 |
| Confidential | `client_secret_basic` 与 S256；SSO Secret 通过授权读取能力交付，保存在服务端。 |

授权 GET/form POST 要求 `response_type=code`、含 openid 的允许 scope、非空 state、code_challenge 和
`code_challenge_method=S256`。nonce 可省略，提供时绑定并回传。
Token POST 使用 form、原 Code、redirect_uri 与匹配 code_verifier；Public 提交 client_id，Confidential 使用 Basic。
Basic 按 form URL 解码并以首个冒号分隔，Basic 与 body client_id 冲突在认证前拒绝；不接受 client_secret_post 或 refresh grant。

Confidential 认证失败按 Client/IP 计数：首次失败起 60 秒固定窗口，达到 5 次后正确 Secret 也暂时拒绝；
成功兑换清除该 Client/IP 计数。限流拒绝时保留 Code 和会话。
客户端 IP 的可信代理配置见[发布前提](../releases/authentication-and-session.md#oidc-双入口配置)。

## 最小接入示例

以下以 Confidential Client 为例，端点占位符取自同一 issuer 的 Discovery。先登记
`https://app.example.com/callback` 和 `openid profile`，由业务后端持有 SSO Secret。

1. 生成随机 `state`、`nonce` 和 PKCE `code_verifier`，保存到本次登录上下文；
   `code_challenge` 为 verifier 的 SHA-256 摘要经无填充 Base64URL 编码后的值。浏览器跳转：

```http
GET {authorization_endpoint}?response_type=code&client_id=tender&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&scope=openid%20profile&state={state}&nonce={nonce}&code_challenge={code_challenge}&code_challenge_method=S256
```

2. 回调先核对 `state` 和预期 `iss`，再由后端使用原 verifier 兑换 Code：

```http
POST {token_endpoint}
Authorization: Basic {base64(formEncode(client_id):formEncode(ssoSecret))}
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code={encoded_code}&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&code_verifier={encoded_verifier}
```

成功响应直接使用 OAuth JSON，不包 IAM envelope。以下 Token 为示意值，期限以实际 `expires_in` 为准：

```json
{
  "access_token": "opaque-access-token",
  "token_type": "Bearer",
  "expires_in": 300,
  "id_token": "signed-id-token",
  "scope": "openid profile"
}
```

3. 使用 Discovery 的 JWKS 验证 ID Token 的签名、`iss`、`aud`、期限和原 `nonce`；
   需要用户资料时调用 UserInfo，并核对返回的 `sub` 与 ID Token 一致：

```http
GET {userinfo_endpoint}
Authorization: Bearer {access_token}
```

Public Client 省略 Basic，在 Token form 中提交 `client_id`，仍必须使用 S256。
Code 兑换失败或结果未知时放弃旧 Code，修正原因后重新授权；不要自动重放 Token 请求。
已认证且定位原实例后的失败可能终止已有应用会话，见[失败作用](oidc.md#兑换失败与重新登录)。
退出使用 Discovery 的 end-session 端点；提供 `id_token_hint` 和已登记的 `post_logout_redirect_uri`，
由 IAM 确认页完成退出。第三方仍负责清除自己的本地会话，详细规则见[退出确认与取消](oidc.md#退出确认与取消)。

## Redirect、参数与浏览器导航

redirect URI 与 post-logout redirect URI 是绝对 HTTP/HTTPS URL，允许 query，禁止 fragment、通配与模板变量。
地址逐字匹配，host 大小写、默认端口、路径、query 顺序、百分号编码和末尾斜杠的差异均会影响匹配。
生产优先 HTTPS，受控 HTTP 接入的网络边界由部署负责人核验。

授权支持 query、fragment、form_post。已确认安全地址上的成功和标准错误按所选 mode 返回；
form HTML 转义地址、state 和全部字段，使用 no-store/no-referrer。
未确认安全地址、重复必要参数或编码错误返回本地标准 JSON，不使用 IAM REST envelope 或通用 422。

未知参数及关闭的 claims/resource 被忽略；request、request_uri、registration 返回各自 not-supported 错误。
scope 去重，忽略不支持的 offline_access。`prompt` 只接受 none/login，none 不可组合；
max_age 为非负安全整数，0 要求新鲜认证。当前不支持 claims、MFA 或 offline access。

`IAM_API_LOGIN_ENDPOINT` 使用根相对路径。登录、续接、退出确认和默认成功页沿用当前入口；
拒绝绝对/协议相对 URL、反斜杠、控制字符和改变 authority 的歧义路径。
Portal 对发现的完整端点先验证属于当前入口，再构造相对导航；登记的业务 redirect 保持完整地址。

## Token、Scope 与当前披露

| Scope             | 披露                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| openid            | 稳定 Subject Identifier 作为 opaque sub。                                                        |
| profile           | name、preferred_username，不隐含任职。                                                           |
| phone             | 存在时返回 phone_number。                                                                        |
| iam:employments   | 仅 UserInfo 的有效任职与 responsibility；不进入 ID Token。                                       |
| iam:authorization | 仅 UserInfo 中当前 Client 的已发布角色，不含其他 Client 授权或 responsibility；不进入 ID Token。 |

任职响应包含 isPrimary、orgCode/orgName/orgType/fullOrgPath、posCode/posName，角色去重并稳定排序。
`iam:authorization` 的顶层和各任职仅含角色；不再返回权限点字段或空数组占位。Scope 名称和 allowedScopes 保持不变，无角色时返回空数组。接入应用须适配新响应，并清理或停用旧权限副本。
不返回数据库 ID、密码、状态、软删除字段或时间戳，也不混入 Custom wire。
UserInfo 按 Client 当前 allowedScopes 返回字段，范围变化也适用于旧 Token；原请求 scope 和调用方传入的 scope 均不改变该范围。ID Token 内容在签名后固定：显式映射 iss/aud/sub/iat/exp/auth_time、可选 nonce 及
profile/phone；仅 sub 或 IAM 扩展 scope 不读取完整 Facts。没有 Claims Snapshot。
可以返回已发布的旧角色；必要 Facts 缺失时整次交付失败。详见[事实契约](../features/sso/subject-delivery.md)。

ID Token 使用 RS256，JWKS 仅公开 kty/kid/alg/use/n/e，不交付私钥。

## HTTP、CORS 与流量限制

Token 错误采用标准 OAuth body，保留适用 401/WWW-Authenticate、503/Retry-After 和 no-store。
UserInfo `/me` GET/POST 接受 Authorization Bearer；form POST 也可使用单一 access_token，
混用或重复为 invalid_request，query bearer 拒绝。无凭据/无效 Token 为 401 Bearer challenge，
无凭据时 challenge 不带 error；不套 IAM envelope。

Discovery/JWKS GET/OPTIONS 回显 Origin，无 Origin 时不返回 wildcard，不开放 credentials。
Token OPTIONS 不依赖 body/client_id，反射 Origin/请求 headers；实际 POST 只允许 Public 登记 redirect origins，
Confidential 不开放实际 Token CORS。UserInfo 预检反射 Origin/headers、声明 GET/POST，
实际请求按 Token 所属 Client 当前 redirect origins 检查，两类 Client 相同，不信任请求 client_id。
授权不开放 CORS。

UserInfo 遇 Maintenance 返回 temporarily_unavailable/503 和 Retry-After，保留 Cookie 和会话。
配置暂停/切换只拒绝当前访问，切回后未终止且未到期的 Token 可以恢复。
配置/启停/轮换自身不自动撤销；Code 兑换失败仍遵守[失败作用矩阵](oidc.md#兑换失败与重新登录)。
Discovery、JWKS、health 与退出不被 Client Maintenance 阻断；离线 ID Token 的 RP 验证仍可持续至原期限。

## 兑换失败与重新登录

Code 仅能消费一次，失败或结果未知后重新授权，不重放兑换请求。
Client 认证未通过或无法可靠定位原应用会话时，不消费 Code，也不撤销会话。
认证并定位后，参数、Maintenance、协议、PKCE、issuer、期限等检查失败均可能终止原应用会话，Code 尚未消费也不例外。
Public Client 的撤销门槛不要求先通过 PKCE；因此错误兑换也可能使同一应用会话的其他 Token 失效。
撤销只针对原实例，不影响其他根、Client 或后来建立的实例；超时表示未知，不保证撤销已完成。
签名、Token 保存及响应交付失败不自动补偿或重签。精确顺序由[兑换实现](../../packages/oidc/src/tokens.ts)维护。

重新授权不延长旧 Token 或 IAM 根登录的期限。已有有效根但要求新鲜认证时返回 login_required；
首次登录须完成 IAM 的原续接流程，不能只带一个有效根跳过续接。普通允许列表编辑不改写已接受 Code/续接的 redirect 和 scope。

## 退出确认与取消

使用 Discovery 的 end-session 端点。id_token_hint 须由原 issuer 签发且属于当前 Client；允许过期，但不能用它代替当前登录凭据。
post_logout_redirect_uri 必须同时携带合法 hint，并精确匹配登记地址；没有 hint 时使用默认落点，state 仅回传已接受的应用地址。
确认页固定已接受的退出地址和 state，提交时不能替换。配置维护或关闭应用登录不妨碍退出。

确认退出终止的是提交时的当前 IAM 根登录；若确认页打开后更换了登录，退出的是新登录。
取消只关闭本次确认，保留登录和 Token；重复提交确认会失败。依赖故障或撤销结果未知时保留 Cookie，不能据此认定退出成功。
跨标签页操作不作协调，第三方仍须清除本地会话；离线 ID Token 不随在线退出失效。
密钥轮换及过期 hint 的兼容限制见[运维手册](../releases/authentication-and-session.md#签名密钥兼容边界)。
