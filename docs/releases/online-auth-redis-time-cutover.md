# 在线认证状态 Redis 时间切换

Status: Current

Last verified: 2026-09-08

Next review: 2026-10-31

本手册交付 [Spec #115](https://github.com/cyy1998/shgas-iam/issues/115) 的维护准备。代码候选、最终验证及双轴评审记录在
[#120](https://github.com/cyy1998/shgas-iam/issues/120)，实际目标环境切换和人工验收**尚未执行**。运行下列生产命令需要发布负责人
在相应环境明确执行；实现授权不包含部署或删除生产状态。

## 适用版本与范围

仅适用于当前 Session Kernel `sess:v2:`（或实际配置的同类 namespace）、Custom SSO Grant v1 和当前 OIDC store。
源版本必须支持当前 owner key 契约；退役的 `global_session:*`、旧 local session/旧 OIDC token index 或旧 Runtime namespace
升级仍需另行迁移，不能据本命令零报告宣称它们已经迁移。与 Catalog V2、User Profile 或数据库迁移同时发布时，分别遵守其
Current runbook；本次不推进 Client epoch、不写 PostgreSQL，也不运行退役 Session cleanup。

`client-protocol:artifacts` 依赖 per-client inventory 且保护 Principal，不能证明全部旧在线状态已清空。这里的
`online-auth:state` 是独立的人工操作入口：从当前 owner 固定键族直接 SCAN，不读 client index 推导库存，不解析 payload，
所以损坏 payload、无 TTL 状态与历史孤立对象同样清理。不得把本手册的 SCAN 能力套入 Catalog V2 手册，替代该手册的历史耗尽前提。

## 执行前固定清单

发布负责人先填写并保存：

- 源版本、目标 commit 与每个服务不可变镜像 digest、回退候选及其存储兼容核对；禁止浮动 tag。
- 精确部署集群、Redis primary/逻辑 DB、故障切换节点清单，以及 API、Admin API、OIDC Provider 的 Session namespace 配置。
  Redis host/port/db/namespace 必须与所有 reader/writer 实际配置一致；命令不自动发现环境。多个独立 Redis DB 分别执行完整流程。
  namespace 不一致时先停止发布并核对全部实际 namespace，不能只清默认值。
- API、Admin API、OIDC Provider 全部副本、Worker、队列消费者、定时维护任务、人工 one-shot 命令及直连入口的 owner 清单。
  按已部署版本核对所有能读取、续期、签发或撤销上述状态的进程；未列明 writer 不允许继续。
- 非目标数据基线：由数据 owner 保存 PostgreSQL 用户/Client 配置及协议版本的只读数量和受控摘要；保存 Profile/Facts、
  Subject Access、Runtime Snapshot、BullMQ、Login Restriction、短信码/nonce 与 OIDC client-auth-failures 的必要完整性摘要。
  有 TTL 的非目标状态允许自然到期，比较时单独记录，不以总 DB key 数比较代替 owner 核验。不把 payload/PII/secret 放进发布记录。
- 所需工具：固定候选 checkout、Node.js 24、仓库 pnpm、依赖已安装；命令账号允许目标 DB 的 SCAN、UNLINK 和连接管理。
  使用受控运维环境注入凭据，关闭 shell transcript/调试输出；不能把 Redis URL、完整 key、token、Cookie 或私钥写入记录。

## 当前 owner 清单

下表是固定键族说明，`<ns>` 为三个后端一致的实际 Kernel namespace（末尾冒号会规范化）。不接受操作员任意 pattern。
变更 owner key 写入时必须同步其维护范围。未知 namespace 或不兼容旧版本保持停流并另行处理。

| 顺序 / owner | 当前清理键族 | 独立回读范围 |
|---|---|---|
| 1 Kernel | `<ns>active:` 的 Principal/Binding/Credential/Artifact；`lookup:`、`revoked:`、`revoked_lookup:`、`idx:` | 直接重扫五个键族，涵盖 user/client/protocol/parent/binding 与 cleanupPending 索引，不依赖这些索引完整 |
| 2 Custom SSO Grant | `authorization-grant:redemption:v1:` | issued/redeeming/consumed record，含无 cleanup ref 的旧 record |
| 3 OIDC protocol store | `oidc:model:`、`oidc:consumed:`、`oidc:grant-objects:`、`oidc:client-objects:`、`oidc:session-uid:`、`oidc:user-code:` | Session、Interaction、Grant、Code、Token 等该 owner 的主对象及各 lookup/index，包括已丢 index 的对象 |
| 4 Provider Session state | `oidc:provider-session-binding-lookup:`、`oidc:provider-session-principal:`、`oidc:provider-session-generation-members:`、`oidc:pending-provider-session-binding:`、`oidc:pending-provider-session-bindings:client:` | mapping、anchor、generation members、staged payload 和 staged client index 各自重扫 |

源码 owner 分别为 Kernel `storage/keys.ts`、Grant `redis-store.ts`、OIDC `storage/redis-adapter.ts` 和
`session/provider-session.ts`。命令只顺序清理这些键族，不调用外部 logout、不读取任意 cleanup ref；当前清单覆盖的外围状态
一并删除，因此不会留下待恢复的本代 pending cleanup。若已部署版本存在清单外 cleanup adapter，必须先核对其 owner 并补齐流程，
不能删除 pending marker 后声称清理完成。

保留集包括用户、Client 及全部 PostgreSQL 业务数据/审计、Profile/Facts、Subject Access Barrier、Runtime Snapshot、队列、
Login Restriction、短信码/nonce、OIDC client-auth-failures、未知键族及退役 namespace。禁止 `FLUSHDB`、`FLUSHALL` 或
`oidc:*`、`<ns>*` 等宽范围删除。第三方业务系统自建会话和离线 ID Token 不由此命令撤销。

## 停流、排空与清理

1. 发布负责人通过部署平台关闭相关 Gateway 入口并阻断后端直连、内部调用和自动重试。范围覆盖登录/续接、SSO authorize/
   callback/token/authz/user-info/logout、OIDC authorize/interaction/token/UserInfo/logout、Session refresh/renew、
   Admin 会话管理与能触发会话撤销的用户/Client 写入。仅设置 Client Maintenance 不够，它仍允许退出与管理 mutation。
2. 等待入口在途请求和后台任务结束；记录 Gateway 活跃请求、每个副本 in-flight 数和 worker/one-shot 完成状态。
   停止全部旧 reader/writer，禁用自动扩容/重启旧镜像与定时任务。通过平台独立列举副本确认零旧进程、零在途；仅停止接收
   新请求或等待一个固定 TTL 不构成排空证据。任何无法确认的副本保持停流，不能执行清理。
3. 在新应用启动前，用固定目标候选的维护命令连接同一 Redis primary/DB。命令不启动 HTTP、队列或 PostgreSQL 连接。
   显式设置 `IAM_OIDC_PROVIDER_REDIS_HOST`、`IAM_OIDC_PROVIDER_REDIS_PORT`、`IAM_OIDC_PROVIDER_REDIS_DB`、
   `IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE`，需要认证时设置 `IAM_OIDC_PROVIDER_REDIS_PASSWORD`。
   前四项没有命令默认值；不要把 `.env` 的开发连接当发布目标。即使只读 inventory/verify 也要求已停流确认。
4. 每条命令在一个独立进程执行，保存安全报告及退出码；任一非零退出、报告缺失或 `failed` 都阻断发布：

   ```bash
   pnpm --filter @iam/oidc-provider online-auth:state -- dry-run --writers-stopped
   pnpm --filter @iam/oidc-provider online-auth:state -- apply --writers-stopped
   pnpm --filter @iam/oidc-provider online-auth:state -- verify --writers-stopped
   ```

   `dry-run` 不写入；`apply` 顺序 SCAN 并分批 UNLINK（每批最多 100），不是跨 owner 事务。
   `apply passed` 只表示完成本轮尝试，必须另起 `verify` 直接重新扫描。仅当完整扫描成功且所有键族为零，verify 才 passed。
   SCAN 可能重复返回成员，报告的 `observed` 是诊断观察次数，`removed` 是实际删除数量；不能用两者相减证明零残留。
   默认总 deadline 五分钟、单次连接/命令 timeout 五秒；超时、连接失败、信号或部分失败非零退出并断开资源。
5. 使用新的运维连接/进程确认连接的是同一 primary/DB，保存上述独立 verify；数据 owner 对照非目标基线确认保留。
   不在日志打印完整 key。保留集异常、故障切换或 writer 意外重启时保持停流，从排空核验重新开始。

## 统一版本、人工验收与恢复流量

1. 保持公开流量关闭，统一发布 API、Admin API、OIDC Provider；Worker 与所有共享代码消费者使用同一候选，Admin/SSO
   静态产物按本次固定发布清单部署。逐副本回读实际 digest/配置，确保没有旧 reader/writer；自动重启模板也必须更新。
2. 启动受控候选副本，核验 Redis 连接、健康/readiness、issuer/JWKS 和必要非目标数据依赖。
   verify 的零状态证据必须在 smoke 创建新状态前取得；之后新候选写出的状态不应为零。若发现旧副本写入，重新停进程并完整清理。
3. 仅开放受控测试入口，按下表人工验收；记录 requestId/traceId、时间窗口、服务版本、安全结果，token/Cookie 只由测试人受控持有：

   | 验收 | 成功条件 |
   |---|---|
   | 旧状态拒绝 | 清理前保留的测试 Principal、Gateway Local Session、Independent Credential、OIDC Code/AccessToken 在 IAM 在线入口被拒绝，不复活 |
   | 重新登录 | 用户重新取得新 Principal，正常访问与续期；旧 Cookie 不阻止重新登录 |
   | Custom SSO | Independent authorize/token/user-info 与 Gateway authorize/callback/authz 成功，TTL 正常；退出后 IAM 在线入口拒绝 |
   | OIDC | authorize/interaction/Code→Token/UserInfo 正常；PKCE、replay 拒绝、logout 后在线拒绝；JWT 签名及标准时间字段保持 |
   | Admin | 当前管理会话保护、另一会话单次撤销、用户级撤销和实际数量/错误语义保持；撤销后旧凭据被拒绝 |
   | 非目标保留 | 用户/Client 配置及版本不变，其他 owner 的基线与自然 TTL 变化核对完成；第三方自建会话由其 owner 单独处理 |

4. 发布负责人汇总停流/排空、四组 cleanup、独立 verify、非目标保留、统一 digest、smoke 和 Redis 时间记录。
   全部通过后才恢复公开入口与后台调度，逐步观察错误率；放流后从独立客户端回读登录与认证结果。
   本地测试、命令的 `--writers-stopped` 声明和清理数量均不能替代人工 gate。

## 失败重跑与回退

- **dry-run/清理/verify 失败**：保持停流和所有 writer 停止，保存安全失败报告。检查目标、网络/ACL、timeout 与连接状态；
  修复后使用同一候选和同一目标从 dry-run → apply → 新进程 verify 完整重跑。删除幂等，不能恢复已删除的在线状态。
  不手工跳过某 owner 或从失败计数推断已完成范围。五分钟不足时先调查规模/环境，再安排受控窗口，不直接放流。
- **部署/readiness/smoke 失败**：关闭受控入口，停止并排空候选所有 writer。优先修复统一候选后重跑；若选择回退，固定兼容
  当前 key 契约的回退 digest，用固定维护候选先重新清理 smoke 新建状态并独立 verify，再统一启动回退版本。
  回退后同样重新登录、执行两协议和 Admin 验收，再决定放流。不得恢复旧登录态，也不允许新旧实例混跑。
- **备份/故障切换**：禁止通过恢复旧 Redis snapshot 找回登录态。恢复可能重新引入旧时间域状态时，先保持停流，核对备份版本、
  primary/replica 和恢复 owner，重新执行本手册清理/verify；Runtime Snapshot/Subject Access 等恢复遵守各自 Current runbook。
  不理解当前存储的旧镜像或退役 namespace 备份必须另行制定迁移，不能直接开放认证。

## Redis 时间的环境责任

Redis TIME 是在线生命周期权威，应用校时不能替代代码契约；也不承诺 Redis 任意时间跳变下的连续服务。
基础设施 owner 在窗口前后记录当前 primary 和每个可能提升的 replica 的主机 UTC、时区、NTP/chrony/systemd-timesyncd
同步状态与最近校时/重启/故障切换事件，并记录 Redis `TIME` 的安全秒/微秒观察和查询往返窗口。
用部署平台的节点诊断入口读取相应主机状态（例如已安装 chrony 的节点执行 `chronyc tracking`）；不要为了验收主动改时钟。
观察到时间前后跳、节点不同步或 failover 异常时记录现象与影响窗口，交基础设施 owner 调查，保持停流直到环境恢复并重做 gate。
不引入应用偏差在线准入阈值、宽限期或新的监控平台；本地偏差测试只改变测试进程时钟。

## 发布记录模板

| 分类 | 记录与状态 |
|---|---|
| 代码候选 | commit、镜像 digest、#120 最终验证与双轴评论链接；当前不表示已合入/push |
| 环境与冻结 | 受控环境标识、目标 DB、owner、流量停止时间、逐副本排空证明；未执行/通过/失败 |
| 清理与回读 | 三个独立命令的时间/退出码/安全报告、目标一致性；未执行/通过/失败 |
| 保留集与统一部署 | owner 基线对照、自然 TTL 说明、全部副本和自动恢复模板 digest；未执行/通过/失败 |
| Redis 时间 | primary/故障切换节点同步和事件摘要、Redis TIME 与查询窗口；未执行/通过/失败 |
| 人工 smoke | 上表每项结果、requestId/traceId、client owner；未执行/通过/失败 |
| 重跑/回退/放流 | 使用候选、原因、清理后新登录与独立放流回读；未执行/通过/失败 |

本手册没有自动化切换演练或系统 E2E 门禁。维护能力的行为验证归已有 OIDC production adapter + 真实 Redis contract；
完整代码证据汇总见[最终契约核对](../features/oidc/online-auth-redis-time-contract.md)。
