# 历史审计 action 规范化与恢复门禁

本手册适用于 ADR-0024 的八类旧登录 action。工具与无别名代码候选已实现；允许开发、测试和交付候选，工具票与无别名票关闭、代码及隔离测试通过都不代表任何目标环境完成迁移。
发布负责人须取得目标环境操作授权并保存下述证据后，才能部署删除别名的候选。

## 固定工具与命令

在兼容版本阶段固定包含 `apps/worker/src/commands/audit-action-maintenance.ts` 的完整 Git SHA、lockfile、Bun 版本及可恢复制品。
使用该候选安装的 Worker workspace；连接仅来自显式 `IAM_WORKER_DATABASE_URL`，不回退 `DATABASE_URL`，不连接 Redis、queue 或 HTTP。
URL 应指向目标数据库与正确 schema/search_path，凭据不进入命令行、报告或证据附件。盘点和 verify 需要 SELECT；apply 还需要 UPDATE 与表锁权限。

```bash
pnpm --filter @iam/worker audit:actions -- inventory
pnpm --filter @iam/worker audit:actions -- apply --writers-stopped
pnpm --filter @iam/worker audit:actions -- verify
```

只接受上述参数组合。`inventory` 和 `verify` 使用独立 `REPEATABLE READ READ ONLY` 事务；每次命令都是独立进程。
apply 的 `--writers-stopped` 是操作者声明，不能自动证明 writer 已退出。工具先取得 `SHARE ROW EXCLUSIVE` 表锁，等待已有 writer 完成，
再在同一事务中完成全量冲突预检与单次 UPDATE，阻止检查和提交之间的并发写入。锁释放后不能阻止旧 writer 重新写入，因此整个发布窗口仍须停写。
事务失败回滚；重复 apply 允许零更新。连接超时 10 秒、等锁超时 10 秒、每条语句及事务空闲超时 5 分钟，关闭连接等待最多 5 秒。
这些保护不是目标库耗时承诺；达到限制时保持关闭，评估数据量、锁等待与运行计划，不能用部分迁移绕过门禁。

| 退出码 | 含义 |
|---|---|
| 0 | `completed`；inventory 完整且无冲突（允许仍有旧 action）；apply 完成提交；verify 完整且八类旧 action 全为零。 |
| 1 | 冲突、verify 有残留，或配置/连接/事务/关闭连接失败；不得放行。 |
| 2 | `invalid-arguments`，在创建连接前失败。 |

单行 JSON `version:1` 报告包含模式、状态、总行数、旧行数、冲突数、更新数与八类 action 的计数。计数字段使用十进制字符串，避免大数精度丢失。
apply 的库存计数表示更新前状态，不能替代下一次 verify。冲突定位只输出按 ID 排序的前 20 个 numeric ID；总冲突数始终全量统计。
未知 action、outcome 原文、actor、target、details、请求字段、URL、凭据和原始异常均不输出。
通用 `operation-failed` 不表示数据库一定没有提交：例如提交响应或连接关闭失败时，保持停写并在新进程 inventory/verify，必要时幂等重跑。

## 迁移范围

| 旧 action | 新 action | 必须一致的 outcome |
|---|---|---|
| auth.login.success | auth.login | success |
| auth.login.password.success | auth.login.password | success |
| auth.login.password.failure | auth.login.password | failure |
| auth.login.mobile.success | auth.login.mobile | success |
| auth.login.mobile.failure | auth.login.mobile | failure |
| auth.login.local.success | auth.login.local | success |
| auth.login.oa.success | auth.login.oa | success |
| auth.login.wechat.success | auth.login.wechat | success |

映射由工具独立持有，不读取 runtime alias export。仅更新 action；identity、eventTime、actor、target、outcome、details、请求字段与总行数保持。
未知 action 原样保留，不通用截后缀。任一已知旧 action 与 outcome 冲突时，整次 apply 在更新前失败；维护者根据可信历史证据处理异常，工具不推测或自动修复。
不修改 schema、历史 migrations 或 action enum 限制。

## 发布流程

1. 备份目标库并确认备份可恢复；固定兼容候选、上述工具制品及拟部署无别名候选 SHA。记录数据库/schema、负责人、授权和备份引用。
2. 停止审计写入流量，退出全部旧 writer 实例并排空在途事务；盘点所有 writer 来源，确认不会自动重启。保持兼容版本可恢复。
3. 运行 inventory 并保存退出码及安全报告。记录目标库行数、八类分布、冲突总数、盘点时间、可用磁盘/WAL 空间和预估锁窗口。
   依据真实数据量安排窗口，不由本地测试推定生产耗时。存在冲突时停止流程并保留兼容版本。
4. 保存停写后的审计查询基线：总数、按规范 action/outcome 的计数及代表性历史记录。执行 apply，记录开始/结束时间、实际锁等待/持锁时间及退出码。
   失败时保持停写与兼容版本，排查后重新 inventory/apply；任何不确定提交状态由独立读取确认。
5. 在新进程执行 verify。必须退出 0、`completed`、八类分布与 `legacyRows` 全零；已规范的环境可以零更新通过。
6. 通过真实 Admin 审计查询验收规范 action、success/failure 分别筛选、合并筛选计数、中文显示与未知 action 原文回退；核对总数及代表行除 action 外全部字段保持。
   保存受控证据引用，不把原始敏感审计数据贴入公开发布记录。查询验收失败不得继续。
7. 以上门禁通过后才部署无别名候选，执行查询 smoke，再统一恢复流量。无别名候选必须保留本工具与依赖，以支持受支持旧备份的恢复。

## 备份恢复

迁移前备份不能直接配合无别名候选开放审计查询。先停流并固定恢复的备份/工具/候选，恢复兼容版本与数据库后，
重新执行 writer 退出、inventory、apply、独立 verify 和查询验收的全部门禁，再部署无别名候选并放流。
迁移失败时保留兼容版本，不能跳过门禁。禁止反向猜测 action 后缀来回滚；需要还原原始事实时使用受控备份恢复，随后仍重复门禁。
工具何时退役由受支持环境和备份范围另行决定，不随 runtime aliases 同时删除。
