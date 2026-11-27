# @iam/ops

人工维护使用独立的 `iam-ops` CLI。命令不启动 consumer、HTTP 或 Bull Board；Worker 保留长期消费和周期恢复。

```bash
pnpm --filter @iam/ops iam-ops --help
pnpm --filter @iam/ops iam-ops user-document repair --limit 500
pnpm --filter @iam/ops iam-ops user-document verify-postgres --batch-size 500
pnpm --filter @iam/ops iam-ops employment verify
```

| 分组                    | 操作                              | 主要选项                                                                                                                                                  |
| ----------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user-document`         | `backfill`                        | `--batch-size`、`--deadline-ms`                                                                                                                           |
| `user-document`         | `repair`                          | `--limit`、`--stale-before`、`--subject-access-only`、`--force`、`--retry-user-id` 与 `--retry-version`、`--deadline-ms`                                  |
| `user-document`         | `verify-postgres`、`verify-redis` | `--batch-size`、`--deadline-ms`                                                                                                                           |
| `organization-document` | `backfill`、`repair`、`verify`    | backfill 的 `--batch-size`；repair 的 `--limit` 与 `--stale-before`；均支持 `--deadline-ms`                                                               |
| `initialize`            | `source`、`access`                | `--input <file>`、`--deadline-ms`                                                                                                                         |
| `session`               | `inventory`、`apply`、`verify`    | `--layout unified`、`--owner`、各 owner 的 `--kernel-namespace`／`--custom-namespace`／`--oidc-namespace`、`--writers-stopped --drained`、`--deadline-ms` |
| `client-snapshot`       | `repair`、`verify`                | 定向 repair 使用 `--client-code`；全量使用 `--all --writers-stopped --drained`；`--deadline-ms`                                                           |
| `employment`            | `verify`                          | 全库只读诊断，无范围或修复选项                                                                                                                            |
| `audit-action`          | `inventory`、`apply`、`verify`    | apply 必须声明 `--writers-stopped`                                                                                                                        |

所有分组与操作支持 `--help`，帮助不连接资源。报告、退出语义、停写前提、重试范围和限额沿用各能力的既有契约。
Client 缓存传播失败时，按[受影响的缓存范围](../../docs/releases/authentication-and-session.md#client-snapshot-修复)选择维护命令。

从 [.env.example](.env.example) 准备私有 `apps/ops/.env`；CLI 只读取自己的配置文件，已有进程变量优先。
配置统一使用 `IAM_OPS_*` 前缀，不读取 Worker 的 `.env`；仅访问 PostgreSQL 的命令只需数据库配置，仅访问 Redis 的命令只需 `IAM_OPS_REDIS_URL`（Redis URL 写法与凭据转义见[一次性 Ops 维护环境](../../docs/releases/deployment.md#一次性-ops-维护环境)）。日志使用独立 `iam-ops` 身份，私有配置不得提交到仓库或进入镜像。

操作前请先阅读对应的运维手册（涵盖 backfill/repair 收敛与核验门禁、Subject Access 数据库写入前提及重试预算规则）：[Document 与 Subject Access 维护](../../docs/releases/data-maintenance.md)、[会话与 Snapshot 维护](../../docs/releases/authentication-and-session.md)及[历史审计维护](../../docs/releases/README.md#历史审计规范化)。
数据库迁移继续通过 `@iam/db db:migrate`，Gateway 发布继续使用 HTTP API。
空环境的初始化顺序和凭据输入见[新空环境首次初始化](../../docs/releases/initial-installation.md)。

独立镜像和生产维护 Compose 使用相同的分组、操作与参数，见[一次性 Ops 维护环境](../../docs/releases/deployment.md#一次性-ops-维护环境)。
镜像须与目标应用匹配发布版本；不依赖宿主源码、pnpm 或运行中的 Worker 容器。

## 任职只读诊断

`iam-ops employment verify` 在 PostgreSQL 只读事务核对任职状态、父岗位与组织、任职日期区间、已结束任职的截止日、
重复开放任职及多个开放主职。报告 `passed` 时退出 0，发现阻断项时退出 1，并按类别列出任职 ID。
历史墓碑单独计数，缺少可信结束时间不阻断。按真实业务通过管理入口修正后重新核验。

## 审计规范化

显式提供 `IAM_OPS_DATABASE_URL`，使用 `pnpm --filter @iam/ops iam-ops audit-action <inventory|apply|verify>`。
`apply` 要求停写并提供 `--writers-stopped`，操作和恢复顺序见[历史审计规范化](../../docs/releases/README.md#历史审计规范化)。
