# 在线认证生命周期最终契约核对

Status: Current

Last verified: 2026-09-10

Next review: 2026-10-31

目标来自 [Spec #115](https://github.com/cyy1998/shgas-iam/issues/115)；已接受决定为
[ADR-0027](../../adr/0027-own-online-authentication-lifecycle-time-in-redis.md)。本页记录当前实现及可执行证据的证明范围，
不是本次命令通过记录；固定候选、实际命令、结果、双轴评审和未执行项以
[#120](https://github.com/cyy1998/shgas-iam/issues/120) 及其前置票评论为准。维护切换、合入、push、部署均不由本页声明完成。

## 当前生产路径

| Owner | 已消除的双时间路径 | 保留语义 |
|---|---|---|
| Kernel `storage/observation.ts`、`storage/store.ts`、`facade.ts` | TIME 与对象同次取得；创建、续期、消费、列表和清理不用应用 now 判定 deadline；三类 token 续期/终态同步反向 ID 期限 | idle/absolute、签发父上限、同状态与 ID owner CAS、同记录终态和 pending cleanup；Custom SSO 按 ADR-0033 固定签发期限，Binding 仍按 ID；取得后可继续，真实缺失/撤销/消费/冲突仍失败 |
| Grant `packages/custom-sso/src/internal/session.ts` | #158/#159 两模式直接使用 Kernel Artifact deadline 与消费权威，旧在线 store 已退役 | 单赢家、暂态不延期、写前新 identity 与同步尽力补偿；消费后失败重新授权，无跨模块大事务 |
| Custom SSO `packages/custom-sso/src/internal/session.ts` | Independent/Gateway 使用 `ceil((expiresAt-observedAt)/1000)`；不因应用时间或亚秒取整再次撤销 | 两模式身份来源、Subject Access、父对象/主体/配置保护；Gateway Cookie Max-Age 消费 TTL，ORCAS Cookie 契约保持 |
| OIDC `storage/redis-adapter.ts` | 同次 Redis TIME 为对象/lookup/index 设置共同 deadline；共享索引只延长；清理根据实际对象和 CAS | Client/Grant ownership、配置版本、Kernel Credential mirror；Grant 增补 scope 再保存保持当前 PEXPIRETIME，缺失不复活 |
| Provider Session state store | mapping 发布/刷新直接消费 Kernel 毫秒 deadline；staged 主数据/索引以 Redis TIME、60 秒和父 deadline 一致写入 | anchor generation、mapping owner、原子 claim、发布不确定确认与补偿 |
| OIDC model/configuration | Code 每次取得重新观察 Kernel Principal，向上取整交付 AccessToken/IdToken TTL；Code/AccessToken/Grant/Session/Interaction 沿用本次 Redis 有效观察 | 已消费 Code 保留 consumed 进入原 replay revoke；观察不持久化；JWT exp/iat/auth_time、新鲜认证 max_age 含义保持 |

最终核对额外发现并修复了正常授权必经的 Session/Interaction 漏项：第三方 `interactionDetails` 与 `Session.findByUid` 原来
仍按应用 exp 判过期；`interactionResult` 使用 `interaction.exp - epochTime()` 保存，也会误缩短或延长 Redis 有效期。
现在 Interaction 的已取得对象更新保留 Redis 原期限；Session.persist 同样保留，Session.save(configuredTTL) 仍是原有 rolling
续期，已取得的同 identity 缺失时失败。Session identifier rotation 继续是原来的新 identifier 路径，不增加永久身份去重。
没有扩展到未启用的协议功能，也没有用 JWT 离线宽限掩盖在线误判。

Redis TIME 不是 JWT 认证事件时间或主机稳定性保证。`authTime`/`auth_time` 仍表示原认证事件，`iat`/`exp` 保持离线协议语义；
第三方自有会话和离线 ID Token 不能由清理 IAM 在线状态保证退出。Redis 主机及故障切换节点时间稳定由基础设施 owner 负责。

## 证据入口

Spec #163 的 [#164](https://github.com/cyy1998/shgas-iam/issues/164) 已把两模式 Custom SSO 新 Credential 改为固定期限并取消授权续根；
Redis 时间、签发时父期限裁剪和取得时有效性保持。完整 Custom SSO Redis 操作证明五分钟短根裁剪、跨 Client/Maintenance、
业务访问直至到期、未交付残留不随根延长；API 实际 HTTP 比较签发观察与 Independent TTL/Gateway Cookie；
OIDC `subject-access-authorization` Redis 测试经实际 HTTP 授权证明根和原 Binding 延长、同根两模式 Credential 不变。
本票保留现有父检查，其退役归后续票；未运行生产下线。旧策略对象须按 ADR-0033 的全体下线选择清理，不能把本地证据当成混跑部署许可。

表中缩写均指既有 owner seam；测试存在不等于已经执行。真实 Redis 使用专用 URL，应用时钟独立注入，不能与 Redis 绑定到同一 fake。

- **K-time**：[Kernel 时间](../../../packages/session-kernel/test-integration/redis/session-kernel-time.integration.test.ts)：四类对象偏差矩阵、跨实例与前后跳、父上限、续期 lookup、取得后到期、真实缺失与 pending cleanup。
- **K-id**：[Credential](../../../packages/session-kernel/test-integration/redis/session-kernel-credential.integration.test.ts)：新 UUID、写前 identity、并发 owner、lookup、tombstone 与不确定写入补偿。
- **Grant**：[Grant owner](../../../packages/custom-sso/test-integration/redis/custom-sso-operation.integration.test.ts)：Kernel deadline 联验、唯一赢家、暂态拒绝不延期、消费后失败与同步尽力补偿。
- **SSO**：[生产 adapter](../../../apps/api/test-integration/component/custom-sso-session-kernel.adapter.integration.test.ts)与
  [Cookie handler](../../../apps/api/test-integration/component/sso.handlers.integration.test.ts)：两模式交付/认证/退出、偏差、亚秒 TTL、途中到期和补偿。
- **State**：[Provider Session state](../../../apps/oidc-provider/test-integration/redis/provider-session-state.integration.test.ts)：staged/claim/mapping/anchor、Kernel deadline 到 Code/Credential 与 generation 恢复。
- **OIDC**：[Redis adapter 与真实 Provider model](../../../apps/oidc-provider/test-integration/redis/redis-adapter.integration.test.ts)：共享索引、独立 observer、配置与 mirror、Grant 再保存，以及 Session/Interaction 跨 writer 和真实 interactionDetails/interactionResult、persist/rolling save。
- **Flow**：[token flow](../../../apps/oidc-provider/test-integration/component/token-flow.integration.test.ts)：PKCE、RS256、nonce、auth_time、exp-iat、replay、配置变化和 UserInfo。
- **Admin**：[Session Management](../../../apps/admin-api/test-integration/redis/session-management.integration.test.ts)：真实 Kernel 消费方的当前会话保护、级联数量、重复 no-op、用户例外和安全失败摘要；时间由 K-time 证明。
- **Cleanup**：[既有 artifact owner seam](../../../apps/oidc-provider/test-integration/redis/client-protocol-artifact-cleanup.integration.test.ts)：per-client cleanup 与新的全体在线状态维护分别验证，覆盖无索引/损坏对象、部分失败重跑、独立 scan/readback、非目标保留。
- **Manual**：[维护手册](../../releases/online-auth-redis-time-cutover.md)：目标环境人工 gate；尚未执行，不由自动化测试代替。

## 42 条故事逐项核对

| 故事 | 实施 owner / 当前结果 | 证据及限制 |
|---|---|---|
| 1 应用领先 | Kernel 四类创建使用 Redis 时间 | K-time 0/±5000ms，偏差大于短 TTL |
| 2 应用落后 | 同上，Redis 内有效期限不因应用落后立即消失 | K-time；SSO/State/OIDC 消费方矩阵 |
| 3 跨实例 | 共享 Redis 观察；Session/Interaction 也经过生产 model 校验 | K-time、Grant、OIDC 反向偏差 writer/reader |
| 4 应用跳变 | 生命周期不按应用 now 重裁 | K-time、SSO、State、OIDC 前后跳；不保证 Redis 自身任意跳变 |
| 5 原期限策略 | idle/absolute、父上限、fixed/extend 保持 | K-time；Session rolling/persist 独立验证 |
| 6 token lookup 续期 | 原 lookup 与对象一致续期并 CAS 检查 | K-time 原 token 与 ID 一致观察 |
| 7 取得后继续 | 使用取得时有效观察，移除最终到期复查 | K-time、SSO；OIDC 已取得 model 更新/TTL |
| 8 后续约束 | 缺失、撤销、消费、owner/CAS 仍失败 | K-time、K-id、State、OIDC 缺失后保存拒绝 |
| 9 Grant 创建 | Artifact 自身持有 Redis deadline，无独立 redemption | Grant 独立应用偏差联验 |
| 10 Grant 唯一赢家 | Kernel 已观察对象 CAS 唯一消费 | Grant 完整操作并发与对象保护 |
| 11 Grant 原期限 | 暂态拒绝保留原 deadline | Grant 真实状态回读，无延期或恢复 |
| 12 Independent 兑换 | 生产 adapter 正常交付 Credential | SSO + Grant，第三方自建 Session 不在 IAM owner |
| 13 Gateway 登录 | 生产 adapter 建立 Local Session | SSO + Cookie handler |
| 14 新 UUID | Kernel 服务端 UUID；每新授权签发新 identity | K-id、SSO；不验证 UUID 统计碰撞 |
| 15 写前已知 identity | 内部预定 identity 随签发传递 | K-id 不确定提交后精确补偿 |
| 16 同次不换 ID | 同次确认/补偿，新授权签发才换 identity | SSO 完整 Redis 两模式同步补偿与新授权矩阵 |
| 17 防覆盖 | active identity、lookup、tombstone 保护保留 | K-id 并发唯一赢家和 tombstone |
| 18 不保证自然过期复用 | 验收改为新的服务端 UUID 签发 | K-id natural expiry；没有永久历史去重 |
| 19 SSO TTL | 权威观察之差向上取整 | SSO 750ms→1 秒及途中到期，不延长 Redis deadline |
| 20 Local Session 校验 | Gateway 取得 Kernel 观察 | SSO authz，父对象与 Subject Access 保护保持 |
| 21 Public 身份来源 | Principal/Credential 入口保持独立 | SSO 拒绝 Independent Credential 用于 Gateway |
| 22 Binding/mapping | 同一 Kernel 毫秒 deadline | State mapping、lookup、anchor/generation 长短成员 |
| 23 staged | Redis 时间写主数据/索引、原子 claim | State 60 秒/父上限、单次领取和清理 |
| 24 AccessToken TTL | Code 取得时重新取得 Principal deadline/observedAt | State + Flow，消费配置 wiring；已消费 Code 不需新签发期限 |
| 25 OIDC 保护 | config/ownership/Kernel/单次消费保持 | OIDC + Flow；真实消费 Code 重放仍进入 revoke |
| 26 JWT 时间 | exp/iat/auth_time 保持标准协议和认证事件含义 | Flow RS256、nonce、auth_time、exp-iat；不新增离线宽限 |
| 27 会话列表 | Kernel inventory 按 Redis 时间裁剪 | K-time 跨实例列表；不是历史会话数据库 |
| 28 管理撤销 | 单会话/用户/client-protocol 沿原 owner 范围 | K-time、Admin、Cleanup；全体旧状态用独立 scan |
| 29 管理保护 | 当前根保护、本人例外、真实计数/错误不变 | Admin 既有协议消费方测试 |
| 30 共享索引最长保留 | OIDC index 与 anchor 只延长 | OIDC、State 长短对象共用与短对象自然耗尽 |
| 31 主数据/index | 同次 Lua 共同 deadline 与 payload CAS | OIDC；不自动修复历史已丢索引对象 |
| 32 零盘点可信范围 | 正常 owner inventory 不按应用时间漏裁；旧残留直接 scan | OIDC + Cleanup；per-client 零不代表全局零 |
| 33 tombstone/pending | 外围失败保持撤销事实和待恢复记录 | K-time、Admin、Cleanup；全体停流 reset 有独立清单 |
| 34 独立测试时钟 | 专用真实 Redis、应用 0/±偏差/跳变 | K-time、Grant、State、OIDC；不修改宿主时钟 |
| 35 等价目标证据 | 新 UUID 替代复用保证，保留并发/补偿；有界状态观察 | K-id、K-time；不靠固定 1500ms 等待放宽断言 |
| 36 维护流程 | 停流、排空、全 owner 清理、统一部署、放流 gate | Manual 可执行命令，环境未执行 |
| 37 旧态失效/重登 | Kernel+Grant+OIDC+state 直接清理 | Cleanup 旧 bearer 拒绝；Manual 新登录待验 |
| 38 非目标保留 | 固定 owner 键族，命令不连 PG | Cleanup retained state；Manual 用户/Client 基线待验 |
| 39 失败重跑 | 分批幂等删除，失败保持停流，独立 verify | Cleanup 故障注入后重跑/回读；Manual 环境重跑待验 |
| 40 回退 | 回退前重新清理新候选 smoke 状态；旧登录态不恢复 | Manual 回退候选/备份 gate，未执行 |
| 41 Redis 环境时钟 | 主机/primary/故障切换节点归基础设施 owner | Manual TIME、主机同步/事件与往返窗口记录，未执行 |
| 42 状态区分 | 每票与最终代码 gate、人工验收、合入/发布分别记录 | #120/父票记录；代码完成不表示生产已切换 |

## 实施与测试决策核对

Spec 的十二项实施决策分别由上述 owner 表和故事矩阵落实：权威/观察/期限/原子性（Kernel、Grant、OIDC）、协议 TTL（SSO、State、Flow）、
identity/保护（K-id）、协议独立性（SSO、Flow、Admin）、最小内部 API（observedAt/瞬时 model 字段）、人工切换（Manual）、环境责任（Manual）
及 ADR/领域/架构同步。本次没有 PostgreSQL schema、HTTP/tRPC 时间字段、全局校时服务、永久双读或历史 identity 去重。

仅采用已确认的两类自动化 seam：共享生命周期 + 真实 Redis，以及 Custom SSO/OIDC production adapter（component/redis）。
维护能力继续归现有 OIDC Redis owner 测试，不新增系统 E2E、自动化维护演练或逐 helper 测试层。既有系统 E2E 保留，
但不是本规格必需运行通道。真实 I/O 先普通 await 再同步断言，资源使用专用临时 Redis 与精确清理。

每票交接运行 verify:static、完整受影响 typecheck/行为通道和 diff check；最终不可变候选由协调者运行一次 `pnpm verify`，
并运行 API Core/API/Admin API/OIDC 的受影响 component 与 Redis 契约。任何未执行或失败都在 issue 明确记录，不写成通过。
独立命令的非零退出不允许由相邻绿色测试豁免；人工环境 gate 与生产部署状态始终单列。
