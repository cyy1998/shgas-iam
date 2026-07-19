# 构建、测试与开发命令

尽量使用 workspace package scripts 和 `pnpm --filter`，让 Turborepo 与 package-local tooling 负责执行细节。

## Workspace 命令

- `pnpm dev`
- `pnpm build`
- `pnpm lint`（包含无参数的全局 workflow 记录格式检查）
- `pnpm test`（包含 workflow CLI tests）
- `pnpm e2e`
- `pnpm typecheck`
- 文档索引与 freshness guard：`pnpm check:docs`
- Env naming guard：`pnpm check:env-names`
- Workflow 记录格式 guard：`pnpm check:workflow`
- Workflow CLI 聚焦测试：`pnpm test:workflow`

根开发工具链要求 Node 24。具体功能在提交前运行受影响 package 的测试、lint 和 typecheck；功能结束时执行全仓检查。
ticket 生命周期、验证层级和提交授权见 [Engineering workflow](../agents/workflow.md)。

## Commit 前检查

`pnpm install` 的 `prepare` 生命周期会安装版本化 Husky hook。pre-commit 只执行以下两项 guard：

```bash
git diff --cached --check
bun scripts/check-workflow.ts
```

前者检查 staged whitespace；后者在只包含 index 中 checker 与 `.scratch/` 的临时快照内运行，检查实际待提交 v2 记录的 Markdown 格式完整性，并在退出时删除快照。直接使用无第三方运行时依赖的 checker，避免临时快照触发依赖安装；工作树中的未暂存版本不会替代或干扰 staged 记录。Hook 不运行全仓
lint、typecheck、test 或 build，不分类 staged diff，也不检查当前分支、提交历史、ticket 状态转换或目标分支策略。
Checker 通过不等于 workflow gate、实际验证、评审或人工授权已经通过；这些责任继续由
[Engineering workflow](../agents/workflow.md)、agent preflight、实际命令结果和双轴评审承担。

维护者可在紧急情况下显式使用 `git commit --no-verify`，但这不是 agent 的常规路径，也不构成任何阶段授权。
Hook 未安装或损坏时运行 `pnpm prepare` 恢复；也可分别运行 `git diff --cached --check` 和
`pnpm check:workflow` 定位 whitespace 或当前工作树记录问题；若只有 hook 失败，还应检查 staged 记录与工作树是否不同。按改动范围仍需显式运行检查并在 ticket 的 `Resolution` 中记录结果：文档改动至少运行
`pnpm check:docs`，依赖改动增加冻结锁文件安装验证。

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

角色分配解析的默认测试不依赖外部服务。真实 PostgreSQL 规则矩阵要求
`IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL` 指向专用非系统测试库，并显式运行：

```bash
pnpm --filter @iam/role-assignment-resolution test:postgres
```

该命令只在随机隔离 schema 中应用当前 migrations 并在结束后清理；不回退 `DATABASE_URL`，也不自行启动容器。

## 数据库

- `pnpm --filter @iam/db <db:push|db:generate|db:migrate|db:check>`
- `@iam/api` 保留 `db:push`、`db:generate` 和 `db:migrate` 的 compatibility wrapper。

## 前端 Apps

- Admin frontend：`pnpm --filter @iam/admin <dev|build|lint|test|e2e|typecheck|format>`
- SSO frontend：`pnpm --filter @iam/sso <dev|build|lint|test|e2e|typecheck|format>`

## Gateway 命令

使用 root shortcut `pnpm gateway:apisix:<validate|diff|apply>`，或：

```bash
pnpm --filter @iam/gateway-apisix <validate|diff|apply|lint|test|typecheck>
```
