# @iam/worker

Worker 常驻消费 `user-document` 与 `organization-document` 队列，提供 health/readiness 及可选内部 Bull Board，并按配置运行两类周期 repair。

```bash
pnpm --filter @iam/worker dev
pnpm --filter @iam/worker serve
pnpm --filter @iam/worker test:unit
pnpm --filter @iam/worker typecheck
```

配置由 [.env.example](.env.example) 和 `src/env.ts` 定义。`IAM_WORKER_ENABLED_MODULES` 支持 `all`、`none` 或模块列表；`none` 只提供 health/dashboard。Bull Board 默认只读，启用时遵守生产 Basic Auth 配置。

周期 repair 只在对应 consumer 和开关同时开启时运行；启动首轮，结束并确认清理后等待间隔，两类独立。每轮由 Worker 自有私有入口建立独立进程、连接和 deadline；停机先停止调度并等待 repair，再关闭常驻资源。清理失败停止后续该类轮次。配置和监控见[周期任务与监控](../../docs/releases/data-maintenance.md#周期任务与监控)。

人工维护入口已迁入 [@iam/ops](../ops/README.md)，使用独立 `IAM_OPS_*`；Worker 不提供旧人工 scripts、转发入口或旧维护配置别名。人工与自动入口共用领域 `/maintenance` 能力和基础设施资源生命周期。
