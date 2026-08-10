# 定义 UserInfo V2 的任职责任契约

Type: prototype

Status: unclaimed

Blocked by: 05 — 定义 User Profile V2 的任职责任快照

## Question

Custom SSO 与 OIDC 的 UserInfo V2 应如何在 `profile.employments[].responsibilities` 中交付非授权责任事实，才能保持协议各自的
wire/snapshot ownership、client 选择与最小披露，同时完成已确认的协调式 V2 硬切换？

本 ticket 应用具体 Custom SSO/OIDC 示例决定：

- responsibility 的字段映射、命名、排序与空值规则；
- 选择现有 `profile:employments` / `iam:employments` 时是否总是携带 responsibility，以及 client 配置和 scope 的 V2 语义；
- Custom SSO Catalog/Wire V2 与 OIDC Claims Snapshot V2 如何版本化，ID Token、UserInfo 和 Authorization Code 各自行为；
- Gateway Subject Header 继续排除 employments/responsibilities 的验证边界；
- 旧 V1 client、旧 grant/session/credential/snapshot 在协调切换时如何 fail closed 或退役。
