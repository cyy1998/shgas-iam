# 01 — 采用协议中性的 Subject Identity

**What to build:** 将现有 OIDC Subject 提升为 IAM 共享身份事实，并把 Session Kernel 的主体引用收敛为最小、协议中性的契约，使后续协议投影不再依赖宽 User Detail 或通用 Principal Snapshot。

**Blocked by:** None

**Status:** resolved

- [x] 以新 migration 直接将用户 `oidc_subject` 重命名为 `subject_identifier`，保留全部既有 UUID、默认值、非空与唯一性，不创建第二套 Subject Identifier，也不修改已执行 migration。
- [x] OIDC 对已有用户和新用户签发的 `sub` 仍等于同一个 Subject Identifier；重命名前后的身份连续性有自动化回归证明。
- [x] Principal Reference 的公开契约只包含 `principalType` 与以 Subject Identifier 表示的 `subjectId`，不再携带数据库用户 ID、用户名、显示名或 Profile 数据。
- [x] 通用 Principal Snapshot 及其 legacy normalization 被直接删除，不保留空字段、兼容 DTO、双读或双写路径；协议专属 Snapshot 仍由各自协议拥有。
- [x] Principal Session 创建接口只接收 Subject Identifier 和认证上下文，序列化后的共享 session artifact 不包含 User Detail、Client Subject Projection 或其他可变档案。
- [x] 共享认证中间件只产生 `subjectIdentifier`、`authenticatedClientCode` 和可选 `orcasId`；仍需数据库主键或账号详情的旧 handler 通过自己的 Account Resolver 显式读取。
- [x] 用户创建流程只负责生成 Subject Identifier 与认证所需上下文，不提前构造 Subject Facts、协议 payload 或兼容快照。
- [x] Session Kernel 的创建、解析、撤销、client/protocol 隔离及 artifact 序列化测试全部改用最小 Principal Reference，并证明新增 User Detail 字段不会进入 session artifact。
- [x] 受影响的 API、Worker、OIDC Provider 和 Session Kernel composition 能以新身份契约启动，且稳定 module edge 不反向依赖 OIDC 或 Custom SSO 配置。
