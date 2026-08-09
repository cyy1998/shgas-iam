# 05 — 退役旧 OIDC token-index runtime

**What to build:** 删除当前 runtime 已不再写入或信任的 OIDC user/client/global-session token-index 能力，使 Access
Token 撤销只有当前 Session Kernel 与 provider-object ownership 路径；同时完整保留 legacy Redis inventory/cleanup 的安全
运维能力。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 旧 token-index key builders、metadata、注册脚本、按 user/client/global-session revoke helpers 与 public exports 被删除。
- [x] token store 只保留仍被 adapter destroy、grant cleanup 和 client protocol-object cleanup 使用的单 token provider-payload 删除能力。
- [x] client invalidation worker 不再注入或调用旧 token-index store，仍能撤销目标 client 的 OIDC Client Binding、current credential/token 与 provider protocol objects。
- [x] 一个 client 的 invalidation 不影响同一 Principal/Provider Session 下其他 client 的生命周期。
- [x] 正常 Access Token upsert/resolve/revoke 继续使用当前 Session Kernel lifecycle，并证明不会创建旧 `oidc:*‑tokens:*` sorted sets。
- [x] legacy cleanup 命令、受控 allowlist、inventory/dry-run/apply/verify、日志脱敏、ACL/resource guard、component/process/Redis tests 与 runbook 全部保留。
- [x] Current 文档明确区分 runtime authority 与 cleanup-only old keys，并说明仓内代码删除不代表任何环境 Redis inventory 已清零。
- [x] Release Operations 前置条件保留旧实例 drain、维护窗口 Redis review/cleanup、全量 session/token 影响、client owner smoke 与 rollback strategy。
- [x] 运行 API Core/OIDC Provider 直接相关 Unit/Component/Redis collections、lint/typecheck、Architecture Guard、Docs Guard 与 `git diff --check`。
