---
status: accepted
---

# 采用协议中性的 Client Subject Projection

Custom SSO 与 OIDC 各自把可信服务端配置或 scope 归一化为 Subject Claim Selection，再共同调用协议中性的 Client Subject Projection Module；该模块只从按 Subject Identifier 发布的 Subject Facts 按当前 client 裁剪，数据库用户主键、其他 client 的授权和完整 `UserDetailDto` 不得进入公开投影、Custom SSO credential 或 session。相比让两个协议共享配置或各自重建用户详情，这个 Seam 共享主体事实与裁剪规则，同时保持协议配置、Wire Contract、Claims Snapshot 和 session 生命周期相互独立。

User Profile 与 Dirty Version 在同一 PostgreSQL 事务内原子发布，Redis 只作为按 Subject 缓存；普通 Profile Claim 可以读取最后发布版本，`iam:authorization` 每次交付必须用 PostgreSQL 权威 Dirty 状态执行 fail-closed 新鲜度检查。账号可用性不进入 Subject Facts，而由 Redis Subject Access Barrier 独立判定；缺失或不可确认时拒绝访问。迁移采用维护窗口硬切换和全量预发布，不提供旧 User Detail、旧 client 配置或旧 session payload 的运行时双读。
