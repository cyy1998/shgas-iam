# 裁定 V2 档案与协议的迁移发布边界

Type: grilling

Status: unclaimed

Blocked by: 05 — 定义 User Profile V2 的任职责任快照；06 — 定义 Internal DSL 的责任搜索语义；07 — 定义 UserInfo V2 的任职责任契约

## Question

在 User Profile、Subject Facts、Internal DTO/DSL、Custom SSO Wire 与 OIDC Claims Snapshot 同时进入 V2 的前提下，协调式硬切换
需要哪些 backfill、验证、冻结、兼容处置和回滚边界，才能避免同一用户或 client 观察到混合版本？

本 ticket 需要决定：

- schema/catalog/wire/snapshot version 的切换单位与 source-of-truth；
- 全量 Profile V2 rebuild/backfill、责任数据校验、Subject Facts 预热和 Dirty/freshness 一致性 gate；
- 第三方 Internal、Custom SSO 与 OIDC client 的升级确认、旧 artifact 失效和 maintenance freeze；
- 失败时回滚 database/read model、cache、client config 与协议流量的最小一致边界；
- 哪些 release/runbook 细节必须进入最终 spec，哪些留给后续 implementation/release planning。
