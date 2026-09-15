# Custom SSO 业务兑换与在线访问候选

本文记录 #185 的单代能力，复用 #184 的授权与三段 Code。#194 已完成默认生产装配，托管回调与 ORCAS 已由 #186
交付（见[托管交付候选](custom-managed-candidate.md)），跨协议最终组合和固定源码基线成本比较由 #196 汇总；本地验证不表示环境已经部署。

## 完整操作与 HTTP

`@iam/custom-sso` 的 `createUnifiedCustomSsoOperations` 拥有业务 `exchange`、`resolvePublicAuthentication`
和 `authorizeLocalSession`。每次通过 `forOperation` 接收活跃的 Subject Access 操作。API 的
`createRootAuthenticationComposition` 显式注入 `customSsoAccess`，把新业务入口与已有新授权接到同一个候选 router。
根 `Client: iam` UserInfo 继续由根消费者拥有；业务 Client 的 bearer 交给 Custom owner，不尝试旧会话或格式 fallback。

POST `/sso/token` 保留严格 Basic 凭据和 form `code` / `redirect_uri`，后者是最终落地地址。handler 保留可解析的 form
Code 后把 query、重复参数、未知参数、错误 Content-Type 或落地地址一并交给完整操作，在认证和定位之后拒绝。
只有 query 中的 Code 不能替代 form 输入。成功仍通过唯一 wire schema 返回 `{sid, ttl, subject}`，sid 是随机协议 bearer。
响应构造在 `exchange` 的 delivery callback 内，序列化失败也进入同一失败边界；传输交付后对端是否收到不可由 HTTP
响应构造证明，协议不重放或补发。

业务操作先确认 Secret 认证，再有界解析 `Code ID.UserSession ID.ClientSession ID`，并通过 Kernel 的中性观察核对
原根/Client/原实例。认证错误或未知、格式不明、目标不存在或归属不符，不消费、不猜测撤销目标。通过门槛后，当前
Snapshot 的 Gate/协议、参数、Code 用途/callback/兑换方/最终地址及会话许可均在消费前检查。当前 redirect 允许列表不
重新审核已接受 Code 的实际地址。消费比较已读取的完整原记录，并在同一 Redis Lua 中检查时间、删除；不同 Client、
原根、实例和 Code ID 的摘要 namespace 隔离，唯一取得者才继续投影与签发。缺失、自然过期和竞争失败没有消费墓碑。

门槛后的任意失败都只尝试原观察 ClientSession 一次；每个失败作用默认最多等待 1000ms，可由 composition 在
1–5000ms 内配置。超时保持 unknown，底层命令仍可能晚到生效，不能把超时当成未执行。没有后台任务、自动补齐、
重新消费或重新签发。原根失效不妨碍中性撤销，其他根、Client 和之后的新实例保留。

`CustomSsoExchangeFailure` 分别携带原错误、consumption、revocation 和 tokenCompensation。HTTP 保持原错误映射，并
使用 `X-IAM-Code-Consumption`、`X-IAM-Client-Session-Revocation`、`X-IAM-Token-Compensation` 返回三个安全状态；
不输出身份定位、Secret 或 Token。unknown/failed 不表示已终止；即使 Token 补偿成功，也不替代实例撤销结果。

## Token、当前资料与在途边界

Token 自有独立随机 ID，完整 bearer 的 SHA-256 直接定位 Custom 记录；反向 ID 仅用于管理定位，不是第二权威。
记录只保存用途、原确切会话/Client 身份和 Redis 固定 issuedAt/expiresAt，不存 Subject/Facts/Claims Snapshot。
Token 期限取自身 TTL 与已观察根/ClientSession 的上限；兑换、UserInfo、authz 和之后重新授权都不延长旧 Token。
已知本次 Token 在保存未知或交付失败后同步尽力 compare-delete，反向 ID 仅在仍指向相同摘要时删除。

每次在线使用先检查 Token 自身和固定用途/Client，再从 Kernel 取得原根与原 ClientSession 的组合观察，核对两个
immutable instance，取得独立账号许可与本操作当前 Snapshot。ClientSession.protocol 是最近授权标记，不用来拒绝另一
协议仍有效的 Token；当前协议选择和启停仍独立控制访问。切回仅恢复未终止对象，旧账号代际不能因重新启用而恢复。
原根成功终止后的新访问拒绝不依赖子索引，撤销成功后的晚到 Token 也拒绝；已取得有效观察的在途操作不增加提交前复查。

完整 Subject 通过现有 permitted Projection 与 strict V2 wire mapper 按当前 subjectClaims 裁剪。authz 将选择进一步
收窄为稳定主体及可选 username/name，保持 Base64 最小 Header。仅需主体时不读取 Facts。Facts 使用既有已发布 reader，
允许已发布旧权限，缓存命中不现场聚合或读取 Dirty；缓存读取故障和缺失/坏 payload 的回源责任仍由该 owner 拥有。

## 维护与 testing

`@iam/custom-sso/maintenance` 公开 `createUnifiedCustomSsoInventory` 的只读 inventory，以及
`createUnifiedCustomSsoMaintenance` 的 inventory/apply。输入 cursor、limit 和可选 clientCode；每页最多处理 limit 个
键，SCAN 多返回的键放入不透明 cursor，不能丢弃。重复扫描可能返回已观察项，计数不是全局一致快照。apply 比较完整
原值后删除，Token 反向键另比较摘要，孤立反向键在删除时重新确认主记录缺失。无 TTL、缺索引记录仍通过 owner namespace
找到；未知或损坏记录保留并计 unknown，其他 Client 和续接保留。全量清理期间必须停相应 writer 并排空，删除导致 SCAN
变化后从 cursor 0 重扫，再用独立连接完整 inventory 核验 matching=0 且 unknown=0，不能用单页成功冒充清理完成。
#193 已装配 [Worker CLI、退出码与新进程核验](../../releases/unified-session-maintenance.md)。同一 owner 的 inventory/apply
同时覆盖 Authentication Continuation；全量独立 verifier 只需 SCAN，Client 范围核验仍须只读解析归属。
没有引入外部公开 Token 撤销端点。

`@iam/custom-sso/testing` 提供真实 Redis scope、定向前/后执行故障、消费/签发中断、Code/Token 观察和精确清理。
业务测试通过公开完整操作或正式 HTTP 观察状态；测试能力不能转为在线许可。

## #155 核销与成本

| 原重复检查 | 新候选处置 |
|---|---|
| Gate 与 Runtime 分别 acquisition | 同操作只取得一份普通 Snapshot；Secret 仍是独立敏感观察。 |
| Credential protocol/type/client 多层重复判断 | Token owner 单次 strict 解析及用途/Client 比较；Kernel 只检查原关系与生命周期。 |
| Subject delivery 重复 loadAcceptedClient | 完整操作接受一次配置，封装交付 capability，mapper 不再读 Client。 |
| 已接受配置的重复版本判断 | 新代没有普通配置版本撤销；当前协议/Gate 校验保留。 |
| 纯赋值 try/catch | 不复制旧编排；剩余 catch 对应真实存储、失败分类或补偿。 |
| 根 UserInfo 的独立 Client 交付校验 | 保留根消费者与原测试。 |
| 真实消费 I/O、未知结果、原实例与 Token 补偿 | 全部保留；不能作为重复步骤删除。 |

网络样本通过真实 loopback HTTP 和透明 TCP 代理，包含新 Kernel、Custom Code/Token、Snapshot/Secret、Subject Access
及 Facts warm reader。连接握手、登录和缓存预热完成后，串行三轮逐端点 await；记录两个方向 data 事件及完整响应耗时。
该受控小 payload 样本中每次命令请求/响应各一个 chunk，没有 pipeline；任意网络的 TCP chunk 数并非通用 RTT 算法。
源 Client/Secret 行在采样前通过窄 seam 初始化，Facts 通过正式 publisher 预先发布。Facts 的 SQL 连接专门指向不可用
端口并记录调用，warm 样本断言零 SQL；因此此处不证明 cold PG 成本或数据库可用性，真实数据库通道另行执行。
网络场景使用独立随机 Client code，贯通授权、Basic、Token、UserInfo/authz 和真实 Snapshot/Secret source；清理只处理
本随机 Client 的键。固定 `app` 的非目标哨兵在采样及 fixture 清理后比较原始 DUMP 与绝对 expiry，已有值不覆盖，
仅以 compare-delete 清理本测试用 NX 创建的哨兵。R1 的固定 Client 隔离 finding 已按此方式修复并重测。

2026-09-14 Bun 1.3.14、仓库 Redis 8.8.0、同机器的三轮结果：

| 完整候选端点 | Redis 请求/响应交换与串行波次 | 三轮耗时 ms |
|---|---:|---|
| authorize | 6 | 6.06 / 3.44 / 3.53 |
| token | 10 | 5.92 / 7.62 / 7.95 |
| user-info | 5 | 6.43 / 3.80 / 2.99 |
| authz | 5 | 3.37 / 2.65 / 3.63 |

三轮普通配置/Secret 源读取及 Facts SQL 均为零。兑换的 10 波分别为 Secret、原实例中性定位、Snapshot、Code 读取、
原根/关系组合读取、账号许可、原子消费、动态 Facts、Redis 签发时间、Token 保存；在线访问的 5 波是 Token、根/关系、
许可、Snapshot、Facts。新根/关系检查和动态投影单独列明，不把已交付摘要定位、固定 TTL 再计收益。
#196 使用固定源码基线同条件重测；这里不宣称完整性能预算 #71/#72 已达成。

首次网络测试因代理闭包复读被改写 URL 而自循环，固定 upstreamAddress 后通过，未提高 timeout；该失败不是候选性能结论。
实际最终验证命令、候选 SHA、资源清理和评审结果保存于 #185 评论。跨协议完整派生、托管交付和实际部署均保留后续 owner。
