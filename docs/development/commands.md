# 构建、测试与开发命令

根工具链要求 Node.js 24 与仓库 `packageManager` 声明的 pnpm 版本。优先使用 workspace script 和
`pnpm --filter`，让 Turborepo 与 package-local tooling 负责执行细节。

## 实现内循环

按当前 ticket 的受影响范围选择命令：

```bash
pnpm --filter <workspace> test
pnpm --filter <workspace> lint
pnpm --filter <workspace> typecheck
pnpm check:architecture
pnpm check:docs
git diff --check
```

根工具链变化的聚焦 Bun 测试：

```bash
bun test scripts/__tests__/architecture-guard.test.ts
bun test scripts/__tests__/test-orchestration.test.ts
bun test scripts/__tests__/tooling-performance.test.ts
bun test scripts/__tests__/eslint-config-equivalence.test.ts
```

完整 `pnpm verify` 只在准备 merge、release 或用户明确要求时运行一次；ticket 实现内循环不重复运行。

## Workspace 命令

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm lint:fix`
- `pnpm test`
- `pnpm test:external`
- `pnpm test:smoke`
- `pnpm typecheck`
- `pnpm verify`
- `pnpm e2e`
- `pnpm e2e:install`
- `pnpm e2e:install:browsers`
- 后端 Architecture Guard（唯一静态架构入口）：`pnpm check:architecture`
- 文档索引与 freshness guard：`pnpm check:docs`
- Env naming guard：`pnpm check:env-names`

`pnpm lint` 调度各 workspace 的 lint 与根 ESLint；根 lint 范围为 `scripts/` 和三个根 ESLint/Stylelint 配置。

## 测试与验证通道

`pnpm test` 以 Turbo concurrency 2 运行可缓存的普通测试。Package-local Vitest 普通测试使用 25% workers，Bun
普通测试使用 `--max-concurrency=2`。Architecture Guard 不进入 package `test`，由根级
`pnpm check:architecture` 单独执行。

`pnpm test:smoke` 以 Turbo concurrency 1 运行真实进程/端口 smoke，禁用任务缓存。当前共享 process harness、API、
Admin API、Worker 与 OIDC 的 package-local 命令为：

```bash
pnpm --filter @iam/api-core test:smoke
pnpm --filter @iam/api test:smoke
pnpm --filter @iam/admin-api test:smoke
pnpm --filter @iam/worker test:smoke
pnpm --filter @iam/oidc-provider test:smoke
```

`pnpm verify` 通过 `scripts/verify.mjs` 按以下顺序 fail-fast：

1. static：`pnpm lint`、`pnpm check:docs`、`pnpm check:env-names`、`pnpm check:architecture`；
2. typecheck：`pnpm typecheck`；
3. test：`pnpm test`；
4. smoke：`pnpm test:smoke`；
5. build：`pnpm build`。

外部资源检查不进入 `pnpm verify`，需要时显式运行：

```bash
# API/OIDC 真实 production entry 联合 PG/Redis 验证；四个 URL 都必须指向调用方独占、非生产、可销毁的资源
IAM_API_TEST_DATABASE_URL=<dedicated-url> IAM_API_TEST_REDIS_URL=<dedicated-url> \
IAM_OIDC_PROVIDER_TEST_DATABASE_URL=<dedicated-url> IAM_OIDC_PROVIDER_TEST_REDIS_URL=<dedicated-url> \
pnpm test:external

# 也可按 package 单独运行；缺少该 package 的任一 URL 会 fail fast，不会 skip 或回退
pnpm --filter @iam/api test:external
pnpm --filter @iam/oidc-provider test:external

# Database migration contract（guard、raw rollback、Drizzle journal replay、普通索引锁；需专用 IAM_DB_TEST_DATABASE_URL）
pnpm --filter @iam/db db:check
pnpm --filter @iam/db test:postgres

# Worker Subject Projection Client cutover contract（需专用 IAM_WORKER_TEST_DATABASE_URL）
pnpm --filter @iam/worker test:postgres

# Role assignment PostgreSQL contract（需由调用方提供专用 IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL）
pnpm --filter @iam/role-assignment-resolution test:postgres

# API Purveyor contact 并发 contract（需由调用方提供专用 IAM_API_TEST_DATABASE_URL）
pnpm --filter @iam/api test:postgres

# API Custom SSO Client runtime Redis contract（需由调用方提供专用 IAM_API_TEST_REDIS_URL）
pnpm --filter @iam/api test:redis

# OIDC Provider Session binding Redis contract（需由调用方提供专用 IAM_OIDC_PROVIDER_TEST_REDIS_URL）
pnpm --filter @iam/oidc-provider test:redis

# User Profile publication/cutover backfill 与 verify contract（需专用 IAM_USER_PROFILE_TEST_DATABASE_URL）
pnpm --filter @iam/user-profile-read-model test:postgres

# User Profile Subject Facts 单条/CAS/batch prewarm contract（需专用 IAM_USER_PROFILE_TEST_REDIS_URL）
pnpm --filter @iam/user-profile-read-model test:redis

# API Core Redis 与 Subject Access seed-if-absent contract（需专用 IAM_API_CORE_TEST_REDIS_URL）
pnpm --filter @iam/api-core test:redis

# Browser
pnpm --filter @iam/admin e2e
pnpm --filter @iam/sso e2e

# APISIX
pnpm gateway:apisix:validate -- <environment-arguments>
```

Ticket 12 不提供根级一键 rehearsal。维护者或 agent 按
[Custom SSO Subject Projection 硬切换与回滚手册](../releases/custom-sso-subject-projection-release.md)，在调用方拥有的临时
PostgreSQL/Redis 环境组合本节已有的 Worker backfill/verify、cleanup、API/OIDC external entry、hermetic process smoke、
数据库 rollback 和
下列近规模性能 lane 手动走完；只在 Historical 记录中保存候选 commit、实际命令、聚合计数/延迟、通过/失败和资源清理结果：

```bash
pnpm --filter @iam/user-profile-read-model test:rehearsal
```

不生成或提交 JSONL receipt、机器 evidence manifest/transcript。Client cutover manifest 与一次性 Secret 输出仍按下文作为
backfill 的业务输入处理，且不得把 URL credential、Token、Subject、完整 Redis key 或 Secret 写入验收记录。

Subject Projection tightening migration 通过 Drizzle 应用后，rollback 必须在 authentication traffic 与 user/client writes
均已停止的 maintenance freeze 内运行下列命令。命令读取显式 `DATABASE_URL`，默认精确补偿
`drizzle.__drizzle_migrations` 中 `20260801144944_sturdy_landau` 的 name、timestamp 与本地 migration SHA-256；identity
不一致时 fail closed，且 DDL 与 journal delete 位于同一 transaction。未通过 Drizzle migrator 的 raw-SQL rehearsal
没有 journal row，可直接执行 migration 目录内的幂等 `rollback.sql`。

```bash
pnpm --filter @iam/db subject-projection:rollback
```

## 工具链性能入口

```bash
# 绕过 Turbo task cache 的强制执行
pnpm exec turbo typecheck --force --concurrency=3
pnpm exec turbo test --force --concurrency=2

# ESLint profile 交错采样
node scripts/benchmark-eslint-config.mjs --rounds 5
```

`--force` 不会清空操作系统文件缓存。性能比较应使用相同命令和 runner，记录墙钟、CPU 与最大 RSS，一次只调整一个
并行层。

TypeScript CLI 与兼容 API 的版本检查：

```bash
pnpm exec tsc --version
node -e "const wrapper=require('typescript/package.json'); const api=require('typescript'); console.log(wrapper.name, wrapper.version, api.version)"
```

## Commit 前检查

`pnpm install` 的 `prepare` 生命周期安装版本化 Husky hook。pre-commit 只运行：

```bash
git diff --cached --check
```

Hook 不运行 lint、typecheck、test、build 或 tracker checker。按改动范围在 commit 前显式运行本页“实现内循环”中的
相关命令。

## Workspace 入口

- API backend：`pnpm --filter @iam/api <dev|serve|lint|test|test:external|test:postgres|test:redis|test:smoke|typecheck>`
- Admin API backend：`pnpm --filter @iam/admin-api <dev|serve|lint|test|test:smoke|typecheck>`
- OIDC provider：`pnpm --filter @iam/oidc-provider <dev|serve|lint|test|test:external|test:redis|test:smoke|typecheck>`
- API Core：`pnpm --filter @iam/api-core <lint|test|test:redis|test:smoke|typecheck>`
- Client Subject Projection：`pnpm --filter @iam/client-subject-projection <lint|test|typecheck>`
- User Profile Read Model：`pnpm --filter @iam/user-profile-read-model <lint|test|test:postgres|test:redis|test:rehearsal|typecheck>`
- Worker：`pnpm --filter @iam/worker <dev|serve|lint|test|test:smoke|typecheck|user-profile:backfill|user-profile:repair|subject-projection:backfill|subject-projection:verify>`
- 仅处理 Subject Access indexed backlog：
  `pnpm --filter @iam/worker run user-profile:repair -- --subject-access-only --limit <positive-integer>`
- Subject Projection cutover：
  `pnpm --filter @iam/worker subject-projection:backfill -- --manifest <path> --secret-output <new-path> [--batch-size <positive-integer>] [--after-user-id <safe-cursor>]`
- Subject Projection 独立只读 gate：
  `pnpm --filter @iam/worker subject-projection:verify -- --manifest <path> [--batch-size <positive-integer>]`
- Custom SSO hard cutover 旧会话清理：
  `pnpm --filter @iam/api-core session:cleanup-custom-sso-cutover -- --dry-run --batch-size 500`；核对摘要后把
  `--dry-run` 改为 `--verify`，有残留时必须非零退出；确认门禁有效后改为 `--apply`，完成后再以
  `--verify` 零退出收尾。
- Admin frontend：`pnpm --filter @iam/admin <dev|build|lint|test|e2e|typecheck|format>`
- SSO frontend：`pnpm --filter @iam/sso <dev|build|lint|test|e2e|typecheck|format>`
- Database：`pnpm --filter @iam/db <lint|test|test:postgres|typecheck|db:push|db:generate|db:migrate|db:check>`
- Gateway：`pnpm --filter @iam/gateway-apisix <validate|diff|apply|lint|test|typecheck>`

共享 packages 使用相同的 filtered 模式，例如：

```bash
pnpm --filter @iam/domain test
pnpm --filter @iam/domain lint
pnpm --filter @iam/domain typecheck
```

Cutover manifest 必须显式列出全部启用中的 legacy Custom SSO client。Independent client 的新 secret 只生成一次，
`--secret-output` 使用 exclusive create 和 `0600` mode；不得把文件内容或 secret 写入日志。delivery 为 `pending` 时
client 保持 disabled，operator 完成外部交付后将 manifest 标记为 `confirmed` 并重跑 backfill。若输出文件已创建但 DB
apply 失败，保留该文件用于审计、改用新的 exclusive 路径重跑，确认旧 secret 未生效后再按操作规程销毁。Client apply
会在同一 SQL update 中删除六个 legacy Custom SSO `ext_attributes` key 并保留其他属性；独立 verify 检测到任一残留时
以 `legacy-attributes-not-removed` 阻断切换。

正式执行顺序为：maintenance freeze、backfill（可从最后 safe cursor 恢复）、独立 `verify`。只有 verify 返回 passed
才可继续 migration 收紧与流量切换；failed report 返回非零退出码。收紧 migration 使用普通唯一索引，必须保持 freeze，
不得在仍有 `user_profile` writer 时执行。

`session:cleanup-custom-sso-cutover` 固定使用仓库内建 allowlist，只覆盖旧 `global_session:*` Principal Session、Custom
SSO grant/local-session/reverse/set 与 `custom-sso:local-session-payload:*`。该命令不会扫描或删除任何 `oidc:*` key，且不
接受外部 `--pattern`。原 `session:cleanup-legacy-keys` 仍保持包含 OIDC legacy key 的完整默认范围，供既有 Session Kernel
与 OIDC 迁移手册使用；Custom SSO hard cutover 不得改用该完整命令。完整维护窗口顺序、四类 smoke 与回滚边界见
[Custom SSO Subject Projection 硬切换与回滚手册](../releases/custom-sso-subject-projection-release.md)。
