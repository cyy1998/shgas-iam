# IAM System Log Observability Runbook

## Scope

This stack collects runtime system logs for `api`, `admin-api`, `oidc-provider`, and `apisix` through Docker stdout/stderr, Grafana Alloy, Loki, and Grafana. It does not replace PostgreSQL audit logs and does not create a `system_log` table.

Frontend `admin` and `sso` containers are intentionally excluded from phase one.

## Development

Start the normal development stack as before. Loki, Grafana, and Alloy are opt-in:

```bash
docker compose -f docker/docker-compose-dev.yml up -d
docker compose -f docker/docker-compose-observability-dev.yml up -d
```

Default development ports:

- Loki: `http://localhost:3100`
- Grafana: `http://localhost:30030`
- Alloy: `http://localhost:12345`

Stop the observability stack without stopping IAM:

```bash
docker compose -f docker/docker-compose-observability-dev.yml down
```

## Production

Run one centralized Loki and Grafana pair, and run one Alloy agent on each host that runs IAM target containers:

```bash
docker compose -f docker/docker-compose-observability-prod.yml up -d loki grafana
docker compose -f docker/docker-compose-observability-prod.yml up -d alloy
```

Important environment variables:

- `LOKI_IMAGE`, `GRAFANA_IMAGE`, `GRAFANA_ALLOY_IMAGE`: override pinned default images for internal registries.
- `LOKI_PUSH_URL`: Alloy push endpoint, for example `http://loki.internal:3100/loki/api/v1/push`.
- `GRAFANA_LOKI_URL`: Grafana datasource URL for Loki.
- `IAM_LOG_ENV`: Loki `env` label, default `prod` in production compose.
- `IAM_LOG_HOST`: stable host label for the local Alloy agent.
- `LOKI_DATA_PATH`, `GRAFANA_DATA_PATH`, `ALLOY_DATA_PATH`: persistent data directories.

Loki is configured for 30 day retention by default (`720h`). Override `LOKI_RETENTION_PERIOD` if an environment needs a different retention window. Monitor the Loki data directory and alert before disk usage reaches unsafe levels; the bundled Grafana alert rules include a collection-failure signal, but disk watermarks should also be monitored by the host platform.

Backup Loki and Grafana by snapshotting `LOKI_DATA_PATH` and `GRAFANA_DATA_PATH`. To roll back this stack, stop the observability compose services; IAM applications continue writing stdout/stderr logs.

## Grafana OIDC

Create a confidential IAM OIDC client with client code `grafana` through the existing client registry/admin client management flow.

Use these settings:

- Client type: confidential.
- Redirect URI: `${GRAFANA_ROOT_URL}/login/generic_oauth`.
- Scopes: `openid profile`.
- Save the generated client secret once and provide it as `GRAFANA_OIDC_CLIENT_SECRET`; do not commit it.
- Configure `GRAFANA_OIDC_AUTH_URL`, `GRAFANA_OIDC_TOKEN_URL`, and `GRAFANA_OIDC_USERINFO_URL` from the IAM OIDC issuer.
- Keep Grafana login/name/email attribute paths on `preferred_username`, `name`, and `preferred_username` unless IAM starts issuing an `email` claim.

For local debugging, enable Grafana OIDC with the dev override:

```bash
GRAFANA_OIDC_CLIENT_SECRET=<secret> \
docker compose -f docker/docker-compose-observability-dev.yml \
  -f docker/docker-compose-observability-dev.oidc.yml up -d --force-recreate grafana
```

The browser-facing authorization URL uses `http://localhost:30080/oidc/auth`; Grafana's server-side token and userinfo calls use `http://host.docker.internal:30080` so they can reach APISIX from inside the container.

Grafana owns final dashboard and datasource authorization. The admin frontend only links to Grafana and never embeds it with an iframe. The admin-api does not proxy Loki queries.

## Provisioning

Grafana provisioning files live under `observability/grafana/provisioning/`.

- Datasource UID: `iam-loki`.
- Dashboard UIDs: `iam-overview`, `iam-request-drilldown`, `iam-error-center`.
- Alert rules cover service error spikes, APISIX 5xx spikes, OIDC provider server/protocol errors, and collection failures.

Development alerts use a null webhook default to avoid local notification noise. Production notification routing should replace the default contact point through environment-managed Grafana provisioning.

## Dashboard Workflow

Use the provisioned dashboards as a three-step troubleshooting flow:

- `IAM Overview`: start here to decide whether the current time window is healthy. The first row summarizes total log volume, error logs, HTTP 4xx/5xx, APISIX 5xx, request duration, and active services. The trend panels explain which service or status family changed.
- `IAM Error Center`: use this when Overview shows errors. It groups errors by service, event, and error type/code, then shows recent examples with request and trace identifiers for drilldown.
- `IAM Request Drilldown`: use this for a specific `requestId` or `traceId`. It shows correlation details, request-level summary signals, a structured timeline, a readable timeline, and raw JSON logs for evidence.

Dashboard colors use stable operational semantics: red for `error`/`fatal` or 5xx, yellow for `warn` or latency risk, green for healthy/2xx signals, and blue for traffic or totals. Dashboard legends and table columns should use readable names such as service, event, status, request ID, and duration rather than raw `{label="value"}` expressions.

Grafana data links and admin deep links may carry only technical correlation fields:

- `env`
- `service`
- `requestId`
- `traceId`
- time range

Do not put usernames, user IDs, mobile numbers, client secrets, tokens, audit details, business query strings, stack traces, full request URLs, request bodies, or response bodies into dashboard links.

Dashboard screenshots are not currently committed as visual baselines. If a release needs screenshot review, generate them from the dev observability stack after provisioning loads and keep the screenshot artifacts outside the repo unless a dedicated review process asks for them.

## Log Contract

System logs use JSON fields such as:

- `event`: stable lower-case dotted event name.
- `sourceApp`: `iam-api`, `iam-admin-api`, `iam-oidc-provider`, or `apisix`.
- `requestId`: primary correlation ID from `X-Request-Id`.
- `traceId`: optional trace header value when present.
- `method`, `path`, `route`, `statusCode`, `durationMs`.
- `clientIp`, `userAgent`.
- `errorName`, `errorCode`, `errorMessage`, `source`.

Do not put requestId, traceId, route, userId, username, clientIp, or userAgent into Loki labels. Alloy labels are limited to `env`, `service`, `component`, `level`, and `host`. Loki `service_name` auto-discovery is disabled to keep the label set explicit.

Event names must not contain request IDs, user identifiers, client codes, dynamic business values, or raw URLs.

## Sensitive Data Rules

System logs must not collect request bodies or response bodies.

Application loggers redact common sensitive fields before stdout:

- `authorization`, `cookie`, `set-cookie`
- `password`, `token`, `accessToken`, `idToken`, `refreshToken`
- `secret`, `clientSecret`, `privateKey`
- verification codes and OIDC authorization codes

Alloy applies a secondary redact pass for common sensitive key names. APISIX access logs do not include bodies, sensitive headers, or raw query strings.

Admin Grafana deep links only include requestId, traceId, service, env, and a time range around the audit event. They must not include username, userId, mobile, client secrets, tokens, audit details, business query strings, or stack traces.
