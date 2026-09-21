# Custom SSO 协议契约

本文供维护协议实现时使用；接入步骤与请求示例见[第三方接入指南](third-party-sso-integration.md)。
`@iam/custom-sso` 拥有授权、Code、Token、认证续接和交付；API 拥有 HTTP、Cookie 与外部 adapter。
会话关系由 [Kernel](unified-session-kernel.md)拥有，账号裁决由 [Subject Access](subject-access-operation-contract.md)拥有。
决策理由见 [ADR-0035](../../adr/0035-unify-user-and-client-session-lifecycles.md)与
[ADR-0038](../../adr/0038-derive-managed-sso-callback-from-redirect-origin.md)。

## 授权与认证续接

`createUnifiedCustomSsoAuthorization` 每次取得一次当前 Client Snapshot，检查 Client 状态、SSO 启用及 Custom 协议，
按当前允许列表校验新请求的实际 `redirectUrl`。可信根解析后取得本操作许可，再原子 open ClientSession；
有效实例复用并更新最近协议及有界期限，UserSession 和既有 Code 不续期。已经接受的 Snapshot 不在交付前重读。
授权 Gate 拒绝不套用业务兑换的实例撤销规则。

无有效根时，已接受的实际落地地址、callback、兑换方和可选 state 写入有期限的服务端续接，返回 `ssoReturn`。
短期 `custom_sso_continuation` Cookie 使用 HttpOnly、SameSite=Lax、Path=/；guard/resume 同时核对 handle 和浏览器绑定。
恢复校验原 Client、地址、state，重新检查当前 Gate、协议与根许可；普通允许列表编辑不重审原地址。
当前 callbackType 与原用途不同则拒绝，要求重新授权。直接进入 client/redirectUrl 登录页尚未形成持久的已接受授权。
登录页状态与首次认证行为见[登录与恢复](authentication-and-recovery.md)。

实际落地地址支持 fragment/hash 路由，并完整绑定到 Code。允许列表未指定 fragment 时沿协议、host、端口与 path
规则匹配；指定时对规范化 fragment 精确匹配，包括空 `#`，不在 fragment 中展开通配。
fragment 内的 `?` 仍是 hash 内容，真正 URL query 仅在原 wildcard 匹配规则允许时接受。
业务兑换必须提交原 fragment，托管交付完整保留。

## 回调与协议状态

`callbackType` 显式区分两种交付，不从 URL、请求 Host 或 Forwarded 推断：

| 类型 | 配置与首次接受事实 | 消费方 |
|---|---|---|
| business | 必填固定完整 `callbackEndpoint`，允许 query；禁止 ORCAS。 | 业务后端通过当前 SSO Secret 兑换。 |
| managed | 配置严格禁止 `callbackEndpoint`；由规范化落地 origin 推导 `/sso/callback`，保留协议、主机和非默认端口。 | IAM 托管 callback；管理员为每个允许的业务 origin 部署代理。 |

managed 基础回调不复制落地 path/query；API 使用授权结果保存的单个 callback，不接受额外 mode/delivery/callback
参数。续接和 Code 固定首次接受的实际落地、回调、用途和 state；类型切换使原类型请求失效。
business 兑换仍比较当前登记 callback 与原值；managed 核验原 callback 等于原落地 origin 加 `/sso/callback`，
不增加实际 HTTP origin 检查，允许代理改写 Host。

Custom 状态 namespace 追加 `:custom-sso:v1:`。Code 外部值为 `Code ID.UserSession ID.ClientSession ID`；
随机 Code ID 没有 MAC 或签名。记录绑定 Client、原根/子实例 ID、不可变 instance、用途、回调、兑换方、落地/state
及 Redis 时间确定的固定期限。摘要定位同时绑定 Client、原根、子实例和 Code ID；拼接其他范围不能取得原 Code。
Code 与续接由协议 owner 独占，不在 Kernel 建第二登记。

## 业务兑换与失败作用

`createUnifiedCustomSsoOperations().forOperation(operation).exchange(input, deliver)` 包含整个兑换及响应构造。
POST `/sso/token` 要求严格 Basic 与 form `code`、`redirect_uri`；后者是原最终落地地址。
仅 query 中的 Code 不替代 form 输入。已取得可解析 form Code 后，query、重复/未知参数、Content-Type 和地址错误
交给完整操作在认证与定位之后拒绝。成功交付 `{ sid, ttl, subject }`，使用唯一 V2 wire schema。

顺序为：适用 Secret 认证 → 有界解析 Code → 中性观察原根及同 Client 的原实例 → 当前 Snapshot/Gate、参数、
Code 用途/回调/兑换方/地址与账号许可检查 → 原子比较完整已观察记录、校验时间并消费 → 投影 → Token 签发与交付。
原已接受地址不按后续允许列表重审。只有明确 consumed 才继续；缺失、过期和竞争失败不创建消费墓碑。

| 失败阶段 | Code | ClientSession 与 Token 作用 |
|---|---|---|
| 认证失败/未知、格式不明、目标不存在或归属不符 | 不消费。 | 不猜测撤销目标。 |
| 认证与原实例定位后，Gate、参数、用途、地址、许可等检查失败 | 尚未消费。 | 有界尝试撤销原观察实例，包括 Maintenance 等暂态拒绝。 |
| Code 缺失、过期、竞争失败或消费结果未知 | 不恢复、不重试消费。 | 同样尝试撤销原实例。 |
| 明确消费后投影、签发、序列化或响应构造失败 | 已消费，不补发成功结果。 | 尝试原实例撤销；本次已知 Token 同步尽力补偿。 |

每项失败作用默认最多等待 1000ms，composition 可配置 1–5000ms；每请求只尝试一次。
超时或丢响应保持 unknown，底层命令仍可能晚到生效。撤销比较原 ID/instance，原根无效不阻止中性撤销，
其他根、Client 和新实例不受影响。没有后台补齐、重新签发或可靠重放。

`CustomSsoExchangeFailure` 分别保留原错误、consumption、revocation、tokenCompensation。
HTTP 保持原错误映射，通过 `X-IAM-Code-Consumption`、`X-IAM-Client-Session-Revocation`、
`X-IAM-Token-Compensation` 表达安全结果，不返回身份定位或凭据。
unknown/failed 不表示终止成功；Token 补偿成功也不能代替实例撤销结果。HTTP 构造成功不证明对端收到响应。

## 托管消费与外部交付

`completeCallback` 接收 code、clientCode、redirectUrl 和可选审计上下文。
GET `/sso/callback` 不以请求 Host、根 Cookie 或内部读取 Secret 作为托管认证依据。
一次当前 Snapshot 确认 managed 配置后，读取原范围 Code，核对原用途、回调派生关系、实际地址及原确切会话关系，
取得本操作许可后原子消费。业务 Code 不能借配置改为 managed 绕过 Secret。

明确 consumed 后才读取适用专用用户、调用 ORCAS、签发 Token 并构造完整 Response。
ORCAS 只在启用时执行，使用许可内专用 reader，不追加 active-user 过滤，不额外读取通用 Projection；
ORCAS 的 userId/sessionId 仅保存到 managed Token 的 orcas 专用字段，不进入共享会话、business Token、通用主体投影或 Gateway Header。
登录成功审计 `auth.login.local` 失败只记录安全 warning，不反转成功结果。

所有 Cookie 与 Location 准备成功后才返回 Response。局部及 ORCAS Cookie 使用 Token 的固定剩余秒数，
HttpOnly、SameSite=Lax、Path=/；当前实现不设置 Secure。最终 URL 保留 token、适用 orcasToken 和原 state。
Cookie 为实际回调 host 的 host-only Cookie；URL bearer 是现存交付边界。

托管失败与业务兑换不同：消费失败/未知不调用 ORCAS、不签 Token；消费后的任何失败均要求重新授权，
只对本次已知 Token 作上述有界 compare-delete 补偿，**不因托管交付失败撤销共享 ClientSession**。
`CustomSsoManagedFailure` 及 HTTP 只报告消费与 Token 补偿，不返回业务兑换的实例撤销 header。
账号明确失效仍由 Subject Access 自己执行拒绝/撤销。

补偿 unknown/failed 的 Token 可能保留至自身到期或原会话终止；不承诺后台回收。
同根重新授权可以复用原有效 ClientSession。ORCAS 成功但响应丢失时，本请求不重试外部成功；
新 Code 可能再次触发外部登录，adapter 不提供真实外部幂等、查询或退出保证。

## Token 使用与主体交付

Token 的完整随机 bearer 经 SHA-256 直接定位唯一记录，独立随机 ID 的反向键仅用于管理。
记录保存 managed/business 用途、Client、原确切会话身份与固定 issuedAt/expiresAt；managed Token 还可保存专用 orcas.userId/sessionId。
它不保存 Subject/Facts/Claims Snapshot，business Token 不携带 ORCAS 引用。
期限取协议 TTL 与已观察根/ClientSession 上限；兑换、访问及重新授权不延长旧 Token。
补偿比较本次完整原值；反向键仅在仍指向相同摘要时删除。

在线使用检查 Token 自身、用途与 Client，再组合观察原 UserSession/ClientSession 和两个 immutable instance，
取得一次账号许可与当前 Client Snapshot。最近授权协议标记不使另一协议仍有效的 Token 自动失效，
但当前 Client 协议选择、启停和状态继续控制访问。成功终止根后的新访问不依赖子索引，晚到 Token 也不能恢复原实例；
已取得观察的在途操作不在交付前复查。

完整 Subject 按当前 `subjectClaims` 经 permitted Projection 与 V2 mapper 裁剪；最小 authz Header
仅有 version、subjectIdentifier 及允许的 username/name，仅稳定主体不读 Facts。
[已发布 Facts](published-subject-facts-contract.md)允许旧权限，配置披露变化也适用于旧 Token。
各 HTTP 入口允许的用途、错误与 Cookie 行为见接入指南；配置拒绝不能概括成“Token 过期”。

## 库存与验证入口

`/maintenance` 的 inventory/apply 按 cursor、limit 和可选 clientCode 处理 Code、Token 与续接。
每页最多 limit 个键，SCAN 多出的键保存在不透明 cursor；重复扫描不代表全局一致快照。
apply 比较原值；孤立反向键需原子重验主记录缺失，无法判定归属或损坏记录保留并计 unknown。
无 TTL/缺索引仍可从 owner namespace 发现。全量清理停 writer、排空，从 cursor 0 重扫，
再用独立连接核验 matching=0、unknown=0；全量 verifier 只需 SCAN，Client 范围核验仍需只读解析归属。
执行步骤见[统一维护手册](../../releases/unified-session-maintenance.md)。

`/testing` 仅用于状态观察和故障注入。协议、真实 HTTP/Redis、Gateway 与外部系统的证明范围见
[架构验证归属](../../architecture/architecture-verification.md#行为资源与系统验证)；本文不保存某次候选的执行结果。
