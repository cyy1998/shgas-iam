# 确定审计、访问控制与错误契约

Type: grilling

Status: unclaimed

Blocked by: 04 — 设计组织责任领域模块与接口；08 — 设计 Admin 责任定义与任命管理体验

## Question

Organization Responsibility 的 Definition 与 Assignment 命令需要哪些稳定审计动作、target identity、访问控制和业务错误，
才能支持 Admin 追溯、Internal 读安全及并发冲突恢复？

本 ticket 需要决定：

- create/update/status/cardinality/cancel/end 等动作的 audit action、target type、before/after 安全字段与固定查询条件；
- definition 与 assignment 是否共享 target，或分别形成稳定审计资源；
- Admin authentication 之外是否有资源级权限，Internal API key 能读取哪些字段；
- duplicate、overlap、inactive dependency、invalid interval、stale write、not found 等错误的稳定 code/status；
- mutation 已提交但 User Profile wake-up、cache 或其他 after-commit 动作失败时，调用方看到什么结果及如何恢复。
