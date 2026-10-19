# 登录凭证配置与部署

Type: runbook
Status: Current
Last verified: 2026-09-21
Next review: 2026-10-31

本页用于当前 SM2/SM4 密码登录的配置、配对密钥发布与恢复。
请求结构、凭证拒绝和防重放规则见[登录认证契约](../features/sso/authentication-and-recovery.md#密码登录凭证)；
不包含首次从明文协议切换或回退旧协议的步骤。

## 配置核对

| Runtime      | 配置与约束                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| API          | `IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID` 必须存在于 `IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON`，对应值是 SM2 私钥。                             |
| SSO 构建     | `UMI_APP_SSO_LOGIN_CREDENTIAL_KID` 与 API active kid 一致；`UMI_APP_SSO_LOGIN_CREDENTIAL_PUBLIC_KEY` 是该私钥配对公钥。                        |
| 时间与防重放 | `IAM_API_LOGIN_CREDENTIAL_MAX_SKEW_MS` 的单位为毫秒；`IAM_API_LOGIN_CREDENTIAL_NONCE_TTL_SECONDS` 的单位为秒。实际配置须按下节核对完整接受期。 |
| Cap          | 核对 `UMI_APP_SSO_CAP_ENDPOINT`、`UMI_APP_SSO_CAP_SITE_KEY`、`UMI_APP_SSO_CAP_WASM_URL`、`UMI_APP_SSO_CAP_PAKO_URL`。                          |

私钥通过受控配置注入，不写入前端 bundle、仓库或日志。
nonce key 为 `login-credential-nonce:<digest>`，不是可随意清空的缓存。

### 时间窗口与已知限制

当前实现接受 `abs(now - ts) <= maxSkewMs`，包括未来时间戳；nonce 从首次请求占用时起按固定 TTL 过期。
因此同一凭证的接受跨度可接近两倍偏移窗口。仅要求 nonce TTL 不短于单侧偏移，不能保证完整接受期内防重放。

仓库默认偏移为 300000 毫秒、nonce TTL 为 360 秒，尚未覆盖上述跨度，env 也未做两者交叉校验。
该问题及时间模型的选择由[讨论 #261](https://github.com/cyy1998/shgas-iam/issues/261)跟踪；本文没有改变默认值或实现。
稳定时钟、忽略在途延迟的理想模型下，固定 TTL 须严格大于两倍偏移窗口；实际还需评估各 API 副本时钟偏差、
回拨和时间校验至 nonce 写入的延迟，不能把某个更大的 TTL 单独当作完整保证。

发布前记录实际参数、各副本一致性和时钟监控，并在隔离验证环境覆盖未来时间戳与 nonce 到期边界。
env validation 通过、系统时钟同步或即时重复请求被拒绝，都不足以证明该问题已经解决；
依赖完整防重放保证的发布须先解决并验证这项缺口，不以文档修订代替修复。

## 配对发布与恢复

1. 固定兼容的 API/SSO 构建、密钥配置、实际时间参数及回退候选；记录所有 API 副本和 SSO/CDN 发布位置。
2. 按部署控制面关闭公共密码登录、直连和自动重试入口，读回关闭状态并排空在途密码认证。
   列明仅供 smoke 的操作者、账号和授权目标；本仓库没有可代替这些控制的通用停流命令。
3. 在 API 注入私钥映射、active kid、偏移窗口与 nonce TTL，确认 env validation；
   active kid 缺少配对私钥时应启动失败。
4. 部署使用匹配公钥/kid 构建的 SSO，更新 CDN 与浏览器旧 bundle，逐副本及实际页面核对配置身份。
5. 公共入口继续关闭，仅开放上述受控入口完成 smoke。发现配置不匹配或防重放验证缺口时保持关闭并处理原因。
6. smoke 成功后关闭临时入口，确认各副本及页面仍使用核验过的配置，再逐项恢复公共密码登录并读回控制面。
   开放失败或结果未知时按[放流与人工恢复责任](unified-session-maintenance.md#放流与人工恢复责任)重新关闭。

配置错误只需修复错误的 key/kid 或匹配 SSO 构建，不必修改协议或轮换其他凭据。
API/SSO 不匹配时保持密码登录关闭，恢复兼容构建与配对配置、刷新缓存后重验。
Redis 异常先修复依赖，不批量清 nonce；仅可清理明确识别的演练测试 key，不能使真实凭证可重放。
回退保持当前加密凭证协议，不恢复明文请求入口。

## Smoke 与安全观察

- 使用专用测试账号和已退出或隔离的浏览器会话，确认没有有效 UserSession，再从有效授权目标进入 SSO。
  必须观察到密码表单及实际加密凭证请求；已有根直接续接不算密码登录验证。
  完成登录后确认新根、`global_session` 与原授权目标的续接结果。
- 错误密码仍进入失败计数和提示路径；触发 Cap 时完成求解并携带 capToken 重试。
- 过期凭证及 nonce 尚在时重复提交同一凭证返回 `LOGIN.INVALID_CREDENTIAL`，不创建新 session。
  完整防重放还须在隔离环境验证未来边界时间戳、nonce 到期后的重复及接受期末端；当前默认参数的已知缺口见上节。
- 未知 kid、解密/完整性失败按认证契约拒绝；legacy 明文请求拒绝。
- 检查 API、SSO、APISIX、Loki/Grafana，不得记录 password、SM2 私钥、SM4 key material、nonce 原文、
  credential 原文、Cap token 或 challenge solution。

只保存配置身份、kid、候选、requestId/traceId、错误分类和脱敏结果。
smoke 失败维持受控入口关闭，修复后重跑成功、错误密码、Cap、过期、重放及日志检查；
日志关联和采集规则见[观测手册](observability-system-logs.md)。
