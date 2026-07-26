# 06 — 删除旧守卫并切换事实来源

**What to build:** 在封闭规则目录按长期规范迁移完成后执行 contraction：删除 legacy suites/testing analyzer，收缩根 analyzer 到允许观察模型，并让 Current 文档指向唯一根入口与各事实的正确验证层。

**Blocked by:** 02 — 集中 backend 依赖方向规则；03 — 用 package seam 集中 Role Assignment 与 User Profile ownership；04 — 用 import edge 集中会话与运行时所有权；05 — 把 transaction-bound invalidation 留在行为契约

**Status:** resolved

**Owner:** `/root/ticket_06_implementation`

- [x] 删除 API、Admin API、OIDC Provider 和 Role Assignment Resolution 的 legacy architecture suites；普通 package `test` 不再跨 workspace 扫描 production source。
- [x] 删除 User Profile testing-only business-boundary analyzer、对应 tests 与 package export，并确认仓库无剩余 consumer。
- [x] 根 analyzer 只保留长期规范允许的 source path、规范化静态 module edge/type/value、port `Pick` 既有例外、workspace manifest closure 和 Dockerfile 字面 `COPY` 事实。
- [x] 确认 Ticket 03 已删除候选引入的 property/member、symbol name、namespace、barrel provenance/export graph 索引、helpers 与语法 fixtures，并清理任何残留；删除历史拼写、旧文件/identifier 墓碑、exact factory shape 和 method allowlist。
- [x] 根规则目录只包含 `consumer-owned-port`、`dependency-direction`、`role-resolution-owner`、`user-profile-owner`、`session-runtime-owner`、`worker-ownership` 和 `docker-build-closure`；本票不新增规则。
- [x] Current backend architecture、testing architecture、backend implementation 与 commands 文档把 `pnpm check:architecture` 作为唯一静态入口，并把 type、behavior/contract、smoke 和外部资源事实指向各自验证层。
- [x] Port/type contracts、业务行为、User Profile、process smoke、PostgreSQL 与测试编排 tests 保持原职责；Turbo dry-run 证明 package tests 不再读取其他 consumer workspace 的 architecture inputs。
- [x] `pnpm check:architecture` 当前仓库零 violations；可记录 warm wall-clock 但不设自动 gate。受影响 workspace tests/typecheck、root focused tests、docs guard 与 `git diff --check` 通过，完整 `pnpm verify` 留到准备 merge 时在最终内容上运行一次。
