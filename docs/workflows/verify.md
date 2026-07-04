# Verify 阶段

本阶段承接 [index.md](index.md) 的 Verify 状态，用于为一次改动选择验证范围、复核测试覆盖、运行命令、执行 smoke，并记录证据。目标是用最窄但足够可信的验证证明改动正确，同时在共享契约或跨 app 影响出现时主动扩大范围。

## 快速选择

先理解风险，再选择命令；不要把全量测试当作唯一答案，也不要用过窄检查替代必要的契约验证。

- bug 报告先复现或定位失败信号，再修复根因，最后证明原失败路径已被覆盖。
- 优先使用 package script 和 workspace filter，例如 `pnpm --filter @iam/api test`；只有在需要定位单个文件时才直接调用底层 runner。
- 类型、lint、单元测试、schema command、文档 guard、smoke、日志和指标查询都算验证；选择与改动风险相匹配的组合。
- 共享契约、跨 app、schema、auth/session/OIDC、队列和 gateway 改动需要扩大范围。
- 最终验证必须发生在最后一次相关代码、契约、artifact、配置或 workflow 文档修改之后；如果验证后又修改了受影响内容，必须重跑对应验证或记录为什么无需重跑。
- 每次交付都说明实际运行的命令和结果。未运行某类验证时，说明原因和剩余风险。

## 验证流程

1. Scope：列出触及文件、模块边界、共享契约、运行时入口、数据迁移和用户可见行为。
2. Baseline：失败修复先复现问题；重构或文档改动至少检查现有 guard 是否能覆盖当前风险。
3. Select：从验证矩阵中选择最窄有意义命令；跨 app、共享包、schema、auth/session/OIDC、队列和 gateway 改动需要扩大范围。
4. Coverage：复核实现阶段已有测试是否覆盖关键行为、契约和风险路径；如果缺少必要测试，回到 [implement.md](implement.md) 并按 `$tdd` 补齐后再重新验证。
5. Run：先跑聚焦命令，再按影响面补 typecheck、lint、schema 或 smoke。若聚焦命令失败，不要用无关大命令掩盖失败；若命令后又有相关修改，重新运行受影响命令。
6. Inspect：查看失败输出、日志、生成 diff 和关键断言；确认失败是本次改动导致、已有问题，还是环境问题。
7. Record：最终说明记录命令、结果、跳过项和残余风险；发布或运维类验证应把可复用证据沉淀到对应 runbook 或 release record。

OpenSpec 归档前必须确认 OpenSpec artifacts、tasks 和实现一致，并进入本阶段验证流程。新发现推翻假设或扩大范围时，先更新计划、artifacts 或记录偏离原因，再继续实现。

## 测试覆盖复核

本节不定义实现后补测试流程；测试编写属于 [implement.md](implement.md) 的实现循环，触发 TDD 时必须按 `$tdd` 先写失败测试再写实现。Verify 阶段只判断测试证据是否足够，并在发现缺口时回到 Implement 补齐。

- 确认触发 TDD 的 feature、fix 和行为变化已在实现阶段按已确认 seam 写测试；缺少时视为流程缺口，回到 [implement.md](implement.md)。
- 检查测试是否断言外部行为、契约和边界条件，而不是只绑定实现细节。
- 检查事务、审计、队列、OIDC/session、Redis/cache、gateway manifest 和数据库 schema 改动是否覆盖失败、幂等、回滚或兼容路径。
- 检查后端服务/handler/adapter 测试是否使用 factories 和 DI fakes，避免 mock app-local singleton。
- 检查前端关键流程是否覆盖用户可观察状态、交互和错误提示；必要时补 mocked E2E 或 smoke。
- 检查新增 fixture、snapshot 或迁移输出是否为任务拥有的稳定产物，避免把本地缓存和运行报告纳入 diff。

## 验证矩阵

优先运行最窄有意义的检查；共享契约或跨 app 改动需要扩大验证范围。下列条目使用清单而不是宽表，避免长命令或 smoke 覆盖被 Markdown 表格截断。

- 文档变更（`docs/**/*.md`、`AGENTS.md`、`.codex/skills/**/*.md`）：运行 `pnpm check:docs`；涉及流程文档时，再人工检查相关链接和流程一致性。
- env 命名、`.env.example`、Docker env：运行 `pnpm check:env-names`；必要时启动依赖栈确认变量被实际消费。
- `apps/api`：按影响面运行 `pnpm --filter @iam/api lint`、`pnpm --filter @iam/api test`、`pnpm --filter @iam/api typecheck`；公开路由变化补 `/doc` 或接口 smoke。
- `apps/admin-api`：按影响面运行 `pnpm --filter @iam/admin-api lint`、`pnpm --filter @iam/admin-api test`、`pnpm --filter @iam/admin-api typecheck`；admin REST/tRPC 变化补 `/admin/doc`、`/rpc/doc` 或接口 smoke。
- `apps/oidc-provider`：运行 `pnpm --filter @iam/oidc-provider lint`、`pnpm --filter @iam/oidc-provider test`、`pnpm --filter @iam/oidc-provider typecheck`；OIDC/session/security 改动补 discovery、JWKS、authorize、token、UserInfo 或 RP-Initiated Logout smoke。
- `apps/worker`：运行 `pnpm --filter @iam/worker lint`、`pnpm --filter @iam/worker test`、`pnpm --filter @iam/worker typecheck`；队列/read-model 行为同时检查 `@iam/jobs` 和 `@iam/user-profile-read-model`。
- `apps/admin` 或 `apps/sso`：运行 `pnpm --filter @iam/<app> lint`、`pnpm --filter @iam/<app> test`、`pnpm --filter @iam/<app> typecheck`；关键用户流程改动运行对应 `e2e` 或浏览器 smoke；页面、路由、构建配置或视觉类改动补 `pnpm --filter @iam/<app> build`、截图 smoke 或人工 smoke。
- `packages/contracts`：运行包自身 typecheck/test，加上所有直接消费 app 或 package 的 typecheck。
- `packages/api-core`、`packages/domain`、`packages/jobs`、`packages/user-profile-read-model`：运行包自身 typecheck/test，加上直接受影响 app 的 typecheck；队列或 read-model 行为补 worker 检查。
- `packages/db` schema/relations/migrations：运行 `pnpm --filter @iam/db db:check`；本地同步用 `db:push`，产出迁移时运行 `db:generate` + `db:migrate`；再跑相关 typecheck。
- tRPC contract consumed by admin：运行 `pnpm --filter @iam/admin-api typecheck` 和 `pnpm --filter @iam/admin typecheck`。
- auth、permission、session、audit、tenant 边界：运行受影响 backend test/typecheck；补失败路径、权限拒绝、审计事件和 smoke。
- APISIX gateway manifest/script：运行 `pnpm gateway:apisix:validate -- --env <env>:<app>`；脚本改动再跑 `pnpm --filter @iam/gateway-apisix typecheck` 或 `pnpm --filter @iam/gateway-apisix test`。
- OpenSpec artifacts：运行 `openspec validate <change-name> --strict` 或对应仓库脚本；归档前补实现侧验证。
- repo scripts：运行脚本自身 dry run 或聚焦命令；TypeScript 脚本补 `typecheck` 或直接运行目标命令。

## Smoke 和运行信号

选择 smoke URL 前先确认当前运行方式，避免把本机 dev 端口和 Docker dev 宿主机映射端口混用。

- 本机 `pnpm dev` 后端默认端口：public API `http://localhost:30000`，admin API `http://localhost:30001`，OIDC Provider `http://localhost:30002`，worker HTTP `http://localhost:30003`。
- Docker dev 直连宿主机端口：api `http://localhost:30011`，admin-api `http://localhost:30012`，oidc-provider `http://localhost:30015`，worker dashboard `http://localhost:30016`。
- Docker dev APISIX gateway：HTTP `http://localhost:30080`，HTTPS `https://localhost:30443`，OIDC gateway `http://localhost:30080/oidc`。
- API docs smoke：public tier `/doc`，admin REST `/admin/doc`，admin tRPC `/rpc/doc`。
- Worker smoke：health `http://localhost:30016/healthz`；Bull Board `http://localhost:30016/admin/queues`，仅 dashboard 启用时使用。
- Frontend flows：根据改动运行 `@iam/admin` 或 `@iam/sso` mocked E2E，也可以用浏览器手动 smoke 关键路径。
- Logs/metrics：发布、网关、队列、审计、OIDC/session 和观测改动应查询对应日志、trace 或 dashboard，并记录筛选条件。

## 失败与记录

- 验证失败时先保留失败信号，不要立即删除或覆盖可诊断输出。
- 如果失败来自本次改动，修复后重跑同一命令，再按影响面补充相关检查。
- 如果失败是已有问题或环境问题，记录命令、关键错误、判断依据和未覆盖风险。
- 如果无法运行必要验证，说明缺失依赖、服务、凭据或数据前提，并给出可恢复后应运行的命令。
- 最终说明必须记录实际运行的命令、结果、跳过项和残余风险，并确认这些验证覆盖最后一次相关修改。

## 退出条件

- 必要验证通过，或失败已明确分类为已有问题、环境问题或阻塞项。
- OpenSpec artifacts、tasks 和实现一致。
- 用户已确认验证结论和下一步方向；若下一步是 Archive，用户已确认进入 Archive 后将自动执行提交、合并、归档和本地分支清理，不再二次确认。
- 下一步在用户确认后进入 [archive.md](archive.md)，或回到 [implement.md](implement.md) 修复问题。
