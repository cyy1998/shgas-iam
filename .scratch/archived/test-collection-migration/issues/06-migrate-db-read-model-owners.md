# 06 — 迁移 Database 与 Read-model 资源 Owners

**What to build:** 把 DB、Role Assignment 与 User Profile Read Model 的 ordinary/postgres/redis collections 迁成完整
package-local canonical commands；另把近规模 rehearsal 转为测试模型外的 `subject-projection:rehearsal` 操作入口。

**Blocked by:** 05 — 迁移 Admin API 与 Worker 的 Canonical Package Surfaces

**Status:** resolved

**Repository invariant:** 每个资源 owner 的 package surface 完整；旧 root resource commands 继续存在到最终切换。

**Focused verification:**

- 对三个 workspace 运行 canonical command lists/preflights，并与 Ticket 01 子集做 equality diff。
- 在专用资源上聚焦运行 `subject-projection:rehearsal`，核对非零失败、JSON 摘要和 schema/namespace cleanup。
- 运行受影响 workspace lint/typecheck；有资源时运行最高层相关 postgres/redis contract。

- [x] 所有资源 test files 按 harness owner 唯一归属；rehearsal 不再使用 `*.test` 命名，不进入 Collection Guard、
  `test:integration` 或 `verify:ci`。
- [x] 操作命令保留 10,002 行合成数据、冷/热读取、prewarm、verify、single-flight、观测摘要与 owner-resource cleanup，
  且不创建第七个 profile。
- [x] tsconfig include、lint paths、Turbo `passThroughEnv` 与 package preflight 随路径/command 同步。
- [x] 随机 schema/namespace、migration destructive constraints 与 fail-fast 行为不变。
