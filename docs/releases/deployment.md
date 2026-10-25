# 部署与发布

Type: runbook
Status: Current
Last verified: 2026-10-25
Next review: 2026-11-25

本页覆盖当前版本首次部署、常规更新和兼容版本回退。跨代切换先查[独立迁移指引](README.md#一次性迁移与旧版本)。
本地开发见[项目快速开始](../../README.md#-快速开始)；网关、登录密钥、数据重建和日志栈按[专题入口](README.md)操作。

## 部署输入

从 [生产环境模板](../../docker/.env.prod.example) 准备每台主机私有的 `docker/.env`，选择固定版本的镜像与匹配配置。
Compose 解析时会校验所选文件的全部必填变量，即使只启动一个服务也要补齐；`config --quiet` 可检查配置而不输出展开后的秘密。

| 编排                                                                            | 服务与部署要求                                                                                             |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [compose.prod.data.yaml](../../docker/compose.prod.data.yaml)                   | PostgreSQL primary、两个 replica、Redis；replica 默认使用与 primary 相同的宿主端口，分主机部署或明确改端口 |
| [compose.prod.apps.yaml](../../docker/compose.prod.apps.yaml)                   | API、Admin API、SSO、Admin、两个独立 Worker 和 Gateway API；dashboard 使用 `ops` profile                   |
| [compose.prod.gateway.yaml](../../docker/compose.prod.gateway.yaml)             | APISIX、etcd 和初始化服务                                                                                  |
| [compose.prod.observability.yaml](../../docker/compose.prod.observability.yaml) | Loki、Grafana、各主机的 Alloy，见[日志栈部署](observability-system-logs.md)                                |

核对数据库、Redis、APISIX 管理地址、DNS/TLS 和端口访问范围；跨主机使用实际可达地址。
API/SSO 的登录公私钥和 kid 必须配对，内外网 origin、Gateway host 与 OIDC Client 配置一致。
Gateway 需要独立数据库只读账号及 APISIX Admin 凭据；首次发布还需准备 Enable、未删除的 `iam` Client 和 Internal Secret，
详细配置见[网关管理](apisix-gateway-release.md)。不能依赖尚未发布的 IAM 路由来访问 Gateway 配置 API。

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
   docker compose --env-file docker/.env -f docker/compose.prod.apps.yaml up -d api admin-api worker-user-profile worker-organization-search sso admin gateway-api
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
路由及 rewrite 以[系统入口表](../architecture/system-architecture.md#请求入口与后台任务)和环境 manifest 为准。

## 定向停止

data、apps、gateway 共用 `iam-service-prod` project；同机时共享默认网络，拆文件不隔离生命周期。
日常只对明确服务执行 `stop`、`rm`，不对部分文件使用 `up --remove-orphans` 或 `down`。
确需完整停止本机项目时，确认本机全部服务，加载完整文件集；例如本机同时部署这三组服务时：

```bash
docker compose --env-file docker/.env -f docker/compose.prod.data.yaml -f docker/compose.prod.apps.yaml -f docker/compose.prod.gateway.yaml down
```

该操作不用于应用更新，不删除持久化数据。观测属于独立 `iam-service-observability` project，按其专题单独停止。
