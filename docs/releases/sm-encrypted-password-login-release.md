# SM Encrypted Password Login Release Checklist

## Required Configuration

Backend `apps/api`:

- `LOGIN_CREDENTIAL_ACTIVE_KID` matches the public key used by `apps/sso`.
- `LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON` contains the active `kid` and SM2 private key.
- `LOGIN_CREDENTIAL_MAX_SKEW_MS` is set to the accepted client clock skew window.
- `LOGIN_CREDENTIAL_NONCE_TTL_SECONDS` is at least as long as the timestamp skew window in seconds.

Frontend `apps/sso` build:

- `UMI_APP_LOGIN_CREDENTIAL_ALG=SM2-SM4-CBC`.
- `UMI_APP_LOGIN_CREDENTIAL_KID` matches a backend private key entry.
- `UMI_APP_LOGIN_CREDENTIAL_PUBLIC_KEY` is the SM2 public key paired with the backend private key.

## Synchronized Release

1. Build `apps/api` and `apps/sso` from the same change set.
2. Deploy `apps/api` with the SM2 private key mapping and nonce settings.
3. Deploy `apps/sso` built with the matching public key and `kid`.
4. Smoke-test password login success, wrong password, Cap retry, expired credential, and repeated credential.
5. Confirm `/auth/login/password` rejects legacy `{ username, password }` requests.

## Rollback

This is a breaking request contract change. Roll back `apps/api` and `apps/sso` together.

- If only key material is wrong, fix environment variables and redeploy/restart the affected service.
- If the frontend has already shipped encrypted credentials, rolling back only `apps/api` will break password login.
- If the backend has already shipped credential-only login, rolling back only `apps/sso` will break password login.
