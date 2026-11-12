---
status: accepted
---

# 统一 Biome 格式与规则检查，并由提交 Hook 自动修复

2026-09-29 采用 Biome 统一前后端受支持文件的排版与规则基线，提交 Hook 只处理本次暂存文件，自动应用安全修复。
相比依赖开发者或 AI 在提交前手动重复执行格式和 lint，Hook 将确定性的修复绑定到实际提交内容。
接受一次性迁移 diff、并行分支冲突与规则引擎差异，换取统一风格和较小的长期例外范围。
[编码约定](../engineering/coding-style.md) · [实施与验收 Spec #217](https://github.com/cyy1998/shgas-iam/issues/217)

## 工具与验证边界

补充工具按文件类型覆盖 Biome 未接管的范围。保留 Prettier 排版和 Less 的 Stylelint，
YAML 只排版，语义由实际消费工具验证。接受有限的多引擎维护成本，同时避免把工具迁移扩展成样式语言转换。
当前文件分工和规则由配置及编码约定维护。

Hook 使用 Husky 与 lint-staged，处理暂存内容并保护未暂存修改。修复范围限于安全分类，
排版与 import 整理各自遵守命令职责，裸副作用 import 保留顺序。
最终 verify/CI 继续只读检查候选，覆盖 Hook 可被绕过及合并后组合变化。typecheck、测试和发布专属验证仍使用既有入口。
[命令与提交检查](../engineering/commands.md#commit-前检查)

Sandcastle 和宿主采用同一版本化 Hook。容器安装阶段避免改写宿主 Git 配置，执行时使用容器私有入口。
接受薄启动器维护成本，以兼顾一致的检查行为和宿主配置隔离。真实提交验证各自运行及失败阻断。
[AFK 工作流](../agents/sandcastle-afk.md)

固定历史版本：[整理前 ADR-0041](https://github.com/cyy1998/shgas-iam/blob/cbfd4aa60fd6000662026b68576f1aa1409b6ce4/docs/adr/0041-unify-format-and-lint-with-biome.md)。
