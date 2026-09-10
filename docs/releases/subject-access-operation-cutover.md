# Subject Access 操作许可统一切换

Status: Current

Last verified: 2026-09-10

Next review: 2026-10-31

本手册交付 [Spec #128](https://github.com/cyy1998/shgas-iam/issues/128) 的人工维护步骤。
代码与本地验证记录在 [#136](https://github.com/cyy1998/shgas-iam/issues/136)，整 feature 聚合验收由父规格记录。
目标环境的停流、清理、部署、重新登录和放流均**未执行**。本次实施授权不包含生产操作。

## 适用边界与责任

新版本所有 API、Admin API、OIDC Provider、Custom SSO 消费者统一使用不透明 `subjectContext`。
Kernel 不再读取旧 Subject Access 专用代际字段，缺少或不支持 context 不按当前 Barrier 补齐。
本次不允许新旧 reader/writer 混跑；现有在线登录全部失效，用户重新登录。

复用现有 `@iam/oidc-provider online-auth:state`，没有新增清理命令、namespace、全库重置或自动切换演练。
已核对其 CLI、composition 和 owner prefixes：它顺序直接扫描当前 owner 键族、不解析 payload、不依赖索引完整性，
所以同时覆盖旧字段、坏 payload、无 TTL 和已丢索引的当前 owner 对象。它不调用外部 logout，也不写 PostgreSQL。
完整通用命令约束与 Redis 时间环境责任继续遵守[在线认证状态维护手册](online-auth-redis-time-cutover.md)。

仅支持当前 Kernel namespace（默认 `sess:v2:`）、Grant v1 和当前 OIDC store；退役 `global_session:*`、旧 local session、
旧 OIDC token index 或未知 owner 另行制定迁移，不以本命令零报告证明它们已清空。
`client-protocol:artifacts` 保护 Principal 且依赖 per-client inventory，不能替代本次全体在线认证清理。

## 窗口前固定清单

发布负责人保存源 commit、目标 commit、回退 commit、全部镜像 digest 和静态资源版本，核对每个版本理解的存储契约。
逐项固定环境标识、Redis primary/逻辑 DB、可能提升的 replica、API/Admin/OIDC 实际 namespace、全部副本和自动重启模板。
不同 DB/namespace 必须分别完整执行，不能只清默认值。工具不自动发现环境，不能沿用开发 `.env` 的连接。

列全所有 reader/writer：API、Admin API、OIDC、Worker、队列消费者、定时任务、one-shot 运维命令、直连入口及内部重试。
共享 Kernel 的消费者和 Admin/SSO 静态产物作为同一发布单元。第三方自建会话及离线 ID Token 的处置由接入方单独确认。

数据 owner 保存非目标基线：PostgreSQL 用户/Client/协议版本/审计、Profile/Facts、Subject Access Barrier及transition/repair、
Runtime Snapshot、BullMQ、Temporary Login Restriction、短信码/nonce、OIDC client-auth-failures。
只记录安全数量/受控摘要，允许 TTL 自然到期并单独解释；不以整个 Redis key 数替代 owner 核验。
不得把 Redis URL、key、token、Cookie、PII 或私钥写进发布记录。

## 精确清理与保留集

`<ns>` 是核对后的 Kernel namespace，末尾冒号由 owner 规范化。只允许现有 owner 清单，不接受任意 pattern。

| 顺序 / owner | 清理键族 | 独立 verify |
|---|---|---|
| 1 / Session Kernel | `<ns>active:`、`<ns>lookup:`、`<ns>revoked:`、`<ns>revoked_lookup:`、三类 `<ns>state:p/c/a:` 与 `<ns>id:p/c/a:`、`<ns>idx:` | 重扫源与目标各族；Principal、Binding、Credential、Artifact、反向 ID、源 lookup/tombstone 与全局/用户/client/protocol/parent/binding/cleanupPending 索引均为零 |
| 2 / Custom SSO Grant | `authorization-grant:redemption:v1:` | issued/redeeming/consumed，包括无 cleanup ref 的残留均为零 |
| 3 / OIDC protocol | `oidc:model:`、`oidc:consumed:`、`oidc:grant-objects:`、`oidc:client-objects:`、`oidc:session-uid:`、`oidc:user-code:` | Session、Interaction、Grant、Code、Token 主对象及各索引/lookup均为零 |
| 4 / Provider Session | `oidc:provider-session-binding-lookup:`、`oidc:provider-session-principal:`、`oidc:provider-session-generation-members:`、`oidc:pending-provider-session-binding:`、`oidc:pending-provider-session-bindings:client:` | mapping、anchor、generation members、pending payload/index均为零 |

源码由 Kernel `/maintenance`、Custom SSO `/maintenance`、OIDC `composition/stores/online-auth-state.ts` 和
`session/provider-session.ts` 各自拥有。若源版本有清单外 cleanup adapter，必须先补齐其操作责任，不能删 pending 后宣称已清理。

保留上述非目标基线、所有未知键族和退役 namespace；不改账号状态、不推进 Client epoch、不重建 Profile，
不清 Subject Access Barrier 或其恢复队列。禁止 `FLUSHDB`、`FLUSHALL`、`oidc:*` 或 `<ns>*` 宽范围删除。
本命令只终止 IAM 管理访问，不能保证第三方自行建立的本地会话退出。

## 停流、drain 与独立清理

1. 关闭 Gateway 的相关业务入口，同时阻断后端直连、内部调用和自动重试。包括所有登录/续接、Custom SSO
   authorize/callback/token/authz/UserInfo/logout、OIDC authorize/interaction/login guard/resume/token/UserInfo/logout、
   refresh/renew、Admin会话管理以及会触发撤销的用户/Client mutation。仅设置 Client Maintenance 不够，它仍允许退出和管理写入。
2. 等待全部在途请求/后台任务结束，记录每副本 in-flight、Gateway活跃请求和任务完成证据。停止所有旧 reader/writer、
   定时任务、自动扩容及旧镜像自动重启，平台独立枚举确认零旧进程。已许可请求可能继续执行，因此不能仅等一个固定 TTL。
   任一副本无法确认则保持停流，不开始清理。
3. 使用固定目标 checkout、Node.js 24、仓库 pnpm及依赖，在受控运维连接显式注入
   `IAM_OIDC_PROVIDER_REDIS_HOST`、`IAM_OIDC_PROVIDER_REDIS_PORT`、`IAM_OIDC_PROVIDER_REDIS_DB`、
   `IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE`；需要时注入 `IAM_OIDC_PROVIDER_REDIS_PASSWORD`。
   核验目标 primary/DB/namespace和ACL（SCAN/UNLINK/连接管理）；停止状态也适用于只读盘点。
4. 每条命令独立进程执行并保存安全报告和退出码：

   ```bash
   pnpm --filter @iam/oidc-provider online-auth:state -- dry-run --writers-stopped
   pnpm --filter @iam/oidc-provider online-auth:state -- apply --writers-stopped
   pnpm --filter @iam/oidc-provider online-auth:state -- verify --writers-stopped
   ```

   `apply` 顺序扫描、最多100个键一批 UNLINK，不是跨 owner 事务。它成功不代表零残留，必须另起 verify全量重扫；
   四组所有族零且扫描无错误才能通过。SCAN可重复，不能以 observed减removed证明清空。
   CLI总deadline五分钟、连接/命令timeout五秒，超时、信号、部分失败或报告缺失均阻断放流。
5. 使用独立连接核对同一primary/DB，并由数据owner确认保留集。`--writers-stopped`只是操作员声明，不能替代停流证明。
   发生故障切换、writer重启或保留集异常时保持停流，重新核验并完整重跑。

## 统一版本与人工验收

保持公开入口关闭。统一部署 API、Admin API、OIDC Provider、Worker及全部共享代码消费者，发布匹配Admin/SSO静态资源；
逐副本回读 digest、连接/namespace和自动恢复模板，确认没有旧实例。先取得零状态verify，再启动受控候选并检查readiness、
issuer/JWKS及非目标依赖。Smoke写入后库存不应继续为零；若发现旧writer，重新停流排空和清理。

仅向受控测试客户端开放入口，并记录逐项安全结果、requestId/traceId、版本和时间：

| 人工检查 | 通过条件 |
|---|---|
| 旧状态与重新登录 | 清理前测试Principal、Local Session、Independent Credential、OIDC Code/Token在线拒绝；新登录取得新context并正常访问，旧Cookie不阻止登录 |
| 统一认证与Custom SSO | 部署启用的密码/手机/OA/微信入口成功；Independent authorize/token/UserInfo、Gateway callback/authz及ORCAS按实际集成验收；实际撤销对象随后被 IAM 拒绝，根撤销允许漏撤 Credential；Spec #163 smoke 以[全体下线手册](online-auth-redis-time-cutover.md)为准 |
| OIDC | authorize/interaction/login guard/resume、Code→Token→UserInfo正常；PKCE错误及Code重放拒绝，logout后在线拒绝，协议输出保持 |
| 账号访问 | 受控账号禁用后下一请求拒绝；重新启用后的新登录可用，旧代仍拒绝。暂态不可用不清Cookie；生产不为演练主动破坏Redis |
| Admin记录与撤销 | 页面记录提示、筛选/分页/刷新、当前根保护、另一会话撤销、用户撤销数量和错误反馈保持；旧代记录存在不承诺可访问 |
| 保留集 | PostgreSQL及Client版本未被清理改变，Profile/Facts、Barrier、Runtime/队列等基线和自然TTL变化已核对 |

在途一次读取/失败固定的自动化证明见[最终契约](../features/sso/subject-access-operation-contract.md)，不能把本地结果宣称为环境验收。
发布负责人合并停流/drain、清理与独立verify、保留集、全部digest、人工smoke记录后才恢复公开入口及任务调度。
放流后从独立客户端回读登录结果并观察错误；任一required gate缺证据保持停流。

## 失败、重跑与回退

- 清理或verify失败：保持全部writer停止，保存安全失败报告，修复目标/ACL/网络/timeout后用同一候选完整重跑
  dry-run → apply → 新进程verify。删除幂等，但已删除的在线状态不可恢复；不得跳过owner或按计数猜已完成。
- 部署/readiness/smoke失败：关闭受控入口并再次停止、排空全部候选writer，优先修复前进。回退时固定理解当前owner key的
  旧候选，先用维护候选重新清理新版本smoke状态并独立verify，再统一回退全部消费者/静态资源，重新登录和完整smoke。
  旧实现可从空在线状态创建自己理解的格式，但绝不能让它读取新context状态或与新writer并存。
- 旧备份/故障切换：不得恢复snapshot找回旧登录态。恢复后先保持停流，核对备份版本及primary/replica，再清当前在线owner并
  独立verify；非目标Runtime Snapshot/Subject Access恢复遵守各自Current runbook。未知namespace或不理解源存储的候选
  需要独立迁移方案，不能直接放流。回退同样不恢复旧会话，用户必须重新登录。

## 证据登记

本地已核验现有维护CLI/owner实现及其OIDC真实Redis契约；实际命令结果保存于#136。环境记录逐项保留
“未执行 / 通过 / 失败”：固定版本及目标、owner清单、停流/drain、三个独立命令、保留集、统一digest、人工smoke、
故障/重跑/回退和放流后回读。当前所有环境项为未执行，不以实现提交、测试数量或清理能力存在代替。
