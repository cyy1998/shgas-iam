# @iam/ops

人工维护使用独立的 `iam-ops` CLI。命令不启动 consumer、HTTP 或 Bull Board；Worker 保留长期消费和周期恢复。

```bash
pnpm --filter @iam/ops iam-ops --help
pnpm --filter @iam/ops iam-ops user-document repair --limit 500
pnpm --filter @iam/ops iam-ops user-document verify-postgres --batch-size 500
pnpm --filter @iam/ops iam-ops client-snapshot repair --client-code alpha
pnpm --filter @iam/ops iam-ops employment verify
```

| 分组                    | 操作                              | 主要选项                                                                                                                                                  |
| ----------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user-document`         | `backfill`                        | `--batch-size`、`--deadline-ms`                                                                                                                           |
| `user-document`         | `repair`                          | `--limit`、`--stale-before`、`--subject-access-only`、`--force`、`--retry-user-id` 与 `--retry-version`、`--deadline-ms`                                  |
| `user-document`         | `verify-postgres`、`verify-redis` | `--batch-size`、`--deadline-ms`                                                                                                                           |
| `organization-document` | `backfill`、`repair`、`verify`    | backfill 的 `--batch-size`；repair 的 `--limit` 与 `--stale-before`；均支持 `--deadline-ms`                                                               |
| `session`               | `inventory`、`apply`、`verify`    | `--layout unified`、`--owner`、各 owner 的 `--kernel-namespace`／`--custom-namespace`／`--oidc-namespace`、`--writers-stopped --drained`、`--deadline-ms` |
| `client-snapshot`       | `repair`、`verify`                | 定向 repair 使用 `--client-code`；全量使用 `--all --writers-stopped --drained`；`--deadline-ms`                                                           |
| `employment`            | `verify`                          | 全库只读诊断，无范围或修复选项                                                                                                                            |
| `audit-action`          | `inventory`、`apply`、`verify`    | apply 必须声明 `--writers-stopped`                                                                                                                        |

所有分组与操作支持 `--help`，帮助不连接资源。报告、退出语义、停写前提、重试范围和限额沿用各能力的既有契约。

从 [.env.example](.env.example) 准备私有 `apps/ops/.env`；CLI 只读取自己的文件，已有进程变量优先。
配置使用 `IAM_OPS_*`，不读取 Worker 的 `.env`，不接受旧维护变量别名。PostgreSQL-only 命令只需数据库，Redis-only 命令只需 `IAM_OPS_REDIS_URL`；日志使用独立 `iam-ops` 身份。
Redis URL 使用 `redis://[username:password@]host[:port][/db]`，未写端口或 DB 时使用 `6379` 和 `0`，必须显式提供地址。
认证用户名与密码中的特殊字符须按 URL percent encoding 转义，解析后按原文传递；不把 URL 或凭据写入日志或报告。
前缀变化不改变目标数据库、队列前缀或 Redis namespace。私有配置不得提交或进入镜像。

Document backfill／部分 repair 只登记或重新唤醒持久工作，仍需匹配版本的 Worker 收敛，再执行独立完整 gate。
Subject Access-only 会写 PostgreSQL transition intent，不是 Redis-only 操作。人工强制或定向重试不改变自动尝试预算和版本/token 仲裁。

操作前阅读[Document 与 Subject Access 维护](../../docs/releases/data-maintenance.md)、[会话与 Snapshot 维护](../../docs/releases/authentication-and-session.md)及[历史审计维护](../../docs/releases/README.md#历史审计规范化)。
数据库迁移继续通过 `@iam/db db:migrate`，Gateway 发布继续使用 HTTP API。

独立镜像和生产维护 Compose 使用相同的分组、操作与参数，见[一次性 Ops 维护环境](../../docs/releases/deployment.md#一次性-ops-维护环境)。
镜像须与目标应用匹配发布版本；不依赖宿主源码、pnpm 或运行中的 Worker 容器。

## 任职只读诊断

`iam-ops employment verify` 在 PostgreSQL 只读事务核对任职状态、父岗位与组织、任职期和结束时间、未来开始的开放任职、
重复开放任职及多个开放主职。报告 `passed` 时退出 0，发现阻断项时退出 1，并按类别列出任职 ID。
历史墓碑单独计数，缺少可信结束时间不阻断。按真实业务通过管理入口修正后重新核验。

## 审计规范化

显式提供 `IAM_OPS_DATABASE_URL`，使用 `pnpm --filter @iam/ops iam-ops audit-action <inventory|apply|verify>`。
`apply` 要求停写并提供 `--writers-stopped`，操作和恢复顺序见[历史审计规范化](../../docs/releases/README.md#历史审计规范化)。
