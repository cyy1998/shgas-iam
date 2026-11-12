# 部署与发布

Type: runbook
Status: Current
Last verified: 2026-11-06
Next review: 2026-12-06

本页覆盖当前版本首次部署、常规更新和兼容版本回退。旧 Profile/Organization Search 升级先按[统一 Document 硬切换](data-maintenance.md#统一-document-硬切换)，其他跨代来源见[独立迁移指引](README.md#一次性迁移与旧版本)。
本地开发见[项目快速开始](../../README.md#-快速开始)；网关、登录密钥、数据重建和日志栈按[专题入口](README.md)操作。

## 部署输入

从 [生产环境模板](../../docker/.env.prod.example) 准备每台主机私有的 `docker/.env`，选择固定版本的镜像与匹配配置。
Compose 解析时会校验所选文件的全部必填变量，即使只启动一个服务也要补齐；`config --quiet` 可检查配置而不输出展开后的秘密。

Redis 客户端连接统一使用 `IAM_<APP>_REDIS_URL`；应用 Compose 将共享 `IAM_REDIS_URL` 传给 API、Admin API 和 Worker，
一次性 Ops 使用独立的 `IAM_OPS_REDIS_URL`。格式为 `redis://[username:password@]host[:port][/db]`，省略端口和 DB 时分别为
`6379`、`0`。只支持 `redis://`，不接受 query、fragment 或缺失的主机；用户名、密码中的特殊字符必须百分号编码。
解析规则由[共享 Redis 配置](../../packages/runtime/src/redis/config.ts)维护，常驻连接的重试策略由
[连接 factory](../../packages/runtime/src/redis/connection.ts)维护。

升级到当前版本时，先把已有私有配置中的 Redis host、port、username、password、db 合成对应 URL，并删除旧拆分字段；
旧字段不再作为应用输入。目标主机、端口和 DB 须保持一致，避免连接到另一份状态。Redis 服务端仍由 data Compose 的
`REDIS_PASSWORD` 设置访问密码，客户端 URL 中解码后的密码须与该服务端配置匹配。然后按下方常规更新流程重建受影响应用；
源码运行使用各 app 的配置，固定旧版本维护制品使用其匹配版本配置。

| 编排                                                                            | 服务与部署要求                                                                                             |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [compose.prod.data.yaml](../../docker/compose.prod.data.yaml)                   | PostgreSQL primary、两个 replica、Redis；replica 默认使用与 primary 相同的宿主端口，分主机部署或明确改端口 |
| [compose.prod.apps.yaml](../../docker/compose.prod.apps.yaml)                   | API、Admin API、SSO、Admin、两个独立 Worker 和 Gateway API；dashboard 使用 `ops` profile                   |
| [compose.prod.gateway.yaml](../../docker/compose.prod.gateway.yaml)             | APISIX、etcd 和初始化服务                                                                                  |
| [compose.prod.observability.yaml](../../docker/compose.prod.observability.yaml) | Loki、Grafana、各主机的 Alloy，见[日志栈部署](observability-system-logs.md)                                |
| [compose.prod.ops.yaml](../../docker/compose.prod.ops.yaml)                     | 独立一次性 Ops CLI；使用 `docker/.env.ops`，不启动应用、Worker 或数据服务                                  |

核对数据库、Redis、APISIX 管理地址、DNS/TLS 和端口访问范围；跨主机使用实际可达地址。
API/SSO 的登录公私钥和 kid 必须配对，内外网 origin、Gateway host 与 OIDC Client 配置一致。
Gateway 需要独立数据库只读账号及 APISIX Admin 凭据；首次发布还需准备 Enable、未删除的 `iam` Client 和 Internal Secret，
详细配置见[网关管理](apisix-gateway-release.md)。不能依赖尚未发布的 IAM 路由来访问 Gateway 配置 API。

### 前端构建输入

升级前在部署环境、CI 构建参数及前端本地 env 文件中一次性替换下表前缀，沿用原值和字段后缀。必填规则和默认值见
[生产环境模板](../../docker/.env.prod.example)及[生产 Compose](../../docker/compose.prod.apps.yaml)。

| 应用          | 旧前缀           | 新前缀           | 字段后缀                                                                                                                                                             |
| ------------- | ---------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin（6 项） | `UMI_APP_ADMIN_` | `IAM_ADMIN_WEB_` | `API_PREFIX`、`CLIENT_CODE`、`GRAFANA_URL`、`SSO_AUTHORIZE_URL`、`SSO_LOGOUT_URL`、`SYSTEM_LOG_ENV`                                                                  |
| SSO（9 项）   | `UMI_APP_SSO_`   | `IAM_SSO_WEB_`   | `API_PREFIX`、`CLIENT_CODE`、`CAP_ENDPOINT`、`CAP_SITE_KEY`、`CAP_WASM_URL`、`CAP_PAKO_URL`、`LOGIN_CREDENTIAL_KID`、`LOGIN_CREDENTIAL_PUBLIC_KEY`、`WELL_KNOWN_URL` |

新版本只读取新名称。构建时将公开值写入静态文件，配置变化需要重建对应镜像。API 登录凭证私钥等服务端配置保存在后端。

## 一次性 Ops 维护环境

从 [Ops 部署模板](../../docker/.env.ops.example) 准备私有 `docker/.env.ops`。将 `IAM_OPS_IMAGE` 设为与目标应用同一发布版本的独立 Ops 镜像，
仅提供本次命令所需的 `IAM_OPS_*` 连接、日志和命令配置。PostgreSQL-only 命令不要求 Redis，Redis-only 命令不要求 PostgreSQL；
帮助无需连接。该文件不要求 API、Gateway 或其他应用的配置，不加入日常 apps Compose 的解析面。
私有部署配置和源码的 `apps/ops/.env` 都不提交到 Git，也不进入 Docker 构建上下文或镜像。

```bash
docker compose --env-file docker/.env.ops -f docker/compose.prod.ops.yaml config --quiet
docker compose --env-file docker/.env.ops -f docker/compose.prod.ops.yaml pull ops
docker compose --env-file docker/.env.ops -f docker/compose.prod.ops.yaml run --rm --no-deps -T ops --help
docker compose --env-file docker/.env.ops -f docker/compose.prod.ops.yaml run --rm --no-deps -T ops user-document verify-postgres
```

从匹配版本源码构建时，用同一配置的 `build ops` 代替 `pull ops`。镜像包含运行依赖，执行时无需宿主源码、pnpm 或已运行的 Worker 容器；
服务不发布端口、不挂载数据卷、不设置依赖服务启动，命令结束后移除本次容器。各命令参数与源码 `pnpm --filter @iam/ops iam-ops` 相同，
用法见 [Ops README](../../apps/ops/README.md)。当前维护命令与外部自动化须同次切换到 Ops 和 `IAM_OPS_*`，不保留旧 Worker 人工入口或配置别名。

同一 Docker daemon 上沿用 `iam-service-prod` 的默认网络，可使用现有数据服务名；独立维护主机必须填写实际可达的 PostgreSQL、Redis 地址。
相同 project 名不提供跨主机网络。只通过 `run --rm --no-deps` 执行一次性任务，不对这份局部 Compose 执行 `down` 或管理共享项目生命周期。

执行具体维护前先读对应[数据维护](data-maintenance.md)或[会话维护](authentication-and-session.md)的停流、排空和权限要求。
backfill、部分 repair 只登记或唤醒工作，仍须匹配版本的 consumer 收敛，再运行独立完整 gate；命令成功不能代替恢复完成或放流检查。
失败或退出未知时保持适用的停流范围，按该能力的恢复步骤处理，再重新执行核验。

## 首次部署

适用于新环境。已有数据库先判断来源版本与迁移要求，不把空库安装流程当作旧环境升级。

1. 准备持久化目录与权限、配置和依赖网络。在各主机仅启动分配给本机的服务：

   ```bash
   docker compose --env-file docker/.env -f docker/compose.prod.data.yaml config --quiet
   docker compose --env-file docker/.env -f docker/compose.prod.data.yaml up -d postgres-primary redis
   docker compose --env-file docker/.env -f docker/compose.prod.gateway.yaml up -d apisix
   ```

   示例中的 primary 与 Redis 可同机；分主机时拆开执行。确认数据服务可连接，APISIX 健康且管理接口仅供可信管理网络访问。

2. 在匹配目标版本的源码或维护环境安装锁定依赖，通过安全环境提供目标 `DATABASE_URL` 后执行正式迁移：

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @iam/db db:migrate
   ```

   `DATABASE_URL` 是迁移工具输入，不能用应用的 `IAM_API_DATABASE_URL` 代替。
   Compose 不自动执行迁移；失败先核对原因和实际 schema，不用 `db:push` 或删除 migration journal 绕过。

3. 启动应用，公共流量暂不开放：

   ```bash
   docker compose --env-file docker/.env -f docker/compose.prod.apps.yaml config --quiet
   docker compose --env-file docker/.env -f docker/compose.prod.apps.yaml up -d api admin-api worker-user-document worker-organization-document sso admin gateway-api
   ```

   通过已有的受控初始化/管理流程准备管理员与 Client 配置。不能使用测试 seed 或假定空库会自动创建生产账号。
   有导入源数据时，按[数据维护](data-maintenance.md)完成对应读模型构建及核验。

4. 按[网关发布流程](apisix-gateway-release.md)发布目标环境配置。经受限入口完成下述检查，再开放公共流量。
   任一步失败保持受影响入口关闭，修复后重做失败步骤及受影响检查。

## 常规更新

先确定受影响服务及配对要求。数据库不兼容变更、密钥轮换、读模型升级各用其专门流程；普通应用更新不附带会话全清或全量重建。

1. 准备目标镜像和已知兼容的回退镜像、配置；涉及持久数据变更时先取得可恢复备份。
2. 通过实际网关/部署控制关闭受影响流量和任务，排空在途工作。Compose 的 `stop` 不是流量控制替代品。
3. 更新 `docker/.env` 中相应 `*_IMAGE` 和配置。以下以 API 与 Admin API 为例：

   ```bash
   docker compose --env-file docker/.env -f docker/compose.prod.apps.yaml config --quiet
   docker compose --env-file docker/.env -f docker/compose.prod.apps.yaml pull api admin-api
   docker compose --env-file docker/.env -f docker/compose.prod.apps.yaml stop api admin-api
   ```

   从源码构建时，将 `pull` 替换为同一 Compose 的 `build api admin-api`，构建上下文为仓库根目录。
   有兼容的待执行迁移时，在相关旧 writer 已停止后运行 `db:migrate`；需要协调切换的迁移先转专门指引。

4. 用目标镜像重建所选服务：

   ```bash
   docker compose --env-file docker/.env -f docker/compose.prod.apps.yaml up -d --no-deps --force-recreate api admin-api
   docker compose --env-file docker/.env -f docker/compose.prod.apps.yaml ps api admin-api
   ```

5. 完成受影响检查后恢复流量与任务。检查或开放失败时停止继续开放，关闭不确定入口并按回退/修复流程处理。

### 独立更新和回退前端

Admin 和 SSO 分别使用 `IAM_ADMIN_IMAGE` 和 `IAM_SSO_IMAGE`。准备目标镜像与上一版本的镜像和部署配置，按常规更新步骤控制受影响入口。
以下以 Admin 为例，更新 SSO 时使用服务名 `sso` 和相应镜像变量。

```bash
docker compose --env-file docker/.env -f docker/compose.prod.apps.yaml config --quiet
docker compose --env-file docker/.env -f docker/compose.prod.apps.yaml pull admin
docker compose --env-file docker/.env -f docker/compose.prod.apps.yaml up -d --no-deps --no-build --force-recreate admin
```

从源码发布时，将 `pull admin` 换成 `build admin`，从同一版本源码的仓库根目录执行。经实际入口直接访问并刷新对应部署子路径下的深链接，
检查登录回跳、HTML 的 `Cache-Control: no-store` 及带内容哈希资源的长期缓存，再恢复该入口。

需要回退时，用上一版本保存的 Compose 和 env 文件恢复该服务的已构建镜像，执行同样的 `up -d --no-deps --no-build --force-recreate`，
核对部署 project、旧版镜像与入口验证结果后再开放。必须重建旧镜像时，从该版本源码使用对应版本的构建输入和 Compose，升级前的源码使用
表中旧前缀。

### 启用全局角色

按[全局角色决策](../adr/0048-model-global-roles-without-client-ownership.md)协调升级。准备同一候选的 Admin、Admin API、
API、User Document Worker 及适用的 Ops 制品，并在停流前确认数据库备份可恢复。

1. 关闭受影响入口和 User Document 消费，排空在途请求、发布任务及相关 Ops 操作。
2. 停止旧版写入与发布进程，用候选源码执行正式 `db:migrate`。重建受影响服务，并在受限入口检查新版可读取既有
   User Document、Redis Facts 及有效会话。
3. 确认全部相关读写和发布进程已升级后，恢复 User Document 消费并开放全局角色的创建和分配。用已批准的验收数据
   经正式入口核对角色发布及两应用的可见范围。相关用户按源变化重建，既有会话和凭据继续按原期限使用。

回退前检查旧版制品与当前源数据及已发布事实的兼容性。开始写入全局角色后，按下述回退流程恢复匹配的制品与数据，
并处理备份后的变更和会话撤销。

### 启用组合角色

沿用[全局角色的协调升级流程](#启用全局角色)。开放组合角色创建、分配及包含关系编辑前，确认所有参与实时授权、
User Document 构建与发布的进程均使用支持组合角色的同一候选，包括全部 Admin API、User Document Worker 副本，
以及负责文档重建和修复的 Ops 制品。停用旧版本的定时或人工构建入口。迁移将存量角色归为基本角色，
既有 User Document 可继续读取，组合变化按受影响用户触发重建和发布。

开放后用已批准的数据核对 Admin 实时授权、文档发布和应用端可见角色。写入组合角色或包含关系后，按下述回退流程
检查制品与当前源数据及已发布事实的兼容性。旧版构建会遗漏继承角色，需要恢复匹配的制品与数据或在维护窗口内修复。

## 完成检查与回退

| 检查       | 通过条件                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 服务与依赖 | 目标副本使用预期镜像/配置，持续运行；API 的 `/ready` 通过真实 PostgreSQL/Redis 检查，Worker 按其配置的 health/readiness 检查依赖与模块 |
| 受影响功能 | 经正式业务入口验证本次改动：前端可加载、请求到达正确后端、需要的登录/授权成功且无效身份被拒绝                                          |
| 专项变更   | 网关回读、密钥兼容、数据核验或日志采集满足对应专题标准；未触及的专题不重复执行                                                         |

Gateway `/health` 只证明 HTTP 就绪，不能替代数据库认证、APISIX 连通性或业务路由检查。
仅容器启动成功不算发布完成；失败可结合[日志与排障](observability-system-logs.md)定位。

回退前关闭受影响入口并排空，确认旧应用兼容当前 schema、协议状态和密钥集合，恢复旧镜像与匹配配置，再按更新步骤重建和检查。
新版本已删除表、改写数据格式或签发新 key 的 Token 时，不能直接回退镜像；按专门恢复流程恢复一致状态，并处理备份之后的变化。
不能通过恢复登录态备份重新启用已经撤销的访问。无法确认兼容性时保持维护并修复当前版本。

## 本地开发与其他运行方式

开发使用唯一的 [compose.dev.yaml](../../docker/compose.dev.yaml)，从 `.env.dev.example` 准备 `docker/.env`：

```bash
docker compose --env-file docker/.env -f docker/compose.dev.yaml up -d
```

仅启动本地依赖时指定 `db redis`；日志栈追加 `--profile observability`。
开发构建代理使用 `DOCKER_BUILD_HTTP_PROXY`、`DOCKER_BUILD_HTTPS_PROXY`、`DOCKER_BUILD_NO_PROXY`；生产 build 使用 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY`。
容器访问宿主回环代理时使用 `host.docker.internal`；管理入口应按实际网络加入 `NO_PROXY`。

源码运行使用 `pnpm --filter @iam/api serve`、`pnpm --filter @iam/admin-api serve`、`pnpm --filter @iam/worker serve`。
前端分别执行 `pnpm --filter @iam/admin build` 与 `pnpm --filter @iam/sso build`，产物在各 app 的 `dist`，base 为 `/iam-admin` 和 `/portal`。
路由及 rewrite 以[系统入口表](../engineering/system-architecture.md#请求入口与后台任务)和环境 manifest 为准。

## 定向停止

data、apps、gateway 共用 `iam-service-prod` project；同机时共享默认网络，拆文件不隔离生命周期。
日常只对明确服务执行 `stop`、`rm`，不对部分文件使用 `up --remove-orphans` 或 `down`。
确需完整停止本机项目时，确认本机全部服务，加载完整文件集；例如本机同时部署这三组服务时：

```bash
docker compose --env-file docker/.env -f docker/compose.prod.data.yaml -f docker/compose.prod.apps.yaml -f docker/compose.prod.gateway.yaml down
```

该操作不用于应用更新，不删除持久化数据。观测属于独立 `iam-service-observability` project，按其专题单独停止。
