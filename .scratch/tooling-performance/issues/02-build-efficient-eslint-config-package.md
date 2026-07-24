# 02 — 建立高效共享 ESLint 配置包

**What to build:** 在内部 workspace 配置包中实现 root、backend、frontend ESLint preset，审计 Antfu 规则加载图，并通过精简 Antfu、Node compile cache 与精选 flat config 对照数据选择可维护的加载方案。

**Blocked by:** 01

**Status:** resolved

- [x] 新增唯一的内部 ESLint 配置包，导出 root、backend、frontend preset 或工厂，并具有独立 lint、typecheck 和测试入口。
- [x] Antfu 当前配置、精简 Antfu 和精选 flat config 至少交错运行五轮，记录 import/compose、完整 lint、最大 RSS、冷/热缓存结果。
- [x] 每个被关闭或替换的 formatter、Markdown/JSON/YAML/TOML、test、jsdoc、pnpm、e18e、perfectionist、unicorn 等规则组都有适用性审计，不以未加载等同于不需要。
- [x] 最终选择同时满足诊断等价、维护成本和性能预算；若保留 Antfu，显式记录其静态入口固定成本；若采用精选配置，只直接导入批准的插件。
- [x] Node compile cache 只有在热运行稳定获益且冷启动回退被显式记录时才进入正式命令，缓存目录不参与 Turbo outputs 或任务 hash。
- [x] 不 patch、fork 或二次 bundle Antfu 发布包，依赖版本与解析入口保持唯一且可审计。
- [x] 配置包聚焦测试、lint、typecheck、冻结锁文件安装、workflow/docs 和 whitespace 检查通过。

## Resolution

- Ticket base: `449f2ca66f2edbe206177d3806ded4dc372032d8`
- Reviewed content head: `d9480121eb742b95de9875d16a7565d1e04239ef`
- Candidate commits: `910dc68b07431d807d90da1771debd1541830f1b`, `b58dedb21dff208abf83ef5e7142f72cdf54adef`, `97a8a469f6bbae38b1f4211c65552f7b68f3ebba`, `d9480121eb742b95de9875d16a7565d1e04239ef`
- Final squash commit: `a5f1355ea4d0f164417e5bab32367cf6d7dadf16`
- Validation:
  - `pnpm install --frozen-lockfile` — passed
  - `pnpm --filter @iam/eslint-config test` — passed
  - `pnpm --filter @iam/eslint-config lint` — passed
  - `pnpm --filter @iam/eslint-config typecheck` — passed
  - `node scripts/benchmark-eslint-config.mjs --rounds 5` — passed
  - `pnpm check:docs` — passed
  - `pnpm check:workflow -- --feature tooling-performance` — passed
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
