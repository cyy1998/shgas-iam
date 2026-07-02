## Context

`@iam/user-profile-read-model` 已经集中拥有 user-profile read model 的 builder、worker service、producer、query 和 dirty 能力；`apps/api` 仍保留过渡期 `worker:user-profile` 脚本与 `src/workers/user-profile.ts` 入口。这个入口使用 API app 的 env/logger/composition，并不适合作为后续 notification、directory-sync、import、repair 等更多后台任务的长期运行时。

本 change 将后台任务运行时从 API app 中拆出，新增 `apps/worker`，并让 user-profile 成为第一个注册模块。BullMQ 面板也放进 worker HTTP surface，但按内部运维面处理，默认只读并使用 Basic Auth。

## Goals / Non-Goals

**Goals:**

- 新增 `apps/worker`，作为统一后台任务运行时。
- 使用 `IAM_WORKER_*` env namespace，和 `IAM_API_*` 彻底分开。
- 支持 enabled modules 模式：同一 worker 镜像可消费某些任务，也可 dashboard-only。
- 将 user-profile worker、backfill、repair 从 `apps/api` 迁到 `apps/worker`。
- 移除 `apps/api` 的 user-profile worker 入口和 worker-only env。
- 提供 `/healthz` 和 BullMQ dashboard。
- 在 dev/prod compose 中提供 `worker-user-profile` 与 `worker-dashboard` 两类 service。

**Non-Goals:**

- 不修改 `user_profile`、`user_profile_dirty` 或其它数据库 schema。
- 不修改 user-profile job payload、queue name、dirty semantics 或 API 读路径行为。
- 不把 worker 接入现有 SSO/OIDC；BullMQ 面板第一版使用 Basic Auth。
- 不实现 Redis 自动扫描队列；面板只展示已知模块注册的队列。
- 不把 notification、directory-sync 等未来任务一并实现。

## Decisions

### 1. 一个 `apps/worker`，多个 job modules

新增单一 `apps/worker` app，而不是为每类任务新增一个 app。worker app 负责：

```text
apps/worker
  ├─ env/logger/runtime
  ├─ module registry
  ├─ BullMQ worker lifecycle
  ├─ health HTTP server
  ├─ Bull Board dashboard
  └─ operational commands
```

运行时通过 `IAM_WORKER_ENABLED_MODULES` 决定启动哪些 consumers：

```text
IAM_WORKER_ENABLED_MODULES=all
IAM_WORKER_ENABLED_MODULES=user-profile
IAM_WORKER_ENABLED_MODULES=none
```

`none` 表示 dashboard-only 或 health-only 进程，不消费任何 job。

### 2. capability package 暴露 worker module factory

`@iam/user-profile-read-model` 在本 change 中新增 worker module factory，例如 `createUserProfileWorkerModule(...)`。模块负责封装：

```text
- queue creation
- worker service composition
- BullMQ processor
- dashboard queue registration
- backfill/repair command service reuse
- close/shutdown handles
```

`apps/worker` 只做模块编排，不手写 user-profile 内部依赖。后续新增任务时，只需要把新 capability package 的 module factory 加入 registry。

### 3. 独立 `IAM_WORKER_*` env namespace

worker 不复用 `IAM_API_*`。基础配置：

```text
IAM_WORKER_DATABASE_URL
IAM_WORKER_REDIS_HOST
IAM_WORKER_REDIS_PORT
IAM_WORKER_REDIS_PASSWORD
IAM_WORKER_REDIS_DB
IAM_WORKER_LOG_LEVEL
IAM_WORKER_LOG_FORMAT
IAM_WORKER_ENABLED_MODULES
```

HTTP surface：

```text
IAM_WORKER_HTTP_ENABLED
IAM_WORKER_HTTP_PORT
IAM_WORKER_HEALTH_PATH
```

Bull Board：

```text
IAM_WORKER_BULL_BOARD_ENABLED
IAM_WORKER_BULL_BOARD_PATH
IAM_WORKER_BULL_BOARD_QUEUES
IAM_WORKER_BULL_BOARD_AUTH_ENABLED
IAM_WORKER_BULL_BOARD_USERNAME
IAM_WORKER_BULL_BOARD_PASSWORD
IAM_WORKER_BULL_BOARD_READ_ONLY
```

User-profile worker-only：

```text
IAM_WORKER_USER_PROFILE_CONCURRENCY
IAM_WORKER_USER_PROFILE_REBUILD_BATCH_SIZE
IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE
```

`apps/api` 继续保留 API read/search 相关的 `IAM_API_USER_PROFILE_DSL_MAX_LIMIT`，但移除 worker concurrency/rebuild/backfill 配置。

### 4. Worker HTTP surface 极简

worker HTTP server 只承担：

```text
GET /healthz
  - process alive
  - DB/Redis reachable where practical
  - configured modules started or intentionally disabled

/admin/queues
  - Bull Board dashboard when enabled
```

该 HTTP server 不承载业务 API，不复用 `apps/api` route composition。

### 5. Bull Board 默认只读，Basic Auth 保护

使用 Bull Board 的 Hono adapter 挂载在 worker HTTP server 下。BullMQ queue adapters 默认使用 read-only mode；只有显式设置 `IAM_WORKER_BULL_BOARD_READ_ONLY=false` 才允许 retry/clean/remove 等操作。

访问控制：

```text
dev:
  可以默认启用 dashboard
  仍通过 Basic Auth 保护

prod:
  dashboard 默认关闭或只通过 ops profile/service 启用
  启用时必须配置 username/password
  compose 不应默认把 dashboard 暴露到公网
```

不接入 SSO/OIDC，避免 worker app 为内部面板引入 session/auth 复杂度。

### 6. 已知队列注册，不自动扫描 Redis

Bull Board 展示队列来自 worker module registry：

```text
IAM_WORKER_BULL_BOARD_QUEUES=all
IAM_WORKER_BULL_BOARD_QUEUES=user-profile
```

不扫描 Redis key，避免把测试队列、历史队列或残留 key 暴露到 dashboard。

### 7. Compose 分离消费者和 dashboard-only

dev/prod compose 使用相同模型：

```text
worker-user-profile
  IAM_WORKER_ENABLED_MODULES=user-profile
  IAM_WORKER_BULL_BOARD_ENABLED=false

worker-dashboard
  IAM_WORKER_ENABLED_MODULES=none
  IAM_WORKER_BULL_BOARD_ENABLED=true
  IAM_WORKER_BULL_BOARD_QUEUES=all
```

这允许独立扩容消费者、单独重启 dashboard，并避免每个 worker 副本都暴露面板。

### 8. 移除 API worker 入口

本 change 删除：

```text
apps/api/src/workers/user-profile.ts
apps/api/src/composition/user-profile-worker.ts
apps/api package scripts worker:user-profile / worker:user-profile:dev
IAM_API_USER_PROFILE_WORKER_CONCURRENCY
IAM_API_USER_PROFILE_REBUILD_BATCH_SIZE
IAM_API_USER_PROFILE_BACKFILL_BATCH_SIZE
```

user-profile backfill/repair 改为 `@iam/worker` scripts，且继续使用“标脏 + 入队”语义。

## Risks / Trade-offs

- [Risk] Bull Board 暴露队列操作能力导致误 retry/clean/remove。  
  Mitigation: 默认 read-only，prod 启用必须 Basic Auth，写能力必须显式 env 开启。

- [Risk] dashboard-only 进程没有 consumers，误以为任务正在被消费。  
  Mitigation: `/healthz` 和日志 SHALL 显示 enabled modules；dashboard service 使用 `IAM_WORKER_ENABLED_MODULES=none` 明确命名。

- [Risk] worker env 与 API env 同时存在造成运维迁移遗漏。  
  Mitigation: app-env spec、env tests、env naming guard 同步更新；API 不再接受 worker-only env。

- [Risk] module registry 过早抽象导致复杂度增加。  
  Mitigation: 第一版只支持 user-profile，但接口保持最小：module key、queues、start/close、commands 复用。

- [Risk] Dockerfile 重复 backend app 构建逻辑。  
  Mitigation: 沿用 `apps/api` / `apps/admin-api` 现有 Bun Dockerfile pattern，不在本 change 中重构通用 Docker build 模板。

## Migration Plan

1. 新增 `apps/worker` package、env、logger、runtime、HTTP server、module registry 和 Dockerfile。
2. 在 `@iam/user-profile-read-model` 增加 user-profile worker module factory。
3. 将 user-profile serve/backfill/repair 命令接入 `apps/worker` scripts。
4. 移除 `apps/api` user-profile worker entry、composition、scripts 和 worker-only env。
5. 新增 Bull Board dependencies、dashboard wiring、Basic Auth 和 read-only 配置。
6. 更新 dev/prod compose 和 env examples，添加 `worker-user-profile` 与 `worker-dashboard`。
7. 更新 env guard、architecture tests 和 package typecheck/test。

Rollback 策略：本 change 不涉及 DB migration。若 worker runtime 发布失败，可以回退代码；部署层面在切换前应停止旧 API worker，启动新 `worker-user-profile` 后运行 user-profile repair 兜底 stale dirty rows。

## Open Questions

- 无。更多任务类型、SSO 保护 BullMQ 面板、metrics/exporter 和 queue alerting 留给后续 change。
