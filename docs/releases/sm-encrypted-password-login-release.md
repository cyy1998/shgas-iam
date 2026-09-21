# 登录凭证配置与部署

Type: runbook
Status: Current
Last verified: 2026-09-21
Next review: 2026-10-31

本页用于当前 SM2/SM4 密码登录的配置、配对密钥发布与恢复。
请求结构、凭证拒绝和防重放规则见[登录认证契约](../features/sso/authentication-and-recovery.md#密码登录凭证)；
不包含首次从明文协议切换或回退旧协议的步骤。

## 配置核对

| Runtime | 配置与约束 |
|---|---|
| API | `IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID` 必须存在于 `IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON`，对应值是 SM2 私钥。 |
| SSO 构建 | `UMI_APP_SSO_LOGIN_CREDENTIAL_KID` 与 API active kid 一致；`UMI_APP_SSO_LOGIN_CREDENTIAL_PUBLIC_KEY` 是该私钥配对公钥。 |
| 时间与防重放 | `IAM_API_LOGIN_CREDENTIAL_MAX_SKEW_MS` 定义 ts 偏移窗口；`IAM_API_LOGIN_CREDENTIAL_NONCE_TTL_SECONDS` 不短于该窗口。保持系统时钟同步、Redis 可用。 |
| Cap | 核对 `UMI_APP_SSO_CAP_ENDPOINT`、`UMI_APP_SSO_CAP_SITE_KEY`、`UMI_APP_SSO_CAP_WASM_URL`、`UMI_APP_SSO_CAP_PAKO_URL`。 |

私钥通过受控配置注入，不写入前端 bundle、仓库或日志。
nonce key 为 `login-credential-nonce:<digest>`，不是可随意清空的缓存。

## 配对发布与恢复

1. 固定兼容的 API/SSO 构建、密钥配置及回退候选；密钥/kid 变化时安排受控登录窗口。
2. 在 API 注入私钥映射、active kid、偏移窗口与 nonce TTL，确认 env validation；
   active kid 缺少配对私钥时应启动失败。
3. 部署使用匹配公钥/kid 构建的 SSO，更新 CDN 与浏览器旧 bundle，验证实际加载版本。
4. 在受控入口完成下述 smoke，确认配置和页面一致后再恢复全量密码登录。

配置错误只需修复错误的 key/kid 或匹配 SSO 构建，不必修改协议或轮换其他凭据。
API/SSO 不匹配时保持密码登录关闭，恢复兼容构建与配对配置、刷新缓存后重验。
Redis 异常先修复依赖，不批量清 nonce；仅可清理明确识别的演练测试 key，不能使真实凭证可重放。
回退保持当前加密凭证协议，不恢复明文请求入口。

## Smoke 与安全观察

- 从有效授权目标进入 SSO，完成密码登录，确认成功创建根并写入 `global_session`。
- 错误密码仍进入失败计数和提示路径；触发 Cap 时完成求解并携带 capToken 重试。
- 过期凭证及重复提交同一凭证返回 `LOGIN.INVALID_CREDENTIAL`，重放不创建新 session。
- 未知 kid、解密/完整性失败按认证契约拒绝；legacy 明文请求拒绝。
- 检查 API、SSO、APISIX、Loki/Grafana，不得记录 password、SM2 私钥、SM4 key material、nonce 原文、
  credential 原文、Cap token 或 challenge solution。

只保存配置身份、kid、候选、requestId/traceId、错误分类和脱敏结果。
smoke 失败维持受控入口关闭，修复后重跑成功、错误密码、Cap、过期、重放及日志检查；
日志关联和采集规则见[观测手册](observability-system-logs.md)。
