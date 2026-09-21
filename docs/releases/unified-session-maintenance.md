# 当前会话与 Client Snapshot 维护

Type: runbook
Status: Current
Last verified: 2026-09-21
Next review: 2026-10-31

本页用于当前统一会话布局的离线定向清理和 Client Snapshot 修复。日常会话查询、撤销优先使用
[会话管理](../features/admin/session-management.md)；主体访问与事实恢复见[Profile 维护](user-profile-maintenance.md)。
旧来源升级工具已退役；需要升级时恢复匹配版本工具并按[固定历史手册](https://github.com/cyy1998/shgas-iam/tree/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/releases)
核对实际版本，不套用本页流程。维护命令不负责部署、停流或放流。

## 所有权与明确范围

Worker `online-auth:state` 组合三个 owner 的 inventory、apply 和独立 verify，不启动 HTTP、队列或 PostgreSQL。
命令只接受显式 `--layout unified`，每次操作固定 Redis 实例、DB、namespace、owner 和可选 Client 集合。

| Owner | 当前库存 | 范围边界 |
|---|---|---|
| Kernel | `<kernel-namespace>:unified:v1:` 下的 UserSession、ClientSession、user-id、slot 与所属索引 | 扫描主记录和索引，不依赖管理索引完整；不接受 Client filter。 |
| Custom SSO | `<custom-namespace>:custom-sso:v1:` 下的 Code、Token、token-id、Authentication Continuation | 业务与托管 Token 共 owner；Client 范围保留无法确定归属的孤立对象。 |
| OIDC | `<oidc-namespace>:oidc:v1:` 下的 Code、Access Token、token-id、Authentication Continuation、退出确认 | 全量可处理合法孤立反向索引；Client 范围不猜测 orphan 归属。 |
| Client Snapshot | `client-snapshot:v1:{<clientCode>}:control`、`payload:client`、`payload:credential` | 独立 repair/verify 命令；普通与敏感缓存共 control，定向 repair 同时使双 payload 失效。 |

三个 namespace 必须分别核对 runtime 配置，不能从默认值推测。末尾冒号也是输入字节：factory 输入末尾有冒号时，
后缀前会有两个冒号，维护命令必须使用同一输入。命令不接受任意 Redis pattern。

未知版本、坏 JSON、错类型、非法身份或损坏索引成员会被保留，并使相应 inventory/apply 非成功。
已知 Snapshot 三族内的坏缓存可以清除后回源；未知键族仍保留且不属于该 gate。
在线状态不能按普通坏缓存直接删除，无法识别的记录由其 owner 根据受控事实处理。

## 资源与维护窗口

维护负责人固定当前应用和维护工具的 commit/digest、Redis primary/DB、精确范围及恢复候选，保存非目标基线。
离线状态维护前关闭受影响的登录、协议、Admin 会话操作及直连/自动重试入口，停止相关 reader/writer，
排空所有副本的在途请求、后台及 one-shot 任务。Snapshot 全量恢复还须冻结 Client mutation 与全部 acquisition。
Client Maintenance、零请求量、等待 TTL 和 CLI 参数都不能代替真实停流与排空证据。

通过受控环境注入 `IAM_WORKER_REDIS_HOST`、`IAM_WORKER_REDIS_PORT`、`IAM_WORKER_REDIS_DB`，
按需配置 username/password。同名 Worker scripts 使用 `bun run`，默认读取 `apps/worker/.env`，
已有进程环境变量优先；使用 `IAM_WORKER_*`，不回退数据库 singleton。镜像必须包含所需 owner 的依赖。

在线会话期限使用 Redis 时间。运维负责主节点及可能提升副本的时钟同步、偏差监控与 failover 核验；
时钟异常不能靠修改记录 expiry 或恢复登录态备份补偿。根与 ClientSession TTL、协议 Token TTL 按
[API 配置](../../apps/api/.env.example)和[Kernel 契约](../features/sso/unified-session-kernel.md)核对，
API/Admin API 的对应配置须一致；Token 不延长根期限。

## 库存、清理与独立核验

以下三个命令分别启动新进程，占位 namespace 替换为部署清单的精确值：

```bash
pnpm --filter @iam/worker online-auth:state -- inventory --layout unified --owner all --kernel-namespace '<kernel>' --custom-namespace '<custom>' --oidc-namespace '<oidc>' --writers-stopped --drained
pnpm --filter @iam/worker online-auth:state -- apply --layout unified --owner all --kernel-namespace '<kernel>' --custom-namespace '<custom>' --oidc-namespace '<oidc>' --writers-stopped --drained
pnpm --filter @iam/worker online-auth:state -- verify --layout unified --owner all --kernel-namespace '<kernel>' --custom-namespace '<custom>' --oidc-namespace '<oidc>' --writers-stopped --drained
```

全 owner 清理使该范围全部重新登录，不能用于只需清理单 Client 协议产物的任务。
单 owner 可选 `kernel|custom-sso|oidc`；单协议 owner 可加 `--client-code`，不终止 Kernel 会话：

```bash
pnpm --filter @iam/worker online-auth:state -- inventory --layout unified --owner custom-sso --custom-namespace '<custom>' --client-code alpha --writers-stopped --drained
pnpm --filter @iam/worker online-auth:state -- apply --layout unified --owner custom-sso --custom-namespace '<custom>' --client-code alpha --writers-stopped --drained
pnpm --filter @iam/worker online-auth:state -- verify --layout unified --owner custom-sso --custom-namespace '<custom>' --client-code alpha --writers-stopped --drained
```

仅需 Custom Code/续接时，三个模式都加 `--artifacts authorization`；它只允许
unified/custom-sso/明确 Client，保留 Token、token-id 和两类会话。省略该参数默认为全部协议产物。
各模式必须使用相同范围，局部 verify 不代表全局清零。

全范围 verify 仅使用 SCAN，不调用 GET、EVAL、UNLINK、acquisition 或在线 factory，可使用 scan-only ACL；
Client scoped verify 需读取并分类 payload，须提供相应只读权限。inventory 需 SCAN/GET/TYPE/ZRANGE；
apply 另需 EVAL 及 owner 脚本实际使用的 GET/TYPE/DEL/ZRANGE/ZREM/SMEMBERS/SISMEMBER/SREM/EXISTS。
AUTH/SELECT/CLIENT/QUIT 依连接配置授权，避免以生产高权限账户代替确认工具所需权限。

所有模式要求 `--writers-stopped --drained`。总 deadline 默认五分钟，`--deadline-ms <1..300000>` 可收紧；
连接和单命令 timeout 各五秒，不自动重连或离线排队。每页最多 100 个 key，索引单批最多 1000 个成员，
每 owner 最多 100000 页，总 deadline 优先；未完成批次保留并要求继续确认。信号或 deadline 导致非零退出。

## 部分作用与保留核验

| 结果 | 操作要求 |
|---|---|
| 退出 2 | 参数无效，未创建连接；修正输入后再开始。 |
| 退出 1 | 资源、读取、格式、比较、作用或期限未完全确认，保持停流。 |
| 退出 0 且 `status=completed` | 该命令完成；只有独立完整 verify 零 matching 才证明所选范围无残留。 |
| `unknown` / `changed` / 报告丢失 | 不计为已清除，按原资源和范围重新观察；不得猜测成功或扩大清理范围。 |

apply 跨 owner 不原子，前一 owner 的作用不因后一 owner 失败回滚。提交丢响应、timeout 或中断时可能已删除部分记录。
保持停流，用同一固定候选和原范围重新 inventory，处理原因后 apply，再另起 verify；不恢复已消费 Code 或过期登录状态。
SCAN 可重复，matching 是观察量，removed 是确认操作数，不是独立登录数量，也不能相减证明残留。

维护前后独立比较非目标 owner 的值摘要、对象身份与绝对 expiry：其他 Client/namespace、Subject Access、Facts、
Login Restriction、短信码/nonce、队列、非目标 Snapshot，以及 PostgreSQL 用户、Client、角色、审计与 Internal 凭据。
自然到期单列。报告的 `preservation=requires_independent_baseline_comparison` 不是保留验证结果，
零目标库存也不能替代保留集比较。

## 新 Snapshot 的定向修复与全量恢复

普通提交传播失败使用定向 repair。它不重放数据库 mutation、不轮换 Secret、不撤销会话或协议产物：

```bash
pnpm --filter @iam/worker client-snapshot:repair -- --client-code alpha
```

Redis restore 后或需要全量恢复时，先完成上述停流、冻结 mutation 和 reader/source load 排空，再分别执行：

```bash
pnpm --filter @iam/worker client-snapshot:repair -- --all --writers-stopped --drained
pnpm --filter @iam/worker client-snapshot:verify -- --all --writers-stopped --drained
```

full repair 只清当前 owner 的三族，scan-only verify 要求完整扫描且 matching=0；其他 namespace 不在报告证明范围。
targeted deadline 默认十秒，full 默认五分钟，均可收紧。普通/敏感 reader 修复后各自从窄 PostgreSQL source 回源，
不保证两次回源来自同一数据库时刻。

零库存证据必须早于 reader 回源与 smoke。受控入口核对当前 Client 通行/配置、当前 Secret 认证和 Admin 配置写入后
双 reader 失效，再验证新登录、两协议授权/兑换/UserInfo及精确会话管理。Secret 由
[授权且审计的读取](../features/admin/client-sso-configuration.md)取得，CLI 不输出原文。
smoke 失败时关闭受控入口、排空并重做适用 gate。

## 放流与人工恢复责任

每个入口、部署控制面和相关任务调度都应独立读回实际状态，记录负责人、配置身份、时间和结果。
只有数据 gate、保留核验、readiness 和受控 smoke 全部满足，才逐项放流。
任一开放操作失败、超时或结果未知，立即停止后续开放，关闭已经开放或状态不确定的入口；
独立确认全部相关控制面关闭并排空后，修复原因、重做失效的核验，再开始放流。命令成功不能代替控制面读回。

| 当前责任 | 恢复边界 |
|---|---|
| 精确会话终止 | 失败/未知不记已终止；Admin 只重试原捕获集合，集合丢失则重新查询发起新操作。根已终止不因子作用失败恢复。 |
| 协议产物回收 | 由各协议 owner 维护；实例撤销、Token 删除及外部退出是不同结果。请求内失败作用见 [Custom](../features/sso/custom-sso-contract.md) 与 [OIDC](../features/oidc/oidc-integration.md)，没有通用后台自动补齐承诺。 |
| 账号与主体事实恢复 | 按 [Profile 与 Subject Access 维护](user-profile-maintenance.md)执行；会话清理不能把不确定 Barrier 改为 enabled。 |
| 作用后的审计失败 | 人工告警与核对，不回滚已生效作用，不为补审计自动重放 mutation，见[写入结果契约](../features/admin/admin-mutation-contract.md)。 |
| ORCAS/第三方自有会话 | 外部系统负责查询、幂等、期限和精确退出；IAM 清理不代表第三方本地登录或离线 ID Token 立即失效。 |

恢复应用须使用与当前数据兼容的候选；不得从审计重建登录态或通过恢复登录态备份撤销已经发生的安全作用。
验证入口和证明范围见[命令页](../development/commands.md)及[架构验证归属](../architecture/architecture-verification.md)；
历史测试结果不构成本次环境维护成功的证据。
