# 03 — 现代化 lint 与格式化工具链

**What to build:** 让根目录、后端 packages、Admin 和 SSO 都使用 ESLint 10 支持的 flat config，并让 Stylelint 17 原生检查现有 Less/CSS，同时保持 Prettier 是唯一格式化器。

**Blocked by:** 01 — 统一 pnpm 11.14 与 Turbo 2.10.

**Status:** resolved

- [x] 所有直接 ESLint 依赖统一到 10.7.0，所有既有 `@antfu/eslint-config` 依赖统一到 9.1.0，前端显式声明自身使用的当前 lint 工具。
- [x] Admin 与 SSO 不再依赖 Umi 的 ESLint 8 legacy preset 或 `.eslintrc` 模式，根目录和所有 workspaces 都能按 ESLint 10 的配置查找规则运行。
- [x] Stylelint 更新到 17.14.0，并使用 `stylelint-config-standard` 40.0.0 与 `postcss-less` 6.0.0 解析全部现有 Less/CSS。
- [x] Prettier 更新到 3.9.5；Stylelint 不重新启用已移除的 stylistic rules，也不与 Prettier 建立第二套格式化规则。
- [x] 根目录和每个 workspace 的 lint 可分别从 monorepo 根及 workspace 上下文执行，均得到一致结果。
- [x] 新诊断中的真实问题已修复；规则调整保持最小并说明原因，没有全局关闭 TypeScript/React/import 质量规则或扩大 ignore 来清空结果。
- [x] lint fix/format 不产生与工具迁移无关的大范围源码重排，现有格式脚本继续可用。
- [x] 全仓 lint、受影响 typecheck、frozen-lockfile 安装和 diff check 通过。

## Resolution

- Final squash commit: `fbfe426807fc576ade42e554b734b1b47c572cf8`
- Reviewed implementation commit: `0b8cfddac75e61c4f59d56cdd3ef7571e091f4b8`
- Validation:
  - `pnpm -r list eslint @antfu/eslint-config stylelint stylelint-config-standard postcss-less prettier --depth 0` — confirmed ESLint 10.7.0 and Antfu 9.1.0 across all 15 projects; Admin and SSO resolve Stylelint 17.14.0, standard config 40.0.0, postcss-less 6.0.0, and Prettier 3.9.5.
  - `pnpm lint` — passed for all 14 workspace tasks plus the root and shared flat-config files.
  - Admin and SSO workspace-local `pnpm run lint` — passed; the newly visible React diagnostics remain non-blocking warnings rather than globally disabled rules.
  - Backend `pnpm -r ... run lint -- --fix-dry-run`, frontend ESLint `--fix-dry-run`, and Stylelint `--compute-edit-info` checks — passed without modifying source.
  - Prettier 3.9.5 checks for the new shared/app-local lint configs and touched formatted files — passed.
  - `pnpm --filter @iam/admin run typecheck` and `pnpm --filter @iam/sso run typecheck` — passed.
  - `pnpm install --frozen-lockfile` — passed with pnpm 11.14.0.
  - `pnpm test` — passed for all 14 workspace tasks with no cache hits.
  - `git diff --check` — passed.
- Review: Standards and Spec review passed with no unresolved findings after sharing duplicated frontend configs, restoring the TypeScript type-definition quality rule with a declaration-file-only exception, removing unnecessary Stylelint suppressions, and applying only targeted formatting fixes.
