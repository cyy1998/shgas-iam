# 01 — 建立根级 Architecture Guard 并守住 consumer-owned port

**What to build:** 为 backend 维护者提供唯一的 `pnpm check:architecture` 入口，使其一次加载 production sources、返回可定位的结构化 violations，并首先接管 consumer-owned port 规则；迁移期间现有 architecture suites 继续兜底。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 根命令在当前仓库上成功，并在 fixture 存在 violation 时以非零状态失败。
- [x] 每条 violation 都稳定包含 rule ID、仓库相对文件、1-based 行号和可操作消息。
- [x] Source snapshot 排除测试、testing、generated 和 build output，并确保每个 production TypeScript 文件只读取、解析一次。
- [x] `consumer-owned-port` 拒绝 concrete repository import、`repositories/**` import、`Pick<...Repository>` 和 `Pick<...Service>`。
- [x] `consumer-owned-port` 允许 `Pick<...Port>`、平台类型 narrowing 和合法 type-only import。
- [x] 根命令进入 `verify` 的 static 阶段且只执行一次，测试编排契约同步通过。
- [x] 现有 architecture suites 保持存在，相关 root focused tests、Architecture Guard、lint/typecheck 和 whitespace 检查通过。
