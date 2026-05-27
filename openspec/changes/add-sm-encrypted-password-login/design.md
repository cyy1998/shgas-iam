## Context

`apps/api` 当前在 `/auth/login/password` 接收 `{ username, password, capToken? }`，`auth.handlers.ts` 直接读取 Zod 校验后的明文字段，再调用 `auth.service.loginPassword(username, password, options)`。后续密码校验、Cap 人机校验、登录失败计数、账号暂停、全局 session 创建和登录日志都已经集中在现有 service 链路中。

`apps/sso` 当前在登录页收集用户名和密码，通过 `apps/sso/src/services/auth.ts` 直接 JSON 提交到 `/auth/login/password`。后端和 `apps/api` 已有 `sm-crypto` 依赖，SSO 前端尚未声明该依赖。

本变更需要满足国密算法传输要求，并且用户已确认直接做 breaking change，前后端同步发布，不保留旧明文字段兼容。

## Goals / Non-Goals

**Goals:**

- 将密码登录请求体改为 `{ credential, capToken? }`，其中 `credential` 是一个文本块，承载 SM2 + SM4 混合加密后的登录凭证。
- 前端把 `username`、`password`、传输时间戳 `ts` 和防重放 `nonce` 加密进同一个凭证明文 JSON。
- 后端在进入既有 `auth.service.loginPassword` 前完成凭证解密、结构校验、时间戳窗口校验和 nonce 防重放。
- 保持现有密码校验、Cap、人机风险记录、登录失败计数、账号暂停、全局 session、cookie 和登录日志语义。
- 支持通过 `kid` 进行 SM2 密钥选择，为后续密钥轮换留出空间。

**Non-Goals:**

- 不在本变更中移除或重做 `MAGIC_CODE`。
- 不改变手机验证码登录、第三方登录、SSO 授权码、局部 session 或网关鉴权语义。
- 不把应用层加密作为 HTTPS 的替代；生产环境仍必须使用 HTTPS。
- 不引入数据库表；nonce 防重放使用现有 Redis。
- 不做旧 `{ username, password }` 请求体兼容。

## Decisions

### 1. 使用 SM2 + SM4 混合加密，而不是只用 SM2 加密整个 JSON

前端为每次密码登录生成一次性 SM4 加密 key、MAC key 和 IV，使用 SM4 加密登录明文 JSON；再使用后端 SM2 公钥加密 key material。最终文本块包含 `kid`、`alg`、`ek`、`iv`、`ct` 和完整性校验标签 `tag`。

建议 envelope 明文结构：

```json
{
  "v": 1,
  "alg": "SM2-SM4-CBC",
  "kid": "2026-05-primary",
  "ek": "<base64url(sm2-encrypted-key-material)>",
  "iv": "<base64url(sm4-iv)>",
  "ct": "<base64url(sm4-ciphertext)>",
  "tag": "<base64url(mac)>"
}
```

建议 credential 文本格式：

```text
iam-login-v1.<base64url(json-envelope)>
```

选择理由：

- SM2 适合加密短数据，用于保护一次性 key material。
- SM4 适合加密业务 JSON，便于扩展 `ts`、`nonce` 等字段。
- 如果实际采用 `sm-crypto` 的 SM4-CBC，CBC 本身不提供完整性校验，`tag` SHALL 覆盖 `v`、`alg`、`kid`、`ek`、`iv` 和 `ct`，后端在 SM4 解密前先验证 `tag`。
- `kid` 使后端可以保留多把私钥，支持平滑密钥轮换。

备选方案：只用 SM2 加密整个登录 JSON。拒绝原因是载荷长度和库实现差异更容易踩边界，也不利于后续扩展字段。

### 2. 登录凭证明文 JSON 固定用途、版本和时间字段

SM4 解密后的明文 SHALL 使用 JSON：

```json
{
  "v": 1,
  "typ": "password-login",
  "username": "138550",
  "password": "1234",
  "ts": 1780000000000,
  "nonce": "<random>"
}
```

后端用 Zod 校验：

- `v` 必须是支持的版本，初始为 `1`。
- `typ` 必须是 `password-login`。
- `username` 和 `password` 必须是非空字符串。
- `ts` 必须是毫秒时间戳。
- `nonce` 必须是高熵随机字符串。

选择理由：把协议版本和用途写进明文，避免同一解密工具被误用于其他业务场景，也为后续协议升级留下兼容点。

### 3. 时间戳窗口和 nonce 防重放放在 handler 前置解析层

后端解密成功后立即校验：

- `Math.abs(Date.now() - ts) <= LOGIN_CREDENTIAL_MAX_SKEW_MS`
- Redis `SET login-credential-nonce:<sha256(kid:nonce)> 1 NX EX <ttl>`

默认建议：

- `LOGIN_CREDENTIAL_MAX_SKEW_MS=300000`
- `LOGIN_CREDENTIAL_NONCE_TTL_SECONDS=360`

nonce key 不包含明文 username 或 credential 内容，只保存哈希后的重放标记。

选择理由：时间戳只能限制大窗口重放，nonce 才能阻止窗口内重复提交。放在 handler 前置解析层可以让后续 `auth.service.loginPassword` 保持接收明文业务参数，不污染认证业务逻辑。

### 4. 密文完整性必须先于 SM4 解密校验

后端使用 SM2 私钥解出 key material 后，必须先验证 `tag`。只有 `tag` 匹配时才允许执行 SM4 解密。

建议 key material 结构：

```json
{
  "encKey": "<sm4-key>",
  "macKey": "<mac-key>"
}
```

建议 `tag` 输入使用稳定串联规则或 canonical JSON，覆盖 envelope 中除 `tag` 外的字段。实现时要避免把 `macKey`、`encKey`、明文密码或完整 credential 写入日志。

选择理由：SM4-CBC 只保证保密性，不保证密文未被篡改。先验证完整性可以减少 padding oracle、格式 oracle 和篡改导致的异常分支暴露。

### 5. 解密失败统一映射为普通业务失败

无论是文本块格式错误、`kid` 不存在、SM2 解密失败、SM4 解密失败、JSON 结构错误、时间戳过期还是 nonce 重放，后端都 SHALL 返回统一错误消息，例如“登录凭证无效”。

选择理由：避免外部通过错误差异探测密钥、算法、时间窗口或 JSON 结构细节。

### 6. 公钥发布优先通过配置注入，后续可扩展为公开 key endpoint

本变更优先在 `apps/sso` 通过构建环境变量注入当前 SM2 公钥、`kid` 和算法标识：

- `UMI_APP_LOGIN_CREDENTIAL_KID`
- `UMI_APP_LOGIN_CREDENTIAL_PUBLIC_KEY`
- `UMI_APP_LOGIN_CREDENTIAL_ALG`

后端通过运行时环境变量读取私钥集合和校验参数：

- `LOGIN_CREDENTIAL_ACTIVE_KID`
- `LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON`
- `LOGIN_CREDENTIAL_MAX_SKEW_MS`
- `LOGIN_CREDENTIAL_NONCE_TTL_SECONDS`

备选方案：新增 `/auth/login/password/key` 公开接口动态返回公钥。暂不采用的原因是 breaking change 同步发布下，构建时注入足够满足首版需求；动态 key endpoint 可以作为后续密钥轮换体验优化。

### 7. 前端加密只封装密码登录服务，不扩散到全局 request

`apps/sso/src/services/auth.ts` 的 `login` 入参保持页面友好的 `{ username, password, capToken? }`，service 内部生成 `credential` 后调用后端。页面和 `withHumanVerification` 重试逻辑仍以业务字段组织请求。

选择理由：Cap 重试时仍需要重新生成 credential，确保 `ts` 和 `nonce` 新鲜。把加密放在 auth service 层可以避免登录页关心密码学细节。

## Risks / Trade-offs

- [Risk] `sm-crypto` 的 SM4 模式、padding 参数和完整性标签输入在前后端用法不一致会导致互解失败。→ Mitigation: 在共享测试向量中固定 key、IV、明文、envelope 和 tag，后端单元测试和前端工具测试使用同一组样例。
- [Risk] 前端构建时公钥配置错误会导致所有密码登录失败。→ Mitigation: 前端启动/构建时校验必要环境变量，后端提供清晰的运维配置清单，发布前用真实环境配置做 smoke test。
- [Risk] 用户设备时间漂移过大导致凭证被判定过期或未来时间过大。→ Mitigation: 时间窗口默认 5 分钟，并在错误文案保持统一；若后续误伤明显，可增加公开 server time endpoint 或在现有配置接口中返回服务器时间。
- [Risk] breaking change 要求前后端同步发布，灰度期间旧前端无法登录。→ Mitigation: 发布顺序必须保证 SSO 前端与 public API 同批上线；回滚时前后端一起回滚到旧请求契约。
- [Risk] 应用层加密可能让排障更难，无法直接从请求体看到用户名。→ Mitigation: 解密成功后可按现有结构化日志记录非敏感上下文，严禁记录密码、SM4 key、私钥或完整 credential。
- [Risk] 统一错误降低可观测性。→ Mitigation: 对外统一“登录凭证无效”，内部日志用安全分类码记录失败阶段，但不记录敏感材料。

## Migration Plan

1. 后端新增登录凭证解密/校验模块、环境变量、nonce Redis 防重放和单元测试。
2. 后端修改 `/auth/login/password` OpenAPI schema 和 handler，仅接受 `{ credential, capToken? }`。
3. SSO 前端新增 SM2 + SM4 加密工具和配置，密码登录 service 生成 credential 后提交。
4. 补充前后端测试：协议测试向量、解密失败、过期时间戳、未来时间戳、nonce 重放、Cap 重试重新生成 credential、成功登录保持既有行为。
5. 发布前在目标环境配置 SM2 key pair、`kid`、时间窗口和 nonce TTL，并进行登录 smoke test。
6. 同步发布 `apps/api` 与 `apps/sso`。

Rollback:

- 因为这是 breaking change，回滚必须同时回滚 `apps/api` 和 `apps/sso` 到旧请求契约。
- 若仅密钥配置错误，可不回滚代码，先修正环境变量并重启对应服务。

## Open Questions

- SM2 密钥格式最终采用未压缩 hex public/private key，还是 PEM/DER 包装格式，需要以 `sm-crypto` 在前后端的实际 API 兼容性确认。
- SM4 模式建议优先固定为 CBC + PKCS#7 padding；如安全合规要求指定 GCM 或其他认证模式，需要确认所选库是否稳定支持。
- 是否需要在首版就新增 `/auth/login/password/key` key discovery endpoint，还是按本设计先使用构建环境变量注入公钥。
