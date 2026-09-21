# API OIDC 发布与密钥维护

Type: runbook
Status: Current
Last verified: 2026-09-21
Next review: 2026-10-31

本页用于当前 API OIDC 的配置发布、签名密钥轮换、验收与兼容版本恢复。
协议处理顺序及失败作用见[OIDC 接入与协议契约](../features/oidc/oidc-integration.md)；
一次性双 issuer 切换见[固定历史手册](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases/oidc-release-runbook.md)，
不作为当前发布的清场步骤。

## 配置与发布前提

OIDC 由 `apps/api` Bun runtime 和 `@iam/oidc` 提供。核对固定应用、Gateway、SSO 前端与配置身份：

- API 必填 `IAM_API_SSO_INTERNAL_ORIGIN`、`IAM_API_SSO_EXTERNAL_ORIGIN`、`IAM_API_OIDC_CURRENT_JWK_JSON`。
  origin 仅允许 HTTP(S)，不得有用户信息、非根路径、query、fragment、空白或反斜杠；规范化后加 `/oidc`。
  两个 origin 相同即同一个 issuer，不能按入口标签拒绝；不同 issuer 共用 current/previous 签名密钥。
- 私钥通过受控 Secret 注入，不临时生成生产 key。namespace、Token/Code/续接期限、login path 与 secure Cookie
  按[API env](../../apps/api/.env.example)核对；API/Admin API 共用相应 Kernel namespace 和会话期限。
- Gateway `/oidc` 保留路径转发至 API。`oidc-internal`/`oidc-external` 按部署 host 覆盖
  `X-IAM-Entry-Network`；dev 按含端口的 authority，prod 按 host。API 不从任意 Host、Forwarded 或 query 生成 issuer。
  `IAM_API_OIDC_TRUST_PROXY` 仅影响客户端 IP。
- Gateway 的实际 host、API origin、SSO 地址和 RP 配置须一致。核验未知 host 拒绝、伪造入口头被覆盖、后端不能被外部直连绕过；
  合法 header 本身不能证明来源可信。TLS、DNS 与直连限制须取得目标环境证据。

Gateway 发布按[限定 scope 的 validate/diff/dry-run/apply 流程](apisix-gateway-release.md)，删除对象须明确 prune。
发布负责人核对固定候选及兼容回退配置，不将日常部署扩展为全会话清理。

`/health` 和 `/oidc/health` 探测 Redis，故障返回 503；`/ready` 检查真实 PostgreSQL/Redis。
健康成功不证明 Client 配置或完整协议可用。

## JWK 签名密钥轮换

1. 生成唯一 `kid` 的 RS256 RSA private JWK，保存到受控 Secret。
2. 将原 current 设为 `IAM_API_OIDC_PREVIOUS_JWK_JSON`，新 key 设为 current；滚动期间所有 API 副本保持一致核验集合。
3. 核对两入口 Discovery issuer/JWKS URL 未意外变化，JWKS 同时提供两份 public key 且不含私钥参数。
4. 使用真实 RP 授权、兑换，验证 ID Token 新 kid、签名、issuer、audience、nonce 与 expiry；
   旧 key 签发且未过期的 Token 仍可核验。
5. 等旧 ID Token 最长期限及实际副本排空后移除 previous，再核对 JWKS。

重复 kid、非法 RSA 或缺少 current 必须启动失败，不降级为内存 key。
轮换不改变 issuer 身份；共享 key 不能使不同 issuer 的 Code、Token 或续接互换。

## 双入口与逐 Client 验收

Client 选择 OIDC，核对 redirect/post-logout URIs、scopes 和 Public/Confidential 类型。
Public 使用 PKCE S256；Confidential 使用 Basic 与 PKCE。普通详情不含 Secret，
通过[授权且审计的窄读取](../features/admin/client-sso-configuration.md)取得当前值，响应丢失不要求再次轮换。

在内外入口分别核对：

- Discovery、授权响应 iss、实际 RP callback、Code 兑换、Token/UserInfo 和取消/确认退出。
  RP 校验本次 issuer、签名、audience、nonce；UserInfo 按当前披露配置交付，ID Token 内容固定。
- Code replay、错误 PKCE 和错 issuer 的结果符合协议契约。已认证且已定位原实例的 Code 兑换失败与在线访问暂态拒绝
  具有不同撤销作用，不能把 Maintenance 一概当成“保留实例”。
- 退出取消保留登录；确认退出作用于提交时观察的当前根。依赖故障保持可恢复 Cookie，
  readiness 不可用，恢复后重新探测。
- 不同 hostname 的 Cookie 隔离、相对导航、受控入口头和未知 host 拒绝。
  同主机不同端口可能共享 Cookie，双端口协议测试不能证明浏览器域名隔离；不承诺跨域免登录。

按[验证归属](../architecture/architecture-verification.md)选择 API、RP 与浏览器证据；
固定官方套件的入口及配置在[命令页](../development/commands.md#oidc-协议套件)。
本地 smoke、套件和真实环境验收各自记录，不相互冒充。

## 故障、恢复与留证

API 在 `service=api` 记录 `oidc_server_error`（error）与 `oidc_protocol_error`（warn），
仅含安全 code/outcome/path/status。按[日志手册](observability-system-logs.md)关联 requestId/traceId，
不记录 private JWK、Secret、Code、Token、Cookie 或原始请求。

发布或 smoke 失败时关闭受影响入口并排空，恢复与当前 schema/状态兼容的固定应用、Gateway、前端及配置；
重新执行 readiness 和完整受影响 smoke，再逐控制面读回放流。
确需清理当前在线状态或恢复 Snapshot 时另按[统一维护手册](unified-session-maintenance.md)，不能把删除计数视为恢复完成。
旧代 schema/issuer 的切换或回退须恢复匹配版本的历史流程，不能用旧 Provider 镜像连接当前数据。

记录候选、镜像、配置身份、JWK public 观察、smoke 与放流结果。
IAM 在线撤销不保证离线 ID Token 或第三方自建登录即时失效；实际部署和外部系统的恢复仍由相应负责人确认。
