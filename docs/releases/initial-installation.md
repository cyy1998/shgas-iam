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

Worker 的原 `test:unit` 自动收集初始化输入、严格 Client 合同、secret 分离，以及 publication 未就绪时不 seed、已有 Barrier 保留和核验失败场景。原 Integration collection 的 `test-integration/initialization/initialization.integration.test.ts` 通过既有 UUID schema harness 真执行正式 migrations、初始化、重复执行、原生授权登记失败回滚、已有对象保护和并发初始化。

`initialization-access.integration.test.ts` 调用与正式 access 命令相同的资源接线：从源事实构建并事务发布真实 PG Profile，再发布 Redis Facts，验证缺失／旧版本／同版本错内容／自有键实际到期，以及 Barrier 缺失、既有 enabled、disabled、blocking、非法值和重复执行。断言 PG/Facts/Barrier 字节、版本、transitionId 和 updatedAt 保持。Facts 没有按 publishedAt 年龄自动失效的合同；用例不新增该规则，也不启动 Worker 或假服务器。

`database-migrate-command.integration.test.ts` 启动正式 `database:migrate` 子进程，对同一托管 PG 上的自有随机空数据库执行原 migrations，再验证重复执行保留默认 drizzle 账本、表 OID 和受控行；另核连接失败不输出完成或凭据。由于原 migrator 使用数据库默认账本，该用例需要验证账号的 CREATEDB 能力，并准确删除自有数据库，不用 schema 夹具冒充 CLI 空库证明。

本任务只在项目指定托管 PG16／Redis 上执行需要服务的检查，不运行原通用测试资源创建器另起临时服务。QA 沿原授权注入 `IAM_WORKER_TEST_DATABASE_URL` 和 `IAM_WORKER_TEST_REDIS_URL`，在 IAM 仓库根选择下列正式文件。PG harness 只创建并清理本例 UUID schema；CLI 用例另创建并删除自己的随机数据库。Redis 仅写入和删除各例 subjectIdentifier 对应的准确 Facts/Barrier 键，不 flush DB。

```text
bun --no-env-file test ./apps/worker/test-integration/initialization/initialization.integration.test.ts ./apps/worker/test-integration/initialization/initialization-access.integration.test.ts ./apps/worker/test-integration/initialization/database-migrate-command.integration.test.ts
```

资源场景不替代真实 source 命令投递、两类运行 Worker、登录／管理端、镜像和同请求观测验收。各范围的实际执行与未覆盖分别记录，不能由 unit/typecheck 或初始化成功推导全部通过。

正式初始化源事实由 Worker 的 initialization-source 拥有，包括首次 Role Assignment 写入；日常管理写入仍由 Admin Role Management 拥有，运行时角色解析仍只用原 Resolver。该新装事务不向在线 API 暴露第二条角色管理路径。

## 已托管环境的登录与两类 Worker

本任务通过同一个 E2E 入口的显式 managed 模式访问父仓已经部署、初始化并完成 access 的 IAM test/prod。该模式不调用 Docker 生命周期、seed、端口分配或 APISIX apply，不启动 API/Worker/代理/测试依赖。使用根 pnpm test:e2e -- --managed，或从仓根直接调用原 CLI：

```text
bun --no-env-file e2e/system/src/cli.ts e2e --managed
```

IAM_MANAGED_ACCEPTANCE_INPUT_FILE 指向 ignored temp 内、由父组合 Git 映射及正式初始化私有输入生成的私有 UTF-8 JSON：environment、origin、database、databaseUrl；admin.username/password；redis.host/port/db 和实际配置的可选 username/password。非 secret 映射取父 Git，账号取正式初始化，动态 id/subject 由真实登录后的管理端与 user-info 取得并交叉核对，不能复制历史 seed 或伪造 Cookie。字段和值不入日志/附件。DATABASE_URL 只在实际测试子进程内绑定该 IAM 库。输出仅为自有环境、请求RID、原生jobId/版本/处理时间及自有组织code；trace/video关闭，错误剔除私有输入和回调grant。

正式 managed-hosting.spec.ts 有两个独立场景：真实管理员登录和管理端读取后，只改受控账号名字一次，核新代 Redis Facts、同原生 JobId 的 completed/dirtyVersion/requestId，以及正式 user-info 最终读回；finally 通过原API恢复名字并等发布。另一例经原管理API创建自有根/子/叶，只改叶名一次，使用原 Organization Search 查询 consumer 读取 PG 发布文档，核完整路径/旧名消失、同叶新代原生任务完成；结束沿正常停用/删除API按叶到根清理，并核搜索发布不再返回。只取该队列最新100份完成任务的必要句柄，不读取业务全量或清空Redis。

新增的 Jobs/Search 两项 workspace 依赖及已有 Facts 依赖只复用现有 Jobs、Facts、Search 的公开schema/ID/原生reader，不增加第三方版本，不复制 Redis key 或第二查询实现。程序只建立并关闭自己的数据库/Redis/浏览器连接，不启动消费者替身。原异步发布若未完成仍FAIL；不以入队、源表变化或health代替实际Worker结果。原资源型Integration继续按前节指定正式文件；本模式不代签外部来源、HR、业务版组合、真实日志/Grafana下钻或完整A1–A7，相关环境证据分别收集。
