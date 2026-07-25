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
| `/sso/token` | GET | 独立应用模式下用授权码换取 Independent Client Credential |
| `/sso/logout` | GET | 退出 IAM 全局会话并终止相关 IAM credential/session |
| `/public/user-info` | GET | 获取当前用户详情，需要有效 IAM credential/session |
| `/auth/authz` | GET | 网关鉴权端点，可用于反向代理统一鉴权 |

## 3. 接入前准备

接入前需要在 IAM 管理端注册业务系统客户端，并确认以下配置。

| 配置项 | 说明 |
|---|---|
| `clientCode` | 业务系统唯一编码。发起授权时作为 `client` 参数传入，例如 `tender`。 |
| `clientSecret` | 客户端密钥。仅独立应用模式兑现 grant 时使用，必须保存在服务端。 |
| `validRedirectUrls` | 允许登录完成后返回的业务地址 pattern 列表。支持 origin、一级子域 wildcard（如 `https://*.example.com`）和 path 末尾 `/*`。 |
| `managementLevel` | 接入模式。常用值为网关托管或独立应用。 |
| `callbackEndpoint` | 独立应用模式下接收授权码的业务系统后端回调地址。 |
| `logoutEndpoint` | 独立应用模式下 IAM 全局登出时通知业务系统清理其自有本地会话的地址。 |
| `requireOrcas` | 是否需要同时获取 ORCAS 会话。普通业务系统通常不需要。 |

建议业务系统至少准备以下地址：

| 地址 | 归属 | 说明 |
|---|---|---|
| `https://biz.example.com/` | 前端 | 业务系统首页或登录后落地页，作为 `redirectUrl`。 |
| `https://biz.example.com/sso/callback` | 后端 | 独立应用模式下接收 IAM 授权码。 |
| `https://biz.example.com/sso/logout` | 后端 | 接收 IAM 的后台登出通知，清理业务系统 session。 |

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
3. 写入 HttpOnly Cookie：`local_{clientCode}_session={sid}`。
4. 302 跳转回原始 `redirectUrl`，并在 URL 查询参数中附带 `token={sid}`。

业务系统后续可以通过 Cookie 使用局部会话；如前后端分离或跨域调用，也可以读取回调 URL 中的 `token` 后交给业务后端建立自己的会话。

### 4.3 独立应用模式

独立应用模式适合业务系统完全自管后端会话。IAM 授权成功后会重定向到客户端注册的 `callbackEndpoint`：

```text
https://biz.example.com/sso/callback?code={code}&client={clientCode}&redirectUrl={urlencoded_redirect_url}
```

业务系统后端收到回调后，用 `code`、`client`、`clientSecret` 调 IAM 兑现 Authorization Grant，换取
Independent Client Credential：

```http
GET {IAM_ORIGIN}/sso/token?code={code}&client={clientCode}&clientSecret={clientSecret}
```

成功响应包含 IAM credential `sid`、剩余有效期和用户信息：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "sid": "independent-client-credential",
    "ttl": 86399,
    "userInfo": {
      "id": 1,
      "username": "138550",
      "name": "张三",
      "roles": ["tender:default-user"]
    }
  }
}
```

业务系统应在服务端完成以下处理：

1. 校验响应成功。
2. 将 `sid` 与本系统自行创建的用户会话绑定；`sid` 本身仍是 IAM 管理的 Independent Client Credential。
3. 设置业务系统自己的 HttpOnly Cookie。
4. 302 跳转回 `redirectUrl`。

IAM 不会在 `/sso/token` 成功时替 Independent 业务系统创建 Cookie、session database 记录或其他第三方本地会话。
第三方本地会话的建立、存储和清理由业务系统自己负责。

`clientSecret` 不得出现在浏览器地址、前端代码、日志、移动端包或第三方可见配置中。

### 4.4 Session Kernel 会话边界

当前 custom SSO 通过 Session Kernel 管理 PrincipalSession、授权码、Independent Client Credential 和
Gateway Local Session：

- PrincipalSession token、auth code、Independent `sid` 和 Gateway session token 都是 opaque bearer，业务系统不得解析、
  拼接或依赖其中格式。
- `/sso/authorize` 解析 PrincipalSession 的首选来源是 HttpOnly Cookie。
- `Authorization` header 和 query `token` 作为 PrincipalSession 来源仅保留 legacy 兼容和过渡观测；新接入不要把 PrincipalSession 放到 URL query。
- Gateway 模式的 `local_{clientCode}_session` Cookie 携带 Gateway Local Session；Independent 模式的 `sid`
  是 IAM 管理的 Independent Client Credential。二者都是 opaque、client-scoped bearer，但只有 Gateway 前者是
  IAM 建立的 local session。
- auth code 一次性使用，重放会命中 Session Kernel artifact tombstone 并被拒绝。

发布 Session Kernel 版本前，运维会在维护窗口内清理旧 custom SSO Redis key：

- `global_session:*`
- `auth_code:*`
- `local_*_session:*`
- `local_session_reverse:*`
- `local_session_set:*`

清理后，所有用户和 custom SSO client 都需要重新登录或重新发起授权。业务系统应把 401、非法 code、IAM
credential/session 过期视为重新发起 `/sso/authorize` 的信号。

如发布需要回滚到旧 custom SSO session 实现，必须先停止 login、authorize、callback、token 和 authz 流量，并清理新版本 `sess:v2:` active/lookup/revoked/index key 以及 `custom-sso:local-session-payload:*` 私有 payload key。回滚后必须重新执行 custom SSO 登录、网关鉴权和退出 smoke。

### 4.5 IAM 内部职责边界

当前 IAM 用三个最终操作承接 Custom SSO：

- Endpoint use case 在任何授权码消费或 credential/session 创建前完成入口验证：`/sso/authorize` 校验 client 与
  redirect，`/sso/token` 校验 client 与 client secret，`/sso/callback` 校验 client 与 redirect。
- Custom SSO deep module 负责一次性 grant resolution、Independent Client Credential 或 Gateway Local Session 的完整
  生命周期，以及 Gateway 所需的 ORCAS、私有 payload、审计和失败补偿。共同 resolved grant 不作为调用方可见的中间结果。
- Route 只负责 HTTP 参数、response envelope、Cookie、redirect query 和 302 等协议适配。

因此接入方只应依赖本文记录的最终 HTTP contract，不应依赖 IAM 内部的授权码消费、credential 创建或补偿顺序。

## 5. 获取当前用户信息

业务系统可使用有效的 Independent Client Credential 或 Gateway Local Session，通过 IAM 公共用户接口获取当前用户详情：

```http
GET {IAM_ORIGIN}/public/user-info
Client: {clientCode}
Authorization: {sid}
```

如果使用网关托管模式，并且浏览器已经有 `local_{clientCode}_session` Cookie，可以不传 `Authorization`，但仍需要传 `Client` 请求头。

响应示例：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "username": "138550",
    "name": "张三",
    "roles": ["tender:default-user"]
  }
}
```

注意：

- `Authorization` 头当前直接传 Independent credential 或 Gateway session 值，不使用 `Bearer` 前缀。
- `Client` 请求头必须与 credential/session 所属客户端一致。
- IAM credential/session 失效时返回 401；Independent 业务系统应清理自己的本地会话并重新发起 `/sso/authorize`。

## 6. 网关统一鉴权

如果业务系统由反向代理统一保护，可以让网关在转发业务请求前调用：

```http
GET {IAM_ORIGIN}/auth/authz
Client: {clientCode}
Authorization: {sid}
X-Forwarded-Uri: /业务系统原始路径
```

鉴权成功时 IAM 返回 200，并在响应头写入：

```http
X-User-Info: eyJ1c2VybmFtZSI6IjEzODU1MCIsImlkIjoxLCJuYW1lIjoi5byg5LiJIn0=
```

`X-User-Info` 是 Base64 编码后的 JSON，解码后形如：

```json
{
  "username": "138550",
  "id": 1,
  "name": "张三"
}
```

鉴权失败时返回 401；系统维护或客户端状态异常时也可能被拒绝。网关应在失败时中断转发，并跳转到登录入口或展示错误页。

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

IAM 会清理全局会话以及该全局会话下的有效 IAM credential/session。对于独立应用模式，IAM 还会向客户端注册的
`logoutEndpoint` 发起后台通知：

```http
POST https://biz.example.com/sso/logout
Content-Type: application/json

{
  "sid": "independent-client-credential"
}
```

业务系统收到通知后应删除与该 `sid` 关联的自有本地 session，使单点退出在各业务系统间生效。通知表示 IAM credential
已终止，不表示 IAM 能直接删除第三方的 session。

## 8. 异常与排错

| 现象 | 常见原因 | 处理建议 |
|---|---|---|
| 跳转 `/sso/authorize` 后报“非法client代码” | `client` 未注册或传错 | 核对 IAM 管理端 `clientCode`。 |
| 报“非法重定向地址” | `redirectUrl` 未命中 `validRedirectUrls` pattern | 在 IAM 客户端配置中加入正确的 HTTPS origin、一级子域 wildcard 或 path 末尾 `/*` pattern。 |
| 回调换取 token 报“非法Code” | 授权码过期、重复使用或 code 传错 | 重新发起登录，不要缓存或复用授权码。 |
| `/public/user-info` 返回 401 | 缺少 `Client`、缺少 IAM credential/session 或其已过期 | 清理第三方本地会话并重新发起 SSO 授权登录。 |
| 登出后业务系统仍显示已登录 | 业务系统未清理自己的 session | 实现 `logoutEndpoint`，并在前端退出时同步清理本地状态。 |
| 登录成功后循环跳登录页 | Cookie 域、反向代理路径或 `redirectUrl` 配置不一致 | 检查回调地址、Cookie 所属域和网关转发规则。 |

## 9. 安全要求

1. `clientSecret` 只允许保存在业务系统服务端。
2. `redirectUrl` 应使用 HTTPS，生产环境不要使用 IP、明文 HTTP 或通配式回调。
3. Independent 业务系统不要把 `sid` 写入可被脚本读取的持久化存储；应只在后端保存，并用自己的 HttpOnly Cookie
   表达第三方本地会话。
4. 服务端日志需要脱敏 `code`、`sid`、`clientSecret`、手机号等敏感信息。
5. 业务系统应在收到 401 后立即清理本地登录态，避免用失效会话继续请求。
6. 独立应用必须实现 `logoutEndpoint`，否则无法完整支持单点退出。
7. 新接入不得通过 URL query 传递 PrincipalSession token；legacy query token 只允许在过渡期使用，并会被系统日志标记来源。

## 10. 最小接入清单

接入联调前请确认：

- IAM 已创建客户端，并提供 `clientCode`。
- 独立应用已安全保存 `clientSecret`。
- `validRedirectUrls` 覆盖业务系统登录后落地页。
- 独立应用已提供 `callbackEndpoint` 和 `logoutEndpoint`。
- 未登录时能跳转到 `/sso/authorize`。
- Independent 业务系统能在取得 `sid` 后自行建立并维护本地会话；Gateway client 能取得 Gateway Local Session。
- `/public/user-info` 能返回当前用户信息。
- 业务系统退出能调用 `/sso/logout`。
- IAM 单点退出通知能清理业务系统本地 session。
