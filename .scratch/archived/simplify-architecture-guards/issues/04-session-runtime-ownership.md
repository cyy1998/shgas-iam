# 04 — 用 import edge 集中会话与运行时所有权

**What to build:** 让根 Architecture Guard 只依据 production source path、规范化静态 module edge 与 type/value 保护 Custom SSO、Admin Session Revocation、OIDC 和 Worker 的 runtime ownership。

**Blocked by:** 01 — 建立根级 Architecture Guard 并守住 consumer-owned port

**Status:** resolved

**Owner:** `/root/ticket_04_implementation`

- [x] 每组 owner 约束都能表示为小型 declarative `target-module-pattern → allowed-source-prefix/path` 映射，并逐项对应一条 `Current` 文档事实。
- [x] Custom SSO route/use case 到 Session Kernel、concrete session adapter 或 stateful integration implementation 的非法 module edge 失败；合法 composition owner 不被误报。
- [x] Admin user/client module 绕过 Session Revocation interface，直接依赖 Kernel、OIDC、concrete session adapter 或 app Redis module 时失败；既有 type contract 继续负责 port/adapter structural compatibility。
- [x] OIDC repository、Redis、storage、security 和 session wiring 仅由各自 source owner path 持有，规则不读取具体 imported symbol 或 composition object text。
- [x] Worker production source 到 `@api`、`~api/src` 等 API 私有 alias 的静态 edge 失败，正常 workspace package edge 继续允许。
- [x] 不新增 authority-key literal、legacy identifier、具体 symbol、composition text、member、property 或 provenance 分析，也不为这些语法形状增加 fixture。
- [x] 不递归追踪 provenance 或 transitive TypeScript dependency graph；规则只判断当前 production source 的直接规范静态 edge。
- [x] Legacy suite assertion 无法直接映射为上述 target pattern、allowed source path 和 `Current` 文档事实时，不迁移到根守卫；改由 type/behavior/smoke 等合适验证层承担，或作为旧实现约束删除。
- [x] 若合法与非法能力无法由 module edge 区分，先收缩 export、增加专用 subpath 或加深 module interface；仍不适合时转交 type/behavior/smoke 层，不扩 scanner。
- [x] 每个不同 owner/module edge 至少有一个 canonical 允许与违规 fixture；`pnpm check:architecture`、根 guard focused tests、相关 backend tests/typecheck/smoke 和 `git diff --check` 通过。
