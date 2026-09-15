# API OIDC 发布与回滚手册

Type: runbook
Status: Current
Last verified: 2026-09-15
Next review: 2026-10-31

## 发布前提

当前 OIDC 由 `apps/api` 的 Bun runtime 与 `@iam/oidc` 提供；旧 `apps/oidc-provider`、独立镜像和 Provider Cookie key 已退役。
本地代码验证不表示已切换环境。首次升级完整执行[统一维护手册](unified-session-maintenance.md)，先用固定旧制品
完成 Client apply/verify，再应用收缩 DDL、全体清理、Snapshot repair/verify 和一代启动，不能混跑旧新 reader/writer。

API 必填 `IAM_API_OIDC_ISSUER`、`IAM_API_OIDC_PUBLIC_ORIGIN`、`IAM_API_OIDC_CURRENT_JWK_JSON`。
issuer 保持原外部 `/oidc` URL，public origin 与 Gateway 一致；JWK 使用受控 Secret 注入，禁止依赖临时生成生产密钥。
其他 `IAM_API_OIDC_*` 包括 previous JWK、namespace、各协议 TTL、login path 与 secure Cookie，准确默认值以
[API env](../../apps/api/.env.example)为准。API/Admin 必须共用 Kernel namespace 与根期限；协议 Token TTL 不续根。

Gateway 的 `/oidc` route 保持路径并转到 API upstream，不做 `/oidc` rewrite。`/oidc/health`、`/health` 延续 Redis 探测语义，Redis 故障返回 503；
`/ready` 检查真实 PG/Redis；健康不等于 Client 配置或全部协议可用。部署前在固定配置上执行 Gateway validate/diff，
实际 apply 与 TLS、代理信任、来源网络及 readiness 由发布负责人核对。

## JWK Signing Key Rotation

1. 生成唯一 `kid` 的 RS256 RSA private JWK，存入受控 Secret 配置。
2. 将旧 current 设为 `IAM_API_OIDC_PREVIOUS_JWK_JSON`，新值设为 current；滚动期间各 API 副本须有一致核验集合。
3. 部署后核对 Discovery 的 issuer/JWKS URL 不变，JWKS 同时提供两份 public key 且不含私钥参数。
4. 真实 RP authorize/token，验证 ID Token 新 `kid`、签名、issuer/audience/nonce/expiry；旧未过期 Token 仍可核验。
5. 等旧 ID Token 最长期限与实际副本排空后移除 previous，再核对 JWKS。

重复 kid、非法 RSA 或缺少 current 必须启动失败；不降级为内存 key。配置和签名 tests 属于 API/package owner，
#195 官方固定套件单独验收，不能以本地 smoke 代替。

## 逐 Client 与故障 smoke

Client 选择唯一 OIDC，设置合法 redirect/post-logout URIs、scopes、Public/Confidential 和独立当前 SSO Secret。
Public 使用 PKCE S256；Confidential 同时使用 Basic 与 PKCE。普通详情不含 Secret，授权的窄读取需审计。
核对 authorize/resume/token/me、当前 UserInfo 披露与 ID Token IAM claim 排除、Code replay/PKCE 失败后重授权、
Maintenance 暂态保留、恢复访问、取消退出保留及确认退出终止请求当前根。

依赖不可用时协议返回暂态且保留可恢复 Cookie；readiness 变为不可用，恢复后重新探测。API 的结构化
`oidc_server_error`（error）与 `oidc_protocol_error`（warn）仅含安全 code/outcome/path/status；
确认 Grafana 在 `service=api` 查询，不能继续依赖旧 Provider service/event。观测细节见[日志手册](observability-system-logs.md)。

## 回滚与验收记录

统一升级的数据库与状态回退只按[统一维护手册](unified-session-maintenance.md)，不能用旧 Provider 镜像连接最终收缩 schema。
保存固定候选、镜像、配置身份、数据门禁、安全基线、原始 smoke、JWK public 观察及 cleanup/放流结论。
不可记录 private JWK、Secret、Code、Token 或 Cookie。目标环境的停流、数据迁移、部署和放流本票均未执行。
