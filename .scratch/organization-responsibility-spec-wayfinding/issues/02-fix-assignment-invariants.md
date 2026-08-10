# 确定责任任命的时间、不变量与并发规则

Type: grilling

Status: claimed

Blocked by: 01 — 确定责任定义目录的生命周期与治理规则

## Question

Organization Responsibility Assignment 在绑定 Employment、Responsibility Definition 和目标 Organization 后，必须满足哪些
时间、生命周期与并发不变量，才能支持历史、未来预约和 `single | multiple` 基数，而不制造幽灵责任或竞态重叠？

本 ticket 需要压力测试并决定：

- 创建和生效时 holder employment、目标 organization 与 definition 必须具备哪些有效状态；
- `[validFrom, validTo)` 的边界、空结束时间、回溯录入、未来预约、取消、提前结束与更正分别如何表达；
- `single` 如何按组织、定义和时间范围原子拒绝重叠，`multiple` 是否仍有去重或完全相同记录约束；
- 任职转岗、停用、删除或 User Resignation 时，关联责任是阻断、自动结束、显式结束还是进入异常待处理状态；
- 组织或责任定义停用、删除时如何处理当前与未来任命；
- 哪些约束由 PostgreSQL 保证，哪些必须由 transaction-bound application workflow 保证。
