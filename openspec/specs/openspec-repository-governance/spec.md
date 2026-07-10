# openspec-repository-governance Specification

## Purpose
定义仓库级 OpenSpec 校验、归档完整性和提交前检查的统一治理规则，确保本地开发与后续远端门禁复用一致、可审计且可重复执行的验证入口。

## Requirements
### Requirement: 仓库提供统一 OpenSpec 检查入口
仓库 SHALL 提供单一根级命令，严格验证全部主规格、active changes 和 OpenSpec archive 完整性，并以稳定 exit code 表达聚合结果。

#### Scenario: 全部 OpenSpec 状态有效
- **WHEN** 开发者在有效的主规格、active changes 和 archive 基线上运行 `pnpm check:openspec`
- **THEN** 命令 MUST 以 strict、non-interactive 模式验证全部主规格和 active changes
- **AND** 命令 MUST 运行 archive integrity guard
- **AND** 命令 MUST 返回成功状态

#### Scenario: Strict validation 与 archive integrity 同时存在问题
- **WHEN** 主规格或 active change 无法通过 strict validation，并且 archive 同时违反完整性规则
- **THEN** `pnpm check:openspec` MUST 报告两类 finding
- **AND** 命令 MUST 返回非零状态

#### Scenario: 新环境执行 OpenSpec 检查
- **WHEN** 开发者按仓库声明的 package manager 和 Node runtime 安装依赖后运行 `pnpm check:openspec`
- **THEN** 命令 MUST 使用仓库固定的 OpenSpec CLI
- **AND** 命令 MUST NOT 依赖用户全局安装的 `openspec`

### Requirement: Archive integrity guard 强制归档不变量
仓库 SHALL 通过可测试的 archive integrity guard 检查每个 OpenSpec archive 的命名、metadata、必需 artifacts、delta specs 和 task 完成状态。

#### Scenario: Archive 满足完整性要求
- **WHEN** archive 目录名符合日期与 change name 约定，包含有效 `.openspec.yaml`、`proposal.md`、`design.md`、`tasks.md` 和至少一个 delta spec，且没有未完成 task
- **THEN** archive integrity guard MUST 接受该 archive

#### Scenario: Archive 缺少 metadata 或必需 artifact
- **WHEN** archive 缺少 `.openspec.yaml`、`proposal.md`、`design.md`、`tasks.md` 或 delta spec
- **THEN** archive integrity guard MUST 返回包含 archive 名称和稳定 rule ID 的 finding
- **AND** guard MUST 返回非零状态

#### Scenario: Archive 保留未完成 task
- **WHEN** archive 的 `tasks.md` 包含一个或多个 `- [ ]` 且没有匹配 waiver
- **THEN** archive integrity guard MUST 报告未完成 task 的位置或数量
- **AND** guard MUST 返回非零状态

#### Scenario: Archive metadata 无法解析
- **WHEN** `.openspec.yaml` 缺少有效 `schema` 或 `created`，或 metadata 无法解析
- **THEN** archive integrity guard MUST fail closed
- **AND** finding MUST 标识 metadata 规则和对应 archive

### Requirement: 历史 Archive 例外必须显式且精确
仓库 SHALL 允许为现行门禁建立前的历史 archive 记录精确 waiver，但 MUST 保留原始未完成状态、例外原因和残余风险。

#### Scenario: 历史 finding 具有匹配 waiver
- **WHEN** waiver 以 archive 目录名和 rule ID 精确匹配一个实际 finding，并包含 reason 与 residual risk
- **THEN** archive integrity guard MUST 将该 finding 记录为已知历史例外
- **AND** guard MUST NOT 要求把原始未完成 task 改写为已完成

#### Scenario: Waiver 范围过宽或缺少审计信息
- **WHEN** waiver 使用通配范围、未精确指定 rule ID、缺少 reason 或缺少 residual risk
- **THEN** archive integrity guard MUST 拒绝该 waiver

#### Scenario: Waiver 不再对应实际 finding
- **WHEN** waiver 指向的 archive finding 已不存在
- **THEN** archive integrity guard MUST 报告陈旧 waiver
- **AND** guard MUST 返回非零状态，要求删除或更新 waiver

### Requirement: Pre-commit 只检查 OpenSpec 敏感暂存内容
仓库 SHALL 使用根级 staged-file runner 和 Git pre-commit hook，在 OpenSpec 或 guard 相关文件进入暂存区时恰好运行一次 staged OpenSpec 检查，同时避免给普通代码提交增加全量 OpenSpec 校验开销。

#### Scenario: 暂存 OpenSpec 敏感文件
- **WHEN** 暂存内容包含 `openspec/**`、OpenSpec guard scripts/tests 或其根工具配置
- **THEN** `nano-staged` MUST 恰好调用一次 `pnpm check:openspec --staged`
- **AND** pre-commit MUST 在检查失败时阻止提交

#### Scenario: 只暂存普通业务代码
- **WHEN** 暂存内容不包含任何 OpenSpec 或 guard 敏感路径
- **THEN** staged configuration MUST NOT 运行全量 OpenSpec strict validation

#### Scenario: 存在额外未暂存 OpenSpec 敏感修改
- **WHEN** staged OpenSpec 检查准备运行，并且 staged runner 隔离 partial hunks 后仍存在其他未暂存或未跟踪的 OpenSpec 敏感文件
- **THEN** staged scope guard MUST 在全库验证前返回非零状态
- **AND** 输出 MUST 提示开发者整理 staging
- **AND** hook MUST NOT 主动 stash、revert 或纳入这些额外文件

#### Scenario: Staged 检查完成或失败
- **WHEN** pre-commit staged 检查结束，无论结果成功或失败
- **THEN** 用户可见的 working tree 与 Git index MUST 保持检查前的内容边界
- **AND** OpenSpec 检查命令 MUST NOT 自动格式化、生成或改写 artifacts

### Requirement: 本地 Hook 安装可重复且边界明确
仓库 SHALL 固定 OpenSpec、staged runner 和 hook installer 版本，并提供可重复的 hook 安装命令；本地 hook MUST 被定义为可绕过的快速反馈，而不是最终 server-side 信任边界。

#### Scenario: 安装仓库开发依赖
- **WHEN** 开发者在具有 `.git` 的仓库根安装依赖或运行 `pnpm hooks:install`
- **THEN** 仓库 MUST 安装或刷新指向根 `precommit` script 的 pre-commit hook
- **AND** 安装 MUST 保留未由本配置管理的其他 hook 类型

#### Scenario: 在没有 Git metadata 的构建环境安装依赖
- **WHEN** 容器或发布构建环境没有 `.git` 目录
- **THEN** hook 安装步骤 MUST 安全跳过
- **AND** 依赖安装 MUST NOT 因缺少 Git metadata 失败

#### Scenario: Dependency lifecycle script policy
- **WHEN** pnpm 安装 OpenSpec CLI 或 hook installer dependency
- **THEN** dependency postinstall MUST 由 `allowBuilds` 显式拒绝或审核
- **AND** Git hook 写入 MUST 由仓库 root lifecycle command 显式触发

#### Scenario: 开发者显式绕过本地 hook
- **WHEN** 开发者使用 `git commit --no-verify`
- **THEN** 文档 MUST 明确该提交没有获得本地 OpenSpec guard 证明
- **AND** 后续 CI 接入 MUST 复用 `pnpm check:openspec` 作为不可绕过的远端检查入口
