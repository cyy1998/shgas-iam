# Implement 阶段

本阶段承接 [index.md](index.md) 的 Implement 状态，只接收已经完成分流和计划产物选择的工作。实现结构与 [plan.md](plan.md) 的三类产物保持一致：Quick Change、OpenSpec change 和大型 OpenSpec umbrella change。

## 开始前

进入 Implement 时必须先完成 [index.md](index.md) 的 skill preflight。OpenSpec change 实施前必须读取并使用 `$openspec-apply-change`；涉及 schema、Drizzle 或数据库约束时必须读取并使用 `$db-schema`；触发 TDD 门槛时必须读取并使用 `$tdd`。

开始任何会修改文件或 artifacts 的阶段前先运行：

```bash
git status --short --branch
```

如果存在无关 dirty changes，不要 stash、revert 或带入新分支；先确认它们是否属于当前任务。

当前分支直改只有用户明确要求直接修改或不要创建临时分支时才可使用，仍要运行相关检查，且不要自动提交。

## Quick Change

Quick Change 只实现 [plan.md](plan.md) 中确认的小范围、低风险、非 OpenSpec 改动。分支策略、目标分支和当前分支直改例外由 Plan 阶段决定。

1. Inspect：确认当前分支符合 Plan 阶段的分支决策，并再次检查 dirty changes；如果存在无关 dirty changes，不要 stash、revert 或带入当前改动。
2. Implement：读取附近文件，按现有文档和代码约定做最小改动；实现过程中不创建提交。
3. Handoff：改动完成后进入 [verify.md](verify.md)；验证完成后再由 [archive.md](archive.md) 处理提交、合并或分支清理确认。

如果实现过程中发现契约、schema、安全、session/OIDC/SSO、审计、队列、发布、回滚或跨模块生命周期影响，必须停止 Quick Change，回到 [plan.md](plan.md) 重新分流为 OpenSpec change。

## OpenSpec Change

OpenSpec change 在 `work/<change-name>` 上同步推进 artifacts、实现、测试和验证。

1. 读取相关 proposal/design/spec/tasks、附近代码、既有测试和当前文档。
2. 按 tasks 分片实现，保持改动小而聚焦，优先沿用现有包边界、命名、工厂、DI、测试和日志模式。
3. 触发 TDD 门槛的 feature/fix 必须遵守 `$tdd` skill，或在实现前记录 TDD 例外。
4. 实现发现假设不成立、范围扩大或契约变化时，先更新 proposal、design、spec、tasks 或记录偏离原因，再继续实现。
5. 完成当前实现片段后进入 [verify.md](verify.md) 选择对应验证。

## OpenSpec Umbrella Change

大型 OpenSpec umbrella change 的实现发生在 child change 分支中；umbrella 本身负责集成边界和跨 child 协调。

1. 每个 child change 从 `feature/<feature-name>` 派生 `work/<change-name>`，按 OpenSpec change 流程独立实现、验证和归档。
2. 如果 child 之间出现共享契约、迁移顺序、发布、回滚或集成验收变化，先更新 umbrella change，再继续推进 child 实现。
3. child change 归档回 `feature/<feature-name>` 后，检查 umbrella 的 child 列表、依赖顺序和集成验收是否仍准确。
4. 所有 child 完成后，在 `feature/<feature-name>` 上执行集成验证；通过后进入 [archive.md](archive.md) 的 umbrella 收尾。

## 通用实现规则

### TDD

有可执行验收面的 feature、fix 和行为变化触发 TDD 门槛，必须遵守 `$tdd` skill；纯文档、格式、索引、低风险配置微调、机械重命名或没有可执行验收面的改动可以跳过。跳过 TDD 时，必须在实现前记录例外原因、替代验证和剩余风险。

`$tdd` 是实现阶段的测试驱动方法；触发时必须遵守，但不能替代 [verify.md](verify.md) 定义的最终验证门禁。它也不替代 OpenSpec artifacts、计划产物或 scope drift 处理。

### 测试编写约定

触发 TDD 时，测试编写发生在本阶段：先确认 public seam，一次只写一个 failing test，再写最小实现让它通过。实现或验证发现必要测试缺口时，回到本阶段按 `$tdd` 补一个 vertical slice。

- 测试文件放在被测代码旁的 `__tests__/` 目录，例如 `src/services/position/__tests__/position.service.test.ts`。
- 断言外部行为、契约和边界条件，不只断言实现细节。
- 事务、审计、队列、OIDC/session、Redis/cache、gateway manifest 和数据库 schema 改动要覆盖失败、幂等、回滚或兼容路径。
- 后端服务/handler/adapter 测试构造 factories 并传入 DI fakes；不要为 app-local service、repository、db、redis、logger 使用 `mock.module`。
- 前端测试覆盖用户能观察到的状态、交互和错误提示；关键流程变更补 mocked E2E 或 smoke。
- 新增 fixture、snapshot 或迁移输出时，只提交任务拥有的稳定产物，避免把本地缓存和运行报告纳入 diff。

### 范围漂移与 artifacts

实现或验证过程中发现未被当前 OpenSpec artifacts、任务清单或 Quick Change 短计划覆盖的漂移时，必须暂停分类：

- 属于本次目标正确性所必需的漂移：先更新 proposal、design、spec、tasks 或相关 docs，再继续实现。
- 与本次目标无关的历史问题：记录为后续事项，不纳入当前 diff。
- 会阻塞本次验证的历史问题：可以纳入当前修复，但必须记录为什么它阻塞验证，以及补充的验证范围。

不要让 typecheck、lint 或测试暴露出的额外修复悄悄扩大任务范围；范围扩大必须能在 artifacts、任务记录或最终说明中追溯。

### 调查与委派

- bug 报告先复现或检查失败信号，再改根因。
- 使用 Serena MCP 做代码结构分析、符号查找和引用检查，用 `rg`、`find`、`sed` 处理清单、非代码文件和命令输出。
- 需要并行调查时可以使用子代理。每个子代理只回答一个边界清晰的问题，给出文件、行号、风险和建议；主代理负责最终集成和验证。

## 退出条件

- 实现和必要测试已经完成。
- 未解决的范围漂移已更新 artifacts、记录偏离原因或拆出后续事项。
- 下一步进入 [verify.md](verify.md)。
