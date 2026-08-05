# 10 — 原子切换默认命令并退役旧入口

**What to build:** 在同一可回滚 cutover 中令 `test` 永久代理 `test:unit`，把 `verify` 切为
`static -> typecheck -> test:unit -> build`，删除其他旧入口/config 与迁移期 live 对照物，并同步 ADR 与 Current docs。

**Blocked by:** 09 — 用 Root Commands 与永久 Guard 封闭 Collections

**Status:** resolved

**Repository invariant:** 公开行为只在所有替代 collections 完整且 Guard 通过后一次切换；不发布 `test:e2e` 或上层 Gate
placeholder。

**Rollback:** 整体 revert 本次 cutover，令旧 command、collection config、Guard 与文档状态一同恢复。

**Focused verification:**

- 运行 root orchestration 聚焦测试、`pnpm check:test-collection` 与 `pnpm test:unit`。
- 在最终候选内容上运行一次新 `pnpm verify`、`pnpm check:docs` 与 `git diff --check`。
- 盘点旧 command references，剩余命中只能位于明确 Historical/冻结来源或有说明的非执行文本。

- [x] 新旧 collection equality、唯一收集和例外归零在删除旧入口前通过。
- [x] 不保留 `test:smoke`、`test:external`、package-local `test:redis`/`test:postgres`、`test:rehearsal` 或 frontend
  `e2e` aliases；rehearsal 只保留已确认的操作命令。
- [x] 基础 `verify` fail fast，且不读取真实 PostgreSQL/Redis、不启动 browser/E2E；ADR supersede 与文档 ownership 完整。
- [x] README 与全部 Current architecture/commands/frontend/runbooks 使用 canonical commands；Historical records 保留历史事实。
