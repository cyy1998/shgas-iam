---
status: accepted
---

# 将人工维护入口与常驻 Worker 分离

Worker 当前同时容纳常驻队列消费和一次性人工维护命令。多数命令已经使用独立资源装配，但命令入口、配置与交付仍归属
Worker；两类 Document 的周期 repair 还直接启动这些命令的子进程。本决定将人工维护入口独立为 Ops，明确两类生命周期的职责。

## 已确认的决定

- 人工维护入口迁入独立的 `apps/ops` workspace；Worker 继续负责常驻 consumer 和内置周期恢复。
- Ops 提供与目标应用同版本的独立一次性镜像，可在常驻 Worker 停止时执行维护命令，不新增常驻 Ops 服务。
  部分 backfill、repair 只登记或重新唤醒持久工作，其最终收敛仍需要匹配版本的 consumer；命令可独立启动不代表整个维护流程不需要 Worker。
- 恢复、重建、核验与状态解释继续遵守现有能力包的所有权和公开接口约束，app 不互相依赖私有源码。
  入口拆分须保留现有维护契约，包括按需资源装配、deadline、信号取消、资源关闭和失败退出语义。

## 命令范围与直接切换

首轮迁移当前 Worker 的全部 14 个维护脚本，覆盖 User Document、Organization Document、Session、Client Snapshot、
Employment 和历史 Audit Action。正式数据库迁移继续由 `@iam/db db:migrate` 拥有，Gateway 发布继续使用现有 HTTP 入口，
不恢复已经退役的历史工具。

Ops 提供按能力分组的统一 `iam-ops` CLI，例如 `iam-ops user-document repair`、
`iam-ops user-document verify-postgres`、`iam-ops client-snapshot verify` 和 `iam-ops employment verify`。
仓库通过 `pnpm --filter @iam/ops` 调用，镜像使用相同命令参数；具体命令选项、报告与退出语义保持现有契约。

Ops 自己的连接与命令配置采用 `IAM_OPS_*`，源码运行默认读取 `apps/ops/.env`，不隐式读取 Worker 的 `.env`。
Worker 的周期调度配置继续使用 `IAM_WORKER_*`。各命令只校验实际需要的配置，不因统一入口加载无关资源。

采用同次交付直接切换：同步更新仓库调用方、文档、构建验收入口和镜像配置，移除旧 `@iam/worker` 人工维护入口，
不提供旧入口转发或旧维护配置别名。部署侧已有外部脚本须在恢复操作前切换到新入口与配置。

## 共享维护执行能力

User Document 与 Organization Document 通过各自的 `/maintenance` 公开出口提供完整维护流程。
User repair 中仍留在 CLI 的 transition 回收、恢复、文档与发布后处理、Subject Access repair 及结果汇总归入 User Document owner，
手动和自动入口共同消费同一流程；命令解析、环境变量、报告呈现和进程退出留在 app。

共用的 PostgreSQL invocation 连接、精确取消和关闭能力归 `@iam/db`；离线 Redis 连接、deadline、信号和聚合关闭能力归
`@iam/api-core` 的窄基础设施出口，由 app 显式创建或注册。队列连接继续使用 `@iam/jobs`。
按已有 owner 分配这些能力，不新增聚合各领域依赖的统一运维核心包。

Ops 和 Worker 各自持有薄装配。Ops 提供人工命令入口；Worker 周期调度只启动本 app 内部的专用 repair 子进程，
将自己的配置转换为显式执行输入。两者通过领域维护出口与共用资源能力协作，不复制完整修复顺序和精确取消实现。
保留每轮独立进程与连接、deadline、先关闭调度和子进程再关闭常驻资源、清理确认后才安排下一轮的约束。
清理失败停止后续自动轮次，两类 Document 调度继续独立运行；持久领取、版本仲裁和自动尝试预算保持现有规则。

## 独立一次性维护制品

Ops 使用独立 Dockerfile 和 `IAM_OPS_IMAGE`，部署侧选择与目标应用相同发布版本的制品。
生产入口为独立 `docker/compose.prod.ops.yaml`，仅定义按需执行的 Ops 服务，使用独立配置模板准备私有 `docker/.env.ops`。
镜像使用统一 CLI 作为入口，调用方通过 `run --rm --no-deps` 显式提供维护子命令。
Ops 配置不加入日常 apps Compose 的解析面，启动维护无需补齐 API、Gateway 等其他应用的必填变量。

Ops 服务不配置常驻重启、端口、持久卷或依赖服务启动；数据连接由所选子命令按需校验。
源码 `.env` 和部署 `.env.ops` 均属于私有配置，须从版本控制和镜像构建上下文排除。
同机部署沿用 `iam-service-prod` project 的默认网络；独立维护主机使用实际可达的数据服务地址，project 同名不提供跨主机网络。
操作入口仅针对一次性 Ops 服务，不通过局部 Compose 的 `down` 管理共享项目生命周期。

## 理由与代价

独立入口让人工维护的命令、配置与制品有明确归属，发布和故障恢复可以在 Worker 停止期间启动所需操作，
也避免一次性维护继续扩张常驻 Worker 的职责。代价是增加一个 workspace 和同版本镜像，并需要同步维护命令文档、
构建验收入口与架构约束。

保留 Worker 自动恢复，延续 [ADR-0046](0046-unify-user-and-organization-read-documents.md) 的恢复责任和进程隔离取舍。
周期任务由启动人工 repair CLI 调整为启动 Worker 自有 runner，人工和自动入口通过同一 owner 维护能力复用完整恢复顺序。
共享资源 helper 分别归已有基础设施包，接受少量 app-local 装配，避免维护两个修复流程或增加吸纳所有领域依赖的中心包。

本决定记录已确认的职责、命令、共享执行和制品边界，不代表改造已经实施。
当前运行与操作依据继续见[Worker 运行与维护](../architecture/backend-architecture.md#worker-运行与维护)、
[命令入口](../development/commands.md#workspace-入口)和[数据维护](../releases/data-maintenance.md)。
