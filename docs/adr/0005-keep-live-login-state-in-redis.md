---
status: accepted
---

# 实时登录状态只以 Redis 为事实来源

有效 Principal Session 与 Temporary Login Restriction 只以 Redis 中的实时状态为事实来源；管理列表使用可重建的 Redis 派生索引，PostgreSQL 审计只记录事件，不保存会话影子、当前状态或可重建的历史快照。该选择避免 Redis 与数据库形成双重真相，并接受 Redis 状态丢失会同时使既有会话失效、管理视图清空且无法还原历史会话清单的后果。
