# @iam/worker

Worker 常驻消费 `user-document` 与 `organization-document` 队列，提供 health/readiness 及可选内部 Bull Board，并按配置运行两类周期 repair。

```bash
pnpm --filter @iam/worker dev
pnpm --filter @iam/worker serve
pnpm --filter @iam/worker test:unit
pnpm --filter @iam/worker typecheck
```

配置由 [.env.example](.env.example) 和 `src/env.ts` 定义。`IAM_WORKER_ENABLED_MODULES` 支持 `all`、`none` 或模块列表；`none` 只提供 health/dashboard。Bull Board 默认只读，启用时遵守生产 Basic Auth 配置。

## 周期 repair

Worker composition 负责模块选择、队列、consumer、health/readiness 和 Bull Board，未知模块启动失败，关闭时按模块反序执行。
周期 repair 仅在对应 consumer 与开关同时开启时运行，两类任务各自启动首轮，并在本轮结束后等待配置间隔。
每轮由 Worker 的私有入口使用显式输入、独立进程、连接和 deadline。跨实例由持久领取、版本与 token 仲裁。
组织 repair 重新投递到正式队列，发布仍由普通 consumer 完成。

停机先停止调度，终止并等待所属 repair 子进程，再确认本轮 PostgreSQL invocation 连接已关闭，随后关闭常驻资源。
父进程持有连接 UUID，强制终止后仍通过该身份精确取消并确认清理。清理失败停止该类后续轮次，并保留原始执行和关闭错误。
`@iam/db/maintenance` 管理本次 PostgreSQL 连接与取消，`@iam/runtime/maintenance` 管理离线 Redis、deadline 和聚合关闭，
`@iam/runtime/process` 管理 POSIX 所属进程树和 Windows Job。

人工维护由 [@iam/ops](../ops/README.md) 使用独立配置和窄资源装配。人工与自动入口共用各文档 owner 的 `/maintenance` 能力，各自负责信号和资源关闭。
[周期恢复装配](src/composition/document-repair-schedule.ts) · [文档发布与恢复](../../packages/documents/README.md#共享发布与恢复) · [配置与监控](../../docs/releases/data-maintenance.md#周期任务与监控)
