# 新空环境首次初始化

本流程适用于已执行正式数据库迁移的空 IAM 环境。账号、组织、岗位和 Client 配置采用部署方批准的环境输入。执行期间保持公共流量和其他源数据写入关闭，允许匹配版本的 User Document 和 Organization Document Worker 消费构建任务。

## 输入

准备一份私有 UTF-8 JSON，包含以下字段：

| 字段            | 内容                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------- |
| `admin`         | `username`、`name`、`userType`                                                            |
| `organization`  | `orgCode`、`orgName`、`orgType`、`isEntity`、`isVirtual`                                  |
| `position`      | `posCode`、`posName`                                                                      |
| `adminRoleName` | 位于 `iam-admin` Client 的 `iam:admin` 角色显示名                                         |
| `clients`       | `iam`、`iam-admin`、`gds` 各一项。每项包含 `clientCode`、`clientName`、`url`、`ssoConfig` |

数据库和 Redis 使用该环境的 `IAM_OPS_DATABASE_URL` 和 `IAM_OPS_REDIS_URL`。通过部署环境另行注入：

- `IAM_INITIAL_ADMIN_PASSWORD`
- `IAM_INITIAL_IAM_CLIENT_SECRET` 和 `IAM_INITIAL_IAM_SSO_SECRET`
- `IAM_INITIAL_ADMIN_CLIENT_SECRET` 和 `IAM_INITIAL_ADMIN_SSO_SECRET`
- `IAM_INITIAL_GDS_CLIENT_SECRET` 和 `IAM_INITIAL_GDS_SSO_SECRET`

Internal 和 SSO 凭据各自绑定对应的 Client 字段。将 JSON 和凭据放在 Git 和镜像之外，凭据仅传给发起安装的临时命令。

## 执行顺序

1. 按[首次部署](deployment.md#首次部署)执行 `pnpm --filter @iam/db db:migrate`，启动与目标版本匹配的两类 Document Worker。
2. 使用 Ops 执行 `initialize source`。它在单个 PostgreSQL 事务里创建三项 Client、根组织、岗位、管理员、主任职和对应 Role Assignment，然后登记两类文档构建。相同输入可重跑并重新投递构建，保留已存在的密码和凭据。已有事实不一致时命令失败。
3. 等待 Worker 完成发布，使用同一份输入执行 `initialize access`。它先验证当前 PostgreSQL User Document 及匹配的 Redis Facts，再仅为管理员补齐缺失的访问屏障，最后执行访问核验。已有屏障保留。收到 `initialization-postgres-publication-pending` 或 `initialization-redis-facts-pending` 时，先确认 Worker 和发布状态，收敛后重试。
4. 执行 `iam-ops organization-document verify`，再通过受限入口验收管理员登录、Client 回跳和两类 Worker 发布。

源码工作区入口：

```bash
pnpm --filter @iam/ops iam-ops initialize source --input "$IAM_INITIAL_INPUT_FILE"
pnpm --filter @iam/ops iam-ops initialize access --input "$IAM_INITIAL_INPUT_FILE"
pnpm --filter @iam/ops iam-ops organization-document verify
```

使用[一次性 Ops 镜像](deployment.md#一次性-ops-维护环境)执行时，将 JSON 只读挂载到容器，用 Compose `run -e 变量名` 显式传递上述凭据环境变量，并把 `--input` 指向容器内路径。

## 托管环境验收

对已完成初始化和网关发布的独立测试环境，可使用 `pnpm test:e2e -- --managed`。将 `IAM_MANAGED_ACCEPTANCE_INPUT_FILE` 指向私有 JSON，提供 `environment`、`origin`、`database`、`databaseUrl`、`admin.username/password`、`redis.host/port/db` 和可选的 Redis 用户名、密码。环境标识为 `shrq-srv-test` 或 `shrq-srv-prod`，数据库名需与该标识对应。

该模式使用真实管理入口执行写入。用户场景临时改名，核对 Redis Facts、已完成的 User Document 批任务和 `user-info`，随后恢复原值。组织场景创建并重命名自有组织，核对 PostgreSQL 发布结果和任务完成后逐级清理。验收前确认账号和目标环境允许这些写入，测试通过以发布结果和清理完成为准。
