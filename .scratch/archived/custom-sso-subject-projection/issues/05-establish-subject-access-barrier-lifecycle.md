# 05 — 建立 Subject Access Barrier 完整生命周期

**What to build:** 以独立 Redis 安全记录控制账号的即时可访问性，并把禁用、删除、离职、重新启用和新用户发布纳入可恢复的状态转换，保证不确定状态一律拒绝访问。

**Blocked by:** 01, 03

**Status:** resolved

- [x] Subject Access Barrier record 只允许 `enabled`、`blocking`、`disabled`，并包含版本、Subject Identifier、可选 transition ID 和更新时间；Subject Facts 不保存或推导账号可用性。
- [x] 每次解析有效 Session 或 Credential 后、读取可选 Subject Facts 前检查 Barrier：`enabled` 才继续，`disabled` 返回 `401 SESSION_INVALID` 并清 Cookie。
- [x] `blocking`、record 缺失、Redis 读取失败或内容非法全部返回 `503 SUBJECT_ACCESS_UNAVAILABLE`，且不清 Cookie、不从 Profile 或 session 猜测账号可用。
- [x] 禁用、删除或导致账号不可用的离职 mutation 在数据库写入前以唯一 transition ID 原子进入 `blocking`；pre-block 失败时数据库 mutation 不发生。
- [x] 数据库提交后将相同 transition finalize 为 `disabled` 并撤销该 Principal 的全部 Session；数据库回滚时只有相同 transition ID 能恢复转换前状态。
- [x] 提交后的 finalize 失败保持 `blocking`，由可索引的 repair backlog 对照数据库权威状态收敛，不在请求路径内放宽访问。
- [x] 重新启用账号后仍保持不可访问，直到数据库提交且当前版本 Subject Facts 发布完成才切为 `enabled`；先前撤销的 Session 永不恢复。
- [x] 新用户在初始 Profile 与 Subject Facts 成功发布前不会进入 `enabled`；Barrier 缺失不能通过 cache warmer 或 lazy read 自动补成启用。
- [x] 全部相关账号生命周期入口复用同一 Barrier 协议，不存在可绕过 pre-block/finalize 的独立禁用、删除、离职或重新启用路径。
- [x] 隔离 Redis namespace 的并发 contract tests 证明 transition、finalize、同 transition rollback 和错误 transition 拒绝的线性化语义。
- [x] 最高层账号 service tests 证明 pre-block 失败不写库、rollback 恢复、commit 后 disabled、finalize failure 保持 blocking、repair 收敛，以及重新启用不恢复旧 Session。
