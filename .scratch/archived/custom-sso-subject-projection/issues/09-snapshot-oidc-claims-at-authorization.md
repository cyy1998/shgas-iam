# 09 — 在 Authorization Code 前固化 OIDC Claims Snapshot

**What to build:** 让 OIDC 复用协议中性的 Subject Selection 与 Facts，但在签发 Authorization Code 前固化独立 Claims Snapshot，从而维持稳定 `sub`、显式 scope 和不可脏读的授权信息，而不与 Custom SSO 共享配置或会话。

**Blocked by:** 01, 02, 04, 05

**Status:** resolved

- [x] OIDC adapter 只把实际授权 scope 映射为 Subject Claim Selection：`openid` 只选 subject，`profile` 选 username/name，`phone` 选手机号，`iam:employments` 选任职，`iam:authorization` 选当前 client 授权。
- [x] 标准 `profile` 不隐含任职；`iam:employments` 与 `iam:authorization` 只进入 UserInfo，不进入 ID Token。
- [x] OIDC `sub` 对既有和新用户继续等于 Subject Identifier，不因 Custom SSO 配置、mode 或 config version 变化而改变。
- [x] OIDC Claims Snapshot 在授权完成后、Authorization Code 签发前创建，并绑定 Subject Identifier、client、实际 scope、OIDC config version、Provider Session 与 Principal Session。
- [x] 选择 `iam:authorization` 时在签发 Code 前执行 Authorization Freshness Barrier；Subject Projection Not Ready 映射为 `temporarily_unavailable` 且绝不签发 Code。
- [x] Token Endpoint 只把 Code 中的 Claims Snapshot 转移到 Access Token，不重新读取 Profile 或重新计算 Selection；UserInfo 只重放 Access Token Snapshot。
- [x] OIDC authorization wire 保持既有字段名，只为任职补充 `isPrimary`；不并行输出 Custom SSO wire 字段或任何兼容双字段。
- [x] OIDC 与 Custom SSO 只共享 Subject Identifier、Selection、Projection 和 Facts 能力，不共享 config、Secret、wire contract、Claims Snapshot、artifact 或 session 生命周期。
- [x] OIDC Admin API、client type、enabled-state mutation、删除和 Secret 轮换语义完全保持不变。
- [x] OIDC authorization/claims/provider/token-flow tests 证明 scope 映射、标准 profile 边界、Code 前 Snapshot、失败不发 Code、Token/UserInfo 无二次读取、`sub` 稳定，以及 Custom SSO 配置变化不影响 OIDC。
