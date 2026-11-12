---
status: accepted
---

# 采用 Canonical Test Collections

仓库使用 Unit、Integration、E2E 表达测试行为与真实资源依赖，每个测试由唯一 collection 收集。
旧普通/smoke/external 和六类 Integration profile 将测试意图与资源注入、目录和并发耦合。
改为按真实资源归类，由 workspace 声明执行器与资源，保留 package 的 runner 所有权和 root 的聚合入口。
接受运行单个文件也可能启动该 workspace 声明的额外资源，省去逐文件资源配置与 profile 分支。

基础 verify 快速反馈，真实资源验证与完整系统旅程按影响显式追加。
真实 PostgreSQL、Redis、网络、进程或浏览器场景各自提供行为证据，资源准备或清理成功只证明对应的环境生命周期。
[测试分类、收集与编排](../engineering/testing.md#收集与编排) · [验证命令](../engineering/commands.md#测试与验证通道)

## 资源生命周期与验证取舍

正式资源测试使用命令独占的一次性环境，手动与 AFK 复用入口。
替代由调用方任意指定外部地址、fixture 逐项保护共享环境的方式，减少残留数据、锁等待和资源归属判断。
接受独立命令的启动成本和同环境资源测试串行，单次运行内按 owner 复用资源。
共享能力的完整失败证明放在 owner，调用方验证接线与业务差异。
[资源隔离与清理](../engineering/testing.md#专用资源与隔离)

AFK 使用宿主 Docker 和 host networking，减少额外 daemon、网络代理和地址转换的维护，接受宿主管理与网络访问范围。
真实 sandbox smoke 验证平台与隔离边界，私有 registry 凭据按独立授权和生命周期处理。
[AFK 启动与宿主资源](../agents/sandcastle-afk.md#启动与诊断)

## 收集检查与 root 工具链

移除独立 Collection Guard。runner list、Turbo dry-run 和专用 fixtures 增加常规检查耗时，结果只能证明收集观察。
唯一归属与 root 可达性由配置评审和实际运行核对，接受部分接线错误可能较晚发现的代价。

2026-10-29 修订删除 root 自有的常驻 Unit 和 Integration 集合，保留聚合入口及静态检查。
低频工具链改动按实际影响一次性验证，减少日常 Git、子进程和临时环境开销，也减少常驻行为回归的自动发现。
App、package 与 `e2e/system` 仍由各自 collection 管理。
[Root 工具链的一次性验证](../engineering/testing.md#root-工具链的一次性验证) · [历史迁移范围与验收 Spec #240](https://github.com/cyy1998/shgas-iam/issues/240)

历史来源：[ADR-0003 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0003-adopt-layered-test-lanes-and-resource-budgets.md)、[ADR-0009 原文](https://github.com/cyy1998/shgas-iam/blob/73315e4cef6f96dd79b29e18f74d68af30e559ec/docs/adr/0009-adopt-canonical-test-collections.md)。原始决定与后续修订按各版本追溯。

固定历史版本：[整理前 ADR-0009](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0009-adopt-canonical-test-collections.md)。
