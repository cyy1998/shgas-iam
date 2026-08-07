# 03 — 固化前端 Unit 执行环境契约

**What to build:** 仓库维护者能够依赖现有 Collection Guard 和根编排契约，确认 Admin/SSO 的多 projects 没有漏收、重收或不可达，并从当前测试架构与命名文档理解 Node 默认、DOM 显式 opt-in 的长期规则。

**Blocked by:** 01 — 让 Admin Unit 按需使用 Node 与 DOM；02 — 让 SSO Unit 按需使用 Node、DOM 与 MSW。

**Status:** resolved

- [x] Collection Guard 通过真实 runner machine list 验证多 projects 下的唯一收集、canonical ownership 与公开根命令可达性，不新增第二套扫描器。
- [x] 根编排契约验证 Admin/SSO 同时提供 Node 与 DOM execution environments、DOM 后缀唯一归属、Node 不加载全局 DOM setup，以及 Component Integration 仍使用 jsdom。
- [x] 守卫不记录当前测试数量、逐文件完整映射、完整配置对象形状、精确 project 名称或性能秒数。
- [x] 测试架构文档说明 Node/DOM 是 Unit 内部 execution environments、Node 默认、DOM 显式 opt-in、setup 按需加载及 package-local ownership。
- [x] 编码风格文档说明普通 Unit、DOM Unit、Component Integration 与 Playwright spec 的文件命名边界；不新增公开 Node/DOM 命令。
- [x] 根编排聚焦测试、Collection Guard、docs index guard、相关 lint 与 whitespace diff 检查全部通过。
