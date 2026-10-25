# 第三方 Custom SSO 接入指南

本文介绍统一登录、Code 兑换、托管回调、用户信息、网关鉴权和退出的接入方式。
Custom SSO 是自定义协议；标准 OIDC 接入见[OIDC 指南](oidc.md)。
业务流程见[应用单点登录](../features/sso/single-sign-on.md)。

## 选择接入方式

| 回调类型                          | 业务系统负责什么                                                        | IAM 交付什么                              |
| --------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| [business](#business业务后端兑换) | 后端接收 Code、兑换 Token，并建立自己的本地会话。                       | Token、剩余期限和获准披露的主体信息。     |
| [managed](#managed托管回调)       | 为每个业务 origin 配置 `/sso/callback` 代理，并接入用户信息或网关鉴权。 | 业务域下的局部 Cookie，并跳回原落地地址。 |

两种方式都先完成下方 Client 配置和地址编码，再[发起授权](#发起授权)。
本文中的 UserSession 是 IAM 根登录，ClientSession 是该根与一个应用的关系；业务自建的本地会话由业务自行管理。

## 地址与接入配置

`{IAM_ORIGIN}` 表示实际访问入口，例如 `https://iam.example.com`。
先请求 `GET {IAM_ORIGIN}/sso/.well-known/authentication-configuration`，从响应 envelope 的 data 取得
authorizationEndpoint、logoutEndpoint、thirdPartyOAEndpoint；内外入口各从自己的 origin 发现。

| 端点              | 方法与用途                                        |
| ----------------- | ------------------------------------------------- |
| /sso/authorize    | GET，发起授权。                                   |
| /sso/callback     | GET，IAM 托管回调。                               |
| /sso/token        | POST，业务后端用 Code 换取协议 Token 与主体投影。 |
| /public/user-info | GET，按当前 Client 披露配置读取主体。             |
| /auth/authz       | GET，反向代理鉴权与最小用户 Header。              |
| /sso/logout       | GET，退出 IAM 根及其关联在线访问。                |

管理员为目标业务 Client 配置：

| 字段              | 接入含义                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------ |
| clientCode        | 不可变业务编码，授权 query 中使用 client。                                                 |
| ssoSecret         | business 兑换用的 SSO 专用凭据，与第三方可信登录的通用 clientSecret 独立；只保存在服务端。 |
| validRedirectUrls | 最终落地地址允许列表；支持 origin、一级子域 wildcard 和 path 末尾 /*。                     |
| subjectClaims     | 获准接收的主体字段，必须包含 Subject Identifier。                                          |
| callbackType      | managed 或 business，显式决定交付方式。                                                    |
| callbackEndpoint  | managed 禁止；business 必填固定完整回调，允许 query。                                      |

目标 Client 必须可通行、启用 SSO 并选择 Custom 协议。
生成或轮换后，管理员须另行读取 Secret；读取需要授权并记录审计，
详见[Client 配置](../features/admin/client-sso-configuration.md)。

## Client Code 与地址编码

Client Code 用于 Basic username、Client Header 或局部 Cookie 名时，
按 UTF-8 和 RFC 3986 URI component 规则编码为 transportClientCode：

| 原值            | transportClientCode                           |
| --------------- | --------------------------------------------- |
| legacy:client   | legacy%3Aclient                               |
| legacy/client   | legacy%2Fclient                               |
| 中文客户端      | %E4%B8%AD%E6%96%87%E5%AE%A2%E6%88%B7%E7%AB%AF |
| legacy%3Aclient | legacy%253Aclient                             |

字母、数字、点、下划线、波浪号、连字符保持不变，其余字节为 %HH。
64 字符上限按原值 Unicode code point 计数，不按 UTF-16 length 或编码后长度计数。
query 中直接把原值交给 URLSearchParams，避免预编码后再次编码。Cookie 名由 IAM 写入，业务端不用原值自行拼接。

redirectUrl 是登录后最终落地地址，callbackEndpoint 是接收 Code 的固定业务回调，二者用途不同。
允许列表按协议、host、端口、path segment 匹配；一级子域 wildcard 或末尾 /* 模式允许实际 query。
落地支持 fragment；允许列表指定 fragment 时精确匹配，未指定时不限制原 fragment，
fragment 内不展开通配。嵌套 URL 用 URL API 编码，兑换时保留完整原 fragment。

## 发起授权

```text
{IAM_ORIGIN}/sso/authorize?client=tender&redirectUrl=https%3A%2F%2Fbiz.example.com%2F&state=opaque-state
```

client、redirectUrl 必填，state 可选。浏览器通常携带 HttpOnly global_session；已有根时直接授权，
无根时进入统一登录页并通过服务端续接完成认证。新请求校验当前允许列表，续接/Code 固定已接受地址；
普通列表编辑不改写它，callbackType 改变要求重新授权。

Code 只能消费一次，成功结果不重放。根 UserSession 期限固定；
Token 有效期取协议 TTL、根及 ClientSession 剩余期限的最小值，响应 ttl 以秒表示。
普通访问、其他 Client 活动及新授权不延长旧 Token，也不提供 refresh 或 Cookie 滑动续期接口。
新接入不要通过 query 传根 Token；现有兼容入口仍接受 token，第三方可信登录的既有跳转也仍使用它。

## business：业务后端兑换

IAM 跳转固定 callbackEndpoint，并追加 code、client、redirectUrl 和可选 state。
业务后端取得 Code 后提交：

```http
POST {IAM_ORIGIN}/sso/token
Authorization: Basic {base64(transportClientCode:ssoSecret)}
Content-Type: application/x-www-form-urlencoded

code={urlencoded_code}&redirect_uri={urlencoded_original_redirect_url}
```

不接受 query、JSON body、Bearer client authentication 或浏览器 preflight；字段不能重复或带未知参数。
成功响应示例：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "sid": "opaque-custom-token",
    "ttl": 300,
    "subject": {
      "version": 3,
      "subjectIdentifier": "00000000-0000-4000-8000-000000001001",
      "profile": { "username": "138550", "name": "张三" }
    }
  }
}
```

subject 仅包含当前 Client 选择的字段，授权只含该 Client 的角色，不含数据库 ID 或兼容别名。
完整主体仅接受 wire v3，`authorization` 及其每条任职只交付角色，不再包含权限点字段或空数组占位。
`subjectClaims` 的名称和选项保持不变；接入方须适配新响应，并在恢复访问前清理或停用旧权限副本。
业务后端自行建立本地会话、关联 sid、设置自己的 HttpOnly Cookie，再跳回原 redirectUrl；
IAM 不建立或存储第三方自有 session。

遇 500、503 或响应结果未知时，放弃旧 Code，按 Retry-After 等待后重新授权，不重放 token 请求。
认证、参数或配置错误应先修正。认证并定位会话后发生的拒绝，即使是消费前的 Maintenance，也会尝试终止原 ClientSession。
旧应用 Token 可能因此失效，有效根仍可重新授权。
诊断 Header 分别报告 Code 消费、会话撤销和 Token 补偿结果；失败后仍须重新授权。
三个诊断 Header 为 `X-IAM-Code-Consumption`、`X-IAM-Client-Session-Revocation`、`X-IAM-Token-Compensation`。
unknown/failed 不表示撤销成功；响应构造完成也不保证调用方已收到。managed 只报告消费和 Token 补偿，不返回业务兑换的会话撤销 Header。
具体结果类型和错误映射见[协议操作](../../packages/custom-sso/src/unified/operations.ts)。

## managed：托管回调

管理员为每个允许落地 origin 配置根路径 /sso/callback 到 IAM 的代理。IAM 首次校验完整落地后推导
`new URL(redirectUrl).origin + "/sso/callback"`，保留协议、主机、非默认端口，不复制业务 path/query。
请求 Host/Forwarded 不决定目标，代理可以改写 Host。

托管 callback 校验原 Code、用途、地址、会话关系与当前访问条件，一次消费成功后才签发 Token、写局部 Cookie，
并 302 回原落地。局部 Cookie 名为 `local_{transportClientCode}_session`；
它是实际回调主机的 host-only Cookie，HttpOnly、SameSite=Lax、Path=/，当前实现没有 Secure 属性。
URL 交付 token 和原 state。

失败返回 JSON。返回业务应用重新发起授权，不刷新携带旧 Code 的 callback。
消费后的签发或响应构造失败时，Code 保持已消费，仅尽力清理本次已知 Token，保留共享 ClientSession。
账号明确失效时仍按账号规则拒绝和撤销。
补偿失败/未知的 Token 可能留存至到期或会话终止。

## 用户信息与 Gateway 鉴权

business 和 managed Token 均可用于默认公共用户接口：

```http
GET {IAM_ORIGIN}/public/user-info
Client: {transportClientCode}
Authorization: {sid}
```

Authorization 直接使用 sid，不加 Bearer 前缀。服务端优先读取该 Client 的局部 Cookie，缺少 Cookie 才使用 Header。
`Client: iam` 专用于根 UserInfo，须使用 global_session/UserSession Token，不能传应用 Custom Token。

响应 data 是当前 Client 获准接收的 V3 主体。旧 Token 同样采用当前 subjectClaims；
主体资料可能落后于源事实，接入方负责自己副本的刷新；根、原实例或账号失效仍独立阻止访问。
共有披露与时效保证见[主体信息交付](../features/sso/subject-delivery.md)。

网关请求：

```http
GET {IAM_ORIGIN}/auth/authz
Client: {transportClientCode}
Authorization: {sid}
X-Forwarded-Uri: /business/path
```

Client 和 X-Forwarded-Uri 必填，优先使用局部 Cookie。成功把相同 Base64 JSON 同时放入响应 data 和 X-User-Info：

```json
{ "version": 1, "subjectIdentifier": "00000000-0000-4000-8000-000000001001", "username": "138550", "name": "张三" }
```

subjectIdentifier 必有，username/name 仅在允许时出现。数据库 ID、phone、任职和授权不进入该 Header；
仅主体不读 Facts。authz 不做接口级角色判定，业务系统仍负责自己的授权。

| 情况                                                   | 接入方处理                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Header/Client 编码非法，或当前 Client/SSO/协议配置拒绝 | 400；修正配置，不把它当 Token 到期。该配置错误不触发 Cookie 清理或实例撤销。                                       |
| Token/根/实例明确失效或账号明确拒绝                    | 401；重新授权，第三方自行处理本地 session。Cookie 来源的明确失效可清对应 Cookie；Client/用途不匹配不触发这种清理。 |
| Maintenance                                            | 503、AUTH.MAINTENANCE 与 Retry-After；在线 UserInfo/authz 保留有效 Cookie，可重试原访问。                          |
| Snapshot、账号状态或 Facts 暂时不可确认                | 503；保留仍有效凭据，按 Retry-After 重试访问。Code 兑换仍用前述重新授权策略。                                      |

IAM Client 的交付配置不可用时，仍保留全局 Cookie。
根成功终止后，即使子索引漏项或 Token 仍物理存在，后续在线使用仍拒绝。

## 第三方可信登录：OA 与微信

已有可信登录态的第三方可通过 OA 签名入口建立或复用 IAM 根，再授权目标业务系统。
路径 clientCode 表示**发起认证的系统**，用于读取通用 clientSecret；query client 表示**目标业务系统**。
二者可以不同，redirectUrl 始终属于目标。源凭据直接从源 Client 读取，此处不检查其 status/isDelete，也不使用目标 SSO 配置。
后续 authorize 再检查目标 Client 的访问条件和落地地址。

```http
GET {IAM_ORIGIN}/sso/thirdparty/{sourceClientCode}?loginid={username}&ts={timestamp_ms}&token={signature}&client={targetClientCode}&redirectUrl={encoded_url}
```

loginid、ts、token、client、redirectUrl 必填，state/ssoReturn 可选并透传；ssoReturn 是既有续接 handle。
用户须为 active 且 Formal 正式员工。production 校验毫秒时间与服务端偏差严格小于 5 分钟，发送方应同步时钟。
签名为 `Base64(SM3(loginid + "|" + ts + "|" + clientSecret + clientSecret))`；
对 SM3 摘要的原始字节做标准 Base64 编码，不能编码其十六进制文本。
以下服务端示例同时正确编码路径、Base64 和嵌套 URL：

```ts
import { sm3 } from "sm-crypto";

const ts = String(Date.now());
const digest = sm3(`${loginid}|${ts}|${clientSecret}${clientSecret}`);
const token = Buffer.from(digest, "hex").toString("base64");
const url = new URL(`/sso/thirdparty/${encodeURIComponent(sourceClientCode)}`, iamOrigin);
url.searchParams.set("loginid", loginid);
url.searchParams.set("ts", ts);
url.searchParams.set("token", token);
url.searchParams.set("client", targetClientCode);
url.searchParams.set("redirectUrl", "https://biz.example.com/");
return redirect(url.toString());
```

OA 同主体有效根复用原 Token/剩余期限；不同主体有效根先退出再创建新根。
成功后写入适用 global_session Cookie，302 到相对 /sso/authorize，透传目标、地址、state/ssoReturn；
既有跳转仍带根 token query，日志与代理需要按敏感值处理。

微信入口为 `GET /sso/third-party/wx`，使用微信 code 加同样的目标/续接参数。
服务端交换 wxId 并查 active 用户，没有 OA 的 Formal 类型限制；成功创建新根，不复用传入根。
两种入口的全局 Cookie 均使用 HttpOnly、SameSite=Lax、Path=/、剩余秒数，当前未设置 Secure。

## 退出与接入方责任

浏览器请求 `/sso/logout?redirectUrl={encoded_after_logout_url}`，优先使用 global_session；
兼容 token 参数接受根 Token，也可用 Custom 应用 Token 定位原根。退出无需账号访问许可，仅终止该根。
第三方自有 session 和离线 ID Token 须由接入方处理，IAM 不发送后台退出通知。
business 应先清理自己的 Cookie/session，再退出 IAM；单独清应用 Token 不等于清理整个第三方登录态。

SSO Secret 与通用 clientSecret 不混用、不下发前端；日志不记录明文 Token/Code/Secret。
sid 保存在业务服务端，浏览器使用业务自己的 HttpOnly Cookie。
IAM 侧状态维护见[统一维护手册](../releases/authentication-and-session.md)，
代理配置及现场检查见[Gateway 发布手册](../releases/apisix-gateway-release.md)。
