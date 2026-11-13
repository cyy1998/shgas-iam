# @iam/worker

Worker 常驻消费 `user-document` 与 `organization-document` 队列，提供 health/readiness 及可选内部 Bull Board，并运行任职有效期任务和按配置启用的周期 repair。

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

## 任职有效期

选择 `user-document` 模块的 Worker 启动时补扫，并在 `Asia/Shanghai` 每日 00:00 执行下一轮。开发、生产和全系统测试的 User Document Worker
均选择该模块，Organization Document 和 dashboard-only 服务各自独立运行。任职调度随模块启用，User Document repair 仍由自己的开关控制。

每轮先扫描到期任职，再扫描可启用的未启用任职。每条候选在 PostgreSQL 事务中锁定并重验，结束任职时按 ID 顺序锁定关联责任。
任职、责任、system 审计及 User Document Outbox 一同提交。Worker 停机时取消后续调度，等待当前数据库工作与有界的提交后唤醒，然后关闭连接。

检查 `employment.lifecycle.started`、`employment.lifecycle.completed` 和 `employment.lifecycle.failed` 事件及业务日期。
单条失败时 `employment.lifecycle.transition_failed` 记录任职 ID 和可用的 PostgreSQL 错误标识。处理完故障后，重启 User Document Worker 触发补扫，
或等待下一次北京时间零点。已提交源事实由 Document consumer 发布到 PostgreSQL 和 Redis Facts；唤醒或发布失败沿用 User Document repair。
检查结果时分别核对当前任职状态和已发布资料，资料可能晚于任职状态转换。业务规则见 [任职状态计算](../../docs/features/directory-management.md#任职状态计算)。
