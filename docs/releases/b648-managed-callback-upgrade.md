# b648 到托管 origin 回调的跨代升级

本手册适用于精确来源 `b6481f2de5c2930fc381d99e70520e0783091e9d`，在一个维护窗口完成离线阶段，
最后只启动最新 API/Admin API/Worker/Admin/SSO/Gateway。全部 IAM 用户重新登录，不转换旧登录态。
已经采用统一会话及双 issuer 的来源使用[同代保留手册](managed-callback-origin-preserving-upgrade.md)，不能执行本页全清。
数据库阶段已由 #205 验收，#206 的真实 b648 writer 到最新 API 演练已运行；正式完整系统与最终候选结果见
[验收账本](../features/sso/managed-callback-origin-acceptance.md)。本页不表示目标环境已操作。

## 固定制品、资源和停止写入

发布负责人保存源/目标/回退制品完整 SHA、镜像 digest、lockfile 身份和各离线工具版本；记录 PostgreSQL 实例、业务
schema/search_path、真实 journal schema，Redis primary/逻辑 DB、旧 Kernel namespace 及三个目标 namespace。
连接凭据放受控配置，记录中只保存不含认证信息的资源身份。备份包含业务库、journal、Client/Role 和原配置；
恢复演练需证明备份与旧制品匹配。另保存用户、审计、Internal 凭据、Subject Facts、限制、队列和非目标 namespace 的
独立值摘要与绝对期限；自然到期单独计数，不将 TTL 倒计时当作误改或重置。

关闭登录、两协议、Admin 会话作用以及直连/重试入口，冻结配置和业务写入，停止并排空所有副本、旧 Provider、后台
及 one-shot reader/writer。Snapshot 还要求排空 acquisition。Client Maintenance、零请求量或 `--writers-stopped --drained`
只表达操作条件，不能代替实际控制面 read-back 和排空证据。此后在全部门禁完成前只运行离线维护进程。

状态命令显式注入 `IAM_WORKER_REDIS_HOST`、`IAM_WORKER_REDIS_PORT`、`IAM_WORKER_REDIS_DB` 及适用的
`IAM_WORKER_REDIS_USERNAME`/`IAM_WORKER_REDIS_PASSWORD`。数据库一次性脚本使用显式 `DATABASE_URL`，以 `--no-env-file` 禁用 dotenv；
不要把测试 URL 当部署输入。状态维护命令仍读取 Worker `.env`，显式进程变量优先，执行前核对有效资源。日志禁止记录 Secret、JWK 私钥、Cookie、bearer、完整 Redis key、原始配置
及含认证信息的 URL；安全报告保存阶段、版本、计数、退出码和 receipt 身份，原始调试材料限制访问。

## 数据库链：先转换再收缩

完整命令、manifest、receipt 及失败恢复点以[数据库离线直升手册](b648-client-database-upgrade.md)为准，
按其顺序执行全部步骤：

所有数据库阶段均通过 `bun --cwd apps/worker --no-env-file scripts/b648-upgrade/index.ts <阶段> --writers-stopped` 执行。

1. `preflight` 核对精确源 schema/journal、默认值/序列/约束、来源格式和 1000 Client 上限。
2. `expand` 只迁到 `20260914061007_romantic_maestro`；`prepare` 安装离线过渡 CHECK；`inventory` 生成全量清单依据。
3. 批准原 manifest：双协议明确选择，保存 sourceDigest 和 credentialId，不接受 gatewayCallback。
4. `apply` 后独立进程 `verify`；`contract` 使用原 manifest/receipt，在锁内再次独立全量核验后才原样收缩及登记历史 DDL。
5. `finalize` → 独立 `verify-final`，均提供原 manifest/receipt。脚本内部完成最终配置和 DDL；
   不调用普通 `db:migrate`。所有阶段声明停写，自定义 journal schema 全程一致。

不能直接对非空 b648 库运行全量最新 DDL，不能修改历史 SQL/journal 或用预期失败作为截止点。
Gateway 的 `.invalid` 中间地址只满足离线 CHECK，最终必须删除；最新 managed 不保存 callbackEndpoint。
Independent 明确为 business 并保留原地址，即使 pathname 为 /sso/callback。最终核验成功前不启动最新 reader。

Independent 和 confidential OIDC 生成新 SSO Secret，原 manifest 重跑保持 Secret、credential ID 和生成时间。
发布负责人通过既有受控管理渠道取得并分发新 Secret，接入方登记切换和兑换 smoke 结果；迁移 CLI 不输出原文，
不能从旧 hash 恢复原 Secret。Gateway/public 不新增 Secret，Internal API 凭据保持独立。分发未完成不放流；
如果分发已发生又需回退，接入方回切也是恢复计划的一部分。

## source 全 owner 与适用目标全 owner

先核对实际布局。b648 Custom Code 和 Token 分别属于旧 Kernel Artifact/Credential，Custom redemption 另有 owner，
旧 Provider 包含 Session/Interaction/Grant/AuthorizationCode/AccessToken 及其索引。source all 必须同时覆盖三者。
b648 Custom 没有当前统一 continuation 记录；其续接是原 query 加 root Cookie 的 login guard。清理旧根后还要直接验证
最新入口不能凭该旧 Cookie 恢复登录，不能把它写成删除不存在的 Custom continuation；Provider Interaction 则实际清理。
精确 b648 的 redemption writer 已退役，仅保留删除接口；实际 HTTP 演练该 owner 库存为零。
仍执行它的完整 source gate，以便恢复库存不能绕过检查；不手工伪造旧 writer 来制造非零计数。

以下每行各启新进程，namespace 占位符必须替换为已核验的真实输入。若 owner 分布在不同 Redis DB，分别固定
有效资源并运行对应 owner，保存每个 owner 的完整 gate，不以一个 DB 的 all 报告代表所有 DB。

```powershell
pnpm --filter @iam/worker online-auth:state -- inventory --layout source --owner all --kernel-namespace '<source-kernel>' --writers-stopped --drained
pnpm --filter @iam/worker online-auth:state -- apply --layout source --owner all --kernel-namespace '<source-kernel>' --writers-stopped --drained
pnpm --filter @iam/worker online-auth:state -- verify --layout source --owner all --kernel-namespace '<source-kernel>' --writers-stopped --drained

pnpm --filter @iam/worker online-auth:state -- inventory --layout unified --owner all --kernel-namespace '<target-kernel>' --custom-namespace '<target-custom>' --oidc-namespace '<target-oidc>' --writers-stopped --drained
pnpm --filter @iam/worker online-auth:state -- apply --layout unified --owner all --kernel-namespace '<target-kernel>' --custom-namespace '<target-custom>' --oidc-namespace '<target-oidc>' --writers-stopped --drained
pnpm --filter @iam/worker online-auth:state -- verify --layout unified --owner all --kernel-namespace '<target-kernel>' --custom-namespace '<target-custom>' --oidc-namespace '<target-oidc>' --writers-stopped --drained
```

source 的 Custom/Provider 族固定，不传 custom/oidc namespace。目标三个 namespace 按真实 factory 输入逐一记录，
包括末尾冒号，不能猜默认值。b648 本身没有 unified writer；目标 gate 核验/处理最新布局的演练或恢复残留，
纯 b648 不机械追加 `5c6707efbf2069649f2c3ea4396bffbd28dcab96` 的无 issuer unified 工具。
若库存表明存在中间部署/恢复的旧 unified 布局，先固定匹配工具及该布局操作范围，再执行对应清理与独立核验；
最新 decoder 不负责猜测旧格式。不支持或不能确认的来源保持停流并调查。

每次命令须同时退出 0、报告 `status=completed`；apply 删除计数不证明零库存，之后另起 verify 才是门禁。
未知版本、坏类型/身份冲突、不能归属、未完成批次均保留并阻断成功；不得 FLUSHDB/FLUSHALL 或直接删 key 绕过。
deadline、分页、CAS、ACL 和退出语义见[统一维护手册](unified-session-maintenance.md)。跨 owner apply 不原子，
失败、timeout、丢响应不表示零作用；保持原制品/资源/范围，重新 inventory，修复后 apply，再独立 verify。
不要扩大为其他 namespace，或以失败前的删除数量推算成功。

## Snapshot、最新运行图和接入配置

在所有 writer/reader 仍停止时运行：

```powershell
pnpm --filter @iam/worker client-snapshot:repair -- --all --writers-stopped --drained
pnpm --filter @iam/worker client-snapshot:verify -- --all --writers-stopped --drained
```

full repair 仅清当前 owner 的三个缓存族，独立 verify 要求零库存；它不预建全部 payload。
保存零库存证据后才启动一代最新服务并让普通/敏感 reader 回源。旧独立 Provider 退出运行图，OIDC 路由转 API。
Gateway 的变更按 [APISIX 发布手册](apisix-gateway-release.md)完成 validate/diff/apply/read-back，
OIDC 输入和路由按 [OIDC 手册](oidc-release-runbook.md)核验；不能只凭 health 200 判断切换完成。

| 输入 | 必须核对的当前配置 |
|---|---|
| API 两入口 | `IAM_API_SSO_INTERNAL_ORIGIN`、`IAM_API_SSO_EXTERNAL_ORIGIN`，规范化 origin 对应正确 issuer；同 origin 合并，不同入口不能交叉兑换。 |
| 登录入口 | `IAM_API_LOGIN_ENDPOINT` 是安全根相对路径，Admin/SSO 与目标入口同步。 |
| OIDC 密钥 | 受控沿用 `IAM_API_OIDC_CURRENT_JWK_JSON` 和适用 `IAM_API_OIDC_PREVIOUS_JWK_JSON`；Client Secret 换新不自动轮换 JWK。旧 Provider issuer/Cookie keys 不继续充当 API 输入。 |
| Kernel | `IAM_API_SESSION_KERNEL_NAMESPACE` 与 `IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE` 指向同一实际 namespace，维护命令使用同一输入。 |
| 根/应用期限 | API 的 `IAM_API_USER_SESSION_TTL_SECONDS`、`IAM_API_CLIENT_SESSION_TTL_SECONDS` 分别与 Admin API 的同名 `IAM_ADMIN_API_*` 对齐；旧 idle/absolute/tombstone 配置退役。 |
| 协议期限 | `IAM_API_CUSTOM_SSO_TOKEN_TTL_SECONDS`；OIDC 的 `IAM_API_OIDC_AUTHORIZATION_CODE_TTL_SECONDS`、`IAM_API_OIDC_CONTINUATION_TTL_SECONDS`、`IAM_API_OIDC_TOKEN_TTL_SECONDS`、`IAM_API_OIDC_LOGOUT_CONFIRMATION_TTL_SECONDS`。 |
| OIDC 存储及代理 | `IAM_API_OIDC_NAMESPACE`、`IAM_API_OIDC_TRUST_PROXY`、`IAM_API_OIDC_COOKIE_SECURE` 与实际部署一致；逐一核对内外网入口、未知 Host 和伪造入口 header 不形成旁路。 |
| 业务回调代理 | 每个允许业务 origin 的根 `/sso/callback` 代理到 IAM；允许 Host rewrite，不新增可信外部 origin 参数或 HTTP origin 验证。 |

对各 origin 使用两个不同 hostname 的真实浏览器核验，不以两个端口代替主机隔离。
host-only Cookie 属于浏览器实际访问回调的主机，IAM 不跨域同步 Cookie；完整业务落地 path/query 和原 state 保持。
business 继续使用登记地址并以新 Secret 兑换。运行图还须核对数据库、Redis DB 和 Custom namespace 的实际装配值，
不能创造不存在的环境变量代替装配事实；其余必需 API/Admin/Worker 配置沿最终 `.env.example` 和部署模板完整核验。

## 受控 smoke、失败恢复与人工放流

受控入口先证明旧 root Cookie、两协议旧 Code/Token、Provider Interaction 无法恢复访问，再验证新 managed、business、
OIDC 登录/兑换/UserInfo、Admin 配置和会话管理、双入口 issuer、Gateway 与两 hostname Cookie/最终落地。
服务器清理不保证删除浏览器中所有旧 Cookie，也不宣称第三方本地会话或自行离线验签的 Token 立即失效。
同时独立比较非目标业务库/Redis 摘要和绝对期限，将自然到期与实际变化分开；零目标库存不等于保留集已核对。

任一 smoke 失败立即关闭受控入口并排空候选，确认已经产生的新状态后重做适用 gate。数据库中断按数据库手册保留
原 manifest/receipt 和当前 journal 恢复，不能删除 receipt 冲突来绕过核验。收缩后回退使用匹配业务库/journal/制品，
不补空旧列，不恢复旧认证快照，不让旧 Provider 读取最新状态；切换后的业务写入由发布负责人单独处理。

发布负责人只在数据库最终 verify、source/目标全 owner 独立 verify、Snapshot 零库存、非目标比较、接入方 Secret 切换、
全部业务 origin 代理、最新统一运行图及受控 smoke 均通过后，逐控制面 read-back 并人工恢复写入/流量。
这些步骤不是 CLI 自动承担的发布动作。本仓库自动化通过也不等于生产代理已配置或生产窗口已执行。

## 自动化复现与证据边界

任务独占 PostgreSQL/Redis 和精确 b648 冻结源码目录准备好后，从根目录执行：

```powershell
bun --no-env-file run apps/api/test-integration/composition/b648-upgrade.fixture.ts <fixed-source-dir> [evidence-dir]
```

测试资源通过 `IAM_API_TEST_DATABASE_URL`、`IAM_API_TEST_REDIS_URL` 显式提供；沿 fixture 的实际资源要求准备独占库，
不得使用开发或生产资源。固定来源先安装冻结 lockfile，并核对源码身份。`b648-source-runtime.fixture.ts` 支持旧 Provider
真实 writer，不恢复旧 Provider 到生产依赖图。记录实际 receipt、进程/资源身份、命令退出码和保留比较结果，
清理只按本任务准确容器 ID、进程树和目录执行。演练逐 blob 验证 2676 个来源文件与 lockfile，
使用独立 API/Provider 进程建立真实认证状态，正式维护命令均独立启动，并在 cleanup 成功后才写通过 receipt。
最终浏览器/Gateway 和 `pnpm verify` 结果另见[验收账本](../features/sso/managed-callback-origin-acceptance.md)。
同代 #204 的 28 个对象保留证据与本页 b648 全体重新登录分别存证，不互相替代。
