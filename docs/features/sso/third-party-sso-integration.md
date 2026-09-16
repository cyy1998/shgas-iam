# 第三方业务系统 SSO 单点登录对接说明

## 1. 文档目的

本文面向需要接入上海燃气 IAM SSO 的第三方业务系统，说明业务系统如何通过 IAM 完成统一登录、取得 IAM 授予结果、建立本系统会话、读取当前用户信息以及退出登录。

当前 IAM SSO 是自定义授权码流程，不是标准 OIDC/OAuth2 协议。整体模式是：

1. 业务系统将浏览器重定向到 IAM SSO 授权端点。
2. IAM 校验全局登录态；未登录时进入统一登录页，已登录时签发一次性授权码。
3. IAM 将浏览器带着授权码重定向回业务系统回调地址。
4. Independent 业务系统用授权码取得 IAM 管理的 credential，再自行建立本地会话；Gateway client 则由 IAM 建立
   Gateway Local Session。

主体资料和 `iam:authorization` 使用 IAM 已发布的事实；源角色或权限已改变但发布尚未完成时，
兑换与 UserInfo 仍可能交付旧权限，重建持续失败时该窗口可以持续，不承诺固定撤权传播期限。
第三方复制到自有会话或存储后自行负责刷新，IAM 不新增推送撤权或强制刷新机制；账号禁用保护与 Client 裁剪保持。
无法取得合法资料时仍按本文的暂态失败规则处理，兑换重新授权，UserInfo 使用原有效凭据重试。

## 2. 基础地址与端点

生产或测试环境的 IAM 基础地址由部署环境提供，以下使用 `{IAM_ORIGIN}` 表示，例如 `https://iam.example.com`。
IAM 会按入口网络返回内网或外网 SSO 端点；业务系统应从实际访问的入口域名调用 well-known 端点。

可先访问 well-known 端点获取当前环境的 SSO 端点：

```http
GET {IAM_ORIGIN}/sso/.well-known/authentication-configuration
```

响应示例：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "authorizationEndpoint": "{IAM_ORIGIN}/sso/authorize",
    "logoutEndpoint": "{IAM_ORIGIN}/sso/logout",
    "thirdPartyOAEndpoint": "{IAM_ORIGIN}/sso/thirdparty/oa"
  }
}
```

常用端点：

| 端点 | 方法 | 用途 |
|---|---|---|
| `/sso/authorize` | GET | 发起 SSO 授权登录 |
| `/sso/callback` | GET | 网关托管模式下的 IAM 回调处理端点 |
| `/sso/token` | POST | 独立应用模式下用授权码换取 Independent Client Credential 与受控主体投影 |
| `/sso/logout` | GET | 退出 IAM 全局会话并终止相关 IAM credential/session |
| `/public/user-info` | GET | 按当前 Client 配置获取受控主体投影，需要有效 IAM credential/session |
| `/auth/authz` | GET | 网关鉴权端点，可用于反向代理统一鉴权 |

## 3. 接入前准备

接入前需要在 IAM 管理端注册业务系统客户端，并确认以下配置。

| 配置项 | 说明 |
|---|---|
| `clientCode` | 业务系统唯一编码。发起授权时作为 `client` 参数传入，例如 `tender`。 |
| `ssoSecret` | Custom SSO 专用客户端密钥。仅 Independent 模式兑现 grant 时使用，与通用 `clientSecret` 无关；普通详情不含明文，生成/轮换及超级管理员审计重读通过独立能力交付，必须保存在服务端。 |
| `validRedirectUrls` | 允许登录完成后返回的业务地址 pattern 列表。支持 origin、一级子域 wildcard（如 `https://*.example.com`）和 path 末尾 `/*`；命中任一 wildcard pattern 的实际地址可携带查询参数。 |
| `subjectClaims` | 该 Client 获准接收的主体字段；必须包含 Subject Identifier，其他 Profile、任职和授权字段按需选择。 |
| `callbackType` | 管理员必选 `managed`（托管回调）或 `business`（业务回调）；不根据 URL 判断。业务回调禁止开启 ORCAS。 |
| `callbackEndpoint` | 唯一完整回调地址，允许 query；托管地址不限域名及路径，管理员负责实际代理到 IAM。 |
| `orcas.enabled` | 仅托管回调实际执行。启用时 IAM 额外交付 ORCAS Cookie/query/专用 endpoint；ORCAS 不进入主体投影。 |

建议业务系统至少准备以下地址：

| 地址 | 归属 | 说明 |
|---|---|---|
| `https://biz.example.com/` | 前端 | 业务系统首页或登录后落地页，作为 `redirectUrl`。 |
| `https://biz.example.com/auth/callback` | 后端 | 业务自行接收 IAM 授权码。 |

## 4. 登录流程

### 4.1 发起授权

当业务系统发现用户未登录时，将浏览器重定向到：

```text
{IAM_ORIGIN}/sso/authorize?client={clientCode}&redirectUrl={urlencoded_redirect_url}
```

参数说明：

| 参数 | 必填 | 说明 |
|---|---|---|
| `client` | 是 | IAM 中注册的 `clientCode`。 |
| `redirectUrl` | 是 | 登录成功后最终回到业务系统的地址，需要 URL 编码。 |
| `token` | 否 | 已有 IAM UserSession token 时可传入。该 query 参数仅为 legacy 兼容路径，新 client 不应使用 URL query 传递 UserSession token。浏览器场景通常依赖 HttpOnly Cookie。 |

示例：

```text
https://iam.example.com/sso/authorize?client=tender&redirectUrl=https%3A%2F%2Fbiz.example.com%2F
```

IAM 处理逻辑：

1. 校验 `client` 是否存在。
2. 校验 `redirectUrl` 是否命中客户端的 `validRedirectUrls` pattern；匹配按 URL 结构比较协议、host、端口和 path segment 边界。
3. 如果浏览器没有有效 `global_session`，重定向到统一登录页。
4. 登录成功后重新进入 `/sso/authorize`，签发一次性 `code`。
5. 根据客户端接入模式跳转到回调地址。

授权码有效期由 IAM API 环境变量 `IAM_API_AUTH_CODE_TTL_SECONDS` 控制，默认部署示例为 300 秒。授权码只表达一次
Custom SSO Authorization Grant，不是登录会话，也不应在前端长期保存。

按 [Spec #163](https://github.com/cyy1998/shgas-iam/issues/163) 的 #164 代码候选，Custom SSO 授权只验证根会话，不延长它。
Independent Credential 与 Gateway Local Session 均使用 `fixed_at_issue`：签发期限取配置 TTL、当次 Redis 观察的根当前期限和
根绝对期限的最早值。例如根只剩五分钟，新 Credential 最多五分钟。普通访问、同根其他 Client 活跃、OIDC 根续期或 Maintenance
均不延长已签发凭据。Independent 响应 `ttl` 和 Gateway Cookie `Max-Age` 使用同一次签发观察的剩余毫秒向上取整为秒；
到期后重新授权，没有 refresh token、滑动续期或 Cookie 刷新接口。OIDC 自身根与 Binding 的原续期规则保持。

这是代码候选，环境尚未切换，不能混跑部署。旧 `extend_with_principal` 对象须按
[ADR-0033](../../adr/0033-trust-issued-credentials-without-principal-session-revalidation.md) 和
[在线认证状态维护手册](../../releases/online-auth-redis-time-cutover.md) 停流、排空旧 writer，执行现有全体下线与独立 verify 后统一启用新版本。
本票不交付存量 policy 迁移；IAM 全体下线不保证第三方自建会话或离线 ID Token 退出。

### 4.2 网关托管模式

网关托管模式适合业务系统和 IAM 位于同一访问域或同一反向代理下，由网关把配置的业务回调地址转发到 IAM 的 `/sso/callback`。

IAM 授权成功后使用 Client 配置的固定完整 callback，不从业务落地地址推导：

```text
{Client配置的完整callbackEndpoint，并保留非协议query参数} + code/client/redirectUrl
```

IAM 的 `/sso/callback` 在 Client/原 Code 用途/redirect、两类会话关系、Snapshot 和 Subject Access 校验通过后一次消费 Code，成功消费才执行 ORCAS 与 Local Session 签发。现有交付行为保持：

1. 校验授权码和 `redirectUrl`。
2. 为该业务系统创建 IAM 管理的 Gateway Local Session。
3. 写入 HttpOnly Cookie：`local_{transportClientCode}_session={sid}`。
4. 302 跳转回原始 `redirectUrl`，并在 URL 查询参数中附带 `token={sid}`。

Cookie 为 host-only，属于实际访问回调的主机，不跨主机同步。托管/业务由 `callbackType` 决定，与路径及大小写无关。

业务系统后续可以通过 Cookie 使用局部会话；如前后端分离或跨域调用，也可以读取回调 URL 中的 `token` 后交给业务后端建立自己的会话。

Gateway callback 失败继续返回现有 JSON。用户应返回业务应用重新发起访问，不要刷新携带旧 Code 的 callback；暂态失败可按
`Retry-After` 等待后重新授权，不自动循环跳转。有有效根会话时通常无需重新输入凭据，暂态失败不会清除有效根 Cookie。
消费成功后的 ORCAS 失败、IAM 签发失败或成功响应丢失均不恢复原 Code。ORCAS 可能已经创建外部会话但返回不可用；新授权可能
再次登录 ORCAS，IAM 不提供外部幂等、查询或撤销保证。写入结果不确定时只同步尽力撤销本次 Credential；未交付残留继续受自身期限、
账号、Client 版本与撤销约束；新签发的未交付 Credential 同样固定到期，不因根续期延长。

### 4.3 独立应用模式

独立应用模式适合业务系统完全自管后端会话。IAM 授权成功后会重定向到客户端注册的 `callbackEndpoint`：

```text
https://biz.example.com/auth/callback?code={code}&client={clientCode}&redirectUrl={urlencoded_redirect_url}
```

业务系统后端收到回调后，通过 HTTP Basic 认证和 form body 调 IAM 兑现 Authorization Grant，换取 Independent
Client Credential。Basic username 使用下文定义的 `transportClientCode`，即
`transportClientCode:customSsoSecret` 经过 Base64 编码；`redirect_uri` 必须与签发 grant 时绑定的地址完全一致：

```http
POST {IAM_ORIGIN}/sso/token
Authorization: Basic {base64(transportClientCode:customSsoSecret)}
Content-Type: application/x-www-form-urlencoded

code={code}&redirect_uri={urlencoded_redirect_uri}
```

该端点不接受 query 参数、JSON body、Bearer client authentication 或浏览器 preflight。成功响应包含 IAM credential
`sid`、剩余有效期和当前 Client 获准接收的 V2 主体投影：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "sid": "independent-client-credential",
    "ttl": 86399,
    "subject": {
      "version": 2,
      "subjectIdentifier": "00000000-0000-4000-8000-000000001001",
      "profile": {
        "username": "138550",
        "name": "张三"
      }
    }
  }
}
```

`subject` 只包含 Client 当前 `subjectClaims` 选择的字段，不包含 IAM 数据库用户主键，也不提供 `id`、`userInfo`
等兼容别名。若选择授权字段，IAM 只返回该 Client 范围内的 roles/privileges。

业务系统应在服务端完成以下处理：

1. 校验响应成功。
2. 将 `sid` 与本系统自行创建的用户会话绑定；`sid` 本身仍是 IAM 管理的 Independent Client Credential。
3. 设置业务系统自己的 HttpOnly Cookie。
4. 302 跳转回 `redirectUrl`。

IAM 不会在 `/sso/token` 成功时替 Independent 业务系统创建 Cookie、session database 记录或其他第三方本地会话。
第三方本地会话的建立、存储和清理由业务系统自己负责。

`ssoSecret` 不得出现在浏览器地址、前端代码、日志、移动端包或第三方可见配置中。它与通用
`clientSecret` 是两套独立凭据，不得混用。

### 4.4 兑换失败与 Client Maintenance

业务 `/sso/token` 经过适用 Client 认证与原 ClientSession 定位后，一次消费
Code，再构建完整 V2 主体投影并签发 Credential。同一 Code 只有一个成功消费者；成功结果不提供查询或重放。

兑换遇到暂态失败、内部失败或响应结果未知时，接入方统一放弃旧 Code，等待后重新调用 `/sso/authorize`。`Retry-After` 表示开始
新授权前等待的秒数，不表示重放原 token 请求；仍有效的根 Cookie 通常允许直接续接，无需再次输入凭据。参数、Client 认证或
配置错误应先修正，不能形成自动授权循环。没有新增消费阶段或恢复动作字段。

Client Maintenance 在消费前返回 `503 AUTH.MAINTENANCE`；Client Snapshot、Gate 或 Subject Access 暂态失败也在消费前拒绝，
原 Code 的期限不延长。即使服务端此次尚未消费，Independent 接入方也使用同一重新授权策略，不判断内部消费进度。
已经签发的有效 Credential、根会话和 Cookie 应保留；UserInfo/authz 仍可按 `Retry-After` 用原凭据重试。
配置、启停、协议选择和 Secret 轮换不推进版本或自动撤销；适用认证和定位后的兑换失败按冻结规则有界尝试终止原实例，暂态操作不误清可恢复 Cookie。

最终消费者已由 #194 统一；环境尚未切换，首次迁移须按统一维护手册完成旧工具数据核验、收缩及全体重新登录。

### 4.5 Client Code 的 HTTP 传输

数据库和业务配置中的 Client Code 保持原值。只有把它放入 HTTP Basic username、`Client` 请求头或 Gateway
Cookie 名时，才使用 `transportClientCode`：先按 UTF-8 编码，再按 RFC 3986 URI component 规则做
percent-encoding；字母、数字、`.`、`_`、`~`、`-` 保持不变，其他字节写成 `%HH`。例如：

| Client Code 原值 | `transportClientCode` |
| --- | --- |
| `gateway` | `gateway` |
| `legacy:client` | `legacy%3Aclient` |
| `legacy/client` | `legacy%2Fclient` |
| `中文客户端` | `%E4%B8%AD%E6%96%87%E5%AE%A2%E6%88%B7%E7%AB%AF` |
| `legacy%3Aclient` | `legacy%253Aclient` |

URL query 中的 Client Code 仍把原值交给 `URLSearchParams` 等 URL API，由 URL API 完成正常的 query 编码。
不要预先编码后再交给 URL API，以免双重编码。Gateway Cookie 由 IAM callback 写入，业务系统不应自行拼接 Cookie
名。
Client Code 原值的 64 字符上限与 PostgreSQL `varchar(64)` 一致，按 Unicode code point 计数；不要按
JavaScript UTF-16 `length` 或 `transportClientCode` 编码后的字节/文本长度自行拒绝合法值。

### 4.6 Session Kernel 会话边界

Kernel 只拥有 UserSession 和 ClientSession；Custom SSO 拥有 Code、Token 与续接。根 Cookie 是浏览器登录来源，
应用关系固定根和 Client。单回调决定交付方式，配置中不再接受 `mode` 或 `logoutEndpoint`。
业务系统将 Code、sid 和 Cookie 中 Token 作为不可自行构造的值处理；Code 一次消费，不重放成功结果。
已有 Token 使用仍验证自身、根、ClientSession、当前 Client 和 Subject Access；配置/Secret/启停不自动撤销。
托管 authz 只输出最小 Subject/username/name；UserInfo 按当前披露配置交付已发布事实。

首次升级全体重新登录，旧状态不会转换为新关系；维护、数据选择、收缩 DDL、source/unified 清理和独立 verify
由[统一维护手册](../../releases/unified-session-maintenance.md)规定。本文更新不表示已执行环境切换。

### 4.7 IAM 内部职责边界

当前 IAM 用三个最终操作承接 Custom SSO：

- Endpoint use case 在任何授权码消费或 credential/session 创建前完成入口验证：`/sso/authorize` 校验 client 与
  redirect，`/sso/token` 校验 client 与 client secret，`/sso/callback` 校验 client 与 redirect。
- Custom SSO deep module 负责一次性 grant resolution、Independent Client Credential 或 Gateway Local Session 的完整
  生命周期，以及 Gateway 所需的 ORCAS、最小会话关系、审计和失败补偿。公开交付时再按当前 Client 配置解析
  主体投影；共同 resolved grant 不作为调用方可见的中间结果。
- Route 只负责 HTTP 参数、response envelope、Cookie、redirect query 和 302 等协议适配。

因此接入方只应依赖本文记录的最终 HTTP contract，不应依赖 IAM 内部的授权码消费、credential 创建或补偿顺序。

## 5. 获取当前用户信息

已签发 Custom Token 的使用必须验证其原 ClientSession、原 UserSession、Client 归属和自身期限。根终止后，即使关联索引漏项、
Token 尚未物理回收，后续在线访问仍拒绝；自身撤销、到期、账号禁用、旧访问代际或当前 Client 配置拒绝同样阻止访问。
Gateway authz、业务及托管 UserInfo 采用相同原则。新授权、登录续接、Code 兑换和直接使用 IAM 根 Token 的入口也验证有效根。

业务系统可使用有效的 Independent Client Credential 或 Gateway Local Session，通过 IAM 公共用户接口获取当前
Client 获准接收的主体投影：

```http
GET {IAM_ORIGIN}/public/user-info
Client: {transportClientCode}
Authorization: {sid}
```

如果使用网关托管模式，并且浏览器已经有 `local_{transportClientCode}_session` Cookie，可以不传
`Authorization`，但仍需要传编码后的 `Client` 请求头。

响应示例：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "version": 2,
    "subjectIdentifier": "00000000-0000-4000-8000-000000001001",
    "profile": {
      "username": "138550",
      "name": "张三"
    }
  }
}
```

注意：

- `Authorization` 头当前直接传 Independent credential 或 Gateway session 值，不使用 `Bearer` 前缀。
- `Client` 请求头使用 4.5 节的 `transportClientCode`，解码后必须与 credential/session 所属客户端一致。
- 响应按请求时的当前 `subjectClaims` 生成；未选择的字段不会出现。IAM 数据库用户主键、其他 Client 的授权和 ORCAS
  信息永远不会进入该响应。
- IAM credential/session 永久失效时返回 401；Independent 业务系统应清理自己的本地会话并重新发起 `/sso/authorize`。
- Gateway Local Session 绑定的 Client 配置失效时，IAM 清理对应 Local Session Cookie；有效
  `global_session` 通过 `Client: iam` 请求时，若只有 IAM Client 的 Custom SSO 交付配置不可用，请求同样返回
  401，但 IAM 保留全局登录 Cookie，其他 SSO/OIDC 流程不需要因此重新登录。
- Client 明确处于 Maintenance 时返回 HTTP 503 与 `AUTH.MAINTENANCE`；调用方应保留仍有效的 credential/session 与 Cookie，
  等 Client 恢复正常后重试。
- Subject Access 或投影暂时无法确认时返回 503，并携带 `Retry-After`；调用方应保留有效 Cookie/session 并按建议重试。

## 6. 网关统一鉴权

如果业务系统由反向代理统一保护，可以让网关在转发业务请求前调用：

```http
GET {IAM_ORIGIN}/auth/authz
Client: {transportClientCode}
Authorization: {sid}
X-Forwarded-Uri: /业务系统原始路径
```

鉴权成功时 IAM 返回 200，并把完全相同的 Base64 字符串同时写入 response body 的 `data` 与响应头：

```http
X-User-Info: eyJ2ZXJzaW9uIjoxLCJzdWJqZWN0SWRlbnRpZmllciI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMTAwMSIsInVzZXJuYW1lIjoiMTM4NTUwIiwibmFtZSI6IuW8oOS4iSJ9
```

`X-User-Info` 是 Base64 编码后的 JSON，解码后形如：

```json
{
  "version": 1,
  "subjectIdentifier": "00000000-0000-4000-8000-000000001001",
  "username": "138550",
  "name": "张三"
}
```

Subject Identifier 必有；`username`/`name` 只在 Client 选择时出现。数据库 `id`、phone、employments、
authorization 和 ORCAS 永远不会进入 Gateway Subject Header。`/auth/authz` 不做接口级角色或权限判定。

会话无效、Client/Custom SSO 被禁用或配置版本变化时返回 401。Client 明确处于 Maintenance 时返回 503 与
`AUTH.MAINTENANCE`；Subject Access、Client 状态或投影暂时无法确认时返回通用 503，并可携带 `Retry-After`。这些暂态响应
不会清除本来有效的 Cookie。网关在 401 时应中断转发并重新登录，在 503 时应中断本次转发并按建议重试，不要把暂态故障当作登出。

## 7. 退出登录

业务系统主动退出时，将浏览器重定向到：

```text
{IAM_ORIGIN}/sso/logout?redirectUrl={urlencoded_after_logout_url}&token={sid}
```

参数说明：

| 参数 | 必填 | 说明 |
|---|---|---|
| `redirectUrl` | 是 | IAM 清理会话后跳回的地址。 |
| `token` | 否 | 支持根 UserSession Token，也支持由 Custom 协议 owner 验证并定位原根的应用 Token；浏览器优先使用 `global_session` Cookie。退出不要求账号仍能取得在线访问许可，不影响其他独立根。 |

IAM 会清理全局会话以及该全局会话下的有效 IAM credential/session，但不拥有 Independent 业务系统在 IAM 之外创建的
本地 session，也不保证 IAM logout 能终止该 session。Independent 业务系统的退出入口应同时清理自己的 HttpOnly
Cookie/session，再调用 IAM `/sso/logout`。Client 配置已删除 `logoutEndpoint`，IAM 不发送后台退出通知；业务系统自行负责本地会话。

## 8. 异常与排错

| 现象 | 常见原因 | 处理建议 |
|---|---|---|
| 跳转 `/sso/authorize` 后报“非法client代码” | `client` 未注册或传错 | 核对 IAM 管理端 `clientCode`。 |
| 报“非法重定向地址” | `redirectUrl` 未命中 `validRedirectUrls` pattern | 在 IAM 客户端配置中加入正确的 HTTPS origin、一级子域 wildcard 或 path 末尾 `/*` pattern。 |
| 回调换取 token 报“非法Code” | 授权码过期、重复使用或 code 传错 | 重新发起登录，不要缓存或复用授权码。 |
| `/public/user-info` 返回 400 | 缺少 `Client`，或 `Client` 格式非法 | 传入已注册 Client Code 的合法 transport 编码。 |
| `/public/user-info` 返回 401 | 缺少 IAM credential/session，或 credential/session 已过期 | 清理第三方本地会话并重新发起 SSO 授权登录。 |
| Independent `/sso/token` 返回 503、500 或结果未知 | 兑换暂态、内部失败或响应丢失 | 放弃旧 Code，按 `Retry-After` 等待后重新授权；保留有效根 Cookie，不重放 token 请求。 |
| `/sso/authorize`、`/public/user-info` 或 `/auth/authz` 返回 503 | Client Maintenance 或依赖暂态不可用 | 保留有效 Credential、Cookie/session；按 `Retry-After` 或维护窗口重试原操作。 |
| 登出后业务系统仍显示已登录 | 业务系统只撤销了 IAM credential，未清理自己的 session | 业务退出入口先清理本地 Cookie/session，再调用 IAM `/sso/logout`。 |
| 登录成功后循环跳登录页 | Cookie 域、反向代理路径或 `redirectUrl` 配置不一致 | 检查回调地址、Cookie 所属域和网关转发规则。 |

## 9. 安全要求

1. `ssoSecret` 只允许保存在业务系统服务端，不得与通用 `clientSecret` 混用。
2. `redirectUrl` 应使用 HTTPS，生产环境不要使用 IP、明文 HTTP 或通配式回调。
3. Independent 业务系统不要把 `sid` 写入可被脚本读取的持久化存储；应只在后端保存，并用自己的 HttpOnly Cookie
   表达第三方本地会话。
4. 服务端日志需要脱敏 `code`、`sid`、`ssoSecret`、手机号等敏感信息。
5. 业务系统应在收到 401 后立即清理本地登录态，避免用失效会话继续请求。
6. Independent 应把 IAM credential 撤销和业务本地 session 清理编排为同一次退出操作，不依赖 IAM 管理第三方 session。
7. 新接入不得通过 URL query 传递 UserSession token；legacy query token 只允许在过渡期使用，并会被系统日志标记来源。

## 10. 最小接入清单

接入联调前请确认：

- IAM 已创建客户端，并提供 `clientCode`。
- 独立应用已安全保存一次性展示的 `ssoSecret`。
- `validRedirectUrls` 覆盖业务系统登录后落地页。
- 业务应用已提供唯一 `callbackEndpoint`，并拥有自己的本地退出流程。
- 未登录时能跳转到 `/sso/authorize`。
- Independent 业务系统能在取得 `sid` 后自行建立并维护本地会话；Gateway client 能取得 Gateway Local Session。
- 已配置所需 `subjectClaims`，且 `/public/user-info` 只返回该 Client 获准接收的 V2 主体投影。
- Gateway `/auth/authz` 的 response body 与 `X-User-Info` 相同，解码后不含数据库 ID、phone、任职、授权或 ORCAS。
- 业务系统退出能调用 `/sso/logout`。
- Independent 业务系统能在调用 `/sso/logout` 的同时清理自己的本地 session。

一次消费切换的目标/证据见[最终契约账本](custom-sso-one-shot-grant-contract.md)，原固定旧候选的保留会话操作见[升级手册](../../releases/custom-sso-one-shot-grant-upgrade.md)；包含 #170 的当前候选按[全体下线手册](../../releases/online-auth-redis-time-cutover.md)统一版本并重新登录。环境切换仍需发布负责人另行验收。
