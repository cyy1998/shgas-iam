---
status: accepted
---

# 对 Client Traffic Gate 采用 Snapshot 一致性

Client Traffic Gate 与 OIDC、Custom SSO Runtime 配置统一采用 ADR-0021 的 Client Runtime Snapshot 一致性边界，不再在 Admin mutation 提交前建立 Redis mutation fence，也不保留 reserve、ownership、heartbeat、complete 或 abort 状态机。成功取得的 Gate Snapshot 对当前请求保持有效；Admin mutation 只有在提交后原子推进 Redis generation 并使旧 payload 不可用之后，才约束后续取得的 Snapshot。

本决定局部修订 ADR-0012 的“切换中 fail closed”保证：若 PostgreSQL 已提交但运行时失效未执行或未确认，Admin 请求返回 required after-commit error，但先前已发布的正常 Gate Snapshot 可以继续被新请求取得并放行流量，直到显式幂等 repair 完成。系统不为该场景增加 PostgreSQL cache revision、事务 outbox 或自动 repair；这是为删除跨系统 mutation fencing 而有意接受的运行时传播失败窗口。control 缺失、损坏或不可读取时仍失败关闭，不得使用残留 payload 或默认 generation 放行。

显式 repair 由 Worker one-shot CLI 拥有：命令必须在单个 `clientCode` 与全量模式之间二选一，通过 Redis-only composition 推进目标 Client 的共享 control 并删除 OIDC、Custom SSO 与 Client Traffic Gate 三份 payload，输出结构化结果后退出。单 Client 模式处理 mutation 传播失败，全量模式只在协议流量关闭时处理 Redis backup restore；命令不读取或修改 PostgreSQL，不进入 ClientService，不重放原业务 mutation，也不推进协议配置版本或轮换 Secret。重复执行只再次失效可重建缓存，效果保持安全。系统不新增 Admin repair endpoint，也不把原始 Redis 命令作为正式 repair 接口。

全量 restore repair 不枚举 PostgreSQL Client，也不逐 Client 解释恢复出的 control；它在停流状态下使用 Redis `SCAN` 与分批 `UNLINK` 清空 Module-owned versioned namespace 及 legacy Runtime keys，允许部分完成并安全重跑。成功后每个 Client 在首次 acquisition 时通过正常 bootstrap 获得新随机 epoch；命令失败时必须保持协议流量关闭，不能按已删除 key 数推断整体一致性或局部放流。

Worker 另行提供独立、只读的全量 verify，在 repair 后重新完整扫描 Module-owned versioned namespace 与 legacy Runtime key inventory，并只以完整扫描成功且目标 key 为零作为通过状态；扫描数、删除数与批次数只用于诊断，不能替代 `status`。repair 与 verify 都输出脱敏结构化 report，并以非零退出码阻断后续 gate；verify 不证明协议流量仍关闭、旧进程已经 drain 或新代业务可用，这些事实分别由人工 release receipt 与 mutation/acquisition smoke 证明。

Traffic Gate Snapshot Adapter/Reader、Admin 提交后 required invalidation、旧强 fence 退役、Worker repair/verify 与对应
Component/Redis/Process 验收均已实现；传播失败窗口仍是当前运行时的明确限制，不由自动 repair 或 legacy fallback 隐藏。
