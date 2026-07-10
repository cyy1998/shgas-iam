# 构建、测试与开发命令

尽量使用 workspace package scripts 和 `pnpm --filter`，让 Turborepo 与 package-local tooling 负责执行细节。

## Workspace 命令

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm test`
- `pnpm e2e`
- `pnpm typecheck`
- OpenSpec strict validation 与 archive integrity 聚合检查：`pnpm check:openspec`
- 只排查 archive integrity：`pnpm check:openspec:archives`
- 文档索引与 freshness guard：`pnpm check:docs`
- Env naming guard：`pnpm check:env-names`

`check:openspec` 使用仓库固定的 OpenSpec CLI，以 strict、non-interactive 模式验证全部主规格和 active changes，再检查所有 archive 的命名、metadata、必需 artifacts、delta specs 与 task 完成状态。历史 archive 例外记录在 `openspec/archive-integrity-waivers.json`，只允许精确的 archive + rule ID，并且必须保留原因和残余风险。

## Pre-commit

- 安装或刷新本仓库管理的 hook：`pnpm hooks:install`。根 `prepare` 在有 `.git` metadata 时执行同一安装逻辑；无 `.git` 的构建环境会安全跳过。
- 手动运行 staged 路由：`pnpm precommit`。
- `nano-staged` 只在 `openspec/**`、OpenSpec guard 脚本/测试或其根工具配置进入暂存区时运行一次 `pnpm run check:openspec --staged`；普通业务代码不会触发全量 OpenSpec 检查。
- Staged runner 会隔离同一文件的未暂存 hunks；若仍有其他未暂存或未跟踪的 OpenSpec 敏感文件，scope guard 会失败并要求开发者先整理 staging，不会把这些文件自动纳入提交。
- `git commit --no-verify` 可以绕过本地 hook，因此该 hook 只提供快速反馈，不构成远端信任边界。后续 CI 必须直接复用 `pnpm check:openspec`。

根开发工具链要求 Node 24；OpenSpec CLI、`nano-staged` 与 `simple-git-hooks` 均在根 `devDependencies` 中固定版本。

## 后端 Apps

- API backend：`pnpm --filter @iam/api <dev|serve|lint|test|typecheck>`
- Admin API backend：`pnpm --filter @iam/admin-api <dev|serve|lint|test|typecheck>`
- OIDC provider：`pnpm --filter @iam/oidc-provider <dev|serve|lint|test|typecheck>`
- Worker app：`pnpm --filter @iam/worker <dev|serve|lint|test|typecheck|user-profile:backfill|user-profile:repair>`

## 共享 Packages

使用相同的 filtered `lint`、`test` 和 `typecheck` 模式，例如：

```bash
pnpm --filter @iam/domain typecheck
```

## 数据库

- `pnpm --filter @iam/db <db:push|db:generate|db:migrate|db:check>`
- `@iam/api` 保留 `db:push`、`db:generate` 和 `db:migrate` 的 compatibility wrapper。
- Historical migration：`pnpm --filter @iam/api migrate:mysql-to-postgres`

## 前端 Apps

- Admin frontend：`pnpm --filter @iam/admin <dev|build|lint|test|e2e|typecheck|format>`
- SSO frontend：`pnpm --filter @iam/sso <dev|build|lint|test|e2e|typecheck|format>`

## Gateway 命令

使用 root shortcut `pnpm gateway:apisix:<validate|diff|apply>`，或：

```bash
pnpm --filter @iam/gateway-apisix <validate|diff|apply|lint|test|typecheck>
```
