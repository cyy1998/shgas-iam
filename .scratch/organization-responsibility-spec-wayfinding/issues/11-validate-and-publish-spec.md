# 验证并发布组织责任关系模型 Spec

Type: prototype

Status: unclaimed

Blocked by: 06 — 定义 Internal DSL 的责任搜索语义；07 — 定义 UserInfo V2 的任职责任契约；08 — 设计 Admin 责任定义与任命管理体验；09 — 确定审计、访问控制与错误契约；10 — 裁定 V2 档案与协议的迁移发布边界

## Question

如何把已解决 tickets 的决定汇总成一份无重复、无矛盾且能直接拆 implementation tickets 的 Organization Responsibility spec，
并用关键场景证明领域模型、Admin、Internal DSL、UserInfo V2 与迁移边界已经完整？

本 ticket 应制作 spec 草案并与维护者逐项验证：

- Definition、Assignment、Employment、Organization 的术语、关系、不变量和生命周期；
- Admin 与 Internal 的用户旅程、命令/查询、DTO、错误、审计和访问控制；
- User Profile/Subject Facts/Internal DSL/Custom SSO/OIDC V2 的完整契约与版本边界；
- 单一负责人、共同负责人、多组织分管、未来预约、离职、组织停用、定义收紧和并发写入等场景；
- 数据迁移、验证、回滚、测试层级和明确 out-of-scope；
- `CONTEXT.md` 与 ADR 是否需要更新，以及后续 `/to-tickets` 的输入是否已经充分。
