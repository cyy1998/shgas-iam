# 01 — 锁定旧 Collection 基线与目标归属

**What to build:** 从固定点的 runner list、Turbo dry-run 与 Bun 窄目录声明生成旧 collection baseline；逐文件记录唯一目标
layer/profile、当前业务行为与临时例外，作为全部迁移 tickets 的固定输入。

**Blocked by:** None — can start immediately

**Status:** resolved

**Repository invariant:** 只增加 feature-local 迁移证据；当前命令、runner 与测试语义完全不变。

**Focused verification:**

- 逐 runner 执行现有 list/dry-run 入口并规范化仓库相对路径。
- 对 baseline、目标映射和文件系统候选集合做双向 diff；运行 `git diff --check`。

- [x] 固定点上的 267 个 candidate test/spec files 全部出现且不重复，显式包含 4 个 root tooling tests、唯一 MJS test，
  并把当前 release rehearsal 标记为将移出目标 test candidate set。
- [x] 每个例外写明原因、负责清除的后续 ticket 与清除条件；禁止整体刷新 baseline 吞掉差异。
- [x] Bun 枚举排除 Admin API 的非测试 process fixture；唯一 MJS test 与 Playwright JSON list 均被正确观察。
- [x] 目标 mapping 只允许 owner-local Unit、`test-integration/<profile>` Integration、测试模型外 rehearsal 或未来
  `e2e/system` 四种明确归属。
- [x] 本票没有改变 production command、runner 或测试语义。
