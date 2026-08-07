# 01 — 让 Admin Unit 按需使用 Node 与 DOM

**What to build:** Admin 开发者继续使用单一 `test:unit` 入口，但普通 Unit 默认只启动 Node，真正依赖浏览器或 React DOM 的 Unit 才显式启动 jsdom；现有 Unit、Coverage 与 Component Integration 行为保持完整。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Admin 的一个 Vitest 进程能够唯一收集默认 Node Unit 与显式 `*.dom.test.*` Unit，公开 `test:unit` 命令保持不变。
- [x] 现有 React DOM 测试明确进入 DOM execution environment，其余 Unit 不加载全局 DOM setup，测试文件和断言不减少。
- [x] Component Integration 继续整体使用 jsdom 与既有 setup，收集和行为没有被 Unit 配置拆分改变。
- [x] package-local Unit、合并 Coverage、Component Integration、lint 与 typecheck 全部通过。
- [x] 使用与 spec 基线一致的方法记录 Admin 单包和完整 Unit Collection 的前后墙钟；数据只作为证据，不形成硬门禁。
