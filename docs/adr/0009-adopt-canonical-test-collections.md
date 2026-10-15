---
status: accepted
---

# 采用 Canonical Test Collections

仓库以 Unit、Integration、E2E 作为公开测试语言，Integration profile 表达资源模型与 harness owner，不作为额外测试层级、
速度标签或发布 Gate。每个候选测试由唯一 collection 收集，root 命令可达所属 workspace。

## 理由与代价

旧普通/smoke/external 划分混淆测试意图、资源和执行入口。统一命名与入口后，package 保留 runner 所有权，Turbo 负责
跨包编排，不把 package 依赖图自动当作测试执行拓扑。

基础 verify 依次执行 static、typecheck、Unit、build 并快速失败；Integration 和 Full-system E2E 显式追加。
真实资源由正式测试命令创建和销毁，不回退到开发或运行资源。代价是基础通过不能代替真实数据库、进程、浏览器和
完整系统证据，执行这些通道仍需满足其 Docker、工具链和浏览器前提。

测试由 owner-local 窄目录自动收集；root Unit 使用 `scripts/__tests__/`，保留 Turbo task 与并发预算。
不再维护独立 Collection Guard：其 runner list 与 Turbo dry-run 子进程增加检查耗时，专属 adapter、fixtures 和文档增加
维护成本，而检查通过仍不能证明测试断言实际执行或通过。

唯一 collection 归属、路径与命名、root task 可达仍是工程约定，由配置评审和实际测试运行核对。代价是 include/exclude
错配、新 workspace 缺少测试命令或前端 project 重复收集可能未被自动发现；目录收集不保证消除这些风险。
接受这项代价，不以新的收集扫描器、逐文件清单或覆盖率门禁替代 Guard，也不把其他测试入口重构作为删除前置条件。

保留 Guard 或优化其子进程启动可以继续自动检查收集，但仍需维护独立观察模型；仅从默认 static 阶段跳过会保留专属实现
与文档成本，因此采用完整删除。

## 受管理的临时测试环境

正式资源测试采用编排器管理的一次性环境，每次命令负责创建、使用和销毁自己的资源。
手动与 AFK 使用同一入口和生命周期，同环境资源测试串行复用；PostgreSQL 保留 schema 隔离，Redis 允许整体重置。
资源测试遇到首个失败即结束命令；辅助诊断失败只告警，初始化、测试与清理失败仍阻断通过。
详细流程及验证边界见[专用资源与隔离](../architecture/testing-architecture.md#专用资源与隔离)。

该模式取代调用方任意提供外部 URL、fixture 逐项保护共享环境的正式运行方式，减少资源所有权判断、逐 job/key 清理与
残留锁等待。代价是独立命令需要启动服务，同环境测试让出并行度，且一次失败只报告当时已执行的范围。
运行内复用服务控制启动成本；显式保留环境用于调试，成功与失败默认自动清理。

AFK 直接接入共享宿主 Docker，并采用 host networking；运行前核对平台、网络与非 root socket 访问条件。接受宿主
Docker 管理权限和宿主网络访问范围，以减少另一套 daemon、地址转换或代理的维护。条件不满足时报告环境要求，
不自动切换 DinD。E2E 静态文件进入测试镜像，seed 结果及时导出，使手动和 AFK 使用相同的容器输入输出方式。
私有 registry 认证需要调用者显式提供受支持的单 registry 配置；执行器使用私有只读副本，默认不继承宿主凭据，
只有确认创建者停止后才回收副本。配置前提和恢复操作见[AFK 命令](../development/commands.md#sandcastle-afk)。

共享能力的完整故障证明放在其 owner，调用方保留接线与业务差异验证。环境整体销毁之前，仍需观察生产命令的退出、
连接关闭和非目标数据保护；资源清理成功不能替代这些业务证明。

共享 daemon、host networking、容器输入输出和并行 project 隔离由实际 sandbox smoke 验证；配置检查不能代替运行证据。

## 当前契约与历史

完整分类、资源预算与生命周期见[测试编排架构](../architecture/testing-architecture.md)，执行入口见
[命令页](../development/commands.md#测试与验证通道)。旧通道决定仅保留在 Git 历史。

历史来源：[ADR-0003 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0003-adopt-layered-test-lanes-and-resource-budgets.md)、[ADR-0009 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0009-adopt-canonical-test-collections.md)。原始决定与后续修订按各版本追溯。
