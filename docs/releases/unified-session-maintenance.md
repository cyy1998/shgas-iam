# 统一会话的 Worker 维护

Status: Current

Last verified: 2026-09-15

Next review: 2026-10-31

本页接替[旧候选人工发布流程](online-auth-redis-time-cutover.md)中的认证状态与 Client 升级步骤，适用于包含
[#193](https://github.com/cyy1998/shgas-iam/issues/193) 的 Spec #178 候选。代码、CLI 测试和环境切换是不同证据；
本文没有执行目标环境停流、清理、Secret 分发、部署或放流。#194 已将默认生产图收敛为一代，旧 app/默认入口已删除。

正式 Compose 以 `IAM_API_USER_SESSION_TTL_SECONDS` 和 `IAM_API_CLIENT_SESSION_TTL_SECONDS` 分别配置固定根期限和应用关系期限，
默认各为 86400 秒，两协议共用同一 ClientSession 设置；两项各自同步传给 AdminAPI 的 `IAM_ADMIN_API_USER_SESSION_TTL_SECONDS`
和 `IAM_ADMIN_API_CLIENT_SESSION_TTL_SECONDS`。可独立设置根 86400 秒、应用关系 3600 秒，不以一个默认 TTL 绑住两者。
Custom Token 使用独立的 `IAM_API_CUSTOM_SSO_TOKEN_TTL_SECONDS`（默认模板 86400 秒），OIDC Token 使用
`IAM_API_OIDC_TOKEN_TTL_SECONDS`（默认 3600 秒）；新 Token 的实际期限仍裁剪至原根与 ClientSession 剩余期限。
原 `IAM_API_SESSION_DEFAULT_TTL_SECONDS` / `IAM_ADMIN_API_SESSION_DEFAULT_TTL_SECONDS` 已退出当前配置，升级时迁移到各自有效变量。
旧 `SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS`、`SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS` 和 tombstone 参数已退役，
升级时应从环境配置移除，不能继续用它们调整新会话期限。根期限固定，ClientSession 的延长仍受其根的期限上限约束。

## 所有权与明确布局

Worker 的 `online-auth:state` 只装配公开 owner 的 inventory、apply 和独立只读 verify。
Kernel 不依赖协议；OIDC 与 Custom SSO 不互相依赖。Worker 不读取 app 私有源码，不启动 HTTP、队列、PostgreSQL
或通用可靠执行器。旧 Provider decoder 冻结在 `@iam/oidc/offline-maintenance`，只供明确 source 命令；
在线 OIDC 没有 Provider 状态探测、双读、格式 fallback 或旧对象转换。

| 布局与 owner | 实际库存 | 解析及作用 |
|---|---|---|
| source / Kernel | 显式 `<kernel-namespace>`，末尾冒号由旧 owner 规范化；`active/lookup/revoked/revoked_lookup` 四族、`state:p/c/a`、`id:p/c/a`、全部已知 `idx` | 四种旧对象、active/revoked/consumed、pending、无 TTL、无索引、孤立状态和合法反向 ID/索引分别发现。严格 schema、类型及 key identity 校验；逐观察值 CAS 删除。 |
| source / Custom SSO | 固定 `authorization-grant:redemption:v1:` | 旧 issued/redeeming/consumed、孤立 redemption 独立解析和 CAS；不恢复 lease、不重新消费或签发。Custom 的旧 Code/续接仍属于旧 Kernel Artifact，故全体升级必须同时处理 Kernel。 |
| source / OIDC | 固定 `oidc:model/consumed/grant-objects/client-objects/session-uid/user-code`；Provider binding lookup、principal anchor、generation members、pending binding 与 pending client index | 冻结 Provider 9.9.1 当前五种 model：Session、Interaction、Grant、AuthorizationCode、AccessToken；保留 strict Claims Snapshot V2 decoder。String、ZSET、SET 按原形状处理。包括退出 Session state、续接 Interaction、staged/pending、无索引和无 TTL；不跟随任意 cleanup ref。 |
| unified / Kernel | 精确 `<kernel-namespace>:unified:v1:` | UserSession/ClientSession active 与 terminated、user-id、slot、subject/subject-clients/children/client-index/inventory。扫描主记录和索引，不依赖管理索引完整；根/实例身份和期限由该 owner 解析。 |
| unified / Custom SSO | 精确 `<custom-namespace>:custom-sso:v1:` | Code、Token、token-id、Authentication Continuation。业务/托管 Token 共 owner；全量可处理合法孤立 reverse，Client 范围不能猜孤立对象归属。 |
| unified / OIDC | 精确 `<oidc-namespace>:oidc:v1:` | Code、Access Token、token-id、Authentication Continuation、退出确认。全量可处理合法孤立 reverse，Client 范围保留无法归属的 orphan。 |
| Client Snapshot | 固定 `client-snapshot:v1:{<clientCode>}:control`、`payload:client`、`payload:credential` | 可重建缓存，与登录状态分开；普通/敏感 reader 共 control，targeted repair 同时使双 payload 失效。 |

三个 unified namespace 分别显式传入，不能从一个默认值推测三个 runtime 的配置。冒号也是 namespace 字节：
若实际新 factory 输入末尾有冒号，生成的 `:unified`、`:custom-sso`、`:oidc` 前会有两个冒号，命令必须使用同一输入。
命令不接受任意 Redis pattern。source 与 unified 是两次明确操作，不按每个 key 自动选择格式；即使共享 namespace 前缀，
source 只处理旧 owner 固定族，保留新后缀及其他未知族。未知旧 namespace/备份需要另行固定适用的 decoder。

**未知在线状态与可重建缓存不能混为一类。** 未知版本、坏 JSON、错类型、非法身份、未知 Provider model/字段、
损坏索引成员均保留，并使本 owner inventory/apply 非成功。合法孤立索引只表示本 owner 派生记录，不恢复登录。
Snapshot 已知三族内的坏缓存允许清除后重新回源；未知 Snapshot 键族仍保留，不属于缓存全量 gate。

## 资源、输入和维护窗口

发布 owner 沿原手册固定源/目标/回退应用及独立维护工具 commit/digest、Redis primary/DB、各 namespace、
所有 reader/writer 和部署模板。先关闭登录、两协议、Admin 会话作用及直连/重试入口，停止新旧 reader/writer，
排空各副本在途、后台和 one-shot 任务。Snapshot full repair 还须冻结 Client mutation 与所有 acquisition。
Client Maintenance、等待固定 TTL、零请求量、命令参数均不能证明完成停流和排空。

使用受控环境显式注入 `IAM_WORKER_REDIS_HOST`、`IAM_WORKER_REDIS_PORT`、`IAM_WORKER_REDIS_DB`，
按需配置 `IAM_WORKER_REDIS_USERNAME`、`IAM_WORKER_REDIS_PASSWORD`。状态清理、Snapshot repair/verify 和 Client 升级 scripts
使用 `bun run` 默认读取 `apps/worker/.env`，已有进程环境变量优先；仍使用各命令的 `IAM_WORKER_*` 资源变量，
不回退 `DATABASE_URL` 或数据库 singleton。Worker 镜像包含 Kernel、Custom SSO 和 OIDC 的依赖闭包；
维护进程使用该固定镜像中的同名 package scripts。连接信息、凭据、bearer、完整 key、Cookie 和原始错误不得写入记录。

下面三个模式必须在三个新进程分别执行；占位 namespace 要替换为部署清单中的精确输入：

```bash
pnpm --filter @iam/worker online-auth:state -- inventory --layout source --kernel-namespace '<source-kernel>' --writers-stopped --drained
pnpm --filter @iam/worker online-auth:state -- apply --layout source --kernel-namespace '<source-kernel>' --writers-stopped --drained
pnpm --filter @iam/worker online-auth:state -- verify --layout source --kernel-namespace '<source-kernel>' --writers-stopped --drained

pnpm --filter @iam/worker online-auth:state -- inventory --layout unified --kernel-namespace '<target-kernel>' --custom-namespace '<target-custom>' --oidc-namespace '<target-oidc>' --writers-stopped --drained
pnpm --filter @iam/worker online-auth:state -- apply --layout unified --kernel-namespace '<target-kernel>' --custom-namespace '<target-custom>' --oidc-namespace '<target-oidc>' --writers-stopped --drained
pnpm --filter @iam/worker online-auth:state -- verify --layout unified --kernel-namespace '<target-kernel>' --custom-namespace '<target-custom>' --oidc-namespace '<target-oidc>' --writers-stopped --drained
```

首次全体重新登录同时完成 source 和 unified gate，清掉旧库存及演练/回退残留；不会把旧对象转为新对象。
`--owner kernel|custom-sso|oidc` 可选择单 owner；默认 all。unified 的单协议 owner 可额外指定 `--client-code`，
只处理该 Client 的协议产物/续接，不终止 Kernel 会话。Kernel 和 source 不接受 Client filter，不能把局部结果当全体 gate。
例：`online-auth:state -- apply --layout unified --owner custom-sso --custom-namespace '<target-custom>' --client-code alpha --writers-stopped --drained`。

完整 verify 的 owner 只接收 SCAN capability，不调用 GET、EVAL、UNLINK、acquisition 或在线 factory；可使用独立 scan-only ACL。
Client scoped verify 必须读取并分类 payload，需相应只读权限。inventory 需要 SCAN/GET/TYPE/ZRANGE，旧 Provider 另需
SCARD/SMEMBERS/SRANDMEMBER；apply 增加 EVAL 和脚本内 GET/TYPE/DEL/ZRANGE/ZREM/SMEMBERS/SISMEMBER/SREM/EXISTS。
连接按实际 Redis 配置保留 AUTH/SELECT/CLIENT/QUIT。完整 verify 不通过 apply 的计数推导结果。

## Deadline、部分作用和非目标保留

所有状态模式要求 `--writers-stopped --drained`。总 deadline 默认五分钟，可用 `--deadline-ms <1..300000>` 收紧；
连接与单命令 timeout 各五秒，不自动重连或离线排队。信号/deadline 断开本次连接并非零退出。
每页最多处理 100 个 key，单次 ZSET/SET 操作最多处理 1000 个成员；大索引先保留未检查部分，apply 只 CAS 移除已确认批次，
非成功报告要求同范围继续重跑，直至新进程完整 verify 为零。Worker 每 owner 最多 100000 页，总 deadline 仍优先限制。
这些预算不建立持久任务、自动成功补发或通用可靠执行器。

退出 2 表示参数无效且未创建连接；退出 1 表示资源/读取/格式/比较/作用/期限未完全确认；只有退出 0 与最终
`status=completed` 同时满足才通过该命令。报告只含版本、模式、布局、固定 owner/原因及计数。
`unknown` 包含无法分类、操作未知及尚未完成的索引批次；`changed` 表示原观察未成功比较；两者均不能计为已清除。
SCAN 可能重复，matching 是观察量，removed 是确认操作数，不是独立登录数量，也不能相减证明残留。

apply 在多个 owner 间不原子；前一 owner 的作用不因后一 owner 失败回滚。提交丢响应、timeout、中断或报告丢失时，
已删除部分可能真实存在，不能把失败理解为零作用。保持停流，用同一固定候选、原精确布局/namespace/scope 从 inventory
重新确认，修复原因后 apply，再另起 verify；不按前次删除计数放流，不扩大为后来创建的 Client 或另一 namespace。
无法识别的真实状态需该 owner 根据受控事实另行修复，不由 CLI 猜测删除；不能用旧无条件 UNLINK 命令绕过失败。

发布前独立保存并比较非目标 owner 的值摘要与绝对 expiry：其他 Client/namespace、Subject Access、Facts、Login Restriction、
短信码/nonce、队列、旧/非本次 Snapshot、PostgreSQL 用户/Client/角色/审计及 Internal 凭据。自然 TTL 消失单列。
报告固定写出 `preservation=requires_independent_baseline_comparison`；零目标不等于已经验证保留集。

## 新 Snapshot 的定向修复与全量恢复

普通提交传播失败使用定向命令；它不重放数据库 mutation，不轮换 Secret，不撤销 UserSession/ClientSession 或协议产物：

```bash
pnpm --filter @iam/worker client-snapshot:repair -- --client-code alpha
```

首次切换或 Redis restore 后，沿原 Snapshot 手册停流、冻结 mutation、排空所有 reader/source load，再分别新进程执行：

```bash
pnpm --filter @iam/worker client-snapshot:repair -- --all --writers-stopped --drained
pnpm --filter @iam/worker client-snapshot:verify -- --all --writers-stopped --drained
```

full repair 只清新 owner 的三个族，独立 scan-only verify 要求完整扫描且 matching=0。targeted 默认十秒，full 默认五分钟，
同样支持收紧 deadline；新输入与退出码规则同上。旧 `client-runtime-snapshot:v1` 和七类退役 Runtime key 不属于新 gate。
普通/敏感缓存共 control，修复后各 reader 按自己的窄 PG source 观察回源，不宣称二者来自同一 PG 时刻。

零库存证据必须早于 smoke。受控 smoke 验证当前 Client 配置/通行、当前 Secret 认证、正式 Admin mutation 后双 reader 失效，
再验证新登录、两协议授权/兑换/UserInfo、Gateway 和 Admin 精确会话管理。若失败，关闭受控入口、排空候选并重做相应 gate。
回退继续固定兼容维护工具，清理目标新状态；不恢复旧登录态、不让旧 Provider 读取新状态、不猜测回写旧 Secret Hash。
放流沿原手册逐控制面独立 read-back；本工具不实施任何这些步骤。

## 首次升级的数据库收缩顺序

最终 migration `20260914173743_confused_mystique` 在独占 Client 表锁内执行门禁，再删除旧八列与三条约束。
未选择新协议、配置来源不符、必需 Secret/id/time 缺失、Secret 仍是旧哈希等状态被拒绝，DDL 不继续。
门禁不能替代批准 manifest 和全量 verify：先保持所有 reader/writer 停止、drain 与备份核验，执行以下固定顺序。

1. 保留旧扩展期工具制品，固定 SHA `aeb2dc45294f3553ad596cda5194e9643378c31b` 及其 lockfile；
   它包含 #192 升级 CLI 和旧列。禁止先用最终 schema 重建它，禁止在运行中的最终 app 内尝试旧升级。
2. 在该固定制品、目标旧 schema 与显式 Worker PostgreSQL 配置下，先 inventory 并批准每个双协议选择和独立 Secret。
   执行 `client-sso:upgrade -- apply --writers-stopped --manifest /controlled/client-upgrade.json`，
   再另起进程 `client-sso:upgrade -- verify --writers-stopped --manifest /controlled/all-clients.json --all`。
   两者均须成功，保留安全摘要和 manifest 身份，不记录明文 Secret。
3. 以最终制品执行真实 Drizzle migration；只在上述核验通过后应用收缩 DDL。旧 CLI 在最终 schema 上失败属于明确版本边界，
   不能改命令绕过或重新加列。线上只保留单协议数据和独立窄 Secret 能力。
4. 执行本页 source/unified 全体清理、新 Snapshot full repair 与独立 verify；核对用户/角色/审计/Internal 凭据及非目标基线。
   然后启动一代 API/Admin/Worker、Gateway，完成新 Cookie 登录、两协议、Admin 与外部 Client smoke 后由发布 owner 放流。

此 DDL 无数据无损自动 down migration。备份须包含业务库、扩展期旧配置和受控 Secret 分发记录；若收缩后需回退，保持停流，
按备份恢复旧 schema/data 与匹配固定旧制品，再清理两代在线状态并重新登录、完整核验，不混跑旧进程与新 schema。
恢复点后的业务写入须由发布 owner 单独处理，不能靠重建空旧列宣称完成回滚。
旧 `subject-projection:rollback` 同样仅服务扩展期旧 schema；最终 schema 下在改变 Profile 或 journal 前拒绝。
需要回退时恢复匹配旧制品/备份，不能删除旧 journal 后在已收缩库中重放旧 migration。
真实 PG 测试证明未迁拒绝及旧 CLI apply/verify→最终 DDL 成功；测试没有执行任何目标环境迁移。

## #162 逐命令去向

| 旧/现有入口 | Spec #178 去向 | 当前调用方与迁移顺序 |
|---|---|---|
| Provider `online-auth:state` | 替代为 Worker 同名入口、显式 source/unified 布局 | 首次全体下线和回退 owner 使用本页命令。旧不解析 payload 的全清不得绕过新未知状态门禁。 |
| Provider `custom-sso:grants` | 旧保留登录态的 #157 窗口退役；本候选由 Worker source 全体流程替代 | Custom 旧 Artifact 在 Kernel、redemption 在 Custom，必须两 owner 全部清零；不把只选 Custom 的结果当旧 Code 清零。旧固定候选的保留流程仍仅适用其原版本。 |
| Provider `client-protocol:artifacts` | 基于旧版本/Binding 的维护用途退役；新协议产物由 Worker unified 单 owner/Client scope 替代 | 日常配置编辑、协议切换、Secret 轮换不调用撤销/清理。明确离线 Client 产物清理使用本页 filter；业务永久撤销使用 Admin 捕获实例能力。 |
| Worker `client-protocol:epochs` | 旧双协议 epoch manifest 退役；首次业务数据改用 `client-sso:upgrade` | #192 的原批准 manifest、全量只读数据 gate 与凭据身份保持；缓存和在线状态另行执行本页流程。 |
| Worker `client-runtime:repair/verify` | 新模型由 `client-snapshot:repair/verify` 替代 | 旧三 reader namespace 工具仅服务固定旧候选恢复；其零报告不能证明新模型。最终候选已删除旧入口。 |
| Worker `client-sso:upgrade` | 保留 | PG-only 业务迁移；固定维护制品须保留扩展期列，不能随 #194 收缩后重建替换。 |
| Worker `user-profile:backfill/repair/verify-*`、`employment:verify`、`audit:actions` | 保留 | 原 owner/资源/运行手册继续适用，不由会话全清或 Snapshot repair 代替。 |

旧生产图在 #193 固定候选中保留；最终 #194 已删除旧 app/scripts，现行保护迁到统一 owner 与正式入口，
不会推迟到 #194。旧 Browser Cookie 由 HTTP 入口按原失效/退出规则删除，并由发布 owner 验证重新登录。
服务端清理不能批量删除所有浏览器的 global_session、协议或旧 Provider Cookie，迟到响应顺序也没有新增保证。

## #121 仍需承担的作用

| 类别 | 当前 owner、重试与可遗忘条件 |
|---|---|
| UserSession/ClientSession 权威终止 | Kernel 的确切实例操作。根终止成功后新 Token 使用因原根检查拒绝，即使漏子索引；已观察在途可完成。失败/未知不能记已终止，Admin 只重试原捕获集合；丢集合则重新查询发起新操作。 |
| 根到子尽力作用 | Kernel/Admin 的固定目标集合；子失败不反转根，后续明确重试保留新实例。原记录 TTL 消失可结束 IAM 存储回收责任，不证明外部退出。 |
| Code/Token/续接/退出状态与索引回收 | 对应协议/Kernel owner。Code 无消费墓碑，Token 原期限固定，终态/索引不因纯回收失败永久取消 TTL。旧 pending/无 TTL 在本页停流 source 清理；新异常残留可显式维护，无通用后台补齐承诺。 |
| Q36 业务 Code 失败撤销 | 两协议操作在请求内对原确切 ClientSession 有界尝试/重试；不重放消费/签发。失败或未知保留真实结果，不创建待自动补齐任务。 |
| Custom 本次 Token 补偿 | Custom 同步比较删除本次已知 Token；removed/missing/unknown 分开。补偿失败残留仍可能可用，只有实际实例终止或自身期限/账号限制才能拒绝；不把 Token 删除计成实例终止。托管不追加业务失败撤销策略。 |
| 账号访问恢复 | Subject Access + User Profile Worker：PG transition intent 回收、Redis transition recovery、Facts 发布与 authority repair。外部调度、重复排空、监控/SLO 仍由原部署 owner 提供；本页清理不能把不确定 Barrier 改成 enabled。 |
| 作用后的审计 | Admin/认证审计 owner；失败不回滚已生效作用，不凭日志重建会话、不为补审计自动重放 mutation。安全告警与人工核对继续承担责任，未交付通用可靠补审计系统。 |
| ORCAS/第三方自有会话 | #145/接入方独立负责真实幂等、查询、期限、替换和精确退出。IAM TTL、撤销或可控替身都不能完成该外部保证。 |

因此 #121 与 #145 保持独立；本票没有完成任务原子登记、可靠领取/确认、崩溃恢复、自动重试执行器或其 SLO。

## 自动化与人工证据

Worker `test-integration/redis/online-state-command.integration.test.ts` 真正启动已发布 scripts 的新进程，使用独立 Redis observer
核对源/目标、pending/无 TTL/无索引/孤立、未知保留、Client scope、scan-only ACL、部分作用重跑、提交后丢响应与 TCP 非响应。
Snapshot 的普通/敏感 reader 同控制修复、Secret/会话/其他 Client 保留和独立 full verify 也通过真实命令验证。
真实旧 Provider 来源证据固定复用 #193 的 `aeb2dc45294f3553ad596cda5194e9643378c31b`：
[实际 adapter writer](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/oidc-provider/test-integration/redis/redis-adapter.integration.test.ts)
使用该 SHA 的 pnpm-lock 锁定 `oidc-provider@9.9.1`（types 9.5.0） 序列化 Session/Interaction/Grant；
[旧正式 HTTP writer](https://github.com/cyy1998/shgas-iam/blob/aeb2dc45294f3553ad596cda5194e9643378c31b/apps/oidc-provider/test-integration/redis/subject-access-authorization.integration.test.ts)
签发 Code/AccessToken，关闭本次 server 后调用 Worker source CLI，覆盖五模型及 `app.web`/`业务系统` 索引。
复现必须在该固定 SHA 的隔离目录安装冻结 lockfile，使用专用 `IAM_OIDC_PROVIDER_TEST_REDIS_URL` 与 `IAM_API_TEST_REDIS_URL`，
运行该 app 的 Redis collection；不能在最终 schema/在线图中重新安装旧 Provider。
这些是历史真实 writer 证据，不冒称最终候选重跑。最终候选 Worker CLI 使用各 owner 内冻结、schema 校验的 source fixture，
覆盖全部五模型/索引、非目标和上述特殊 Client；fixture 是明确构造的离线样本，不声称捕获生产产物。
可控 TCP 代理的响应丢失证明传输失败语义，不称作生产崩溃演练。
测试使用专用 Redis URL、随机 namespace 和准确登记的 fixture；固定全局 owner 写入前先证明库存为空。进程 harness 使用
Windows Job/POSIX process group，所有正常、失败、deadline 路径关闭整棵本次进程树和临时目录，服务/proxy 在 finally 收尾。
canonical collections、typecheck、静态/文档/镜像闭包检查与实际结果见 #193 的固定候选交接，不以收集成功冒充测试通过。
实际环境停流/排空、非目标基线、Cookie、新 Secret/回调配置、consumer 协调、路由/readiness、smoke、回退和放流仍归发布 owner。

Worker 的状态种子与故障变体只调用 Kernel、Custom SSO、OIDC 的公开 `/testing` fixture；当前正常记录通过所属 production
factory/state adapter 写入，历史 source、孤立索引、无 TTL、坏类型/版本及大集合变体的 key/schema/序列化留在相应 owner。
Snapshot keys 与坏 payload 也通过 API Core `/client-snapshot/testing` 提供。Worker 只编排命令、登记精确清理和独立观察；
非目标 namespace 使用不冒充业务状态的 opaque sentinel。旧真实 Provider 测试另覆盖 `app.web`、`业务系统` 的原生 Client
索引及无 TTL 变体，source decoder 使用同一 `ClientCodeSchema`，不把 Client code 收窄为 ASCII 标识符。

source decoder 及其专用 fixture 属于 Kernel/Custom/OIDC 离线维护 owner，2026-10-31 核对适用环境清零及旧备份禁止直接恢复的证据。
条件全部满足后才能另行退役；#194 删除旧在线 factory/app 时须保留这些仍服务真实 source 库存的出口及对应测试证明。

## #155 最终消费者核对

| 原关注点 | 最终 owner 与保留边界 |
|---|---|
| Credential protocol/type/client 重复判断 | Custom Token owner 严格解析并校验用途/Client；Kernel 仅验证两类会话原关系。旧 internal/session 多层 Credential 判断已删除。 |
| 重复 loadAcceptedClient 与已接受 Runtime 重验 | `CustomSso.forOperation` 的 accept 取得一份普通 Snapshot；authenticateToken 把 config 与 access 交给最终交付，不重新 acquisition。Secret 是独立认证观察，不合并到普通 payload。 |
| mode/config version 分支 | 配置 mode/logoutEndpoint/普通版本与旧 Kernel Credential 在线出口已删除；审计仍保留 gateway/independent 历史事件标签，它们不是可配置接入模式。 |
| 纯赋值 try/catch | 旧签发变量赋值异常层随旧编排删除；当前 catch 处理真实存储、外部调用、失败分类或本次 Token 补偿。 |
| 根 UserInfo 独立 Client 校验 | API root authentication 默认消费者仍先接受目标 Client 和 Subject Access，再进行当前披露；不借 Token 路径省略根消费者判断。 |
| 不能删除的作用 | 错误用途/Client 不误撤，暂态保留 Cookie，Code 唯一消费、未知结果、有界原实例撤销、替换 identity 与本次 Token 精确补偿仍由 API HTTP Redis 直接验证。 |

#155/#162 仅在此记录最终实现去向，不关闭来源 issue。内存检查收缩不宣称 Redis/PG 往返或端点性能收益；完整成本另归 #71/#196。
