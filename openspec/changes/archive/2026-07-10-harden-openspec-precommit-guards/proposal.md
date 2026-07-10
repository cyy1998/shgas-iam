## Why

当前仓库已经通过 workflow 文档要求 OpenSpec change 在归档前完成严格验证，但这些要求仍主要依赖人工执行：主规格 `release-runbook-governance` 当前无法通过 strict validation，archive 中也存在缺失 `.openspec.yaml` 和未完成历史 smoke task。现在需要把这些规则落实为可重复的仓库命令和按暂存文件触发的 pre-commit guard，在接入 CI 前先阻止新的不一致进入提交历史。

## What Changes

- 修复当前 `release-runbook-governance` 主规格中的 OpenSpec 规范关键词，使全量 strict validation 恢复绿色基线。
- 新增统一的 `check:openspec` 命令，严格验证全部主规格、active changes 和 archive 完整性，并支持供 pre-commit 使用的 staged 模式。
- 新增 archive integrity guard，检查 archive 命名、metadata、必需 artifacts、delta specs 和 task 完成状态；历史例外必须通过精确、可审计的 waiver 保留真实状态。
- 补齐最新 archive 缺失的 `.openspec.yaml`，并为现行 workflow 建立前遗留的未完成 smoke task 记录显式 waiver。
- 在 workspace 根引入 `nano-staged` 与轻量 Git hook 安装器，仅当 OpenSpec 或 guard 相关文件进入暂存区时运行 `check:openspec`；普通代码提交不承担全量 OpenSpec 校验开销。
- 将 OpenSpec CLI 固定为仓库 devDependency，移除两个前端中未配置、未生效的 `lint-staged` 依赖，并更新相关开发与 workflow 文档。

## Capabilities

### New Capabilities

- `openspec-repository-governance`: 定义仓库级 OpenSpec strict validation、archive 完整性与 waiver、staged pre-commit 路由和可复现工具链要求。

### Modified Capabilities

无。`release-runbook-governance` 只修复已有 Requirement 的结构关键词，不改变其要求语义。

## Impact

- 工具链：根 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`nano-staged` 与 Git hook 配置。
- 仓库脚本：新增 OpenSpec 聚合检查、staged scope 检查、archive integrity guard 及其测试。
- OpenSpec：新增 repository governance capability；修复一个当前失败的主规格、一个缺 metadata 的 archive，并新增历史 waiver 数据。
- 文档：更新开发命令、Verify 与 Archive 入口，明确本地 hook 是快速反馈且可被 `--no-verify` 绕过，后续 CI 应复用同一检查命令。
- Runtime：不修改 IAM 后端、前端、数据库、gateway 或部署运行时行为。
