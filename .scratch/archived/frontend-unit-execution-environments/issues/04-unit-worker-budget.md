# 04 — 测量并确定完整 Unit Collection 的 worker 预算

**What to build:** 仓库维护者获得环境拆分完成后的可重复完整集合测量，并采用对整体反馈时间最有利且清晰的 worker 预算；局部 package 最快、缓存命中或单次偶然值不会决定配置。

**Blocked by:** 03 — 固化前端 Unit 执行环境契约。

**Status:** resolved

- [x] 在相同机器、runner、Turbo concurrency 与绕过 task cache 的条件下，重复比较固定 2、固定 4 与现有 `25%` 的完整 Unit Collection 墙钟。
- [x] worker 决策以完整集合的稳定趋势为准；若候选差异属于测量噪声，则保留现有预算而不制造无收益配置变化。
- [x] 不提高根级 Turbo concurrency，不清空操作系统缓存，不提交性能秒数门禁、benchmark artifact 或机器无关 SLA。
- [x] 若测量指向生产模块 import 耦合，只在 journal 记录后续建议，不在本 ticket 未经新决策扩大生产代码范围。
- [x] 最终相关 package Unit、合并 Coverage、Component Integration、Collection Guard、根编排契约、lint、typecheck、docs index guard 与 whitespace diff 检查全部通过。
- [x] delivery journal 记录实际比较、保留或不修改预算的理由，以及本 feature 的最终验证摘要。
