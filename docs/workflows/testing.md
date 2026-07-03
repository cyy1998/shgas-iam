# 测试与验证流程

本流程承接 [AGENTS.md](../../AGENTS.md) 和 [development.md](development.md)，说明如何为一次改动选择验证范围、编写测试、运行命令、执行 smoke，并记录证据。目标是用最窄但足够可信的验证证明改动正确，同时在共享契约或跨 app 影响出现时主动扩大范围。

## 验证原则

- 先理解风险，再选择命令；不要把全量测试当作唯一答案，也不要用过窄检查替代必要的契约验证。
- bug 报告先复现或定位失败信号，再修复根因，最后证明原失败路径已被覆盖。
- 优先使用 package script 和 workspace filter，例如 `pnpm --filter @iam/api test`；只有在需要定位单个文件时才直接调用底层 runner。
- 类型、lint、单元测试、schema command、文档 guard、smoke、日志和指标查询都算验证；选择与改动风险相匹配的组合。
- 每次交付都说明实际运行的命令和结果。未运行某类验证时，说明原因和剩余风险。

## 验证步骤

1. Scope：列出触及文件、模块边界、共享契约、运行时入口、数据迁移和用户可见行为。
2. Baseline：失败修复先复现问题；重构或文档改动至少检查现有 guard 是否能覆盖当前风险。
3. Select：从验证矩阵中选择最窄有意义命令；跨 app、共享包、schema、auth/session/OIDC、队列和 gateway 改动需要扩大范围。
4. Implement tests：行为变化优先补或改测试；后端服务/handler/adapter 测试使用工厂和 DI fake，避免 mock app-local singleton；前端关键流程使用包内 Vitest 或 E2E。
5. Run：先跑聚焦命令，再按影响面补 typecheck、lint、schema 或 smoke。若聚焦命令失败，不要用无关大命令掩盖失败。
6. Inspect：查看失败输出、日志、生成 diff 和关键断言；确认失败是本次改动导致、已有问题，还是环境问题。
7. Record：最终说明记录命令、结果、跳过项和残余风险；发布或运维类验证应把可复用证据沉淀到对应 runbook 或 release record。

## 测试编写规则

- 测试文件放在被测代码旁的 `__tests__/` 目录，例如 `src/services/position/__tests__/position.service.test.ts`。
- 断言外部行为、契约和边界条件，不只断言实现细节。
- 事务、审计、队列、OIDC/session、Redis/cache、gateway manifest 和数据库 schema 改动要覆盖失败、幂等、回滚或兼容路径。
- 后端服务/handler/adapter 测试构造 factories 并传入 DI fakes；不要为 app-local service、repository、db、redis、logger 使用 `mock.module`。
- 前端测试覆盖用户能观察到的状态、交互和错误提示；关键流程变更补 mocked E2E 或 smoke。
- 新增 fixture、snapshot 或迁移输出时，只提交任务拥有的稳定产物，避免把本地缓存和运行报告纳入 diff。

## 验证矩阵

优先运行最窄有意义的检查；共享契约或跨 app 改动需要扩大验证范围。

| 改动范围 | 建议验证 |
|---|---|
| `docs/**/*.md` | `pnpm check:docs` |
| `AGENTS.md`、`.codex/skills/**/*.md`、流程文档 | `pnpm check:docs`，再人工检查相关链接和流程一致性 |
| env 命名、`.env.example`、Docker env | `pnpm check:env-names`；必要时启动依赖栈确认变量被实际消费 |
| `apps/api` | `pnpm --filter @iam/api lint`、`test`、`typecheck` 中相关项；公开路由变化补 `/doc` 或接口 smoke |
| `apps/admin-api` | `pnpm --filter @iam/admin-api lint`、`test`、`typecheck` 中相关项；admin REST/tRPC 变化补 `/admin/doc`、`/rpc/doc` 或接口 smoke |
| `apps/oidc-provider` | `pnpm --filter @iam/oidc-provider lint`、`test`、`typecheck`；OIDC/session/security 改动补 discovery、JWKS、authorize、token 或 UserInfo smoke |
| `apps/worker` | `pnpm --filter @iam/worker lint`、`test`、`typecheck`；队列/read-model 行为同时检查 `@iam/jobs` 和 `@iam/user-profile-read-model` |
| `apps/admin` 或 `apps/sso` | `pnpm --filter @iam/<app> lint`、`test`、`typecheck`；关键用户流程改动运行对应 `e2e` 或浏览器 smoke |
| `packages/contracts` | 包自身 typecheck/test，加上所有直接消费 app 或 package 的 typecheck |
| `packages/api-core`、`domain`、`jobs`、`user-profile-read-model` | 包自身 typecheck/test，加上直接受影响 app 的 typecheck；队列或 read-model 行为补 worker 检查 |
| `packages/db` schema/relations/migrations | `pnpm --filter @iam/db db:check`；本地同步用 `db:push`，产出迁移时运行 `db:generate` + `db:migrate`；再跑相关 typecheck |
| tRPC contract consumed by admin | `pnpm --filter @iam/admin-api typecheck` 和 `pnpm --filter @iam/admin typecheck` |
| auth、permission、session、audit、tenant 边界 | 受影响 backend test/typecheck；补失败路径、权限拒绝、审计事件和 smoke |
| APISIX gateway manifest/script | `pnpm gateway:apisix:validate -- --env <env>:<app>`；脚本改动再跑 `pnpm --filter @iam/gateway-apisix typecheck` 或 `test` |
| OpenSpec artifacts | `openspec validate <change-name> --strict` 或对应仓库脚本；归档前补实现侧验证 |
| repo scripts | 脚本自身 dry run 或聚焦命令；TypeScript 脚本补 `typecheck` 或直接运行目标命令 |

## Smoke 入口

- Public API Scalar UI：`http://localhost:30000` 或 public tier `/doc`。
- Admin API Scalar UI：`http://localhost:30001`、`/admin/doc`、`/rpc/doc`。
- OIDC direct dev port：`http://localhost:30015`。
- OIDC gateway：`http://localhost:30080/oidc`。
- Worker health/Bull Board：`http://localhost:30016/healthz` 和 `/admin/queues`，仅 dashboard 启用时使用。
- Frontend flows：根据改动运行 `@iam/admin` 或 `@iam/sso` mocked E2E，也可以用浏览器手动 smoke 关键路径。
- Logs/metrics：发布、网关、队列、审计、OIDC/session 和观测改动应查询对应日志、trace 或 dashboard，并记录筛选条件。

With `docker/docker-compose-dev.yml`, direct backend host ports are `http://localhost:30011` for `api`,
`http://localhost:30012` for `admin-api`, `http://localhost:30015` for `oidc-provider`, and `http://localhost:30016`
for the worker dashboard. APISIX gateway host ports are `http://localhost:30080` and `https://localhost:30443`.

## 失败处理

- 验证失败时先保留失败信号，不要立即删除或覆盖可诊断输出。
- 如果失败来自本次改动，修复后重跑同一命令，再按影响面补充相关检查。
- 如果失败是已有问题或环境问题，记录命令、关键错误、判断依据和未覆盖风险。
- 如果无法运行必要验证，说明缺失依赖、服务、凭据或数据前提，并给出可恢复后应运行的命令。
