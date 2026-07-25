# 第三方系统通过 `/sso/thirdparty/:clientCode` 接入统一登录方法

## 1. 适用场景

本文面向已经有可信登录态的第三方系统，说明如何通过 IAM 第三方登录入口把已认证用户带入统一登录体系，并继续完成目标业务系统的 SSO 授权。

该入口适合以下场景：

- 第三方系统已经完成用户身份认证。
- 第三方系统能安全保存 IAM 分配的 `clientSecret`。
- 第三方系统希望通过浏览器跳转方式让用户进入 IAM 统一登录态。
- IAM 中存在同名用户，且该用户为启用状态的“正式员工”。

### 1.1 概念说明

为了避免接入时把“发起登录的一方”和“最终落地的一方”混为一谈，本文把这两个系统分开说明：

| 概念 | 说明 | 在本文中的对应参数 |
|---|---|---|
| 第三方系统 | 已经有自己用户体系的外部业务系统。它先完成用户认证，再把用户带到 IAM。它通常负责生成签名、发起跳转、提供 `loginid`。 | 路径参数 `clientCode`，表示第三方系统自己的 IAM 客户端编码。 |
| 目标业务系统 | 用户通过 IAM 统一登录后，最终要进入的业务系统。Independent 系统以 IAM credential 建立自己的本地会话；Gateway client 使用 IAM 建立的 Gateway Local Session。 | 查询参数 `client`，表示最终要登录的目标业务系统客户端编码。 |

两者可以是同一个系统，也可以是不同系统：

- 如果第三方系统只是作为统一身份入口，且登录后还要回到自己对应的业务系统，那么 `clientCode` 和 `client` 可以写成同一个值。
- 如果某个平台系统只是代为认证用户，然后把用户导向另一个业务系统，那么 `clientCode` 表示“认证入口系统”，`client` 表示“最终业务系统”。
- 只要最终目标不变，`redirectUrl` 就应该始终属于目标业务系统允许的回跳地址，而不是第三方系统自己的地址。

接入时最容易混淆的点有两个：

1. `clientCode` 是“谁在调用 IAM 第三方入口”，用于 IAM 查签名密钥。
2. `client` 是“登录完成后要落到谁那里”，用于后续 `/sso/authorize` 和回调流程。

可以把整个过程理解成：

```text
第三方系统登录态 -> IAM 全局登录态 -> Custom SSO Authorization Grant -> 目标系统登录态
```

第三方系统负责把“外部身份”可靠地转换成 IAM 可识别的用户身份。Independent 目标业务系统负责用 IAM 授予的
Independent Client Credential 建立并拥有自己的本地会话；Gateway 目标使用 IAM 管理的 Gateway Local Session。

第三方接入API应用路径为：

```text
http://app.shgas.com/sso/thirdparty/:clientCode
```

## 2. 整体流程

1. 第三方系统完成自己的登录认证，得到当前用户工号 `loginid`。
2. 第三方系统使用 IAM 分配的 `clientSecret` 生成签名 `token`。
3. 第三方系统将浏览器 302 跳转到 IAM 第三方登录入口。
4. IAM 校验 `clientCode`、时间戳、签名和用户状态。
5. IAM 为用户创建 `global_session` 全局会话 Cookie。
6. IAM 自动跳转到 `/sso/authorize`，为目标业务系统继续执行标准 SSO 授权。
7. Independent 目标业务系统取得 IAM credential 后自行建立本地会话；Gateway 目标由 IAM 建立 Gateway Local Session。

## 3. 接入前准备

第三方系统接入前，需要由 IAM 管理员完成客户端配置。

| 配置项 | 说明 |
|---|---|
| `clientCode` | 第三方系统在 IAM 中的唯一编码，用于路径参数 `:clientCode`。 |
| `clientSecret` | 第三方系统签名密钥，只能保存在服务端。 |
| `status` | 客户端必须处于启用状态。 |
| 目标业务系统 `client` | 登录完成后要进入的业务系统客户端编码，用于查询参数 `client`。可以与路径中的 `clientCode` 相同，也可以不同。 |
| 目标业务系统 `validRedirectUrls` | `redirectUrl` 必须命中目标业务系统客户端允许的地址 pattern；支持 origin、一级子域 wildcard（如 `https://*.example.com`）和 path 末尾 `/*`。 |
| 目标业务系统 `managementLevel` | 决定后续授权码回调方式，常用值为 `Gateway`（网关托管）或 `Independent`（独立应用）。 |

用户侧还需要满足：

- `loginid` 对应员工工号。
- 用户未删除、未停用。
- 用户类型为“正式员工”；外部用户不允许通过该入口登录。

## 4. 调用入口

```http
GET http://app.shgas.com/sso/thirdparty/{clientCode}?loginid={loginid}&ts={timestamp_ms}&token={signature}&client={targetClientCode}&redirectUrl={urlencoded_redirect_url}
```

参数说明：

| 参数 | 位置 | 必填 | 说明 |
|---|---|---|---|
| `clientCode` | path | 是 | 第三方系统客户端编码，用于查找签名密钥。 |
| `loginid` | query | 是 | IAM 用户账号，对应 IAM `username`。 |
| `ts` | query | 是 | 毫秒级 Unix 时间戳，例如 `1717046400000`。生产环境要求与 IAM 服务器时间偏差小于 5 分钟。 |
| `token` | query | 是 | 按本文第 5 节算法生成的签名。 |
| `client` | query | 是 | 最终要登录的目标业务系统客户端编码。 |
| `redirectUrl` | query | 是 | 登录成功后最终回到业务系统的地址，必须 URL 编码，且命中目标客户端 `validRedirectUrls` pattern。 |

示例：

```text
https://iam.example.com/public/thirdparty/oa?loginid=138550&ts=1717046400000&token=BASE64_SIGNATURE&client=tender&redirectUrl=https%3A%2F%2Ftender.example.com%2F
```

## 5. 签名算法

签名输入：

```text
{loginid}|{ts}|{clientSecret}{clientSecret}
```

签名输出：

```text
Base64(SM3(签名输入))
```

注意：

- `SM3(...)` 先得到十六进制摘要。
- 再把十六进制摘要按字节转换后做标准 Base64 编码。
- Base64 使用标准字符集，可能包含 `+`、`/`、`=`；放入 URL 查询参数时必须 URL 编码。
- `clientSecret` 拼接两次，中间没有分隔符。

TypeScript 示例：

```ts
import { sm3 } from "sm-crypto";

function createThirdpartyToken(loginid: string, ts: string, clientSecret: string) {
  const input = `${loginid}|${ts}|${clientSecret}${clientSecret}`;
  const digestHex = sm3(input);
  return Buffer.from(digestHex, "hex").toString("base64");
}
```

Java 示例：

```java
String input = loginid + "|" + ts + "|" + clientSecret + clientSecret;
byte[] digestBytes = sm3Digest(input.getBytes(StandardCharsets.UTF_8));
String token = Base64.getEncoder().encodeToString(digestBytes);
```

`sm3Digest` 需使用第三方系统项目中的国密 SM3 实现。请确认输出是摘要字节数组，而不是十六进制字符串的 UTF-8 字节。

## 6. 跳转链路

IAM 校验第三方登录请求成功后，会写入全局会话 Cookie：

```http
Set-Cookie: global_session={globalSessionId}; HttpOnly; SameSite=Lax; Path=/
```

随后 IAM 302 跳转到：

```text
/sso/authorize?client={targetClientCode}&redirectUrl={urlencoded_redirect_url}&token={globalSessionId}
```

`/sso/authorize` 会继续执行标准 SSO 授权：

1. 校验目标客户端 `client` 是否存在。
2. 校验 `redirectUrl` 是否命中目标客户端 `validRedirectUrls` pattern。
3. 校验全局会话是否有效。
4. 生成一次性授权码 `code`。
5. 根据目标客户端 `managementLevel` 跳转到回调地址。

后续建立局部会话的方式见 [第三方业务系统 SSO 单点登录对接说明](./third-party-sso-integration.md)：

- `Gateway` 网关托管模式：IAM 回调 `/sso/callback`，建立 Gateway Local Session、写入
  `local_{client}_session` Cookie，再跳回 `redirectUrl`。
- `Independent` 独立应用模式：IAM 跳转到目标客户端 `callbackEndpoint`，业务系统后端用 `code` 和
  `clientSecret` 调 `/sso/token` 换取 Independent Client Credential，再自行建立本地会话。IAM 不替第三方建立或存储该会话。

### 6.1 IAM 内部职责边界

进入标准 Custom SSO 授权后，endpoint use case 在授权码消费前完成对应入口校验：`/sso/authorize` 校验目标 client 与
redirect，`/sso/token` 校验 client 与 client secret，`/sso/callback` 校验 client 与 redirect。Custom SSO deep module
随后一次性完成 grant resolution，以及 Independent credential 或 Gateway session 的生命周期；Gateway 所需 ORCAS、
私有 payload、审计和失败补偿也留在该 module 内。Route 只负责 HTTP 参数、Cookie、response 和 redirect 适配。

第三方系统不应依赖 IAM 内部的授权码消费与 credential/session 创建顺序，只依赖最终 HTTP、Cookie 和 redirect contract。

## 7. 第三方系统实现步骤

第三方系统服务端建议按以下步骤实现：

1. 确认当前用户已经在第三方系统登录。
2. 将第三方用户账号映射为 IAM `loginid`。
3. 生成毫秒级时间戳 `ts`。
4. 使用 IAM 分配的 `clientSecret` 生成 `token`。
5. 构造 IAM 第三方登录 URL。
6. 通过 HTTP 302 将浏览器跳转到该 URL。

伪代码：

```ts
const sourceClientCode = "oa";
const targetClientCode = "tender";
const loginid = currentUser.employeeNo;
const ts = String(Date.now());
const token = createThirdpartyToken(loginid, ts, clientSecret);
const redirectUrl = "https://tender.example.com/";

const url = new URL(`${iamOrigin}/public/thirdparty/${sourceClientCode}`);
url.searchParams.set("loginid", loginid);
url.searchParams.set("ts", ts);
url.searchParams.set("token", token);
url.searchParams.set("client", targetClientCode);
url.searchParams.set("redirectUrl", redirectUrl);

return redirect(url.toString());
```

## 8. 错误与排查

| 现象 | 常见原因 | 处理建议 |
|---|---|---|
| `非法client代码` | 路径中的 `clientCode` 不存在、已删除或未正确同步缓存 | 核对 IAM 客户端编码，必要时清理客户端缓存或重新保存客户端。 |
| `token过期` | 生产环境下 `ts` 与 IAM 服务器时间偏差超过 5 分钟 | 校准服务器时间，确认 `ts` 为毫秒级时间戳。 |
| `token校验失败` | 签名算法不一致、`clientSecret` 错误、Base64 或 URL 编码错误 | 对照第 5 节检查摘要字节、Base64 和 URL 编码。 |
| `该用户不存在` | `loginid` 未匹配到启用的 IAM 用户 | 确认第三方账号与 IAM `username` 的映射关系。 |
| `用户类别不支持OA登录` | IAM 用户类型不是“正式员工” | 调整用户类型或改用其他接入方式。 |
| `非法重定向地址` | `redirectUrl` 未命中目标客户端 `validRedirectUrls` pattern | 在目标客户端配置允许的 HTTPS origin、一级子域 wildcard 或 path 末尾 `/*` pattern。 |
| 登录后仍跳统一登录页 | Cookie 域、网关转发路径或 `/public/thirdparty` 转发配置不一致 | 检查网关是否转发到 `/sso/thirdparty/:clientCode`，以及 Cookie 所属域。 |

## 9. 安全要求

1. `clientSecret` 只能保存在第三方系统服务端，不得下发到浏览器、移动端包或前端配置。
2. 第三方系统应通过 302 跳转发起登录，不要让前端自行计算签名。
3. `token`、`clientSecret`、`globalSessionId`、授权码 `code` 等敏感值需要在日志中脱敏。
4. 生产环境应使用 HTTPS。
5. 第三方系统服务器与 IAM 服务器应保持时间同步。
6. `redirectUrl` 应使用明确的业务地址，不建议使用开放跳转页或过宽的 wildcard pattern。
7. 如外部身份源退出登录，应同步调用 IAM `/sso/logout` 或清理业务系统本地会话，避免残留登录态。

## 10. 联调清单

- IAM 已为第三方系统创建客户端并提供 `clientCode`、`clientSecret`。
- IAM 已为目标业务系统创建客户端，并配置 `validRedirectUrls`。
- 第三方系统能生成与 IAM 一致的 SM3 + Base64 签名。
- `ts` 使用毫秒级时间戳，服务器时间已同步。
- `loginid` 能在 IAM 中查到启用状态的正式员工用户。
- 浏览器访问第三方入口后能收到 `global_session` Cookie。
- 后续 `/sso/authorize` 能成功跳转到目标业务系统回调地址。
- Independent 目标业务系统能用 `sid` 自行建立本地会话，或 Gateway 目标能取得 Gateway Local Session，并可调用
  `/public/user-info` 获取当前用户。
