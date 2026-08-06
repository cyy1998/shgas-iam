# 02 — 取得最终聚合证据并收口 Current Docs

**What to build:** 在最终候选树运行约定的三组真实 evidence，记录简短人类可读摘要，并统一三个 Gate 的 Current docs 与
adoption 描述。

**Blocked by:** 01 — 发布完整 Provider-neutral Gate Interface

**Status:** resolved

**Repository invariant:** 本票只验证完整最终树并收口文档；失败时不合入 feature，既有 owner commands 保持可用。

**Focused verification:**

- 在同一次完整连续流程内依次执行 Windows `pnpm verify` 3/3、全资源 `pnpm verify:ci` 1/1、干净 E2E
  `pnpm verify:release` 1/1；流程内部不重试单个阶段。
- 运行 `pnpm check:docs` 与 `git diff --check`；复核 owner docs 链接，不复制 collection/Redis/E2E contract。

维护者裁定：环境或代码根因诊断并修复后可以从头重新启动整体 evidence；历史失败/retries 必须保留，但不阻止随后完整连续的
成功流程用于验收。当前候选周期已取得该完整流程，后续仅测试 seam 与 Collection Guard 的修复按授权完成聚焦验证；最终候选
`a919f4626fe8d51d5eb0d99c21ccceeb8f061d08` 的完整 Standards/Spec 双轴复审均为 0 findings。

- [x] 同一次完整连续流程内，Windows `pnpm verify` 连续 3/3；提供全部专用资源时 `verify:ci` 1/1；干净 E2E 环境
  `verify:release` 1/1；流程内部 fail fast 且无单阶段 retry。
- [x] 摘要只说明实际平台、命令、次数、是否 retry 与资源清理结果，不保存完整日志、machine receipt 或 secret。
- [x] Cleanup failure 传播到顶层非零；任一 evidence failure 都阻止 feature 合入。
- [x] Linux/真实 CI 保持 `pending`，不成为本地 feature 完成或命令发布的虚假证据。
- [x] Current docs 准确描述三个 Gate 的最终语义、聚合 evidence 与 adoption，并只链接 owner contracts。
