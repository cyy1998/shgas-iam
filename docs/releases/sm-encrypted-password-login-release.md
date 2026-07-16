# SM 加密密码登录发布手册

Type: runbook
Status: Current
Last verified: 2026-07-16
Next review: 2026-10-31

## 适用范围

本手册用于发布 `/auth/login/password` 的 SM2 + SM4 加密凭证登录契约。事实来源包括
`packages/contracts/src/auth/login-credential.ts` 及其测试、
`apps/api/src/services/authentication/login-credential.parser.ts` 及其测试、`apps/api/src/env.ts`、
`apps/sso/src/lib/login-credential.ts` 及其测试，以及 `apps/sso/src/constants/config.ts`。

该变更是请求契约变更：密码登录请求体只接受 `credential` 和可选 `capToken`，不再接受 legacy
`{ username, password }` 明文请求。

## 必需配置

后端 `apps/api`：

- `IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID` 必须存在于 `IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON`。
- `IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON` 必须包含当前启用 `kid` 对应的 SM2 私钥。
- `IAM_API_LOGIN_CREDENTIAL_MAX_SKEW_MS` 定义凭证 `ts` 与服务端时钟的最大偏移窗口。
- `IAM_API_LOGIN_CREDENTIAL_NONCE_TTL_SECONDS` 不得短于时间戳偏移窗口，以覆盖防重放检查。
- Redis 必须可用；nonce 防重放 key 形如 `login-credential-nonce:<digest>`。

前端 `apps/sso` 构建：

- `UMI_APP_SSO_LOGIN_CREDENTIAL_KID` 必须等于后端 active `kid`。
- `UMI_APP_SSO_LOGIN_CREDENTIAL_PUBLIC_KEY` 必须是后端 active SM2 私钥配对的公钥。
- Cap 相关配置保持有效：`UMI_APP_SSO_CAP_ENDPOINT`、`UMI_APP_SSO_CAP_SITE_KEY`、
  `UMI_APP_SSO_CAP_WASM_URL` 和 `UMI_APP_SSO_CAP_PAKO_URL`。

协议常量必须保持原样：`LOGIN_CREDENTIAL_PREFIX = "iam-login-v1"`、
`LOGIN_CREDENTIAL_ALG = "SM2-SM4-CBC"`、`LOGIN_CREDENTIAL_TYPE = "password-login"`。

## 同步发布顺序

1. 从同一变更集构建 `@iam/api` 和 `@iam/sso`；不要把只接受 `credential` 的 API 与旧 SSO 前端拆开发布。
2. 在 API 运行环境中注入 SM2 私钥映射、active `kid`、时钟偏移窗口和 nonce TTL。
3. 部署 `@iam/api`，确认 env validation 通过；如果 active `kid` 不在私钥映射中，应用应启动失败。
4. 部署使用匹配公钥与 `kid` 构建的 `@iam/sso`。
5. 清理浏览器缓存或 CDN 缓存中可能残留的旧登录 bundle。
6. 执行 smoke 后再恢复全量登录流量。

## Smoke 验收

- 成功登录：通过 SSO 页面发起密码登录，确认 `/auth/login/password` 返回成功并写入 `global_session`。
- 密码错误：使用错误密码，确认仍进入原有失败计数和提示路径。
- Cap 重试：触发 `passwordLogin` 风险策略，确认后端返回需要人机校验的业务码，SSO 前端求解 cap.js 后携带
  `capToken` 重试一次。
- 凭证过期：构造超出 `IAM_API_LOGIN_CREDENTIAL_MAX_SKEW_MS` 的凭证，确认返回
  `LOGIN.INVALID_CREDENTIAL`，错误信息指向凭证过期或设备时间不正确。
- nonce 重放：重复提交同一 `credential`，确认第二次返回 `LOGIN.INVALID_CREDENTIAL`，且不创建新 session。
- legacy 明文拒绝：直接提交 `{ "username": "...", "password": "..." }`，确认请求被 schema 或凭证校验拒绝。
- 敏感日志检查：API、SSO、APISIX、Loki/Grafana 中不得出现 password、SM2 私钥、SM4 key material、nonce 明文、
  `credential` 原文、Cap token 或 challenge solution。

## 错误码与日志检查

| 场景 | 期望结果 |
|---|---|
| `kid` 不存在、算法不支持、SM2/SM4 解密失败、tag 校验失败、payload 结构错误 | 返回 `LOGIN.INVALID_CREDENTIAL`。 |
| `ts` 过期或明显晚于服务端时间 | 返回 `LOGIN.INVALID_CREDENTIAL`，提示凭证过期或设备时间不正确。 |
| nonce 已使用 | 返回 `LOGIN.INVALID_CREDENTIAL`，不得继续校验密码。 |
| Cap token 缺失或无效 | 返回前端可识别的人机校验业务码，并输出脱敏 `human_verification.*` 日志。 |
| 用户名或密码错误 | 保持既有登录失败计数、临时黑名单和审计语义。 |

日志只允许记录 `kid`、requestId、traceId、错误分类和脱敏 subject；不得记录密钥材料、密码、credential 原文或
Cap token。

## 回滚矩阵

| 回滚场景 | 是否允许单独回滚 | 处理方式 |
|---|---|---|
| 只有 SM2 key material 配错 | 可以只修复配置 | 修正 `IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON`、`IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID` 或 SSO 公钥后重启/重新部署。 |
| SSO 已发布加密凭证，API 仍是旧契约 | 不允许长期停留 | 立即发布匹配 API；短时故障期间关闭密码登录入口或回滚 SSO bundle。 |
| API 已只接受 `credential`，SSO 仍提交明文 | 不允许长期停留 | 立即发布匹配 SSO；否则密码登录不可用。 |
| 需要回滚到旧明文契约 | 必须同时回滚 API 和 SSO | 清理新版前端缓存；确认 `/auth/login/password` 明文路径恢复前不要开放登录流量。 |
| nonce Redis 状态异常 | 不回滚代码优先 | 修复 Redis 连接或清理明确识别的 `login-credential-nonce:<digest>` 测试 key；不要批量删除无关 Redis key。 |

回滚后必须重跑成功登录、错误密码、Cap 重试、legacy 请求契约和敏感日志 smoke。
