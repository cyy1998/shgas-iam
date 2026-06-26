## Context

`apps/oidc-provider/src/interaction/policy.ts` 的 `validateAuthorizationRequest` 当前在 IAM 自定义 interaction policy 中强制要求 `state`、`nonce` 和 PKCE S256。该限制发生在 OIDC authorize 请求进入登录交互前，因此缺少 `nonce` 的 code flow client 会被直接拒绝。

现有 provider 只启用 `responseTypes: ["code"]`，并强制 `pkce.required`。`oidc-provider` 本身在纯 Authorization Code Flow 下不会强制 `nonce`；它只会在 implicit/hybrid 等 authorization endpoint 直接签发 ID Token 的流程中要求 `nonce`。本项目未启用这些流程。

## Goals / Non-Goals

**Goals:**

- 允许合法 Authorization Code Flow 请求省略 `nonce`。
- 保持 `state`、PKCE S256、精确 `redirect_uri`、`openid` scope 和 allowed scopes 校验不变。
- 当请求包含 `nonce` 时继续由 provider 在 ID Token 中回显原始值。
- 当请求未包含 `nonce` 时通过测试确认 ID Token 不包含 `nonce` claim。

**Non-Goals:**

- 不启用 implicit、hybrid、refresh token、FAPI 或 request object 等新 OIDC 能力。
- 不调整 client registry、client metadata、Session Kernel、Redis adapter 或 token TTL 规则。
- 不为 client 增加 per-client `nonce` 强制开关；如后续有高安全等级 client 需要，可另立变更。

## Decisions

1. 在 IAM 自定义 authorize 校验中移除 `nonce` 必填检查。

   理由：强制点只存在于 `validateAuthorizationRequest`，且标准 code flow 已通过 `state` 与 PKCE S256 覆盖 CSRF 与 authorization code injection 防护。替代方案是增加环境变量或 client 配置控制 `nonce` 是否必填，但当前需求是整体放宽，新增配置会扩大管理面且没有现有产品诉求。

2. 保持 `nonce` 的保存与回显路径为库默认行为。

   理由：`oidc-provider` 会把 authorize 参数中的 `nonce` 放入 Authorization Code payload，并在 token exchange 签发 ID Token 时设置 `nonce`。Session Kernel authorization code metadata 当前通过 passthrough 解析，且 `nonce` metadata 不是消费校验的必填字段，因此不需要新增迁移或 schema 变更。替代方案是在 IAM adapter 中额外规范化 `nonce` 字段，但这会复制库已有协议行为。

3. 用测试锁定“有 nonce 回显、无 nonce 不拒绝”的双路径。

   理由：现有测试只覆盖缺 `nonce` 被拒绝和带 `nonce` 的 token flow。变更后需要同时验证入口校验和最终 ID Token claim，避免只放开入口却在 token exchange 或 JWT claim 上出现隐性不兼容。

## Risks / Trade-offs

- [Risk] 某些 RP 仍依赖 `nonce` 做 ID Token replay 关联。→ Mitigation: provider 继续支持并回显 RP 主动提供的 `nonce`，只是不再替 RP 强制生成或要求。
- [Risk] 规格标题原本包含“强制 state nonce 与 PKCE”，语义会与新行为不一致。→ Mitigation: delta spec 使用 RENAMED 将 requirement 标题调整为 `Authorization Code Flow 强制 state 与 PKCE，nonce 可选`，并在 MODIFIED 内容中完整描述新行为。
- [Risk] `oidc-provider` 对缺失 `nonce` 的 ID Token claim 行为需要实测确认。→ Mitigation: 增加无 `nonce` 的 token flow 测试，要求验证后的 ID Token payload 不包含 `nonce`。

## Migration Plan

无数据迁移。发布后，新旧 client 都可以继续使用 Authorization Code Flow：发送 `nonce` 的 client 行为不变，未发送 `nonce` 的 client 不再被 IAM 自定义 policy 拒绝。

回滚方式是恢复 `validateAuthorizationRequest` 对 `nonce` 的必填校验，并恢复对应测试期望。

## Open Questions

无。
