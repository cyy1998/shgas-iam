# 02 — 让 SSO Unit 按需使用 Node、DOM 与 MSW

**What to build:** SSO 开发者继续使用单一 `test:unit` 入口，普通 Unit 默认运行在 Node，真实浏览器行为显式运行在 jsdom，只有需要 HTTP mock 的测试文件启用 MSW lifecycle；现有协议辅助逻辑、请求行为、Coverage 与 Component Integration 保持完整。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] SSO 的一个 Vitest 进程能够唯一收集默认 Node Unit 与显式 `*.dom.test.*` Unit，公开 `test:unit` 命令保持不变。
- [x] 访问浏览器全局或 history 的现有 Unit 明确进入 DOM execution environment，其余 Unit 先在 Node 中运行，不通过全局 shim 隐藏依赖。
- [x] MSW 与 jsdom 解耦，只有实际使用 HTTP mock 的测试文件显式注册共享 lifecycle，普通 Unit 不启动 MSW。
- [x] 发现隐藏浏览器依赖时按真实测试行为决定 DOM 分类或修正模块边界，不为了提高 Node 比例改变测试语义。
- [x] Component Integration 继续整体使用 jsdom 与既有 setup，收集和行为没有被 Unit 配置拆分改变。
- [x] package-local Unit、合并 Coverage、Component Integration、lint 与 typecheck 全部通过。
- [x] 使用与 spec 基线一致的方法记录 SSO 单包和完整 Unit Collection 的前后墙钟；数据只作为证据，不形成硬门禁。
