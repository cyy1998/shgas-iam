# b648 Client 数据库离线直升

需要自动完成数据库、认证状态及 Snapshot 全链时，优先使用[无人值守离线入口](b648-unattended-upgrade.md)。
下文为保留的数据库分阶段入口，不与自动入口交错执行或用它生成的记录接管手工半迁移。

本手册交付 Spec #201 / Ticket #205 的数据库阶段。来源只支持
`b6481f2de5c2930fc381d99e70520e0783091e9d`，目标是无地址的 managed 配置。
在线状态清理、部署配置、Snapshot 和上线验收继续按 [跨代整链手册](b648-managed-callback-upgrade.md)
执行；数据库成功不代表已允许放流，也不代表目标环境已迁移。

## 窗口与固定输入

发布负责人先备份业务库与真实 migration journal，固定源/目标制品、回退制品、PostgreSQL 18.4 实例和 schema。
停止并排空全部相关 reader/writer、旧 Provider 与任务，冻结配置和业务写入；`--writers-stopped` 是操作声明，不能代替停流证据。
窗口内只运行离线工具，直到最终核验通过后才启动最新 runtime。

一次性脚本独立位于 `apps/worker/scripts/b648-upgrade/`，显式设置 `DATABASE_URL` 指向目标；命令可接受
`--migrations-schema <schema>`，默认 `drizzle`。自定义业务 schema 应固定连接的 `search_path`。
不得把测试 URL 或示例地址带入生产。以下命令使用 `--no-env-file`，只接受显式环境变量，不读取 Worker `.env`。

预检校验 b648 的完整 journal 连续前缀、迁移名称及 timestamp，不比较历史 SQL 文件的字节 hash；同时核对精确 Client 列名/类型/nullability、原约束/default/index、
冻结来源配置和当前 Domain URL/pattern/claim 规则。Client 上限 1000，manifest/receipt 上限 1 MiB；超限或漂移拒绝，
不截断、不自动修复。安全失败报告只列原因和可解析的阻塞 Client，不打印配置、Secret 或数据库错误详情。
`id` 的 serial 还须满足指向同 schema 下 `client_id_seq` 的 `nextval` 默认值、序列对该列的 ownership 及原整数序列参数；
按 PostgreSQL OID 解析关系，允许合法 schema 名称差异，拒绝缺失/常量默认值、误用其他序列或丢失 ownership。

## 正式命令顺序

以下命令从仓库根执行。使用自定义 journal schema 时，每一步都追加相同的 `--migrations-schema <schema>`。

```powershell
bun --cwd apps/worker --no-env-file scripts/b648-upgrade/index.ts preflight --writers-stopped
bun --cwd apps/worker --no-env-file scripts/b648-upgrade/index.ts expand --writers-stopped
bun --cwd apps/worker --no-env-file scripts/b648-upgrade/index.ts prepare --writers-stopped
bun --cwd apps/worker --no-env-file scripts/b648-upgrade/index.ts inventory --writers-stopped
```

`expand` 只执行并登记到 `20260914061007_romantic_maestro`，保留全部旧列；已在扩展阶段可重跑。
`prepare` 安装显式回调类型的过渡 CHECK，不登记未来 migration，也不改动历史 SQL。
库存报告的 `report.clients` 给出 `clientCode`、`sourceDigest`、候选 `credentialId`、可选协议和状态。
从成功库存构造以下严格 manifest，删除报告中的状态字段。来源摘要和候选凭据 ID 原样保存：

```json
{
  "version": 1,
  "layout": "dual-to-single-v1",
  "clients": [
    {
      "clientCode": "business-app",
      "sourceDigest": "<inventory中的64位摘要>",
      "credentialId": "<inventory中的UUID>",
      "protocol": "custom-sso"
    }
  ]
}
```

清单必须覆盖全部 Client（包括删除、停用和无协议配置者）；空库可用空清单。
两协议都有配置时必须明确 `protocol` 为 `oidc` 或 `custom-sso`，不按 enabled 推测。
只有一种配置时可以省略选择；无配置时可省略或填 `null`。不接受 `gatewayCallback`。
Gateway 自动映射 managed，中间地址为 `https://iam-offline-upgrade.invalid/client/<id>/sso/callback`，
仅通过离线历史 CHECK；Independent 保留真实地址并显式映射 business，即使其路径也是 `/sso/callback`。

```powershell
bun --cwd apps/worker --no-env-file scripts/b648-upgrade/index.ts apply --writers-stopped --manifest C:/secure/clients.json
bun --cwd apps/worker --no-env-file scripts/b648-upgrade/index.ts verify --writers-stopped --manifest C:/secure/clients.json
bun --cwd apps/worker --no-env-file scripts/b648-upgrade/index.ts contract --writers-stopped --manifest C:/secure/clients.json --receipt C:/secure/clients.receipt.json
bun --cwd apps/worker --no-env-file scripts/b648-upgrade/index.ts finalize --writers-stopped --manifest C:/secure/clients.json --receipt C:/secure/clients.receipt.json
bun --cwd apps/worker --no-env-file scripts/b648-upgrade/index.ts verify-final --writers-stopped --manifest C:/secure/clients.json --receipt C:/secure/clients.receipt.json
```

`apply` 在锁内重查来源并全量规划，任一未决项阻止全部写入。Independent/confidential OIDC 生成新 Secret；
Gateway/public 不生成 Secret。原 manifest 重跑保持新 Secret、credential ID 和生成时间；不要用新库存的候选 ID
替换已执行的原 manifest。Internal API 凭据、Client 身份和 Role 事实保留。
工具不输出 Secret，发布负责人通过既有受控管理方式分发新 SSO Secret，接入方完成切换是放流条件。

`contract` 持有 journal、Client 和 Role 锁，启动**独立新进程**执行同一个公开 `verify` 全量入口，
它读取已提交转换数据，且只读事务不申请冲突锁。核验失败不执行收缩。
通过后先排他创建 receipt（已有文件必须内容匹配），保存全部目标 Client/Role 事实的摘要及 manifest 摘要，
没有凭据原文；再在同一数据库事务原样执行并登记收缩和显式类型 DDL。
receipt 是本次固定升级的保留事实证据，不能代替配置核验或作为通用任务状态。

`finalize` 在脚本内部完成 managed 地址移除、最终 migration 登记和保留事实核验；可使用原清单重复执行。
独立 `verify-final` 要求新增 managed 约束已登记、严格配置可读、managed 无地址且中间值零残留，并逐行核对
receipt 中的配置、启用意图、凭据身份/原文摘要、Internal 凭据和非目标事实。
Snapshot 清理及 reader 回源、旧登录态全体清理、业务代理和接入方 Secret 切换仍是后续独立放流门禁。

## 截止点、失败与恢复

阶段截止和收缩核验只属于这个一次性脚本，执行原 SQL 并原子登记 Drizzle journal。
普通 `db:migrate` 恢复为 `drizzle-kit migrate`，没有 b648 阶段参数或专用门禁；新装及日常迁移按正常流程执行。
b648 来源必须使用本手册的脚本流程，不能直接运行普通迁移，也不能用预期 DDL 失败当作阶段停点。

任一失败保持停流，重新独立观察当前 journal 和数据。扩展/准备/转换失败按当前阶段和原 manifest 重跑；
收缩事务失败会回滚数据库，但可能已写 receipt，应保留并用原 manifest/receipt 重跑。
收缩已成功时再次 `contract` 只验证 receipt，不重复删列；已进入最终无地址阶段则运行最终转换/登记/verify 命令。
receipt 冲突或最终摘要不符必须调查，不能删除证据文件或重新生成摘要来宣称成功。
收缩后回退依赖匹配的业务库、journal、制品及接入方协调备份，不补建空旧列，不恢复旧登录态。

## 自动化证据边界

Worker PostgreSQL Integration 从 Git 精确导出 b648 migrations，经真实 migrator 建源库，再运行以上独立 CLI。
覆盖 Gateway、同路径 Independent、双配置选择、停用/无配置、公有/机密 OIDC、特殊标识，schema/journal/格式/上限拒绝，
收缩前门禁、事务中断和重复恢复、Secret 不泄漏与稳定、原事实保留、最终严格 Snapshot 数据读取，以及普通新装完整迁移。
旧 HTTP writer 的真实认证状态到最新服务的跨代链由 #206 的[验收账本](../features/sso/managed-callback-origin-acceptance.md)单独记录，不能由本数据库演练替代。
