# 第三方业务系统 SSO 单点登录对接说明

## 1. 文档目的

本文面向需要接入上海燃气 IAM SSO 的第三方业务系统，说明业务系统如何通过 IAM 完成统一登录、取得 IAM 授予结果、建立本系统会话、读取当前用户信息以及退出登录。

当前 IAM SSO 是自定义授权码流程，不是标准 OIDC/OAuth2 协议。整体模式是：

1. 业务系统将浏览器重定向到 IAM SSO 授权端点。
2. IAM 校验全局登录态；未登录时进入统一登录页，已登录时签发一次性授权码。
3. IAM 将浏览器带着授权码重定向回业务系统回调地址。
4. Independent 业务系统用授权码取得 IAM 管理的 credential，再自行建立本地会话；Gateway client 则由 IAM 建立
   Gateway Local Session。

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
| `customSsoSecret` | Custom SSO 专用客户端密钥。仅 Independent 模式兑现 grant 时使用，与通用 `clientSecret` 无关；明文只在配置或轮换时展示一次，必须保存在服务端。 |
| `validRedirectUrls` | 允许登录完成后返回的业务地址 pattern 列表。支持 origin、一级子域 wildcard（如 `https://*.example.com`）和 path 末尾 `/*`。 |
| `mode` | Custom SSO 接入模式，严格区分 `gateway` 与 `independent`。 |
| `subjectClaims` | 该 Client 获准接收的主体字段；必须包含 Subject Identifier，其他 Profile、任职和授权字段按需选择。 |
| `callbackEndpoint` | 独立应用模式下接收授权码的业务系统后端回调地址。 |
| `logoutEndpoint` | Independent 模式必填的预留地址。当前 V1 保存并校验该配置，但不会调用它发送后台登出通知；业务系统必须在自己的退出流程中清理本地会话。 |
| `orcas.enabled` | 仅 Gateway 可配置。启用时 IAM 额外交付 ORCAS Cookie/query/专用 endpoint；ORCAS 不进入主体投影。 |

建议业务系统至少准备以下地址：

| 地址 | 归属 | 说明 |
|---|---|---|
| `https://biz.example.com/` | 前端 | 业务系统首页或登录后落地页，作为 `redirectUrl`。 |
| `https://biz.example.com/sso/callback` | 后端 | 独立应用模式下接收 IAM 授权码。 |
| `https://biz.example.com/sso/logout` | 后端 | Independent 配置所需的预留地址；当前 V1 不会向其发送后台通知，业务系统仍须在自己的退出入口清理 session。 |

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
| `token` | 否 | 已有 IAM PrincipalSession token 时可传入。该 query 参数仅为 legacy 兼容路径，新 client 不应使用 URL query 传递 PrincipalSession token。浏览器场景通常依赖 HttpOnly Cookie。 |

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

### 4.2 网关托管模式

网关托管模式适合业务系统和 IAM 位于同一访问域或同一反向代理下，由网关把业务系统的 `/sso/callback` 转发到 IAM 的 `/sso/callback`。

IAM 授权成功后会重定向到：

```text
{redirectUrl的协议和域名}/sso/callback?code={code}&client={clientCode}&redirectUrl={urlencoded_redirect_url}
```

IAM 的 `/sso/callback` 会：

1. 校验授权码和 `redirectUrl`。
2. 为该业务系统创建 IAM 管理的 Gateway Local Session。
3. 写入 HttpOnly Cookie：`local_{transportClientCode}_session={sid}`。
4. 302 跳转回原始 `redirectUrl`，并在 URL 查询参数中附带 `token={sid}`。

业务系统后续可以通过 Cookie 使用局部会话；如前后端分离或跨域调用，也可以读取回调 URL 中的 `token` 后交给业务后端建立自己的会话。

### 4.3 独立应用模式

独立应用模式适合业务系统完全自管后端会话。IAM 授权成功后会重定向到客户端注册的 `callbackEndpoint`：

```text
https://biz.example.com/sso/callback?code={code}&client={clientCode}&redirectUrl={urlencoded_redirect_url}
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
`sid`、剩余有效期和当前 Client 获准接收的 V1 主体投影：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "sid": "independent-client-credential",
    "ttl": 86399,
    "subject": {
      "version": 1,
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

`customSsoSecret` 不得出现在浏览器地址、前端代码、日志、移动端包或第三方可见配置中。它与通用
`clientSecret` 是两套独立凭据，不得混用。

### 4.4 Client Code 的 HTTP 传输

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

### 4.5 Session Kernel 会话边界

当前 custom SSO 通过 Session Kernel 管理 PrincipalSession、授权码、Independent Client Credential 和
Gateway Local Session：

- PrincipalSession token、auth code、Independent `sid` 和 Gateway session token 都是 opaque bearer，业务系统不得解析、
  拼接或依赖其中格式。
- `/sso/authorize` 解析 PrincipalSession 的首选来源是 HttpOnly Cookie。
- `Authorization` header 和 query `token` 作为 PrincipalSession 来源仅保留 legacy 兼容和过渡观测；新接入不要把 PrincipalSession 放到 URL query。
- Gateway 模式的 `local_{transportClientCode}_session` Cookie 携带 Gateway Local Session；Independent 模式的 `sid`
  是 IAM 管理的 Independent Client Credential。二者都是 opaque、client-scoped bearer，但只有 Gateway 前者是
  IAM 建立的 local session。
- Gateway Local Session 只保存 Subject Identifier 引用、Client/mode/config version、生命周期和可选 ORCAS
  reference，不保存 User Detail 或主体投影。每次使用时 IAM 都按当前 Client 状态、Custom SSO 配置版本和 Subject
  Access Barrier 重新校验。
- auth code 一次性使用，重放会命中 Session Kernel artifact tombstone 并被拒绝。

发布 Session Kernel 版本前，运维会在维护窗口内清理旧 custom SSO Redis key：

- `global_session:*`
- `auth_code:*`
- `local_*_session:*`
- `local_session_reverse:*`
- `local_session_set:*`
- `custom-sso:local-session-payload:*`

运维先运行专用 cleanup command 的 dry-run，再要求残留 `--verify` 非零；范围复核后执行 `--apply`，最后要求 clean
`--verify` 零退出。该 profile 不扫描或删除 `oidc:*` key。完整冻结、备份、取消和 smoke 顺序见
[Custom SSO Subject Projection 硬切换与回滚手册](../../releases/custom-sso-subject-projection-release.md)。

清理后，所有用户和 custom SSO client 都需要重新登录或重新发起授权。业务系统应把 401、非法 code、IAM
credential/session 过期视为重新发起 `/sso/authorize` 的信号。

如发布需要回滚到旧 custom SSO session 实现，必须先停止 login、authorize、callback、token 和 authz 流量，并清理新版本 `sess:v2:` active/lookup/revoked/index key。`custom-sso:local-session-payload:*` 只能由维护窗口的独立清理命令处理；
当前 production runtime 不读取、写入、规范化该 payload，也不据此通知 client logout。回滚后必须重新执行 custom SSO
登录、网关鉴权和退出 smoke。

### 4.6 IAM 内部职责边界

当前 IAM 用三个最终操作承接 Custom SSO：

- Endpoint use case 在任何授权码消费或 credential/session 创建前完成入口验证：`/sso/authorize` 校验 client 与
  redirect，`/sso/token` 校验 client 与 client secret，`/sso/callback` 校验 client 与 redirect。
- Custom SSO deep module 负责一次性 grant resolution、Independent Client Credential 或 Gateway Local Session 的完整
  生命周期，以及 Gateway 所需的 ORCAS、最小 Kernel metadata、审计和失败补偿。公开交付时再按当前 Client 配置解析
  主体投影；共同 resolved grant 不作为调用方可见的中间结果。
- Route 只负责 HTTP 参数、response envelope、Cookie、redirect query 和 302 等协议适配。

因此接入方只应依赖本文记录的最终 HTTP contract，不应依赖 IAM 内部的授权码消费、credential 创建或补偿顺序。

## 5. 获取当前用户信息

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
    "version": 1,
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
- `Client` 请求头使用 4.4 节的 `transportClientCode`，解码后必须与 credential/session 所属客户端一致。
- 响应按请求时的当前 `subjectClaims` 生成；未选择的字段不会出现。IAM 数据库用户主键、其他 Client 的授权和 ORCAS
  信息永远不会进入该响应。
- IAM credential/session 失效时返回 401；Independent 业务系统应清理自己的本地会话并重新发起 `/sso/authorize`。
- Gateway Local Session 绑定的 Client 配置失效时，IAM 清理对应 Local Session Cookie；有效
  `global_session` 通过 `Client: iam` 请求时，若只有 IAM Client 的 Custom SSO 交付配置不可用，请求同样返回
  401，但 IAM 保留全局登录 Cookie，其他 SSO/OIDC 流程不需要因此重新登录。
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

会话无效、Client/Custom SSO 被禁用或配置版本变化时返回 401。Subject Access 或投影暂时无法确认时返回 503 和
`Retry-After`，且不会清除本来有效的 Cookie。网关在 401 时应中断转发并重新登录，在 503 时应中断本次转发并按
`Retry-After` 重试，不要把暂态故障当作登出。

## 7. 退出登录

业务系统主动退出时，将浏览器重定向到：

```text
{IAM_ORIGIN}/sso/logout?redirectUrl={urlencoded_after_logout_url}&token={sid}
```

参数说明：

| 参数 | 必填 | 说明 |
|---|---|---|
| `redirectUrl` | 是 | IAM 清理会话后跳回的地址。 |
| `token` | 否 | 当前 Independent Client Credential 或 Gateway Local Session。浏览器有 `global_session` Cookie 时可不传；独立应用建议传。 |

IAM 会清理全局会话以及该全局会话下的有效 IAM credential/session，但不拥有 Independent 业务系统在 IAM 之外创建的
本地 session，也不保证 IAM logout 能终止该 session。Independent 业务系统的退出入口应同时清理自己的 HttpOnly
Cookie/session，再调用 IAM `/sso/logout`。Client 配置中的 `logoutEndpoint` 是当前 V1 的预留字段，IAM 不会调用
它发送后台通知；业务系统不得依赖该字段清理当前 V1 credential 对应的本地会话。

## 8. 异常与排错

| 现象 | 常见原因 | 处理建议 |
|---|---|---|
| 跳转 `/sso/authorize` 后报“非法client代码” | `client` 未注册或传错 | 核对 IAM 管理端 `clientCode`。 |
| 报“非法重定向地址” | `redirectUrl` 未命中 `validRedirectUrls` pattern | 在 IAM 客户端配置中加入正确的 HTTPS origin、一级子域 wildcard 或 path 末尾 `/*` pattern。 |
| 回调换取 token 报“非法Code” | 授权码过期、重复使用或 code 传错 | 重新发起登录，不要缓存或复用授权码。 |
| `/public/user-info` 返回 400 | 缺少 `Client`，或 `Client` 格式非法 | 传入已注册 Client Code 的合法 transport 编码。 |
| `/public/user-info` 返回 401 | 缺少 IAM credential/session，或 credential/session 已过期 | 清理第三方本地会话并重新发起 SSO 授权登录。 |
| `/public/user-info` 或 `/auth/authz` 返回 503 | Subject Access 或主体投影暂时无法确认 | 保留当前 Cookie/session，读取 `Retry-After` 后重试。 |
| 登出后业务系统仍显示已登录 | 业务系统只撤销了 IAM credential，未清理自己的 session | 业务退出入口先清理本地 Cookie/session，再调用 IAM `/sso/logout`。 |
| 登录成功后循环跳登录页 | Cookie 域、反向代理路径或 `redirectUrl` 配置不一致 | 检查回调地址、Cookie 所属域和网关转发规则。 |

## 9. 安全要求

1. `customSsoSecret` 只允许保存在业务系统服务端，不得与通用 `clientSecret` 混用。
2. `redirectUrl` 应使用 HTTPS，生产环境不要使用 IP、明文 HTTP 或通配式回调。
3. Independent 业务系统不要把 `sid` 写入可被脚本读取的持久化存储；应只在后端保存，并用自己的 HttpOnly Cookie
   表达第三方本地会话。
4. 服务端日志需要脱敏 `code`、`sid`、`customSsoSecret`、手机号等敏感信息。
5. 业务系统应在收到 401 后立即清理本地登录态，避免用失效会话继续请求。
6. Independent 应把 IAM credential 撤销和业务本地 session 清理编排为同一次退出操作，不依赖 IAM 管理第三方 session。
7. 新接入不得通过 URL query 传递 PrincipalSession token；legacy query token 只允许在过渡期使用，并会被系统日志标记来源。

## 10. 最小接入清单

接入联调前请确认：

- IAM 已创建客户端，并提供 `clientCode`。
- 独立应用已安全保存一次性展示的 `customSsoSecret`。
- `validRedirectUrls` 覆盖业务系统登录后落地页。
- 独立应用已提供 `callbackEndpoint` 和当前 V1 所需的预留 `logoutEndpoint`，且不依赖后者接收通知。
- 未登录时能跳转到 `/sso/authorize`。
- Independent 业务系统能在取得 `sid` 后自行建立并维护本地会话；Gateway client 能取得 Gateway Local Session。
- 已配置所需 `subjectClaims`，且 `/public/user-info` 只返回该 Client 获准接收的 V1 主体投影。
- Gateway `/auth/authz` 的 response body 与 `X-User-Info` 相同，解码后不含数据库 ID、phone、任职、授权或 ORCAS。
- 业务系统退出能调用 `/sso/logout`。
- Independent 业务系统能在调用 `/sso/logout` 的同时清理自己的本地 session。
