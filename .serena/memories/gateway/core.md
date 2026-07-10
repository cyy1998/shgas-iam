# Gateway Core

- Gateway workspace package: `gateway` (`@iam/gateway-apisix`).
- Root scripts delegate to the gateway package: `gateway:apisix`, `gateway:apisix:validate`, `gateway:apisix:diff`, `gateway:apisix:apply`.
- Main sync entrypoint: `gateway/src/cli.ts`; tests live under `gateway/src/__tests__/`.
- Config files live under `gateway/config/` with dev config and prod example.
- Manifests are app-scoped single YAML files at `gateway/manifests/<env>/<app>.yaml`; checked-in scopes currently cover `{dev,prod}:{iam,tender,gds}`. Old per-app manifest directories are invalid.
- CLI scope format is `<env>:<app>`, e.g. `--env prod:iam`; `--manifest` may override the default single-file path.
- A source manifest materializes its service, nested service plugin configs, upstreams, plugin metadata, routes, consumers, and SSL objects into APISIX resources.
- Repo-owned resources use `labels.source=repo-manifest` and app/env scope labels. Runtime `source=dynamic-registry` IAM objects are outside repo-manifest ownership and must not be declared or pruned.
- Standard release flow is `validate` -> `diff` -> `apply --dry-run` -> `apply`. Use `--prune` only after confirming every deletion is repo-managed and inside the selected `env:app` scope.
- Gateway uses Bun, TypeScript, Antfu ESLint, Commander, and the `yaml` parser.