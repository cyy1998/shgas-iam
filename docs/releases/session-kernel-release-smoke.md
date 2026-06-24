# Session Kernel Release Smoke Record

Do not paste full Redis keys, bearer tokens, authorization codes, cookies, client secrets, PKCE verifiers, ID Tokens,
access tokens, or private payloads into this record.

## Release Context

| Field | Value |
|---|---|
| Environment | Local dev Docker stack running under compose project `shgas-iam` |
| Window | 2026-06-24 Asia/Shanghai |
| Branch | `work/session-kernel-release-hardening` |
| Gateway | APISIX `http://localhost:30080` |
| Direct backend ports | api `http://localhost:30011`, admin-api `http://localhost:30012`, oidc-provider `http://localhost:30015` |
| Dependencies | PostgreSQL `shgas-iam-db-1` healthy, Redis `shgas-iam-redis-1` healthy |
| Operator | Codex |

## Delta Validation

| Command | Result | Evidence summary |
|---|---|---|
| `pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/env.test.ts src/__tests__/redis-adapter.test.ts` | Passed | 2 files passed; 16 tests passed |
| `pnpm --filter @iam/oidc-provider typecheck` | Passed | `tsc --noEmit` completed |
| `pnpm --filter @iam/oidc-provider lint` | Passed | ESLint completed |

Previous task validation for api-core, api, admin-api, admin, and sso is recorded by tasks 6.1-6.5.

## Redis Cleanup

| Step | Result | Pattern/count summary |
|---|---|---|
| Initial legacy cleanup dry-run | Passed | `session_kernel.cleanup_legacy_keys.completed`; dry-run mode; all `patternCounts` and `deletedCounts` were `0`; duration `19ms` |
| Post-smoke legacy cleanup dry-run | Passed | dry-run mode; live OIDC smoke left `oidc-client-object-index=1` and `oidc-session-uid-index=8`; all `deletedCounts` stayed `0`; duration `13ms` |
| legacy cleanup apply | Not run | Task 6.6 required dry-run only; live dev OIDC runtime keys were present after smoke |
| rollback cleanup of `sess:v2:` keys | Not run | Rollback scenario was not exercised |

Command used:

```bash
REDIS_URL=127.0.0.1 REDIS_PORT=6390 REDIS_DB=0 pnpm --filter @iam/api-core session:cleanup-legacy-keys -- --dry-run --batch-size 500
```

## custom SSO Smoke

| Scenario | Result | Evidence summary |
|---|---|---|
| Gateway client login -> `/sso/authorize` -> `/sso/callback` | Passed | Password login for `141441` returned 200 with `global_session`; `iam-admin` authorize returned 302 to `/sso/callback`; callback returned 302 to the redirect URL and set the local session |
| `/auth/authz` accepts local session opaque token and returns `X-User-Info` | Passed | `/api/iam/auth/authz` with `Client: iam-admin` and `X-Forwarded-Uri: /admin/` returned 200 and included `X-User-Info` |
| Redis has no old custom SSO authority keys | Passed | `local_*_session:*`, `local_session_reverse:*`, `local_session_set:*`, `global_session:*`, and `auth_code:*` scans returned 0 before smoke |
| Independent client `/sso/authorize` -> `/sso/token` | Passed | `grafana` authorize returned 302 with code; `/sso/token` returned 200 with `sid` and `userInfo` |
| auth code replay is rejected | Passed | Gateway callback replay returned 401 `AUTH.UNAUTHORIZED`; Independent `/sso/token` replay returned 401 `SSO.INVALID_AUTH_CODE` |
| `/sso/logout` revokes PrincipalSession and derived local session | Passed | Logout returned 302 to redirect URL; reused `local_iam-admin_session` on `/auth/authz` returned 401 `AUTH.UNAUTHORIZED` |

System log evidence:

| Query target | Result | Evidence summary |
|---|---|---|
| `event="session_kernel.tombstone_replay.detected"` for custom SSO auth code replay | Passed | API logs contained replay events for `clientCode="iam-admin"` and `clientCode="grafana"`, `protocol="custom-sso"`, `artifactType="auth_code"`, `reason="consumed"` |
| `event="session_kernel.tombstone_replay.detected"` for custom SSO logout | Passed | API logs contained `protocol="custom-sso"`, `clientCode="iam-admin"`, `credentialType="local_session"`, `reason="logout"` |
| Redaction check | Passed | Smoke output and logs inspected in this pass did not expose bearer, auth code, cookie, or secret values |

## OIDC Smoke

| Scenario | Result | Evidence summary |
|---|---|---|
| Discovery and JWKS | Passed | Gateway discovery endpoint returned 200; provider health returned 200 |
| Authorization Code Flow authorize -> token | Passed | Final rebuild rerun: PKCE S256 authorize followed `303,303,303` and ended at Grafana redirect with code; token endpoint returned 200 with access token and ID token present |
| UserInfo validates opaque access token through Session Kernel credential lookup | Passed | `/oidc/me` returned 200 with `sub` and `name`; Redis showed provider access-token payload and active Kernel credential before UserInfo |
| authorization code replay is rejected | Passed | Reusing the code returned 400 `invalid_grant` |
| RP-Initiated Logout revokes current PrincipalSession | Passed | End-session page returned 200; confirm POST with xsrf and `logout=yes` returned 303 to `http://localhost:30030/login?state=logout-smoke` and cleared `_session` and `global_session` cookies |
| UserInfo rejects revoked/tombstoned token after logout | Passed | Reusing the old access token on `/oidc/me` returned 401 `invalid_token` |

System log evidence:

| Query target | Result | Evidence summary |
|---|---|---|
| `event="session_kernel.tombstone_replay.detected"` by `sourceApp="iam-oidc-provider"` | Passed | OIDC logs contained `objectType="credential"`, `protocol="oidc"`, `clientCode="grafana"`, `credentialType="access_token"`, `reason="logout"` after logout |
| `oidc.provider.protocol_error` for code replay | Passed | OIDC logs contained `oidcEvent="grant.error"`, `errorCode="invalid_grant"`, status 400 |
| Redaction check | Passed | Smoke output and logs inspected in this pass did not expose code, token, verifier, client secret, or cookie values |

## Admin Revoke Smoke

| Scenario | Result | Evidence summary |
|---|---|---|
| Client status change triggers OIDC protocol revoke | Passed | Temporarily bound user `141441` to existing `iam:admin` role, patched `grafana` to `ClientStatus.Maintance` (`2`) with 200, then patched back to `ClientStatus.Enable` (`1`) with 200 |
| Temporary admin binding cleanup | Passed | Temporary `employment_role` binding was removed after smoke; existing `iam:admin` role remained unchanged |
| Client state restored | Passed | `grafana` final DB status was `1` before cleanup trap completed |
| Old OIDC token rejected after revoke/logout | Passed | OIDC UserInfo with the old token returned 401 `invalid_token`; admin revoke log showed already-revoked OIDC objects for `grafana` |

System log evidence:

| Query target | Result | Evidence summary |
|---|---|---|
| `event="admin.session_revoke.client_protocol"` by `clientCode`, `protocol`, and `reason` | Passed | admin-api logs contained `clientCode="grafana"`, `protocol="oidc"`, `reason="client_config_changed"`, `actorUsername="141441"`, and `oidcInvalidation.succeeded=true` |
| `event="admin.session_revoke.cleanup_failed"` | Not observed | No cleanup failure was injected or observed during this smoke |

## Findings Fixed During Smoke

| Finding | Fix | Validation |
|---|---|---|
| Empty `SESSION_LOOKUP_HMAC_PREVIOUS_ID` / `SESSION_LOOKUP_HMAC_PREVIOUS_SECRET` values caused oidc-provider env parsing to fail in dev Docker | Treat empty previous HMAC env values as unset and keep paired/length validation when present | OIDC env tests passed |
| First OIDC authorization after login saved AuthorizationCode before provider Session mapping consumed staged binding, causing fail-closed 500 | OIDC Redis adapter now falls back to `consumeStaged(accountId, sessionUid)` when binding read misses before AuthorizationCode/AccessToken registration | OIDC redis adapter test added; full OIDC smoke passed |

## Final Decision

| Gate | Result | Notes |
|---|---|---|
| cleanup dry-run executed against dev Redis | Accepted | Initial dry-run had zero legacy key counts; post-smoke dry-run was not applied because live OIDC runtime keys were present |
| custom SSO accepted | Accepted | Gateway, Independent, replay rejection, authz, and logout paths passed |
| OIDC accepted | Accepted | Discovery, authorize/token, UserInfo, replay rejection, logout, and post-logout token rejection passed |
| admin revoke accepted | Accepted | Client status maintenance triggered `admin.session_revoke.client_protocol`; client status restored |
| Runtime logs redacted | Accepted | No bearer/code/secret/cookie/private payload observed in inspected smoke output or logs |
| Rollback prerequisites documented and tested, if applicable | Documented; not smoke-tested | Rollback scenario was not exercised in task 6.6 |
