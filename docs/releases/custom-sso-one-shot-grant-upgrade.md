# Custom SSO 一次消费的保留会话升级

> 本文保留对象流程只适用于原规格单独升级。包含 Spec #163 / ADR-0033 的候选必须优先执行[全体在线状态下线](online-auth-redis-time-cutover.md)：停旧 writer、排空、四 owner 清理及新进程 verify 后统一版本并重新登录，不保留旧 Credential。原规格证据仍保留其历史适用范围，环境未切换。

Status: Current

Last verified: 2026-09-10

Next review: 2026-10-31

本手册由 [#161](https://github.com/cyy1998/shgas-iam/issues/161) 交付，适用于 [Spec #157](https://github.com/cyy1998/shgas-iam/issues/157)。
[最终契约账本](../features/sso/custom-sso-one-shot-grant-contract.md) 区分前票证据、最终组合和人工事项。
目标环境切换尚未执行；本手册提供发布负责人的流程，不授予部署、清理或放流权限。

## 适用基线与固定输入

发布负责人先登记源 commit、完整目标候选、各 runtime/维护镜像 digest、实际 deployment project、环境文件、所有副本及自动重启/扩容模板。
父 #157 的代码最终验收通过后，才能使用该候选发布；#158 Gateway 过渡树不可部署。版本号相同不足以代替 digest/commit 对照。

| 前提 | 发布前必须持有的证据 |
|---|---|
| 在线生命周期 | 当前 Kernel 对象版本、Redis 权威期限、API/Admin/OIDC 相同精确 primary/逻辑 DB/namespace；不存在待迁移的应用时间对象。参考 [Redis 时间切换](online-auth-redis-time-cutover.md) 的已有验收记录。 |
| 主体访问 | 当前不透明 subjectContext、对应 Barrier 和已完成的 [操作许可切换](subject-access-operation-cutover.md)；不是旧专用代际状态。 |
| 协议数据 | 当前 Custom SSO V2 metadata、合法旧 redemption v1 issued/redeeming/consumed；当前 OIDC Binding、store、Claims Snapshot 和 Provider ownership。缺索引库存由本次维护发现，未知格式不能猜测删除。 |
| Client 与事实 | 当前协议 epoch、严格配置/Catalog、Runtime Snapshot、Profile/Facts 数据契约；源环境已有适用 Protocol V2/Profile v3 迁移验收。 |
| 加密与定位 | 保留原 HMAC current/previous、Cookie keys、OIDC issuer/JWK 和实际 namespace，使原 Principal/Credential/OIDC token 可定位验证。不得顺带轮换材料。 |

更早 namespace/备份、不兼容对象、未完成迁移或无法证明的连接身份不适用本手册。停止流程，由数据 owner 固定独立迁移或前修方案；
不能自动清库、全量登出、补造 metadata 或启动退役 reader。本窗口冻结 Client 启停/配置/Secret/删除、协议 epoch、Catalog、
Subject Access/会话管理写入、namespace 和密钥变更；这些变更可能主动撤销保留组，不能夹带在保留证明中。

## writer、consumer 与停流清单

| 面 | 实际 owner 与动作 |
|---|---|
| 授权和兑换 writer | 所有 API 副本：`/sso/authorize` 写 Artifact，`/sso/token` 与 `/sso/callback` 消费后签 Credential。API 的完整 operations 来自 `@iam/custom-sso`，两种模式均使用 Kernel 消费。 |
| 浏览器/接入方入口 | Gateway 内外网 `/sso/token` 专用 route、`/sso/*`；SSO/Admin 与外部 Independent 应用授权入口。阻断公开入口、直连绕行、内部调用和自动重试。Gateway 只转发，不拥有消费权。 |
| 同一保留集的其他 writer | API 的根登录/续期/UserInfo/authz/logout；OIDC authorize/interaction/resume/token/refresh/UserInfo/logout 及 Provider session 写入。保留基线期间暂停这些流量，避免合法续期与维护效果混淆。 |
| 管理及任务 | Admin API 的 Client/账号/Session mutation；自动配置同步、维护人员命令、定时/后台任务。Worker 的 epoch/Runtime/Profile repair 及 OIDC 宽 online-auth 清理不得在窗口并行改写基线。按实际部署确认任务范围，没有任务也记录“不适用”。 |
| cleanup/maintenance consumer | API/OIDC 的 Kernel 装配均加载 `@iam/custom-sso/cleanup`；OIDC 维护 runtime 通过 `custom-sso:grants` 组合 Custom SSO/Kernel `/maintenance`。Admin API 使用 Kernel 及协议版本 selector。全部包消费者与发布模板固定在同一候选。 |

1. 平台 owner 在现有负载均衡/Gateway/网络入口停流，并从独立连接确认请求无法到旧实例。仓库没有通用停流 CLI；
   若改 Gateway manifests，先完整遵循 [APISIX 发布手册](apisix-gateway-release.md)，不能把命令成功视为流量已封闭。
2. 停自动重试、扩容和重启来源，按所有实例观察在途请求/任务完成；随后停止旧 writer 进程。记录每实例版本、最后请求、
   排空和停止结果。Client Maintenance 只影响新 acquisition，不是排空证明；固定 sleep 或等一个 TTL 也不能证明旧租约 holder 已退出。
3. 数据 owner 确认所有旧 writer 已停、新 writer 尚未启动。只有在这个窗口运行下面三条定向命令；重复命令也要求同样前提。

## 基线、定向清理与两道独立 gate

完整阅读 [定向维护手册](custom-sso-grant-maintenance.md)，其中拥有参数、ACL、超时、报告和错误处理细节。
在源对象原有效期内，由数据 owner 保存受控基线：有效 Principal、已签发 Independent/Gateway Credential、非目标 Artifact、
OIDC Binding/Code/AccessToken/Provider Session/Interaction/Grant 及关联 lookup/anchor/membership/index；另外核对
Client epoch/Secret、Facts/Barrier/Runtime/队列未被夹带修改。测试者受控保管必要 Code/token/Cookie，报告只含安全摘要和 owner 归属。
逐对象保存持久值摘要、绝对 expiry 与必要关联完整性，单列自然过期；总 key 数相同、retained 计数或过期对象不能证明保留。

由受控环境显式注入 `IAM_OIDC_PROVIDER_REDIS_HOST`、`IAM_OIDC_PROVIDER_REDIS_PORT`、`IAM_OIDC_PROVIDER_REDIS_DB`、
`IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE` 和必要 `IAM_OIDC_PROVIDER_REDIS_PASSWORD`。不读取开发 `.env`，不打印凭据。
使用固定候选、Node.js 24 和仓库 pnpm；每个动作独立启动新进程，同一精确 Redis/namespace：

```bash
pnpm --filter @iam/oidc-provider custom-sso:grants -- inventory --writers-stopped
pnpm --filter @iam/oidc-provider custom-sso:grants -- apply --writers-stopped
pnpm --filter @iam/oidc-provider custom-sso:grants -- verify --writers-stopped
```

inventory 成功后才 apply；任一步失败立即停止发布推进。apply 只删除所有已确认 `custom-sso/auth_code` active/tombstone/lookup 和
旧三态/orphan redemption，按已观察值 CAS 保护替换者。它不区分“旧契约/新契约”的 Artifact，故**新 writer 或 smoke 启动后禁止再次运行**。
不能用 `online-auth:state`、全库/namespace 清空、`client-protocol:artifacts` 或 `client-protocol:epochs` 替代。
[旧协议校验升级](protocol-validation-preserving-upgrade.md) 中“原 Custom SSO Code 继续兑换”也不适用于本次；本次旧 Code 必须失效。

放流前有两个独立 gate，缺一不可：

- **目标 gate**：verify 新连接只读 SCAN/GET，退出码 0、`status=passed`、完整 scanComplete、targets/failed/unverified 均为零。
  各 Redis/namespace 分别留证；apply 的 removed 数量不能推导 verify 成功。
- **保留 gate**：独立只读连接或正式 owner 入口对照基线的持久值、绝对 expiry 和关联对象。CLI 的
  `preservation=requires_independent_baseline_comparison` 明确保留证明尚待这一步，不是“已验证保留”。自然到期单列，其他差异必须解释。

任一 gate 失败，保持旧/新 writer 都停、公众流量关闭。核对资源、ACL、意外 writer、格式和未知提交；按 owner 修复后，
在相同停流条件下从 inventory→apply→新进程 verify 完整重跑，再对照保留集。无法确认的对象保留并报失败，不以清库解决。
Redis failover/旧备份恢复或意外 writer 会使既有零报告失效，先重新固定资源和窗口；不恢复备份来让旧 Code 再生。

## 统一版本与受控 smoke

两道 gate 通过后才启新 writer。统一 API、OIDC Provider、Admin API、共享包的任务/维护消费者和对应 Admin/SSO 静态产物。
沿当前 Compose 发布的平台可用以下既有模板；发布 owner 绑定准确 project、绝对环境文件和审定 digest，不使用默认 tag 或自动发现环境：

```powershell
docker compose --project-name $ReleaseProject --env-file $ReleaseEnvFile -f docker/docker-compose-prod.yml config --images
docker compose --project-name $ReleaseProject --env-file $ReleaseEnvFile -f docker/docker-compose-prod.yml up -d --no-deps api admin-api oidc-provider worker-user-profile worker-dashboard
docker compose --project-name $FrontendProject --env-file $ReleaseEnvFile -f docker/docker-compose-frontend-prod.yml up -d --no-deps admin sso
docker compose --project-name $ReleaseProject --env-file $ReleaseEnvFile -f docker/docker-compose-prod.yml ps
```

其他编排平台使用其正式部署入口完成同样核验。数据服务不重建；管理写入和任务调度保持冻结。逐副本及自动恢复模板回读版本、
连接/namespace、健康和旧实例已退出证据。只向受控测试入口开放，公众入口继续关闭。此时可以产生新 Grant，零库存已不再是有效目标。

| 受控检查 | 通过条件 |
|---|---|
| 切换前旧 Custom SSO Code | 两模式在正确归属入口拒绝，Independent 为 401 InvalidAuthCode、Gateway 为既有 401 Unauthorized；不清有效根 Cookie、不重放成功。已自然到期的样本不能代替有效旧码被维护失效的证据。 |
| 同根新授权 | 用保留 global_session Cookie 正式 authorize；Independent 经 token 取得原 V2 subject/sid/ttl，Gateway 经 callback 保持原 Cookie/redirect/state，通常不需再次输入凭据。Gateway 恢复从业务应用发起，不能刷新旧 callback。 |
| 已有 Credential | 原 Independent/Gateway Credential 继续访问 UserInfo，Gateway 继续 authz；检查 Client 裁剪、V2 UserInfo、Gateway Header V1、Cookie 与期限。与新授权产生的 Credential 分别验证。 |
| 暂态恢复 | 按已有可控入口观察暂态原因和 Cookie 保留，不在生产 Redis 注入破坏。token Retry-After 等待后发起新授权；UserInfo/authz 等待后原有效凭据重试。参数/认证/配置错误先修正，无自动循环。 |
| OIDC 保留 | 原有效 Binding/Code/AccessToken/Provider Session 沿正确 OIDC 入口继续；授权/Code→Token→UserInfo、Claims Snapshot/PKCE/replay/logout 的完整步骤沿 [OIDC 手册](oidc-release-runbook.md)，replay/logout 使用独立可销毁样本。 |
| ORCAS 与外部接入方 | 仅核验实际启用集成的合法成功交付和接入方新授权策略；真实故障/幂等/撤销试验不属于本次。IAM 失败不表示外部无作用，新授权可能重复登录，#145 仍有效。 |
| 非目标和基线 | 同 Client 另一用户、另一 Client、其他协议和 roots 无维护导致的删除。smoke 合法消费/续期与维护前基线对照分开记录，不能要求被 smoke 消费的 OIDC Code 保持原值。 |

每行登记适用模式、owner、digest、时间、requestId/traceId、安全结果及未执行理由；未部署模式明确记录不适用。
只有外部 Independent 接入方已确认新恢复语义、全部旧副本退出、统一版本、两道 gate 和适用 smoke 均通过，负责人才能**一次性放开公众流量**，
随后按冻结清单恢复管理与调度。用独立客户端再次验证两模式/OIDC 访问并观察错误率；不把健康检查或本地测试当作放流证明。

## 可行的中止与回退边界

| 时点 | 允许的下一步 |
|---|---|
| apply 尚未开始 | inventory 是只读。关闭受控入口、确认没有任何清理写入和数据变化后，可中止此次升级，整体恢复固定源版本及原调度；原契约仍是源版本契约，不能宣称一次消费已上线。 |
| apply 已开始，但新 writer 未启动 | 已删除旧 Code 不可逆，不恢复 Redis 快照或重建 Code。保持停流，修复并重跑两道 gate。源版本可在封闭环境用于诊断，不能据存储兼容直接回退放流。 |
| 新 writer/smoke 已启动 | 先封闭受控入口并停止/排空候选，保留新旧 Credential/根/OIDC。优先前修；回退放流仅限已固定、验证过同一次消费契约及当前保留集兼容的整体 digest。不得混跑两代 writer。 |
| 首次上线没有同契约已验收回退版本 | 这是当前候选的现实边界：没有可自动恢复服务的旧版本回退。保持停流，制作并验证前修候选；或恢复同一审定候选/部署配置后重做保留与 smoke。不要虚构可放流的回退 digest。 |
| 误删保留对象或源数据不兼容 | 保持停流交数据/发布 owner 决定独立恢复方案；不能自动全量登出、推进 epoch 或让旧 Code 再生。 |

若新 writer 已运行后确需再次定向清理，必须先停止全部 writer、排空并登记新窗口的目标影响和新基线；该命令也会失效此时的新 Code，
不能沿用前一窗口的“只失效切换前旧 Code”说法。回退不以删除已签发 Credential 或 OIDC 状态作为隐含补偿。

## 环境记录

| 项目 | 发布 owner 待填写 |
|---|---|
| 固定输入 | 源/目标/可行回退或前修 commit、各 digest、project、环境文件、父 #157 最终验收 |
| 数据基线 | 当前格式/既有迁移、精确资源与密钥定位、受控样本、绝对 expiry/关联对照 |
| 停流排空 | 入口、直连、重试/任务、所有实例/模板、最后写入与停止证据 |
| 定向维护 | 三个独立进程的时间、退出码、安全报告、每套 namespace 的目标 gate |
| 保留证明 | 独立观察对照、自然到期说明、未解释差异为零 |
| 统一发布与 smoke | 每实例 digest/健康、每模式每项结果、外部客户端迁移确认 |
| 处置与放流 | 失败/前修/回退依据、再次核验、一次放流时间与独立访问结果 |

当前所有环境栏均未执行。代码候选通过的本地检查和限制在 #161/父 #157 单独记录，不写入环境“通过”栏。
