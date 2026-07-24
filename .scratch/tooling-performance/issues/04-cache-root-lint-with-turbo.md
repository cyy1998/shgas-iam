# 04 — 将根 lint 纳入 Turbo 缓存

**What to build:** 把 Turbo 之外的根 ESLint 串行尾部命令改为显式 root task，使完整 lint 在保留 package-level 并行与缓存粒度的同时正确缓存根脚本和配置。

**Blocked by:** 03

**Status:** resolved

- [x] `turbo.json` 声明 `//#lint:root` 或等价显式 root task，inputs 精确覆盖根脚本、根配置、共享配置依赖和 workflow 记录。
- [x] 根 `pnpm lint` 在一次 Turbo 调度中请求 package lint 与 root lint，不再在 Turbo 完成后追加 ESLint 串行尾部命令。
- [x] package lint 继续由各 workspace 执行，`lint:fix` 不缓存，局部 lint/fix 入口保持可用。
- [x] 共享 ESLint preset 变化会使所有相关 lint task hash 失效；test/typecheck 不增加只服务于 ESLint 配置的特殊任务依赖，并按已批准 amendment 接受内部 workspace 源码的保守哈希传播。
- [x] ESLint 10 单进程全仓原型只形成冷/热性能、峰值内存、诊断等价和缓存粒度对照数据；除非满足 spec 的 amendment 条件，不替换 package-level 模型。
- [x] 预热后 `timeout 10s pnpm lint` 连续三次通过，第二次及以后 root lint 明确命中 Turbo cache。
- [x] 工具链结构测试、root lint/typecheck、冻结安装、workflow/docs 和 whitespace 检查通过。

## Comments

- ESLint 10 单进程原型在 reviewed candidate `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b` 上使用标准逐文件配置查找和 `--concurrency=off`：连续两次观察为 36.22/66.06 秒，最大 RSS 分别为 1,349,548/1,347,828 KiB；两轮 JSON 完全一致。第二次没有稳定热启动收益，因此不把文件系统状态包装成可复用 cache。
- 单进程输出按 15 个 consumer 分区后与 `eslint-diagnostic-baseline.json` 的文件集合哈希、退出码、error/warning 数量和诊断键逐项一致；配置包自身额外检查 11 个文件，全仓合计 868 files、0 errors、29 warnings。
- package-level `turbo run lint lint:root --force` 为 151.22 秒、最大 RSS 731,060 KiB，但还包含 Admin/SSO Stylelint；全 cache hit 时为 2.51–2.91 秒并保留 16 个独立 cache 单元。因此单进程虽达到冷启动 50% 数据门槛，仍不足以覆盖热路径、内存和缓存粒度损失，本 ticket 不替换正式模型。

## Resolution

- Ticket base: `ed41538b933b4f629176a84a26e95491a048e56d`
- Reviewed content head: `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`
- Candidate commits: `8621d6682667ae8835bef56b703e187bef00fcc3`, `7b8b545ed2f54f878ac2e47bfd34dafbc776b96b`
- Final squash commit: `pending`
- Validation:
  - `pnpm install --frozen-lockfile` — passed
  - `bun test scripts/__tests__/tooling-performance.test.ts` — passed
  - `bun test scripts/__tests__/eslint-config-equivalence.test.ts` — passed
  - `pnpm exec turbo run lint lint:root typecheck test --dry=json` — passed
  - `timeout 10s pnpm lint` — passed
  - `pnpm exec eslint --concurrency=off <15 consumer targets + config owner> --format json` — passed
  - `pnpm exec turbo run lint lint:root --force` — passed
  - `pnpm typecheck` — passed
  - `pnpm check:docs` — passed
  - `pnpm check:workflow -- --feature tooling-performance` — passed
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
