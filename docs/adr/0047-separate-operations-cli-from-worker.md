---
status: accepted
---

# 将人工维护入口与常驻 Worker 分离

一次性人工维护由独立 Ops CLI 与同版本制品提供，Worker 持有常驻消费和内置周期 repair。
原方案将人工命令、配置与制品放在 Worker，故障恢复仍依赖常驻应用的交付边界。
拆分后可在 Worker 停止时启动所需的维护命令，代价是增加一个 workspace、同版本镜像和相应发布流程。
部分 backfill 或 repair 只登记或重新唤醒工作，最终收敛仍需要匹配版本的 consumer。

## 维护能力与入口归属

文档 owner 持有完整重建、修复和核验流程，人工与自动入口消费相同的 `/maintenance` 能力。
PostgreSQL invocation 连接与精确取消归 `@iam/db/maintenance`，离线 Redis、期限与聚合关闭归
`@iam/runtime/maintenance`，队列归 `@iam/jobs`。各 app 按命令装配资源。
接受少量 app-local 接线，以免复制修复顺序或新增吸纳各领域的中心运维包。

Worker 调度本 app 的专用子进程，保留独立连接、期限与关闭确认。Ops 使用自己的命令配置和薄装配。
两类运行环境各自解释参数、报告和退出。周期 repair 的选择与资源代价由
[ADR-0046](0046-unify-user-and-organization-read-documents.md#恢复与切换) 说明。

## 切换与制品

人工命令直接切换到 `iam-ops`，调用方与制品同次更新，省去旧 Worker 命令转发与配置别名。
独立一次性 Compose 提供匹配版本的 Ops 制品，维护时仅需所选命令的资源配置。
数据库迁移与网关发布仍沿各自现行入口，常驻 Worker 与人工维护按任务分别管理。

[Ops 命令与配置](../../apps/ops/README.md) · [Worker 周期 repair](../../apps/worker/README.md#周期-repair) ·
[一次性维护环境](../releases/deployment.md#一次性-ops-维护环境) · [数据维护](../releases/data-maintenance.md)

固定历史版本：[整理前 ADR-0047](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0047-separate-operations-cli-from-worker.md)。
