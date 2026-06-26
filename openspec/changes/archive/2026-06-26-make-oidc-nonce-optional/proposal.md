## Why

当前 OIDC provider 对 Authorization Code Flow 的 authorize 请求强制要求 `nonce`，这比标准 code flow 的要求更严格，导致部分只依赖 `state` 与 PKCE 的合规 client 无法接入。

本变更放宽 `nonce` 为可选参数，同时保留 `state`、精确 `redirect_uri`、`openid` scope 和 PKCE S256 的强制校验，兼顾互操作性与现有安全边界。

## What Changes

- 将 OIDC Authorization Code Flow 中的 `nonce` 从必填改为可选。
- 当 authorize 请求提供 `nonce` 时，provider 继续在 ID Token 中回显原始 `nonce`。
- 当 authorize 请求未提供 `nonce` 时，provider SHALL 正常完成 code flow，且 ID Token SHALL 不包含 `nonce` claim。
- 保持 `state`、`code_challenge`、`code_challenge_method=S256`、精确 `redirect_uri`、`openid` scope 和 client allowed scopes 校验不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `oidc-provider`: 修改 Authorization Code Flow 对 `nonce` 的要求，并明确 ID Token 对可选 `nonce` 的回显行为。

## Impact

- 影响 `apps/oidc-provider` 的 authorize 请求校验逻辑与相关单元测试。
- 影响 OIDC provider 规格中 Authorization Code Flow 与 ID Token claim 的需求描述。
- 不改变 client registry、Session Kernel、token storage、PKCE、client authentication 或 redirect URI 匹配规则。
