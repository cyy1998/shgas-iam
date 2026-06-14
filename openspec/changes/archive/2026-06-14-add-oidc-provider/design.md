## Context

IAM 当前已有三类可复用资产：

- `user` 是统一身份主体，用户详情能够解析有效 employments、roles 和 privileges。
- `client` 是业务应用主体，`roles.clientId` 已经把应用与授权模型关联起来。
- `global_session` 是统一登录态，custom SSO local session 由其派生并随其清理。

现有 custom SSO client 同时包含明文 `clientSecret`、通配或前缀 redirect 配置和 custom SSO 行为。OIDC 不能直接复用这些协议字段，但也没有必要复制应用和用户主实体。因此本设计采用“主体复用、协议配置隔离、运行时状态独立”的模型。

```text
user                              client
├── existing identity             ├── existing application identity
└── oidcSubject                   ├── immutable clientCode = client_id
                                  ├── existing custom SSO fields
                                  ├── oidcEnabled
                                  ├── oidcConfig JSONB
                                  ├── oidcSecretHash
                                  └── oidcConfigVersion

PostgreSQL: durable identity and configuration
Redis:       global sessions and all transient OIDC protocol objects
Secrets:     RS256 private JWK key set from secure deployment configuration
```

## Goals / Non-Goals

**Goals:**

- 让 IAM 作为标准 OIDC Provider 被内部应用、网关和通用 OIDC client 接入。
- 复用现有 user、client、角色权限、登录风控、全局 session、审计、Redis 和 PostgreSQL。
- 第一版支持 Authorization Code Flow + PKCE、Discovery、JWKS、Token、JSON UserInfo 和 RP-Initiated Logout。
- 保证 OIDC 配置与 custom SSO 的明文 secret、redirect pattern 和 Redis cache 语义隔离。
- 提供可撤销、可审计、可版本失效的 OIDC client 配置和 token 生命周期。
- 通过 `iam:authorization` scope 暴露适合内部应用消费的组织任职和当前 client 授权视图。

**Non-Goals:**

- 不支持 OIDC-only client；第一版只给现有 client 附加 OIDC 能力。
- 不迁移或替换现有 custom SSO，不改变 `/sso/authorize`、`/sso/token` 和 local session 响应。
- 不支持 implicit、hybrid、password、client credentials、device flow、refresh token、`offline_access`、dynamic client registration、PAR/JAR/FAPI、JWT UserInfo 或 token introspection。
- 不支持 pairwise subject、多 issuer、用户 consent、per-client token TTL 或自定义 signing algorithm。
- 不在管理端提供 signing key 管理；第一版通过安全部署配置轮换 key set。

## Decisions

### 1. Provider 使用独立 Node.js 22 LTS 服务

新增 `apps/oidc-provider`，使用 ESM 和精确锁定的 `oidc-provider@9.8.4` 作为初始版本。升级必须经过依赖评审和协议回归测试，不使用开发 interaction 页面。

生产 issuer 固定为同一 IAM origin 下的 `/oidc`，例如 `https://iam.example.com/oidc`。APISIX 将该路径代理到 provider，并正确传递 Host、`X-Forwarded-Proto` 和来源 IP。Provider 信任受控代理头，Discovery 中的 issuer 与 ID Token `iss` 必须完全一致。

### 2. 复用 client 主体，OIDC 配置使用独立列和 JSONB

现有 `client.clientCode` 直接作为 OIDC `client_id`。`clientCode` 对所有 client 从创建后始终不可修改，不再保留只对 OIDC client 锁定的例外。

`client` 新增：

| 字段 | 语义 |
|---|---|
| `oidcEnabled boolean not null default false` | OIDC 协议独立开关 |
| `oidcConfig jsonb nullable` | 非敏感 OIDC 协议配置 |
| `oidcSecretHash varchar nullable` | confidential client secret bcrypt 摘要 |
| `oidcConfigVersion integer not null default 0` | 协议对象失效版本 |

`oidcConfig` 使用 Zod 判别联合：

```ts
type OidcClientConfig =
  | {
      clientType: "public";
      redirectUris: string[];
      postLogoutRedirectUris: string[];
      allowedScopes: OidcScope[];
      tokenEndpointAuthMethod: "none";
    }
  | {
      clientType: "confidential";
      redirectUris: string[];
      postLogoutRedirectUris: string[];
      allowedScopes: OidcScope[];
      tokenEndpointAuthMethod: "client_secret_basic";
    };
```

不保存可配置的 grant types、response types、PKCE method 或 signing algorithm。第一版统一映射为：

```text
grant_types               = [authorization_code]
response_types            = [code]
code_challenge_methods    = [S256]
subject_type              = public
id_token_signed_response  = RS256
```

数据库使用 check constraint 保证 `oidcEnabled=true` 时 `oidcConfig` 非空。JSONB 内容与跨字段组合由 `drizzle-orm/zod` schema 和 service 保证。

### 3. OIDC 与 custom SSO 独立启停

OIDC runtime client 可用条件为：

```text
client.status = Enable
AND client.isDelete = false
AND client.oidcEnabled = true
AND client.oidcConfig IS NOT NULL
```

`Maintance`、`Disable` 和软删除都拒绝 authorize、token exchange 和 UserInfo。OIDC 不继承 custom SSO 的 `userExcluding` 维护白名单。

OIDC 配置状态为：

```text
unconfigured: oidcConfig = null
disabled:     oidcConfig != null && oidcEnabled = false
enabled:      oidcConfig != null && oidcEnabled = true
```

首次 configure 保存合法配置但默认不启用。移除配置前必须先禁用；remove 原子清除 `oidcConfig` 与 `oidcSecretHash`，不影响 client 主体、custom SSO 和角色。

### 4. Client secret 与 DTO 边界

现有 custom SSO `clientSecret` 保持不变，但绝不用于 OIDC。OIDC confidential secret：

- 由系统使用 `crypto.randomBytes(32)` 生成，格式为 `iam_oidc_<base64url>`，不允许管理员自定义。
- 使用共享 bcrypt helper 和可配置 cost 保存摘要。
- 仅在首次配置 public -> confidential 或 rotate-secret 响应中显示一次。
- 轮换后旧 secret 立即失效，不提供双 secret 过渡窗口。
- public client 必须使用 `none` 且 `oidcSecretHash=null`；confidential client 必须使用 `client_secret_basic` 且摘要非空。

`oidcSecretHash` 不进入通用 `ClientDto`、列表/详情响应、旧 SSO Redis client cache、日志或审计。管理端仅返回 `hasOidcSecret`。Provider 使用专用 runtime repository 读取摘要并校验，摘要不写入共享 Redis client cache。

### 5. OIDC 配置版本保证即时失效

`oidcConfigVersion` 初始为 0，下列操作递增：

- configure，包括首次配置和 public/confidential 类型切换；
- enable、disable、remove、rotate-secret；
- client 全局 status 变化或删除。

仅修改 `clientName`、description、url 等展示信息不递增。Authorization Code、Interaction、Grant、Access Token 和 login return handle 保存创建时版本；使用时必须与 PostgreSQL 当前版本相同。Redis 主动清理用于资源回收，版本比对是正确性保证。

### 6. Subject 直接存储在 user

第一版为单 issuer、public subject。`user` 新增：

```text
oidc_subject UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE
```

迁移先增加 nullable 列、为所有存量用户生成随机 UUID，再添加唯一、默认值和非空约束。新用户由数据库默认生成。

`oidcSubject` 不因用户名、手机号、用户资料、禁用或恢复而改变；恢复同一软删除记录仍保留 subject。新建另一条用户记录时，即使 username 相同，也生成新 subject。该字段不进入通用 `UserDto`、普通 API、日志或审计，仅由 provider account repository 读取。

### 7. Scope 与 claims

系统固定支持：

```text
openid
profile
phone
iam:authorization
```

每个 client 的 `allowedScopes` 必须包含 `openid`。请求 scope 必须是允许集合的子集。

标准映射：

| Scope | Claims |
|---|---|
| `openid` | `sub` |
| `profile` | `name <- user.name`, `preferred_username <- user.username` |
| `phone` | `phone_number <- user.mobile` |

`sub` 是唯一稳定身份键；client 不得把 `preferred_username` 当作不可变主键。

`iam:authorization` 仅通过 JSON UserInfo 返回，不进入 ID Token。claim 名同样为 `iam:authorization`：

```json
{
  "iam:authorization": {
    "employments": [
      {
        "organization": {
          "orgCode": "dept-a",
          "orgName": "部门 A",
          "orgType": "department",
          "fullOrgPath": [
            { "orgCode": "company", "orgName": "公司", "orgType": "company" },
            { "orgCode": "dept-a", "orgName": "部门 A", "orgType": "department" }
          ]
        },
        "position": { "posCode": "engineer", "posName": "工程师" },
        "roles": ["app:user"],
        "privileges": ["app:read"]
      }
    ],
    "roles": ["app:user"],
    "privileges": ["app:read"]
  }
}
```

返回全部有效 employments，因为任职事实与 client 无关；每个 employment 内的 roles 必须按当前 `client.id` 过滤，privileges 只能由这些 roles 派生。顶层 roles/privileges 由过滤后的 employment 授权聚合。数据库 ID、user 副本、状态、软删除和时间戳不返回。

employments 按既有 `orderNum`、`orgCode`、`posCode` 稳定排序；组织路径根到叶；roles 和 privileges 去重后按 code 字典序排序。

### 8. Global session 统一为 envelope

`global_session:{sessionId}` 从裸 `UserDetailDto` 升级为：

```ts
interface GlobalSessionEnvelope {
  version: 1;
  authTime: number; // Unix seconds, original authentication time
  user: UserDetailDto;
}
```

登录创建 envelope；用户资料刷新只替换 `user`；滑动续期只刷新 TTL，不改变 `authTime`。Authorize 成功使用浏览器全局会话时续期，Discovery、JWKS、Token 和 UserInfo 不续期。

不兼容读取旧格式。发布维护窗口必须清理全部 global/local session，强制重新登录。Session Redis key、校验、续期、local session 关联和全局清理逻辑提取到 `packages/api-core`，供 `apps/api` 与 provider 共用。

### 9. 登录 interaction 使用 opaque return handle

未登录 authorize 时，provider 保存 interaction，并创建一次性随机 handle：

```text
oidc:login-return:{handle}
  -> interaction id, client id, config version, browser binding
TTL: 10 minutes
```

浏览器跳转 `/login?oidcReturn=<handle>`。SSO portal 不接收任意 URL；登录成功后只跳到固定 provider resume endpoint，并携带 handle。Provider 原子消费 handle，校验 interaction、client、版本和浏览器绑定后恢复 authorize。handle 过期、重复或不匹配时失败关闭。

### 10. Authorization Code Flow 安全基线

所有 client 强制：

- `response_type=code`；
- `state`、`nonce`、`code_challenge` 必填；
- `code_challenge_method=S256`；
- redirect URI 精确字符串匹配；
- public client 使用 PKCE，无 client secret；
- confidential client 同时使用 PKCE 与 `client_secret_basic`。

Redirect URI 必须是绝对 HTTP 或 HTTPS URI，允许生产 HTTP 和 query，禁止 fragment、通配符和模板变量。注册和请求按完整字符串比较，不规范化 host、path、query、编码、端口或尾斜杠。

支持默认 prompt、`prompt=none` 和 `prompt=login`。`prompt=none` 无有效登录态或需重认证时返回 `login_required`。支持 `max_age`；`max_age=0` 强制重新认证，滑动续期不改变 `authTime`。

第一版仅允许管理员配置的内部可信 client，requested scopes 合法后自动批准，不展示 consent 页面，也不保存长期 consent grant。

### 11. Redis adapter 与 Access Token 快照

`oidc-provider` Adapter 分流：

- Client model：PostgreSQL 是权威源，Redis 只缓存不含 secret hash 的 runtime 配置。
- AuthorizationCode、Interaction、Grant、provider Session、AccessToken 和 login return handle：使用 Redis adapter。

Access Token 使用不透明随机 token。签发时保存 OIDC 专用 UserInfo 快照，包括实际 scopes、标准 claims 和按当前 client 裁剪后的 `iam:authorization`，不复用完整 `UserDetailDto`。

UserInfo 每次请求仍实时检查：

- token 存在且未过期；
- user 为 Enable 且未删除；
- client 为 Enable、未删除、OIDC 已启用；
- token `oidcConfigVersion` 与当前版本一致；
- 关联 global session 仍有效。

授权和资料明细从 Redis 快照返回，最长陈旧时间为 Access Token TTL。维护以下反向索引：

```text
oidc:user-tokens:{userId}
oidc:client-tokens:{clientId}
oidc:global-session-tokens:{globalSessionId}
```

用户/client 禁用或删除、OIDC 配置变化、secret 轮换、global logout 时主动撤销相关 token。其他协议对象通过 client version 校验立即失效，并异步或 best-effort 清理。

Token 实际 TTL 与 global session 绑定：

```text
access token TTL = min(configured access token TTL, global session remaining TTL)
ID token TTL     = min(configured ID token TTL, global session remaining TTL)
```

默认 TTL：Authorization Code 5 分钟、Interaction/login return 10 分钟、Access Token 1 小时、ID Token 1 小时；均为全局配置，不允许 client 单独覆盖。第一版不发行 Refresh Token。

### 12. Signing key 和 JWKS 由安全配置管理

Provider 使用 RS256。安全配置提供 current 和可选 previous private JWK；每个 key 必须具有唯一 `kid`。仅 current key 用于签名，JWKS 只发布 current/previous 公钥。previous key 保留时间必须覆盖其签发 ID Token 的最大生命周期。

私钥不得进入 PostgreSQL、Redis、日志、管理端或普通 API。第一版不新增 signing key metadata 表；轮换通过 secret mount 或密钥管理系统更新部署配置完成。

### 13. UserInfo、CORS 和错误边界

UserInfo 仅返回 `application/json`，不支持签名或加密 JWT UserInfo。Discovery 与 JWKS 可公开跨域读取；Token endpoint 仅对 public client 按已注册 redirect URI origin 开放受控 CORS，confidential client 不开放 Token CORS；UserInfo CORS 只允许 Bearer token 所属 client 的已注册 redirect URI origin。所有 endpoint 都不得使用 `*`。

Token endpoint 同时使用 APISIX IP 限流和 provider 内 `client_id + IP` 失败限流。失败返回标准 `invalid_client`，不泄露 client 是否存在或 secret 是否错误。日志不得包含 secret、hash、authorization code、token 或 PKCE verifier。

### 14. RP-Initiated Logout 是全局 SLO

有 `post_logout_redirect_uri` 时必须提供可识别 client 的有效 `id_token_hint`，回跳 URI 必须精确匹配该 client 配置，可选 `state` 原样返回。无 hint 时可根据当前 global session 全局退出，但只能进入默认安全页面。

退出执行：

```text
delete global session
delete related custom SSO local sessions
revoke all OIDC access tokens under the global session
```

`postLogoutRedirectUris` 可以为空；为空时任何 client 回跳都被拒绝。URI 校验与 authorize redirect URI 相同。

### 15. 管理端整合进现有 client 模块

不创建第二套 OIDC client CRUD 或独立导航实体。现有 client 列表增加三态、client type 和 scope 筛选；详情增加 OIDC 配置分区。

专用操作：

```text
client.oidc.configure
client.oidc.enable
client.oidc.disable
client.oidc.remove
client.oidc.rotateSecret
```

允许 public/confidential 类型切换。public -> confidential 必须原子生成并一次性返回新 secret；confidential -> public 原子清除摘要。任何 OIDC 配置变化都递增版本并撤销该 client 现有 token。

审计事件：

```text
admin.client.oidc.configure
admin.client.oidc.enable
admin.client.oidc.disable
admin.client.oidc.remove
admin.client.oidc.rotate_secret
```

审计可记录完整 redirect URI、client type、allowed scopes、版本和状态变化，但不得记录 secret 明文或摘要。

### 16. DTO 分层

不再让一个 `ClientDto` 同时承担数据库实体、管理端视图、custom SSO runtime 和 OIDC runtime：

- Custom SSO runtime DTO：保持现有字段，不携带 OIDC 配置。
- Client admin list/detail DTO：返回 OIDC state/config 和 `hasOidcSecret`，不返回 hash。
- OIDC runtime DTO：返回 provider 所需配置和专用 secret 校验数据，不进入普通 API/cache/log。
- User DTO：不返回 `oidcSubject`；OIDC account DTO 由专用 repository 读取。

## Risks / Trade-offs

- [Risk] JSONB 无法提供每个 URI/scope 的数据库级约束 -> Mitigation: 数据库只保证启用状态不变量，Zod 判别联合和 service 覆盖所有协议组合与 URI 校验。
- [Risk] 允许生产 HTTP redirect URI 会暴露传输风险 -> Mitigation: 强制 PKCE S256、精确 URI 匹配，并在管理 UI 和接入文档中明确风险由管理员与部署网络承担。
- [Risk] Redis UserInfo 快照最多陈旧 1 小时 -> Mitigation: UserInfo 实时检查 user/client/version/global session，配置和主体状态变化通过反向索引主动撤销 token。
- [Risk] Provider 与 API 共享 Redis key 协议可能漂移 -> Mitigation: 提取 `packages/api-core` session 基础设施和契约测试，不在两个 app 中复制 key 规则。
- [Risk] global session envelope 是不兼容升级 -> Mitigation: 维护窗口显式清空 global/local session，强制全员重新登录，并把该步骤列为发布阻断条件。
- [Risk] `clientCode` 全局不可修改会改变现有管理行为 -> Mitigation: 管理端隐藏编辑能力，后端拒绝重命名并增加回归测试；需要新 code 时创建新 client。
- [Risk] exact `oidc-provider` 版本可能滞后安全修复 -> Mitigation: 锁定可重复构建，同时建立依赖安全告警和有测试保护的升级流程。

## Migration Plan

1. 从 `main` 的 `work/add-oidc-provider` 分支实施并验证本 change。
2. 迁移数据库：回填 `user.oidcSubject`，增加 client OIDC 字段和约束；默认所有 client `unconfigured` 且禁用。
3. 部署共享 session envelope、API、admin-api/admin、provider、Redis adapter 和配置，但暂不通过 APISIX 暴露 `/oidc`。
4. 进入维护窗口，停止登录流量，清空全部 global/local session 相关 Redis key，恢复后强制所有用户重新登录。
5. 配置 issuer、RS256 current/previous JWK、全局 TTL、cookie 和测试 client。
6. 开放 `/oidc` 路由，验证 Discovery、JWKS、authorize、token、UserInfo、CORS、prompt/max_age 和 logout。
7. 再逐个配置并启用生产 client。

回滚时关闭 `/oidc` 路由、禁用 OIDC 配置并撤销 OIDC Redis 对象；保留 `oidcSubject` 和 client 新列，不回滚数据库身份数据。
