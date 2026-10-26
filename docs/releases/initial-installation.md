# 新空目标首次初始化

Status: Current。Last verified: 2026-10-26。Next review: 2026-11-26。

适用于 LQV-349 已批准的 IAM test/prod 新空间。输入、数据库、Redis 和 Client origin 以父仓该环境已提交的映射为准；不从旧服务或 E2E seed 推导默认账户。历史库升级继续按原维护手册，此入口不迁移历史数据、重设既有密码或替换既有 Client 凭据。

## 正式输入

非 secret JSON 包含 `admin` 的 username/name/userType，`organization` 的 orgCode/orgName/orgType/isEntity/isVirtual，`position` 的 posCode/posName，`adminRoleName`，以及 iam、iam-admin、gds 三个 Client 各自的 clientName/url/ssoConfig。枚举及严格 SSO 形状复用正式合同；managed 配置不接受 callbackEndpoint。组织为一级根，事务内建立路径和自身 closure；以主任职取得 iam-admin 下的固定 `iam:admin` 角色。不初始化已退役的权限点。

secret 由发布入口独立注入，JSON 与日志不包含 secret：

| 输入                                                               | 用途                                           |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| `IAM_INITIAL_ADMIN_PASSWORD`                                       | 首个管理员密码，按现有 bcrypt 实现 hash 后存储 |
| `IAM_INITIAL_IAM_CLIENT_SECRET` / `IAM_INITIAL_IAM_SSO_SECRET`     | portal Client 的 Internal 与 SSO 凭据          |
| `IAM_INITIAL_ADMIN_CLIENT_SECRET` / `IAM_INITIAL_ADMIN_SSO_SECRET` | 管理端 Client 的 Internal 与 SSO 凭据          |
| `IAM_INITIAL_GDS_CLIENT_SECRET` / `IAM_INITIAL_GDS_SSO_SECRET`     | GDS Client 的 Internal 与 SSO 凭据             |

Internal 与 SSO Secret 分别绑定原 Client 字段；不要将两者互换。consumer 的 Internal API key、前端 client code/SSO URL 和批准的 redirect URLs 必须匹配同一组环境输入。

## 原 Worker 镜像中的命令

1. 注入该环境 `IAM_WORKER_DATABASE_URL`，在原 Worker 镜像运行 `bun run src/commands/initialization/database-migrate.ts`。它使用 `@iam/db` 的正式 migrations 及原账本，不依赖生产镜像内不存在的 drizzle-kit。
2. 按原 Compose 部署两个既有 Worker，分别启用 user-profile 和 organization-search；保持所属 IAM Redis DB、队列及版本一致。
3. 注入上表 secret 和非 secret JSON，运行 `bun run src/commands/initialization/initialize.ts source --input <环境JSON>`。PostgreSQL 源事实以一个 serializable 事务提交，随后向既有两类 Worker 投递正式 backfill。已存在匹配的事实重复执行不更新密码、SSO credential id、角色或任职；重复 source 会重新投递读模型构建。未知/部分/不一致事实明确失败，不覆盖。
4. 由原已部署 Worker 完成 publication 后，运行 `bun run src/commands/initialization/initialize.ts access --input <同一环境JSON>`。命令先核源事实和 PostgreSQL 当前 publication，再独立核 Redis Facts 与 PostgreSQL 版本/内容一致，随后仅通过既有 Subject Access bootstrap 初始化缺失 Barrier，最后执行原 Redis/Access 核验。已存在 Barrier 保留；缺失事实不会生成可登录状态。命令不另起 consumer 或 HTTP 服务，未收敛时保留明确失败码，不能记作完成。
5. 运行原 `organization-search:verify`，再执行管理员真实登录、管理端读取、Client 身份/回跳及两类 Worker 的受控验收。初始化成功或 health 不能代替这些结果。

源码工作区对应命令为 `pnpm --filter '@iam/worker' database:migrate`、`pnpm --filter '@iam/worker' initialize:source --input <环境JSON>`、`pnpm --filter '@iam/worker' initialize:access --input <环境JSON>`。命令日志只报告阶段、计数和必要身份 handle，不输出连接、驱动 SQL 参数或凭据。

## 验证与边界

Worker 的原 `test:unit` 自动收集初始化输入、严格 Client 合同、secret 分离，以及 publication 缺失/过期时不 seed、已有 Barrier 保留和核验失败场景。原 Integration collection 增加 `test-integration/initialization/initialization.integration.test.ts`，通过既有 UUID schema harness 真执行正式 migrations、初始化、重复执行、原生授权登记失败回滚、已有对象保护和并发初始化。

本任务只在项目指定托管 PG16 上执行需要服务的检查，不运行原通用测试资源创建器另起临时 PG/Redis。QA 沿原授权注入独立托管验证库的 `IAM_WORKER_TEST_DATABASE_URL`，明确选择上述 Bun 文件；harness 只创建并清理本例 UUID schema，不创建数据库或服务。未执行的 PG16、真实登录/Worker、镜像交付必须如实单列，不能由 unit/typecheck 推导通过。

正式初始化源事实由 Worker 的 initialization-source 拥有，包括首次 Role Assignment 写入；日常管理写入仍由 Admin Role Management 拥有，运行时角色解析仍只用原 Resolver。该新装事务不向在线 API 暴露第二条角色管理路径。
