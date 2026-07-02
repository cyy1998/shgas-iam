## 1. Worker App Scaffold

- [x] 1.1 新增 `apps/worker` workspace package，包含 `package.json`、`tsconfig.json`、`eslint.config.js`、`src/index.ts` 和 `dev` / `serve` / `test` / `lint` / `typecheck` scripts。
- [x] 1.2 新增 `apps/worker/src/env.ts`，解析 `IAM_WORKER_*` raw env 并输出 grouped runtime config。
- [x] 1.3 新增 `apps/worker/src/lib/logger.ts`，并在 `@iam/api-core/logger` 中支持 `iam-worker` source app。
- [x] 1.4 新增 `apps/worker/src/composition/runtime.ts`，创建 DB、Redis config、clock、logger 和 worker runtime dependencies。
- [x] 1.5 新增 `apps/worker/Dockerfile`，沿用现有 backend Bun app deploy pattern。

## 2. Worker Module Runtime

- [x] 2.1 在 `apps/worker` 定义 worker module registry 接口，支持 module key、queue registrations、consumer start 和 close lifecycle。
- [x] 2.2 在 `@iam/user-profile-read-model` 增加 `createUserProfileWorkerModule(...)`，封装 user-profile queue、processor、builder、repositories、worker service 和 dashboard queue registration。
- [x] 2.3 在 `apps/worker` registry 中注册 user-profile module，并实现 `IAM_WORKER_ENABLED_MODULES=all|none|user-profile` 解析与未知 module key 失败逻辑。
- [x] 2.4 实现 worker process graceful shutdown，关闭已启动 BullMQ workers、queues、HTTP server 和 Redis connections。

## 3. User Profile Commands

- [x] 3.1 在 `apps/worker` 新增 `user-profile:backfill` script 和 command entry，调用 user-profile worker service 的 backfill 能力。
- [x] 3.2 在 `apps/worker` 新增 `user-profile:repair` script 和 command entry，调用 user-profile worker service 的 repair 能力。
- [x] 3.3 确认 backfill/repair command 只执行“标脏 + 入队”，不直接同步 rebuild profile。
- [x] 3.4 更新初始化/运维文档或附近 README，替换旧的 `pnpm --filter @iam/api exec bun -e ...` 和 `worker:user-profile` 用法。

## 4. Health And Bull Board

- [x] 4.1 在 `apps/worker` 新增 Hono HTTP server，提供 `GET /healthz` 并返回 enabled modules、dashboard-only 状态和 runtime readiness。
- [x] 4.2 为 `apps/worker` 添加 Bull Board 依赖，包括 `@bull-board/api` 和 `@bull-board/hono`。
- [x] 4.3 实现 Bull Board dashboard 挂载，支持 `IAM_WORKER_BULL_BOARD_ENABLED`、`IAM_WORKER_BULL_BOARD_PATH` 和 `IAM_WORKER_BULL_BOARD_QUEUES`。
- [x] 4.4 实现 dashboard Basic Auth，prod-like env 下启用 dashboard 时强制 username/password。
- [x] 4.5 实现 dashboard read-only 默认值，并仅在 `IAM_WORKER_BULL_BOARD_READ_ONLY=false` 时开放 queue mutation actions。
- [x] 4.6 确认 dashboard 使用 known worker module queue registrations，不扫描 Redis keys。

## 5. Remove API Worker Ownership

- [x] 5.1 删除 `apps/api/src/workers/user-profile.ts` 和 `apps/api/src/composition/user-profile-worker.ts`。
- [x] 5.2 从 `apps/api/package.json` 删除 `worker:user-profile` 和 `worker:user-profile:dev` scripts。
- [x] 5.3 从 `apps/api/src/env.ts` 和 env tests 中移除 `IAM_API_USER_PROFILE_WORKER_CONCURRENCY`、`IAM_API_USER_PROFILE_REBUILD_BATCH_SIZE` 和 `IAM_API_USER_PROFILE_BACKFILL_BATCH_SIZE`。
- [x] 5.4 确认 `apps/api` 只保留 user-profile read/search 所需 `IAM_API_USER_PROFILE_DSL_MAX_LIMIT`。
- [x] 5.5 更新 API/admin-api architecture guard，防止重新引入 `@api` 私有 worker 入口或 worker-only env。

## 6. Docker And Env Contracts

- [x] 6.1 更新 `docker/docker-compose-dev.yml`，新增 `worker-user-profile` 和 `worker-dashboard` services，并映射 `IAM_WORKER_*` env。
- [x] 6.2 更新 `docker/docker-compose-prod.yml`，新增生产 worker consumer 和 dashboard-only service，dashboard 默认不公网暴露或受 ops profile 控制。
- [x] 6.3 更新 `.env.*.example` 或相关 env example，加入 `IAM_WORKER_*`、dashboard Basic Auth 和 published port 配置。
- [x] 6.4 更新 `check:env-names` guard，禁止 retired API worker env 名称并允许 canonical `IAM_WORKER_*`。
- [x] 6.5 更新 Docker compose comments 或运行说明，说明 `worker-user-profile` 消费 jobs，`worker-dashboard` 只展示队列。

## 7. Tests And Verification

- [x] 7.1 为 `apps/worker` env parser、module registry、health endpoint、dashboard auth/read-only 和 command wiring 添加 focused tests。
- [x] 7.2 为 `@iam/user-profile-read-model` worker module factory 添加 focused tests。
- [x] 7.3 运行 `pnpm --filter @iam/worker test`、`pnpm --filter @iam/worker typecheck` 和 `pnpm --filter @iam/worker lint`。
- [x] 7.4 运行 `pnpm --filter @iam/user-profile-read-model test` 和 `pnpm --filter @iam/user-profile-read-model typecheck`。
- [x] 7.5 运行 `pnpm --filter @iam/api test`、`pnpm --filter @iam/api typecheck`、`pnpm --filter @iam/admin-api typecheck` 和 `pnpm --filter @iam/jobs test`。
- [x] 7.6 运行 `pnpm check:env-names`。
- [x] 7.7 运行 dev/prod compose config 验证，确认 worker services 和 env 映射有效。
- [x] 7.8 运行 `openspec status --change "add-worker-app-runtime"` 和 `openspec validate "add-worker-app-runtime" --strict`。
