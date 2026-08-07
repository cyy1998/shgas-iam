# 03 — OIDC 改用 lookup → Kernel 权威读取

**What to build:** 让 OIDC 的普通 Provider Session binding 读取与 silent authorization ensure 都从最小 lookup 找到权威 Kernel OIDC Client Binding，再重建 provider-facing view，从而让重复的 full Redis value 不再参与任何授权或 ownership 决策。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] 普通 binding 读取通过 `(Provider Session, client)` lookup 获取 binding identity 与 mapping owner，再解析 Kernel OIDC Client Binding 和 Principal Session。
- [x] silent authorization 的 ensure 路径使用同一权威读取流程，不再把 full Redis value 缺失或不匹配当成创建新 binding 的依据。
- [x] 重建的 provider-facing view 保持 account、user、auth time、client、configuration version、anchor generation、mapping owner 和 expiry 语义。
- [x] 读取过程校验 protocol、client、Provider Session identity、mapping owner、Principal Session、Subject Access transition、configuration version 和 anchor generation，任一失败都保持 fail closed。
- [x] Authorization Code 必须在有效 OIDC Client Binding 与 Claims Snapshot 建立后才可持久化，Access Token、UserInfo 和 ID Token ownership/replay 行为不变。
- [x] 同一 Provider Session 下的多个 client 继续独立绑定、独立撤销，Principal Session rotation 继续受 generation 与 owner CAS 保护。
- [x] publication response loss、旧 owner 替换和 cleanup confirmation 的现有行为不变。
- [x] 此 ticket 可以继续写入 full Redis value，但除窄状态存储契约外，生产读取与业务测试不再依赖它。
- [x] lookup → Kernel 重建不引入新的数据库读取，OIDC authorization lifecycle 与 Redis adapter 的高层契约继续通过。
