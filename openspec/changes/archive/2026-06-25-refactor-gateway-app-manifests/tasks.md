## 1. Source Manifest Loader

- [x] 1.1 Update gateway command options and types to replace `manifestDir` / `--manifest-dir` with `manifest` / `--manifest`.
- [x] 1.2 Change default manifest resolution to `gateway/manifests/<env>/<app>.yaml` and remove old app-directory loading support.
- [x] 1.3 Add source manifest materialization helpers for `service`, `upstreams`, `routes`, `service.plugin_configs`, `consumers`, and `ssls`.
- [x] 1.4 Generate dot-style APISIX `id` and `name` values from scope and local `key`.
- [x] 1.5 Auto-inject reserved repository labels into every materialized APISIX resource while preserving non-reserved source labels.
- [x] 1.6 Materialize route `upstream` and `plugin_config` local references into `upstream_id` and `plugin_config_id`.
- [x] 1.7 Auto-inject current app `service_id` for non-terminal routes and omit `service_id` / `upstream_id` for `terminal: true` routes.

## 2. Validation Rules

- [x] 2.1 Add validation for exactly one app service and prohibit service `id`, `name`, and default `upstream_id` in source manifests.
- [x] 2.2 Add validation for kebab-case `key` values and same-kind duplicate keys.
- [x] 2.3 Reject generated APISIX fields in source objects: `id`, `name`, `service_id`, `upstream_id`, and `plugin_config_id`.
- [x] 2.4 Reject source overrides of reserved labels: `managed_by`, `source`, `env`, and `app`.
- [x] 2.5 Validate non-terminal routes require an existing local upstream key.
- [x] 2.6 Validate `plugin_config` references resolve to `service.plugin_configs` keys in the same app manifest.
- [x] 2.7 Update validation issue file/path reporting to point at the new single manifest file.

## 3. Manifest Migration

- [x] 3.1 Convert `gateway/manifests/dev/iam/` into `gateway/manifests/dev/iam.yaml`.
- [x] 3.2 Convert `gateway/manifests/dev/tender/` into `gateway/manifests/dev/tender.yaml`.
- [x] 3.3 Convert `gateway/manifests/dev/gds/` into `gateway/manifests/dev/gds.yaml`.
- [x] 3.4 Convert `gateway/manifests/prod/iam/` into `gateway/manifests/prod/iam.yaml`.
- [x] 3.5 Convert `gateway/manifests/prod/tender/` into `gateway/manifests/prod/tender.yaml`.
- [x] 3.6 Convert `gateway/manifests/prod/gds/` into `gateway/manifests/prod/gds.yaml`.
- [x] 3.7 Remove old per-app manifest directories after the new single files validate.

## 4. Tests

- [x] 4.1 Update manifest test helpers to create single-file source manifests.
- [x] 4.2 Add loader tests for single-file path resolution and old directory rejection.
- [x] 4.3 Add materialization tests for dot ids, generated names, labels, service_id injection, terminal routes, upstream references, and plugin_config references.
- [x] 4.4 Add validator tests for reserved label overrides, generated field rejection, invalid keys, duplicate keys, missing upstreams, and missing plugin_configs.
- [x] 4.5 Add behavior-equivalence tests for migrated IAM SSO hosts and `X-IAM-Entry-Network` injection.
- [x] 4.6 Add behavior-equivalence tests for Tender internal-authz headers, `forward-auth`, and `proxy-rewrite` preservation.
- [x] 4.7 Add behavior-equivalence tests for GDS/Tender special upstream overrides such as external frontend, MinIO, dashboard, and webroot routes.

## 5. Documentation And Validation

- [x] 5.1 Update `gateway/README.md` directory structure, source schema examples, CLI examples, and file ordering guidance.
- [x] 5.2 Document first migration rollout commands requiring `diff`, `apply --dry-run --prune`, and `apply --prune`.
- [x] 5.3 Update gateway env placeholder documentation only where paths or object ids changed; keep existing upstream env var names unchanged.
- [x] 5.4 Run `pnpm --filter @iam/gateway-apisix test`.
- [x] 5.5 Run `pnpm --filter @iam/gateway-apisix typecheck`.
- [x] 5.6 Run gateway manifest validation for `dev:iam`, `dev:tender`, `dev:gds`, `prod:iam`, `prod:tender`, and `prod:gds` with the required env rendering inputs.
