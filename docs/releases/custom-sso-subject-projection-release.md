# Custom SSO Subject Projection 硬切换与回滚手册

Type: runbook
Status: Superseded by strict V2 activation
Last verified: 2026-08-21
Next review: n/a

> 本手册记录 V1→初代 Subject Projection 的历史切换流程。其
> `subject-projection:backfill|verify` 及其后继的 Profile 专用 maintenance 命令均已撤销，
> 不得在当前 strict V2 runtime 执行；当前 User Profile 运维只使用版本无关命令。
> 下文 `subject-projection:rollback` 也已退役，仅记录旧版本操作，不是当前可执行命令。

## 适用范围与安全边界

本手册用于把 Custom SSO 从 Legacy User Detail、旧 Custom SSO Client 字段和旧 Redis artifact 硬切换到
Subject Identifier、Client Subject Projection、Subject Facts、Subject Access Barrier 和版本化 Custom SSO
配置。它只描述维护窗口内的人工编排和仓库已有命令，不自动冻结流量、创建备份、部署、修改网关或访问生产环境。

切换是无双读的安全边界：

- 切换后不恢复 Legacy Custom SSO 字段、宽 User Detail payload、Principal Snapshot 或旧 response alias。
- 旧 Principal Session 和 Legacy Custom SSO artifact 的清理不可逆；所有用户都需要重新登录。
- Custom SSO cleanup 不删除 OIDC config、Provider Session、Authorization Code 或 Token。依赖旧 Principal
  Session 的 OIDC artifact 在下一次校验时自然失效，用户重新授权。
- Independent client 在 IAM 外建立的本地 session 不由 IAM cleanup 保证终止；client owner 必须执行自己的会话处置。
- Query Session Token 和 ORCAS transport 的已知风险保持原行为，见“已知后续风险”。

生产执行必须由发布负责人、数据库负责人、Redis 负责人、Gateway/流量负责人、IAM 应用负责人和安全观察员共同在场。
任何角色缺席、证据存储不可用或回滚负责人不明确，都取消本次窗口。

## 不得进入证据的内容

命令输出、日志、指标截图和发布记录只保存计数、耗时、状态、静态 failure code、requestId/traceId 与批准的聚合值。
不得复制或截图以下内容：

- Custom SSO/OIDC Secret 明文或 Hash；
- authorization code、credential、Cookie、Session Token、query Session Token 或完整 Redis key；
- Subject Facts 全文、用户详情、手机号或 ORCAS identity；
- Dirty row 的内部状态、版本或逐用户原始记录；
- manifest 之外的数据库行、Redis value 或备份地址/凭据。

`subject-projection:verify` 的原始失败日志可能含定位 sample。原始日志只留在受限运维系统；发布记录只能抄录
failure code 与 count，不复制 sample。一次性 Secret 输出必须位于仓库外的受限本地路径，保持命令创建的 exclusive
create 与 `0600` 权限，不得提交或粘贴到工单。

## 硬取消条件

下列任一条件出现时，保持流量或写入冻结，停止后续步骤并进入对应回滚边界：

| 阶段 | 取消条件 | 下一安全动作 |
|---|---|---|
| 窗口前 | client inventory 不完整、Independent Secret 未确认、基线或阈值缺失 | 不进入维护窗口 |
| 冻结/备份 | 任一写入口仍可写、PostgreSQL/Redis 备份未完成或隔离恢复验证失败 | 解除前不得运行 backfill |
| backfill | 命令非零退出、Secret 文件冲突、safe cursor 不明确、client blocker 非空 | 保留输出，修复原因后从最后 safe cursor 重跑 |
| verify | report 不是 `passed` 或任一 failure count 非零 | 不运行约束收紧或切流 |
| migration | migration identity/DDL/锁等待异常 | 保持 freeze，按数据库边界回滚 |
| Worker 停止 | 旧 consumer、旧定时任务或旧实例仍能发布 | 不预热、不 cleanup |
| cleanup | dry-run 范围异常、apply 非零、post-cleanup `--verify` 非零、OIDC 计数变化 | 不开放认证流量 |
| smoke | Gateway、Independent、OIDC、账号生命周期任一失败 | 不切流；cleanup 后只能 forward-fix 或兼容回滚 |
| 性能/观测 | `/auth/authz` cache-hit 出现 PostgreSQL 查询、脱敏失败、指标越过预先批准阈值 | 立即关闭新认证流量 |

不得用重试隐藏首次失败。保留首次失败的聚合输出和 requestId/traceId，再诊断根因。

## 窗口前准备

### 1. 固定版本、环境与验收记录

记录待发布 commit、镜像 digest、migration identity、Worker/API/Admin API/OIDC Provider 版本、Gateway manifest
版本、PostgreSQL/Redis 集群标识和维护窗口时间。记录中只写非敏感标识，不写 URL credential。

在与生产拓扑和数据规模近似的专用环境先完成“仓库验证矩阵”及完整窗口演练。外部资源测试只使用调用方提供的专用
URL，禁止 fallback 到 runtime 数据库。普通 PostgreSQL/Redis contract lane 仍只清理自己的随机 schema/key namespace，
禁止 `FLUSHDB`/`FLUSHALL`。Ticket 12 的 API/OIDC `test:integration:composition` 只允许使用非生产、独占、可销毁的数据库和 Redis logical
DB；为真实 production-entry fixture 可 inventory/清理整个专用 logical DB。该豁免不适用于共享/生产 Redis，也不扩大
cleanup 命令的 production allowlist。

### 2. 建立全量 Client manifest

manifest 必须列出数据库中全部“未删除且存在 Legacy Custom SSO intent”的 client，而不是只列当前 enabled row。
每个 client 显式确认：

- `clientCode` 与目标 `targetEnabled`；
- `gateway` 或 `independent` mode；
- 每个 Redirect Pattern；
- Catalog V1 的完整 `subjectClaims`，且包含 `subjectIdentifier`；
- Gateway 的 `orcas.enabled`；
- Independent 的 `callbackEndpoint`、`logoutEndpoint` 和 Secret 交付状态。

manifest 只记录 `pending`、`confirmed` 或 Gateway 的 `not-required`，不得保存 Secret：

```json
{
  "version": 1,
  "cutoverId": "<approved-cutover-id>",
  "clients": [
    {
      "clientCode": "<client-code>",
      "targetEnabled": false,
      "config": {
        "mode": "independent",
        "validRedirectUrls": ["https://client.example.com/callback"],
        "subjectClaimCatalogVersion": 1,
        "subjectClaims": ["subjectIdentifier"],
        "callbackEndpoint": "https://client.example.com/sso/callback",
        "logoutEndpoint": "https://client.example.com/sso/logout"
      },
      "secretDelivery": { "status": "pending" }
    }
  ]
}
```

新 Secret 生成后先保持 client disabled。client owner 在自己的受限渠道确认接收和部署，再把 manifest 状态改为
`confirmed` 并重跑 backfill/verify。任一 enabled Independent client 仍为 `pending` 时取消切换。

### 3. 记录切换前基线和阈值

在相同 client mix、请求率、观察窗口和数据规模下记录：

| 指标 | 切换前 | 窗口后阈值 | 数据源 |
|---|---:|---:|---|
| Subject Facts cache hit ratio | `<value>` | `<approved threshold>` | `subject_facts.operation.observed` |
| Redis p95 | `<ms>` | `<approved threshold>` | `cache-read.durationMs` 与 Redis 平台指标 |
| Profile DB p95 | `<ms>` | `<approved threshold>` | `profile-load.durationMs` 与 PostgreSQL 平台指标 |
| Dirty freshness DB p95 | `<ms>` | `<approved threshold>` | `dirty-load.durationMs` |
| single-flight wait p95 | `<ms>` | `<approved threshold>` | `single-flight-wait.durationMs` |
| Projection Not Ready rate | `<rate>` | `<approved threshold>` | `SUBJECT_PROJECTION_NOT_READY` error count |
| Access Barrier unavailable rate | `<rate>` | `<approved threshold>` | `SUBJECT_ACCESS_UNAVAILABLE` error count |
| Subject Access repair backlog | `<count/age>` | `<approved threshold>` | Worker repair completion logs |

没有预先批准的比较窗口或阈值时不得在故障后临时放宽。`/auth/authz` 的 cache-hit PostgreSQL 查询数是固定硬门禁
`0`，不是可调阈值。

### 4. 在 freeze 前完成可变 canary 演练并复位

Client 配置、Secret、Profile、账号状态和授权事实的 mutation smoke 必须在维护窗口 freeze 前，使用隔离的专用
client/user 完成。至少演练：Gateway config version 失效、Independent Secret 轮换与启停、OIDC Snapshot 前后 Profile
变化，以及账号禁用、Barrier unavailable、重新启用和 repair 收敛。不得把真实用户作为 canary。

演练完成后必须执行复位门禁：恢复 manifest 的批准目标状态，撤销 canary Session/Grant/Credential，发布最终 Profile/Facts，
清空或有界收敛 canary repair backlog，并重跑 backfill 与独立 verify。记录以下只含聚合值的 fixture inventory，供 freeze
后的只读验证使用：

- 旧 config version 下签发且预期失效的 Gateway Local Session；
- Secret/config 轮换前后各一份预期结果已知的 Independent canary；
- Profile 变化前签发的 OIDC Code/Snapshot 与变化后的当前事实；
- 已禁用、Barrier unavailable、已重新启用三类生命周期 canary，以及预置的有界 repair 项。

复位后仍有未批准 Client/身份事实、未收敛 repair 或正在执行的 mutation 时，不得进入 Phase A。Phase A 开始后若发现
还需要修改 Client config、Secret、Profile、账号或授权事实，取消本次窗口并回到本节重新演练；不得在 freeze 中临时
豁免写入。

## 维护窗口执行顺序

### Phase A — 冻结 Client 与身份事实写入

1. 冻结 Client create/update/delete、Custom SSO/OIDC 配置 mutation 和全局 Client 状态 mutation。
2. 冻结用户、任职、组织、岗位、角色、权限与 role-assignment 写入，以及会推进 User Profile Dirty Version 的其他入口。
3. 观察审计与入口指标，证明冻结后没有成功写入；只关闭 UI 不算冻结。
4. 旧认证读流量此时可以继续，但不得开始 cleanup。记录 freeze start/end 与负责人，不记录请求内容。

冻结不完整立即取消。整个 backfill、verify、普通唯一索引创建和数据库 rollback 期间保持 freeze。

### Phase B — 备份 PostgreSQL 与 Redis operational data

1. 创建一致 PostgreSQL 备份，覆盖 user/client/profile/dirty、migration journal 和审计所需表。
2. 创建需要保留的 Redis operational data 备份或隔离副本，至少覆盖当前 Session Kernel、Subject Access、Subject
   Facts 和 OIDC operational namespaces。
3. 在隔离资源验证两份备份可读取/恢复，并记录备份任务 ID、完成时间、校验结果和保留策略。
4. Redis 备份只用于灾难恢复与取证；不得在 cleanup 后把旧宽 session/artifact 恢复进活动集群。

备份或隔离恢复验证失败立即取消。

### Phase C — 运行 Client/User/Profile/Facts/Barrier backfill

首次运行使用一个从未存在的仓库外 Secret 输出路径：

```bash
pnpm --filter @iam/worker subject-projection:backfill -- --manifest <manifest-path> --secret-output <new-secret-output-path> --batch-size <positive-integer> --after-user-id 0
```

命令失败时，从结构化日志取得最后一个 `safeAfterUserId`，修复原因后使用新的 exclusive Secret 输出路径恢复：

```bash
pnpm --filter @iam/worker subject-projection:backfill -- --manifest <manifest-path> --secret-output <new-secret-output-path> --batch-size <positive-integer> --after-user-id <last-safe-cursor>
```

不得覆盖或复用已创建的 Secret 文件。若数据库 apply 失败但文件已生成，保留该文件用于受限审计；确认该 Secret 未生效
后按凭据处置流程销毁，并用新路径重跑。backfill 必须覆盖启用、禁用和软删除账号，并原子发布 Profile/Dirty、预热
Subject Facts 与 Subject Access Barrier。

### Phase D — 独立 verify 与约束收紧

每次 backfill 完成和每次 manifest 确认更新后都运行独立只读 gate：

```bash
pnpm --filter @iam/worker subject-projection:verify -- --manifest <manifest-path> --batch-size <positive-integer>
```

只有进程退出 `0`、report 为 `passed`、failure 列表为空，且 users/profiles/verifiedUsers 计数符合批准 inventory 时才继续。
verify 必须同时证明 Subject 非空/唯一、Profile/Facts schema、source/Dirty version、processed、Barrier 覆盖和状态、Client
配置、目标 enabled state 与 Independent Secret readiness。发布记录只保存 counts 和 failure code/count。

保持 freeze，使用 migration 正式入口收紧 schema；禁止 `db:push`：

```bash
pnpm --filter @iam/db db:migrate
```

普通 Subject Identifier 唯一索引会等待 writer，因此 migration 期间不得开放 user/client writer。migration 完成后重跑
`subject-projection:verify`；任一失败不继续。

### Phase E — 停止旧 Worker，并再次预热

1. 停止全部旧 Worker consumer、外部 scheduler 和旧版本 repair/backfill 命令。
2. 确认旧进程退出、queue 中没有仍由旧版本持有的 active job、没有旧版本发布日志。
3. 使用新 Worker command composition 从 `--after-user-id 0` 幂等重跑 backfill；没有新 Secret 时可以省略
   `--secret-output`。若仍可能生成 Secret，必须使用新 exclusive 路径。
4. 再次运行独立 verify。此轮通过才证明停止旧 publisher 后 Facts/Barrier 仍完整。
5. 启动新 Worker，但暂不开放认证流量；确认 health/readiness 与 repair 命令可用。

旧 Worker 仍存活或最终 verify 失败时取消切换。

### Phase F — 停止认证流量并清理 Legacy Custom SSO artifact

停止 login、authorize、callback、token、UserInfo、authz、logout、session refresh/renewal 和 Gateway 转发认证流量，
确认所有入口都已 drain。只停止浏览器流量而遗漏服务端 token/authz 不算完成。

专用 cleanup profile 固定只扫描以下 Legacy Custom SSO 范围：旧 `global_session:*` Principal Session、
`auth_code:*`、`local_*_session:*`、`local_session_reverse:*`、`local_session_set:*` 和
`custom-sso:local-session-payload:*`。它拒绝外部 pattern 和 profile override，不扫描 `oidc:*`。

先执行 dry-run，只审查 pattern/count 聚合：

```bash
pnpm --filter @iam/api-core session:cleanup-custom-sso-cutover -- --dry-run --batch-size 500
```

若 matched 总数为 `0`，记录 no-op 并直接运行 clean verify。若存在匹配，`--verify` 必须先以非零退出阻断切流，证明
门禁确实能看到残留：

```bash
pnpm --filter @iam/api-core session:cleanup-custom-sso-cutover -- --verify --batch-size 500
```

安全观察员确认 dry-run 只有内建 Custom SSO profile 后，显式 apply：

```bash
pnpm --filter @iam/api-core session:cleanup-custom-sso-cutover -- --apply --batch-size 500
```

随后必须以退出 `0` 的 verify 收尾：

```bash
pnpm --filter @iam/api-core session:cleanup-custom-sso-cutover -- --verify --batch-size 500
```

再重复一次 apply 与 clean verify；第二次 deleted 和 residual 必须均为 `0`，证明幂等。对比 cleanup 前后的 OIDC
config/Provider artifact 与当前 Session 聚合计数；它们必须不变。不要为证明保留而输出完整 key。

在 cleanup 前后都使用当前 production entry 尝试 legacy-shaped Principal Session token、grant code 与 Local Session；
authorize 不得签发新 grant，callback、UserInfo 与 authz 必须拒绝，并证明 entry 未读取上述六类 legacy key。旧 artifact
失效由 Ticket 11 后当前 runtime 删除旧 owner 并 fail closed 保证；cleanup 只清理 inventory，不承担认证失效。不得启动
历史版本、历史 adapter 或手写 parser 来制造“cleanup 前成功”，也不得把真实 token 写进命令行、日志或证据。

### Phase G — 内部直连执行四类 smoke

所有 smoke 使用专用测试 client/user、一次性浏览器上下文和受控 Redirect。证据只记录请求 ID、状态、契约摘要和计数。
本阶段不得修改 Client config/Secret、Profile、账号状态或授权事实；只允许创建和消费新 Session/Grant/Code 等认证
operational artifact，以及处理窗口前预置的有界 repair 项。以下涉及版本、Secret、Profile 或账号状态变化的断言都必须
消费“窗口前准备”第 4 节留下的 fixture，而不是现场 mutation。

#### Gateway smoke

1. 从 `/sso/authorize` 登录，完成 Gateway callback，取得新的 Gateway Local Session。
2. `/public/user-info` 只返回当前 client 的 Custom SSO V1 projection，不含数据库 ID、其他 client 授权或 ORCAS。
3. `/auth/authz` 的 body `data` 与 `X-User-Info` 完全相同；Base64 JSON 只含 Subject Identifier 和已选 username/name。
4. ORCAS disabled 与 enabled 两种专用 client 都验证 Cookie/query/endpoint 仍工作，但 ORCAS identity 不进入 projection/header。
5. 使用 freeze 前保留的旧 config-version Local Session 验证 401；使用已复位到批准版本的同一 client 新登录成功，不在
   窗口内推进 config version。
6. 使用 freeze 前预置且 inventory 已记录的未就绪 Subject 验证 `SUBJECT_PROJECTION_NOT_READY`、`Retry-After`、Grant
   可重试和不清有效 Cookie；不得现场删除 Profile/Facts。

#### Independent smoke

1. 验证 Redirect Pattern 后发起 authorize；opaque `state` 原样返回且不出现在普通日志。
2. 业务后端只用 `POST /sso/token`、HTTP Basic 和 form `code + redirect_uri` 兑换；GET、query Secret、JSON 和浏览器
   preflight 必须拒绝。
3. 响应只含 opaque `sid`、TTL 和 client-scoped `subject`，不含 `userInfo`、数据库 ID 或跨 client 授权。
4. 同一 Grant 首次成功后重放必须拒绝；并发兑换最多一个赢家。
5. 使用 freeze 前完成 Secret 轮换/启停后保留的 canary：旧 Secret/credential 拒绝，新 Secret 可用，且两个版本号符合
   inventory；不得在窗口内轮换 Secret 或启停 client。
6. IAM logout 后再验证 client 自有本地 session 已由 client owner 独立清理，不把该保证归给 IAM。

#### OIDC smoke

1. 验证 Discovery/JWKS、authorize、token、UserInfo、code replay 和 logout。
2. 同一测试账号的新 `sub` 等于窗口前记录的 Subject Identifier；`profile` 不含任职。
3. `iam:employments` 与 `iam:authorization` 只出现在 UserInfo；Authorization Code 前生成 Snapshot。
4. 重放 freeze 前在 Profile 变化前签发的 Code/Snapshot，Token/UserInfo 仍返回原 Snapshot；新的 authorization 返回已
   复位并 verify 的当前事实，不在窗口内改变 Profile。
5. 修改 Custom SSO config、Secret 或 session 不改变 OIDC config、Secret、wire 或新 OIDC authorization；cleanup
   前后的当前 OIDC artifact 保持可用，其余 OIDC artifact 的有效性只由当前 OIDC/Principal Session 绑定规则决定。

#### 账号生命周期 smoke

1. 使用 freeze 前已禁用 canary 的旧 session 验证 `401 / SESSION_INVALID`，并按原创建路径清 Cookie；不在窗口内禁用账号。
2. 使用 freeze 前预置的 `blocking`/unavailable Barrier canary，验证 `503 / SUBJECT_ACCESS_UNAVAILABLE` 且不清 Cookie；
   不现场改账号或授权事实。
3. 使用 freeze 前已完成重新启用、Facts 发布和 verify 的 canary，证明禁用前 Session 仍无效，只有新登录 Session 可用；
   “Facts 发布前仍不可访问”的 mutation 序列以窗口前证据为准。
4. 运行只处理窗口前预置项的有界 repair，观察 transition reaper、transition recovery 和 authority repair 完成日志；
   backlog 不得单调增长，也不得为 smoke 人工改生产账号。
5. 原禁用前 Session、Grant、Credential 和 Local Session 在 re-enable 后仍无效。

任一 smoke 失败都保持认证流量关闭。不得恢复旧 payload 或旧 owner 绕过当前 runtime 的 fail-closed 边界。

### Phase H — 性能与观测验收

`subject_facts.operation.observed` 只允许 `operation`、`outcome`、`durationMs`：

- `cache-read` 的 `hit/miss/invalid` 计算 cache hit ratio 和 Redis latency；
- `profile-load` 的 `ready/not-ready/error` 计算窄 `user_profile` 查询 p95；
- `dirty-load` 计算授权 freshness 小查询 p95；
- `single-flight-wait` 计算并发 miss 的等待 p95；
- `authorization-freshness` 的 `fresh/refreshed/not-ready/error` 解释严格授权结果。

这些事件不得含 Subject Identifier、Subject Facts、Dirty Version、Secret、Token 或 Redis key。Projection Not Ready 和
Access unavailable rate 使用稳定 API error code 聚合；repair backlog 使用 Worker 已有 completed 日志字段。

以与基线相同的请求 mix 和观察窗口重复测量并填写：

| 指标 | 切换前 | 切换后 | 阈值 | 结果 |
|---|---:|---:|---:|---|
| cache hit ratio | `<value>` | `<value>` | `<approved>` | 通过/失败 |
| Redis p95 | `<ms>` | `<ms>` | `<approved>` | 通过/失败 |
| Profile DB p95 | `<ms>` | `<ms>` | `<approved>` | 通过/失败 |
| Dirty DB p95 | `<ms>` | `<ms>` | `<approved>` | 通过/失败 |
| single-flight wait p95 | `<ms>` | `<ms>` | `<approved>` | 通过/失败 |
| Projection Not Ready rate | `<rate>` | `<rate>` | `<approved>` | 通过/失败 |
| Access unavailable rate | `<rate>` | `<rate>` | `<approved>` | 通过/失败 |
| repair backlog count/oldest age | `<value>` | `<value>` | `<approved>` | 通过/失败 |

`/auth/authz` cache-hit 零 PostgreSQL 需要两份证据：

1. 自动化 production-entry smoke 在 PostgreSQL 明确不可达时，预置 Session/Client/Facts Redis cache，公开 authz 仍成功；
2. 受控负载窗口对比 PostgreSQL statement/query counter，cache-hit 请求的增量必须为 `0`，且观测只有 Redis
   `cache-read/hit`，没有 `profile-load` 或 `dirty-load`。

普通 claim cache miss 最多一次窄 Profile load；严格 authorization cache hit 允许一次 Dirty load，facts 落后时额外
最多一次 Profile load。任何源表 join、Legacy detail fallback 或多次击穿都失败。

### Phase I — 切换认证流量并解除冻结

1. 确认最终 verify、cleanup verify、四类 smoke、零 PostgreSQL 和脱敏检查全部通过。
2. 切换 API/OIDC/Gateway 认证流量到新版本；不要同时改变无关路由、阈值或容量配置。
3. 先保持 Client/身份写入冻结，观察预先批准的稳定窗口。
4. 指标、error rate 和 repair backlog 在阈值内后，再解除 Client 与用户/任职/授权写入冻结。
5. 解除后重跑一个只读 `subject-projection:verify`；失败则重新冻结写入并关闭新认证流量。

## 回滚边界

### cleanup 之前

- backfill/verify 失败：保持旧认证流量，不切换；修复后从 safe cursor 重跑。
- 约束收紧 migration 已应用但尚未 cleanup：停止认证流量和所有 user/client writer，使用显式 rollback：

```bash
pnpm --filter @iam/db subject-projection:rollback
```

该命令只在 migration name、folder timestamp 与本地 SHA-256 journal identity 完全匹配时，在同一 transaction 中补偿
本次 tightening DDL 与精确 journal row。identity 不一致时 fail closed，不得手工删除 journal。

### cleanup 之后

1. 立即停止全部认证和身份写流量；保留首次失败证据。
2. 不恢复 Legacy Custom SSO 字段、User Detail payload、Principal Snapshot 或旧 Redis artifact；Redis 备份不能用于
   重新开放这些 artifact。
3. 数据库若需放宽，仍先运行上述 identity-bound rollback。应用只能回滚到理解新配置且不依赖旧 payload 的兼容版本；
   不存在安全兼容版本时保持流量关闭并 forward-fix。
4. 已清理 Session、Grant、Credential 和 Local Session 不可恢复；回滚后强制所有用户重新登录，Independent client
   自行清理本地 session。
5. OIDC config 与 Provider artifact 不主动删除；重新开放前重跑 Custom SSO、OIDC 和账号生命周期 smoke。

raw-SQL rehearsal 没有 Drizzle journal row 时，只能在隔离 rehearsal schema 中运行 migration 目录的幂等
`rollback.sql`；生产 Drizzle-migrated database 使用 package rollback command。

## 已知后续风险

- Query Session Token（`T12-RISK-QST-01`）：Custom SSO 仍保留现有 query token 的接收、传递、相关日志/响应头行为。
  新 client 不得使用；发布证据不得包含带 token 的 URL。统一治理属于后续安全工作，本 feature 未修复该风险。Owner：
  IAM API owner；目标日期：2026-09-30；跟踪位置：[Ticket 12 known-risk follow-up registry](../../.scratch/archived/custom-sso-subject-projection/delivery.md#ticket-12-known-risk-follow-up-registry)。
- ORCAS transport（`T12-RISK-ORCAS-01`）：ORCAS 专用 Cookie、query、endpoint 和外部 session 语义保持不变。此次只证明
  ORCAS identity 不进入 Subject Facts、Client Subject Projection 或 Gateway Subject Header；本 feature 未修复
  Cookie/query transport 风险。Owner：IAM + ORCAS integration owner；目标日期：2026-10-31；跟踪位置：
  [Ticket 12 known-risk follow-up registry](../../.scratch/archived/custom-sso-subject-projection/delivery.md#ticket-12-known-risk-follow-up-registry)。

风险必须进入发布记录的 follow-up 区，写 owner、目标日期和跟踪位置；不得因为“行为保持不变”从验收中删除。

## 仓库验证矩阵

候选 commit 的环境无关基线、显式外部 lane、package-local process smoke 和静态检查统一维护在
[构建、测试与开发命令](../development/commands.md)；本 runbook 不复制第二份命令矩阵。

Ticket 12 的最终验收由维护者或 agent 在专用临时 PostgreSQL/Redis 与近似规模数据上，按本手册组合现有公开接口、package
命令和 process smoke 手动走完 canary/reset、freeze、备份恢复、backfill/verify/prewarm、cleanup、四类 smoke、性能与
rollback。外部 lane 缺少专用资源时必须 fail fast，不能 silent skip，也不能把失败写成通过。验收后确认 owner
container/temp 精确清理为零，并在
[Custom SSO Subject Projection 合成切换演练记录](custom-sso-subject-projection-rehearsal-2026-08-02.md)
记录候选 commit、实际命令、聚合计数/延迟、通过/失败与资源清理结果。

本 Ticket 不要求或提交根级一键 orchestrator、JSONL receipt、机器 evidence manifest/transcript 或自动 phase 状态机；
Client cutover manifest 与一次性 Secret 交付文件仍是 production backfill 命令的业务输入，不属于上述机器验收产物。

## 验收记录模板

| Gate | 结果 | 非敏感证据摘要 |
|---|---|---|
| freeze | 通过/失败 | 入口、开始/结束、零成功写入计数 |
| PostgreSQL backup | 通过/失败 | 任务 ID、完成时间、隔离 restore 校验 |
| Redis backup | 通过/失败 | 任务 ID、完成时间、隔离 restore 校验 |
| client manifest | 通过/失败 | inventory 总数、Gateway/Independent 数、pending 数 |
| backfill | 通过/失败 | batch/scanned/rebuilt/reused、最后 safe cursor |
| verify | 通过/失败 | users/profiles/verifiedUsers、failure code/count |
| migration | 通过/失败 | migration identity、锁等待摘要 |
| Worker stop/prewarm | 通过/失败 | 旧实例数、新实例 readiness、最终 verify |
| cleanup | 通过/失败 | dry-run/blocking verify/apply/clean verify、重复 apply/verify 零删除零残留、OIDC/current Session 聚合不变 |
| Gateway smoke | 通过/失败 | requestId/traceId、契约摘要 |
| Independent smoke | 通过/失败 | requestId/traceId、契约摘要 |
| OIDC smoke | 通过/失败 | requestId/traceId、`sub` 相等、Snapshot replay 摘要 |
| lifecycle smoke | 通过/失败 | 401/503/Cookie/repair 聚合 |
| performance | 通过/失败 | 基线/切换后/阈值表，authz PostgreSQL `0` |
| redaction | 通过/失败 | scanner 结果计数，不附原文 |
| rollback drill | 通过/失败 | 停流、identity-bound rollback、重新登录边界 |
| known risks | 已记录/缺失 | Query Session Token/ORCAS owner、日期、跟踪位置 |

任何一行失败或缺失都不能把发布记录标为通过。
