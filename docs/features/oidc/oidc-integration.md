# OIDC 接入与协议契约

API 的 `/oidc` HTTP adapter 与 `@iam/oidc` 提供本文契约。
接入方先读[接入流程](#接入流程)，实现维护者再读[协议实现契约](#协议实现契约)中的状态绑定、处理顺序和失败作用。
决策见
[ADR-0035](../../adr/0035-unify-user-and-client-session-lifecycles.md)、
[ADR-0036](../../adr/0036-bind-oidc-to-internal-and-external-issuers.md)。

## 接入流程

### 接入与端点

Issuer 是以 `/oidc` 结尾的完整 URL，例如 `https://iam.example.com/oidc`。
通过 `GET {issuer}/.well-known/openid-configuration` 发现 authorization、token、JWKS、UserInfo 和 end-session 端点。
内外入口可能使用不同 issuer；RP 固定使用预期 issuer 的端点并校验响应身份，共享公钥与 sub 不使两个 issuer 等价。
产物跨入口使用的具体影响见[双 issuer](#双-issuer)。

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
成功兑换清除该 Client/IP 计数。该门槛拒绝不消费 Code、不撤销会话。
客户端 IP 的可信代理配置见[发布前提](../../releases/authentication-and-session.md#oidc-双入口配置)。

### 最小接入示例

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
已认证且定位原实例后的失败可能终止已有应用会话，见[失败作用](#code-兑换顺序与失败作用)。
退出使用 Discovery 的 end-session 端点；提供 `id_token_hint` 和已登记的 `post_logout_redirect_uri`，
由 IAM 确认页完成退出。第三方仍负责清除自己的本地会话，详细规则见[退出确认与取消](#退出确认与取消)。

### Redirect、参数与浏览器导航

redirect URI 与 post-logout redirect URI 是绝对 HTTP/HTTPS URL，允许 query，禁止 fragment、通配与模板变量。
匹配完整原始字符串，不规范化 host 大小写、默认端口、路径、query 顺序、百分号编码或末尾斜杠。
生产优先 HTTPS，受控 HTTP 接入的网络边界由部署负责人核验。

授权支持 query、fragment、form_post。已确认安全地址上的成功和标准错误按所选 mode 返回；
form HTML 转义地址、state 和全部字段，使用 no-store/no-referrer。
未确认安全地址、重复必要参数或编码错误返回本地标准 JSON，不使用 IAM REST envelope 或通用 422。

未知参数及关闭的 claims/resource 被忽略；request、request_uri、registration 返回各自 not-supported 错误。
scope 去重，忽略不支持的 offline_access。`prompt` 只接受 none/login，none 不可组合；
max_age 为非负安全整数，0 要求新鲜认证。这些兼容行为不代表支持 claims、MFA 或 offline access。

`IAM_API_LOGIN_ENDPOINT` 是安全根相对路径。登录、续接、退出确认及默认成功页保持当前入口；
拒绝绝对/协议相对 URL、反斜杠、控制字符和改变 authority 的歧义路径。
Portal 对发现的完整端点先验证属于当前入口，再构造相对导航；登记的业务 redirect 保持完整地址。

### Token、Scope 与当前披露

| Scope             | 披露                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| openid            | 稳定 Subject Identifier 作为 opaque sub。                                                        |
| profile           | name、preferred_username，不隐含任职。                                                           |
| phone             | 存在时返回 phone_number。                                                                        |
| iam:employments   | 仅 UserInfo 的有效任职与 responsibility；不进入 ID Token。                                       |
| iam:authorization | 仅 UserInfo 中当前 Client 的已发布角色，不含其他 Client 授权或 responsibility；不进入 ID Token。 |

IAM 任职 wire 保持 isPrimary、orgCode/orgName/orgType/fullOrgPath、posCode/posName，角色去重并稳定排序。
`iam:authorization` 的顶层和各任职仅含角色；不再返回权限点字段或空数组占位。Scope 名称、现有 allowedScopes
及角色为空时的空数组语义保持。接入应用须升级消费契约，并负责清理或停止使用自己保存的旧权限副本。
不返回数据库 ID、密码、状态、软删除字段或时间戳，也不混入 Custom wire。
UserInfo 以当前 Client allowedScopes 构造披露，新增和收窄均适用于旧 Token；原请求 scope 不再作为交集上限，
也不接受调用方 scope 覆盖。ID Token 内容在签名后固定：显式映射 iss/aud/sub/iat/exp/auth_time、可选 nonce 及
profile/phone；仅 sub 或 IAM 扩展 scope 不读取完整 Facts。没有 Claims Snapshot。
已发布旧角色可继续交付，必要 Facts 不可得时失败，不能省略声明伪装成功；详见[事实契约](../sso/published-subject-facts-contract.md)。

ID Token 使用 RS256，JWKS 仅公开 kty/kid/alg/use/n/e，不交付私钥。

### HTTP、CORS 与流量限制

Token 错误采用标准 OAuth body，保留适用 401/WWW-Authenticate、503/Retry-After 和 no-store。
UserInfo `/me` GET/POST 接受 Authorization Bearer；form POST 也可使用单一 access_token，
混用或重复为 invalid_request，query bearer 拒绝。无凭据/无效 Token 为 401 Bearer challenge，
无凭据时 challenge 不带 error；不套 IAM envelope。

Discovery/JWKS GET/OPTIONS 回显 Origin，无 Origin 时不返回 wildcard，不开放 credentials。
Token OPTIONS 不依赖 body/client_id，反射 Origin/请求 headers；实际 POST 只允许 Public 登记 redirect origins，
Confidential 不开放实际 Token CORS。UserInfo 预检反射 Origin/headers、声明 GET/POST，
实际请求按 Token 所属 Client 当前 redirect origins 检查，两类 Client 相同，不信任请求 client_id。
授权不开放 CORS。

在线 UserInfo 遇 Maintenance 返回 temporarily_unavailable/503 和 Retry-After，保留可恢复 Cookie，不执行兑换失败撤销。
配置暂停/切换只拒绝当前访问，切回后未终止且未到期的 Token 可以恢复。
配置/启停/轮换自身不自动撤销；Code 兑换失败仍遵守[失败作用矩阵](#code-兑换顺序与失败作用)。
Discovery、JWKS、health 与退出不被 Client Maintenance 阻断；离线 ID Token 的 RP 验证仍可持续至原期限。

## 协议实现契约

### 双 issuer

内外入口分别派生固定 issuer，相同 origin 使用同一身份；未知/非法可信入口拒绝请求。
配置错误在启动时整体失败，不靠请求 Host/Forwarded 猜测另一套 issuer。
两个 issuer 共享 Client、当前凭据、scope/redirect、Subject Identifier、current/previous signing keys 与中性会话关系。
RP 必须验证预期 issuer，共享公钥和 sub 不使两个 `(iss, sub)` 自动等价；发现缓存按完整 issuer 区分。

| 对象                | 绑定与比较顺序                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Discovery、授权响应 | 按本次 issuer 返回完整端点；授权成功及安全回调错误带 iss，并声明 authorization_response_iss_parameter_supported。 |
| 认证续接            | 保存原 issuer；guard/resume 在读取根、允许完成、消费或清 Cookie 前比较。                                          |
| Code                | 服务端记录保存原 issuer；沿认证、实例定位和一次取删顺序，在取出后比较。错 issuer 不签 Token，进入原实例失败撤销。 |
| ID Token            | iss 来自已匹配的原授权事实，不改签为另一入口。                                                                    |
| Access Token        | 保存 issuer；UserInfo 在读取根、ClientSession 和主体之前拒绝错入口。                                              |
| hint、退出确认/取消 | 按本次 issuer 验证；状态消费、根作用和 Cookie 修改前拒绝不匹配。                                                  |
| JWKS                | 两个 issuer 发布共享 current/previous 公钥。                                                                      |

Continuation、UserInfo 和退出错误不套用 Code 兑换撤销。两个 issuer 的 Token 可引用同一 ClientSession，
因此错误入口兑换所触发的原实例终止，也会使正确入口的相关在线 Token 失效；这不是 issuer 独立会话。

### 授权与认证续接

`createOidcAuthorization` 每次授权、guard 或 resume 取得一次当前 Snapshot，校验 Client/Gate/协议，
可信根解析后取得一次账号许可。授权不读取 Facts，不冻结主体披露，也不延长根。
有效根可直接授权；要求重新认证的有效根返回 login_required，不创建重复认证/MFA 流程。
明确失效由 adapter 清 Cookie；Redis 故障或未知依赖保留。

无根时，服务端续接保存首次接受的 client、redirect、scope、state、mode、PKCE、nonce、prompt、max_age 和 issuer，
返回随机 oidcReturn。`oidc_interaction_binding` 为 HttpOnly、SameSite=Lax、Path=/oidc，
Secure 由正式配置决定。guard 返回最小 `{ decision }`，页面规则见[登录与恢复](../sso/authentication-and-recovery.md)。

guard 明确允许首次登录时签发 `oidc_login_completion`，其摘要绑定续接。
匹配证明允许首次登录完成越过 prompt=login/max_age=0 的重认证拒绝；普通续接不新增 completion 前提。
resume 校验原状态和浏览器绑定、当前 Gate/协议/账号条件，再一次消费续接并 open 关系、签发 Code。
后续配置编辑不重审首次接受的 redirect/scope；停止、切换、恢复配置本身不删除续接。
关系损坏或索引类型异常返回 temporarily_unavailable，保留根、不签 Code、不撤销；
明确缺失、过期或终止才归为 login_required。没有 handle 的有效根不能替代续接状态。

### Code 兑换顺序与失败作用

Code 为 `Code ID.UserSession ID.ClientSession ID`，摘要定位绑定 Client、原根、原子实例与 Code ID。
记录保存不可变实例身份、原授权事实和 Redis 固定期限；不创建消费墓碑或 Kernel 第二登记。
`createOidcTokens().forOperation(operation).exchange(input, deliver)` 包含签名、保存和响应构造。

1. 取得当前配置并完成适用 Client 认证。Public 的 none 例外以当前 OIDC Client 类型为准，不从旧请求猜测。
2. 有界解析 Code；中性定位原 UserSession 与同根同 Client 的原 ClientSession。归属不符或无法可靠定位时不猜目标。
3. 定位后检查 Gate、所选协议、grant_type、参数与 Origin；随后按精确摘要一次 GETDEL。
4. 只有明确取得者继续核对 payload、原实例、期限、issuer、redirect、S256、账号许可及会话有效性。
   原 scope/redirect 不按后续允许列表重审。
5. 先准备并签名 ID Token，再保存 Access Token，最后交付。

| 失败位置                                                             | 消费与撤销                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Client 认证未通过、格式不明或无法定位原实例                          | 不消费，不猜测撤销目标。                                            |
| 已认证并定位，Gate/Maintenance、协议、参数或 Origin 拒绝             | consumption=not_attempted，仍有界尝试终止原 ClientSession。         |
| GETDEL 缺失、竞争失败、消费未知，或取得后期限/issuer/PKCE/许可等失败 | 不恢复 Code，仍按原身份尝试终止；不签发替代结果。                   |
| 签名、Token 保存或交付失败                                           | 不重放签名、不恢复 Code、不增加 OIDC Token 补偿；原实例撤销仍尝试。 |

Public 不要求消费前 PKCE 成功；知道同 Client 的合法根/实例定位者可构造缺码触发该实例撤销。
正确与错误入口并发兑换时，失败方也可能终止共享实例，使正确方晚到 Token 无法在线使用。
不要把“不消费”解释为“无会话作用”。

`OidcExchangeFailure` 保留原错误、not_attempted/consumed/missing/unknown 和精确撤销结果。
每请求一次撤销，默认等待 1000ms，可配置 1–5000ms；超时保持 unknown，命令仍可能晚到。
只作用于原 ID/instance，不终止 UserSession、其他 Client 或新实例，也不因兑换失败清根 Cookie。
没有后台补偿或成功结果重放；有有效根时重新授权取得新 Code。

### Token 状态与期限

Token 摘要记录是唯一权威，独立 UUID 反向键仅用于管理且不保存 bearer。
签发期限受协议 TTL 与原会话上限裁剪；访问、兑换和其他授权不延长旧 Token。
在线解析验证 oidc_access 用途、issuer、期限、当前 Client、原根/实例和本操作账号许可，
不比较可变 ClientSession.protocol。已观察的在途请求不在交付前复查，原根终止后新使用不依赖子索引。

签名配置包含完整 current/previous RSA 私钥、alg=RS256 和唯一非空 kid；只有 current 签名。
轮换步骤见[签名密钥轮换](../../releases/authentication-and-session.md#oidc-签名密钥轮换)。

### 签名密钥兼容边界

密钥只在进程启动时加载，没有热更新或独立多代验证集合；current/previous 都要求 private JWK，不接受 public-only previous。
两个槽不能同时容纳已有 previous P、current A 与新 key B；P 仍需验证时不能直接覆盖为 A。
两槽配置也不自动提供无缝滚动轮换保证。

旧普通 ID Token 的接受期下界为：全部旧 signer 停止并排空后最后可能签名时点上界，加实际最长 TTL 与接入应用时钟宽限。
代理/RP 的 JWKS 缓存不延长 Token expiry，但可能延迟新 key 可见，需分别确认缓存刷新和未知 kid 重试行为。
IAM 退出 hint 刻意允许过期 ID Token，未按 exp 定义退役期限，故等待普通 TTL 不能证明旧 key 可移除。
保持既有 hint 兼容就必须保留其 key；多代验证、滚动轮换及 hint 退役政策见
[讨论 #263](https://github.com/cyy1998/shgas-iam/issues/263)，不能视为已实现能力。

新 key 已签发 Token/hint 后，回退同样必须包含它及其他仍需接受的 key。共享 key 不取消各协议产物的 issuer 归属检查。

### 退出确认与取消

`createOidcLogout` 拥有 `/session/end` GET/form POST、`/session/end/confirm` form POST 和默认成功页。
hint 由共享 current/previous owner 验证 RS256、可信 kid、正确 issuer、单 Client audience 和 subject；
显式 client_id 必须匹配。允许过期 ID Token 作 hint，但它不是当前根认证。
post_logout_redirect_uri 必须带合法 hint 并精确匹配登记地址；无 hint 使用安全默认落点，
state 只在已接受 RP 地址回传。未知配置故障暂态保留 Cookie，Maintenance/SSO 停用不妨碍退出。

已接受 Client、hint 摘要/主体、redirect/state 固定到确认状态，不接受提交覆盖或后来允许列表编辑。
未知地址、坏 hint、重复参数或 CSRF 失败本地返回错误。HTML 不嵌 hint、根 bearer 或 Client 原文；
CSP 只允许本地表单及已接受 RP origin。
logout 状态保存 Redis 固定期限、浏览器绑定和 CSRF 摘要；两个 Cookie 均 HttpOnly、SameSite=Lax、
Path=/oidc/session/end，Secure 由正式配置决定。随机 handle、绑定和 xsrf 必须匹配后按原字节一次消费。

提交 `logout=yes` 确认时，只中性解析并精确终止**该提交请求观察到的根**，不要求新账号许可；
页面显示后换根会作用于新请求的根，不冻结原页根。明确无根、过期或已终止以及成功退出清 global_session；
Redis、坏状态、配置故障或撤销 failed/unknown 返回 503 并保留 Cookie。
取消不提交 logout，只消费确认状态、清本次确认 Cookie，不读/撤销根，不清 global_session 或 Token。
无有效根仍沿自动 POST 完成；重放确认失败，不新增跨标签页或 Cookie 响应顺序保证。
第三方本地会话、离线 Token 和额外退出通知由接入方负责。

## 维护与验证

`@iam/oidc/maintenance` 清空所选 namespace 中 OIDC owner 的全部协议状态，包括损坏记录与孤立索引；
不按 Client 筛选，其他 namespace 和 owner 保留。清理范围、执行前提和独立核验见
[统一维护手册](../../releases/authentication-and-session.md#会话清理)。

`/wire` 供浏览器消费，`/testing` 仅提供状态观察和故障注入。HTTP/Redis、真实浏览器、独立 RP 和
官方套件分别证明不同事实，见[验证归属](../../architecture/architecture-verification.md)、
[协议套件命令](../../development/commands.md#oidc-协议套件)。
