## Why

user-profile rebuild 已经从 API 私有实现抽成共享 read model 能力包，但实际消费 BullMQ jobs 的入口仍停留在 `apps/api`。随着后续异步任务类型增加，需要独立 `apps/worker` 作为统一后台任务运行时，并提供健康检查、队列面板和正式 backfill/repair 运维命令。

## What Changes

- 新增 `apps/worker` Bun app，作为后台任务运行时，负责加载 enabled job modules、启动 BullMQ workers、统一 graceful shutdown、logger、DB/Redis runtime 和 health HTTP server。
- 新增 worker module registry，第一版接入 `@iam/user-profile-read-model` 的 user-profile worker module；后续任务类型按同一模块接口接入。
- 新增 `IAM_WORKER_*` runtime env namespace，包括 DB、Redis、logging、enabled modules、health server、Bull Board 和 user-profile worker 配置。
- 新增 user-profile backfill/repair 正式 scripts，语义保持“标脏 + 入队”，不直接同步 rebuild。
- 新增 BullMQ 面板，挂载在 worker HTTP server 下，使用 Basic Auth，默认 read-only，并支持 dashboard-only 进程查看已知队列。
- 新增 Dockerfile 和 dev/prod compose services：`worker-user-profile` 消费任务，`worker-dashboard` 只展示队列面板。
- **BREAKING**: 移除 `apps/api` 的 `worker:user-profile` / `worker:user-profile:dev` 过渡脚本和 API worker entry；user-profile worker 启动与 backfill/repair 改由 `@iam/worker` 提供。
- 不改变 `user_profile` / `user_profile_dirty` 数据库 schema、job payload contract、queue name 或 API 用户读取/search 行为。

## Capabilities

### New Capabilities

- `worker-app-runtime`: 定义独立 `apps/worker` 后台任务运行时、模块注册、health endpoint、BullMQ 面板、dashboard-only 模式和 Docker Compose 启动契约。

### Modified Capabilities

- `user-profile-read-model`: 将 user-profile rebuild/backfill/repair 的运行入口从 `apps/api` 迁到 `apps/worker`，并移除 API 过渡 worker 入口。
- `background-job-queue`: 增加 BullMQ dashboard 的队列注册、安全和只读默认要求，并明确 dashboard 使用已知队列而非 Redis 自动扫描。
- `app-env-contracts`: 增加 `IAM_WORKER_*` env namespace，并将 user-profile worker-only 配置从 `IAM_API_*` 迁到 `IAM_WORKER_USER_PROFILE_*`。

## Impact

- 新增应用：`apps/worker`。
- 受影响应用：`apps/api`。
- 受影响共享包：`packages/user-profile-read-model`、`packages/jobs`、`packages/contracts`。
- 受影响 Docker 编排：`docker/docker-compose-dev.yml`、`docker/docker-compose-prod.yml`，以及相关 `.env` example / env guard。
- 新增依赖：Bull Board Hono/BullMQ adapter 相关 packages（用于 worker dashboard）。
- 需要更新运维命令：从 `pnpm --filter @iam/api worker:user-profile` 改为 `pnpm --filter @iam/worker serve`，backfill/repair 改为 `@iam/worker` scripts。
