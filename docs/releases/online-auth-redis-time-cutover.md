# 在线认证状态 Redis 时间切换

> Historical：本页保留旧候选的契约与证据；Spec #178 最终在线模型已由 ADR-0035 取代，当前发布以统一会话维护手册为准。

Status: Historical

Last verified: 2026-09-15

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

包含 Spec #178 的候选先执行下文「Client 单协议业务数据升级」；本页原 #163/#170 的在线状态清单和 smoke
只证明对应旧候选。#193 已提供[新 owner 的统一 Worker 维护命令](unified-session-maintenance.md)，
#194 负责生产图切换与最终旧列删除，#196 负责聚合验收。
不得直接把旧 Provider 清理的零报告当作新 UserSession/ClientSession/协议状态已清空。

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
| 全部固定键族、无索引/损坏/无 TTL/孤立库存 | [全体维护 Redis contract](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/oidc-provider/test-integration/redis/online-auth-state.integration.test.ts)逐 owner prefix 建立有/无 TTL 的损坏库存，源和目标同时存在；apply 后逐项确认消失，新进程完整 verify 为零。 |
| 正常生产对象与 pending | [生产对象混合 contract](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/oidc-provider/test-integration/redis/client-protocol-artifact-cleanup.integration.test.ts)经 Kernel 创建 Principal、Binding、Credential、Artifact，经 Grant/Provider Session owner 建立关联状态；外围 cleanup 缺失后的 Credential 终态与反向 ID 均无 TTL，dry-run 保持，apply 清除。 |
| 只读与独立进程 | 全体维护 contract 真正调用 package `online-auth:state`；dry-run/dirty verify 前后逐值和绝对 expiry 相等。apply 与每次 verify 是新进程；成功清理后重新放入一条离线 fixture，后续 verify 必须非零，不能由前次删除计数判定。另以只有 SCAN 权限的 ACL reader 验证只读操作，拒绝 UNLINK 与不完整扫描。 |
| 失败与恢复 | 生产对象 contract 注入第二批删除失败；全体维护 contract 在真实 UNLINK 提交后丢失响应，确认 failed、残留 verify 非零及完整重跑成功。预先 abort 拒绝写入，TCP 无响应证明实际命令 timeout 非零且安全输出，恢复 Redis 后可重跑。已清空 apply/verify 重复通过。 |
| 非目标保留与配置独立 | 逐值/绝对 expiry 对照未知 Kernel state/ID、其他 namespace、Subject/Facts、Runtime、队列、登录限制、短信码/nonce、OIDC auth failures 与退役族 sentinel。production 模式无认证 env 执行 package 命令，缺目标或停 writer 确认时非零且库存不变。 |

离线混合库存只证明清理能力，不授权生产新旧 reader/writer 混跑，也不证明真实环境已经停流或排空。
实际 package 命令测试复用共享 process harness 的 Windows Job / POSIX process group，正常完成、失败、测试 timeout 和 AbortSignal
均在 finally 清理整棵命令进程树，并由 afterEach/afterAll 登记兜底。额外用维护 Node 后代持有的 TCP 连接关闭证明 timeout/中断后的清理，
随后核对 Redis 库存与重新执行清理/verify；测试只终止本次创建的进程树。
保留 sentinel 不等价于生产业务数据库验收；命令没有 PostgreSQL 连接或业务写入，实际保留集仍按上述人工基线逐 owner 核对。
本票没有执行目标环境部署、全体下线、停流/排空、统一镜像、新登录、双协议/Admin smoke 或放流，也没有新增系统 E2E 或自动部署演练。

## Client 单协议业务数据升级

本节是 #192 对现有人工发布流程的补充，不是自动发布器。代码工具通过不表示任何环境已经迁移。
发布 owner 固定独立维护候选的 commit、lockfile、Bun 和制品；该候选须包含
`client-sso:upgrade`，并保留 #180 扩展后的完整新旧 Client 列。源为 Catalog V2 的旧 OIDC/Custom SSO 配置，
目标为 `sso_enabled`、严格 `sso_config` 和当前 Secret 三列；工具不新增或删除 schema。
旧布局缺列、已删除旧列、额外未知 Client 列均拒绝；最终删除旧列仍由 #194 的迁移生成和核验负责。
固定维护制品不得随着应用切到 #194 后的 schema 定义而重新构建替换。

### 停写与输入

沿上文执行前清单保存备份、恢复引用和源/目标/回退候选。冻结 Client、Role 的所有管理写入和直连 SQL，
停止旧、新认证 reader/writer 并排空在途；命令全部要求 `--writers-stopped`，但该声明不证明平台停写。
工具只连接显式 `IAM_WORKER_DATABASE_URL` 的 PostgreSQL/schema，不回退 `DATABASE_URL`，不连接 Redis、队列或 HTTP。
盘点/核验需要 SELECT，apply 另需 Client UPDATE 和 Client/Role 表锁权限。

```bash
pnpm --filter @iam/worker client-sso:upgrade -- inventory --writers-stopped
pnpm --filter @iam/worker client-sso:upgrade -- apply --writers-stopped --manifest /controlled/client-upgrade.json
pnpm --filter @iam/worker client-sso:upgrade -- verify --writers-stopped --manifest /controlled/client-upgrade.json
pnpm --filter @iam/worker client-sso:upgrade -- verify --writers-stopped --manifest /controlled/all-clients.json --all
```

inventory 对每个 Client 给出 canonical code、`sourceDigest`、随机的新 `credentialId`、旧可选协议和状态。
摘要覆盖该 Client 除五个新 SSO 列外的全部字段（包括稳定 ID、Internal 凭据、旧配置/Hash、业务字段与时间），
以及归属该 Client 的全部 Role 行；只输出 SHA-256，不输出原始事实。
`pending-selection` 表示旧双协议，必须人工选择；`unmigrated` 包括可直接规划的单协议或 Internal-only；
`target-present` 只表示目标已占用，是否完成必须用原批准清单 verify，不能靠重新 inventory 判定。
未知/损坏库存为 `unknown`，不输出其未知内容，不改写或忽略该行。

发布 owner 从 inventory 复制明确范围的 code/digest/credentialId，形成以下严格 JSON。占位字符串必须替换为真实盘点值。
只列本次批准的 Client，禁止复制 report 的其他字段作为输入；原批准文件和它的受控校验摘要需要保留到发布完成。

```json
{
  "version": 1,
  "layout": "dual-to-single-v1",
  "trustedIamOrigins": ["https://iam.example.com"],
  "managedCallbackUrls": ["https://iam.example.com/sso/callback"],
  "clients": [
    {
      "clientCode": "business-client",
      "sourceDigest": "从 inventory 复制的 64 位十六进制摘要",
      "credentialId": "从 inventory 复制的新 UUID",
      "protocol": "custom-sso",
      "gatewayCallback": "https://iam.example.com/sso/callback"
    }
  ]
}
```

单协议允许省略 `protocol`，按唯一旧配置迁移；双协议必须明确 `oidc` 或 `custom-sso`，不根据启用状态猜用途，
也不允许用 null 丢弃旧配置。Internal-only 省略或填 null，保持无配置、未启用和原业务身份。
启用意图来自所选旧协议，即使旧配置停用也保留；Client 整体状态、删除标记及 Internal API 凭据不改变。

旧 Independent 保留原实际 callback，删除无消费者的 logoutEndpoint；不接受额外 callback 覆盖。
旧 Gateway 必须填 `gatewayCallback`，且它必须是发布 owner 核验已部署的完整 IAM handler URL，列在
`managedCallbackUrls` 中并属于 `trustedIamOrigins`。完整 URL 分类与 #184 授权共用
`createClientSsoCallbackClassifier`；业务 origin、相同 pathname、Host/Forwarded 和推导的转发路径不构成已部署证据。
URL 列表由服务端真实配置及 Gateway owner 的路由回读提供，示例域名不是部署事实。

### Apply、Secret 与独立门禁

apply 先取得 Client/Role 的 `SHARE ROW EXCLUSIVE` 锁，等待旧事务结束，再重新盘点和规划整个明确范围。
任一缺输入、源摘要漂移、未知数据、目标冲突都在 UPDATE 前阻断整批；成功仅写五个新 SSO 列，保留旧列供核验和回退。
写后同事务重新比较 Client/Role 保留事实、非目标 Client 和目标值，异常触发整批回滚。
每份库存最多 1000 Client、输入文件最多 1 MiB；超界整体拒绝，不截断为成功。大于该范围的环境须先由 owner
调整并验证有界方案，不通过拆 scope 绕过全量库存边界。连接 10 秒、等锁 10 秒、单语句与事务空闲 5 分钟，关闭等待 5 秒。

最终 Confidential OIDC 或业务自行回调 Custom Client 使用 32 字节密码学随机新 Secret及清单中的凭据 ID和数据库时间。
Public/托管不新增外部 Secret，Internal-only 不写凭据。旧 Hash 从不还原或复制为当前原文，Internal Secret 不参与轮换。
仅当当前目标严格配置、启用意图及本清单固定凭据 ID 都匹配，且所需新 Secret/时间完整时，重跑才是零更新；
其他非空目标拒绝覆盖。重新 inventory 会生成新的候选凭据 ID，因此不能丢弃原清单后把新清单当作重跑输入。
完成 Secret 不输出到 stdout、日志或报告；完整管理员通过 #182 已授权且有审计的独立重读能力取得当前值，
经既有受控渠道分发给接入负责人。命令不调用管理重读、不自动分发、不新增 Hash-only 重读例外。

每次 verify 必须是新进程/新连接的 `REPEATABLE READ READ ONLY` 事务，重新比较源保留摘要、所选最终配置、
启用意图和新凭据身份/完整性。普通 verify 只证明 manifest 范围；`--all` 还要求清单恰好覆盖数据库全部 Client，
包含 Internal-only 和已删除行，作为 #194 收缩旧列前的数据 gate。不能用局部 verify 代替全库门禁，也不能用 apply 的更新数量代替 verify。
分批成功后合并各份原始批准 selection 成全量清单，再独立 `verify --all`；不要重生成已迁移 Client 的凭据 ID。

退出 0 且 `completed` 才证明本命令范围通过；inventory 的 completed 仍允许 pending-selection。
退出 1 表示未知数据、待输入、目标不符、范围不全、配置/事务/连接/关闭故障；退出 2 表示命令参数不合法且未创建连接。
安全报告只含版本、模式、状态、固定原因、计数与 canonical Client code/安全定位字段，不含 URL、原文、Hash 或驱动异常。
`operation-failed` 不代表必定回滚：提交响应或关闭失败仍可能已提交。保持停写，以原清单新进程 verify/同范围 apply
确认；已完成部分保留凭据，不自动扩大范围或重新轮换。源漂移由业务 owner 依据实际事实重新核对批准输入，不自动更新摘要。

### 消费者协调、收缩与回退责任

业务数据 verify 与 Snapshot repair 分开：本工具不推进旧 epoch、不清缓存、不撤销/转换在线对象。
放流前按 #193 的各 owner 命令清理源/目标会话与协议状态，执行新 Snapshot/Gate/Secret namespace repair 和独立 verify；
旧 Snapshot repair 的成功不能证明新 namespace，也不能替代 PostgreSQL Client 升级。
发布 owner 保存全量数据 gate 后，才执行 #194 的旧列收缩；保持停流，统一 API/Admin API/Worker/Admin/SSO 制品、
OIDC issuer/入口并入 API 的路由与配置，禁止旧 reader/writer、线上双读双写或旧对象转换。
接入负责人逐 Client 确认所选协议、回调实际路由、新 Secret 配置（适用时）、重新登录与兑换/UserInfo smoke；
凭据交付确认只记录负责人、凭据 ID和安全结果。任何消费者未确认都不开放该升级窗口流量。

apply 前失败保持原数据；apply 后优先修复同候选并用原 scope 重跑。选择回退时继续遵守本页停流、清除新在线状态、
固定兼容回退候选和全体重新登录的责任。DB owner 在旧列尚存阶段核对保留的源业务事实与源布局兼容性；
旧列已删除时按 #194 固定的 schema/备份恢复流程恢复，不能凭单协议结果猜回被放弃协议或 Secret Hash。
接入负责人协调回退版本所需的凭据与协议配置；新 Secret 不会自动写回旧 Hash，也不保证新值适用于旧应用。
旧备份恢复后须重新完成适用布局盘点、升级/全量核验和消费者确认，不能直接放流。

直接证据在 Worker `client-sso-upgrade-command.integration.test.ts`：真实 PG、正式 CLI 进程验证人工选择、
缺部署地址、换新/重跑、只读独立核验、事务回滚、保留事实/非目标、范围门禁及安全失败。
这些证据不证明实际环境停写、路由已部署、Secret 已分发或生产已切换。
