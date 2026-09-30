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
外部资源由调用方提供，聚合 Integration 在启动前报告全部缺失资源，不回退到开发或运行资源。代价是基础通过不能代替
真实数据库、进程、浏览器和完整系统证据。

测试由 owner-local 窄目录自动收集；root Unit 使用 `scripts/__tests__/`，保留 Turbo task 与并发预算。
不再维护独立 Collection Guard：其 runner list 与 Turbo dry-run 子进程增加检查耗时，专属 adapter、fixtures 和文档增加
维护成本，而检查通过仍不能证明测试断言实际执行或通过。

唯一 collection 归属、路径与命名、root task 可达仍是工程约定，由配置评审和实际测试运行核对。代价是 include/exclude
错配、新 workspace 缺少测试命令或前端 project 重复收集可能未被自动发现；目录收集不保证消除这些风险。
接受这项代价，不以新的收集扫描器、逐文件清单或覆盖率门禁替代 Guard，也不把其他测试入口重构作为删除前置条件。

保留 Guard 或优化其子进程启动可以继续自动检查收集，但仍需维护独立观察模型；仅从默认 static 阶段跳过会保留专属实现
与文档成本，因此采用完整删除。

## 当前契约与历史

完整分类、资源预算与生命周期见[测试编排架构](../architecture/testing-architecture.md)，执行入口见
[命令页](../development/commands.md#测试与验证通道)。旧通道决定仅保留在 Git 历史。

历史来源：[ADR-0003 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0003-adopt-layered-test-lanes-and-resource-budgets.md)、[ADR-0009 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0009-adopt-canonical-test-collections.md)。原始决定与后续修订按各版本追溯。
