# 托管回调 origin 推导的同代保留升级

Status: Current

Last verified: 2026-09-16

Next review: 2026-10-31

本手册适用于已经采用统一 UserSession/ClientSession、双 issuer、单协议显式 callbackType 的来源。
自动化来源固定为 `7825b22384ac823c8b5c0db905c0141ced264abd`，目标为 Spec #201 候选。
该来源的 managed 配置仍保存完整 callbackEndpoint。升级只使首次捕获的 managed Client 的全部 Code/认证续接失效，
不按旧 redeemer 再保留子集；原 Token、全部 Token 反向索引（包括合法孤立索引）和两类会话保持原身份及绝对期限。
业务 Client、OIDC 和非目标 namespace 保留。自然到期是独立结果，不能当作迁移删除或延长期限。

`b6481f2` Gateway/Independent 跨代来源需要全体重新登录和另一套配置阶段，见
[跨代整链手册](b648-managed-callback-upgrade.md)；不得执行本手册来承诺保留其旧登录态。
无 issuer 的 unified 来源也必须使用匹配的旧工具。本地演练通过不表示环境已经迁移或代理已经部署。

## 固定范围和停流

发布负责人记录源/目标/回退制品、数据库及 journal schema、Redis primary/DB 和 Custom namespace 的精确输入，核验数据库备份。
API、Admin API、Admin、SSO、Worker 一起统一版本；禁止混跑严格新旧 managed 形状。
先关闭相关协议流量和直连/重试入口，冻结全部 Client 配置写入；停止新旧 reader/writer，排空副本在途请求、后台和一次性任务。
Snapshot 全量修复还要求所有 Client acquisition 停止。Client Maintenance、CLI 的 stopped/drained 标志和零请求量不能证明排空。
部署负责人必须另留停流及 drain 证据，并确认各允许业务 origin 的 `/sso/callback` 代理已经准备。

在受控环境显式设置 `IAM_WORKER_DATABASE_URL` 和相同目标的 `DATABASE_URL`，以及
`IAM_WORKER_REDIS_HOST/PORT/DB`（需要时 USERNAME/PASSWORD）。脚本会读取 Worker `.env`，运行前核对实际值；
命令不替代资源确认。不要把连接凭据、Token、Cookie 或原始 Redis key 写入验收记录。

先运行配置库存新进程：

```bash
pnpm --filter @iam/worker client-managed-callback:upgrade inventory --writers-stopped
```

将**首次迁移前**报告中的 `managedClients` 保存为本窗口不可变范围清单，保留该报告及来源身份；空数组表示无需状态处理。
`changes` 只表示本轮待删字段，不能作为状态范围。失败恢复和重复执行只使用原清单，不根据之后的 inventory 重新扩入 Client。
重跑库存可用于诊断，但不能覆盖范围清单。若原清单丢失，保持停流并从受控原始证据恢复，不能猜测范围。
以下 `<captured-client-code>` 逐一来自该清单，`<custom-namespace>` 使用原 runtime 的准确字节值。

## 配置、状态和 Snapshot 顺序

1. 从独立 observer 保存保留集的值摘要、对象身份和绝对 expiry；至少直接覆盖目标 Client Token/全部反向索引、
   UserSession/ClientSession、业务 Client、OIDC 与非 owner。比较自然到期时单独登记，不仅比较计数。
2. 运行配置转换、真实迁移和独立校验：

   ```bash
   pnpm --filter @iam/worker client-managed-callback:upgrade apply --writers-stopped
   pnpm --filter @iam/db db:migrate
   pnpm --filter @iam/worker client-managed-callback:upgrade verify --writers-stopped
   ```

   默认 journal schema 为 `drizzle`；自定义环境向配置三个模式传 `--migrations-schema <schema>`，迁移 runner 也须使用同一 journal。
   配置工具锁内全量校验完整 Domain 规则，仅减去 managed 地址键。它不登记 journal，不能省略正式迁移。
   business 地址、SSO Secret/身份和 Internal 凭据保持；不生成或分发新 Secret。
3. 对原范围清单每个 Client，在三个新进程分别执行：

   ```bash
   pnpm --filter @iam/worker online-auth:state inventory --layout unified --owner custom-sso --custom-namespace <custom-namespace> --client-code <captured-client-code> --artifacts authorization --writers-stopped --drained
   pnpm --filter @iam/worker online-auth:state apply --layout unified --owner custom-sso --custom-namespace <custom-namespace> --client-code <captured-client-code> --artifacts authorization --writers-stopped --drained
   pnpm --filter @iam/worker online-auth:state verify --layout unified --owner custom-sso --custom-namespace <custom-namespace> --client-code <captured-client-code> --artifacts authorization --writers-stopped --drained
   ```

   `authorization` 只在 unified/custom-sso/明确 Client 范围合法。省略该参数的旧全 Client 模式会删除 Token，不适用于本流程。
   Custom owner 扫描整个所属 namespace，严格校验 Code/续接身份和所属 Client，不用 Client 名称拼摘要猜 key。
   inventory/apply/verify 共用筛选；Token 和所有 token-id 族在读取前跳过，保留 Token 不计为残留。
   坏 Code、坏续接、未知族或无法确定归属的记录保留并阻断成功。Worker 不读取私有 key/schema。
4. 所有原目标独立 verify 零库存后，按[统一维护手册](unified-session-maintenance.md)运行：

   ```bash
   pnpm --filter @iam/worker client-snapshot:repair --all --writers-stopped --drained
   pnpm --filter @iam/worker client-snapshot:verify --all --writers-stopped --drained
   ```

   这是清理当前三族缓存并独立核验为空；不是预先生成全部配置。随后统一启动新版本，由新 reader 回源。
5. 比较保留集，运行受控 smoke：旧 Code/续接拒绝；原有效 Token 能按既有规则访问；原根无需重新登录即可完成新授权；
   回调按落地 origin 派生，原落地及 state 保持。核验 business、OIDC、管理配置和实际业务 origin 代理后，由负责人恢复配置写入与流量。

## 部分作用与恢复

Redis 清理按观察字符串做逐记录 CAS，默认每页 100 条，单页最多 1000；Worker 最多 100000 页，默认总 deadline 300000ms，
可用 `--deadline-ms` 收窄。参数错误退出 2；连接、未知记录、CAS changed、超时或库存未清退出 1；成功退出 0。
有界错误、终止或提交后响应丢失可能已经清理部分记录。保持停流，使用原 Client 清单及同一 namespace 从 inventory 重新开始，
修复明确来源问题后 apply，再以新进程 verify；不能根据上次 removed 数或工具退出前日志放流。
不要删除未知记录凑零，也不要改用 all owner 或全 Client 清理。

配置事务失败可回滚该事务；后续 migration、Redis 或 Snapshot 失败不代表前面没有提交。优先保持停流继续完成固定目标。
需要回退时，使用匹配的配置/schema/journal 备份和旧制品，协调全部消费者及 Snapshot；已经失效的旧授权流程重新发起，
不要恢复已清 Code/续接或过期登录态。保留集异常、身份/expiry 改变或任何独立 gate 失败均不允许放流。

## 可复现证据

Worker Redis collection 覆盖同 Client 两种历史用途、正常/孤立 Token 索引、Kernel/OIDC/其他 Client 保留、坏及未知记录、
limit=1 分页、CAS replacement、实际提交后丢响应与独立进程重跑。正常记录由所属 production writer 写入，故障变体明确构造。

同代 HTTP/PG/Redis 演练显式接受固定源码目录，逐 blob 核验来源（包括 lockfile），旧 API 新进程真实密码登录、授权、续接和签发；
正式 Worker 新进程执行配置和状态三个模式及 Snapshot repair/verify，真实 Drizzle migrator 按原 journal 完成目标 DDL。
独立 Redis observer 在新流量前比较保留集的 DUMP 摘要和 PEXPIRETIME，随后最新 API 拒绝旧流程、接受新授权和原 Token。

```powershell
# 在独占源码目录检出上面的精确 SHA，并执行 pnpm install --frozen-lockfile。
# 显式提供独占 IAM_API_TEST_DATABASE_URL / IAM_API_TEST_REDIS_URL。
bun --no-env-file run apps/api/test-integration/composition/managed-callback-upgrade.fixture.ts --source-directory <fixed-source-workspace>
```

该显式演练不在普通 collection 中隐式检出或安装旧源码，缺失/漂移来源直接失败。报告及 API 日志保存在输出的任务临时目录；
失败记录仍保留。普通相关行为通道为 Worker Redis、API Redis/PG/composition 与 Custom Unit，完整结果随 #204 验收评论记录。
