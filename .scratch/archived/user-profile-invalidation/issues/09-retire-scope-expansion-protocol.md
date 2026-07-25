# 09 — 彻底退役 ExpandUserProfileScope 协议

**What to build:** 从共享契约、producer、worker 和公开模块接口中完全删除已经没有生产调用方的 scope-expansion 协议，使队列只接受现行 rebuild job。

**Blocked by:** 08 — 收缩旧失效接口和投影 composition

**Status:** resolved

- [x] `ExpandUserProfileScope` job name、payload schema、payload type、job ID builder 和 producer 方法全部删除。
- [x] Worker 不再注册、分派或处理 scope-expansion job。
- [x] 公开 `UserProfileScopeType` 及 compatibility alias 被删除。
- [x] 只服务旧协议的 all-users、user-ids、user-id、privilege-id 和 privilege-code scope 分支被删除。
- [x] Shared job contract 明确拒绝 `"expand-user-profile-scope"` 和旧 scope payload。
- [x] Job producer 的公开能力只剩实际使用的 bulk rebuild enqueue。
- [x] 现有 `RebuildUserProfile` queue name、payload、dirty version 和 deterministic job ID 完全不变。
- [x] `PrivilegeUpdated` 仅作为历史 dirty reason 保留，不重新引入 privilege scope 或公开 source change。
