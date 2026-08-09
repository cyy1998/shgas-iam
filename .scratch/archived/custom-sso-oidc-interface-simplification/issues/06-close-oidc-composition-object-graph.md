# 06 — 封闭 OIDC composition object graph

**What to build:** 顶层 OIDC composition 只向 runtime 入口提供 server、logger 和 shutdown，使 repositories、stores、
session、security、provider runtime、interactions 与 workers 保持实现局部，同时维持相同的启动、信号处理和资源关闭行为。

**Blocked by:** 05 — 退役旧 OIDC token-index runtime

**Status:** resolved

- [x] 顶层 composition result 只包含 `{ server, logger, shutdown }`，完整内部 object graph 不再成为调用方可见 Interface。
- [x] runtime 入口继续监听 server、记录启动日志，并在 signal、server error 或显式关闭时释放 Redis、database、workers 与其他资源。
- [x] 下层 Module tests 继续通过各自 consumer-owned Interface 获取覆盖，不通过顶层 composition 暴露 repositories/stores/session/security/provider/workers。
- [x] application entry/process tests 证明启动、logger 与 shutdown 行为保持不变，typecheck 证明没有仓内调用方依赖已隐藏字段。
- [x] Current backend architecture 同步描述收缩后的顶层 Interface、内部 composition ownership 与完成 Ticket 05 后的 worker dependencies。
- [x] 不为假设中的仓外私有 import 添加 compatibility object、deprecated fields 或 test-only escape hatch。
- [x] 运行 OIDC Provider 直接相关 Unit/Component/Process/Composition collections、lint/typecheck、Architecture Guard、Docs Guard 与 `git diff --check`。
