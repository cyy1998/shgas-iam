# 协议校验修复的保留对象升级

> 本文以下步骤仅适用于原规格验收记录所固定的旧候选及其存储契约；历史保留流程不能套用当前 checkout。包含 Spec #163 / ADR-0033 或 Spec #170 / ADR-0034 的候选必须执行[全体在线状态下线](online-auth-redis-time-cutover.md)：停旧 writer、排空、清理源及目标布局、新进程 verify、统一版本并重新登录，不保留旧在线对象。下文的 HMAC 或保留要求仅属于固定旧候选；当前 Kernel lookup HMAC 已退役。环境未切换。

Status: Current

Last verified: 2026-09-10

Next review: 2026-10-31

本手册交付 [Spec #146](https://github.com/cyy1998/shgas-iam/issues/146) 的人工维护流程。
候选与测试证据见 [#151](https://github.com/cyy1998/shgas-iam/issues/151) 和[最终契约](../features/sso/protocol-validation-contract.md)。
目标环境的停流、排空、部署、保留核验及 smoke 均**未执行**；代码实施授权不包含这些环境操作。

## 适用前提与窗口清单

发布负责人先固定源/目标/回退 commit、各镜像 digest、部署 project、环境文件、全部副本与重启模板。
数据库和 Redis owner 通过部署历史、适用迁移验收记录及受控只读抽样，确认以下当前契约已经成立；仅看到 namespace 名称不够：

| 当前契约 | 必须核验的依据 |
|---|---|
| 在线状态与时间 | 当前 Session Kernel `sess:v2:` 或显式配置的同一 namespace、Redis 权威期限；无待迁移应用时间对象。沿 [Redis 时间手册](online-auth-redis-time-cutover.md) 已有验收记录。 |
| Subject Access | 当前不透明 `subjectContext` 和对应 Barrier；全部现存 writer 已完成 [操作许可切换](subject-access-operation-cutover.md)，没有需清除的旧专用代际对象。 |
| 协议对象 | 当前 Custom SSO V2 metadata/Grant v1 与 OIDC store、Binding/Claims Snapshot/Provider ownership；版本字段有效，Return Handle 同样记录 OIDC 版本。 |
| Client 与 Runtime | 当前协议 epoch、严格配置/Catalog、Profile/Facts 数据契约；当前 Snapshot Module namespace 与 reader/writer。更早数据遵守 [Protocol V2](client-protocol-v2-artifact-cutover.md)、[组织责任 V2](organization-responsibility-v2-hard-cutover.md)、[Profile v3](user-profile-v3-hard-cutover.md) 适用流程。 |
| 身份与连接 | API/Admin API/OIDC 指向同一预定 Redis primary/DB/namespace；HMAC current/previous、OIDC Cookie keys、issuer 和 JWK 验证材料跨升级可用。不得从开发 `.env` 推断目标。 |

无法确认任一前提时停止本流程，沿原迁移手册另行安排窗口；不通过补造版本、猜测 metadata、恢复退役 reader 或静默清除对象来满足前提。
旧备份/退役 namespace 的首次迁移仍按 [Session 维护边界](../features/oidc/oidc-session-migration.md) 单独固定版本与 owner。
本修复没有新持久化格式、schema migration、强制重登录或全量登出要求。

本窗口不变更协议配置、启停、Secret、Client 状态/删除、Catalog、namespace、HMAC、Cookie keys、issuer 或 JWK；
这些独立变更可能主动失效访问，不能夹带进“保留有效对象”证据。Client Maintenance 也不能单独充当停流手段：退出、管理 mutation
及已经接受 Snapshot 的请求仍可继续。冻结清单包括 Admin REST/tRPC、自动配置同步、队列任务、定时任务、one-shot 命令和直接数据库写入。

## 停流与排空

1. 平台 owner 在负载均衡/Gateway 阻断两协议相关入口与绕行直连：登录、authorize、interaction/login guard/resume、callback、
   token、UserInfo/Public authentication、Gateway authz、logout、renew/refresh；停止内部自动重试和会产生这些调用的任务。
   同时冻结 Client 变更及会修改目标会话的管理任务。Discovery/JWKS/health 可以保留只读；逐入口从独立连接确认业务流量不能到达旧进程。
2. 按实例观察 in-flight 和后台任务，等待已经接受旧快照的调用完成，再停止旧进程与自动重启/扩容模板。
   不以固定 sleep、一个最大请求 TTL、Maintenance 页面或单台实例日志代替全部 drain 证据。未确认的实例继续阻断放流。
3. 核验 API、Admin API、OIDC Provider 的所有副本，以及加载这些共享包的 Worker、运维命令/任务。
   停止时间、每实例版本与排空结果由平台 owner 保存；新旧候选不能混跑。第三方自有会话/离线 ID Token 不由 IAM 回收承诺覆盖。

Gateway manifest 如需修改，完整遵守 [APISIX 发布流程](apisix-gateway-release.md) 的固定 `<env>:<app>`、validate/diff/dry-run/apply。
仓库没有通用“停流”CLI；实际入口阻断与直连封闭由当前部署平台操作，不能把 `gateway:apisix:apply` 本身当停流证明。

## 保留核验与统一发布

停流后由数据 owner 使用当前公开中性盘点与受控只读检查保存目标样本和非目标基线：Principal、两协议 Credential/Code、
OIDC Binding/Provider payload、Custom SSO Grant，及 PostgreSQL Client 配置/epoch、Profile/Facts、Barrier/恢复状态、Runtime、队列。
只记录安全数量/受控摘要、剩余有效期和结果；token/Cookie 由测试人员受控持有，不写入日志或报告。
数量变化必须区分正常 TTL 到期，不延长对象期限或恢复已到期/撤销/消费对象。窗口长于样本有效期时重新选择合适样本，不能将其过期解释为误撤。

**本流程不执行清理或推进 epoch。** 下列旧维护命令不适用于当前格式的保留升级：

- `online-auth:state apply --writers-stopped` 会删除当前全部在线状态，包括 Principal；其 `verify` 要求零库存，不能作为本流程保留 gate。
- `client-protocol:artifacts apply --manifest ...` 会终止 manifest 所列协议全部当前访问，虽保护 Principal 仍会删除有效协议对象。
- `client-protocol:epochs apply --manifest ...` 会推进 epoch，使旧代永久失效。
- 不执行 `FLUSHDB`、`FLUSHALL`、通配符删除或已退役 Session cleanup；不以全量清理作为 smoke 失败的默认补偿。

上述手册只为更早环境的独立迁移提供来源，不将其 destructive apply/零库存 verify 带入本次流程。
普通精确失效与已登记 pending cleanup 继续由原 owner 负责；Admin 未装配协议 cleanup adapters，权威撤销不表示外围已完成。
若发布中确需回收已确认无效对象，另行固定精确对象与现有 owner 维护能力，保留失败报告；本修复没有新的批量精确维护 CLI 或后台持续重试执行器。

统一发布 API、Admin API、OIDC Provider；共享代码消费者/Worker 和匹配 Admin/SSO 产物按固定清单部署。
沿当前 Compose 部署的环境可使用下列模板；变量由发布负责人绑定既有 project 和绝对环境文件路径，
`IAM_*_IMAGE` 必须固定为审定 digest，不能沿示例默认 tag。先核对 rendered image 列表，不打印含 Secret 的完整配置：

```powershell
docker compose --project-name $ReleaseProject --env-file $ReleaseEnvFile -f docker/docker-compose-prod.yml config --images
docker compose --project-name $ReleaseProject --env-file $ReleaseEnvFile -f docker/docker-compose-prod.yml up -d --no-deps api admin-api oidc-provider worker-user-profile worker-dashboard
docker compose --project-name $FrontendProject --env-file $ReleaseEnvFile -f docker/docker-compose-frontend-prod.yml up -d --no-deps admin sso
docker compose --project-name $ReleaseProject --env-file $ReleaseEnvFile -f docker/docker-compose-prod.yml ps
```

使用其他编排平台时沿其现有发布入口完成同样检查，不把上述 project 模板当环境自动发现。
逐副本与自动重启模板回读 digest、连接/namespace和健康；数据服务不随本次重建。只向受控测试入口放行，公众流量保持关闭。
部署命令成功或 `ps` healthy 不证明所有旧副本已退出，也不证明对象已保留。Redis restore/failover 时暂停本流程，按
[Runtime 恢复手册](client-runtime-snapshot-restore.md) 与数据 owner 分别核验；不通过恢复旧 Redis 快照找回对象。

## 人工 smoke 与放流 gate

建立同一 Client 两个用户和另一 Client 的对照对象；至少保留一组升级前尚有效的对象。按 endpoint 当前错误映射验收，
保存 requestId/traceId、时间、digest 与安全结果，不保存 bearer、Code、Secret、Cookie 或完整 Redis key。

| 检查 | 通过条件 |
|---|---|
| 升级前对象 | 在原有效期内复用 Principal、Custom SSO Credential、OIDC AccessToken；未消费且仍有效 Code 在正确入口兑换成功，不要求重新登录。 |
| 正向真实误投 | 合法 Custom SSO bearer 送入 `/oidc/me`；合法 Custom SSO Code 送入 `/oidc/resume` 且无对应 Cookie，均拒绝。随后从正确协议访问/兑换，并回读同 Client 第二用户、另一 Client 与 roots，全部符合原生命周期。 |
| 反向真实误投与归属 | 合法 OIDC token/Code 提交 Custom SSO 对应入口，错误 type/Client/redirect/browser 请求拒绝；原对象仍可由正确入口使用。随机 token 拒绝不替代此检查。 |
| 合法 OIDC | 沿 [OIDC smoke](oidc-release-runbook.md) 的 authorize/interaction/Code→Token→UserInfo、PKCE、Claims Snapshot、replay/logout 检查；replay/logout 使用独立可销毁样本，不能毁掉保留组。 |
| 合法 Custom SSO | Independent authorize/token/UserInfo、Gateway authorize/callback/authz 与实际启用的 ORCAS；wire、Cookie、授权与退出保持。未部署的模式明确登记不适用及 owner。 |
| 暂态与恢复 | 在既有可控维护入口确认 Maintenance 保留尚有效 Cookie/对象，恢复后可用；不能用生产 Redis 破坏注入模拟不可用。此可控检查不变更协议 epoch，按冻结清单单独登记执行窗口。 |
| 保留集与配置 | 比较升级前后样本和安全库存，确认没有非 TTL 的无解释删除；Client epoch/Secret、Profile/Facts/Barrier 等基线未被本次部署改写。 |

由发布负责人确认全部前提、停流/写冻结、drain、统一 digest、保留与 smoke 均通过后才恢复公众入口、Client 写入和任务调度。
放流后用独立客户端再次验证两协议访问，观察错误率和 `admin.session_revoke.*` 诊断；不把本地测试或单个成功响应代替此 gate。

## 失败时保持的状态

- **前提/排空/保留不明**：保持流量和 Client 写入关闭，不清理、不发布混合版本；补齐源版本和 owner 证据。
- **部署/readiness/smoke 失败**：关闭受控入口，停止并排空候选 writer，保存安全结果。优先修复统一候选后重新检查保留集和全部 smoke。
  回退仅可到理解当前数据契约且已经具备本修复保护的固定 digest；回退到仍有误撤逻辑的原版本可以用于停流下诊断，不能据存储兼容直接放流。
  OIDC 通用手册中的“禁用协议/要求全部重新登录”不是本次保留升级的自动回退步骤，不能执行其 destructive 路径来掩盖失败。
- **传播或清理故障**：Runtime 修复与对象 cleanup 分开处理；pending 不是已完成，不能宣称后台会自动排空。修复后重新确认目标和保留集。
- **误删除/不兼容备份**：不恢复旧会话、不猜测重建 token；保持停流，由数据与发布 owner 决定独立恢复/迁移或前修方案。

## 环境记录模板

| 项目 | 待发布负责人填写 |
|---|---|
| 固定候选/目标/回退 | commit、所有 digest、#151 与父 #146 验收链接 |
| 当前格式前提 | 每项迁移记录与只读样本证据；未执行/通过/失败 |
| 冻结与 drain | 入口范围、Client 写入、实例/任务清单及零旧进程证据 |
| 保留与统一部署 | 安全样本、TTL 说明、各副本/模板 digest、连接与健康 |
| 逐项 smoke | 每行结果、适用模式、requestId/traceId、owner；未执行/通过/失败 |
| 处置与放流 | 失败原因/前修或回退、重新核验、放流时间与独立访问结果 |
