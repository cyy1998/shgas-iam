# 01 — 建立 API production composition smoke

**What to build:** 为 API 建立独立的真实进程 smoke 通道，从正式入口启动服务、解析隔离测试环境、构造 production composition，并通过 HTTP readiness probe 证明进程能够完成启动。Smoke 必须在不依赖开发环境或真实外部服务的前提下可靠失败、可靠清理，为后续 Gateway composition 改造提供最小安全网。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `@iam/api` 提供 package-local `test:smoke` 命令，仓库根 smoke 编排能够发现并运行它，且遵守 smoke 通道的禁用缓存与并发约束。
- [x] Smoke 通过 Bun 启动真实 API entry，使用唯一隔离端口解析测试环境并构造 production composition，随后对稳定 HTTP endpoint 执行 readiness probe。
- [x] 测试只配置不可达的数据库、Redis、ORCAS 等占位端点，不读取开发服务配置、不连接真实依赖，也不写入或清理共享数据。
- [x] 子进程提前退出、readiness 超时和端口占用均产生可定位的失败信息；成功、失败与超时路径都会清理完整子进程树和临时资源。
- [x] 普通测试与 smoke 的测试收集互斥，同一测试不会进入两个通道。
- [x] 相关测试编排结构检查、`@iam/api` lint、typecheck、文档检查和 whitespace check 全部通过。
