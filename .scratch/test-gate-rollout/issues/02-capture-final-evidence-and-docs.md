# 02 — 取得最终聚合证据并收口 Current Docs

**What to build:** 在最终候选树运行约定的三组真实 evidence，记录简短人类可读摘要，并统一三个 Gate 的 Current docs 与
adoption 描述。

**Blocked by:** 01 — 发布完整 Provider-neutral Gate Interface

**Status:** ready-for-agent

**Repository invariant:** 本票只验证完整最终树并收口文档；失败时不合入 feature，既有 owner commands 保持可用。

**Focused verification:**

- 无 retry 执行 Windows `pnpm verify` 3/3、全资源 `pnpm verify:ci` 1/1、干净 E2E `pnpm verify:release` 1/1。
- 运行 `pnpm check:docs` 与 `git diff --check`；复核 owner docs 链接，不复制 collection/Redis/E2E contract。

- [ ] Windows `pnpm verify` 连续 3/3；提供全部专用资源时 `verify:ci` 1/1；干净 E2E 环境 `verify:release` 1/1，
  全部无 retry。
- [ ] 摘要只说明实际平台、命令、次数、是否 retry 与资源清理结果，不保存完整日志、machine receipt 或 secret。
- [ ] Cleanup failure 传播到顶层非零；任一 evidence failure 都阻止 feature 合入。
- [ ] Linux/真实 CI 保持 `pending`，不成为本地 feature 完成或命令发布的虚假证据。
- [ ] Current docs 准确描述三个 Gate 的最终语义、聚合 evidence 与 adoption，并只链接 owner contracts。
