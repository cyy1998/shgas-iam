# 01 — 建立可逆 Client Traffic Gate 扩展路径

**What to build:** 为 Client 全局状态建立一个协议中性的可逆 Traffic Gate，使 Admin 状态写入能够可靠发布正常、Maintenance 与状态不可确认的运行时结果，同时保持当前 Custom SSO/OIDC 线上行为不变，为后续协议逐步迁移提供安全的 expand 路径。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Traffic Gate 从现有 Client 全局状态派生，不新增数据库生命周期列，也不把 Maintenance 写入协议配置。
- [x] 运行时只有明确确认 Client 为 `Enable` 时返回可放行结果；明确 Maintenance 与状态缺失、损坏、读取失败或切换中分别表现为可区分的暂态结果。
- [x] Traffic Gate 封闭 generation、mutation fence、缓存发布与 fail-closed 行为，并防止并发旧数据库读取在状态变更后重新发布过期的 `Enable`。
- [x] Admin 状态更新在锁定目标 Client 后建立门禁 mutation，数据库提交后以 required 语义发布新状态并完成 mutation，成功响应只在 required 发布成功后返回。
- [x] 数据库提交后门禁发布失败时 Admin 操作报告失败，在线门禁保持 fail closed，安全重试不会造成旧状态误放行。
- [x] 本票不移除现有全局状态变化的协议版本推进或撤销行为，也不改变 Custom SSO/OIDC endpoint 的当前错误契约。
- [x] 真实 Redis Integration 通过 production Traffic Gate seam 验证 generation、fence、并发旧回填拒绝、发布失败和恢复，不由测试 fixture 复制 Redis key、Lua、serialization 或 transaction 协议。
- [x] 受影响 workspace 的聚焦 Integration、lint、typecheck、Architecture Guard、test collection guard 与 `git diff --check` 通过。
