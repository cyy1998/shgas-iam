# 构建、测试与开发命令

尽量使用 workspace package scripts 和 `pnpm --filter`，让 Turborepo 与 package-local tooling 负责执行细节。

## Workspace 命令

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm test`
- `pnpm e2e`
- `pnpm typecheck`
- 文档索引与 freshness guard：`pnpm check:docs`
- Env naming guard：`pnpm check:env-names`

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
