# 构建、测试与开发命令

根工具链要求 Node.js 24 与仓库 `packageManager` 声明的 pnpm 版本。优先使用 workspace script 和
`pnpm --filter`，让 Turborepo 与 package-local tooling 负责执行细节。

## 实现内循环

按当前 ticket 的受影响范围选择命令：

```bash
pnpm --filter <workspace> test
pnpm --filter <workspace> lint
pnpm --filter <workspace> typecheck
pnpm check:docs
git diff --check
```

根工具链变化的聚焦 Bun 测试：

```bash
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
- `pnpm test:smoke`
- `pnpm typecheck`
- `pnpm verify`
- `pnpm e2e`
- `pnpm e2e:install`
- `pnpm e2e:install:browsers`
- 文档索引与 freshness guard：`pnpm check:docs`
- Env naming guard：`pnpm check:env-names`

`pnpm lint` 调度各 workspace 的 lint 与根 ESLint；根 lint 范围为 `scripts/` 和三个根 ESLint/Stylelint 配置。

## 测试与验证通道

`pnpm test` 以 Turbo concurrency 2 运行可缓存的普通测试。Package-local Vitest 普通测试使用 25% workers，Bun
普通测试使用 `--max-concurrency=2`。

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

1. static：`pnpm lint`、`pnpm check:docs`、`pnpm check:env-names`；
2. typecheck：`pnpm typecheck`；
3. test：`pnpm test`；
4. smoke：`pnpm test:smoke`；
5. build：`pnpm build`。

外部资源检查不进入 `pnpm verify`，需要时显式运行：

```bash
# PostgreSQL
pnpm --filter @iam/db db:check
pnpm --filter @iam/role-assignment-resolution test:postgres

# Browser
pnpm --filter @iam/admin e2e
pnpm --filter @iam/sso e2e

# APISIX
pnpm gateway:apisix:validate -- <environment-arguments>
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

- API backend：`pnpm --filter @iam/api <dev|serve|lint|test|test:smoke|typecheck>`
- Admin API backend：`pnpm --filter @iam/admin-api <dev|serve|lint|test|test:smoke|typecheck>`
- OIDC provider：`pnpm --filter @iam/oidc-provider <dev|serve|lint|test|test:smoke|typecheck>`
- API Core：`pnpm --filter @iam/api-core <lint|test|test:smoke|typecheck>`
- Worker：`pnpm --filter @iam/worker <dev|serve|lint|test|test:smoke|typecheck|user-profile:backfill|user-profile:repair>`
- Admin frontend：`pnpm --filter @iam/admin <dev|build|lint|test|e2e|typecheck|format>`
- SSO frontend：`pnpm --filter @iam/sso <dev|build|lint|test|e2e|typecheck|format>`
- Database：`pnpm --filter @iam/db <db:push|db:generate|db:migrate|db:check>`
- Gateway：`pnpm --filter @iam/gateway-apisix <validate|diff|apply|lint|test|typecheck>`

共享 packages 使用相同的 filtered 模式，例如：

```bash
pnpm --filter @iam/domain test
pnpm --filter @iam/domain lint
pnpm --filter @iam/domain typecheck
```
