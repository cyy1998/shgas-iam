## 1. 建立 Guard 行为基线

- [x] 1.1 为 archive integrity analyzer 建立临时 fixture helper，先写失败测试锁定稳定 finding shape、archive 名称、rule ID、文件位置和 CLI exit code。
- [x] 1.2 增加缺 `.openspec.yaml`、metadata 无效、缺 `proposal.md`/`design.md`/`tasks.md`、缺 delta spec 和目录命名非法的失败测试。
- [x] 1.3 增加未完成 task、精确有效 waiver、缺 reason/residual risk、通配 waiver 和陈旧 waiver 的失败/成功测试，并确认历史 task 原文不被改写。
- [x] 1.4 为 staged scope classifier 增加测试，覆盖普通代码 no-op、OpenSpec 敏感路径命中、partial staging 隔离后仍有额外 unstaged/untracked 敏感文件时 fail closed。
- [x] 1.5 为根聚合检查增加测试或可控 fake，证明 strict validation 和 archive integrity 同时失败时两类 finding 均被保留，最终 exit code 非零。

## 2. 实现 OpenSpec 与 Archive 检查

- [x] 2.1 实现 `scripts/check-openspec-archive-integrity.ts` 的纯 analyzer 和 CLI wrapper，检查 archive 命名、metadata、必需 artifacts、至少一个 delta spec 和未完成 tasks。
- [x] 2.2 定义并校验 `openspec/archive-integrity-waivers.json` schema，实现 exact archive + rule ID 匹配、审计字段检查和陈旧 waiver 检测。
- [x] 2.3 实现 `scripts/check-openspec.ts`，运行仓库固定的 `openspec validate --all --strict --no-interactive` 与 archive analyzer，汇总输出并提供 `--staged` 模式。
- [x] 2.4 实现 staged scope 检查：识别 OpenSpec/guard 敏感 unstaged 与 untracked paths，输出可恢复提示，不执行 stash、revert、生成或文件改写。
- [x] 2.5 在根 `package.json` 增加 `check:openspec` 和 `check:openspec:archives`，并运行聚焦 Bun 测试确认 red-green 循环完成。

## 3. 修复当前 OpenSpec 基线

- [x] 3.1 将 `openspec/specs/release-runbook-governance/spec.md` 中 6 个 Requirement 正文规范化为包含 `SHALL`/`MUST` 的完整表述，不改变原有 Scenario 或要求语义。
- [x] 3.2 为 `openspec/changes/archive/2026-07-10-standardize-backend-route-boundaries/` 补齐 `schema: spec-driven` 和正确 `created` 日期的 `.openspec.yaml`，不使用 waiver 掩盖缺失 metadata。
- [x] 3.3 为 `2026-05-27-normalize-employment-organization-context` 的两个历史未执行 smoke task 添加唯一 `tasks-complete` waiver，记录现行门禁建立前的背景和残余风险，保持原任务未勾选。
- [x] 3.4 运行 `pnpm check:openspec`，确认当前 33 个主规格、active change 和 67 个 archives 在显式历史 waiver 后形成绿色基线。

## 4. 配置 Root Pre-commit 工具链

- [x] 4.1 在根固定 `@fission-ai/openspec@1.4.1`、`nano-staged@1.0.2` 和 `simple-git-hooks@2.13.1`，声明 Node 24 开发 runtime，并更新 `pnpm-lock.yaml`。
- [x] 4.2 在 `pnpm-workspace.yaml` 对 `@fission-ai/openspec` 和 `simple-git-hooks` 的 dependency lifecycle scripts 显式设为不允许，由仓库 root command 主动安装 hook。
- [x] 4.3 删除 `apps/admin` 与 `apps/sso` 中未配置、未生效的 `lint-staged` devDependency，并确认前端现有 lint/test scripts 不受影响。
- [x] 4.4 新增根 `nano-staged.mjs`，用单一复合 pattern 匹配 `openspec/**`、guard scripts/tests 和根工具配置，命中时恰好返回一次 `pnpm run check:openspec --staged`。
- [x] 4.5 配置 `simple-git-hooks` 的 `pre-commit: pnpm precommit` 与 `preserveUnused: true`，增加 `prepare`、`hooks:install` 和 `precommit` scripts；无 `.git` 环境必须安全跳过。
- [x] 4.6 为 staged path routing 补聚焦测试或等价 dry-run 证据，证明普通业务代码 no-op，多类敏感文件同时暂存也只执行一次检查。

## 5. 更新 Workflow 与开发文档

- [x] 5.1 更新 `docs/development/commands.md`，记录 `check:openspec`、archive 聚焦检查、hook 安装与本地绕过边界。
- [x] 5.2 更新 `docs/workflows/verify.md`，将 OpenSpec 验证统一到 `pnpm check:openspec`，并明确 staged hook 只提供本地快速反馈。
- [x] 5.3 更新 `docs/workflows/archive.md`，要求 sync delta specs 后运行聚合检查，未完成 task 只有预先记录的精确历史 waiver 才可被识别，新的 incomplete task 继续硬阻塞。
- [x] 5.4 同步 `docs/index.md` 的相关 Last verified 信息并运行 `pnpm check:docs`。

## 6. 验证 Pre-commit 与最终一致性

- [x] 6.1 运行 archive guard 和 staged scope 的全部 Bun 测试，确认有效/无效 fixture、waiver 和 path routing 覆盖通过。
- [x] 6.2 运行 `pnpm install` 与 `pnpm hooks:install`，检查 pre-commit 指向根 `precommit` script，且没有删除其他 hook 类型。
- [x] 6.3 在隔离的临时 Git fixture 或等价可恢复环境验证：普通代码暂存不运行 strict validation；OpenSpec 敏感内容运行一次；invalid spec/archive 阻止提交。
- [x] 6.4 验证 partial staging 和失败路径结束后 working tree、Git index 与无关文件保持原内容边界，且 guard 没有自动生成或改写 artifacts。
- [x] 6.5 运行 `pnpm check:openspec`、`pnpm check:docs`，并运行 `openspec validate harden-openspec-precommit-guards --type change --strict`。
- [x] 6.6 检查最终 diff、OpenSpec artifacts 与 tasks 一致，记录本地 hook 可被 `--no-verify` 绕过和 CI 尚未接入的剩余风险，然后进入 Verify 阶段。
