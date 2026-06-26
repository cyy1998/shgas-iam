## 1. Authorize Policy

- [x] 1.1 更新 `apps/oidc-provider/src/interaction/policy.ts`，允许 Authorization Code Flow authorize 请求省略 `nonce`。
- [x] 1.2 保持 `state`、`code_challenge`、`code_challenge_method=S256`、精确 `redirect_uri`、`openid` scope 和 allowed scopes 校验不变。
- [x] 1.3 确认 Session Kernel authorization code metadata 不需要强制、合成或迁移 `nonce` 字段。

## 2. Test Coverage

- [x] 2.1 更新 `apps/oidc-provider/src/__tests__/interaction.test.ts`，验证缺少 `nonce` 的合法请求可通过，缺少 `state`、缺少 PKCE 或非 S256 method 仍被拒绝。
- [x] 2.2 更新 `apps/oidc-provider/src/__tests__/token-flow.test.ts`，验证请求包含 `nonce` 时 ID Token 回显原始 `nonce`。
- [x] 2.3 补充无 `nonce` 的 token exchange 覆盖，验证 ID Token 不包含 `nonce` claim。

## 3. Verification

- [x] 3.1 运行 `pnpm --filter @iam/oidc-provider test`。
- [x] 3.2 运行 `pnpm --filter @iam/oidc-provider typecheck`。
- [x] 3.3 运行 `openspec validate make-oidc-nonce-optional --strict`。
