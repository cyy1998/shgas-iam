# 前端 Unit 执行环境优化开发记录

## 当前状态

已在 `codex/remove-obsolete-tooling-tests` 分支完成全部四张 tickets，并通过 Standards 与 Spec 双轴评审。Admin 与 SSO
Unit 均在各自单个 package-local Vitest 进程内按 Node/DOM projects 运行，并只为 Unit 固定使用 4 个 workers；Component
Integration 保持原 `25%` 预算。Ticket 04 的 focused implementation commit 为
`73b236e36790f613b242043d78b3a572a5dbbaec`，评审修复 commit 为 `16d8b2c2b3a2e9d1ef11a3aae339b3b72cf54c4b`。

当前没有 ticket 被认领。

当前分支已经包含此前获批的工具链测试删除改动；后续工作必须保留这些改动，不得把它们当作本 feature 的可清理噪声。

## 验收与验证计划

- 以完整 Unit Collection 的相同强制执行命令记录前后墙钟，性能证据不成为 CI 硬门禁。
- 聚焦验证 Admin/SSO Unit、合并 Coverage 与 Component Integration。
- 运行 Collection Guard 和根测试编排契约，验证唯一收集、公开入口可达及 Node/DOM 稳定不变量。
- 对受影响 package 运行 lint/typecheck；文档更新运行 docs index guard；每个 ticket 运行 whitespace diff 检查。
- worker 预算只在执行环境拆分完成后比较固定 2、固定 4 与现有 `25%`，以完整集合决定是否保留变化。

## 事件

- 2026-08-06 Decision：确认 Node 为普通 Unit 默认执行环境，`*.dom.test.*` 是唯一 DOM Unit opt-in 标记。
- 2026-08-06 Decision：确认单 Vitest 进程、package-local Node/DOM projects、MSW 按文件启用，并保持 Component Integration 与合并 Coverage 语义。
- 2026-08-06 Decision：确认不设置最终耗时目标；实施顺序和 blocking edges 留给后续 `$to-tickets`。
- 2026-08-06 Authorization：维护者指定继续使用 `codex/remove-obsolete-tooling-tests` 作为本 feature 工作分支，并授权 `$to-spec` 发布本地 tracker 文档。
- 2026-08-06 Planning：维护者批准 4 张 tracer-bullet tickets；01 与 02 无 blocker，03 同时被 01/02 阻塞，04 被 03 阻塞。
- 2026-08-06 Implementation：Ticket 01 完成，focused commit 为 `7db3282715db92dd67531c2ed77a7895af57996d`；Admin 保留单一 `test:unit`，普通 Unit 默认进入 Node，真实浏览器或 React DOM 行为通过 `*.dom.test.*` 进入 jsdom，Component Integration 与合并 Coverage 语义保持不变。
- 2026-08-06 Validation：Admin Unit 通过 6 files/17 tests，Coverage 通过同一 6 files/17 tests 并生成单份报告，Component Integration 通过 5 files/26 tests；Collection Guard、根编排 33 tests、Admin/root lint、Admin typecheck、docs index guard 与 whitespace 检查均通过。Admin lint 保留 25 个既有 warning、无 error。
- 2026-08-06 Performance：相同 runner、Turbo concurrency 2 与 `--force` 下，Admin 单包两轮由 23.669s/11.744s 变为 13.769s/9.191s，完整 Unit Collection 两轮由 57.889s/39.061s 变为 38.010s/35.482s；数据只作为趋势证据，不形成 gate。
- 2026-08-06 Review：Ticket 01 的 Standards 与 Spec 评审各为 0 findings，可以完成 tracker handoff。
- 2026-08-06 Implementation：Ticket 02 完成，focused commit 为 `421e1c5c88e3b36a5f8822be18d5a15664352f03`；SSO 保留单一 `test:unit`，普通 Unit 默认进入 Node，真实浏览器行为通过 `*.dom.test.*` 进入 jsdom，MSW lifecycle 只由实际 HTTP mock 测试与 Component Integration 完整 setup 显式注册。
- 2026-08-06 Validation：SSO Unit 通过 7 files/22 tests，machine list 显示 5 个 Node files 与 2 个 DOM files；Coverage 通过同一 7 files/22 tests 并生成单份报告，Component Integration 通过 4 files/6 tests；SSO lint 0 errors（保留 4 个既有 warnings），typecheck、Collection Guard 与 whitespace 检查均通过，完整强制 Unit Collection 两轮通过。
- 2026-08-06 Performance：相同 runner、Turbo concurrency 2 与 `--force` 下，SSO 单包两轮由 16.952s/18.113s 变为 13.072s/12.250s，完整 Unit Collection 两轮由 62.188s/46.299s 变为 37.552s/33.958s；数据只作为趋势证据，不形成 gate。
- 2026-08-06 Review：Ticket 02 的 Standards 与 Spec 评审各为 0 findings，可以完成 tracker handoff。
- 2026-08-07 Implementation：Ticket 03 完成，focused commit 为 `9ffca921d4d63849d1b1003f25983a0dcfe8f976`；Collection Guard 新增 Vitest 多 project machine-list 的唯一收集正反契约，根编排契约以 execution environment 而非 project 名称同时保护 Admin/SSO，Current 测试架构与命名文档同步记录 Node 默认、DOM 显式 opt-in、按需 setup 和 package-local ownership。
- 2026-08-07 Validation：根编排聚焦测试通过 35 tests，Collection Guard、全仓 17 package typecheck、root lint、docs index guard、whitespace 检查均通过；完整 `pnpm test:unit` 通过 17 tasks，Admin 6 files/17 tests 与 SSO 7 files/22 tests 均保持 Node/DOM 收集。
- 2026-08-07 Review：Ticket 03 的 Standards 与 Spec 评审各为 0 findings，可以完成 tracker handoff。
- 2026-08-07 Performance：使用同一 Windows runner、Turbo concurrency 2 与 `--force`，交错三轮完整 Unit Collection；固定 2 为 44.587s/42.339s/40.887s，固定 4 为 38.327s/38.246s/38.203s，`25%` 为 71.941s/43.789s/42.871s，中位数依次为 42.339s、38.246s、43.789s。固定 4 的三轮趋势稳定且相对另外两项中位数分别改善约 9.7% 与 12.7%，因此 Admin/SSO Unit 采用固定 4；未提高根 Turbo concurrency、未清理 OS cache，也未建立性能 gate、artifact 或 SLA。
- 2026-08-07 Implementation：Ticket 04 focused commit 为 `73b236e36790f613b242043d78b3a572a5dbbaec`，评审修复 commit 为 `16d8b2c2b3a2e9d1ef11a3aae339b3b72cf54c4b`；固定 4 下沉到 Admin/SSO Unit config，shared 与 Component Integration 保持 `25%`，OIDC Provider 不变。测量没有提供需要生产模块 seam 的 profiling 证据，因此未修改生产代码，也没有后续 import 耦合建议。
- 2026-08-07 Validation：最终完整强制 Unit Collection 通过 17 tasks 且无 Turbo cache；Admin Unit/Coverage 均通过 6 files/17 tests，SSO Unit/Coverage 均通过 7 files/22 tests，Coverage 各生成单份报告；Admin Component Integration 通过 5 files/26 tests，SSO 通过 4 files/6 tests；根编排 35 tests、Collection Guard、全仓 17 package typecheck、Admin/SSO/root lint、docs index guard 与 whitespace 检查全部通过。Admin/SSO lint 分别保留 25/4 个既有 warning，无 error。
- 2026-08-07 Review：Ticket 04 首轮 Standards 为 0 findings，Spec 的 1 个 Component Integration scope finding由 `16d8b2c2b3a2e9d1ef11a3aae339b3b72cf54c4b` 修复；对固定点 `eb496b01a12bf1139cea676a9621245958f9fff1` 到最终实现的复审为 Standards 0、Spec 0 findings。
