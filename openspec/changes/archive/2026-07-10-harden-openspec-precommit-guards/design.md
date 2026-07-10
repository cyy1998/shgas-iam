## Context

仓库已经把 OpenSpec strict validation、task 完成状态和 archive 完整性写入 Verify/Archive workflow，但当前没有统一的仓库命令或提交前自动门禁。现状存在三个可复现缺口：

- `openspec validate --all --strict --no-interactive` 当前为 32/33 通过，`release-runbook-governance` 的 6 个 Requirement 正文缺少 `SHALL`/`MUST`。
- 67 个 archive 中有一个最新 change 缺少 `.openspec.yaml`；一个建立于现行 workflow 之前的历史 change 保留两个未执行 smoke task。
- 根包没有 Git hook 或 staged-file runner；两个前端虽然各自声明 `lint-staged`，但没有配置或安装入口，实际未形成门禁。

全量 OpenSpec strict validation 当前本机耗时约 8.3 秒，适合在 OpenSpec 敏感文件进入暂存区时运行，不适合无条件附加到所有代码提交。仓库使用 pnpm 11 的 `allowBuilds` 审核依赖安装脚本，并已有 Node 24 runtime，因此新增工具必须固定版本、避免未审计的 dependency lifecycle side effect，并保持 Windows/WSL 可执行命令不依赖 POSIX-only shell 语法。

本变更只影响开发和归档治理，不改变 IAM runtime 行为。

## Goals / Non-Goals

**Goals:**

- 恢复全量 OpenSpec strict validation 的绿色基线，并提供唯一的根级检查入口。
- 用可测试的 archive integrity guard 阻止缺 metadata、缺 artifacts、缺 delta spec 或带未完成 task 的新 archive。
- 对历史不完整记录使用精确 waiver，保留真实未完成状态和残余风险，不伪造 task 完成。
- 使用 `nano-staged` 只为 OpenSpec 敏感暂存内容触发检查，并通过轻量 Git hook 安装器在 clone/install 后启用 pre-commit。
- 确保 staged 检查不会被其他未暂存的 OpenSpec/guard 修改掩盖，并且检查失败不会改写用户文件。
- 固定 OpenSpec 与 hook 工具版本，使本地检查和未来 CI 能复用同一命令与行为。

**Non-Goals:**

- 本变更不接入远端 CI、不配置 branch protection，也不把本地 hook 视为不可绕过的安全边界。
- 不在本轮为普通 TypeScript/React 文件增加 lint、format、test 或 typecheck staged 路由。
- 不补跑 2026-05-27 历史 change 的环境 smoke，也不把未执行 task 改写为已完成。
- 不修改业务代码、数据库 schema、gateway manifest 或部署配置。
- 不同时引入 Husky、Lefthook 或第二套 staged-file runner。

## Decisions

### 1. 将 `check:openspec` 作为唯一聚合入口

根 `package.json` 暴露 `check:openspec`，由 `scripts/check-openspec.ts` 顺序运行 OpenSpec CLI strict validation 和 archive integrity analyzer，并汇总两类失败后统一返回非零状态。另保留 `check:openspec:archives` 作为聚焦调试入口。

OpenSpec CLI 使用仓库固定的 `@fission-ai/openspec@1.4.1`，命令为 `openspec validate --all --strict --no-interactive`，覆盖全部主规格和 active changes。选择固定 1.4.1 是为了与当前生成的项目 skills 和既有 CLI 行为一致；升级版本应作为独立、可验证的工具链变更。

替代方案是让 workflow 继续分别列出 CLI 和 archive 命令。该方案容易漏项，也会让未来 CI 与本地 hook 形成不同入口，因此不采用。

### 2. Archive integrity 使用纯 analyzer、CLI wrapper 和精确 waiver

`scripts/check-openspec-archive-integrity.ts` 将文件系统扫描和 finding 生成实现为可注入 root 的纯 analyzer，CLI wrapper 只负责格式化输出和 exit code。每个 archive 检查：

- 目录名符合 `YYYY-MM-DD-<change-name>`；
- 存在且可解析 `.openspec.yaml`，包含有效 `schema` 和 `created`；
- 存在 `proposal.md`、`design.md`、`tasks.md`；
- 至少存在一个 `specs/<capability>/spec.md`；
- `tasks.md` 不包含 `- [ ]`。

`openspec/archive-integrity-waivers.json` 只允许通过 archive 目录名和 rule ID 精确匹配 finding。每条 waiver 必须记录原因、历史背景和残余风险；不存在对应 finding 的陈旧 waiver 也视为失败，防止永久静默。

当前最新 archive 缺失的 `.openspec.yaml` 应直接补齐，不使用 waiver。2026-05-27 change 的两个未执行 smoke task 保持未勾选，并用一条 `tasks-complete` 历史 waiver 记录其早于现行 workflow 的事实。

替代方案是只检查某个日期之后的 archive。日期 cutoff 会隐藏历史基线且不能解释例外，因此使用显式 waiver。

### 3. 使用根级 `nano-staged` 做单次、路径敏感路由

新增根 `nano-staged.mjs`，用一个复合 pattern 覆盖 `openspec/**`、OpenSpec guard scripts/tests、根工具配置和 staged 配置本身；命中时只返回一次 `pnpm run check:openspec --staged`。普通业务代码不匹配该 pattern，因此不运行约 8 秒的全量检查。

两个前端中未配置的 `lint-staged` devDependency 一并删除，避免维护两个 staged runner。`nano-staged` 只运行只读检查，不执行 `--write` formatter 或 generator。

替代方案是让多个 pattern 分别运行相同命令。一次提交同时修改 config、script 和 spec 时会重复执行全量校验，因此采用单一复合 pattern。

### 4. Staged 模式要求 OpenSpec 敏感范围不存在额外未暂存修改

`nano-staged` 会隔离同一已暂存文件中的未暂存 hunks。`check:openspec --staged` 在此基础上扫描其余 OpenSpec 敏感路径；若仍存在未暂存或未跟踪修改，则在执行全库检查前失败，并提示用户整理 staging。

这样可以让 full-repository validator 看到与即将提交内容一致的 OpenSpec 范围，同时避免 hook 主动 stash、revert 或吞并不属于本次提交的文件。检查完成或失败后，用户可见的 working tree 和 index 必须保持原状。

替代方案是在 hook 中导出整个 Git index 到临时目录再运行 CLI。它能提供更强隔离，但会显著增加实现和跨平台路径复杂度；在 `nano-staged` 已处理 partial staging 的前提下，额外 scope guard 足以满足本轮目标。

### 5. 使用 `simple-git-hooks` 安装单一 pre-commit 命令

根配置使用 `simple-git-hooks` 将 `pre-commit` 指向 `pnpm precommit`，实际路由全部留给 `nano-staged`。配置设置 `preserveUnused: true`，避免删除其他 hook 类型；根 `prepare` 和显式 `hooks:install` 命令负责安装或刷新 hook。

pnpm `allowBuilds` 对 `simple-git-hooks` 和 `@fission-ai/openspec` 的 dependency postinstall 显式设为 `false`。Hook 安装由仓库可审查的 root lifecycle command 主动调用，而不是授权 dependency install script 自行修改 `.git/hooks`。没有 `.git` 的容器或发布构建必须安全跳过。

本地 hook 可通过 `git commit --no-verify` 绕过；文档必须把它定义为快速反馈。未来 CI 应直接运行 `pnpm check:openspec`，不重新实现规则。

### 6. Guard 以失败用例驱动实现

Archive analyzer 的 public seam 是“给定 archive fixture root 和 waiver 数据，返回稳定 findings”；staged scope checker 的 seam 是“给定 staged/unstaged/untracked path 集合，返回是否允许全库检查”。实现按 TDD 覆盖缺 metadata、缺 artifact、缺 delta spec、未完成 task、有效 waiver、陈旧 waiver、普通代码 no-op 和 OpenSpec staging 冲突。

文档只更新现有 `docs/development/commands.md`、`docs/workflows/verify.md`、`docs/workflows/archive.md` 与索引验证日期，不新增平行 runbook。

## Risks / Trade-offs

- [Risk] 本地 hook 可被 `--no-verify` 绕过，无法替代 server-side enforcement。→ Mitigation：明确其快速反馈定位；后续 CI 直接复用 `pnpm check:openspec`。
- [Risk] 全量 strict validation 约 8 秒，频繁触发会影响提交体验。→ Mitigation：只匹配 OpenSpec/guard/tooling 敏感路径，普通代码提交 no-op。
- [Risk] 其他未暂存 OpenSpec 文件会让 full-repository validator 看到非提交状态。→ Mitigation：staged scope guard fail closed，不主动 stash。
- [Risk] Waiver 可能演变为绕过新问题的常规手段。→ Mitigation：只允许 exact archive + rule ID，要求 reason/residual risk，未命中 finding 的 waiver 失败。
- [Risk] `simple-git-hooks` 会管理配置中的 `pre-commit` 文件，可能覆盖开发者自定义的同名 hook。→ Mitigation：安装前记录该行为、保留其他 hook 类型，并提供显式 `hooks:install` 与 `--no-verify` 恢复路径。
- [Risk] `nano-staged@1.0.2` 要求 Node 22 或 24+。→ Mitigation：根工具链声明 Node 24，与 `apps/oidc-provider` 的既有 runtime 要求对齐。
- [Risk] 固定 OpenSpec 1.4.1 会延后上游修复。→ Mitigation：优先保证可复现；独立升级 change 可同时更新 skills 并跑全量 strict validation。

## Migration Plan

1. 先为 archive analyzer、waiver matching 和 staged scope classifier 写失败测试，锁定 rule ID 与错误输出。
2. 实现 archive integrity、聚合 `check:openspec` 和 staged scope 检查，使当前基线准确暴露 1 个 invalid spec、1 个缺 metadata archive 和 1 个历史 incomplete-task archive。
3. 修复 6 个 Requirement 结构关键词，补齐最新 archive metadata，并添加唯一历史 waiver，使 `pnpm check:openspec` 全绿。
4. 固定根工具依赖，移除未使用的 app-local `lint-staged`，配置 `nano-staged`、`simple-git-hooks`、pnpm build-script policy 和 Node 24 requirement。
5. 安装 pre-commit，验证普通代码 no-op、OpenSpec 变更触发一次、invalid spec/archive 阻止提交且 working tree/index 保持不变。
6. 更新 commands、Verify、Archive 和 docs index，运行文档 guard、聚焦测试和最终 `pnpm check:openspec`。

回滚时先移除或停用由本仓库管理的 `pre-commit`，再回退 root scripts、dependencies 和 staged 配置；archive waiver、metadata 修复和 Requirement 规范化属于事实修复，应保留，除非有单独证据证明其错误。

## Open Questions

暂无。CI provider、branch protection 和普通代码的 staged lint/test 路由留给后续 change。
