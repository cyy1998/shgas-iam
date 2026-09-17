# b648 无人值守离线迁移

本入口将精确来源 `b6481f2de5c2930fc381d99e70520e0783091e9d` 迁移到本次固定目标基线
`acc2bd7c558ce9b029bcb04d446a31ee6dbeca25` 的数据库和认证状态布局，最终 migration 为
`20260916081103_managed_callback_origin`。它不发现或拉取远端版本，也不接管缺少完整恢复记录的手工半迁移。
设计决定见[Q1–Q10](../features/sso/b648-unattended-upgrade-design.md)。

## 执行前

调用者提前备份业务库、migration journal 与部署配置，停止流量并排空 API、Admin API、Worker、旧 Provider
及全部相关任务、直连 reader/writer。整个迁移窗口保持停流；命令不会检查或改变部署控制面。
PostgreSQL/Redis 的真实连接应沿用已核验的 Worker 配置，不得使用示例连接代替。

本入口读取 `apps/worker/.env` 和进程环境变量（后者优先）：

- 必填 `IAM_WORKER_DATABASE_URL` 和 `IAM_WORKER_REDIS_HOST`。
- `IAM_WORKER_REDIS_PORT` 默认 `6379`，`IAM_WORKER_REDIS_DB` 默认 `0`。
- 适用时设置 `IAM_WORKER_REDIS_USERNAME`、`IAM_WORKER_REDIS_PASSWORD`。

固定使用旧 Kernel `sess:v2:`、新 Kernel/Custom `iam:session`、新 OIDC `iam:oidc`；
旧 Custom/Provider 与 Snapshot 的范围沿用各 owner。它们必须位于本次配置的同一个 Redis DB。
自定义 namespace 或跨 Redis DB 的来源应使用[分阶段整链手册](b648-managed-callback-upgrade.md)，不能用默认清零报告代表其他范围。

## 一条命令

从仓库根执行：

```powershell
pnpm --filter @iam/worker b648-upgrade
```

默认在 `apps/worker/.b648-upgrade/` 持久保存恢复证据。该目录已忽略提交，但不能当缓存删除，
容器或替换制品的部署须把它放在可持久保留的位置。可一次指定路径和实际 journal schema：

```powershell
pnpm --filter @iam/worker b648-upgrade --state-dir C:/secure/b648-upgrade --migrations-schema drizzle
```

业务 schema 通过数据库连接的 `search_path` 固定。命令不要求停写确认参数、人工 manifest 或逐阶段操作；
停流和备份是调用者已履行的执行前提。

## 自动执行与成功条件

先只读验证精确 source schema/journal、全部 Client 与两种认证布局。双协议或非法 Client 在数据库修改前拒绝；
无配置者保持无配置，停用/删除者保留状态。原数据库工具的 1000 Client、manifest/receipt 大小等限制仍适用。
命令自动生成唯一协议 manifest，记录非目标 PostgreSQL 业务表及 Redis 值/绝对到期时间的摘要，之后执行：

1. 数据库扩展、准备、转换、独立验证、收缩、最终转换和独立最终验证。
2. source 与 unified 各 owner 清理和独立进程清零验证。
3. Snapshot full repair 和独立进程清零验证。
4. 非目标数据与原始基线比较；自然过期单独计数。
5. 原子保存完成状态，最后输出 `status=completed` 并退出 `0`。

`status=phase-completed` 只是阶段进度，不能当作总流程成功。失败退出非零，报告安全的 `phase` 和原因；
不打印原始连接、Secret、Cookie、Token 或 Redis key。总流程上限 30 分钟；子命令有独立超时。
保留比较扫描当前业务 schema 的表和该 Redis DB 的非目标 key，后者最多 100000 个；超限失败，不截断。
数据库级 advisory lock 防止同一业务 schema 的多个自动入口同时迁移。

## 中断与重跑

失败后保持停流，修复原因，再运行同一命令及相同的 `--state-dir`/schema/连接。
`state.json` 保存资源身份、原 manifest、非目标基线及最终完成状态；`manifest.json` 是其中原清单的命令输入副本，
未完成时可以从仍完整的 state 物化，不能重新 inventory 生成凭据身份。`receipt.json` 由数据库收缩阶段产生，
保留事实核验必须使用原文件。文件损坏或冲突不得通过删除、手改摘要或伪造完成标记绕过。

脚本核对真实 journal 决定下一阶段；`prepare`/`apply` 可安全重验重跑，收缩后不重新扩展。
Redis 跨 owner 清理不原子，中断后重新 inventory/apply/verify；不因错误假定所有作用已回滚。
必要状态丢失、资源不匹配或事实冲突时停止，不自动恢复数据库备份。

已经完整成功的再次运行只读取恢复证据并执行数据库最终核验，不连接或清理 Redis，不轮换 Secret。
新的登录态和已回填 Snapshot 保留；合法的后续 Client/Role 修改可能使严格的历史 receipt 核验失败，此时也不会写入。

## 离线完成后的发布责任

全部 IAM 用户需要重新登录。Independent Custom SSO 和 confidential OIDC 的新 Secret 已存入数据库，
重跑保持同一凭据；脚本不导出原文，通过现有 Admin 授权且记审计的读取入口取得。
接入方切换 Secret、更新部署与 Gateway 配置、启动服务、真实业务 smoke 以及恢复流量仍按
[跨代整链手册](b648-managed-callback-upgrade.md)完成。离线成功不等于已完成发布。

## 验证入口

Worker `test:integration:composition` 使用调用者独占的 `IAM_WORKER_TEST_DATABASE_URL` 和
`IAM_WORKER_TEST_REDIS_URL`，从 Git 精确导出 b648 migrations，调用正式单入口验证全链与恢复。
固定默认认证 namespace 要求测试 Redis 中对应 owner 库存为空，不能使用开发或生产资源。
原数据库阶段 PostgreSQL 测试与 owner Redis 测试继续验证底层命令。本手册不表示目标环境已执行。
