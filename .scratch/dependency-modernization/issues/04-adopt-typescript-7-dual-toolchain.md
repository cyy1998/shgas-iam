# 04 — 采用稳定 TypeScript 7 双轨工具链

**What to build:** 让全部 workspaces 使用稳定 TypeScript 7.0.2 CLI 执行类型检查，同时让 ESLint、插件和编辑器集成继续从官方 TypeScript 6 compatibility package 获得编译器 API，彻底退出 native preview。

**Blocked by:** 02 — 迁移到 Vitest 4; 03 — 现代化 lint 与格式化工具链.

**Status:** resolved

- [x] 仓库中不再声明或解析 `@typescript/native-preview`，所有原 `tsgo` 类型检查入口都改用稳定 `tsc`。
- [x] 稳定 TypeScript CLI 通过 `@typescript/native` alias 解析到 7.0.2，名为 `typescript` 的工具依赖通过官方 compatibility package 解析到 6.0.2 API。
- [x] workspace override 与全部直接 TypeScript 声明采用同一双轨策略，没有 workspace 继续暴露 preview 或把无 API 的 TypeScript 7 提供给 typescript-eslint。
- [x] 实际版本审计证明 typecheck CLI 为 7.0.2、工具侧 compiler API 为 compatibility 6.0.2，而不是仅检查 manifest 文本。
- [x] 全部非生成 TypeScript 配置适配 TypeScript 7 的默认值和已删除选项；没有通过关闭 strict、扩大 skip 或批量添加忽略来掩盖诊断。
- [x] 每个 workspace 的 typecheck 与根全仓 typecheck 均通过，Umi 生成配置由正常 setup 流程产生而非手工修改。
- [x] 全仓 lint、测试、frozen-lockfile 安装和 diff check 通过，证明 compatibility API 继续满足 lint/test 工具。

## Resolution

- Final squash commit: `fbfe426807fc576ade42e554b734b1b47c572cf8`
- Reviewed implementation commit: `abb5120d58955977ce880f63719977e6e0e0be25`
- Validation:
  - Baseline `pnpm typecheck` — passed all 14 workspaces on the previous native preview before migration.
  - `pnpm -r list @typescript/native typescript --depth 0` — confirmed all 15 projects declare the same stable CLI and compatibility API aliases.
  - `pnpm -r exec tsc --version` — reported `Version 7.0.2` for every workspace.
  - Workspace runtime audit of `@typescript/native/package.json` and `typescript/package.json` — confirmed installed alias package versions 7.0.2 and 6.0.2 respectively in every workspace.
  - Preview/command scan across manifests and `pnpm-lock.yaml` — found no `@typescript/native-preview`, preview build pin, or `tsgo` entry.
  - `pnpm exec turbo typecheck --force` — passed all 14 workspace typechecks with zero cache hits under stable TypeScript 7.0.2.
  - `pnpm lint` — passed all 14 workspace tasks plus root lint using the compatibility compiler API.
  - `pnpm test` — passed all 14 workspace tasks with zero cache hits.
  - `pnpm install --frozen-lockfile` — passed with pnpm 11.14.0.
  - `git diff --check` — passed; Umi setup produced no tracked generated-file changes.
- Compatibility fix: added the explicit `Table<Employment>` row type in SSO to resolve the sole TypeScript 7 inference difference without weakening compiler options.
- Review: Standards and Spec review passed with no unresolved findings after synchronizing the tracked toolchain record with the dual-toolchain baseline.
