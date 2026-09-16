---
status: accepted
---

# 按内外网入口固定 OIDC issuer，并保持 IAM 内部相对跳转

维护者于 2026-09-16 要求 OIDC 与 Custom SSO 的登录跳转沿用浏览器当前入口，并为 OIDC 提供内外网两个固定
issuer。本决策记录 `grill-with-docs` 讨论中逐项确认的目标；维护者随后调用 `to-spec` 发布当前设计，
并确认沿用已讨论的测试边界。当前为已接受的修改目标，尚未实施或部署。
Custom SSO 的内外网配置目前选择协议端点 origin，不具有 OIDC issuer 的身份语义。

[完整设计](../features/sso/dual-entry-login-design.md)连接入口配置、导航、协议绑定、失败、切换与验证；
Q8 已按维护者最新选择修订，原 Q11 的前提随之撤回。设计与测试边界共同作为 Spec 发布依据。

## 已确认的决定

### Q1：IAM 内部浏览器跳转使用相对路径

登录页、认证续接、退出确认等 IAM 内部浏览器跳转统一使用以 `/` 开头的路径，沿用浏览器当前入口。
业务应用回调仍使用其登记和验证后的完整地址；Discovery 的 issuer 和协议端点继续返回完整 URL。
Q6 明确 IAM 托管回调也保留配置的完整地址，属于本规则的例外；Custom SSO 不承诺整条流程始终同源。
登录地址配置仅接受安全的根相对路径；既有绝对配置显式迁移，不静默丢弃域名。具体边界见完整设计。

### Q2：每条 OIDC 流程固定一个 issuer

内网与公网各有一个固定 issuer；一条授权流程从开始到续接、兑换及产物使用保持 issuer 一致。
跨 issuer 兑换拒绝，不支持以公网 issuer 授权后改向内网 issuer 的 Token 地址兑换。
通过同一 issuer 域名的网络路由或 DNS 访问内网服务，不属于跨 issuer 兑换。
错入口兑换按 Q8 进入现有兑换失败处理，适用认证及原实例定位通过后，有界尝试撤销原 ClientSession。

### Q3：两个 issuer 共用 Client 配置

同一个 OIDC Client 默认可使用两个 issuer，共用 client_id、凭据及已登记的回调白名单，不增加逐 Client
允许 issuer 的配置。接入方按本次选定的 issuer 校验 Token，接受同一 IAM 用户在两套 issuer 下形成不同的
`(iss, sub)` 组合；IAM 的 Subject Identifier 不因此重新生成。

### Q4：复用内外网 origin 派生 issuer

复用 Custom SSO 现有内外网 origin，分别追加 `/oidc` 得到固定 issuer，不再维护另一套独立 OIDC 入口地址。
Gateway 按已配置入口覆盖 `X-IAM-Entry-Network`，API 只接受 internal/external，缺失或非法标记拒绝。
请求 Host 或调用方参数不能直接成为 issuer；Gateway 与后端不可被绕过的部署信任边界须单独验证。

### Q5：保留现有会话模型，不新增跨域免登录

UserSession/ClientSession 继续保持协议中性，不按 issuer 新增关系维度；不同域名分别登录，不新增跨域免登录
或 Cookie 同步。普通退出终止本次根登录，「全部下线」仍遵守现有范围。同主机不同端口可能共享 Cookie，
不承诺端口级会话隔离。同一根与同一个 Client 仍只有一个有效 ClientSession，其撤销作用不按 issuer 拆分。

### Q6：Custom SSO 回调按实际配置执行

维护者选择继续使用 Client 实际配置的完整 callback URL；IAM 托管回调与业务自行托管的回调均不按本次内外网
入口改写。内网授权若配置了公网 `/sso/callback`，登录成功后仍跳该公网地址，这是明确接受的跨入口导航。
本次不引入随入口生成的 effective callback，不改变现有托管分类、授权事实保存与回调消费规则，也不自动同步 Cookie。

### Q7：两个 issuer 共用签名密钥

共用现有签名密钥与轮换流程，两个入口的 JWKS 可以发布相同公钥集合；客户端仍须精确校验本次预期 issuer。
共享密钥不允许跨 issuer 使用 Code、Token 或退出凭据，也不把两个 issuer 视为可互换的字符串别名。

### Q8：错入口兑换沿用现有失败撤销规则

维护者撤回先前的错入口零消费/零撤销选择，改为与现有兑换失败模式一致：通过适用 Client 认证并定位原确切
ClientSession 后，跨 issuer 兑换失败也在本次请求内有界尝试终止该实例。格式、认证或归属门槛尚未通过时只拒绝，
不猜测撤销目标；不扩大为 UserSession、其他 Client 或后来新建的实例。

按现有先消费后校验顺序，Code 被取走后发现 issuer 不符就不签 Token，已取走的 Code 不恢复，并尝试撤销原关系。
原根仍有效时，调用方应重新发起授权。若未取到 Code、消费结果未知或撤销失败，分别沿用现有失败及报告规则，
不把撤销尝试写成已成功终止；不再承诺改回正确入口重试同一 Code 可以成功。

同一根与 Client 的 ClientSession 仍共享，其终止会影响该实例下两个 issuer 的在线 Token。以上保留 ADR-0035 的
已接受作用范围和无消费墓碑模型；原 Q11 针对提前识别错入口所提出的额外 issuer 标记/签名选择不再需要。

### Q9：允许相同 origin，按实际 issuer 身份合并

内外网 origin 可以相同，此时派生同一个 issuer，internal/external 两个入口标签都选择它，不以标签差异拒绝操作。
协议绑定和隔离依据完整 issuer 身份，不依据入口标签；两个 origin 不同时各自形成独立 issuer。

### Q10：升级清除全部 IAM 会话

维护者选择在升级维护窗口清除全部 IAM 会话，让所有用户重新登录；不采用只清 OIDC 并保留根会话的建议。
清理范围包括 UserSession、ClientSession，以及 Custom SSO/OIDC 的 Code、Token、续接和退出确认等在线状态。
账号、Client 配置及业务数据不属于会话清理范围。具体操作复用现有 owner 维护流程；本轮只确认设计，尚未执行清理。
已签 ID Token 的离线验证和第三方自行创建的本地登录不因清除 IAM 状态自动失效。

## 协议响应与验证边界

授权成功和可以安全回调的错误响应携带本次固定 `iss`，Discovery 声明
`authorization_response_iss_parameter_supported=true`，按
[RFC 9207](https://www.rfc-editor.org/rfc/rfc9207.html)让接入方在回调时辨认授权来源。当前
[wire schema](../../packages/oidc/src/wire.ts)只接受 Code/state 或 error/state，尚未包含 `iss`；能力声明和实际
响应必须一起调整。无法验证回调地址的错误仍本地拒绝，不为携带 `iss` 而跳往未验证地址。

维护者已确认测试沿用现有 API HTTP 与真实 Redis 入口、Gateway 与两个不同域名的浏览器流程，以及 Worker
维护命令；分别证明协议和撤销、入口和 Cookie、全会话清理和非目标保留，不新增旁路实现来替代正式接线。

## 当前实现的证据

下列为基线代码的只读调查结果，不表示双入口目标已经实现，也不替代动态测试：

| 边界 | 已观察到的行为与来源 |
|---|---|
| 登录页 | [API composition](../../apps/api/src/composition/services/index.ts) 使用 `new URL(loginEndpoint, sso.externalOrigin).href`，将两协议登录固定解析到外网 origin。 |
| Custom 配置发现 | [SSO handler](../../apps/api/src/routes/sso/sso.handlers.ts) 只接受 `X-IAM-Entry-Network` 的 internal/external，缺失或非法值返回 400，无默认入口。 |
| OIDC 路由 | [生产 Gateway manifest](../../gateway/manifests/prod/iam.yaml) 与[开发 manifest](../../gateway/manifests/dev/iam.yaml) 当前 `/oidc` route 未注入入口网络标记；现有 `X-Forwarded-Host/Proto` 不等于 issuer 选择。 |
| OIDC 产物 | [授权状态](../../packages/oidc/src/state.ts)、[Token 状态](../../packages/oidc/src/token-state.ts)与[退出状态](../../packages/oidc/src/logout-state.ts)不保存 issuer；[Token 操作](../../packages/oidc/src/tokens.ts)以启动时固定 issuer 签发。 |
| Cookie 与会话 | [OIDC HTTP](../../apps/api/src/routes/oidc/oidc.http.ts)与[Custom 授权 HTTP](../../apps/api/src/routes/sso/unified-authorization.handlers.ts)设置无 Domain 的 Cookie；[Kernel 模型](../../packages/session-kernel/src/unified/model.ts)不包含 issuer。 |
| 托管回调 | 讨论时按受信 origins 的完整 `/sso/callback` 分类；此限制现已由 [ADR-0037](0037-classify-managed-sso-callbacks-by-path.md) 的显式类型取代，固定完整 callback 跳转保留。 |
| 浏览器证据 | [全系统 E2E 配置](../../e2e/system/compose.yaml)把内外 origins 设为相同值，不能证明不同主机下的 Cookie 与入口行为。 |

OA/微信当前由 [SSO routes](../../apps/api/src/routes/sso/sso.routes.ts)承接第三方回跳，成功后的 authorize resume
已经使用相对路径；Portal 当前不构造第三方 OAuth 登录 URL。配置发现中的 `thirdPartyOAEndpoint`、注册 callback
及协议中的完整 `redirectUrl` 仍属完整地址数据，不因用于 IAM 自有页面而机械移除 origin。

### 已有维护能力与升级前提

[Worker 参数](../../apps/worker/src/commands/online-state/arguments.ts)及
[维护 composition](../../apps/worker/src/composition/online-state-maintenance.ts)支持 `layout=unified`、`owner=all`，
分别调用 Kernel、Custom SSO、OIDC owner 清理两类会话、两协议产物及对应索引。
[OIDC maintenance](../../packages/oidc/src/maintenance.ts)覆盖 continuation、Code、Access Token、token-id
和退出确认。全 owner 范围不能加 Client 过滤，否则可能漏掉无 Client 的退出确认。
现有 API 默认 namespace 为 `iam:oidc`，实际状态前缀为 `iam:oidc:oidc:v1:`；发布时应核验实际配置，不能猜默认值。

Q10 已明确选用全部 IAM 会话清理，发布时不能只选择 OIDC owner。
实施时必须固定能识别旧记录的维护候选，在停写/排空后清理并独立 verify；新增必填 issuer 后的 decoder 未必还能
读旧记录。非目标账号、配置和其他状态的保留须直接验证。以上为只读代码调查，未执行维护或测试。

### Code 表达与消费

Q8 修订后，可继续保留外部三段 Code、无签名、无消费墓碑和按 Client/根/关系/Code ID 定位的存储身份。
服务端保存的授权与 Code 记录增加完整 issuer；取得 Code 后，先确认原事实的 issuer 与可信请求 issuer 一致，
再允许继续签发。缺码时不再需要恢复原 issuer 才能执行已接受的失败作用，不新增消费前预读或跨入口恢复流程。

先前针对零副作用要求的 Code 外部 issuer 标记、防篡改封装及缺码豁免方案均不纳入当前设计。
跨 issuer 操作可以消费原 Code 并终止共享 ClientSession，但不能成功获得改签成另一 issuer 的 Token。

## 规范依据与既有约束

[OIDC Discovery §4.3](https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfigurationValidation)
要求发现地址使用的 issuer、Discovery 返回的 issuer 与 ID Token 的 `iss` 一致。
[OIDC Core §5.7](https://openid.net/specs/openid-connect-core-1_0.html#ClaimStability)
以 `(iss, sub)` 组合表达接入方可依赖的稳定用户标识。

[ADR-0035](0035-unify-user-and-client-session-lifecycles.md) 中两类会话、同根同 Client 关系复用及 Code 兑换失败
作用继续保留；Q8 将 issuer 不匹配作为现有认证/归属门槛之后的一种协议失败，不新增撤销豁免或 Code 签名。

## 恢复点

目标分支为 `main`，讨论基线为 `a7e37d3d`，功能分支为 `codex/dual-entry-oidc`。
Q1–Q10 已确认，Q6 保留固定配置回调，Q8 最新选择沿用失败撤销，Q10 升级清除全部会话；原 Q11 随 Q8 修订撤回。
维护者于 2026-09-16 调用 `to-spec` 发布当前完整设计并确认测试边界；设计作为修改目标定稿，
不表示生产代码已支持双 issuer。独立设计提交与来源 Spec 编号由发布后的 Spec 保存，实施继续复用本功能分支。
