# 收敛公开测试语言与最小命令面

Type: grilling

Status: resolved

Blocked by: None — can start immediately

## Question

在 Unit、Integration、E2E 三层目标不变的前提下，仓库真正需要公开哪些 Integration profiles、root commands 和 run sets，
才能让测试归属唯一且调用方式易懂，又不把 `component/process/redis/postgres/composition/browser` 或
`fast/infra/smoke/destructive/all` 重新塑造成隐性测试层级？

本 ticket 需要与维护者共同决定：

- 每个 profile 的稳定定义，以及多资源测试是使用全局优先级还是更小的 harness-owner 规则；
- canonical command、聚合 command 和 compatibility alias 的最小集合；
- `test`、`test:unit`、各 Integration 入口和 `test:e2e` 的用户预期；
- run set 是否值得成为长期公开概念，还是只保留少量显式聚合命令；
- 哪些命名只服务迁移，必须带退出条件，不能进入长期架构词汇。

若六个 profiles、全局优先级或完整 run-set taxonomy 的收益不足以抵消认知与维护成本，必须把简化选项作为明确取舍交给维护者。

## Answer

维护者确认以 Unit、Integration、E2E 作为唯一测试层级，并采用以下长期公开 interface。

### Integration profiles

Integration 保留六个稳定 profile；profile 只表示测试重点及其 harness/runner 对执行和资源生命周期的所有权，不表示新的
测试层级、运行速度、gate 或业务范围：

- `component`：进程内验证多个 module 的协作；真实出站依赖由 fake 或 in-memory adapter 替代，不启动真实子进程、
  浏览器、PostgreSQL 或 Redis。
- `process`：真实子进程、端口、readiness、退出行为和进程树清理是测试重点。
- `redis`：真实 Redis 语义及生产 Redis adapter 是测试重点。
- `postgres`：真实 PostgreSQL schema、事务或 repository 是测试重点。
- `composition`：production composition wiring 及多个真实 adapter 的协作是测试重点。
- `browser`：真实浏览器 harness 驱动测试，允许替代当前测试不经过的系统 seam；若 journey 经过的本仓库核心模块均为
  真实实现，则归入 E2E。

每个 Integration 测试文件只归属一个 profile。多资源测试按测试重点及 harness owner 归属，不采用
`browser > composition > process > redis > postgres > component` 之类的全局优先级。

### Canonical commands

长期 canonical root commands 只有：

```text
pnpm test:unit
pnpm test:integration
pnpm test:integration:component
pnpm test:integration:process
pnpm test:integration:redis
pnpm test:integration:postgres
pnpm test:integration:composition
pnpm test:integration:browser
pnpm test:e2e
```

- `test:unit` 只运行 Unit，不启动真实端口、子进程、浏览器或基础设施。
- 每个 `test:integration:<profile>` 只运行该 profile。
- `test:integration` 运行全部六个 profiles；开始执行前统一检查所需资源，缺少调用方提供的专用资源时一次性说明并
  fail fast，不 silent skip、不回退 runtime 配置，也不另设重复的 `test:integration:all`。
- 普通 Integration 继续使用调用方提供的专用 PostgreSQL/Redis；只有 `test:e2e` 运行 Full-system E2E 并管理其完整
  系统资源生命周期。
- `test` 永久保留为 `test:unit` 的便利 alias；`test:unit` 仍是 canonical command。该 alias 在迁移时直接采用 Unit
  语义，不保留当前 `test` 中未来会归入 Integration 的收集范围。

Root 与 workspace package 使用同一套 `test:unit`、`test:integration:<profile>` 命令语法，不维护另一套 package-local
短名称。

### Gates and run sets

长期 gate commands 只有：

```text
pnpm verify
  static -> typecheck -> test:unit -> build

pnpm verify:ci
  verify -> test:integration

pnpm verify:release
  verify:ci -> test:e2e
```

这些命令表达验证目的，不形成新的测试层级。公开架构不引入 `fast`、`infra`、`smoke`、`full`、`all`、`destructive`
等 run-set taxonomy；破坏性、串行和独占资源要求属于 harness 安全约束。只有未来出现至少两个稳定调用方且现有 gate
无法表达其需求时，才重新评估新增聚合命令。

### Migration-only names

- 现有 mock-backend Playwright 测试直接迁入 `test:integration:browser`，裸 `e2e` 立即删除，不重定向到新
  `test:e2e`。
- 现有 `test:external` 覆盖直接迁入 `test:integration:composition`，旧命令立即删除。
- 现有 `test:smoke` 覆盖按 harness owner 拆入 `component`、`process`、`redis` 或 `composition`，旧聚合命令立即删除。
- 现有 package-local `test:redis`、`test:postgres`、`test:smoke`、`test:external` 和 `e2e` 直接重命名或删除，不保留
  aliases。

除永久的 `test -> test:unit` 外，不建立 migration-only aliases。维护者明确接受这些命令直接切换，并以本答案覆盖 map
Notes 中“旧入口至少保留一个发布周期并保持原语义”的先前约束。
