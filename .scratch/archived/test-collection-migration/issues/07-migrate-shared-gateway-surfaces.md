# 07 — 迁移 Pure Shared Packages 与 Gateway Unit Surfaces

**What to build:** 把不拥有外部资源 profile 的 shared packages、ESLint config 与 Gateway 收敛为完整 package-local
`test:unit`/`component` surfaces，显式处理无目录参数的 Bun packages 与唯一 MJS test。

**Blocked by:** 06 — 迁移 Database 与 Read-model 资源 Owners

**Status:** resolved

**Repository invariant:** 这些 owner 不依赖外部资源；每个 package surface 完整后即可独立验证，旧 root `test` 保持旧语义。

**Focused verification:**

- 运行各 package canonical command、Bun directory adapter/MJS collection，并与 Ticket 01 子集做 equality diff。
- 运行受影响 workspace lint/typecheck 与 root orchestration tests。

- [x] 各 package 完整 collection 与 Ticket 01 子集相等，MJS test 不因只扫描 TS/TSX 而漏收。
- [x] Ordinary tests 的 Unit/component 归属按公开行为与出站依赖确认，不把全部 `src/*.test` 机械视为 Unit。
- [x] Package-local canonical tasks 保持 transit dependency，不扩大为 `^test` 执行拓扑。
