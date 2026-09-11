# 在线认证状态 Redis 时间切换

Status: Current

Last verified: 2026-09-10

Next review: 2026-10-31

本手册交付 [Spec #115](https://github.com/cyy1998/shgas-iam/issues/115) 的维护准备。代码候选、最终验证及双轴评审记录在
[#120](https://github.com/cyy1998/shgas-iam/issues/120)，实际目标环境切换和人工验收**尚未执行**。运行下列生产命令需要发布负责人
在相应环境明确执行；实现授权不包含部署或删除生产状态。

本手册同时拥有 [Spec #163](https://github.com/cyy1998/shgas-iam/issues/163) 的 Credential 独立访问全体下线发布。代码已实现，逐项证据见[最终账本](../features/sso/credential-authority-contract.md)，父级最终验收另记；本次目标环境停流、清理、部署、smoke 与放流均未执行。
旧 `extend_with_principal` Custom SSO Credential 必须清除，不新增 policy 迁移或后台执行框架。此前 #146/#157/#156 的保留对象升级只适用于各自原规格单独发布，不适用于包含 #163 或 #170 的统一候选。

Spec #170 / ADR-0034 的三类 token 已使用 SHA-256 单状态与反向 ID，Kernel lookup HMAC 配置已退役；
当前运行时边界见[运行时契约](../features/sso/token-state-runtime-evidence.md)。#175 已补齐全体下线维护与实际命令验证，证据见下文；#176 最终账本及验收评论保存聚合证据，实际环境切换未执行。
切换必须同时清理源 HMAC 四键布局与目标 state/ID，包含无索引库存及 pending；不双读、不保留旧对象、不在线迁移。
旧四键的 decoder/CAS 仅用于已停 writer 后的离线维护，不构成当前 runtime 的 HMAC 要求。

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
- 单独固定用于正向切换和回退的维护候选 commit/digest，核对其清单同时理解源四键及目标 `state:p/c/a:`、`id:p/c/a:` 和全部关联 owner。
  维护候选可以是已验收的目标候选；不能直接使用不理解目标布局的旧应用作为回退清理工具。源/目标/回退应用与维护工具分别记录，不能只写“当前版本”。
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

Kernel 与 Custom SSO 清单分别由 `@iam/session-kernel/maintenance`、`@iam/custom-sso/maintenance` 拥有；OIDC 命令仅加载这些窄出口。Spec #122 迁包不改变下列 key 或操作，也不要求为迁包执行本手册。

## 当前 owner 清单

下表是固定键族说明，`<ns>` 为三个后端一致的实际 Kernel namespace（末尾冒号会规范化）。不接受操作员任意 pattern。
变更 owner key 写入时必须同步其维护范围。未知 namespace 或不兼容旧版本保持停流并另行处理。

| 顺序 / owner | 当前清理键族 | 独立回读范围 |
|---|---|---|
| 1 Kernel | 源 token 布局及仍按 ID 的 Binding `active:`、`lookup:`、`revoked:`、`revoked_lookup:`；新 Principal `state:p:`、`id:p:`；新 Credential `state:c:`、`id:c:`；新 Artifact `state:a:`、`id:a:`；共用 `idx:` | 直接重扫各键族，涵盖 user/client/protocol/parent/binding 与 cleanupPending 索引，不依赖这些索引完整 |
| 2 Custom SSO Grant | `authorization-grant:redemption:v1:` | issued/redeeming/consumed record，含无 cleanup ref 的旧 record |
| 3 OIDC protocol store | `oidc:model:`、`oidc:consumed:`、`oidc:grant-objects:`、`oidc:client-objects:`、`oidc:session-uid:`、`oidc:user-code:` | Session、Interaction、Grant、Code、Token 等该 owner 的主对象及各 lookup/index，包括已丢 index 的对象 |
| 4 Provider Session state | `oidc:provider-session-binding-lookup:`、`oidc:provider-session-principal:`、`oidc:provider-session-generation-members:`、`oidc:pending-provider-session-binding:`、`oidc:pending-provider-session-bindings:client:` | mapping、anchor、generation members、staged payload 和 staged client index 各自重扫 |

源码 owner 分别为 `@iam/session-kernel/maintenance`（Kernel `storage/keys.ts`）、Grant `redis-store.ts`、OIDC `storage/redis-adapter.ts` 和
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
   前四项没有命令默认值；package 命令会加载 `apps/oidc-provider/.env`（若存在），已有进程环境变量优先；维护 runtime 不加载认证 Kernel、HMAC 配置或应用 env schema。
   不要把开发连接当发布目标。即使只读 inventory/verify 也要求已停流确认。
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
   | 重新登录 | 用户重新取得新 Principal，两协议可签发与访问；OIDC 按原规则续根/Binding，旧 Cookie 不阻止重新登录 |
   | Custom SSO | Independent authorize/token/user-info 与 Gateway authorize/callback/authz 成功；授权前后根期限不变，凭据 fixed_at_issue 且期限不超过签发时根当前/绝对期限及配置 TTL；五分钟根签发最多五分钟，响应/Cookie 使用同次 Redis 剩余 TTL |
   | OIDC | authorize/interaction/Code→Token/UserInfo 正常；PKCE、replay 拒绝；根与 Binding 可按原规则续期，同根两模式 Custom SSO 凭据期限保持不变；JWT 签名及标准时间字段保持 |
   | Admin | 当前管理会话保护、另一会话单次撤销、用户级撤销和实际数量/错误语义保持；根真实转换及数量准确，只有子对象变化也正确提示；实际已撤销对象随后被拒绝，不承诺所有派生对象立即失效 |
   | 尽力退出边界 | 正常级联中已实际撤销的 Credential/Binding 后续访问拒绝；根成功但子索引遗漏、子失败或晚到签发时，合法残留允许按自身期限/账号/协议规则访问。OIDC 还要求 Binding 与 Snapshot 配套有效；自身 Binding 失效即拒绝。环境不做破坏性注入，允许漏撤的受控故障证据复用最终账本；不得把没有观察到漏项当成全子树保证 |
   | 根入口保留 | 已无效根不能新授权、续接或兑换两协议 Code；Admin/IAM 根 token 仍拒绝。已有 Credential 访问不重查根 |
   | 非目标保留 | 用户/Client 配置及版本不变，其他 owner 的基线与自然 TTL 变化核对完成；第三方自建会话由其 owner 单独处理 |

4. 发布负责人汇总停流/排空、四组 cleanup、独立 verify、非目标保留、统一 digest、smoke 和 Redis 时间记录。
   全部通过后才恢复公开入口与后台调度，逐步观察错误率；放流后从独立客户端回读登录与认证结果。
   本地测试、命令的 `--writers-stopped` 声明和清理数量均不能替代人工 gate。

## 失败重跑与回退

- **dry-run/清理/verify 失败**：保持停流和所有 writer 停止，保存安全失败报告。检查目标、网络/ACL、timeout 与连接状态；
  修复后使用同一候选和同一目标从 dry-run → apply → 新进程 verify 完整重跑。删除幂等，不能恢复已删除的在线状态。
  不手工跳过某 owner 或从失败计数推断已完成范围。五分钟不足时先调查规模/环境，再安排受控窗口，不直接放流。
- **部署/readiness/smoke 失败**：关闭受控入口，停止并排空候选所有 writer。优先修复统一候选后重跑；若选择回退，固定兼容
  源布局的回退应用 digest，用执行前固定、能理解目标布局的维护候选重新运行 dry-run → apply → 新进程 verify，清除 smoke 和新 writer
  已生成的目标状态及关联 owner，再统一启动回退版本。旧应用不承担读取或清理目标布局的职责。
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
| 代码候选 | 源/目标/回退应用 commit 与镜像 digest、独立维护候选及源/目标清单核对；适用 #120/#168/#175/#176 与父 #163/#170 最终验证和双轴评论链接；不表示已合入/push |
| 环境与冻结 | 受控环境标识、目标 DB、owner、流量停止时间、逐副本排空证明；未执行/通过/失败 |
| 清理与回读 | 三个独立命令的时间/退出码/安全报告、目标一致性；未执行/通过/失败 |
| 保留集与统一部署 | owner 基线对照、自然 TTL 说明、全部副本和自动恢复模板 digest；未执行/通过/失败 |
| Redis 时间 | primary/故障切换节点同步和事件摘要、Redis TIME 与查询窗口；未执行/通过/失败 |
| 人工 smoke | 上表每项结果、requestId/traceId、client owner；未执行/通过/失败 |
| 重跑/回退/放流 | 使用候选、原因、清理后新登录与独立放流回读；未执行/通过/失败 |

本手册没有自动化切换演练或系统 E2E 门禁。维护能力的行为验证归已有 OIDC production adapter + 真实 Redis contract；
完整代码证据汇总见[最终契约核对](../features/oidc/online-auth-redis-time-contract.md)。

## Spec #170 维护能力的自动化证据

[#175](https://github.com/cyy1998/shgas-iam/issues/175) 固定 review base 为 `0e9ef005a25cae3f18b6fd056743884e69d04e0c`，
最终候选、实际命令与两轴评审结果由该票评论保存。Kernel 的源四族、目标三类 state/ID 与索引清单已随 #171–#173 演进，
本票复用四 owner，不新增平行清理命令或迁移框架。

| 证明目标 | 现有入口与直接观察 |
|---|---|
| 全部固定键族、无索引/损坏/无 TTL/孤立库存 | [全体维护 Redis contract](../../apps/oidc-provider/test-integration/redis/online-auth-state.integration.test.ts)逐 owner prefix 建立有/无 TTL 的损坏库存，源和目标同时存在；apply 后逐项确认消失，新进程完整 verify 为零。 |
| 正常生产对象与 pending | [生产对象混合 contract](../../apps/oidc-provider/test-integration/redis/client-protocol-artifact-cleanup.integration.test.ts)经 Kernel 创建 Principal、Binding、Credential、Artifact，经 Grant/Provider Session owner 建立关联状态；外围 cleanup 缺失后的 Credential 终态与反向 ID 均无 TTL，dry-run 保持，apply 清除。 |
| 只读与独立进程 | 全体维护 contract 真正调用 package `online-auth:state`；dry-run/dirty verify 前后逐值和绝对 expiry 相等。apply 与每次 verify 是新进程；成功清理后重新放入一条离线 fixture，后续 verify 必须非零，不能由前次删除计数判定。另以只有 SCAN 权限的 ACL reader 验证只读操作，拒绝 UNLINK 与不完整扫描。 |
| 失败与恢复 | 生产对象 contract 注入第二批删除失败；全体维护 contract 在真实 UNLINK 提交后丢失响应，确认 failed、残留 verify 非零及完整重跑成功。预先 abort 拒绝写入，TCP 无响应证明实际命令 timeout 非零且安全输出，恢复 Redis 后可重跑。已清空 apply/verify 重复通过。 |
| 非目标保留与配置独立 | 逐值/绝对 expiry 对照未知 Kernel state/ID、其他 namespace、Subject/Facts、Runtime、队列、登录限制、短信码/nonce、OIDC auth failures 与退役族 sentinel。production 模式无认证 env 执行 package 命令，缺目标或停 writer 确认时非零且库存不变。 |

离线混合库存只证明清理能力，不授权生产新旧 reader/writer 混跑，也不证明真实环境已经停流或排空。
实际 package 命令测试复用共享 process harness 的 Windows Job / POSIX process group，正常完成、失败、测试 timeout 和 AbortSignal
均在 finally 清理整棵命令进程树，并由 afterEach/afterAll 登记兜底。额外用维护 Node 后代持有的 TCP 连接关闭证明 timeout/中断后的清理，
随后核对 Redis 库存与重新执行清理/verify；测试只终止本次创建的进程树。
保留 sentinel 不等价于生产业务数据库验收；命令没有 PostgreSQL 连接或业务写入，实际保留集仍按上述人工基线逐 owner 核对。
本票没有执行目标环境部署、全体下线、停流/排空、统一镜像、新登录、双协议/Admin smoke 或放流，也没有新增系统 E2E 或自动部署演练。
