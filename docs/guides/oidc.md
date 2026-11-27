# OIDC 接入指南

先按[应用与凭据](README.md#应用与凭据)完成 Client 配置，再使用同一 issuer 的 Discovery 端点完成授权、兑换和退出。

## 接入与端点

SSO API 在原 `/oidc` 前缀提供 OIDC 协议与 `/oidc/health`。Issuer 是以 `/oidc` 结尾的完整 URL，例如 `https://iam.example.com/oidc`。
通过 `GET {issuer}/.well-known/openid-configuration` 发现 authorization、token、JWKS、UserInfo 和 end-session 端点。
内外入口可能使用不同 issuer。RP 须固定 issuer、使用其端点并校验响应；即使公钥和 sub 相同，两个 issuer 也须分别处理。
Discovery 缓存须按完整 issuer 区分。续接、Code、Access Token 和退出请求必须回到原 issuer。
错入口兑换 Code 可能终止共享应用会话，使正确入口的关联 Token 也失效；UserInfo、续接和退出的错入口拒绝不触发这类兑换撤销。

- **支持能力** 支持 Authorization Code Flow、public subject、RS256 ID Token、opaque Access Token、PKCE S256、
  JSON UserInfo 和 RP-Initiated Logout。不提供 refresh token、consent、pairwise subject、动态注册或在线签名密钥管理。
  Client 使用现有 IAM Client 记录，`client_id` 为不可变 clientCode。

| Client 类型  | Token 认证                                                                     |
| ------------ | ------------------------------------------------------------------------------ |
| Public       | `token_endpoint_auth_method=none`，强制 S256。                                 |
| Confidential | `client_secret_basic` 与 S256；使用[应用的 SSO Secret](README.md#应用与凭据)。 |

- **授权与 Token 兑换** 授权 GET/form POST 要求 `response_type=code`、含 openid 的允许 scope、非空 state、code_challenge 和
  `code_challenge_method=S256`。nonce 可省略，提供时绑定并回传。
  Token POST 使用 form、原 Code、redirect_uri 与匹配 code_verifier；Public 提交 client_id，Confidential 使用 Basic。
  Basic 按 form URL 解码并以首个冒号分隔，Basic 与 body client_id 冲突在认证前拒绝；不接受 client_secret_post 或 refresh grant。

- **认证失败限流** Confidential 认证失败按 Client/IP 计数：首次失败起 60 秒固定窗口，达到 5 次后正确 Secret 也暂时拒绝；
  成功兑换清除该 Client/IP 计数。限流拒绝时保留 Code 和会话。
  客户端 IP 的可信代理配置见[发布前提](../releases/authentication-and-session.md#oidc-双入口配置)。

## 最小接入示例

以下以 Confidential Client 为例，端点占位符取自同一 issuer 的 Discovery。先登记
`https://app.example.com/callback` 和 `openid profile`，由业务后端持有 SSO Secret。

1. **发起授权跳转** 生成随机 `state`、`nonce` 和 PKCE `code_verifier`，保存到本次登录上下文；
   `code_challenge` 为 verifier 的 SHA-256 摘要经无填充 Base64URL 编码后的值。浏览器跳转：

```http
GET {authorization_endpoint}?response_type=code&client_id=tender&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&scope=openid%20profile&state={state}&nonce={nonce}&code_challenge={code_challenge}&code_challenge_method=S256
```

2. **回调校验与兑换 Code** 回调先核对 `state` 和预期 `iss`，再由后端使用原 verifier 兑换 Code：

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

3. **验证 ID Token 与获取 UserInfo** 使用 Discovery 的 JWKS 验证 ID Token 的签名、`iss`、`aud`、期限和原 `nonce`；
   需要用户资料时调用 UserInfo，并核对返回的 `sub` 与 ID Token 一致：

```http
GET {userinfo_endpoint}
Authorization: Bearer {access_token}
```

Public Client 省略 Basic，在 Token form 中提交 `client_id`，仍必须使用 S256。
兑换异常和退出分别按[兑换失败与重新登录](#兑换失败与重新登录)及[退出确认与取消](#退出确认与取消)处理。

## Redirect、参数与浏览器导航

- **回调地址精确匹配** redirect URI 与 post-logout redirect URI 是绝对 HTTP/HTTPS URL，允许 query，禁止 fragment、通配与模板变量。
  地址逐字匹配，host 大小写、默认端口、路径、query 顺序、百分号编码和末尾斜杠的差异均会影响匹配。
  生产优先 HTTPS，受控 HTTP 接入的网络边界由部署负责人核验。

- **响应模式与错误处理** 授权端点支持 `query`、`fragment` 和 `form_post` 三种响应模式。
  当回调地址已确认安全时，成功响应和标准协议错误均按所选模式返回；使用 `form_post` 时，返回的 HTML 表单会对回调地址、`state` 及全部字段做 HTML 转义，并设置 `Cache-Control: no-store` 与 `Referrer-Policy: no-referrer`。
  若回调地址尚未确认安全，或出现重复的必要参数、参数编码错误，服务端会直接返回本地标准 JSON 错误，不使用 IAM REST envelope 或通用 422 响应。

- **可选与不支持参数** 未知参数以及未启用的 `claims`、`resource` 参数会被忽略；传入 `request`、`request_uri` 或 `registration` 时，分别返回对应的 `*_not_supported` 错误。
  `scope` 会自动去重并忽略不支持的 `offline_access`。`prompt` 仅支持 `none` 或 `login`，且 `none` 不可与其他值组合；
  `max_age` 必须是非负安全整数，传 `0` 表示要求重新认证。当前不支持 `claims`、MFA 或 `offline_access`。

`IAM_SSO_API_LOGIN_ENDPOINT` 使用根相对路径。登录、续接、退出确认和默认成功页沿用当前入口；
拒绝绝对 URL、协议相对 URL、反斜杠、控制字符以及会改变 authority 的歧义路径。
Portal 对发现的完整端点会先验证其属于当前入口，再构造相对导航；已登记的业务回调地址保持完整 URL。

### 处理应用准入错误

应用启用准入策略后，已有 IAM 登录的直接授权和登录后的续接都会检查本次登录资格。明确不匹配时，
IAM 按请求的响应模式向已登记的回调返回 `access_denied`、`iss` 和原 `state`。

- **交互式登录** 交互式登录回调先校验预期的 `iss` 与本次请求的 `state`，再结束本次登录。若 `error_uri` 指向预期 issuer 的
  origin 和 `/portal/application-access-denied` 路径，可引导用户打开该页查看应用名称与联系管理员的提示。
- **静默授权（`prompt=none`）** `prompt=none` 的准入拒绝中，IAM 省略协议字段 `error_uri`。登记回调地址时，请为协议保留响应字段名，
  避免在回调查询参数中使用 `error_uri` 等名称。静默授权失败时，接入方在后台处理错误并结束本次授权，不触发页面导航。
- **暂态不可用（`temporarily_unavailable`）** 收到 `temporarily_unavailable` 时提示稍后重试，从应用重新发起授权。

准入失败仅结束或中断本次新授权。已签发的 Code、Token 和已有登录会话继续按各自的有效期与撤销规则处理。
资格依据与发布延迟见[应用准入决策](../adr/0051-enforce-admission-before-issuing-application-login-grants.md#策略配置与事实时效)。

## Token、Scope 与当前披露

| Scope             | 披露                                                        |
| ----------------- | ----------------------------------------------------------- |
| openid            | 稳定 Subject Identifier 作为 opaque sub。                   |
| profile           | name、preferred_username，不隐含任职。                      |
| phone             | 存在时返回 phone_number。                                   |
| iam:employments   | 仅 UserInfo 的有效任职与 responsibility；不进入 ID Token。  |
| iam:authorization | 仅 UserInfo，交付本 Client 的已发布有效角色和有效全局角色。 |

自定义任职响应包含 `isPrimary`、`organization` 和 `position`，组织与责任目标采用[共用资料结构](README.md#单点登录的共同处理)。角色去重并稳定排序。
`iam:authorization` 的顶层和各任职仅含角色；不再返回权限点字段或空数组占位。Scope 名称和 allowedScopes 保持不变，无角色时返回空数组。接入应用须适配新响应，并清理或停用旧权限副本。
不返回数据库 ID、密码、状态、软删除字段或时间戳，也不混入 Custom wire。

具备 UserInfo 调用资格的应用可通过 `iam:custom_attributes` 读取用户已发布的目录自定义属性，仅配置 `openid` 的应用也适用。
获准披露任职时，直属 `organization` 和 `position` 各自在 `customAttributes` 提供属性值。键使用稳定的属性编码，单选值使用稳定的选项编码。
未填写的键与空属性对象均省略。值变更和定义启停随目录文档发布生效，已有有效 Token 的后续 UserInfo 查询会读取已发布版本。
[披露与发布时效](../adr/0054-disclose-directory-custom-attributes-to-all-eligible-clients.md)

UserInfo 的标准资料、任职和角色声明由 Client 当前 `allowedScopes` 决定。范围变化也适用于旧 Token，无论原请求 `scope` 或调用方传入的 `scope` 为何。
ID Token 在签名时固定 `iss`、`aud`、`sub`、`iat`、`exp`、`auth_time`，以及可选的 `nonce` 和 `profile`、`phone` 对应的声明。签发 ID Token 时，`profile` 和 `phone` 对应的披露基于已发布的完整用户资料生成；
角色可以返回已发布的旧版本，但必要用户资料缺失时整次交付会失败。详见[事实契约](../features/application-integration.md#用户信息共享)。

- **JWKS** ID Token 使用 RS256，JWKS 仅公开 kty/kid/alg/use/n/e，不交付私钥。

## HTTP、CORS 与流量限制

Token 端点错误采用标准 OAuth JSON 响应体，按场景返回 `401`（附 `WWW-Authenticate`）或 `503`（附 `Retry-After`），并附带 `Cache-Control: no-store`。
UserInfo `/me` 端点支持 `GET` 和 `POST`，接受 `Authorization: Bearer` 凭据；以 `application/x-www-form-urlencoded` 发起 `POST` 时，也可以在请求体中提交单个 `access_token`。
混用或重复传递凭据会返回 `invalid_request`，通过 query 参数传递 Token 会被拒绝。缺少凭据或 Token 无效时返回 `401` 及 Bearer challenge（无凭据时 challenge 不带 `error` 字段），不使用 IAM envelope。

各端点的 CORS 策略如下：

| 端点             | 预检（`OPTIONS`）                                               | 实际请求                                                                                                              |
| ---------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Discovery / JWKS | 回显请求 `Origin`；无 `Origin` 时不返回 `*`，不开放 credentials | `GET` 回显请求 `Origin`；无 `Origin` 时不返回 `*`，不开放 credentials                                                 |
| Token            | 不依赖请求体或 `client_id`，回显 `Origin` 与请求的 headers      | 仅允许 Public Client 已登记的 redirect origin；Confidential Client 不开放 CORS                                        |
| UserInfo         | 回显 `Origin` 与请求的 headers，声明允许 `GET`、`POST`          | 按 Token 所属 Client 当前登记的 redirect origin 校验（Public 与 Confidential 规则相同，不信任请求传入的 `client_id`） |
| 授权端点         | 不开放 CORS                                                     | 不开放 CORS                                                                                                           |

UserInfo 遇到 Client 维护状态（Maintenance）时返回 `503`（`temporarily_unavailable`）和 `Retry-After`，并保留已有 Cookie 和会话。
停用或切换协议配置仅拒绝当前访问，恢复配置后未终止且未过期的 Token 仍可继续使用。
修改配置、启停登录或轮换凭据不会自动撤销已有会话；Code 兑换失败仍遵守[兑换失败与重新登录](oidc.md#兑换失败与重新登录)。
Discovery、JWKS、health 与退出端点不受 Client 维护状态阻断；离线 ID Token 的 RP 验签仍可持续至原期限。

## 兑换失败与重新登录

Code 兑换失败或结果未知时，按[共同处理流程](README.md#单点登录的共同处理)重新授权。
Client 认证未通过或无法可靠定位原应用会话时，不消费 Code，也不撤销会话。
认证并定位后，参数、Maintenance、协议、PKCE、issuer、期限等检查失败均可能终止原应用会话，Code 尚未消费也不例外。
Public Client 的撤销门槛不要求先通过 PKCE；因此错误兑换也可能使同一应用会话的其他 Token 失效。
撤销仅针对原应用会话，不影响其他 IAM 登录会话、其他应用或后续新建的会话；若请求超时则结果未知，不能假定撤销已完成。
签名、Token 保存及响应交付失败不自动补偿或重签。精确顺序由[兑换实现](../../packages/oidc/src/tokens.ts)维护。

重新授权不会延长旧 Token 或 IAM 登录会话的有效期。已有有效 IAM 登录会话但要求重新认证时，端点返回 `login_required`；
首次登录必须完成 IAM 原有的认证续接流程，不能仅凭有效 IAM 登录会话跳过续接。普通回调允许列表编辑不会改写已受理的 Code 或续接记录中的 `redirect_uri` 与 `scope`。

## 退出确认与取消

使用 Discovery 的 end-session 端点。id_token_hint 须由原 issuer 签发且属于当前 Client；允许过期，但不能用它代替当前登录凭据。
post_logout_redirect_uri 必须同时携带合法 hint，并精确匹配登记地址；没有 hint 时使用默认落点，state 仅回传已接受的应用地址。
确认页固定已接受的退出地址和 state，提交时不能替换。配置维护或关闭应用登录不妨碍退出。

确认退出终止的是提交时刻的当前 IAM 登录会话；若确认页打开后更换了登录账号，实际退出的是新会话。
取消操作仅关闭本次确认，不会影响现有登录会话和 Token；重复提交同一确认会失败。若底层依赖故障或撤销结果未知，浏览器会保留原有 Cookie，此时不能认定退出已成功。
各标签页独立处理退出。接入方按[共同退出责任](README.md#单点登录的共同处理)处理本地会话与离线 ID Token。
密钥轮换及过期 hint 的兼容限制见[运维手册](../releases/authentication-and-session.md#签名密钥兼容边界)。
