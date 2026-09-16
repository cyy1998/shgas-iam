# 内外网 OIDC issuer 与相对登录导航设计

Status: Current

Last verified: 2026-09-16

Next review: 2026-10-31

本文汇总 [ADR-0036](../../adr/0036-bind-oidc-to-internal-and-external-issuers.md) 的已确认目标与设计。
Q1–Q10 已确认，Q8 已修订为沿用现有失败撤销，原 Q11 因此前提变化撤回。
维护者于 2026-09-16 调用 `to-spec` 发布当前设计并确认测试边界；本文作为修改目标定稿；#198/#199 已分别交付相对导航与双 issuer 接线；#200 联合证据见[验收账本](dual-entry-acceptance.md)，尚未部署。
当前事实证据和调查限制见 ADR；本页描述修改目标，不替代现有运行手册。

## 1. 入口与配置

API 继续以 `IAM_API_SSO_INTERNAL_ORIGIN` 和 `IAM_API_SSO_EXTERNAL_ORIGIN` 为固定入口来源，分别加 `/oidc`
派生 issuer。两值相同就只有一个 issuer；绑定依据实际 issuer URL，不依据 internal/external 标签。
不增加 Client 的 issuer 允许列表，不从请求 Host、Forwarded 或 query 动态构造 issuer。

Gateway 为 OIDC 增加与 Custom SSO 一致的入口映射，按实际配置的 host/路由覆盖 `X-IAM-Entry-Network`。
需要 issuer 的 API 操作只接受 internal/external，缺失或非法标记在协议状态作用之前拒绝，不默认选公网。
Gateway 必须覆盖调用方自带标记，未知 host 不得落入可生成 issuer 的兜底入口。后端直连限制由部署边界保证，
应用校验合法 header 值不证明发送方可信；现有 `OIDC_TRUST_PROXY` 的客户端 IP 用途不扩张成 issuer 信任依据。

配置契约如下：

- 移除独立的 `IAM_API_OIDC_ISSUER` 和 `IAM_API_OIDC_PUBLIC_ORIGIN` 输入，更新 API/Compose/示例/测试消费方。
- `IAM_API_LOGIN_ENDPOINT` 保留配置位置，只接受安全的根相对路径，例如 `/portal/login`。拒绝绝对 URL、
  `//host`、反斜杠和可改变 authority 的歧义形式；旧绝对配置由维护者显式改成路径，不静默丢弃其域名。
- 两个 origin 派生的地址必须是合法 HTTP(S) origin 与固定 `/oidc` 路径；生产网络与 TLS 要求沿用 OIDC 接入规范。
- 健康检查中不需要 issuer 的进程存活能力保持独立；不能为了绕过入口验证而通过健康路径交付协议配置或状态。
- 同一运行配置中的 issuer 集合固定；启动校验失败不部分启用。API 与 Gateway 通过本次维护窗口协调切换。

## 2. 浏览器导航与协议地址

| 地址用途 | 目标规则 |
|---|---|
| IAM 登录页、登录守卫后的续接、门户发起的 IAM 授权/退出、OIDC 退出确认和默认成功页 | 浏览器导航使用根相对路径，保持发起该跳的当前入口。 |
| Custom SSO `callbackEndpoint`，包括 IAM 托管 `/sso/callback` | 原样使用实际配置并按现有规则接受和绑定的完整地址，不根据入口改写。 |
| 业务落地地址、OIDC `redirect_uri`、登记的 post-logout redirect | 保留完整协议地址和现有校验，不按“目标恰好属于 IAM”机械相对化。 |
| Custom 配置发现和 OIDC Discovery 的端点、issuer | 返回所选入口对应的完整 URL，供前后端接入方使用。 |
| OA/微信接入方使用的 IAM 回跳端点 | 保持完整协议地址；当前成功后的 IAM 内部 authorize resume 已相对，回归其行为。 |

因此，内网登录加公网 Custom callback 仍会跨域；Q6 明确接受这一行为，不新增有效回调映射或 Cookie 同步。
浏览器相对导航与服务器保存的完整授权事实是两种用途，不能把存储字段也改成相对字符串。
门户若从发现配置取得绝对的 IAM 内部端点，应确认其属于本次入口后生成导航路径，不能任意截掉陌生 URL 的 origin。

裸 `/portal/login` 的入口校验、认证续接参数、已有会话重入守卫、新鲜认证拒绝、密码/短信认证和当前 OA/微信接入
保持现有职责；本次不把登录页改成无授权上下文的通用登录入口，也不简化为只传 `ssoReturn` 的另一套协议。

## 3. issuer 与协议产物

同一个 OIDC Client 共用 client_id、当前凭据、scope/回调配置和 Subject Identifier；内外入口共用现有签名密钥
及轮换。Client 必须精确验证本次预期 issuer；相同公钥与 sub 不使两套 `(iss, sub)` 自动等价。
UserSession/ClientSession 保持协议中性，同根同 Client 的有效关系继续复用，不新增 issuer 维度。

| 对象或操作 | 绑定与使用约束 |
|---|---|
| Discovery | issuer 与当前受信入口对应；每个端点按该 issuer 生成完整 URL。相同 origin 返回同一身份。 |
| 授权接受事实、Authentication Continuation | 保存本次 issuer；login-guard/resume 在查询根、允许完成、消费或清 Cookie 前比较。 |
| Authorization Code | 保存 issuer；保持现有认证、实例定位和一次消费顺序，取出后验证 issuer。错入口失败进入原实例有界撤销，不恢复 Code。 |
| ID Token | `iss` 取已接受且与当前入口一致的原授权 issuer，不在兑换时改签成另一入口。 |
| Access Token | 服务端状态保存 issuer；UserInfo 在访问根、ClientSession 和主体披露前拒绝不匹配入口。 |
| `id_token_hint` | 按本次请求 issuer 验证签名及现有其他要求，不能因为共享 keys 而接受另一 issuer。 |
| 退出确认、取消 | 保存 issuer；在读取/作用根、消费确认、清 Cookie 前比较。正常确认与取消保留现有不同作用。 |
| JWKS | 各 issuer 地址发布共享 current/previous 公钥；遵守现有密钥轮换与缓存规则。 |

授权成功和可安全回调的错误都携带所选 `iss`，同时在 Discovery 声明
`authorization_response_iss_parameter_supported=true`；按 [RFC 9207](https://www.rfc-editor.org/rfc/rfc9207.html)
支持接入方区分授权响应来源。无法验证 redirect 的错误仍本地返回；wire schema 与全部回调构造必须同步调整。
现有或新增发现缓存必须以完整 issuer 区分，不能只按公共后端路径或 Client 缓存一个结果供两个入口使用。

## 4. 兑换失败与作用范围

Q8 最新选择将跨 issuer 兑换纳入现有失败规则。Code 继续使用 `Code ID.UserSession ID.ClientSession ID`，
不新增外部 issuer 标记、签名或消费墓碑。服务端记录保存完整 issuer，原 key 继续按 Client、原根、原关系、Code ID
精确绑定；各入口访问同一 OIDC 状态 owner，不靠 issuer namespace 制造另一套 Code 生命周期。

操作顺序保持为：取得当前 Client 配置 → 适用 Client 认证 → Code 格式和原实例归属定位 → 现有 Gate/参数检查
→ 一次取出删除 Code → 验证原绑定、期限及 issuer → 原 redirect/PKCE 等校验 → 原会话/主体许可 → 签发交付。
issuer 必须在签发任何成功 Token 前验证；ID Token 的 `iss` 来自已匹配的原授权事实，不能把它替换成兑换入口。

| 失败位置 | 作用 |
|---|---|
| 可信入口缺失/非法、Client 认证未通过、格式不可解析或原实例归属不符 | 拒绝，不猜测撤销目标；保持现有认证门槛。 |
| 门槛通过后，取得 Code 并发现 issuer 不符 | 返回 `invalid_grant`，不签 Token；Code 已消费且不恢复，在本请求内有界尝试终止原 ClientSession。 |
| 门槛通过后，Code 缺失、过期、竞争未取得、消费未知或其他失败 | 沿用现有准确目标和有界撤销规则，不因不能确定原 issuer 豁免；未知结果不当作成功。 |
| 撤销失败或结果未知 | 独立报告，不能宣称已终止，也不恢复 Code 或创建可靠后台补偿任务。 |

只作用于已观察的原确切 ClientSession，不终止 UserSession、其他 Client 或后来新建的实例，不因本次兑换失败清根
Cookie。该关系被终止后，它引用的两个 issuer 的在线 Token 均失效；原根仍有效时可以重新授权建立新关系。
已消费 Code 不能靠改回正确入口重试恢复。既有伪造缺码和竞争输家撤销的边界保留，不新增 Q11 所讨论的签发证明。
这不构成外部定位防篡改：按 ADR-0035 现有门槛，知道同 Client 另一合法根及关系定位者仍可构造缺码触发该关系撤销。
正确入口与错误入口并发兑换时，错误入口不得签发；失败方仍可能终止共享实例，使正确入口的迟到 Token 无法在线使用。

Continuation、UserInfo、hint、退出确认/取消并非 Code 兑换，不套用兑换失败撤销。其 issuer 不匹配仍在各自消费、
Cookie 修改或根撤销之前拒绝；不存在的状态返回所属协议失效结果，不凭猜测恢复或改绑。相同 origin 派生的 issuer
相同，不能仅因入口标签不同触发这些拒绝。本地错误不能跳往未验证业务地址，wire error 沿现有各端点契约映射。

## 5. 部署切换

Q10 已确认清除全部 IAM 会话、全体重新登录。复用[统一会话维护手册](../../releases/unified-session-maintenance.md)
中的 `layout=unified`、`owner=all`，按实际三个 namespace 在独立进程依次 inventory、apply、verify，不加 Client 过滤。
该能力分别清 Kernel、Custom SSO、OIDC 的当前在线状态和索引，不使用 Redis 全库清空。

维护窗口顺序：固定能识别旧无 issuer 布局的工具及回退候选，关闭相关读写并排空；全 owner 清理并独立验证；
协调发布 API、Gateway、前端与配置；完成内外入口新登录和协议验收后放流。失败保持停流，按同一精确范围恢复或重跑。
不因本次变更重复执行旧 Provider `source` 清理、Client 配置迁移、SSO Secret 换新或 Snapshot 全库修复。

保留 PostgreSQL 用户、Client、凭据与业务/审计数据，以及 Subject Access、Facts/Profile、Snapshot、限制与队列等
非会话状态；比较非目标基线，不能由会话库存清零推断保留成功。旧浏览器 Cookie 可能仍留在客户端，但无法再定位有效根。
这次清理不调用 ORCAS 退出，也不能立即撤销第三方自建登录或离线 ID Token。回滚不恢复已清除的会话备份或混跑新旧 reader。

当前未执行上述维护。环境发布与真实第三方接入仍需按既有人工发布流程取得相应证据。

## 6. owner 与验证

`packages/oidc` 拥有 issuer 绑定、协议状态、签发与失败语义；API 拥有可信入口解析、HTTP/Cookie/重定向适配和
composition；Gateway 拥有受控入口映射，Portal 拥有浏览器导航。Worker 只组合公开 owner 维护能力。
Custom SSO 的固定 callback、Kernel 会话身份及 PostgreSQL Client 模型不增加 issuer 配置。

后续实现按以下可观察行为验收，而不以静态字段检查替代协议证据：

| 范围 | 必须证明 |
|---|---|
| 配置与 Gateway | 双入口和同 origin；请求自带 header 被覆盖；未知/缺失/非法入口失败；不存在任意 Host 生成 issuer 的路径。 |
| 导航 | 内外入口分别登录与续接，内部 Location/导航相对；Custom 固定 callback 和业务落地精确保留；无上下文登录页仍拒绝。 |
| OIDC 成功流程 | 两入口各自 Discovery、授权、回调 iss、兑换、ID Token iss、UserInfo、确认/取消退出；共享 Client/keys 不破坏绑定。 |
| OIDC 错入口兑换 | 认证与归属门槛前拒绝无撤销；门槛后 issuer mismatch 不签 Token，原 Code 已消费且不可重试，原 ClientSession 按规则撤销；根、其他 Client、新实例不受扩大作用。 |
| 其他产物错入口 | continuation、Token、hint、确认/取消不跨 issuer 使用；不消费续接/确认，不清 Cookie 或扩大成根撤销。 |
| 原失败边界 | Secret/PKCE/缺码/竞争/未知失败及准确撤销继续成立，包含双向错入口、错入口 Code 缺失/过期/重放、跨入口并发及共享关系下其他 Token 的结果。 |
| 浏览器 | 使用两个不同 hostname 验证 Cookie 和完整导航；两个 localhost 端口或同 origin 的既有 E2E 不代替这项证明。 |
| 升级 | 固定旧 decoder 全 owner 清零；旧根和两协议产物不可恢复；两入口新登录成功；非目标数据保留。 |

以正式模块/HTTP factory 和真实 Redis 测试消费及撤销；用 Gateway 与浏览器通道验证真实入口和 Cookie。
按既有 OIDC 协议验收流程在两套 issuer 下运行适用的 Discovery、Code/Token 和 Logout 检查，记录实际结果，
不把曾经单 issuer 通过的历史结果当作新双入口证明。实现阶段运行受影响 typecheck、行为通道、静态检查；最终交付
再执行工作流要求的聚合验证。各票的实际命令与固定候选记录在 #198–#200；不能由设计文档推断运行时或目标环境验收通过。
